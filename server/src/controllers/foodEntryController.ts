import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import FoodEntry, { ENTRY_STATUSES, ENTRY_UNITS, EntryStatus, EntryUnit, IFoodEntry } from '../models/FoodEntry'
import Batch from '../models/Batch'
import Recipe from '../models/Recipe'
import { MEAL_TYPES, type MealType } from '../models/nutritionSchemas'
import { httpError, isDate, isId, stamp, toMacros } from '../lib/foodInput'
import { round, scale, type Cookable } from '../lib/recipeMath'

const isSlot = (v: unknown): v is MealType => MEAL_TYPES.includes(v as MealType)
const isStatus = (v: unknown): v is EntryStatus => ENTRY_STATUSES.includes(v as EntryStatus)
const isUnit = (v: unknown): v is EntryUnit => ENTRY_UNITS.includes(v as EntryUnit)

function toAmount(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n <= 0) throw httpError(400, 'Amount must be above 0.')
    return n
}

/** The batch or recipe a line comes from, or null for a quick line. */
async function sourceOf(
    userId: string | undefined,
    e: { batch?: unknown; recipe?: unknown }
): Promise<{ name: string; cookable: Cookable } | null> {
    if (e.batch) {
        const b = await Batch.findOne({ _id: e.batch, user: userId })
        if (!b) throw httpError(404, 'Batch not found')
        return { name: b.name, cookable: b }
    }
    if (e.recipe) {
        const r = await Recipe.findOne({ _id: e.recipe, user: userId })
        if (!r) throw httpError(404, 'Recipe not found')
        return { name: r.name, cookable: r }
    }
    return null
}

/** GET /api/food-entries?start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function listFoodEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) throw httpError(400, 'start and end (YYYY-MM-DD) are required')
    const entries = await FoodEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    }).sort({ date: 1, order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: entries })
}

/**
 * POST /api/food-entries — add a line to a day's slot.
 *
 *   { date, slot, batch, amount, unit }     a portion or grams of a batch
 *   { date, slot, recipe, amount, unit }    an ordinary meal or food
 *   { date, slot, name, macros }            a quick line
 *
 * `status` defaults to 'planned'; the kitchen flow sends 'eaten'.
 */
export async function createFoodEntry(req: AuthRequest, res: Response) {
    const b = req.body ?? {}
    if (!isDate(b.date) || !isSlot(b.slot)) throw httpError(400, 'date and slot are required')
    const status: EntryStatus = b.status === undefined ? 'planned' : b.status
    if (!isStatus(status)) throw httpError(400, 'Bad status')
    if (b.batch !== undefined && !isId(b.batch)) throw httpError(400, 'Bad batch id')
    if (b.recipe !== undefined && !isId(b.recipe)) throw httpError(400, 'Bad recipe id')

    const last = await FoodEntry.findOne({ user: req.userId, date: b.date, slot: b.slot }).sort({
        order: -1,
    })
    const base = {
        user: req.userId,
        date: b.date,
        slot: b.slot,
        status,
        order: (last?.order ?? -1) + 1,
    }

    const source = await sourceOf(req.userId, b)
    if (source) {
        const unit: EntryUnit = b.unit ?? 'portion'
        if (!isUnit(unit)) throw httpError(400, 'Unit must be "portion" or "g".')
        const amount = toAmount(b.amount ?? 1)
        const { macros, estimated } = stamp(source.cookable, amount, unit)
        const entry = await FoodEntry.create({
            ...base,
            batch: b.batch,
            recipe: b.batch ? (source.cookable as { recipe?: Types.ObjectId }).recipe : b.recipe,
            name: source.name,
            amount,
            unit,
            macros,
            estimated: estimated || undefined,
        })
        res.status(201).json({ message: 'Created', data: entry })
        return
    }

    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) throw httpError(400, 'A quick line needs a name.')
    const entry = await FoodEntry.create({
        ...base,
        name,
        amount: 1,
        unit: 'portion',
        macros: round(toMacros(b.macros)),
    })
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * PATCH /api/food-entries/:id — tick off, move, or change the amount.
 *
 * A new amount in the same unit scales the figures the line already carries,
 * so a batch or recipe edited since can't leak into it. Only a change of unit,
 * or `restamp: true` (an explicit "recalculate from the batch"), reads the
 * source again. Quick lines take `name` and `macros`.
 */
export async function updateFoodEntry(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const e = await FoodEntry.findOne({ _id: req.params.id, user: req.userId })
    if (!e) throw httpError(404, 'Entry not found')
    const b = req.body ?? {}

    if (b.date !== undefined) {
        if (!isDate(b.date)) throw httpError(400, 'Bad date')
        e.date = b.date
    }
    if (b.slot !== undefined) {
        if (!isSlot(b.slot)) throw httpError(400, 'Bad slot')
        e.slot = b.slot
    }
    if (b.status !== undefined) {
        if (!isStatus(b.status)) throw httpError(400, 'Bad status')
        e.status = b.status
    }

    const isQuick = !e.batch && !e.recipe
    if (isQuick) {
        if (typeof b.name === 'string' && b.name.trim()) e.name = b.name.trim()
        if (b.macros !== undefined) e.macros = round(toMacros(b.macros))
    } else {
        const unit: EntryUnit = b.unit ?? e.unit
        if (!isUnit(unit)) throw httpError(400, 'Unit must be "portion" or "g".')
        const amount = b.amount === undefined ? e.amount : toAmount(b.amount)
        if (unit !== e.unit || b.restamp === true) {
            const source = await sourceOf(req.userId, e)
            const { macros, estimated } = stamp(source!.cookable, amount, unit)
            e.macros = macros
            e.estimated = estimated || undefined
        } else if (amount !== e.amount) {
            e.macros = round(scale(e.macros, amount / e.amount))
        }
        e.amount = amount
        e.unit = unit
    }

    await e.save()
    res.json({ message: 'OK', data: e })
}

/** DELETE /api/food-entries/:id */
export async function deleteFoodEntry(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const result = await FoodEntry.deleteOne({ _id: req.params.id, user: req.userId })
    if (!result.deletedCount) throw httpError(404, 'Entry not found')
    res.json({ message: 'Deleted' })
}

const addDays = (date: string, days: number) => {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}
const dayDiff = (a: string, b: string) =>
    Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

/**
 * POST /api/food-entries/copy { fromStart, fromEnd, toStart, slot? }
 *
 * Repeats lines as *planned* — a meal, a day or a week. Lines from a batch or
 * recipe are re-stamped from it now (a plan follows its source); quick lines,
 * and lines whose source can't be weighed any more, keep their figures.
 */
export async function copyFoodEntries(req: AuthRequest, res: Response) {
    const { fromStart, fromEnd, toStart, slot } = req.body ?? {}
    if (!isDate(fromStart) || !isDate(fromEnd) || !isDate(toStart)) {
        throw httpError(400, 'fromStart, fromEnd and toStart (YYYY-MM-DD) are required')
    }
    if (slot !== undefined && !isSlot(slot)) throw httpError(400, 'Bad slot')
    const shift = dayDiff(fromStart, toStart)
    const filter: Record<string, unknown> = {
        user: req.userId,
        date: { $gte: fromStart, $lte: fromEnd },
        status: { $ne: 'skipped' },
    }
    if (slot) filter.slot = slot
    const source = await FoodEntry.find(filter).sort({ date: 1, order: 1 })

    const created: IFoodEntry[] = []
    for (const s of source) {
        const copy = {
            user: req.userId,
            date: addDays(s.date, shift),
            slot: s.slot,
            status: 'planned' as const,
            batch: s.batch,
            recipe: s.recipe,
            name: s.name,
            amount: s.amount,
            unit: s.unit,
            macros: s.macros,
            estimated: s.estimated,
            order: s.order + 1000, // after anything already planned there
        }
        try {
            const src = await sourceOf(req.userId, s)
            if (src) {
                const { macros, estimated } = stamp(src.cookable, s.amount, s.unit)
                Object.assign(copy, { macros, estimated: estimated || undefined })
            }
        } catch {
            // Source gone or unweighable — keep the copied figures.
        }
        created.push(await FoodEntry.create(copy))
    }
    res.status(201).json({ message: 'Copied', data: created })
}

/** POST /api/food-entries/clear { start, end } — removes *planned* lines only. */
export async function clearPlanned(req: AuthRequest, res: Response) {
    const { start, end } = req.body ?? {}
    if (!isDate(start) || !isDate(end)) throw httpError(400, 'start and end are required')
    const result = await FoodEntry.deleteMany({
        user: req.userId,
        date: { $gte: start, $lte: end },
        status: 'planned',
    })
    res.json({ message: 'Cleared', data: { deleted: result.deletedCount } })
}
