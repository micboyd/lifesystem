import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import MonthNote, { MONTH_PATTERN } from '../models/MonthNote'
import { CALENDAR_COLORS, type CalendarColor } from '../models/Calendar'

function isValidMonth(v: unknown): v is string {
    return typeof v === 'string' && MONTH_PATTERN.test(v)
}

function isValidColor(v: unknown): v is CalendarColor {
    return typeof v === 'string' && (CALENDAR_COLORS as readonly string[]).includes(v)
}

/** Validate and normalise a create/update body, or return the error message. */
function readBody(body: {
    startMonth?: unknown
    endMonth?: unknown
    label?: unknown
    note?: unknown
    color?: unknown
}):
    | { error: string }
    | {
          startMonth: string
          endMonth: string
          label: string
          note: string | undefined
          color: CalendarColor
      } {
    const { startMonth, endMonth, label, note, color } = body
    if (!isValidMonth(startMonth) || !isValidMonth(endMonth))
        return { error: 'startMonth and endMonth must be YYYY-MM' }
    if (startMonth > endMonth) return { error: 'startMonth cannot be after endMonth' }
    if (typeof label !== 'string' || !label.trim()) return { error: 'label is required' }
    if (note !== undefined && note !== null && typeof note !== 'string')
        return { error: 'note must be a string' }
    if (color !== undefined && !isValidColor(color))
        return { error: `color must be one of: ${CALENDAR_COLORS.join(', ')}` }
    return {
        startMonth,
        endMonth,
        label: label.trim().slice(0, 60),
        note: typeof note === 'string' && note.trim() ? note.trim() : undefined,
        color: isValidColor(color) ? color : 'neutral',
    }
}

/** GET /api/month-notes?from=YYYY-MM&to=YYYY-MM — notes overlapping the range. */
export async function listMonthNotes(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (!isValidMonth(from) || !isValidMonth(to)) {
        res.status(400).json({ message: 'from and to must both be YYYY-MM' })
        return
    }
    const notes = await MonthNote.find({
        user: req.userId,
        startMonth: { $lte: to },
        endMonth: { $gte: from },
    }).sort({ startMonth: 1, createdAt: 1 })
    res.json({ message: 'OK', data: notes })
}

/** POST /api/month-notes — flag a month or run of months. */
export async function createMonthNote(req: AuthRequest, res: Response) {
    const parsed = readBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    const note = await MonthNote.create({ user: req.userId, ...parsed })
    res.status(201).json({ message: 'Created', data: note })
}

/** PUT /api/month-notes/:id — update a flag. */
export async function updateMonthNote(req: AuthRequest, res: Response) {
    const parsed = readBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    const { note: body, ...rest } = parsed
    const note = await MonthNote.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        // A cleared note is removed outright rather than left as an empty string.
        body === undefined
            ? { $set: rest, $unset: { note: '' } }
            : { $set: { ...rest, note: body } },
        { new: true }
    )
    if (!note) {
        res.status(404).json({ message: 'Note not found' })
        return
    }
    res.json({ message: 'Saved', data: note })
}

/** DELETE /api/month-notes/:id — remove a flag. */
export async function deleteMonthNote(req: AuthRequest, res: Response) {
    const note = await MonthNote.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!note) {
        res.status(404).json({ message: 'Note not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
