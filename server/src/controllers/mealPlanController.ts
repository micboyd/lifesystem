import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import MealPlanEntry, { ENTRY_STATUSES, EntryStatus } from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, MealType } from '../models/Meal'
import { plateFields, resolvePlate } from '../lib/plateLines'

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
 * POST /api/meal-plan { date, slot, meal | plate, extra? } — puts a library
 * meal, or a plate of weighed foods (`[{ food, grams, batch? }]`), on a day.
 * A planned meal waits to be ticked; an extra ("Log more") is eaten.
 */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, slot, meal: mealId, plate, extra } = req.body ?? {}
    if (!isDate(date) || !isSlot(slot)) {
        res.status(400).json({ message: 'date and slot are required' })
        return
    }
    const status = extra === true ? 'eaten' : 'planned'
    if (plate !== undefined) {
        const lines = await resolvePlate(req.userId!, plate)
        if (typeof lines === 'string') {
            res.status(400).json({ message: lines })
            return
        }
        const last = await MealPlanEntry.findOne({ user: req.userId, date, slot }).sort({ order: -1 })
        const entry = await MealPlanEntry.create({
            user: req.userId,
            date,
            slot,
            ...plateFields(lines),
            status,
            extra: extra === true,
            order: (last?.order ?? -1) + 1,
        })
        res.status(201).json({ message: 'Created', data: entry })
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

/**
 * PATCH /api/meal-plan/:id { status?, plate? } — the tick, and a plate's
 * grams (or batch) changed at the table. Each line keeps the batch figures it
 * was given, so an eaten plate never moves when a box is cooked again.
 */
export async function updateEntry(req: AuthRequest, res: Response) {
    const { status, plate } = req.body ?? {}
    if (status !== undefined && !isStatus(status)) {
        res.status(400).json({ message: 'status must be planned or eaten' })
        return
    }
    if (status === undefined && plate === undefined) {
        res.status(400).json({ message: 'Nothing to update' })
        return
    }
    const entry = await MealPlanEntry.findOne({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    if (plate !== undefined) {
        if (!entry.plate?.length) {
            res.status(400).json({ message: 'Only a plate has grams to change' })
            return
        }
        const lines = await resolvePlate(req.userId!, plate)
        if (typeof lines === 'string') {
            res.status(400).json({ message: lines })
            return
        }
        Object.assign(entry, plateFields(lines))
    }
    if (status !== undefined) entry.status = status
    await entry.save()
    res.json({ message: 'OK', data: entry })
}

/**
 * POST /api/meal-plan/reorder { date, slot, ids } — a slot's planned meals in
 * their new top-to-bottom order. A meal dragged in from another slot or day
 * moves there. Only the caller's own planned (non-extra) entries are touched.
 */
export async function reorderSlot(req: AuthRequest, res: Response) {
    const { date, slot, ids } = req.body ?? {}
    if (!isDate(date) || !isSlot(slot)) {
        res.status(400).json({ message: 'date and slot are required' })
        return
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && Types.ObjectId.isValid(id))) {
        res.status(400).json({ message: 'ids must be an array of entry ids' })
        return
    }
    const owned = await MealPlanEntry.find({ user: req.userId, _id: { $in: ids }, extra: false }).select('_id')
    const ownedIds = new Set(owned.map((e) => String(e._id)))
    const ops = (ids as string[])
        .filter((id) => ownedIds.has(id))
        .map((id, order) => ({
            updateOne: { filter: { _id: id, user: req.userId }, update: { $set: { date, slot, order } } },
        }))
    if (ops.length > 0) await MealPlanEntry.bulkWrite(ops)
    res.json({ message: 'OK', data: { reordered: ops.length } })
}

/** The seven "YYYY-MM-DD" days of the week starting on `monday`. */
function weekDays(monday: string): string[] {
    const [y, m, d] = monday.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10))
}

/**
 * POST /api/meal-plan/copy-week { from, to, slots } — the planned meals in
 * `slots` on the week starting `from`, put onto the week starting `to`. The
 * target week's still-planned meals in those slots are replaced; anything
 * already eaten, and anything logged with "Log more", stays.
 */
export async function copyWeek(req: AuthRequest, res: Response) {
    const { from, to, slots } = req.body ?? {}
    if (!isDate(from) || !isDate(to)) {
        res.status(400).json({ message: 'from and to (YYYY-MM-DD) are required' })
        return
    }
    if (!Array.isArray(slots) || slots.length === 0 || !slots.every(isSlot)) {
        res.status(400).json({ message: 'slots must be a non-empty array of meal slots' })
        return
    }
    if (from === to) {
        res.json({ message: 'OK', data: [] })
        return
    }
    const fromDays = weekDays(from)
    const toDays = weekDays(to)
    await MealPlanEntry.deleteMany({
        user: req.userId,
        date: { $in: toDays },
        slot: { $in: slots },
        extra: false,
        status: 'planned',
    })
    const source = await MealPlanEntry.find({
        user: req.userId,
        date: { $in: fromDays },
        slot: { $in: slots },
        extra: false,
    }).sort({ date: 1, order: 1, createdAt: 1 })

    // What's left on the target week (eaten meals) keeps its place; copies go after it.
    const kept = await MealPlanEntry.find({ user: req.userId, date: { $in: toDays }, slot: { $in: slots } })
    const nextOrder = new Map<string, number>()
    for (const e of kept) {
        const k = `${e.date}|${e.slot}`
        nextOrder.set(k, Math.max(nextOrder.get(k) ?? 0, e.order + 1))
    }
    const dateMap = new Map(fromDays.map((d, i) => [d, toDays[i]]))
    const docs = source.map((e) => {
        const date = dateMap.get(e.date)!
        const k = `${date}|${e.slot}`
        const order = nextOrder.get(k) ?? 0
        nextOrder.set(k, order + 1)
        return {
            user: req.userId,
            date,
            slot: e.slot,
            meal: e.meal,
            ...(e.plate?.length ? { plate: e.plate } : {}),
            name: e.name,
            macros: e.macros,
            status: 'planned',
            extra: false,
            order,
        }
    })
    const created = docs.length > 0 ? await MealPlanEntry.insertMany(docs) : []
    res.json({ message: 'OK', data: created })
}

/**
 * POST /api/meal-plan/clear { start, end } — removes the planned meals not yet
 * eaten from those days. Eaten meals and anything logged stay.
 */
export async function clearRange(req: AuthRequest, res: Response) {
    const { start, end } = req.body ?? {}
    if (!isDate(start) || !isDate(end) || end < start) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }
    const { deletedCount } = await MealPlanEntry.deleteMany({
        user: req.userId,
        date: { $gte: start, $lte: end },
        extra: false,
        status: 'planned',
    })
    res.json({ message: 'OK', data: { cleared: deletedCount ?? 0 } })
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
