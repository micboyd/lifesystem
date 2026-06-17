import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Course from '../models/Course'

/** Coerce a request value to a non-negative number, or undefined if invalid. */
function toHours(raw: unknown): number | undefined {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** GET /api/courses — list the user's courses in priority order. */
export async function listCourses(req: AuthRequest, res: Response) {
    const courses = await Course.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: courses })
}

/** POST /api/courses — create a course, appended to the end of the queue. */
export async function createCourse(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const requiredHours = toHours(req.body.requiredHours)
    if (requiredHours === undefined) {
        res.status(400).json({ message: 'requiredHours must be a non-negative number' })
        return
    }
    const completedHours = toHours(req.body.completedHours) ?? 0
    const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() || undefined : undefined

    const last = await Course.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const course = await Course.create({
        user: req.userId,
        name,
        requiredHours,
        completedHours,
        order,
        notes,
    })
    res.status(201).json({ message: 'Created', data: course })
}

/** PUT /api/courses/:id — update fields and/or reorder. */
export async function updateCourse(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    const requiredHours = toHours(req.body.requiredHours)
    if (requiredHours !== undefined) fields.requiredHours = requiredHours
    const completedHours = toHours(req.body.completedHours)
    if (completedHours !== undefined) fields.completedHours = completedHours
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.notes === 'string') fields.notes = req.body.notes.trim() || undefined

    const course = await Course.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!course) {
        res.status(404).json({ message: 'Course not found' })
        return
    }
    res.json({ message: 'Saved', data: course })
}

/** DELETE /api/courses/:id — remove a course. */
export async function deleteCourse(req: AuthRequest, res: Response) {
    const course = await Course.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!course) {
        res.status(404).json({ message: 'Course not found' })
        return
    }
    res.json({ message: 'Deleted', data: course })
}
