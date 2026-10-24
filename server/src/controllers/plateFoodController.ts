import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import { IMacros } from '../models/Meal'
import PlateFood, { IIngredient, IPlateFood, PLATE_FOOD_KINDS, PlateFoodKind } from '../models/PlateFood'
import BoxCook from '../models/BoxCook'
import MealPlanEntry from '../models/MealPlanEntry'
import { logCook, plateFields, repricePlanned } from '../lib/plateLines'
import { newBatchId, makeLastImportHandler, summarise } from '../lib/importBatch'
import { nameKey, extractList, extractOverwrite } from '../lib/importReconcile'
import { round } from '../lib/plates'

function toNumber(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
}

export function toMacros(raw: unknown): IMacros {
    const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return round({
        calories: toNumber(m.calories),
        protein: toNumber(m.protein),
        carbs: toNumber(m.carbs),
        fat: toNumber(m.fat),
    })
}

/** Ingredients from a request body; rows without a name are dropped. */
export function toIngredients(raw: unknown): IIngredient[] {
    if (!Array.isArray(raw)) return []
    return raw
        .map((i) => (i && typeof i === 'object' ? i : {}) as Record<string, unknown>)
        .filter((i) => typeof i.name === 'string' && i.name.trim())
        .map((i) => ({
            name: String(i.name).trim(),
            grams: toNumber(i.grams),
            items: toNumber(i.items) || undefined,
            per100: toMacros(i.per100),
        }))
}

function readFood(body: unknown) {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) return 'A food needs a name'
    const kind = b.kind as PlateFoodKind
    if (!PLATE_FOOD_KINDS.includes(kind)) return 'kind must be box or plain'
    return {
        kind,
        name,
        ingredients: kind === 'box' ? toIngredients(b.ingredients) : [],
        per100: kind === 'plain' ? toMacros(b.per100) : undefined,
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    }
}

/**
 * GET /api/plate-foods — boxes and plain foods, each box with its open
 * batches in use (grams eaten from each, worked out from eaten plates), its
 * batches in the freezer, and its latest cook, open or not.
 */
export async function listPlateFoods(req: AuthRequest, res: Response) {
    const foods = await PlateFood.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    const cooks = await BoxCook.find({ user: req.userId }).sort({ date: -1, createdAt: -1 })

    const openIds = cooks.filter((c) => !c.finished).map((c) => c._id)
    const eaten = openIds.length
        ? await MealPlanEntry.aggregate<{ _id: Types.ObjectId; grams: number }>([
              { $match: { user: new Types.ObjectId(req.userId), status: 'eaten', 'plate.batch': { $in: openIds } } },
              { $unwind: '$plate' },
              { $match: { 'plate.batch': { $in: openIds } } },
              { $group: { _id: '$plate.batch', grams: { $sum: '$plate.grams' } } },
          ])
        : []
    const eatenBy = new Map(eaten.map((e) => [String(e._id), e.grams]))

    const data = foods.map((f) => {
        const mine = cooks.filter((c) => String(c.food) === String(f._id))
        const open = mine.filter((c) => !c.finished)
        return {
            ...f.toObject(),
            open: open
                .filter((c) => !c.frozen)
                .map((c) => ({ ...c.toObject(), eatenGrams: eatenBy.get(String(c._id)) ?? 0 })),
            frozen: open.filter((c) => c.frozen).map((c) => c.toObject()),
            last: mine[0] ?? null,
        }
    })
    res.json({ message: 'OK', data })
}

/** POST /api/plate-foods */
export async function createPlateFood(req: AuthRequest, res: Response) {
    const fields = readFood(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const last = await PlateFood.findOne({ user: req.userId }).sort({ order: -1 })
    const food = await PlateFood.create({ user: req.userId, ...fields, order: (last?.order ?? -1) + 1 })
    res.status(201).json({ message: 'Created', data: food })
}

/**
 * PUT /api/plate-foods/:id — a plain food's new macros flow into plates still
 * planned. A box's ingredients are only the starting point for its next cook,
 * so editing them changes nothing already cooked.
 */
export async function updatePlateFood(req: AuthRequest, res: Response) {
    const fields = readFood(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const existing = await PlateFood.findOne({ _id: req.params.id, user: req.userId })
    if (!existing) {
        res.status(404).json({ message: 'Food not found' })
        return
    }
    // A food can't change between box and plain — its plates and cooks depend on it.
    Object.assign(existing, { ...fields, kind: existing.kind })
    const food = await existing.save()
    if (food.kind === 'plain') {
        await repricePlanned(req.userId!, food._id, { name: food.name, per100: food.per100! })
    } else {
        await renamePlannedBox(req.userId!, food)
    }
    res.json({ message: 'OK', data: food })
}

/** A box's planned plate lines take its current name; their figures stay. */
async function renamePlannedBox(userId: string, food: IPlateFood) {
    const lines = await MealPlanEntry.find({ user: userId, status: 'planned', 'plate.food': food._id })
    for (const e of lines) {
        const plate = (e.plate ?? []).map((l) =>
            String(l.food) === String(food._id)
                ? { food: l.food, name: food.name, grams: l.grams, batch: l.batch, per100: l.per100 }
                : l
        )
        Object.assign(e, plateFields(plate))
        await e.save()
    }
}

/**
 * Remove a food: its cooks, and its lines on plates still planned (a plate
 * left empty goes too). Eaten plates keep their copy.
 */
async function removeFood(userId: string, food: IPlateFood) {
    await food.deleteOne()
    await BoxCook.deleteMany({ user: userId, food: food._id })
    await MealPlanEntry.deleteMany({ user: userId, box: food._id })
    const planned = await MealPlanEntry.find({ user: userId, status: 'planned', 'plate.food': food._id })
    for (const e of planned) {
        const plate = (e.plate ?? []).filter((l) => String(l.food) !== String(food._id))
        if (plate.length === 0) {
            await e.deleteOne()
            continue
        }
        Object.assign(e, plateFields(plate))
        await e.save()
    }
}

/** DELETE /api/plate-foods/:id */
export async function deletePlateFood(req: AuthRequest, res: Response) {
    const food = await PlateFood.findOne({ _id: req.params.id, user: req.userId })
    if (!food) {
        res.status(404).json({ message: 'Food not found' })
        return
    }
    await removeFood(req.userId!, food)
    res.json({ message: 'Deleted' })
}

// ─── Import ─────────────────────────────────────────────────────────────────────

const isAmount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Today in the UK, as "YYYY-MM-DD" — the fallback date for an imported cook. */
function londonToday(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

/** Every problem with one macros object, as messages prefixed with `where`. */
function macroErrors(raw: unknown, where: string): string[] {
    if (raw === undefined) return []
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [`${where} must be an object`]
    const m = raw as Record<string, unknown>
    return ['calories', 'protein', 'carbs', 'fat']
        .filter((k) => m[k] !== undefined && !isAmount(m[k]))
        .map((k) => `${where}.${k} must be a number of 0 or more`)
}

interface TrayFields {
    name: string
    notes?: string
    ingredients: IIngredient[]
    cook: { date: string; cookedGrams: number } | null
}

/** One tray from the paste, checked — or the list of what's wrong with it. */
function readTray(raw: unknown, index: number): TrayFields | string[] {
    const label = `Tray ${index + 1}`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [`${label}: must be an object`]
    const t = raw as Record<string, unknown>
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (!name) return [`${label}: "name" is required`]
    const named = `"${name}"`

    const errors: string[] = []
    if (!Array.isArray(t.ingredients) || t.ingredients.length === 0) {
        errors.push(`${named}: needs an "ingredients" list`)
    } else {
        t.ingredients.forEach((rawIng, j) => {
            const where = `${named} ingredient ${j + 1}`
            if (!rawIng || typeof rawIng !== 'object' || Array.isArray(rawIng)) {
                errors.push(`${where}: must be an object`)
                return
            }
            const ing = rawIng as Record<string, unknown>
            if (typeof ing.name !== 'string' || !ing.name.trim()) errors.push(`${where}: "name" is required`)
            if (ing.grams !== undefined && !isAmount(ing.grams))
                errors.push(`${where}: grams must be a number of 0 or more`)
            if (ing.items !== undefined && !(isAmount(ing.items) && Number(ing.items) > 0))
                errors.push(`${where}: items must be a number above 0`)
            // Macros on a tray are always per 100 g raw — say so rather than guess.
            if (ing.per100 === undefined && ing.macros !== undefined)
                errors.push(`${where}: use "per100" (the packet's macros per 100 g), not "macros"`)
            errors.push(...macroErrors(ing.per100, `${where} per100`))
        })
    }
    if (t.cookedGrams !== undefined && !(isAmount(t.cookedGrams) && (t.cookedGrams as number) > 0))
        errors.push(`${named}: cookedGrams must be a number above 0`)
    if (t.cookedOn !== undefined && !isDate(t.cookedOn))
        errors.push(`${named}: cookedOn must be a date like "2026-10-19"`)
    if (errors.length) return errors

    return {
        name,
        notes: typeof t.notes === 'string' ? t.notes.trim() || undefined : undefined,
        ingredients: toIngredients(t.ingredients),
        cook:
            t.cookedGrams !== undefined
                ? { date: isDate(t.cookedOn) ? t.cookedOn : londonToday(), cookedGrams: t.cookedGrams as number }
                : null,
    }
}

/**
 * POST /api/plate-foods/import — one or many trays (boxes): a bare array,
 * `{ trays: [...] }`, or what the import panel sends: `{ items, overwrite }`.
 * Each tray is its raw ingredients with their packet macros per 100 g; give a
 * `cookedGrams` too and that cook is logged, so the tray can go straight onto
 * a plate. All-or-nothing: if any tray is malformed nothing is imported and
 * every problem is listed. Name clashes the user chose to overwrite have their
 * ingredients replaced in place; the rest are added as one undoable batch.
 */
export async function importTrays(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const list =
        extractList(body, 'trays') ??
        (body && typeof body === 'object' && Array.isArray((body as { boxes?: unknown }).boxes)
            ? (body as { boxes: unknown[] }).boxes
            : null)
    if (!list) {
        res.status(400).json({ message: 'Expected a JSON array of trays, or an object with a "trays" array.' })
        return
    }
    if (list.length === 0) {
        res.status(400).json({ message: 'No trays found to import.' })
        return
    }

    const errors: string[] = []
    const trays: TrayFields[] = []
    list.forEach((raw, i) => {
        const tray = readTray(raw, i)
        if (Array.isArray(tray)) errors.push(...tray)
        else trays.push(tray)
    })
    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const overwrite = extractOverwrite(body)
    const last = await PlateFood.findOne({ user: req.userId }).sort({ order: -1 })
    let order = (last?.order ?? -1) + 1
    const importBatch = newBatchId()
    const created: IPlateFood[] = []
    let updated = 0
    let cooked = 0
    for (const tray of trays) {
        const targetId = overwrite.get(nameKey(tray.name))
        let food = targetId ? await PlateFood.findOne({ _id: targetId, user: req.userId, kind: 'box' }) : null
        if (food) {
            Object.assign(food, { name: tray.name, notes: tray.notes, ingredients: tray.ingredients })
            await food.save()
            await renamePlannedBox(req.userId!, food)
            updated++
        } else {
            food = await PlateFood.create({
                user: req.userId,
                kind: 'box',
                name: tray.name,
                notes: tray.notes,
                ingredients: tray.ingredients,
                order: order++,
                importBatch,
            })
            created.push(food)
        }
        if (tray.cook) {
            await logCook(req.userId!, food, { ...tray.cook, ingredients: tray.ingredients })
            cooked++
        }
    }
    res.status(201).json({
        message: `Imported ${created.length} tray(s), updated ${updated}, cooked ${cooked}`,
        data: created,
        updated,
        cooked,
    })
}

/** GET /api/plate-foods/import/last — the most recent import batch, or null. */
export const lastImport = makeLastImportHandler(PlateFood)

/**
 * DELETE /api/plate-foods/import/last — removes the trays the last import
 * added, like deleting them one by one (their cooks and planned plates go).
 */
export async function undoImport(req: AuthRequest, res: Response) {
    const summary = await summarise(PlateFood, req.userId)
    if (!summary) {
        res.status(404).json({ message: 'No import to undo.' })
        return
    }
    const foods = await PlateFood.find({ user: req.userId, importBatch: summary.batch })
    for (const food of foods) await removeFood(req.userId!, food)
    res.json({ message: `Reverted ${summary.count} tray(s).`, data: summary })
}
