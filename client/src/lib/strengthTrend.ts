import { daysBetween } from './weightTrend'
import type { WorkoutLog } from '../types'

/**
 * Is the training holding up while the weight comes off?
 *
 * This is the signal that separates a recomp from a diet. Losing weight is easy
 * to do badly: cut hard enough and the scale moves beautifully while the squat
 * quietly falls off, and by the time that is obvious in the mirror you have
 * spent months converting muscle into a smaller number. Strength holding — or
 * rising — through a deficit is the evidence that what is leaving is fat.
 *
 * It reads the workout logs the Fitness module already writes. No new logging,
 * no second history: if a session was recorded with weights on it, this can see
 * it, and if it wasn't there is nothing here to fix.
 *
 * Everything is deliberately coarse. "Improving", "stable" or "declining" over a
 * month is about as much as an estimate built from working sets can honestly
 * support, and a percentage to two decimal places would be false precision
 * dressed up as insight.
 */

/**
 * Estimated one-rep max from a working set, by the Epley formula:
 * `weight × (1 + reps / 30)`.
 *
 * It is an approximation and it drifts — it flatters high-rep sets and differs
 * between lifts — but every set is put through the same one, so the comparison
 * over time holds even where the absolute figure doesn't. Only the change is
 * ever reported, never the estimate itself as a claim about what you could lift.
 */
export function estimatedMax(weight: number, reps: number): number | null {
    if (!Number.isFinite(weight) || weight <= 0) return null
    if (!Number.isFinite(reps) || reps < 1) return null
    // Past a dozen reps the formula stops describing strength and starts
    // describing endurance, so those sets are left out rather than trusted.
    if (reps > MAX_USABLE_REPS) return null
    return weight * (1 + reps / 30)
}

/** Beyond this many reps a set says more about conditioning than strength. */
export const MAX_USABLE_REPS = 12

/**
 * The movements worth trending, and how to spot them in a free-text exercise name.
 *
 * The exercise library has no notion of a "key lift" to read instead — it tracks
 * muscle group and equipment, for swapping a busy machine — so these are matched
 * by name. Compound barbell work only: it is the stuff that is loaded heavily
 * enough, and often enough, for a month of sessions to say something, and it is
 * where losing strength on a cut shows up first.
 */
export const KEY_LIFTS = [
    { key: 'squat', label: 'Squat', pattern: /\bsquat\b/i },
    { key: 'bench', label: 'Bench press', pattern: /\bbench\b/i },
    { key: 'deadlift', label: 'Deadlift', pattern: /\b(dead ?lift|trap ?bar)\b/i },
    { key: 'overhead', label: 'Overhead press', pattern: /\b(overhead|shoulder|military)\s*press\b/i },
    { key: 'row', label: 'Row', pattern: /\brow\b/i },
] as const

export type LiftKey = (typeof KEY_LIFTS)[number]['key']

/** Which key lift an exercise name belongs to, or null when it isn't one. */
export function liftFor(name: string): LiftKey | null {
    for (const lift of KEY_LIFTS) {
        if (lift.pattern.test(name)) return lift.key
    }
    return null
}

/** The best estimated max recorded for one lift in one session. */
export interface SessionBest {
    date: string
    lift: LiftKey
    /** Best estimated one-rep max across the session's sets, kg. */
    estimatedMaxKg: number
    /** The set it came from — the honest version of the number above. */
    weightKg: number
    reps: number
}

/**
 * Best estimated max per lift per session, oldest first.
 *
 * Best-of-session rather than an average because a session's top set is the one
 * carrying the intent; warm-ups and back-off sets would drag the figure around
 * with programming rather than with strength.
 */
export function sessionBests(logs: WorkoutLog[]): SessionBest[] {
    const byKey = new Map<string, SessionBest>()

    for (const log of logs) {
        for (const exercise of log.exercises ?? []) {
            const lift = liftFor(exercise.name)
            if (!lift) continue

            for (const set of exercise.loggedSets ?? []) {
                if (set.weight === undefined || set.reps === undefined) continue
                const e1rm = estimatedMax(set.weight, set.reps)
                if (e1rm === null) continue

                const key = `${log.date}:${lift}`
                const existing = byKey.get(key)
                if (!existing || e1rm > existing.estimatedMaxKg) {
                    byKey.set(key, {
                        date: log.date,
                        lift,
                        estimatedMaxKg: e1rm,
                        weightKg: set.weight,
                        reps: set.reps,
                    })
                }
            }
        }
    }

    return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** How a lift, or the training as a whole, is going. */
export type PerformanceStatus = 'improving' | 'stable' | 'declining' | 'insufficient-data'

export const PERFORMANCE_LABELS: Record<PerformanceStatus, string> = {
    improving: 'Improving',
    stable: 'Stable',
    declining: 'Declining',
    'insufficient-data': 'Not enough sessions',
}

/**
 * How much an estimated max must move before it counts as movement.
 *
 * Session-to-session estimates swing a couple of percent on sleep, food and how
 * hard the last rep was pushed. Below this the honest reading is "holding" —
 * which, during a deficit, is the good outcome rather than the boring one.
 */
export const MEANINGFUL_CHANGE_PCT = 2.5

/** The window compared, and the one it is compared against. */
export const COMPARE_WINDOW_DAYS = 42

/** Fewest sessions needed in each window before a comparison is drawn. */
export const MIN_SESSIONS_PER_WINDOW = 2

export interface LiftTrend {
    lift: LiftKey
    label: string
    status: PerformanceStatus
    /** Percentage change between the two windows. Null when there isn't one. */
    changePct: number | null
    /** Mean best estimated max in each window, kg. */
    recentKg: number | null
    previousKg: number | null
    recentSessions: number
    previousSessions: number
    /** The heaviest estimated max ever recorded for this lift. */
    bestKg: number | null
    /** The most recent session's best. */
    latest: SessionBest | null
}

/**
 * Compare the last six weeks of a lift against the six before it.
 *
 * Means across a window rather than best-versus-best, because a single
 * exceptional day at either end would otherwise set the verdict — and the
 * question is whether the lift is holding up in general, not whether one Tuesday
 * went well.
 */
export function liftTrend(
    bests: SessionBest[],
    lift: LiftKey,
    asOf: string,
    windowDays = COMPARE_WINDOW_DAYS
): LiftTrend {
    const label = KEY_LIFTS.find((l) => l.key === lift)!.label
    const mine = bests.filter((b) => b.lift === lift && b.date <= asOf)

    const recentFrom = addDaysIso(asOf, -(windowDays - 1))
    const previousFrom = addDaysIso(asOf, -(windowDays * 2 - 1))

    const recent = mine.filter((b) => b.date >= recentFrom)
    const previous = mine.filter((b) => b.date >= previousFrom && b.date < recentFrom)

    const base: LiftTrend = {
        lift,
        label,
        status: 'insufficient-data',
        changePct: null,
        recentKg: null,
        previousKg: null,
        recentSessions: recent.length,
        previousSessions: previous.length,
        bestKg: mine.length ? Math.max(...mine.map((b) => b.estimatedMaxKg)) : null,
        latest: mine.length ? mine[mine.length - 1] : null,
    }

    if (recent.length < MIN_SESSIONS_PER_WINDOW || previous.length < MIN_SESSIONS_PER_WINDOW) {
        return base
    }

    const mean = (xs: SessionBest[]) =>
        xs.reduce((sum, b) => sum + b.estimatedMaxKg, 0) / xs.length
    const recentKg = mean(recent)
    const previousKg = mean(previous)
    if (previousKg <= 0) return base

    const changePct = ((recentKg - previousKg) / previousKg) * 100

    return {
        ...base,
        recentKg,
        previousKg,
        changePct,
        status:
            changePct > MEANINGFUL_CHANGE_PCT
                ? 'improving'
                : changePct < -MEANINGFUL_CHANGE_PCT
                  ? 'declining'
                  : 'stable',
    }
}

export interface StrengthSummary {
    lifts: LiftTrend[]
    /** The verdict across the lifts that had enough data to have one. */
    overall: PerformanceStatus
    /** How many lifts could actually be judged. */
    judged: number
}

/**
 * The picture across every key lift.
 *
 * The overall verdict leans towards caution on the way down: one lift clearly
 * declining is worth surfacing even if the others are flat, because that is the
 * early sign of a deficit that has gone too far — while calling the whole block
 * "improving" needs more than one lift having a good month.
 */
export function strengthSummary(
    logs: WorkoutLog[],
    asOf: string,
    windowDays = COMPARE_WINDOW_DAYS
): StrengthSummary {
    const bests = sessionBests(logs)
    const lifts = KEY_LIFTS.map((l) => liftTrend(bests, l.key, asOf, windowDays))
    const judged = lifts.filter((l) => l.status !== 'insufficient-data')

    if (judged.length === 0) {
        return { lifts, overall: 'insufficient-data', judged: 0 }
    }

    const declining = judged.filter((l) => l.status === 'declining').length
    const improving = judged.filter((l) => l.status === 'improving').length

    let overall: PerformanceStatus = 'stable'
    if (declining > 0 && declining >= improving) overall = 'declining'
    else if (improving > declining) overall = 'improving'

    return { lifts, overall, judged: judged.length }
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}

export { daysBetween }
