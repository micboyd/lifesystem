import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import WeightLog, { ISO_DATE_PATTERN, MEASUREMENT_FIELDS } from '../models/WeightLog'

function isDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

/** Coerce to a positive number, or undefined when absent/blank/invalid. */
function toMeasure(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Coerce to a percentage in (0, 100], or undefined when absent/blank/invalid. */
function toPercent(raw: unknown): number | undefined {
    const n = toMeasure(raw)
    return n !== undefined && n <= 100 ? n : undefined
}

/**
 * GET /api/weight-logs?since=YYYY-MM-DD
 * List weigh-ins oldest-first, so the trend can be folded over them in order.
 * `since` is optional; without it the whole history comes back.
 */
export async function listWeightLogs(req: AuthRequest, res: Response) {
    const { since } = req.query
    const filter: Record<string, unknown> = { user: req.userId }
    if (isDate(since)) filter.date = { $gte: since }

    const logs = await WeightLog.find(filter).sort({ date: 1 })
    res.json({ message: 'OK', data: logs })
}

/**
 * POST /api/weight-logs — record a weigh-in, upserting on the date. A second
 * reading for a day replaces the first: daily weight is noisy enough that
 * re-weighing is a correction, not an extra observation.
 */
export async function upsertWeightLog(req: AuthRequest, res: Response) {
    const { date, weight, waist, bodyFat, notes } = req.body

    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    const kg = toMeasure(weight)
    if (kg === undefined) {
        res.status(400).json({ message: 'weight must be a positive number' })
        return
    }

    const fat = toPercent(bodyFat)
    const note = typeof notes === 'string' ? notes.trim() : ''

    // The optional fields are unset rather than left behind when sent blank, so
    // re-saving a day with an emptied field actually clears it.
    const set: Record<string, unknown> = { weight: kg }
    const unset: Record<string, 1> = {}

    // Every circumference is handled the same way, driven off the model's own
    // list — so adding one there can't leave the write path silently dropping it.
    const body = req.body as Record<string, unknown>
    for (const field of MEASUREMENT_FIELDS) {
        const cm = toMeasure(field === 'waist' ? waist : body[field])
        if (cm !== undefined) set[field] = cm
        else unset[field] = 1
    }

    if (fat !== undefined) set.bodyFat = fat
    else unset.bodyFat = 1
    if (note) set.notes = note
    else unset.notes = 1

    const log = await WeightLog.findOneAndUpdate(
        { user: req.userId, date },
        { $set: set, $unset: unset },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    res.status(201).json({ message: 'Saved', data: log })
}

/** DELETE /api/weight-logs/:id — remove a weigh-in. */
export async function deleteWeightLog(req: AuthRequest, res: Response) {
    const log = await WeightLog.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!log) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted', data: log })
}
