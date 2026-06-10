import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Task, { DATE_PATTERN } from '../models/Task'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

/** GET /api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listTasks(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    const query: Record<string, unknown> = { user: req.userId }

    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }
        query.date = { $gte: from, $lte: to }
    }

    const tasks = await Task.find(query).sort({ date: 1, order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: tasks })
}

/** POST /api/tasks — create a task for a given date. */
export async function createTask(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) {
        res.status(400).json({ message: 'title is required' })
        return
    }
    if (!isValidDate(req.body.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    // Place at the end of that day's list
    const last = await Task.findOne({ user: req.userId, date: req.body.date }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const task = await Task.create({ user: req.userId, date: req.body.date, title, order })
    res.status(201).json({ message: 'Created', data: task })
}

/** PUT /api/tasks/:id — update title, completed flag, or order. */
export async function updateTask(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim())
        fields.title = req.body.title.trim()
    if (typeof req.body.completed === 'boolean') fields.completed = req.body.completed
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const task = await Task.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!task) {
        res.status(404).json({ message: 'Task not found' })
        return
    }
    res.json({ message: 'Saved', data: task })
}

/** DELETE /api/tasks/:id */
export async function deleteTask(req: AuthRequest, res: Response) {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!task) {
        res.status(404).json({ message: 'Task not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
