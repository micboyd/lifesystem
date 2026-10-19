import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import { IMacros } from '../models/Meal'
import PlateFood, { IIngredient, PLATE_FOOD_KINDS, PlateFoodKind } from '../models/PlateFood'
import BoxCook from '../models/BoxCook'
import MealPlanEntry from '../models/MealPlanEntry'
import { plateFields, repricePlanned } from '../lib/plateLines'
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
        .map((i) => ({ name: String(i.name).trim(), grams: toNumber(i.grams), per100: toMacros(i.per100) }))
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
 * batches (grams eaten from each, worked out from eaten plates) and its
 * latest cook, open or not.
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
        return {
            ...f.toObject(),
            open: mine
                .filter((c) => !c.finished)
                .map((c) => ({ ...c.toObject(), eatenGrams: eatenBy.get(String(c._id)) ?? 0 })),
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
        const lines = await MealPlanEntry.find({ user: req.userId, status: 'planned', 'plate.food': food._id })
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
    res.json({ message: 'OK', data: food })
}

/**
 * DELETE /api/plate-foods/:id — the food, its cooks, and its lines on plates
 * still planned (a plate left empty goes too). Eaten plates keep their copy.
 */
export async function deletePlateFood(req: AuthRequest, res: Response) {
    const food = await PlateFood.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!food) {
        res.status(404).json({ message: 'Food not found' })
        return
    }
    await BoxCook.deleteMany({ user: req.userId, food: food._id })
    const planned = await MealPlanEntry.find({ user: req.userId, status: 'planned', 'plate.food': food._id })
    for (const e of planned) {
        const plate = (e.plate ?? []).filter((l) => String(l.food) !== String(food._id))
        if (plate.length === 0) {
            await e.deleteOne()
            continue
        }
        Object.assign(e, plateFields(plate))
        await e.save()
    }
    res.json({ message: 'Deleted' })
}
