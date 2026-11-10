import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Timebox, {
    DATE_PATTERN,
    TIME_PATTERN,
    TIMEBOX_CATEGORIES,
    RECURRENCE_FREQS,
    type TimeboxCategory,
    type RecurrenceFreq,
} from '../models/Timebox'

const READ_ONLY = 'Meetings from Google Calendar are read-only — change them in Google'

const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_PATTERN.test(v)
const isTime = (v: unknown): v is string => typeof v === 'string' && TIME_PATTERN.test(v)

/** Day of week (0 = Sun … 6 = Sat) of a YYYY-MM-DD key, read as a calendar date. */
function dowOf(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The Monday of `date`'s week (YYYY-MM-DD). */
export function mondayOf(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const day = new Date(Date.UTC(y, m - 1, d))
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7))
    return day.toISOString().slice(0, 10)
}

/** Whether a repeating block lands on `date`. */
function repeatsOn(
    start: string,
    rec: { freq: RecurrenceFreq; days?: number[]; until?: string },
    date: string
): boolean {
    if (date < start) return false
    if (rec.until && date > rec.until) return false
    const dow = dowOf(date)
    switch (rec.freq) {
        case 'daily':
            return true
        case 'weekdays':
            return dow >= 1 && dow <= 5
        case 'weekly':
            return dowOf(start) === dow
        case 'custom':
            return Array.isArray(rec.days) && rec.days.includes(dow)
    }
    return false
}

/**
 * GET /api/timeboxes?date=YYYY-MM-DD — the day's blocks: one-offs on that date
 * plus every repeating block that lands on it (marked `isRecurringInstance`).
 */
export async function listTimeboxes(req: AuthRequest, res: Response) {
    const { date } = req.query
    if (!isDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const [oneOffs, templates] = await Promise.all([
        Timebox.find({ user: req.userId, date, recurrence: { $exists: false } }).lean(),
        Timebox.find({ user: req.userId, 'recurrence.freq': { $exists: true }, date: { $lte: date } }).lean(),
    ])

    const repeats = templates
        .filter((t) => t.recurrence && repeatsOn(t.date, t.recurrence, date) && !t.exceptions.includes(date))
        .map((t) => ({ ...t, seriesStart: t.date, date, isRecurringInstance: true }))

    const all = [...oneOffs, ...repeats].sort((a, b) => a.startTime.localeCompare(b.startTime))
    res.json({ message: 'OK', data: all })
}

interface Fields {
    title: string
    notes?: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[]; until?: string }
}

/** Validate a block from a request body. Returns an error message or the clean fields. */
function readFields(body: Record<string, unknown>): Fields | string {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return 'title is required'
    if (!isTime(body.startTime) || !isTime(body.endTime)) return 'startTime and endTime must be HH:MM'
    if (body.endTime <= body.startTime) return 'endTime must be after startTime'

    const fields: Fields = { title, startTime: body.startTime, endTime: body.endTime }
    if (typeof body.notes === 'string' && body.notes.trim()) fields.notes = body.notes.trim()
    if (typeof body.category === 'string' && (TIMEBOX_CATEGORIES as readonly string[]).includes(body.category))
        fields.category = body.category as TimeboxCategory

    const rec = body.recurrence as Record<string, unknown> | null | undefined
    if (rec && typeof rec.freq === 'string' && (RECURRENCE_FREQS as readonly string[]).includes(rec.freq)) {
        const freq = rec.freq as RecurrenceFreq
        const days = Array.isArray(rec.days)
            ? [...new Set(rec.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
            : undefined
        if (freq === 'custom' && !days?.length) return 'pick at least one day to repeat on'
        fields.recurrence = {
            freq,
            ...(freq === 'custom' ? { days } : {}),
            ...(isDate(rec.until) ? { until: rec.until } : {}),
        }
    }
    return fields
}

/** POST /api/timeboxes — body: { date, title, startTime, endTime, notes?, category?, recurrence? } */
export async function createTimebox(req: AuthRequest, res: Response) {
    if (!isDate(req.body.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    const fields = readFields(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const item = await Timebox.create({ user: req.userId, date: req.body.date, ...fields })
    res.status(201).json({ message: 'Created', data: item })
}

/**
 * POST /api/timeboxes/import — body: { date, items: [{ title, start|startTime, end|endTime, notes?, category?, date?, recurrence? }] }
 * Adds blocks; each item can name its own date, else it lands on `date`. With
 * `recurrence` ({ freq, days?, until? }) the block repeats — and, without a
 * date of its own, from the Monday of `date`'s week, so importing a week's
 * routine mid-week still fills the days before. Weekly repeats keep `date`,
 * since their weekday comes from it.
 * Bad items are skipped and counted rather than failing the lot.
 */
export async function importTimeboxes(req: AuthRequest, res: Response) {
    const items = req.body?.items
    if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ message: 'items must be a non-empty array' })
        return
    }
    if (items.length > 200) {
        res.status(400).json({ message: 'import at most 200 blocks at a time' })
        return
    }

    const docs: object[] = []
    const errors: string[] = []
    items.forEach((raw: unknown, i: number) => {
        if (!raw || typeof raw !== 'object') {
            errors.push(`#${i + 1}: not an object`)
            return
        }
        const r = raw as Record<string, unknown>
        const date = isDate(r.date) ? r.date : req.body.date
        if (!isDate(date)) {
            errors.push(`#${i + 1}: no date`)
            return
        }
        const fields = readFields({
            ...r,
            startTime: r.startTime ?? r.start,
            endTime: r.endTime ?? r.end,
        })
        if (typeof fields === 'string') {
            errors.push(`#${i + 1}: ${fields}`)
            return
        }
        const seriesStart =
            fields.recurrence && fields.recurrence.freq !== 'weekly' && !isDate(r.date) ? mondayOf(date) : date
        docs.push({ user: req.userId, date: seriesStart, ...fields })
    })

    const created = docs.length ? await Timebox.insertMany(docs) : []
    res.status(201).json({
        message: 'Imported',
        data: { added: created.length, skipped: errors.length, errors: errors.slice(0, 10) },
    })
}

/** PUT /api/timeboxes/:id — replaces the block's fields (a repeating block's whole series). */
export async function updateTimebox(req: AuthRequest, res: Response) {
    const item = await Timebox.findOne({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Timebox not found' })
        return
    }
    if (item.source) {
        res.status(400).json({ message: READ_ONLY })
        return
    }
    const fields = readFields(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    item.title = fields.title
    item.startTime = fields.startTime
    item.endTime = fields.endTime
    item.notes = fields.notes
    item.category = fields.category
    item.recurrence = fields.recurrence
    // A one-off's day can move; a series keeps its start date.
    if (!fields.recurrence && isDate(req.body.date)) item.date = req.body.date
    await item.save()
    res.json({ message: 'Saved', data: item })
}

/**
 * DELETE /api/timeboxes/:id
 *  Body { scope: 'this', date } on a repeating block → skip just that day.
 *  Anything else → delete the block (the whole series, if it repeats).
 */
export async function deleteTimebox(req: AuthRequest, res: Response) {
    const item = await Timebox.findOne({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Timebox not found' })
        return
    }
    if (item.source) {
        res.status(400).json({ message: READ_ONLY })
        return
    }
    const { scope, date } = req.body ?? {}
    if (scope === 'this' && isDate(date) && item.recurrence) {
        if (!item.exceptions.includes(date)) {
            item.exceptions.push(date)
            await item.save()
        }
        res.json({ message: 'Skipped', data: item })
        return
    }
    await item.deleteOne()
    res.json({ message: 'Deleted', data: null })
}
