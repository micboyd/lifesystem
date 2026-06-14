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

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

function isValidTime(v: unknown): v is string {
    return typeof v === 'string' && TIME_PATTERN.test(v)
}

/** Day-of-week (0=Sun…6=Sat) for a YYYY-MM-DD string. */
function dowOf(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).getDay()
}

/** Whether a recurring template applies on a given date. */
function recurringApplies(
    templateDate: string,
    freq: RecurrenceFreq,
    date: string,
    days?: number[]
): boolean {
    if (date < templateDate) return false
    const dow = dowOf(date)
    if (freq === 'daily') return true
    if (freq === 'weekdays') return dow >= 1 && dow <= 5
    if (freq === 'weekly') return dowOf(templateDate) === dow
    if (freq === 'custom') return Array.isArray(days) && days.includes(dow)
    return false
}

/** GET /api/timeboxes?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listTimeboxes(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }
    }

    const fromDate = isValidDate(from) ? from : undefined
    const toDate = isValidDate(to) ? to : undefined

    // Specific-date timeboxes in range
    const specificQuery: Record<string, unknown> = { user: req.userId, recurrence: { $exists: false } }
    if (fromDate && toDate) specificQuery.date = { $gte: fromDate, $lte: toDate }
    const specific = await Timebox.find(specificQuery).sort({ date: 1, startTime: 1 })

    // Recurring templates that started on or before `to`
    const recurringQuery: Record<string, unknown> = { user: req.userId, 'recurrence.freq': { $exists: true } }
    if (toDate) recurringQuery.date = { $lte: toDate }
    const templates = await Timebox.find(recurringQuery).sort({ startTime: 1 })

    // Expand recurring templates into instances for each date in range
    const expanded: object[] = []
    if (fromDate && toDate && templates.length) {
        // Iterate each day in [from, to]
        const start = new Date(`${fromDate}T12:00:00`)
        const end = new Date(`${toDate}T12:00:00`)
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().slice(0, 10)
            for (const tpl of templates) {
                if (!recurringApplies(tpl.date, tpl.recurrence!.freq, dateStr, tpl.recurrence!.days)) continue
                if (tpl.exceptions.includes(dateStr)) continue
                // Skip if there's already a specific block with same time on this date
                const clash = specific.find(
                    (s) => s.date === dateStr && s.startTime === tpl.startTime
                )
                if (clash) continue
                expanded.push({
                    ...tpl.toObject(),
                    date: dateStr,
                    isRecurringInstance: true,
                })
            }
        }
    }

    const all = [...specific.map((s) => s.toObject()), ...expanded].sort((a: any, b: any) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1
        return a.startTime < b.startTime ? -1 : 1
    })

    res.json({ message: 'OK', data: all })
}

interface TimeboxFields {
    title: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[] }
}

function validateBody(body: Record<string, unknown>): string | TimeboxFields {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return 'title is required'
    if (!isValidTime(body.startTime) || !isValidTime(body.endTime))
        return 'startTime and endTime must be HH:MM'
    if (body.endTime <= body.startTime) return 'endTime must be after startTime'
    const category =
        typeof body.category === 'string' &&
        (TIMEBOX_CATEGORIES as readonly string[]).includes(body.category)
            ? (body.category as TimeboxCategory)
            : undefined
    let recurrence: { freq: RecurrenceFreq } | undefined
    if (
        body.recurrence &&
        typeof (body.recurrence as any).freq === 'string' &&
        (RECURRENCE_FREQS as readonly string[]).includes((body.recurrence as any).freq)
    ) {
        const freq = (body.recurrence as any).freq as RecurrenceFreq
        const rawDays = (body.recurrence as any).days
        const days =
            freq === 'custom' && Array.isArray(rawDays)
                ? rawDays.filter((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)
                : undefined
        recurrence = { freq, ...(days ? { days } : {}) }
    }
    return { title, category, startTime: body.startTime as string, endTime: body.endTime as string, recurrence }
}

/** True if another timebox on the same day overlaps [startTime, endTime). */
async function hasOverlap(
    userId: string | undefined,
    date: string,
    startTime: string,
    endTime: string,
    excludeId?: string
): Promise<boolean> {
    const overlapping = await Timebox.findOne({
        user: userId,
        date,
        recurrence: { $exists: false },
        startTime: { $lt: endTime },
        endTime: { $gt: startTime },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })
    return overlapping !== null
}

/** POST /api/timeboxes */
export async function createTimebox(req: AuthRequest, res: Response) {
    if (!isValidDate(req.body.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    const fields = validateBody(req.body ?? {})
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    // Only check overlaps for non-recurring timeboxes
    if (!fields.recurrence) {
        if (await hasOverlap(req.userId, req.body.date, fields.startTime, fields.endTime)) {
            res.status(409).json({ message: 'That time overlaps another block' })
            return
        }
    }
    const item = await Timebox.create({ user: req.userId, date: req.body.date, ...fields })
    res.status(201).json({ message: 'Created', data: item })
}

/** PUT /api/timeboxes/:id */
export async function updateTimebox(req: AuthRequest, res: Response) {
    const fields = validateBody(req.body ?? {})
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const existing = await Timebox.findOne({ _id: req.params.id, user: req.userId })
    if (!existing) {
        res.status(404).json({ message: 'Timebox not found' })
        return
    }
    if (
        !fields.recurrence &&
        (await hasOverlap(req.userId, existing.date, fields.startTime, fields.endTime, req.params.id))
    ) {
        res.status(409).json({ message: 'That time overlaps another block' })
        return
    }
    existing.title = fields.title
    existing.startTime = fields.startTime
    existing.endTime = fields.endTime
    existing.category = fields.category
    existing.recurrence = fields.recurrence
    await existing.save()
    res.json({ message: 'Saved', data: existing })
}

/** DELETE /api/timeboxes/:id
 *  Body: { scope: 'all' }           → delete the template entirely
 *        { scope: 'this', date }    → add date to exceptions (skip this occurrence)
 */
export async function deleteTimebox(req: AuthRequest, res: Response) {
    const item = await Timebox.findOne({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Timebox not found' })
        return
    }

    const scope = req.body?.scope
    const date = req.body?.date

    if (scope === 'this' && isValidDate(date) && item.recurrence) {
        if (!item.exceptions.includes(date)) {
            item.exceptions.push(date)
            await item.save()
        }
        res.json({ message: 'Skipped', data: item })
        return
    }

    await item.deleteOne()
    res.json({ message: 'Deleted' })
}
