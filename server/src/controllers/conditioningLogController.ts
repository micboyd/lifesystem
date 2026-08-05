import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import ConditioningLog from '../models/ConditioningLog'
import ConditioningSession, {
    CONDITIONING_CATEGORIES,
    ConditioningCategory,
} from '../models/ConditioningSession'

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

/** Clamp an optional RPE to 1–10, or return undefined when absent/invalid. */
function toRpe(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return undefined
    return Math.min(10, Math.max(1, Math.round(n)))
}

/** Validate a YYYY-MM-DD date string. */
function isValidDate(raw: unknown): raw is string {
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
}

/** Normalise the rounds snapshot, dropping malformed or unnamed entries. */
function toRounds(raw: unknown): { name: string; done: number; target: number }[] | undefined {
    if (!Array.isArray(raw)) return undefined
    const out: { name: string; done: number; target: number }[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const r = item as Record<string, unknown>
        const name = typeof r.name === 'string' ? r.name.trim() : ''
        const target = Math.floor(toAmount(r.target, 0))
        if (!name || target < 1) continue
        const done = Math.min(target, Math.max(0, Math.floor(toAmount(r.done, 0))))
        out.push({ name, done, target })
    }
    return out.length > 0 ? out : undefined
}

/** GET /api/conditioning-logs — list the user's logged sessions, newest first. */
export async function listLogs(req: AuthRequest, res: Response) {
    const logs = await ConditioningLog.find({ user: req.userId }).sort({ date: -1, createdAt: -1 })
    res.json({ message: 'OK', data: logs })
}

/** POST /api/conditioning-logs — record a completed session. */
export async function createLog(req: AuthRequest, res: Response) {
    const b = req.body

    // A log can link to a library session (which seeds name/category) or stand
    // alone with a typed name.
    let session: Types.ObjectId | null = null
    let name = typeof b.name === 'string' ? b.name.trim() : ''
    let category = toCategory(b.category)

    if (typeof b.session === 'string' && Types.ObjectId.isValid(b.session)) {
        const src = await ConditioningSession.findOne({ _id: b.session, user: req.userId })
        if (src) {
            session = src._id as Types.ObjectId
            if (!name) name = src.name
            // A category not explicitly supplied inherits the session's.
            if (b.category === undefined) category = src.category
        }
    }

    if (!name) {
        res.status(400).json({ message: 'name (or a valid session) is required' })
        return
    }
    if (!isValidDate(b.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const log = await ConditioningLog.create({
        user: req.userId,
        session,
        name,
        category,
        date: b.date,
        duration: toAmount(b.duration),
        rpe: toRpe(b.rpe),
        rounds: toRounds(b.rounds),
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    })
    res.status(201).json({ message: 'Created', data: log })
}

/** PUT /api/conditioning-logs/:id — update a logged session. */
export async function updateLog(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (b.category !== undefined) fields.category = toCategory(b.category)
    if (isValidDate(b.date)) fields.date = b.date
    if (b.duration !== undefined) fields.duration = toAmount(b.duration)
    if (b.rpe !== undefined) fields.rpe = toRpe(b.rpe)
    if (b.rounds !== undefined) fields.rounds = toRounds(b.rounds)
    if (typeof b.notes === 'string') fields.notes = b.notes.trim() || undefined

    const log = await ConditioningLog.findOneAndUpdate(
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

/** DELETE /api/conditioning-logs/:id — remove a logged session. */
export async function deleteLog(req: AuthRequest, res: Response) {
    const log = await ConditioningLog.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!log) {
        res.status(404).json({ message: 'Log not found' })
        return
    }
    res.json({ message: 'Deleted', data: log })
}
