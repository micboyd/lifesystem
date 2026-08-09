import type { WeightLog } from '../types'

/**
 * Smoothing applied per calendar day. Daily bodyweight swings by a kilo or more
 * on water, glycogen and gut contents, so the raw scale reading is close to
 * useless day to day — what moves with actual fat is the smoothed line. 0.15
 * gives a trend roughly as responsive as a one-week average while still using
 * every reading.
 */
export const DAILY_ALPHA = 0.15

/** A weigh-in paired with the smoothed trend value on that date. */
export interface TrendPoint {
    date: string
    /** The raw scale reading, kg. */
    weight: number
    /** The smoothed trend, kg. */
    trend: number
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
    const a = Date.parse(`${from}T00:00:00Z`)
    const b = Date.parse(`${to}T00:00:00Z`)
    return Math.round((b - a) / 86_400_000)
}

/**
 * Fold an exponential moving average over the weigh-ins, oldest first.
 *
 * Gaps are handled by compounding the smoothing across the days missed —
 * `1 - (1 - alpha)^gap` — so a reading after a fortnight away pulls the trend
 * most of the way to itself, rather than being damped as if it were the next
 * morning. That keeps the line honest whether you weigh daily or sporadically.
 *
 * Input need not be sorted; the result always is. Duplicate dates keep the last
 * reading given for that date.
 */
export function trendSeries(logs: WeightLog[], alpha = DAILY_ALPHA): TrendPoint[] {
    const byDate = new Map<string, number>()
    for (const log of logs) {
        if (!Number.isFinite(log.weight) || log.weight <= 0) continue
        byDate.set(log.date, log.weight)
    }

    const dates = [...byDate.keys()].sort()
    const points: TrendPoint[] = []
    let trend = 0

    dates.forEach((date, i) => {
        const weight = byDate.get(date)!
        if (i === 0) {
            trend = weight
        } else {
            const gap = Math.max(1, daysBetween(dates[i - 1], date))
            const effective = 1 - Math.pow(1 - alpha, gap)
            trend += effective * (weight - trend)
        }
        points.push({ date, weight, trend })
    })

    return points
}

/**
 * Rate of change of the trend in kg/week over the `windowDays` ending at the
 * last weigh-in. Measured between the trend at each end of the window — not
 * between raw readings — so a heavy day at either end doesn't invent a result.
 *
 * The window's start anchors to the earliest point on or after the cutoff, and
 * the rate is divided by the days actually spanned. Returns null until there are
 * two points at least a day apart.
 */
export function weeklyRate(points: TrendPoint[], windowDays = 28): number | null {
    if (points.length < 2) return null

    const last = points[points.length - 1]
    const cutoff = addDaysIso(last.date, -windowDays)
    const first = points.find((p) => p.date >= cutoff) ?? points[0]

    const span = daysBetween(first.date, last.date)
    if (span < 1) return null

    return ((last.trend - first.trend) / span) * 7
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Calendar date the trend reaches `target` at the current rate, or null when it
 * never will — no rate, a flat trend, or a rate pointing away from the target.
 * Already being past the target returns the last weigh-in date.
 */
export function projectTargetDate(
    points: TrendPoint[],
    target: number,
    ratePerWeek: number | null
): string | null {
    if (points.length === 0 || !ratePerWeek) return null

    const last = points[points.length - 1]
    const remaining = target - last.trend
    if (remaining === 0) return last.date
    // Moving away from the target (or the wrong way past it) never arrives.
    if (Math.sign(remaining) !== Math.sign(ratePerWeek)) return null

    const weeks = remaining / ratePerWeek
    return addDaysIso(last.date, Math.ceil(weeks * 7))
}

/**
 * How the observed rate compares to the intended one. 'no-goal' when no rate is
 * set, 'stalled' when barely moving, 'gaining'/'losing' when moving the wrong
 * way, 'on-track' within a quarter-kilo a week of target, else 'slow'/'fast'.
 */
export type RateStatus = 'no-goal' | 'no-data' | 'on-track' | 'slow' | 'fast' | 'stalled' | 'wrong-way'

/** Below this, a week's movement is noise rather than progress (kg/week). */
const STALL_THRESHOLD = 0.05

/** How far from the intended rate still counts as on track (kg/week). */
const ON_TRACK_TOLERANCE = 0.25

export function rateStatus(actual: number | null, intended?: number): RateStatus {
    if (actual === null) return 'no-data'
    if (!intended) return 'no-goal'

    if (Math.abs(actual) < STALL_THRESHOLD) return 'stalled'
    if (Math.sign(actual) !== Math.sign(intended)) return 'wrong-way'

    const diff = Math.abs(actual) - Math.abs(intended)
    if (Math.abs(diff) <= ON_TRACK_TOLERANCE) return 'on-track'
    return diff < 0 ? 'slow' : 'fast'
}

/**
 * The same rate as a percentage of current bodyweight per week — the figure
 * that says whether a cut is aggressive, since 0.5 kg/week means something very
 * different at 60 kg and at 110 kg. Returns null without a rate or a weight.
 */
export function ratePercent(points: TrendPoint[], ratePerWeek: number | null): number | null {
    if (ratePerWeek === null || points.length === 0) return null
    const current = points[points.length - 1].trend
    if (current <= 0) return null
    return (ratePerWeek / current) * 100
}
