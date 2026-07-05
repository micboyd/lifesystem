import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import DaysSinceItem, {
    ISO_DATE_PATTERN,
    DAYS_SINCE_COLORS,
    DaysSinceColor,
} from '../models/DaysSinceItem'
import DaysSinceCheckIn from '../models/DaysSinceCheckIn'
import { daysBetween } from '../lib/dates'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

function isValidIntensity(v: unknown): v is number {
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

function isValidColor(v: unknown): v is DaysSinceColor {
    return typeof v === 'string' && (DAYS_SINCE_COLORS as readonly string[]).includes(v)
}

export async function listDaysSince(req: AuthRequest, res: Response) {
    const items = await DaysSinceItem.find({ user: req.userId }).sort({ startDate: 1, label: 1 })
    res.json({ message: 'OK', data: items })
}

export async function createDaysSince(req: AuthRequest, res: Response) {
    const label = typeof req.body.label === 'string' ? req.body.label.trim() : ''
    if (!label) {
        res.status(400).json({ message: 'label is required' })
        return
    }
    if (!isValidDate(req.body.startDate)) {
        res.status(400).json({ message: 'startDate must be YYYY-MM-DD' })
        return
    }

    const icon =
        typeof req.body.icon === 'string' && req.body.icon.trim()
            ? req.body.icon.trim()
            : 'fa-solid fa-fire'
    const color = isValidColor(req.body.color) ? req.body.color : 'emerald'

    const item = await DaysSinceItem.create({
        user: req.userId,
        label,
        startDate: req.body.startDate,
        icon,
        color,
    })
    res.status(201).json({ message: 'Created', data: item })
}

export async function updateDaysSince(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.label === 'string' && req.body.label.trim()) fields.label = req.body.label.trim()
    if (isValidDate(req.body.startDate)) fields.startDate = req.body.startDate
    if (typeof req.body.icon === 'string' && req.body.icon.trim()) fields.icon = req.body.icon.trim()
    if (isValidColor(req.body.color)) fields.color = req.body.color

    const item = await DaysSinceItem.findOneAndUpdate(
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

export async function deleteDaysSince(req: AuthRequest, res: Response) {
    const item = await DaysSinceItem.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Counter not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}

export async function resetDaysSince(req: AuthRequest, res: Response) {
    if (!isValidDate(req.body.startDate)) {
        res.status(400).json({ message: 'startDate must be YYYY-MM-DD' })
        return
    }
    const reason =
        typeof req.body.reason === 'string' && req.body.reason.trim()
            ? req.body.reason.trim()
            : undefined

    const item = await DaysSinceItem.findOne({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Counter not found' })
        return
    }

    const days = daysBetween(item.startDate, req.body.startDate)
    item.history.push({ startDate: item.startDate, endDate: req.body.startDate, days, reason })
    item.bestStreakDays = Math.max(item.bestStreakDays, days)
    item.startDate = req.body.startDate
    await item.save()

    res.json({ message: 'Reset', data: item })
}

export async function listCheckIns(req: AuthRequest, res: Response) {
    const since = isValidDate(req.query.since) ? req.query.since : undefined
    const filter: Record<string, unknown> = { user: req.userId }
    if (since) filter.date = { $gte: since }

    const checkIns = await DaysSinceCheckIn.find(filter).sort({ date: 1 })
    res.json({ message: 'OK', data: checkIns })
}

export async function upsertCheckIn(req: AuthRequest, res: Response) {
    const item = await DaysSinceItem.findOne({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Counter not found' })
        return
    }
    if (!isValidDate(req.body.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    if (!isValidIntensity(req.body.intensity)) {
        res.status(400).json({ message: 'intensity must be an integer 1-5' })
        return
    }
    const note =
        typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim() : undefined

    const checkIn = await DaysSinceCheckIn.findOneAndUpdate(
        { user: req.userId, item: item._id, date: req.body.date },
        { $set: { intensity: req.body.intensity, note } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.json({ message: 'Saved', data: checkIn })
}
