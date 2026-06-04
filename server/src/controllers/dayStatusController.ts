import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import DayStatus, { DAY_STATUSES, DATE_PATTERN, DayStatusType } from '../models/DayStatus'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

function isValidStatus(v: unknown): v is DayStatusType {
    return typeof v === 'string' && (DAY_STATUSES as readonly string[]).includes(v)
}

/** GET /api/day-status?from=YYYY-MM-DD&to=YYYY-MM-DD — records overlapping the range. */
export async function listStatuses(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (!isValidDate(from) || !isValidDate(to)) {
        res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
        return
    }
    const statuses = await DayStatus.find({
        user: req.userId,
        startDate: { $lte: to },
        endDate: { $gte: from },
    }).sort({ startDate: 1 })
    res.json({ message: 'OK', data: statuses })
}

/** POST /api/day-status — create a new leave record. */
export async function createStatus(req: AuthRequest, res: Response) {
    const { startDate, endDate, status } = req.body
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
        res.status(400).json({ message: 'startDate and endDate must be YYYY-MM-DD' })
        return
    }
    if (startDate > endDate) {
        res.status(400).json({ message: 'startDate cannot be after endDate' })
        return
    }
    if (!isValidStatus(status)) {
        res.status(400).json({ message: `status must be one of: ${DAY_STATUSES.join(', ')}` })
        return
    }
    const record = await DayStatus.create({ user: req.userId, startDate, endDate, status })
    res.status(201).json({ message: 'Created', data: record })
}

/** PUT /api/day-status/:id — update an existing record. */
export async function updateStatus(req: AuthRequest, res: Response) {
    const { startDate, endDate, status } = req.body
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
        res.status(400).json({ message: 'startDate and endDate must be YYYY-MM-DD' })
        return
    }
    if (startDate > endDate) {
        res.status(400).json({ message: 'startDate cannot be after endDate' })
        return
    }
    if (!isValidStatus(status)) {
        res.status(400).json({ message: `status must be one of: ${DAY_STATUSES.join(', ')}` })
        return
    }
    const record = await DayStatus.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { startDate, endDate, status } },
        { new: true }
    )
    if (!record) {
        res.status(404).json({ message: 'Record not found' })
        return
    }
    res.json({ message: 'Saved', data: record })
}

/** DELETE /api/day-status/:id — remove a record. */
export async function deleteStatus(req: AuthRequest, res: Response) {
    const record = await DayStatus.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!record) {
        res.status(404).json({ message: 'Record not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
