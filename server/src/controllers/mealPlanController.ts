import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import MealPlanEntry, { ENTRY_STATUSES, EntryStatus } from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, MealType } from '../models/Meal'

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isSlot = (v: unknown): v is MealType => MEAL_TYPES.includes(v as MealType)
const isStatus = (v: unknown): v is EntryStatus => ENTRY_STATUSES.includes(v as EntryStatus)

/** GET /api/meal-plan?start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function listEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }
    const entries = await MealPlanEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    }).sort({ date: 1, order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: entries })
}

/**
 * POST /api/meal-plan { date, slot, meal, extra? } — puts a library meal on a
 * day. A planned meal waits to be ticked; an extra ("Log more") is eaten.
 */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, slot, meal: mealId, extra } = req.body ?? {}
    if (!isDate(date) || !isSlot(slot)) {
        res.status(400).json({ message: 'date and slot are required' })
        return
    }
    const meal = await Meal.findOne({ _id: mealId, user: req.userId })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    const last = await MealPlanEntry.findOne({ user: req.userId, date, slot }).sort({ order: -1 })
    const entry = await MealPlanEntry.create({
        user: req.userId,
        date,
        slot,
        meal: meal._id,
        name: meal.name,
        macros: meal.macros,
        status: extra === true ? 'eaten' : 'planned',
        extra: extra === true,
        order: (last?.order ?? -1) + 1,
    })
    res.status(201).json({ message: 'Created', data: entry })
}

/** PATCH /api/meal-plan/:id { status } — the tick. */
export async function updateEntry(req: AuthRequest, res: Response) {
    const { status } = req.body ?? {}
    if (!isStatus(status)) {
        res.status(400).json({ message: 'status must be planned or eaten' })
        return
    }
    const entry = await MealPlanEntry.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { status },
        { new: true }
    )
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'OK', data: entry })
}

/** DELETE /api/meal-plan/:id */
export async function deleteEntry(req: AuthRequest, res: Response) {
    const result = await MealPlanEntry.deleteOne({ _id: req.params.id, user: req.userId })
    if (!result.deletedCount) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
