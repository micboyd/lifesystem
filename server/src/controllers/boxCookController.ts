import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import PlateFood from '../models/PlateFood'
import BoxCook from '../models/BoxCook'
import MealPlanEntry from '../models/MealPlanEntry'
import { followCurrent, logCook } from '../lib/plateLines'
import { toIngredients } from './plateFoodController'

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** How many finished batches the pantry shows below the open ones. */
const FINISHED_SHOWN = 20

/** Grams of each batch on plates with a given status, keyed by batch id. */
async function gramsBy(userId: string, ids: Types.ObjectId[], status: 'eaten' | 'planned') {
    if (ids.length === 0) return new Map<string, number>()
    const rows = await MealPlanEntry.aggregate<{ _id: Types.ObjectId; grams: number }>([
        { $match: { user: new Types.ObjectId(userId), status, 'plate.batch': { $in: ids } } },
        { $unwind: '$plate' },
        { $match: { 'plate.batch': { $in: ids } } },
        { $group: { _id: '$plate.batch', grams: { $sum: '$plate.grams' } } },
    ])
    return new Map(rows.map((r) => [String(r._id), r.grams]))
}

/**
 * GET /api/box-cooks — the pantry: every open batch, newest first, then the
 * most recent finished ones. Each carries the grams eaten from it and the
 * grams still planned on plates.
 */
export async function listCooks(req: AuthRequest, res: Response) {
    const [open, finished] = await Promise.all([
        BoxCook.find({ user: req.userId, finished: false }).sort({ date: -1, createdAt: -1 }),
        BoxCook.find({ user: req.userId, finished: true })
            .sort({ date: -1, createdAt: -1 })
            .limit(FINISHED_SHOWN),
    ])
    const ids = [...open, ...finished].map((c) => c._id as Types.ObjectId)
    const [eaten, planned] = await Promise.all([
        gramsBy(req.userId!, ids, 'eaten'),
        gramsBy(req.userId!, ids, 'planned'),
    ])
    const withGrams = (c: (typeof open)[number]) => ({
        ...c.toObject(),
        eatenGrams: eaten.get(String(c._id)) ?? 0,
        plannedGrams: planned.get(String(c._id)) ?? 0,
    })
    res.json({ message: 'OK', data: { open: open.map(withGrams), finished: finished.map(withGrams) } })
}

/**
 * POST /api/box-cooks { food, date, ingredients, cookedGrams, finishOpen } —
 * "Cooked a box". The raw ingredients as they went in that day, and what the
 * cooked food weighed, give its macros per 100 g. `finishOpen` marks the box's
 * earlier batches as finished. Plates still planned move onto the new batch.
 */
export async function createCook(req: AuthRequest, res: Response) {
    const { food: foodId, date, ingredients, cookedGrams, finishOpen } = req.body ?? {}
    const food = await PlateFood.findOne({ _id: foodId, user: req.userId, kind: 'box' })
    if (!food) {
        res.status(404).json({ message: 'Box not found' })
        return
    }
    const grams = Number(cookedGrams)
    if (!isDate(date) || !Number.isFinite(grams) || grams <= 0) {
        res.status(400).json({ message: 'date and a cooked weight in grams are required' })
        return
    }
    const list = toIngredients(ingredients)
    if (list.length === 0) {
        res.status(400).json({ message: 'A cook needs at least one ingredient' })
        return
    }
    const cook = await logCook(req.userId!, food, {
        date,
        ingredients: list,
        cookedGrams: grams,
        finishOpen: finishOpen === true,
    })
    res.status(201).json({ message: 'Created', data: cook })
}

/** PATCH /api/box-cooks/:id { finished } — the box ran out (or didn't after all). */
export async function updateCook(req: AuthRequest, res: Response) {
    const { finished } = req.body ?? {}
    if (typeof finished !== 'boolean') {
        res.status(400).json({ message: 'finished must be true or false' })
        return
    }
    const cook = await BoxCook.findOneAndUpdate({ _id: req.params.id, user: req.userId }, { finished }, { new: true })
    if (!cook) {
        res.status(404).json({ message: 'Cook not found' })
        return
    }
    await followCurrent(req.userId!, String(cook.food))
    res.json({ message: 'OK', data: cook })
}

/**
 * DELETE /api/box-cooks/:id — a cook logged by mistake. Plates already eaten
 * keep its figures; planned ones move to whichever batch counts now.
 */
export async function deleteCook(req: AuthRequest, res: Response) {
    const cook = await BoxCook.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!cook) {
        res.status(404).json({ message: 'Cook not found' })
        return
    }
    await followCurrent(req.userId!, String(cook.food))
    res.json({ message: 'Deleted' })
}
