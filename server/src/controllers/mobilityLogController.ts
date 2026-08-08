import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import MobilityLog from '../models/MobilityLog'
import Mobility from '../models/Mobility'

/** Coerce a request value to a non-negative number, or a fallback if invalid. */
function toAmount(raw: unknown, fallback = 0): number {
    const n =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : NaN
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Validate a YYYY-MM-DD date string. */
function isValidDate(raw: unknown): raw is string {
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
}

/** GET /api/mobility-logs — list the user's logged routines, newest first. */
export async function listLogs(req: AuthRequest, res: Response) {
    const logs = await MobilityLog.find({ user: req.userId }).sort({ date: -1, createdAt: -1 })
    res.json({ message: 'OK', data: logs })
}

/**
 * POST /api/mobility-logs — record a completed routine. A log links to a library
 * routine (which seeds the name) or stands alone with a typed name.
 */
export async function createLog(req: AuthRequest, res: Response) {
    const b = req.body

    let mobility: Types.ObjectId | null = null
    let name = typeof b.name === 'string' ? b.name.trim() : ''
    let duration = b.duration

    if (typeof b.mobility === 'string' && Types.ObjectId.isValid(b.mobility)) {
        const src = await Mobility.findOne({ _id: b.mobility, user: req.userId })
        if (src) {
            mobility = src._id as Types.ObjectId
            if (!name) name = src.name
            // A duration not explicitly supplied inherits the routine's.
            if (b.duration === undefined) duration = src.duration
        }
    }

    if (!name) {
        res.status(400).json({ message: 'name (or a valid mobility routine) is required' })
        return
    }
    if (!isValidDate(b.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const log = await MobilityLog.create({
        user: req.userId,
        mobility,
        name,
        date: b.date,
        duration: toAmount(duration),
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    })
    res.status(201).json({ message: 'Created', data: log })
}

/** PUT /api/mobility-logs/:id — update a logged routine. */
export async function updateLog(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (isValidDate(b.date)) fields.date = b.date
    if (b.duration !== undefined) fields.duration = toAmount(b.duration)
    if (typeof b.notes === 'string') fields.notes = b.notes.trim() || undefined

    const log = await MobilityLog.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!log) {
        res.status(404).json({ message: 'Log not found' })
        return
    }
    res.json({ message: 'Saved', data: log })
}

/** DELETE /api/mobility-logs/:id — remove a logged routine. */
export async function deleteLog(req: AuthRequest, res: Response) {
    const log = await MobilityLog.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!log) {
        res.status(404).json({ message: 'Log not found' })
        return
    }
    res.json({ message: 'Deleted', data: log })
}
