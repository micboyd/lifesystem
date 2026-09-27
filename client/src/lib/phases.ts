/**
 * Helpers over the warm-up / main / cool-down structure shared by conditioning
 * sessions and strength workouts.
 */
import { SESSION_PHASES, type Phased, type SessionPhase } from '../types'

export function emptyPhases<T>(): Phased<T> {
    return { warmUp: [], main: [], coolDown: [] }
}

/** Every item in session order, each tagged with its phase. */
export function flattenPhases<T>(doc: Partial<Phased<T>>): { phase: SessionPhase; item: T }[] {
    return SESSION_PHASES.flatMap((phase) => (doc[phase] ?? []).map((item) => ({ phase, item })))
}

/** Every item in session order, untagged. */
export function allInPhases<T>(doc: Partial<Phased<T>>): T[] {
    return flattenPhases(doc).map((r) => r.item)
}

export function mapPhases<S, T>(
    doc: Phased<S>,
    fn: (list: S[], phase: SessionPhase) => T[]
): Phased<T> {
    return {
        warmUp: fn(doc.warmUp ?? [], 'warmUp'),
        main: fn(doc.main ?? [], 'main'),
        coolDown: fn(doc.coolDown ?? [], 'coolDown'),
    }
}

/** A logged line's phase — lines logged before phases existed are main work. */
export function phaseOf(line: { phase?: SessionPhase }): SessionPhase {
    return line.phase ?? 'main'
}

/** Whether a logged line is main work — the only kind that counts toward progress. */
export function isMainWork(line: { phase?: SessionPhase }): boolean {
    return phaseOf(line) === 'main'
}

/** Drop empty phases — for exports, where an absent warm-up needn't be written out. */
export function nonEmptyPhases<T>(doc: Phased<T>): Partial<Phased<T>> {
    const out: Partial<Phased<T>> = {}
    for (const p of SESSION_PHASES) if (doc[p].length) out[p] = doc[p]
    return out
}

// ─── Workout time estimate ──────────────────────────────────────────────────────

/** Assumed warm-up when a workout doesn't prescribe one. */
const DEFAULT_WARMUP_MIN = 8
/** Main work: ~2 min per working set (work + rest), else a flat block per exercise. */
const PER_SET_MIN = 2
const PER_EXERCISE_MIN = 6
/** Warm-up and cool-down lines are lighter: ~1 min per set, else a short block. */
const PER_EASY_SET_MIN = 1
const PER_EASY_EXERCISE_MIN = 3

type SetsLine = { sets?: number; endMin?: number }

function blockMinutes(lines: SetsLine[], perSet: number, perLine: number): number {
    return lines.reduce((sum, e) => sum + (e.sets && e.sets > 0 ? e.sets * perSet : perLine), 0)
}

/**
 * Rough completion estimate for a strength workout. When every line has a
 * planned slot, it's simply where the last slot ends. Otherwise the main session counts
 * ~2 min per working set; a prescribed warm-up and cool-down count their own
 * lighter lines, and a workout without a warm-up is assumed to need 8 minutes.
 * Deliberately transparent so the number reads as the ballpark it is.
 */
export function estimateWorkoutMinutes(workout: Phased<SetsLine>): number {
    const lines = allInPhases(workout)
    if (lines.length === 0) return 0
    // Every line timed: the session ends when its last slot does.
    if (lines.every((l) => l.endMin !== undefined))
        return Math.ceil(Math.max(...lines.map((l) => l.endMin!)))
    const warmUp = workout.warmUp.length
        ? blockMinutes(workout.warmUp, PER_EASY_SET_MIN, PER_EASY_EXERCISE_MIN)
        : DEFAULT_WARMUP_MIN
    return (
        warmUp +
        blockMinutes(workout.main, PER_SET_MIN, PER_EXERCISE_MIN) +
        blockMinutes(workout.coolDown, PER_EASY_SET_MIN, PER_EASY_EXERCISE_MIN)
    )
}

/** How the estimate is worked out, for the "~" tooltip. */
export const WORKOUT_ESTIMATE_HINT =
    'Rough estimate: the warm-up (8 min if none is set), ~2 min per working set in the main session (~6 min per exercise where sets aren’t set), and the cool-down.'
