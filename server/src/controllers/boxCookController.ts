import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import PlateFood from '../models/PlateFood'
import BoxCook from '../models/BoxCook'
import { currentCook, repricePlanned } from '../lib/plateLines'
import { per100FromCook, rawTotal, ZERO } from '../lib/plates'
import { toIngredients } from './plateFoodController'

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Move a box's still-planned plates onto whichever batch now counts. */
async function followCurrent(userId: string, foodId: string) {
    const food = await PlateFood.findOne({ _id: foodId, user: userId })
    if (!food) return
    const cook = await currentCook(userId, food._id)
    await repricePlanned(userId, food._id, {
        name: food.name,
        per100: cook?.per100 ?? { ...ZERO },
        batch: cook?._id ?? null,
    })
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
    if (finishOpen === true) {
        await BoxCook.updateMany({ user: req.userId, food: food._id, finished: false }, { finished: true })
    }
    const raw = rawTotal(list)
    const cook = await BoxCook.create({
        user: req.userId,
        food: food._id,
        name: food.name,
        date,
        ingredients: list,
        raw,
        cookedGrams: grams,
        per100: per100FromCook(raw, grams),
    })
    await followCurrent(req.userId!, String(food._id))
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
