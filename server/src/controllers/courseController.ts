import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Course from '../models/Course'

export async function listCourses(req: AuthRequest, res: Response) {
    const courses = await Course.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: courses })
}

export async function createCourse(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    const category = typeof req.body.category === 'string' ? req.body.category.trim() : ''
    const hours = Number(req.body.hours)

    if (!title) { res.status(400).json({ message: 'title is required' }); return }
    if (!category) { res.status(400).json({ message: 'category is required' }); return }
    if (!Number.isFinite(hours) || hours < 0) { res.status(400).json({ message: 'hours must be a non-negative number' }); return }

    const url = typeof req.body.url === 'string' ? req.body.url.trim() : undefined

    const last = await Course.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const course = await Course.create({ user: req.userId, title, hours, category, url, order })
    res.status(201).json({ message: 'Created', data: course })
}

export async function updateCourse(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim()
    if (typeof req.body.category === 'string' && req.body.category.trim()) fields.category = req.body.category.trim()
    if (typeof req.body.hours === 'number' && req.body.hours >= 0) fields.hours = req.body.hours
    if (typeof req.body.url === 'string') fields.url = req.body.url.trim() || undefined
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const course = await Course.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!course) { res.status(404).json({ message: 'Course not found' }); return }
    res.json({ message: 'Saved', data: course })
}

export async function deleteCourse(req: AuthRequest, res: Response) {
    const course = await Course.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!course) { res.status(404).json({ message: 'Course not found' }); return }
    res.json({ message: 'Deleted', data: course })
}
