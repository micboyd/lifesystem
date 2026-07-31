import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import WorkoutLog, { IWorkoutLogExercise } from '../models/WorkoutLog'
import Workout from '../models/Workout'
import Exercise from '../models/Exercise'

/** Coerce a request value to a non-negative number, or undefined when absent/invalid. */
function toDuration(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Validate a YYYY-MM-DD date string. */
function isValidDate(raw: unknown): raw is string {
    return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
}

/**
 * Snapshot a library workout's exercises into log lines: resolve each exercise id
 * to its current library name, keeping the prescribed sets/reps and order, and
 * drop any exercise that no longer resolves.
 */
async function snapshotExercises(
    workout: { exercises: { exercise: Types.ObjectId; sets?: number; reps?: string }[] },
    userId: unknown
): Promise<IWorkoutLogExercise[]> {
    const ids = workout.exercises.map((e) => e.exercise)
    if (ids.length === 0) return []
    const found = await Exercise.find({ _id: { $in: ids }, user: userId }).select('_id name')
    const nameById = new Map(found.map((e) => [String(e._id), e.name]))
    const lines: IWorkoutLogExercise[] = []
    for (const e of workout.exercises) {
        const name = nameById.get(String(e.exercise))
        if (!name) continue
        lines.push({
            name,
            ...(e.sets !== undefined ? { sets: e.sets } : {}),
            ...(e.reps !== undefined ? { reps: e.reps } : {}),
        })
    }
    return lines
}

/** GET /api/workout-logs — list the user's logged workouts, newest first. */
export async function listLogs(req: AuthRequest, res: Response) {
    const logs = await WorkoutLog.find({ user: req.userId }).sort({ date: -1, createdAt: -1 })
    res.json({ message: 'OK', data: logs })
}

/**
 * POST /api/workout-logs — record a completed workout. A log links to a library
 * workout, snapshotting its name and exercise lines so history is stable even if
 * the workout is later edited or deleted.
 */
export async function createLog(req: AuthRequest, res: Response) {
    const b = req.body

    if (typeof b.workout !== 'string' || !Types.ObjectId.isValid(b.workout)) {
        res.status(400).json({ message: 'A valid workout is required' })
        return
    }
    const src = await Workout.findOne({ _id: b.workout, user: req.userId })
    if (!src) {
        res.status(404).json({ message: 'Workout not found' })
        return
    }
    if (!isValidDate(b.date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const name = typeof b.name === 'string' && b.name.trim() ? b.name.trim() : src.name

    const log = await WorkoutLog.create({
        user: req.userId,
        workout: src._id,
        name,
        date: b.date,
        exercises: await snapshotExercises(src, req.userId),
        durationMin: toDuration(b.durationMin),
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    })
    res.status(201).json({ message: 'Created', data: log })
}

/** PUT /api/workout-logs/:id — update a logged workout's editable fields. */
export async function updateLog(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (isValidDate(b.date)) fields.date = b.date
    if (b.durationMin !== undefined) fields.durationMin = toDuration(b.durationMin)
    if (typeof b.notes === 'string') fields.notes = b.notes.trim() || undefined

    const log = await WorkoutLog.findOneAndUpdate(
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

/** DELETE /api/workout-logs/:id — remove a logged workout. */
export async function deleteLog(req: AuthRequest, res: Response) {
    const log = await WorkoutLog.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!log) {
        res.status(404).json({ message: 'Log not found' })
        return
    }
    res.json({ message: 'Deleted', data: log })
}
