import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import MealPlanEntry, { ENTRY_STATUSES, EntryStatus, IAdhocMeal } from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, MealType, IMacros } from '../models/Meal'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

function isSlot(v: unknown): v is MealType {
    return typeof v === 'string' && MEAL_TYPES.includes(v as MealType)
}

function isStatus(v: unknown): v is EntryStatus {
    return typeof v === 'string' && ENTRY_STATUSES.includes(v as EntryStatus)
}

/** Coerce a macro figure to a non-negative number, defaulting to 0. */
function toMacro(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Validate an off-plan meal body: a name plus whatever macros are known. Macros
 * are all optional and default to zero — a rough calorie figure logged now beats
 * a precise one logged never.
 */
function parseAdhoc(raw: unknown): IAdhocMeal | null {
    if (!raw || typeof raw !== 'object') return null
    const { name, macros } = raw as { name?: unknown; macros?: unknown }
    if (typeof name !== 'string' || !name.trim()) return null
    const m = (macros ?? {}) as Record<string, unknown>
    const parsed: IMacros = {
        calories: toMacro(m.calories),
        protein: toMacro(m.protein),
        carbs: toMacro(m.carbs),
        fat: toMacro(m.fat),
    }
    return { name: name.trim(), macros: parsed }
}

/**
 * GET /api/meal-plan?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List a user's planned meals in a date range, with each library meal populated
 * so the client can tally macros. Entries whose library meal has since been
 * deleted are dropped; ad-hoc entries carry their own macros and always survive.
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
    res.json({ message: 'OK', data: entries.filter((e) => e.meal || e.adhoc) })
}

/**
 * POST /api/meal-plan — put food into a day+slot, appended to that slot.
 *
 * Body carries either `meal` (a library meal id) or `adhoc` ({ name, macros })
 * for something eaten off-plan. An optional `status` lets the off-plan path log
 * straight to 'eaten' in one call, since that food is by definition already gone.
 */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, slot, meal: mealId, adhoc: adhocRaw, status } = req.body
    if (!isDate(date) || !isSlot(slot)) {
        res.status(400).json({ message: 'date and slot are required' })
        return
    }

    const adhoc = parseAdhoc(adhocRaw)
    if (!adhoc && typeof mealId !== 'string') {
        res.status(400).json({ message: 'either meal or adhoc (with a name) is required' })
        return
    }

    // A library meal must exist and belong to the requesting user.
    let meal = null
    if (!adhoc) {
        meal = await Meal.findOne({ _id: mealId, user: req.userId })
        if (!meal) {
            res.status(404).json({ message: 'Meal not found' })
            return
        }
    }

    const last = await MealPlanEntry.findOne({ user: req.userId, date, slot }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await MealPlanEntry.create({
        user: req.userId,
        date,
        slot,
        ...(adhoc ? { adhoc } : { meal: meal!._id }),
        ...(isStatus(status) ? { status } : {}),
        order,
    })
    if (entry.meal) await entry.populate('meal')
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * PATCH /api/meal-plan/:id — mark an entry eaten, skipped, or back to planned.
 * The only mutable field: everything else about a placed meal is edited by
 * removing it and adding another.
 */
export async function updateEntryStatus(req: AuthRequest, res: Response) {
    const { status } = req.body
    if (!isStatus(status)) {
        res.status(400).json({ message: `status must be one of: ${ENTRY_STATUSES.join(', ')}` })
        return
    }

    const entry = await MealPlanEntry.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { status } },
        { new: true }
    ).populate('meal')

    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Saved', data: entry })
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

    // Copies land as 'planned' regardless of the source's status — repeating last
    // week's plan is an intention for the days ahead, not a claim you ate them.
    const docs = sources
        .filter((e) => dateMap.get(e.date) !== e.date)
        .map((e) => ({
            user: req.userId,
            date: dateMap.get(e.date),
            slot: e.slot,
            ...(e.adhoc ? { adhoc: e.adhoc } : { meal: e.meal }),
            status: 'planned',
            order: e.order,
        }))

    const created = docs.length ? await MealPlanEntry.insertMany(docs) : []
    await MealPlanEntry.populate(created, { path: 'meal' })

    // Drop any entry whose meal has since been deleted, mirroring listEntries.
    res.status(201).json({ message: 'Copied', data: created.filter((e) => e.meal || e.adhoc) })
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
