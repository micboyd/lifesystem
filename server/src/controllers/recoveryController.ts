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

/**
 * POST /api/recovery/import — bulk-import recovery items from a pasted JSON
 * document. Accepts either a bare array of items or an object with a `recovery`
 * array. Validation is all-or-nothing: if any item is malformed the whole
 * import is rejected with a per-item reason, so a partial import never surprises
 * the user. Everything valid is appended to the end of the library in order.
 */
export async function importRecovery(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const rawList = Array.isArray(body)
        ? body
        : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).recovery)
          ? ((body as Record<string, unknown>).recovery as unknown[])
          : null

    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of recovery items, or an object with a "recovery" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No recovery items found to import.' })
        return
    }

    const errors: string[] = []
    const normalised = rawList.map((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Recovery ${i + 1}: must be an object`)
            return null
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Recovery ${i + 1}: "name" is required`)
            return null
        }
        return {
            user: req.userId,
            name,
            duration: toAmount(item.duration),
            purpose: typeof item.purpose === 'string' ? item.purpose.trim() || undefined : undefined,
            notes: typeof item.notes === 'string' ? item.notes.trim() || undefined : undefined,
        }
    })

    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const last = await Recovery.findOne({ user: req.userId }).sort({ order: -1 })
    let order = last ? last.order + 1 : 0
    const docs = normalised.map((d) => ({ ...d!, order: order++ }))

    const created = await Recovery.insertMany(docs)
    res.status(201).json({
        message: `Imported ${created.length} ${created.length === 1 ? 'recovery item' : 'recovery items'}`,
        data: created,
    })
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
