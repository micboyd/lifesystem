import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import WorkoutLog, { IWorkoutLogExercise, ILoggedSet } from '../models/WorkoutLog'
import Workout from '../models/Workout'
import Exercise from '../models/Exercise'

/** Coerce a request value to a non-negative number, or undefined when absent/invalid. */
function toDuration(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Sanitise the client's per-exercise logged sets. Input is an array parallel to
 * the log's exercises: entry i is the sets performed for exercise i. Each set
 * keeps a non-negative weight (kg) and/or reps; a set with neither is dropped,
 * and an exercise with no surviving sets yields `undefined` (no loggedSets).
 */
function sanitizeLoggedSets(raw: unknown): (ILoggedSet[] | undefined)[] {
    if (!Array.isArray(raw)) return []
    return raw.map((sets) => {
        if (!Array.isArray(sets)) return undefined
        const clean: ILoggedSet[] = []
        for (const s of sets) {
            if (!s || typeof s !== 'object') continue
            const weight = toDuration((s as Record<string, unknown>).weight)
            const reps = toDuration((s as Record<string, unknown>).reps)
            if (weight === undefined && reps === undefined) continue
            clean.push({
                ...(weight !== undefined ? { weight } : {}),
                ...(reps !== undefined ? { reps } : {}),
            })
        }
        return clean.length ? clean : undefined
    })
}

/**
 * Overlay client-supplied logged sets onto snapshotted exercise lines, aligned by
 * index. When `raw` isn't an array (e.g. a quick "Done" with no weights) the lines
 * pass through untouched; otherwise each line's loggedSets is set or cleared to
 * match, so re-saving an edited log with everything blank removes the weights.
 */
function applyLoggedSets(lines: IWorkoutLogExercise[], raw: unknown): IWorkoutLogExercise[] {
    if (!Array.isArray(raw)) return lines
    const perExercise = sanitizeLoggedSets(raw)
    return lines.map((line, i) => {
        const { loggedSets: _prev, ...rest } = line
        const sets = perExercise[i]
        return sets ? { ...rest, loggedSets: sets } : rest
    })
}

/**
 * Overlay mid-session swaps onto snapshotted lines, aligned by index the same way
 * logged sets are. Entry i is the library exercise id actually performed for line
 * i, or null when it was performed as prescribed. The replacement's current name
 * is written into the line and the prescribed one kept as `substitutedFor`, so the
 * record says what was done without losing what was planned.
 */
async function applySubstitutions(
    lines: IWorkoutLogExercise[],
    raw: unknown,
    userId: unknown
): Promise<IWorkoutLogExercise[]> {
    if (!Array.isArray(raw)) return lines

    const ids = raw.filter(
        (id): id is string => typeof id === 'string' && Types.ObjectId.isValid(id)
    )
    if (ids.length === 0) return lines

    const found = await Exercise.find({ _id: { $in: ids }, user: userId }).select('_id name')
    const nameById = new Map(found.map((e) => [String(e._id), e.name]))

    return lines.map((line, i) => {
        const name = typeof raw[i] === 'string' ? nameById.get(raw[i] as string) : undefined
        // An unresolvable id means the swap target was deleted — keep the plan.
        if (!name || name === line.name) return line
        return { ...line, name, substitutedFor: line.name }
    })
}

/**
 * Drop the lines the user skipped this session. `raw` is a list of indices into
 * the snapshotted lines — a machine that was taken, an exercise cut for time.
 * The log records what was actually done, so a skipped line leaves no trace
 * rather than sitting in history with no sets against it.
 */
function applyOmissions(lines: IWorkoutLogExercise[], raw: unknown): IWorkoutLogExercise[] {
    if (!Array.isArray(raw)) return lines
    const drop = new Set(
        raw
            .map((i) => (typeof i === 'number' ? i : Number(i)))
            .filter((i) => Number.isInteger(i) && i >= 0)
    )
    if (drop.size === 0) return lines
    return lines.filter((_, i) => !drop.has(i))
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
        // Snapshot, then overlay swaps and sets by index, then drop the skipped
        // lines — omission comes last so every index above means the same thing.
        exercises: applyOmissions(
            applyLoggedSets(
                await applySubstitutions(
                    await snapshotExercises(src, req.userId),
                    b.substitutions,
                    req.userId
                ),
                b.loggedSets
            ),
            b.omitted
        ),
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

    if (Array.isArray(b.loggedSets)) {
        const existing = await WorkoutLog.findOne({
            _id: req.params.id,
            user: req.userId,
        }).select('workout exercises')
        if (!existing) {
            res.status(404).json({ message: 'Log not found' })
            return
        }

        // The in-session logger saves repeatedly as the workout goes on, sending
        // the whole picture each time — what was swapped, what was skipped. Its
        // saves rebuild the lines from the linked workout, exactly as the first
        // save did, so a row skipped (or put back) after that save still lands.
        const src =
            b.rebuild === true && existing.workout
                ? await Workout.findOne({ _id: existing.workout, user: req.userId })
                : null

        fields.exercises = src
            ? applyOmissions(
                  applyLoggedSets(
                      await applySubstitutions(
                          await snapshotExercises(src, req.userId),
                          b.substitutions,
                          req.userId
                      ),
                      b.loggedSets
                  ),
                  b.omitted
              )
            : // Otherwise overlay edited weights onto the log's existing
              // (already-snapshotted) lines, aligned by index — the edit drawer
              // sends one set-list per exercise in order.
              applyLoggedSets(
                  existing.exercises.map((e) => ({
                      name: e.name,
                      sets: e.sets,
                      reps: e.reps,
                      ...(e.substitutedFor ? { substitutedFor: e.substitutedFor } : {}),
                  })),
                  b.loggedSets
              )
    }

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
