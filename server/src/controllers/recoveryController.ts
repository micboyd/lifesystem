import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Recovery from '../models/Recovery'

/** Coerce a request value to a non-negative number, or a fallback if invalid. */
function toAmount(raw: unknown, fallback = 0): number {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** GET /api/recovery — list the user's recovery items in library order. */
export async function listRecovery(req: AuthRequest, res: Response) {
    const items = await Recovery.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: items })
}

/** POST /api/recovery — create an item, appended to the end of the library. */
export async function createRecovery(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await Recovery.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const item = await Recovery.create({
        user: req.userId,
        name,
        duration: toAmount(req.body.duration),
        purpose: typeof req.body.purpose === 'string' ? req.body.purpose.trim() || undefined : undefined,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || undefined : undefined,
        order,
    })
    res.status(201).json({ message: 'Created', data: item })
}

/** PUT /api/recovery/:id — update fields and/or reorder. */
export async function updateRecovery(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (b.duration !== undefined) fields.duration = toAmount(b.duration)
    if (typeof b.purpose === 'string') fields.purpose = b.purpose.trim() || undefined
    if (typeof b.notes === 'string') fields.notes = b.notes.trim() || undefined
    if (typeof b.order === 'number') fields.order = b.order

    const item = await Recovery.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!item) {
        res.status(404).json({ message: 'Recovery item not found' })
        return
    }
    res.json({ message: 'Saved', data: item })
}

/** DELETE /api/recovery/:id — remove a recovery item. */
export async function deleteRecovery(req: AuthRequest, res: Response) {
    const item = await Recovery.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Recovery item not found' })
        return
    }
    // Any plan entries pointing at this item are dropped at read time (the ref
    // no longer resolves), so there's nothing to clean up here.
    res.json({ message: 'Deleted', data: item })
}
