import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Birthday, { MM_DD_PATTERN } from '../models/Birthday'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && MM_DD_PATTERN.test(v)
}

export async function listBirthdays(req: AuthRequest, res: Response) {
    const birthdays = await Birthday.find({ user: req.userId }).sort({ date: 1, name: 1 })
    res.json({ message: 'OK', data: birthdays })
}

export async function createBirthday(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    if (!isValidDate(req.body.date)) {
        res.status(400).json({ message: 'date must be MM-DD' })
        return
    }
    const birthday = await Birthday.create({ user: req.userId, name, date: req.body.date })
    res.status(201).json({ message: 'Created', data: birthday })
}

export async function updateBirthday(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    if (isValidDate(req.body.date)) fields.date = req.body.date

    const birthday = await Birthday.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!birthday) {
        res.status(404).json({ message: 'Birthday not found' })
        return
    }
    res.json({ message: 'Saved', data: birthday })
}

export async function deleteBirthday(req: AuthRequest, res: Response) {
    const birthday = await Birthday.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!birthday) {
        res.status(404).json({ message: 'Birthday not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
