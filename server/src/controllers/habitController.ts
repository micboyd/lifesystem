import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import HabitDef from '../models/HabitDef'
import HabitLog, { DATE_PATTERN } from '../models/HabitLog'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

// ─── Definitions ────────────────────────────────────────────────────────────

/** GET /api/habits — list all active habit definitions, ordered. */
export async function listHabits(req: AuthRequest, res: Response) {
    const habits = await HabitDef.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: habits })
}

/** POST /api/habits — create a new habit definition. */
export async function createHabit(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const description =
        typeof req.body.description === 'string' ? req.body.description.trim() : undefined

    // Place at the end of the current list
    const last = await HabitDef.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const habit = await HabitDef.create({ user: req.userId, name, description, order })
    res.status(201).json({ message: 'Created', data: habit })
}

/** PUT /api/habits/:id — update name, description, or active flag. */
export async function updateHabit(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
        fields.name = req.body.name.trim()
    }
    if (typeof req.body.description === 'string') {
        fields.description = req.body.description.trim() || undefined
    }
    if (typeof req.body.active === 'boolean') {
        fields.active = req.body.active
    }
    if (typeof req.body.order === 'number') {
        fields.order = req.body.order
    }

    const habit = await HabitDef.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!habit) {
        res.status(404).json({ message: 'Habit not found' })
        return
    }
    res.json({ message: 'Saved', data: habit })
}

/** DELETE /api/habits/:id — permanently remove a habit definition and its logs. */
export async function deleteHabit(req: AuthRequest, res: Response) {
    const habit = await HabitDef.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!habit) {
        res.status(404).json({ message: 'Habit not found' })
        return
    }
    await HabitLog.deleteMany({ habit: req.params.id })
    res.json({ message: 'Deleted', data: habit })
}

// ─── Logs ────────────────────────────────────────────────────────────────────

/** GET /api/habits/logs?from=YYYY-MM-DD&to=YYYY-MM-DD — fetch logs for a date range. */
export async function listLogs(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (!isValidDate(from) || !isValidDate(to)) {
        res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
        return
    }
    const logs = await HabitLog.find({
        user: req.userId,
        date: { $gte: from, $lte: to },
    })
    res.json({ message: 'OK', data: logs })
}

/**
 * PUT /api/habits/:id/logs/:date — mark a habit as completed for a date (upsert).
 * DELETE /api/habits/:id/logs/:date — remove the completion (uncheck).
 */
export async function setLog(req: AuthRequest, res: Response) {
    const { id, date } = req.params
    if (!isValidDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    const habit = await HabitDef.findOne({ _id: id, user: req.userId })
    if (!habit) {
        res.status(404).json({ message: 'Habit not found' })
        return
    }
    const log = await HabitLog.findOneAndUpdate(
        { user: req.userId, habit: id, date },
        { $set: { completed: true } },
        { upsert: true, new: true }
    )
    res.json({ message: 'Logged', data: log })
}

export async function removeLog(req: AuthRequest, res: Response) {
    const { id, date } = req.params
    if (!isValidDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }
    await HabitLog.findOneAndDelete({ user: req.userId, habit: id, date })
    res.json({ message: 'Removed' })
}
