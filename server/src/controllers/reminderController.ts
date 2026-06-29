import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Reminder, { DATE_PATTERN } from '../models/Reminder'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

/** GET /api/reminders?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listReminders(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    const query: Record<string, unknown> = { user: req.userId }

    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }
        query.date = { $gte: from, $lte: to }
    }

    const reminders = await Reminder.find(query).sort({ date: 1, order: 1, createdAt: 1 })
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

    const reminder = await Reminder.create({ user: req.userId, date: req.body.date, text, order })
    res.status(201).json({ message: 'Created', data: reminder })
}

/** PUT /api/reminders/:id — update text or order. */
export async function updateReminder(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.text === 'string' && req.body.text.trim())
        fields.text = req.body.text.trim()
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const reminder = await Reminder.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!reminder) {
        res.status(404).json({ message: 'Reminder not found' })
        return
    }
    res.json({ message: 'Saved', data: reminder })
}

/** DELETE /api/reminders/:id */
export async function deleteReminder(req: AuthRequest, res: Response) {
    const reminder = await Reminder.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!reminder) {
        res.status(404).json({ message: 'Reminder not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
