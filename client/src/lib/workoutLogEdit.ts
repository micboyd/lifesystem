/**
 * Turning a workout — or a workout already logged — into the strength logger's
 * editable rows.
 *
 * A finished log reopens in the same logger it was recorded in, so changing a
 * weight, putting back a skipped exercise or adding one you forgot works
 * exactly as it did in the gym. The logger saves by rebuilding the log from
 * the workout, so the log's lines have to be laid back over the workout's rows
 * first: which rows were done (and as what), which were skipped, and which
 * lines were added on the day.
 */

import type { Exercise, SessionPhase, Workout, WorkoutExercise, WorkoutLog } from '../types'
import { flattenPhases } from './phases'
import type { DraftExercise, DraftSet } from './workoutLogDraft'

/**
 * Seed a set's reps from the prescription when it's a plain number (e.g. "8"),
 * leaving ranges/AMRAP (e.g. "8-12") blank for the user to fill in.
 */
function seedReps(reps?: string): string {
    const r = reps?.trim() ?? ''
    return /^\d+$/.test(r) ? r : ''
}

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
export function formatPrescription(e: WorkoutExercise): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

/** The initial rows for a workout: one per resolved exercise — warm-up, main,
 *  then cool-down, the order the server snapshots the log in — seeded with as
 *  many blank sets as the prescription calls for (at least one). */
export function seedDrafts(workout: Workout, byId: Map<string, Exercise>): DraftExercise[] {
    return flattenPhases(workout)
        .map(({ phase, item }) => ({ phase, item, ex: byId.get(item.exercise) }))
        .filter((r): r is { phase: SessionPhase; item: WorkoutExercise; ex: Exercise } => !!r.ex)
        .map(({ phase, item, ex }) => {
            const warmUp = phase === 'warmUp'
            const count = warmUp ? 1 : Math.max(1, item.sets && item.sets > 0 ? item.sets : 1)
            const reps = warmUp ? '' : seedReps(item.reps)
            return {
                exerciseId: ex._id,
                name: ex.name,
                ...(phase !== 'main' ? { phase } : {}),
                prescription: formatPrescription(item),
                sets: Array.from({ length: count }, () => ({ weight: '', reps })),
            }
        })
}

const norm = (s: string) => s.trim().toLowerCase()

/** A library exercise by name — how a logged line (which keeps only a name) finds its id. */
function byName(byId: Map<string, Exercise>, name: string): Exercise | undefined {
    const key = norm(name)
    for (const ex of byId.values()) if (norm(ex.name) === key) return ex
    return undefined
}

function loggedToDraft(line: WorkoutLog['exercises'][number]): DraftSet[] {
    return (line.loggedSets ?? []).map((s) => ({
        weight: s.weight != null ? String(s.weight) : '',
        reps: s.reps != null ? String(s.reps) : '',
        done: true,
    }))
}

/**
 * The logger's rows for a log that's already been saved, or null when the log
 * no longer lines up with its workout (exercises edited or renamed since) — a
 * rebuild from the workout would then lose lines, so it can't be edited this way.
 *
 * Walks the workout's rows against the log's own lines in order: a line by the
 * row's name (or swapped in for it) is that row, done; a row with no line was
 * skipped. Lines added on the day come after, as added rows.
 */
export function seedFromLog(
    workout: Workout,
    log: WorkoutLog,
    byId: Map<string, Exercise>
): DraftExercise[] | null {
    const rows = seedDrafts(workout, byId)
    const own = log.exercises.filter((l) => !l.added)
    let j = 0
    const out: DraftExercise[] = []
    for (const row of rows) {
        const line = own[j]
        const planned = line ? (line.substitutedFor ?? line.name) : undefined
        if (!line || planned === undefined || norm(planned) !== norm(row.name)) {
            out.push({ ...row, removed: true })
            continue
        }
        j++
        let next: DraftExercise = row
        if (line.substitutedFor) {
            const stand = byName(byId, line.name)
            if (!stand) return null
            next = {
                ...row,
                exerciseId: stand._id,
                name: stand.name,
                swappedFrom: { id: row.exerciseId, name: row.name },
            }
        }
        const sets = loggedToDraft(line)
        if (row.phase === 'warmUp') {
            // In the log at all means it was done — warm-ups carry no sets.
            next = { ...next, sets: [{ weight: '', reps: '', done: true }] }
        } else if (sets.length) {
            next = { ...next, sets }
        }
        out.push(next)
    }
    // Lines the workout no longer has a row for.
    if (j < own.length) return null

    for (const line of log.exercises.filter((l) => l.added)) {
        const ex = byName(byId, line.name)
        if (!ex) return null
        const sets = loggedToDraft(line)
        out.push({
            exerciseId: ex._id,
            name: ex.name,
            prescription: '',
            added: true,
            sets: sets.length ? sets : [{ weight: '', reps: '' }],
        })
    }
    return out
}
