import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import DaysUntilItem, { DAYS_UNTIL_COLORS, DaysUntilColor } from '../models/DaysUntilItem'
import { ISO_DATE_PATTERN } from '../models/DaysSinceItem'
import Reminder from '../models/Reminder'
import { expandRecurring } from '../lib/recurrence'
import { isValidObjectId } from 'mongoose'

/** How far ahead to look for a repeating reminder's next occurrence (covers yearly). */
const LOOKAHEAD_DAYS = 400

function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

function isValidColor(v: unknown): v is DaysUntilColor {
    return typeof v === 'string' && (DAYS_UNTIL_COLORS as readonly string[]).includes(v)
}

/**
 * GET /api/days-until?today=YYYY-MM-DD
 * Countdowns that follow a repeating reminder are rolled on to that reminder's
 * next occurrence on or after `today` (the client's date) and saved, so payday
 * reads "8 days" until it arrives and "31 days" the day after. If the reminder is
 * gone or its series has ended, the countdown keeps its last date.
 */
export async function listDaysUntil(req: AuthRequest, res: Response) {
    const items = await DaysUntilItem.find({ user: req.userId }).sort({ targetDate: 1, label: 1 })
    const today = isValidDate(req.query.today) ? req.query.today : null

    const following = today ? items.filter((i) => i.followNext && i.reminder && i.targetDate < today) : []
    if (today && following.length > 0) {
        const reminders = await Reminder.find({
            user: req.userId,
            _id: { $in: following.map((i) => i.reminder) },
            recurrence: { $exists: true },
        })
        const byId = new Map(reminders.map((r) => [String(r._id), r.toObject()]))
        const horizon = addDays(today, LOOKAHEAD_DAYS)
        await Promise.all(
            following.map(async (item) => {
                const r = byId.get(String(item.reminder))
                if (!r) return
                const [next] = expandRecurring({ ...r, startDate: r.date }, today, horizon)
                if (!next) return
                item.targetDate = next.startDate
                await item.save()
            })
        )
        items.sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.label.localeCompare(b.label))
    }

    res.json({ message: 'OK', data: items })
}

export async function createDaysUntil(req: AuthRequest, res: Response) {
    const label = typeof req.body.label === 'string' ? req.body.label.trim() : ''
    if (!label) {
        res.status(400).json({ message: 'label is required' })
        return
    }
    if (!isValidDate(req.body.targetDate)) {
        res.status(400).json({ message: 'targetDate must be YYYY-MM-DD' })
        return
    }

    const icon =
        typeof req.body.icon === 'string' && req.body.icon.trim()
            ? req.body.icon.trim()
            : 'fa-solid fa-hourglass-end'
    const color = isValidColor(req.body.color) ? req.body.color : 'sky'

    const reminder = isValidObjectId(req.body.reminder) ? req.body.reminder : undefined

    const item = await DaysUntilItem.create({
        user: req.userId,
        label,
        targetDate: req.body.targetDate,
        icon,
        color,
        reminder,
        followNext: !!reminder && req.body.followNext === true,
    })
    res.status(201).json({ message: 'Created', data: item })
}

export async function updateDaysUntil(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.label === 'string' && req.body.label.trim())
        fields.label = req.body.label.trim()
    if (isValidDate(req.body.targetDate)) fields.targetDate = req.body.targetDate
    if (typeof req.body.icon === 'string' && req.body.icon.trim())
        fields.icon = req.body.icon.trim()
    if (isValidColor(req.body.color)) fields.color = req.body.color
    if (typeof req.body.followNext === 'boolean') fields.followNext = req.body.followNext

    const item = await DaysUntilItem.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!item) {
        res.status(404).json({ message: 'Counter not found' })
        return
    }
    res.json({ message: 'Saved', data: item })
}

export async function deleteDaysUntil(req: AuthRequest, res: Response) {
    const item = await DaysUntilItem.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Counter not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
