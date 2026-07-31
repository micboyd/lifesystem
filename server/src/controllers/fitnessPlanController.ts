import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FitnessPlanEntry, {
    FITNESS_PLAN_KINDS,
    FitnessPlanKind,
    FITNESS_PLAN_PARTS,
    FitnessPlanPart,
} from '../models/FitnessPlanEntry'
import Workout from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'
import Recovery from '../models/Recovery'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

function isKind(v: unknown): v is FitnessPlanKind {
    return typeof v === 'string' && FITNESS_PLAN_KINDS.includes(v as FitnessPlanKind)
}

function isPart(v: unknown): v is FitnessPlanPart {
    return typeof v === 'string' && FITNESS_PLAN_PARTS.includes(v as FitnessPlanPart)
}

/** Keep the slot if recognised, else fall back to the morning slot. */
function toPart(v: unknown): FitnessPlanPart {
    return FITNESS_PLAN_PARTS.includes(v as FitnessPlanPart)
        ? (v as FitnessPlanPart)
        : FITNESS_PLAN_PARTS[0]
}

/** True when the entry's referenced library item still exists after populate. */
function isResolved(e: {
    kind: FitnessPlanKind
    workout: unknown
    session: unknown
    recovery: unknown
}): boolean {
    if (e.kind === 'workout') return !!e.workout
    if (e.kind === 'conditioning') return !!e.session
    return !!e.recovery
}

/**
 * GET /api/fitness-plan?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List a user's planned training in a date range, with each item populated so the
 * client can render it. Entries whose library item was deleted are dropped.
 */
export async function listEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }

    const entries = await FitnessPlanEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
        .sort({ date: 1, order: 1, createdAt: 1 })
        .populate('workout')
        .populate('session')
        .populate('recovery')

    res.json({ message: 'OK', data: entries.filter(isResolved) })
}

/** POST /api/fitness-plan — place a workout, session or recovery item onto a day. */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, kind, item: itemId } = req.body
    if (!isDate(date) || !isKind(kind) || typeof itemId !== 'string') {
        res.status(400).json({ message: 'date, kind and item are required' })
        return
    }
    const part = toPart(req.body.part)

    // The referenced library item must exist and belong to the requesting user.
    if (kind === 'workout') {
        const workout = await Workout.findOne({ _id: itemId, user: req.userId })
        if (!workout) {
            res.status(404).json({ message: 'Workout not found' })
            return
        }
    } else if (kind === 'conditioning') {
        const session = await ConditioningSession.findOne({ _id: itemId, user: req.userId })
        if (!session) {
            res.status(404).json({ message: 'Session not found' })
            return
        }
    } else {
        const recovery = await Recovery.findOne({ _id: itemId, user: req.userId })
        if (!recovery) {
            res.status(404).json({ message: 'Recovery item not found' })
            return
        }
    }

    const last = await FitnessPlanEntry.findOne({ user: req.userId, date, part }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await FitnessPlanEntry.create({
        user: req.userId,
        date,
        part,
        kind,
        workout: kind === 'workout' ? itemId : null,
        session: kind === 'conditioning' ? itemId : null,
        recovery: kind === 'recovery' ? itemId : null,
        order,
    })
    await entry.populate('workout')
    await entry.populate('session')
    await entry.populate('recovery')
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * PATCH /api/fitness-plan/:id — move an entry to a different slot of its day.
 * Only the `part` changes; the entry appends to the end of the target slot.
 */
export async function updateEntry(req: AuthRequest, res: Response) {
    const { part } = req.body
    if (!isPart(part)) {
        res.status(400).json({ message: 'part (morning|afternoon|evening) is required' })
        return
    }

    const entry = await FitnessPlanEntry.findOne({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }

    if (entry.part !== part) {
        const last = await FitnessPlanEntry.findOne({
            user: req.userId,
            date: entry.date,
            part,
        }).sort({ order: -1 })
        entry.part = part
        entry.order = last ? last.order + 1 : 0
        await entry.save()
    }

    await entry.populate('workout')
    await entry.populate('session')
    await entry.populate('recovery')
    res.json({ message: 'Updated', data: entry })
}

/** DELETE /api/fitness-plan/:id — remove a planned item. */
export async function deleteEntry(req: AuthRequest, res: Response) {
    const entry = await FitnessPlanEntry.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted', data: entry })
}
