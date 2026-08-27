import { weekStartMonday } from './logFilters'
import { daysBetween } from './weightTrend'
import type { PerformanceStatus } from './strengthTrend'
import type { ConditioningCategory, ConditioningLog, LoggedSet, WorkoutLog } from '../types'

/**
 * How much training is actually happening, and where it lands.
 *
 * Progression answers "is this lift going up". This answers the questions that
 * sit underneath it: are you turning up, how much work are you doing, and is any
 * of your body being quietly ignored. A lift that stalls after six weeks of two
 * sessions a month isn't a programming problem, and no amount of staring at the
 * estimated max will say so — but a bar chart with gaps in it will.
 *
 * Everything here is counted from what was logged, so an unlogged session is an
 * untrained week as far as these numbers are concerned. That's the honest
 * reading: this measures the record, and the record is what you have.
 */

/** Weight × reps for one set, or 0 when either half wasn't recorded. */
export function setVolume(set: LoggedSet): number {
    if (set.weight == null || set.reps == null) return 0
    if (set.weight <= 0 || set.reps <= 0) return 0
    return set.weight * set.reps
}

/** Total kilograms moved in one logged session. */
export function logVolume(log: WorkoutLog): number {
    let total = 0
    for (const exercise of log.exercises ?? []) {
        for (const set of exercise.loggedSets ?? []) total += setVolume(set)
    }
    return total
}

/** Sets in one logged session that carried both a weight and reps. */
export function logWorkingSets(log: WorkoutLog): number {
    let count = 0
    for (const exercise of log.exercises ?? []) {
        for (const set of exercise.loggedSets ?? []) {
            if (setVolume(set) > 0) count += 1
        }
    }
    return count
}

/** One Monday-to-Sunday week of strength work. */
export interface WeekLoad {
    /** YYYY-MM-DD of the Monday. */
    weekStart: string
    sessions: number
    volumeKg: number
    sets: number
}

/**
 * The last `weeks` weeks of strength training, oldest first.
 *
 * Weeks with nothing in them are returned as zeroes rather than skipped. That is
 * the entire point of charting this: a gap has to look like a gap, and a series
 * that quietly drops empty weeks turns three months of twice-a-month training
 * into a reassuring straight line.
 */
export function weeklyLoad(logs: WorkoutLog[], weeks: number, today: string): WeekLoad[] {
    const out: WeekLoad[] = []
    const thisWeek = weekStartMonday(today)

    for (let i = weeks - 1; i >= 0; i--) {
        out.push({ weekStart: addDaysIso(thisWeek, -7 * i), sessions: 0, volumeKg: 0, sets: 0 })
    }

    const byWeek = new Map(out.map((w) => [w.weekStart, w] as const))

    for (const log of logs) {
        const week = byWeek.get(weekStartMonday(log.date))
        if (!week) continue
        week.sessions += 1
        week.volumeKg += logVolume(log)
        week.sets += logWorkingSets(log)
    }

    return out
}

/** Turning up, measured over a window. */
export interface Consistency {
    /** Sessions logged inside the window. */
    sessions: number
    /** Whole weeks the window covers, used for the average. */
    weeks: number
    /** Sessions per week across the window. */
    perWeek: number
    volumeKg: number
    sets: number
    /** Most recent session in the whole history, window or not. */
    lastDate: string | null
    daysSince: number | null
}

/**
 * Training in the last `days`, plus how long it's been since the last session.
 *
 * `lastDate` deliberately ignores the window. "You last trained 40 days ago" is
 * the most useful sentence on the page when it's true, and a 28-day window that
 * only looked inside itself would have to say "no sessions" and leave you to
 * work out whether that meant nine days or nine months.
 */
export function consistency(logs: WorkoutLog[], today: string, days: number): Consistency {
    const from = addDaysIso(today, -(days - 1))
    const inWindow = logs.filter((l) => l.date >= from && l.date <= today)

    let volumeKg = 0
    let sets = 0
    for (const log of inWindow) {
        volumeKg += logVolume(log)
        sets += logWorkingSets(log)
    }

    const past = logs.filter((l) => l.date <= today)
    const lastDate = past.length
        ? past.reduce((latest, l) => (l.date > latest ? l.date : latest), past[0].date)
        : null

    const weeks = days / 7

    return {
        sessions: inWindow.length,
        weeks,
        perWeek: inWindow.length / weeks,
        volumeKg,
        sets,
        lastDate,
        daysSince: lastDate ? daysBetween(lastDate, today) : null,
    }
}

/** Consecutive weeks trained, now and at best. */
export interface Streaks {
    current: number
    longest: number
}

/**
 * Runs of consecutive weeks containing at least one session.
 *
 * A week rather than a day, because nobody lifts daily and a day-streak would
 * punish a correctly programmed rest day. The current run is measured from last
 * week when this week is still empty — on a Monday morning you haven't broken
 * anything yet — and an empty current week is never counted towards the run
 * itself, so the number can't claim a week that hasn't happened.
 */
export function weekStreaks(logs: WorkoutLog[], today: string): Streaks {
    const trained = new Set(logs.filter((l) => l.date <= today).map((l) => weekStartMonday(l.date)))
    if (trained.size === 0) return { current: 0, longest: 0 }

    const thisWeek = weekStartMonday(today)
    let cursor = trained.has(thisWeek) ? thisWeek : addDaysIso(thisWeek, -7)
    let current = 0
    while (trained.has(cursor)) {
        current += 1
        cursor = addDaysIso(cursor, -7)
    }

    const weeks = [...trained].sort()
    let longest = 0
    let run = 0
    let previous: string | null = null
    for (const week of weeks) {
        run = previous !== null && addDaysIso(previous, 7) === week ? run + 1 : 1
        if (run > longest) longest = run
        previous = week
    }

    return { current, longest }
}

/** What a muscle group got over a stretch of training. */
export interface GroupLoad {
    group: string
    /** Distinct days this group was trained on. */
    sessions: number
    sets: number
    volumeKg: number
}

/**
 * Volume split by muscle group, biggest share first.
 *
 * `groupOf` is passed in rather than resolved here: the caller has the exercise
 * library, where an explicit muscle group beats anything guessable from a name,
 * and this module has no business fetching it. Exercises whose group can't be
 * determined are gathered under "Untagged" instead of being dropped — a quarter
 * of your training vanishing from the chart would be a worse lie than admitting
 * the tags aren't filled in.
 */
export const UNTAGGED_GROUP = 'Untagged'

export function muscleBalance(
    logs: WorkoutLog[],
    groupOf: (name: string) => string | undefined,
    since?: string
): GroupLoad[] {
    const byGroup = new Map<string, GroupLoad & { dates: Set<string> }>()

    for (const log of logs) {
        if (since && log.date < since) continue

        for (const exercise of log.exercises ?? []) {
            const group = groupOf(exercise.name) || UNTAGGED_GROUP
            const entry: GroupLoad & { dates: Set<string> } = byGroup.get(group) ?? {
                group,
                sessions: 0,
                sets: 0,
                volumeKg: 0,
                dates: new Set<string>(),
            }

            let touched = false
            for (const set of exercise.loggedSets ?? []) {
                const volume = setVolume(set)
                if (volume === 0) continue
                entry.sets += 1
                entry.volumeKg += volume
                touched = true
            }

            if (touched) {
                entry.dates.add(log.date)
                byGroup.set(group, entry)
            }
        }
    }

    return [...byGroup.values()]
        .map(({ dates, ...rest }) => ({ ...rest, sessions: dates.size }))
        .sort((a, b) => b.volumeKg - a.volumeKg || a.group.localeCompare(b.group))
}

/** Conditioning over a stretch of time, and how it splits by category. */
export interface ConditioningSummary {
    sessions: number
    minutes: number
    /** Mean RPE across the sessions that recorded one. Null when none did. */
    avgRpe: number | null
    longest: ConditioningLog | null
    byCategory: { category: ConditioningCategory; sessions: number; minutes: number }[]
}

export function conditioningSummary(
    logs: ConditioningLog[],
    since?: string,
    until?: string
): ConditioningSummary {
    const inRange = logs.filter(
        (l) => (!since || l.date >= since) && (!until || l.date <= until)
    )

    const byCategory = new Map<ConditioningCategory, { sessions: number; minutes: number }>()
    let minutes = 0
    let rpeTotal = 0
    let rpeCount = 0
    let longest: ConditioningLog | null = null

    for (const log of inRange) {
        minutes += log.duration ?? 0
        if (log.rpe != null) {
            rpeTotal += log.rpe
            rpeCount += 1
        }
        if (!longest || (log.duration ?? 0) > (longest.duration ?? 0)) longest = log

        const entry = byCategory.get(log.category) ?? { sessions: 0, minutes: 0 }
        entry.sessions += 1
        entry.minutes += log.duration ?? 0
        byCategory.set(log.category, entry)
    }

    return {
        sessions: inRange.length,
        minutes,
        avgRpe: rpeCount > 0 ? rpeTotal / rpeCount : null,
        longest,
        byCategory: [...byCategory.entries()]
            .map(([category, v]) => ({ category, ...v }))
            .sort((a, b) => b.minutes - a.minutes || a.category.localeCompare(b.category)),
    }
}

/**
 * Below this, a change in the weight trend over a whole range is noise: water,
 * salt, and where in the week the last weigh-in landed.
 */
export const FLAT_WEIGHT_KG = 0.75

export type WeightDirection = 'down' | 'flat' | 'up' | 'unknown'

/** Which way the scale went over a range, given the change in its smoothed trend. */
export function weightDirection(deltaKg: number | null): WeightDirection {
    if (deltaKg === null || !Number.isFinite(deltaKg)) return 'unknown'
    if (deltaKg <= -FLAT_WEIGHT_KG) return 'down'
    if (deltaKg >= FLAT_WEIGHT_KG) return 'up'
    return 'flat'
}

/** A plain reading of the two signals together. */
export interface StrengthWeightRead {
    headline: string
    detail: string
    tone: 'good' | 'warn' | 'bad' | 'neutral'
}

/**
 * Is the training holding up while the scale moves?
 *
 * Two signals, nine combinations, no score. This deliberately stops well short
 * of `transformation.ts`, which reads the same question with the waist tape, the
 * intended rate and how well intake was actually logged, and can therefore say
 * more than this can. What this will not do is contradict it: every line below
 * is a description of the two inputs it was given, not a recommendation about
 * calories — which is the nutrition module's call, made on more evidence.
 */
export function holdingUp(
    strength: PerformanceStatus,
    direction: WeightDirection
): StrengthWeightRead {
    if (strength === 'insufficient-data') {
        return {
            headline: 'Not enough sessions to read',
            detail:
                'The lifts need a couple of sessions in each of two six-week windows before a trend means anything. Keep logging weights and this fills itself in.',
            tone: 'neutral',
        }
    }

    if (direction === 'unknown') {
        return {
            headline: `Strength ${strength}`,
            detail:
                'No weight trend to read it against — log a few weigh-ins on the Body tab and the two can be compared.',
            tone: strength === 'declining' ? 'bad' : strength === 'improving' ? 'good' : 'neutral',
        }
    }

    if (strength === 'improving') {
        if (direction === 'down') {
            return {
                headline: 'Losing weight, gaining strength',
                detail:
                    'The best outcome available: what is leaving is very unlikely to be muscle. Nothing here argues for changing anything.',
                tone: 'good',
            }
        }
        if (direction === 'flat') {
            return {
                headline: 'Recomposition',
                detail:
                    'The scale is still and the lifts are rising — the one pattern that looks exactly like a stall and is the opposite of one.',
                tone: 'good',
            }
        }
        return {
            headline: 'Gaining, and it is going somewhere',
            detail: 'Weight up and strength up together is a lean bulk doing its job.',
            tone: 'good',
        }
    }

    if (strength === 'stable') {
        if (direction === 'down') {
            return {
                headline: 'Strength held through the loss',
                detail:
                    'Holding a lift while the weight comes off is the good outcome, not the boring one — it is the evidence the deficit is the right size.',
                tone: 'good',
            }
        }
        if (direction === 'flat') {
            return {
                headline: 'Holding on both',
                detail:
                    'Weight and strength both steady. Fine as maintenance; if this was meant to be a training block, the volume is the place to look.',
                tone: 'neutral',
            }
        }
        return {
            headline: 'Weight up, strength flat',
            detail:
                'The gain has not bought anything yet. Worth a few more weeks before reading much into it — strength lags a surplus.',
            tone: 'warn',
        }
    }

    if (direction === 'down') {
        return {
            headline: 'Strength falling as the weight comes off',
            detail:
                'The early sign of a deficit that has gone too steep. Protein, sleep and keeping the heavy sets heavy are the usual fixes before cutting further.',
            tone: 'bad',
        }
    }
    if (direction === 'flat') {
        return {
            headline: 'Strength falling on a steady weight',
            detail:
                'Not a food problem, on this evidence. Sessions logged, sleep and recovery are the places to look.',
            tone: 'bad',
        }
    }
    return {
        headline: 'Weight up, strength down',
        detail:
            'Gaining without the lifts following is the one combination worth acting on quickly — check session count and how hard the top sets actually are.',
        tone: 'bad',
    }
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}
