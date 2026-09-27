import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import Meal, { MEAL_TYPES, MealType, IMacros } from '../models/Meal'
import MealPlanEntry from '../models/MealPlanEntry'
import { newBatchId, makeLastImportHandler, summarise } from '../lib/importBatch'
import { nameKey, extractList, extractOverwrite } from '../lib/importReconcile'

function toNumber(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
}

function toMacros(raw: unknown): IMacros {
    const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
        calories: toNumber(m.calories),
        protein: toNumber(m.protein),
        carbs: toNumber(m.carbs),
        fat: toNumber(m.fat),
    }
}

function toTypes(raw: unknown): MealType[] {
    if (!Array.isArray(raw)) return []
    return [...new Set(raw.filter((t): t is MealType => MEAL_TYPES.includes(t as MealType)))]
}

/** A meal from a request body, or an error message. */
function readMeal(
    body: unknown
): { name: string; types: MealType[]; macros: IMacros; notes?: string } | string {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) return 'A meal needs a name'
    return {
        name,
        types: toTypes(b.types),
        macros: toMacros(b.macros),
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    }
}

/** GET /api/meals — the whole library, in order. */
export async function listMeals(req: AuthRequest, res: Response) {
    const meals = await Meal.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: meals })
}

/** POST /api/meals */
export async function createMeal(req: AuthRequest, res: Response) {
    const fields = readMeal(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const last = await Meal.findOne({ user: req.userId }).sort({ order: -1 })
    const meal = await Meal.create({ user: req.userId, ...fields, order: (last?.order ?? -1) + 1 })
    res.status(201).json({ message: 'Created', data: meal })
}

/**
 * PUT /api/meals/:id — edits flow into days where the meal is still only
 * planned; days it was eaten keep the figures they were logged with.
 */
export async function updateMeal(req: AuthRequest, res: Response) {
    const fields = readMeal(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const meal = await Meal.findOneAndUpdate({ _id: req.params.id, user: req.userId }, fields, {
        new: true,
    })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    await MealPlanEntry.updateMany(
        { user: req.userId, meal: meal._id, status: 'planned' },
        { name: meal.name, macros: meal.macros }
    )
    res.json({ message: 'OK', data: meal })
}

/** Whether a raw value reads as a number of 0 or more. */
function isAmount(raw: unknown): boolean {
    const n =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : NaN
    return Number.isFinite(n) && n >= 0
}

/**
 * POST /api/meals/import — a bare array of meals, `{ meals: [...] }`, or what
 * the import panel sends: `{ items, overwrite }`. All-or-nothing: if any meal
 * is malformed nothing is imported and every problem is listed. Name clashes
 * the user chose to overwrite are updated in place (planned copies follow);
 * the rest are appended to the library as one undoable batch.
 */
export async function importMeals(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const list = extractList(body, 'meals')
    const overwrite = extractOverwrite(body)
    if (!list) {
        res.status(400).json({
            message: 'Expected a JSON array of meals, or an object with a "meals" array.',
        })
        return
    }
    if (list.length === 0) {
        res.status(400).json({ message: 'No meals found to import.' })
        return
    }

    const errors: string[] = []
    const meals = list.map((raw, i) => {
        const label = `Meal ${i + 1}`
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            errors.push(`${label}: must be an object`)
            return null
        }
        const item = raw as Record<string, unknown>
        const named =
            typeof item.name === 'string' && item.name.trim() ? `"${item.name.trim()}"` : label
        if (item.types !== undefined) {
            const bad = Array.isArray(item.types)
                ? item.types.filter((t) => !MEAL_TYPES.includes(t as MealType))
                : [item.types]
            if (bad.length)
                errors.push(
                    `${named}: types must be from ${MEAL_TYPES.join(', ')} (got ${bad.map((b) => JSON.stringify(b)).join(', ')})`
                )
        }
        if (item.macros !== undefined) {
            if (!item.macros || typeof item.macros !== 'object')
                errors.push(`${named}: macros must be an object`)
            else
                for (const k of ['calories', 'protein', 'carbs', 'fat']) {
                    const v = (item.macros as Record<string, unknown>)[k]
                    if (v !== undefined && !isAmount(v))
                        errors.push(`${named}: macros.${k} must be a number of 0 or more`)
                }
        }
        const fields = readMeal(raw)
        if (typeof fields === 'string') {
            errors.push(`${label}: "name" is required`)
            return null
        }
        return fields
    })
    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const last = await Meal.findOne({ user: req.userId }).sort({ order: -1 })
    let order = (last?.order ?? -1) + 1
    const importBatch = newBatchId()
    const toInsert = []
    let updated = 0
    for (const fields of meals) {
        const targetId = overwrite.get(nameKey(fields!.name))
        if (targetId) {
            const meal = await Meal.findOneAndUpdate({ _id: targetId, user: req.userId }, fields!, {
                new: true,
            })
            if (meal) {
                await MealPlanEntry.updateMany(
                    { user: req.userId, meal: meal._id, status: 'planned' },
                    { name: meal.name, macros: meal.macros }
                )
                updated++
                continue
            }
        }
        toInsert.push({
            user: new Types.ObjectId(req.userId),
            ...fields!,
            order: order++,
            importBatch,
        })
    }
    const created = await Meal.insertMany(toInsert)
    res.status(201).json({
        message: `Imported ${created.length} meal(s), updated ${updated}`,
        data: created,
        updated,
    })
}

/** GET /api/meals/import/last — the most recent import batch, or null. */
export const lastImport = makeLastImportHandler(Meal)

/**
 * DELETE /api/meals/import/last — removes the meals the last import added.
 * Like deleting them one by one: planned copies go, eaten days keep theirs.
 */
export async function undoImport(req: AuthRequest, res: Response) {
    const summary = await summarise(Meal, req.userId)
    if (!summary) {
        res.status(404).json({ message: 'No import to undo.' })
        return
    }
    const ids = (
        await Meal.find({ user: req.userId, importBatch: summary.batch }).select('_id')
    ).map((m) => m._id)
    await MealPlanEntry.deleteMany({ user: req.userId, meal: { $in: ids }, status: 'planned' })
    await Meal.deleteMany({ user: req.userId, importBatch: summary.batch })
    res.json({ message: `Reverted ${summary.count} meal(s).`, data: summary })
}

/** DELETE /api/meals/:id — past days keep their copy; planned-only days lose it. */
export async function deleteMeal(req: AuthRequest, res: Response) {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    await MealPlanEntry.deleteMany({ user: req.userId, meal: meal._id, status: 'planned' })
    res.json({ message: 'Deleted' })
}

/** DELETE /api/meals — the whole library. Eaten days keep their copies, as with one meal. */
export async function deleteAllMeals(req: AuthRequest, res: Response) {
    const { deletedCount } = await Meal.deleteMany({ user: req.userId })
    await MealPlanEntry.deleteMany({ user: req.userId, status: 'planned', meal: { $ne: null } })
    res.json({ message: 'Deleted', data: { deleted: deletedCount } })
}
