import { tokenise } from './exerciseSwap'
import { estimatedMax, MEANINGFUL_CHANGE_PCT, type PerformanceStatus } from './strengthTrend'
import type { LoggedSet, WorkoutLog } from '../types'

/**
 * Progression for one exercise, read out of the workout logs.
 *
 * `strengthTrend` answers a narrow question — are the big barbell lifts holding
 * up while the weight comes off — and matches five hard-coded movements by name
 * to do it. This is the general case: whatever you actually logged, charted over
 * time, whether that's the squat or the seated calf raise.
 *
 * The awkward part is identity. A logged exercise is a *name snapshot*, not a
 * reference — `WorkoutLogExercise` carries no exercise id, deliberately, so the
 * record of what you did survives renaming or deleting the library entry. That
 * means the only thing tying June's session to today's is the text, and text
 * drifts: "Push-Ups", "push ups", "Push Up". Names are matched on their
 * tokenised form, which folds case, punctuation and plurals together, so those
 * three are one exercise here. Two genuinely different movements that tokenise
 * alike would merge, but the alternative — treating every spelling as its own
 * exercise — breaks the chart in the far more common case.
 */

/**
 * The identity of an exercise across logs: its name, folded to lowercase
 * singular words. Anything that can't be tokenised (a name of pure punctuation)
 * falls back to the trimmed original so it still groups with itself.
 */
export function exerciseKey(name: string): string {
    return tokenise(name).join(' ') || name.trim().toLowerCase()
}

/** One exercise that has been logged at least once, and how much of it there is. */
export interface TrackedExercise {
    key: string
    /** The most recent spelling — what the picker shows. */
    name: string
    /** Distinct days this exercise was performed on. */
    sessions: number
    /** Sets with a weight *and* reps on them: what the charts can actually plot. */
    workingSets: number
    firstDate: string
    lastDate: string
}

/**
 * Every exercise with something to show, most-logged first.
 *
 * Ordered by session count rather than alphabetically because the picker is a
 * plain dropdown: whatever you train most should need the least scrolling, and
 * an exercise done twice in February isn't what you came here to look at.
 * Exercises logged without weights — a quick "Done" — are left out entirely;
 * there is no progression to draw from a session that recorded nothing.
 */
export function trackedExercises(logs: WorkoutLog[]): TrackedExercise[] {
    const byKey = new Map<string, TrackedExercise & { dates: Set<string> }>()

    for (const log of logs) {
        for (const exercise of log.exercises ?? []) {
            const working = (exercise.loggedSets ?? []).filter(isWorkingSet)
            if (working.length === 0) continue

            const key = exerciseKey(exercise.name)
            const entry = byKey.get(key)
            if (!entry) {
                byKey.set(key, {
                    key,
                    name: exercise.name,
                    sessions: 0,
                    workingSets: working.length,
                    firstDate: log.date,
                    lastDate: log.date,
                    dates: new Set([log.date]),
                })
                continue
            }

            entry.workingSets += working.length
            entry.dates.add(log.date)
            if (log.date < entry.firstDate) entry.firstDate = log.date
            // The spelling shown follows the latest session, so correcting a
            // typo in the library eventually corrects it here too.
            if (log.date >= entry.lastDate) {
                entry.lastDate = log.date
                entry.name = exercise.name
            }
        }
    }

    return [...byKey.values()]
        .map(({ dates, ...rest }) => ({ ...rest, sessions: dates.size }))
        .sort((a, b) => b.sessions - a.sessions || b.lastDate.localeCompare(a.lastDate))
}

/** A set only counts towards progression when both halves of it were recorded. */
function isWorkingSet(set: LoggedSet): boolean {
    return (
        set.weight !== undefined &&
        set.weight > 0 &&
        set.reps !== undefined &&
        set.reps > 0
    )
}

/** One day of one exercise, however many logs and sets that took. */
export interface ExerciseSession {
    date: string
    sets: LoggedSet[]
    /** Sets carrying both a weight and reps. */
    workingSets: number
    /** The heaviest set of the day — ties broken by reps. */
    topSet: LoggedSet | null
    topWeightKg: number | null
    /** Best estimated one-rep max across the day's sets, kg. Null past 12 reps. */
    bestE1rmKg: number | null
    /** Σ weight × reps for the day, kg. */
    volumeKg: number
    totalReps: number
}

/**
 * Every session of one exercise, oldest first.
 *
 * Merged by date, not by log: two sessions in a day, or an exercise appearing
 * twice in one workout, is one point on the chart. Volume adds up across them
 * and the top set is the best of the lot, which is what a day of that exercise
 * actually amounted to.
 */
export function exerciseHistory(logs: WorkoutLog[], key: string): ExerciseSession[] {
    const byDate = new Map<string, ExerciseSession>()

    for (const log of logs) {
        for (const exercise of log.exercises ?? []) {
            if (exerciseKey(exercise.name) !== key) continue

            const day: ExerciseSession = byDate.get(log.date) ?? {
                date: log.date,
                sets: [],
                workingSets: 0,
                topSet: null,
                topWeightKg: null,
                bestE1rmKg: null,
                volumeKg: 0,
                totalReps: 0,
            }

            for (const set of exercise.loggedSets ?? []) {
                if (set.weight == null && set.reps == null) continue
                day.sets.push(set)
                if (set.reps != null) day.totalReps += set.reps
                if (!isWorkingSet(set)) continue

                day.workingSets += 1
                day.volumeKg += set.weight! * set.reps!

                if (day.topSet === null || beatsTopSet(set, day.topSet)) {
                    day.topSet = set
                    day.topWeightKg = set.weight!
                }

                const e1rm = estimatedMax(set.weight!, set.reps!)
                if (e1rm !== null && (day.bestE1rmKg === null || e1rm > day.bestE1rmKg)) {
                    day.bestE1rmKg = e1rm
                }
            }

            byDate.set(log.date, day)
        }
    }

    return [...byDate.values()]
        .filter((s) => s.sets.length > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
}

/** Heavier wins; at the same weight, more reps wins. */
function beatsTopSet(set: LoggedSet, best: LoggedSet): boolean {
    const w = set.weight ?? -1
    const bw = best.weight ?? -1
    if (w !== bw) return w > bw
    return (set.reps ?? 0) > (best.reps ?? 0)
}

/** What the progression chart is plotting. */
export type ProgressMetric = 'e1rm' | 'weight' | 'volume'

export const PROGRESS_METRICS: { value: ProgressMetric; label: string; unit: string; hint: string }[] =
    [
        {
            value: 'e1rm',
            label: 'Est. 1RM',
            unit: 'kg',
            hint: 'Weight and reps rolled into one number — the fairest like-for-like across rep ranges.',
        },
        {
            value: 'weight',
            label: 'Top set',
            unit: 'kg',
            hint: 'The heaviest weight you actually put on the bar that day.',
        },
        {
            value: 'volume',
            label: 'Volume',
            unit: 'kg',
            hint: 'Every set added up (weight × reps) — total work done, not peak strength.',
        },
    ]

/** One session's value for a metric, or null when the day can't supply it. */
export function metricValue(session: ExerciseSession, metric: ProgressMetric): number | null {
    if (metric === 'e1rm') return session.bestE1rmKg
    if (metric === 'weight') return session.topWeightKg
    return session.volumeKg > 0 ? session.volumeKg : null
}

/** A dated number, ready to chart or compare. */
export interface MetricPoint {
    date: string
    value: number
}

/** The plottable points of a history for one metric, oldest first. */
export function metricSeries(
    sessions: ExerciseSession[],
    metric: ProgressMetric
): MetricPoint[] {
    return sessions
        .map((s) => ({ date: s.date, value: metricValue(s, metric) }))
        .filter((p): p is MetricPoint => p.value !== null)
}

/** Fewest points needed either side before a comparison is worth drawing. */
export const MIN_POINTS_PER_WINDOW = 2

/** How a metric moved between two adjacent windows of time. */
export interface WindowChange {
    status: PerformanceStatus
    /** Percentage change between the windows. Null when there isn't a comparison. */
    changePct: number | null
    recentMean: number | null
    previousMean: number | null
    recentCount: number
    previousCount: number
}

/**
 * Mean of the last `windowDays` against the mean of the `windowDays` before it.
 *
 * The same shape of comparison `liftTrend` makes for the key lifts, generalised
 * to any dated series: means rather than best-against-best, so one exceptional
 * Tuesday at either end can't set the verdict, and the same "below 2.5% is
 * holding, not moving" threshold, because session-to-session numbers swing that
 * much on sleep and food alone.
 */
export function windowChange(
    points: MetricPoint[],
    asOf: string,
    windowDays: number,
    minPoints = MIN_POINTS_PER_WINDOW
): WindowChange {
    const recentFrom = addDaysIso(asOf, -(windowDays - 1))
    const previousFrom = addDaysIso(asOf, -(windowDays * 2 - 1))

    const inRange = points.filter((p) => p.date <= asOf)
    const recent = inRange.filter((p) => p.date >= recentFrom)
    const previous = inRange.filter((p) => p.date >= previousFrom && p.date < recentFrom)

    const base: WindowChange = {
        status: 'insufficient-data',
        changePct: null,
        recentMean: null,
        previousMean: null,
        recentCount: recent.length,
        previousCount: previous.length,
    }

    if (recent.length < minPoints || previous.length < minPoints) return base

    const mean = (xs: MetricPoint[]) => xs.reduce((sum, p) => sum + p.value, 0) / xs.length
    const recentMean = mean(recent)
    const previousMean = mean(previous)
    if (previousMean <= 0) return base

    const changePct = ((recentMean - previousMean) / previousMean) * 100

    return {
        ...base,
        recentMean,
        previousMean,
        changePct,
        status:
            changePct > MEANINGFUL_CHANGE_PCT
                ? 'improving'
                : changePct < -MEANINGFUL_CHANGE_PCT
                  ? 'declining'
                  : 'stable',
    }
}

/** The best one exercise has ever produced, and when. */
export interface ExerciseRecords {
    /** Heaviest single set. */
    heaviest: { date: string; weightKg: number; reps: number } | null
    /** Best estimated one-rep max. */
    bestE1rm: { date: string; e1rmKg: number; weightKg: number; reps: number } | null
    /** Biggest single session by total volume. */
    bestVolume: { date: string; volumeKg: number } | null
}

export function exerciseRecords(sessions: ExerciseSession[]): ExerciseRecords {
    const records: ExerciseRecords = { heaviest: null, bestE1rm: null, bestVolume: null }

    for (const session of sessions) {
        for (const set of session.sets) {
            if (!isWorkingSet(set)) continue
            const weightKg = set.weight!
            const reps = set.reps!

            if (
                !records.heaviest ||
                weightKg > records.heaviest.weightKg ||
                (weightKg === records.heaviest.weightKg && reps > records.heaviest.reps)
            ) {
                records.heaviest = { date: session.date, weightKg, reps }
            }

            const e1rm = estimatedMax(weightKg, reps)
            if (e1rm !== null && (!records.bestE1rm || e1rm > records.bestE1rm.e1rmKg)) {
                records.bestE1rm = { date: session.date, e1rmKg: e1rm, weightKg, reps }
            }
        }

        if (session.volumeKg > 0 && (!records.bestVolume || session.volumeKg > records.bestVolume.volumeKg)) {
            records.bestVolume = { date: session.date, volumeKg: session.volumeKg }
        }
    }

    return records
}

/** A day an exercise's heaviest-ever set was beaten. */
export interface PersonalBest {
    key: string
    name: string
    date: string
    weightKg: number
    reps: number
    /** The weight this beat, or null when it's the first time the exercise was logged. */
    previousKg: number | null
}

/**
 * Every time a personal best was set, oldest first.
 *
 * A best is a *heavier top set than ever before* — not a better estimated max.
 * The estimate is fine for trends, where its drift cancels out, but a "PR" that
 * only exists because the formula flatters a set of ten is not a PR anybody
 * would claim, and this list is the one people read as an achievement.
 *
 * The first session of an exercise is included with `previousKg: null`. It isn't
 * really a record — everything is a record once — so a board of achievements
 * should filter those out, while a board of current bests wants them.
 */
export function personalBests(logs: WorkoutLog[]): PersonalBest[] {
    const ordered = [...logs].sort((a, b) => a.date.localeCompare(b.date))
    const best = new Map<string, number>()
    const out: PersonalBest[] = []

    for (const log of ordered) {
        // Within one day, only the day's heaviest set can be the new best —
        // otherwise a warm-up ladder posts three "records" in one session.
        const dayBest = new Map<string, { name: string; weightKg: number; reps: number }>()

        for (const exercise of log.exercises ?? []) {
            const key = exerciseKey(exercise.name)
            for (const set of exercise.loggedSets ?? []) {
                if (!isWorkingSet(set)) continue
                const current = dayBest.get(key)
                if (!current || beatsTopSet(set, { weight: current.weightKg, reps: current.reps })) {
                    dayBest.set(key, {
                        name: exercise.name,
                        weightKg: set.weight!,
                        reps: set.reps!,
                    })
                }
            }
        }

        for (const [key, top] of dayBest) {
            const previous = best.get(key)
            if (previous !== undefined && top.weightKg <= previous) continue
            best.set(key, top.weightKg)
            out.push({
                key,
                name: top.name,
                date: log.date,
                weightKg: top.weightKg,
                reps: top.reps,
                previousKg: previous ?? null,
            })
        }
    }

    return out
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}
