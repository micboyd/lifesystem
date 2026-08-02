import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import MealPlanEntry from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, MealType } from '../models/Meal'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

function isSlot(v: unknown): v is MealType {
    return typeof v === 'string' && MEAL_TYPES.includes(v as MealType)
}

/**
 * GET /api/meal-plan?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List a user's planned meals in a date range, with each meal populated so the
 * client can tally macros. Entries whose meal has since been deleted are dropped.
 */
export async function listEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }

    const entries = await MealPlanEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
        .sort({ date: 1, order: 1, createdAt: 1 })
        .populate('meal')

    // A meal deleted from the library leaves a dangling entry — skip those.
    res.json({ message: 'OK', data: entries.filter((e) => e.meal) })
}

/** POST /api/meal-plan — place a meal into a day+slot, appended to that slot. */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, slot, meal: mealId } = req.body
    if (!isDate(date) || !isSlot(slot) || typeof mealId !== 'string') {
        res.status(400).json({ message: 'date, slot and meal are required' })
        return
    }

    // The meal must exist and belong to the requesting user.
    const meal = await Meal.findOne({ _id: mealId, user: req.userId })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }

    const last = await MealPlanEntry.findOne({ user: req.userId, date, slot }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await MealPlanEntry.create({ user: req.userId, date, slot, meal: meal._id, order })
    await entry.populate('meal')
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * POST /api/meal-plan/copy
 * Copy planned meals from one set of days onto another. `from` and `to` are
 * parallel arrays of dates: every entry on `from[i]` is recreated on `to[i]`.
 * This powers "copy a day to the next day" (one date each) and "paste a week"
 * (the seven source days mapped onto seven target days).
 *
 * Target days are overwritten — their existing entries are removed first — so
 * pasting is idempotent and never piles up duplicates.
 */
export async function copyEntries(req: AuthRequest, res: Response) {
    const { from, to } = req.body
    if (
        !Array.isArray(from) ||
        !Array.isArray(to) ||
        from.length === 0 ||
        from.length !== to.length ||
        !from.every(isDate) ||
        !to.every(isDate)
    ) {
        res.status(400).json({ message: 'from and to must be equal-length arrays of dates' })
        return
    }

    // Map each source day to its target day. A day mapped onto itself is a no-op.
    const dateMap = new Map<string, string>()
    from.forEach((d: string, i: number) => dateMap.set(d, to[i]))

    const sources = await MealPlanEntry.find({ user: req.userId, date: { $in: from } }).sort({
        order: 1,
        createdAt: 1,
    })

    // Clear the target days, then recreate the source entries on them.
    const targetDates = [...new Set(to as string[])]
    await MealPlanEntry.deleteMany({ user: req.userId, date: { $in: targetDates } })

    const docs = sources
        .filter((e) => dateMap.get(e.date) !== e.date)
        .map((e) => ({
            user: req.userId,
            date: dateMap.get(e.date),
            slot: e.slot,
            meal: e.meal,
            order: e.order,
        }))

    const created = docs.length ? await MealPlanEntry.insertMany(docs) : []
    await MealPlanEntry.populate(created, { path: 'meal' })

    // Drop any entry whose meal has since been deleted, mirroring listEntries.
    res.status(201).json({ message: 'Copied', data: created.filter((e) => e.meal) })
}

/**
 * POST /api/meal-plan/clear — delete every planned meal whose date falls in
 * [start, end] (inclusive). Clears a single day (start === end) or a whole week.
 * Body: { start: YYYY-MM-DD, end: YYYY-MM-DD }.
 */
export async function clearRange(req: AuthRequest, res: Response) {
    const { start, end } = req.body
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }
    if (end < start) {
        res.status(400).json({ message: 'end must not be before start' })
        return
    }
    // Dates are zero-padded ISO strings, so a lexicographic range is a date range.
    const { deletedCount } = await MealPlanEntry.deleteMany({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
    res.json({ message: 'OK', data: { cleared: deletedCount ?? 0 } })
}

/** DELETE /api/meal-plan/:id — remove a planned meal. */
export async function deleteEntry(req: AuthRequest, res: Response) {
    const entry = await MealPlanEntry.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted', data: entry })
}
