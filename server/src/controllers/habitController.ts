import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import HabitDef, { HABIT_PARTS, type HabitPart } from '../models/HabitDef'
import HabitLog, { DATE_PATTERN } from '../models/HabitLog'
import Goal from '../models/Goal'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

function isPart(v: unknown): v is HabitPart {
    return typeof v === 'string' && (HABIT_PARTS as readonly string[]).includes(v)
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
    const icon =
        typeof req.body.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : undefined

    const part = isPart(req.body.part) ? req.body.part : undefined

    // Place at the end of the current list
    const last = await HabitDef.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const habit = await HabitDef.create({ user: req.userId, name, description, icon, part, order })
    res.status(201).json({ message: 'Created', data: habit })
}

/** PUT /api/habits/:id — update name, description, icon, time of day, order or active flag. */
export async function updateHabit(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
        fields.name = req.body.name.trim()
    }
    if (typeof req.body.description === 'string') {
        fields.description = req.body.description.trim() || undefined
    }
    if (typeof req.body.icon === 'string') {
        fields.icon = req.body.icon.trim() || undefined
    }
    if (req.body.icon === null) {
        fields.icon = undefined
    }
    if (typeof req.body.active === 'boolean') {
        fields.active = req.body.active
    }
    // `part: null` takes it back to any time.
    const unset: Record<string, ''> = {}
    if (isPart(req.body.part)) fields.part = req.body.part
    else if (req.body.part === null) unset.part = ''
    if (typeof req.body.order === 'number') {
        fields.order = req.body.order
    }

    const habit = await HabitDef.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
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
    // A goal shouldn't keep pointing at a habit that no longer exists.
    await Goal.updateMany({ user: req.userId }, { $pull: { linkedHabits: habit._id } })
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
