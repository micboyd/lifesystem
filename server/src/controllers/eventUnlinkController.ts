import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import EventUnlink from '../models/EventUnlink'

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 100

/** GET /api/finances/event-unlinks — every payment ↔ event match the user has unticked. */
export async function listEventUnlinks(req: AuthRequest, res: Response) {
    const rows = await EventUnlink.find({ user: req.userId }).select('itemId eventKey -_id').lean()
    res.json({ message: 'OK', data: rows.map((r) => ({ itemId: r.itemId, eventKey: r.eventKey })) })
}

/** POST /api/finances/event-unlinks { itemId, eventKey, linked } — untick (linked: false) or re-tick a match. */
export async function setEventUnlink(req: AuthRequest, res: Response) {
    const { itemId, eventKey, linked } = req.body ?? {}
    if (!isId(itemId) || !isId(eventKey) || typeof linked !== 'boolean')
        return res.status(400).json({ message: 'itemId, eventKey and linked are required' })
    if (linked) await EventUnlink.deleteOne({ user: req.userId, itemId, eventKey })
    else
        await EventUnlink.updateOne(
            { user: req.userId, itemId, eventKey },
            { $setOnInsert: { user: req.userId, itemId, eventKey } },
            { upsert: true }
        )
    res.json({ message: 'OK', data: { itemId, eventKey, linked } })
}
