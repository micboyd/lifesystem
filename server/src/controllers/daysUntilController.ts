import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import DaysUntilItem, { DAYS_UNTIL_COLORS, DaysUntilColor } from '../models/DaysUntilItem'
import { ISO_DATE_PATTERN } from '../models/DaysSinceItem'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && ISO_DATE_PATTERN.test(v)
}

function isValidColor(v: unknown): v is DaysUntilColor {
    return typeof v === 'string' && (DAYS_UNTIL_COLORS as readonly string[]).includes(v)
}

export async function listDaysUntil(req: AuthRequest, res: Response) {
    const items = await DaysUntilItem.find({ user: req.userId }).sort({ targetDate: 1, label: 1 })
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

    const item = await DaysUntilItem.create({
        user: req.userId,
        label,
        targetDate: req.body.targetDate,
        icon,
        color,
    })
    res.status(201).json({ message: 'Created', data: item })
}

export async function updateDaysUntil(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.label === 'string' && req.body.label.trim()) fields.label = req.body.label.trim()
    if (isValidDate(req.body.targetDate)) fields.targetDate = req.body.targetDate
    if (typeof req.body.icon === 'string' && req.body.icon.trim()) fields.icon = req.body.icon.trim()
    if (isValidColor(req.body.color)) fields.color = req.body.color

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
