import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Event, {
    DATE_PATTERN, TIME_PATTERN, PARTS, EVENT_TYPES, RECURRENCE_FREQUENCIES,
    Part, EventType, RecurrenceFrequency, IEvent, IRecurrence,
} from '../models/Event'

function isValidDate(value: unknown): value is string {
    return typeof value === 'string' && DATE_PATTERN.test(value)
}

function isPart(value: unknown): value is Part {
    return typeof value === 'string' && (PARTS as readonly string[]).includes(value)
}

function isEventType(value: unknown): value is EventType {
    return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value)
}

function isFrequency(value: unknown): value is RecurrenceFrequency {
    return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

/** Epoch days × 4 slots/day + part index. */
function slotOrdinal(date: string, part: Part) {
    const [y, m, d] = date.split('-').map(Number)
    return (Date.UTC(y, m - 1, d) / 86_400_000) * 4 + PARTS.indexOf(part)
}

/** Add n intervals of `frequency` to a YYYY-MM-DD string. */
function addInterval(date: string, frequency: RecurrenceFrequency, n: number): string {
    const [y, m, d] = date.split('-').map(Number)
    let dt: Date
    switch (frequency) {
        case 'daily':     dt = new Date(Date.UTC(y, m - 1, d + n)); break
        case 'weekly':    dt = new Date(Date.UTC(y, m - 1, d + n * 7)); break
        case 'biweekly':  dt = new Date(Date.UTC(y, m - 1, d + n * 14)); break
        case 'monthly':   dt = new Date(Date.UTC(y, m - 1 + n, d)); break
        case 'yearly':    dt = new Date(Date.UTC(y + n, m - 1, d)); break
    }
    return dt.toISOString().slice(0, 10)
}

/**
 * Returns the approximate starting iteration index for a recurring event
 * so we begin expansion near `from` rather than from n=0.
 */
function startingN(eventStart: string, frequency: RecurrenceFrequency, from: string): number {
    const diffDays = (Date.parse(from) - Date.parse(eventStart)) / 86_400_000
    if (diffDays <= 0) return 0
    switch (frequency) {
        case 'daily':    return Math.max(0, Math.floor(diffDays) - 1)
        case 'weekly':   return Math.max(0, Math.floor(diffDays / 7) - 1)
        case 'biweekly': return Math.max(0, Math.floor(diffDays / 14) - 1)
        case 'monthly':  return Math.max(0, Math.floor(diffDays / 30.44) - 1)
        case 'yearly':   return Math.max(0, Math.floor(diffDays / 365.25) - 1)
    }
}

/** Expand a recurring event master into instances that overlap [from, to]. */
function expandOccurrences(event: IEvent, from: string, to: string) {
    if (!event.recurrence) return []
    const { frequency, endsOn } = event.recurrence
    const effectiveTo = endsOn && endsOn < to ? endsOn : to
    const base = event.toObject()
    const results: typeof base[] = []
    const MAX = 500

    let n = startingN(event.startDate, frequency, from)
    let safety = 0

    while (safety++ < MAX) {
        const occStart = addInterval(event.startDate, frequency, n)
        if (occStart > effectiveTo) break
        const occEnd = addInterval(event.endDate, frequency, n)
        // Overlaps [from, to]?
        if (occEnd >= from && occStart <= to) {
            results.push({ ...base, startDate: occStart, endDate: occEnd })
        }
        n++
    }
    return results
}

interface EventFields {
    title: string
    notes?: string
    location?: string
    eventType: EventType
    allDay: boolean
    time?: string
    startDate: string
    startPart: Part
    endDate: string
    endPart: Part
    recurrence?: IRecurrence
}

function parseBody(body: Record<string, unknown>): EventFields | string {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return 'title is required'
    if (!isValidDate(body.startDate) || !isValidDate(body.endDate)) return 'startDate and endDate must be YYYY-MM-DD'
    if (body.startDate > body.endDate) return 'startDate cannot be after endDate'

    const allDay = body.allDay === true
    const eventType: EventType = isEventType(body.eventType) ? body.eventType : 'general'
    const time = typeof body.time === 'string' && TIME_PATTERN.test(body.time) ? body.time : undefined

    let startPart: Part
    let endPart: Part
    if (allDay) {
        startPart = 'morning'
        endPart = 'evening'
    } else {
        if (!isPart(body.startPart) || !isPart(body.endPart)) {
            return `parts must be one of: ${PARTS.join(', ')}`
        }
        startPart = body.startPart
        endPart = startPart === 'na' ? 'na' : body.endPart
        if (startPart !== 'na') {
            if (slotOrdinal(body.startDate as string, startPart) > slotOrdinal(body.endDate as string, endPart)) {
                return 'the end of an event cannot be before its start'
            }
        }
    }

    // Recurrence
    let recurrence: IRecurrence | undefined
    const rec = body.recurrence as Record<string, unknown> | null | undefined
    if (rec && isFrequency(rec.frequency)) {
        recurrence = { frequency: rec.frequency }
        if (isValidDate(rec.endsOn)) recurrence.endsOn = rec.endsOn
    }

    return {
        title,
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : undefined,
        location: typeof body.location === 'string' && body.location.trim() ? body.location.trim() : undefined,
        eventType, allDay, time,
        startDate: body.startDate as string, startPart,
        endDate: body.endDate as string, endPart,
        recurrence,
    }
}

async function hasConflict(userId: string, fields: EventFields, excludeId?: string) {
    if (fields.startPart === 'na' || fields.recurrence) return false // skip for na + recurring

    const candidates = await Event.find({
        user: userId,
        startDate: { $lte: fields.endDate },
        endDate: { $gte: fields.startDate },
        startPart: { $ne: 'na' },
        recurrence: { $exists: false },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    })

    const startOrd = slotOrdinal(fields.startDate, fields.startPart)
    const endOrd = slotOrdinal(fields.endDate, fields.endPart)
    return candidates.some((e) => {
        const s = slotOrdinal(e.startDate, e.startPart as Part)
        const en = slotOrdinal(e.endDate, e.endPart as Part)
        return s <= endOrd && startOrd <= en
    })
}

/** GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listEvents(req: AuthRequest, res: Response) {
    const { from, to } = req.query

    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD dates' })
            return
        }

        // Non-recurring events that overlap the range
        const regular = await Event.find({
            user: req.userId,
            startDate: { $lte: to },
            endDate: { $gte: from },
            recurrence: { $exists: false },
        }).sort({ startDate: 1 })

        // Recurring masters that could have instances in range
        const recurring = await Event.find({
            user: req.userId,
            startDate: { $lte: to },
            $or: [
                { 'recurrence.endsOn': { $exists: false } },
                { 'recurrence.endsOn': { $gte: from } },
            ],
            recurrence: { $exists: true },
        })

        const instances = recurring.flatMap((e) => expandOccurrences(e, from as string, to as string))

        return res.json({
            message: 'OK',
            data: [...regular.map((e) => e.toObject()), ...instances].sort((a, b) =>
                a.startDate < b.startDate ? -1 : 1
            ),
        })
    }

    const events = await Event.find({ user: req.userId }).sort({ startDate: 1 })
    res.json({ message: 'OK', data: events })
}

/** POST /api/events */
export async function createEvent(req: AuthRequest, res: Response) {
    const fields = parseBody(req.body ?? {})
    if (typeof fields === 'string') { res.status(400).json({ message: fields }); return }
    if (await hasConflict(req.userId!, fields)) {
        res.status(409).json({ message: 'Another event already occupies one of those slots' }); return
    }
    const event = await Event.create({ user: req.userId, ...fields })
    res.status(201).json({ message: 'Created', data: event })
}

/** PUT /api/events/:id */
export async function updateEvent(req: AuthRequest, res: Response) {
    const fields = parseBody(req.body ?? {})
    if (typeof fields === 'string') { res.status(400).json({ message: fields }); return }
    if (await hasConflict(req.userId!, fields, req.params.id)) {
        res.status(409).json({ message: 'Another event already occupies one of those slots' }); return
    }
    // Build $set (required fields always present) and $unset (clear optional
    // fields that were removed so stale values don't persist).
    const $set: Record<string, unknown> = {
        title:     fields.title,
        eventType: fields.eventType,
        allDay:    fields.allDay,
        startDate: fields.startDate,
        startPart: fields.startPart,
        endDate:   fields.endDate,
        endPart:   fields.endPart,
    }
    const $unset: Record<string, 1> = {}

    if (fields.notes      !== undefined) $set.notes      = fields.notes
    else                                 $unset.notes     = 1

    if (fields.location   !== undefined) $set.location   = fields.location
    else                                 $unset.location  = 1

    if (fields.time       !== undefined) $set.time       = fields.time
    else                                 $unset.time      = 1

    if (fields.recurrence !== undefined) $set.recurrence = fields.recurrence
    else                                 $unset.recurrence = 1

    const updateOp: Record<string, unknown> = { $set }
    if (Object.keys($unset).length > 0) updateOp.$unset = $unset

    const event = await Event.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        updateOp,
        { new: true }
    )
    if (!event) { res.status(404).json({ message: 'Event not found' }); return }
    res.json({ message: 'Saved', data: event })
}

/** DELETE /api/events/:id */
export async function deleteEvent(req: AuthRequest, res: Response) {
    const event = await Event.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!event) { res.status(404).json({ message: 'Event not found' }); return }
    res.json({ message: 'Deleted', data: event })
}
