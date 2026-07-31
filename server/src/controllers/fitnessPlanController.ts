import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FitnessPlanEntry, { FITNESS_PLAN_KINDS, FitnessPlanKind } from '../models/FitnessPlanEntry'
import Workout from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

function isKind(v: unknown): v is FitnessPlanKind {
    return typeof v === 'string' && FITNESS_PLAN_KINDS.includes(v as FitnessPlanKind)
}

/** True when the entry's referenced library item still exists after populate. */
function isResolved(e: { kind: FitnessPlanKind; workout: unknown; session: unknown }): boolean {
    return e.kind === 'workout' ? !!e.workout : !!e.session
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
        .sort({ date: 1, kind: 1, order: 1, createdAt: 1 })
        .populate('workout')
        .populate('session')

    res.json({ message: 'OK', data: entries.filter(isResolved) })
}

/** POST /api/fitness-plan — place a workout or session onto a day. */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, kind, item: itemId } = req.body
    if (!isDate(date) || !isKind(kind) || typeof itemId !== 'string') {
        res.status(400).json({ message: 'date, kind and item are required' })
        return
    }

    // The referenced library item must exist and belong to the requesting user.
    if (kind === 'workout') {
        const workout = await Workout.findOne({ _id: itemId, user: req.userId })
        if (!workout) {
            res.status(404).json({ message: 'Workout not found' })
            return
        }
    } else {
        const session = await ConditioningSession.findOne({ _id: itemId, user: req.userId })
        if (!session) {
            res.status(404).json({ message: 'Session not found' })
            return
        }
    }

    const last = await FitnessPlanEntry.findOne({ user: req.userId, date, kind }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await FitnessPlanEntry.create({
        user: req.userId,
        date,
        kind,
        workout: kind === 'workout' ? itemId : null,
        session: kind === 'conditioning' ? itemId : null,
        order,
    })
    await entry.populate('workout')
    await entry.populate('session')
    res.status(201).json({ message: 'Created', data: entry })
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
