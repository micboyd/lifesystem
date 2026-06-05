import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Timebox, { DATE_PATTERN, TIME_PATTERN } from '../models/Timebox'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

function isValidTime(v: unknown): v is string {
    return typeof v === 'string' && TIME_PATTERN.test(v)
}

/** GET /api/timeboxes?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listTimeboxes(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    const query: Record<string, unknown> = { user: req.userId }
    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }
        query.date = { $gte: from, $lte: to }
    }
    const items = await Timebox.find(query).sort({ date: 1, startTime: 1 })
    res.json({ message: 'OK', data: items })
}

function validateBody(body: Record<string, unknown>): string | { title: string; startTime: string; endTime: string } {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) return 'title is required'
    if (!isValidTime(body.startTime) || !isValidTime(body.endTime)) return 'startTime and endTime must be HH:MM'
    if (body.endTime <= body.startTime) return 'endTime must be after startTime'
    return { title, startTime: body.startTime, endTime: body.endTime }
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
        // Two ranges overlap when each starts before the other ends.
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
    if (await hasOverlap(req.userId, req.body.date, fields.startTime, fields.endTime)) {
        res.status(409).json({ message: 'That time overlaps another block' })
        return
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
    if (await hasOverlap(req.userId, existing.date, fields.startTime, fields.endTime, req.params.id)) {
        res.status(409).json({ message: 'That time overlaps another block' })
        return
    }
    existing.set(fields)
    await existing.save()
    res.json({ message: 'Saved', data: existing })
}

/** DELETE /api/timeboxes/:id */
export async function deleteTimebox(req: AuthRequest, res: Response) {
    const item = await Timebox.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Timebox not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
