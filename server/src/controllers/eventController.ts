import { Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import Event, {
    DATE_PATTERN,
    TIME_PATTERN,
    PARTS,
    EVENT_TYPES,
    RECURRENCE_FREQUENCIES,
    Part,
    EventType,
    RecurrenceFrequency,
    IRecurrence,
} from '../models/Event'
import FinanceRow from '../models/FinanceRow'
import FinanceEntry from '../models/FinanceEntry'
import { expandRecurring } from '../lib/recurrence'

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
    return (
        typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
    )
}

/** Epoch days × 4 slots/day + part index. */
function slotOrdinal(date: string, part: Part) {
    const [y, m, d] = date.split('-').map(Number)
    return (Date.UTC(y, m - 1, d) / 86_400_000) * 4 + PARTS.indexOf(part)
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
    budget?: number
    budgetRow?: string
}

function parseBody(body: Record<string, unknown>): EventFields | string {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return 'title is required'
    if (!isValidDate(body.startDate) || !isValidDate(body.endDate))
        return 'startDate and endDate must be YYYY-MM-DD'
    if (body.startDate > body.endDate) return 'startDate cannot be after endDate'

    const allDay = body.allDay === true
    const eventType: EventType = isEventType(body.eventType) ? body.eventType : 'general'
    const time =
        typeof body.time === 'string' && TIME_PATTERN.test(body.time) ? body.time : undefined

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
            if (
                slotOrdinal(body.startDate as string, startPart) >
                slotOrdinal(body.endDate as string, endPart)
            ) {
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

    // Budget — either a manual amount or a link to a finance row (mutually exclusive).
    let budgetRow: string | undefined
    if (typeof body.budgetRow === 'string' && body.budgetRow.trim()) {
        budgetRow = body.budgetRow.trim()
    }
    let budget: number | undefined
    if (
        !budgetRow &&
        typeof body.budget === 'number' &&
        Number.isFinite(body.budget) &&
        body.budget >= 0
    ) {
        budget = body.budget
    }

    return {
        title,
        notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : undefined,
        location:
            typeof body.location === 'string' && body.location.trim()
                ? body.location.trim()
                : undefined,
        eventType,
        allDay,
        time,
        startDate: body.startDate as string,
        startPart,
        endDate: body.endDate as string,
        endPart,
        recurrence,
        budget,
        budgetRow,
    }
}

/** Confirms a linked finance row exists and belongs to the user. */
async function budgetRowOwnedByUser(userId: string, budgetRow?: string): Promise<boolean> {
    if (!budgetRow) return true
    if (!isValidObjectId(budgetRow)) return false
    const row = await FinanceRow.findOne({ _id: budgetRow, user: userId }).select('_id')
    return !!row
}

interface ResolvableEvent {
    startDate: string
    budget?: number
    budgetRow?: unknown
    budgetRowName?: string
}

/**
 * For events linked to a finance row, pull the budget amount from that row for
 * the event's start month (entry override, else the row's recurring amount).
 * Mutates the passed objects in place. Linked rows that no longer exist are
 * cleared so stale links don't surface a phantom budget.
 */
async function resolveLinkedBudgets(userId: string, events: ResolvableEvent[]): Promise<void> {
    const linked = events.filter((e) => e.budgetRow)
    if (linked.length === 0) return

    const rowIds = [...new Set(linked.map((e) => String(e.budgetRow)))]
    const months = [...new Set(linked.map((e) => e.startDate.slice(0, 7)))]

    const [rows, entries] = await Promise.all([
        FinanceRow.find({ user: userId, _id: { $in: rowIds } }),
        FinanceEntry.find({ user: userId, row: { $in: rowIds }, month: { $in: months } }),
    ])
    const rowMap = new Map(rows.map((r) => [String(r._id), r]))
    const entryMap = new Map(entries.map((en) => [`${String(en.row)}:${en.month}`, en.amount]))

    for (const e of linked) {
        const row = rowMap.get(String(e.budgetRow))
        if (!row) {
            e.budgetRow = undefined
            continue
        }
        const month = e.startDate.slice(0, 7)
        const amount = entryMap.get(`${String(e.budgetRow)}:${month}`)
        e.budget = amount !== undefined ? amount : (row.recurringAmount ?? 0)
        e.budgetRowName = row.name
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

        const instances = recurring.flatMap((e) =>
            expandRecurring(e.toObject(), from as string, to as string)
        )

        const data = [...regular.map((e) => e.toObject()), ...instances].sort((a, b) =>
            a.startDate < b.startDate ? -1 : 1
        )
        await resolveLinkedBudgets(req.userId!, data)
        return res.json({ message: 'OK', data })
    }

    const events = (await Event.find({ user: req.userId }).sort({ startDate: 1 })).map((e) =>
        e.toObject()
    )
    await resolveLinkedBudgets(req.userId!, events)
    res.json({ message: 'OK', data: events })
}

/** POST /api/events */
export async function createEvent(req: AuthRequest, res: Response) {
    const fields = parseBody(req.body ?? {})
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    if (await hasConflict(req.userId!, fields)) {
        res.status(409).json({ message: 'Another event already occupies one of those slots' })
        return
    }
    if (!(await budgetRowOwnedByUser(req.userId!, fields.budgetRow))) {
        res.status(400).json({ message: 'Linked finance row not found' })
        return
    }
    const event = await Event.create({ user: req.userId, ...fields })
    const data = event.toObject()
    await resolveLinkedBudgets(req.userId!, [data])
    res.status(201).json({ message: 'Created', data })
}

/** PUT /api/events/:id */
export async function updateEvent(req: AuthRequest, res: Response) {
    const fields = parseBody(req.body ?? {})
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    if (await hasConflict(req.userId!, fields, req.params.id)) {
        res.status(409).json({ message: 'Another event already occupies one of those slots' })
        return
    }
    if (!(await budgetRowOwnedByUser(req.userId!, fields.budgetRow))) {
        res.status(400).json({ message: 'Linked finance row not found' })
        return
    }
    // Build $set (required fields always present) and $unset (clear optional
    // fields that were removed so stale values don't persist).
    const $set: Record<string, unknown> = {
        title: fields.title,
        eventType: fields.eventType,
        allDay: fields.allDay,
        startDate: fields.startDate,
        startPart: fields.startPart,
        endDate: fields.endDate,
        endPart: fields.endPart,
    }
    const $unset: Record<string, 1> = {}

    if (fields.notes !== undefined) $set.notes = fields.notes
    else $unset.notes = 1

    if (fields.location !== undefined) $set.location = fields.location
    else $unset.location = 1

    if (fields.time !== undefined) $set.time = fields.time
    else $unset.time = 1

    if (fields.recurrence !== undefined) $set.recurrence = fields.recurrence
    else $unset.recurrence = 1

    if (fields.budget !== undefined) $set.budget = fields.budget
    else $unset.budget = 1

    if (fields.budgetRow !== undefined) $set.budgetRow = fields.budgetRow
    else $unset.budgetRow = 1

    const updateOp: Record<string, unknown> = { $set }
    if (Object.keys($unset).length > 0) updateOp.$unset = $unset

    const event = await Event.findOneAndUpdate({ _id: req.params.id, user: req.userId }, updateOp, {
        new: true,
    })
    if (!event) {
        res.status(404).json({ message: 'Event not found' })
        return
    }
    const data = event.toObject()
    await resolveLinkedBudgets(req.userId!, [data])
    res.json({ message: 'Saved', data })
}

/**
 * DELETE /api/events/:id
 * Without a `date` query param, deletes the event (and, for recurring events,
 * the whole series). With `?date=YYYY-MM-DD`, removes only that one occurrence
 * of a recurring series by recording it as an exception date.
 */
export async function deleteEvent(req: AuthRequest, res: Response) {
    const { date } = req.query

    if (date !== undefined) {
        if (!isValidDate(date)) {
            res.status(400).json({ message: 'date must be YYYY-MM-DD' })
            return
        }
        const event = await Event.findOneAndUpdate(
            { _id: req.params.id, user: req.userId, recurrence: { $exists: true } },
            { $addToSet: { exdates: date } },
            { new: true }
        )
        if (!event) {
            res.status(404).json({ message: 'Recurring event not found' })
            return
        }
        res.json({ message: 'Occurrence removed', data: event.toObject() })
        return
    }

    const event = await Event.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!event) {
        res.status(404).json({ message: 'Event not found' })
        return
    }
    res.json({ message: 'Deleted', data: event })
}
