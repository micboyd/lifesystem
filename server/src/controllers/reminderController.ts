import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Reminder, { DATE_PATTERN, IReminderRecurrence } from '../models/Reminder'
import { expandRecurring, isRecurrenceFrequency } from '../lib/recurrence'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

/** Parse an optional recurrence rule from a request body. */
function parseRecurrence(body: Record<string, unknown>): IReminderRecurrence | undefined {
    const rec = body.recurrence as Record<string, unknown> | null | undefined
    if (!rec || !isRecurrenceFrequency(rec.frequency)) return undefined
    const recurrence: IReminderRecurrence = { frequency: rec.frequency }
    if (isValidDate(rec.endsOn)) recurrence.endsOn = rec.endsOn
    return recurrence
}

/** GET /api/reminders?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listReminders(req: AuthRequest, res: Response) {
    const { from, to } = req.query

    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }

        // One-off reminders landing in the range.
        const regular = await Reminder.find({
            user: req.userId,
            date: { $gte: from, $lte: to },
            recurrence: { $exists: false },
        }).sort({ date: 1, order: 1, createdAt: 1 })

        // Recurring masters that could have occurrences in range.
        const recurring = await Reminder.find({
            user: req.userId,
            date: { $lte: to },
            $or: [
                { 'recurrence.endsOn': { $exists: false } },
                { 'recurrence.endsOn': { $gte: from } },
            ],
            recurrence: { $exists: true },
        })

        // expandRecurring works on a `startDate`; map the reminder's `date` to it
        // and back so callers still see a plain `date` per occurrence.
        const instances = recurring.flatMap((r) => {
            const base = r.toObject()
            return expandRecurring({ ...base, startDate: base.date }, from, to).map((occ) => {
                const { startDate, ...rest } = occ
                return { ...rest, date: startDate }
            })
        })

        const data = [...regular.map((r) => r.toObject()), ...instances].sort((a, b) =>
            a.date < b.date ? -1 : a.date > b.date ? 1 : (a.order ?? 0) - (b.order ?? 0)
        )
        res.json({ message: 'OK', data })
        return
    }

    const reminders = await Reminder.find({ user: req.userId }).sort({
        date: 1,
        order: 1,
        createdAt: 1,
    })
    res.json({ message: 'OK', data: reminders })
}

/** POST /api/reminders — create a reminder for a given date. */
export async function createReminder(req: AuthRequest, res: Response) {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    if (!text) {
        res.status(400).json({ message: 'text is required' })
        return
    }
    if (!isValidDate(req.body.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    // Place at the end of that day's list
    const last = await Reminder.findOne({ user: req.userId, date: req.body.date }).sort({
        order: -1,
    })
    const order = last ? last.order + 1 : 0

    const reminder = await Reminder.create({
        user: req.userId,
        date: req.body.date,
        text,
        order,
        recurrence: parseRecurrence(req.body),
    })
    res.status(201).json({ message: 'Created', data: reminder })
}

/** PUT /api/reminders/:id — update text, order, or recurrence. */
export async function updateReminder(req: AuthRequest, res: Response) {
    const $set: Record<string, unknown> = {}
    const $unset: Record<string, 1> = {}

    if (typeof req.body.text === 'string' && req.body.text.trim())
        $set.text = req.body.text.trim()
    if (typeof req.body.order === 'number') $set.order = req.body.order
    if (isValidDate(req.body.date)) $set.date = req.body.date

    // Recurrence only changes when the key is present, so a partial update that
    // omits it leaves the existing rule untouched.
    if ('recurrence' in req.body) {
        const recurrence = parseRecurrence(req.body)
        if (recurrence) $set.recurrence = recurrence
        else $unset.recurrence = 1
    }

    const updateOp: Record<string, unknown> = { $set }
    if (Object.keys($unset).length > 0) updateOp.$unset = $unset

    const reminder = await Reminder.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        updateOp,
        { new: true }
    )
    if (!reminder) {
        res.status(404).json({ message: 'Reminder not found' })
        return
    }
    res.json({ message: 'Saved', data: reminder })
}

/**
 * DELETE /api/reminders/:id
 * Without a `date` query param, deletes the reminder (and, for recurring ones,
 * the whole series). With `?date=YYYY-MM-DD`, removes only that one occurrence
 * of a recurring series by recording it as an exception date.
 */
export async function deleteReminder(req: AuthRequest, res: Response) {
    const { date } = req.query

    if (date !== undefined) {
        if (!isValidDate(date)) {
            res.status(400).json({ message: 'date must be YYYY-MM-DD' })
            return
        }
        const reminder = await Reminder.findOneAndUpdate(
            { _id: req.params.id, user: req.userId, recurrence: { $exists: true } },
            { $addToSet: { exdates: date } },
            { new: true }
        )
        if (!reminder) {
            res.status(404).json({ message: 'Recurring reminder not found' })
            return
        }
        res.json({ message: 'Occurrence removed', data: reminder.toObject() })
        return
    }

    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!reminder) {
        res.status(404).json({ message: 'Reminder not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
