import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import ConditioningSession, {
    CONDITIONING_CATEGORIES,
    ConditioningCategory,
    ISessionPart,
} from '../models/ConditioningSession'
import ConditioningLog from '../models/ConditioningLog'

/** Coerce a request value to a non-negative number, or a fallback if invalid. */
function toAmount(raw: unknown, fallback = 0): number {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Keep the category if recognised, else fall back to the first option. */
function toCategory(raw: unknown): ConditioningCategory {
    return CONDITIONING_CATEGORIES.includes(raw as ConditioningCategory)
        ? (raw as ConditioningCategory)
        : CONDITIONING_CATEGORIES[0]
}

/** Normalise the parts array, dropping entries without a name. */
function toParts(raw: unknown): ISessionPart[] {
    if (!Array.isArray(raw)) return []
    const out: ISessionPart[] = []
    for (const raw_item of raw) {
        if (!raw_item || typeof raw_item !== 'object') continue
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const detail = typeof item.detail === 'string' ? item.detail.trim() || undefined : undefined
        const roundsRaw = typeof item.rounds === 'number' ? Math.floor(item.rounds) : NaN
        const rounds = Number.isFinite(roundsRaw) && roundsRaw >= 1 ? roundsRaw : undefined
        const roundLabel =
            rounds && typeof item.roundLabel === 'string' ? item.roundLabel.trim() || undefined : undefined
        out.push({ name, detail, rounds, roundLabel })
    }
    return out
}

/** GET /api/conditioning — list the user's sessions in library order. */
export async function listSessions(req: AuthRequest, res: Response) {
    const sessions = await ConditioningSession.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: sessions })
}

/** POST /api/conditioning — create a session, appended to the end of the library. */
export async function createSession(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await ConditioningSession.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const session = await ConditioningSession.create({
        user: req.userId,
        name,
        duration: toAmount(req.body.duration),
        category: toCategory(req.body.category),
        purpose: typeof req.body.purpose === 'string' ? req.body.purpose.trim() || undefined : undefined,
        parts: toParts(req.body.parts),
        howToUse: typeof req.body.howToUse === 'string' ? req.body.howToUse.trim() || undefined : undefined,
        order,
    })
    res.status(201).json({ message: 'Created', data: session })
}

/** PUT /api/conditioning/:id — update fields and/or reorder. */
export async function updateSession(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (b.duration !== undefined) fields.duration = toAmount(b.duration)
    if (b.category !== undefined) fields.category = toCategory(b.category)
    if (typeof b.purpose === 'string') fields.purpose = b.purpose.trim() || undefined
    if (Array.isArray(b.parts)) fields.parts = toParts(b.parts)
    if (typeof b.howToUse === 'string') fields.howToUse = b.howToUse.trim() || undefined
    if (typeof b.order === 'number') fields.order = b.order

    const session = await ConditioningSession.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!session) {
        res.status(404).json({ message: 'Session not found' })
        return
    }
    res.json({ message: 'Saved', data: session })
}

/**
 * POST /api/conditioning/import — bulk-create sessions from a pasted JSON document.
 *
 * Accepts either a bare array of session objects or an object with a `sessions`
 * array. Validation is all-or-nothing: if any item is malformed the whole import
 * is rejected with a per-item reason.
 */
export async function importSessions(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const rawList = Array.isArray(body)
        ? body
        : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).sessions)
          ? ((body as Record<string, unknown>).sessions as unknown[])
          : null

    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of sessions, or an object with a "sessions" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No sessions found to import.' })
        return
    }

    const errors: string[] = []
    const normalised = rawList.map((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Session ${i + 1}: must be an object`)
            return null
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Session ${i + 1}: "name" is required`)
            return null
        }
        return {
            user: req.userId,
            name,
            duration: toAmount(item.duration),
            category: toCategory(item.category),
            purpose: typeof item.purpose === 'string' ? item.purpose.trim() || undefined : undefined,
            parts: toParts(item.parts),
            howToUse: typeof item.howToUse === 'string' ? item.howToUse.trim() || undefined : undefined,
        }
    })

    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const last = await ConditioningSession.findOne({ user: req.userId }).sort({ order: -1 })
    let order = last ? last.order + 1 : 0
    const docs = normalised.map((d) => ({ ...d!, order: order++ }))

    const created = await ConditioningSession.insertMany(docs)
    res.status(201).json({
        message: `Imported ${created.length} ${created.length === 1 ? 'session' : 'sessions'}`,
        data: created,
    })
}

/** DELETE /api/conditioning/:id — remove a session. */
export async function deleteSession(req: AuthRequest, res: Response) {
    const session = await ConditioningSession.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!session) {
        res.status(404).json({ message: 'Session not found' })
        return
    }
    // Existing completion logs keep their name/category snapshot; just unlink them.
    await ConditioningLog.updateMany(
        { user: req.userId, session: session._id },
        { $set: { session: null } }
    )
    res.json({ message: 'Deleted', data: session })
}
