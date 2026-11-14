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
    return smooth(logs, (log) => log.weight, alpha).map(({ date, value, trend }) => ({
        date,
        weight: value,
        trend,
    }))
}

/** A body-fat reading paired with the smoothed trend on that date. */
export interface BodyFatPoint {
    date: string
    /** The raw reading, as a percentage of bodyweight. */
    bodyFat: number
    /** The smoothed trend, in percentage points. */
    trend: number
}

/**
 * The same smoothing over body fat, for the weigh-ins that recorded it.
 *
 * Body-fat readings are noisier than the scale, not less — impedance scales
 * swing with hydration, calipers with whoever holds them — so a single number is
 * meaningless and only the trend is worth reading. Days without a reading are
 * skipped entirely rather than carried forward, so measuring fortnightly gives a
 * fortnightly series rather than a flat line between points.
 */
export function bodyFatSeries(logs: WeightLog[], alpha = DAILY_ALPHA): BodyFatPoint[] {
    return smooth(logs, (log) => log.bodyFat, alpha).map(({ date, value, trend }) => ({
        date,
        bodyFat: value,
        trend,
    }))
}

/**
 * Fold the gap-aware exponential moving average over whichever measure `pick`
 * returns, skipping logs where it is missing or nonsensical. Shared so the
 * weight and body-fat trends can never drift apart.
 */
function smooth(
    logs: WeightLog[],
    pick: (log: WeightLog) => number | undefined,
    alpha: number
): { date: string; value: number; trend: number }[] {
    const byDate = new Map<string, number>()
    for (const log of logs) {
        const value = pick(log)
        if (value === undefined || !Number.isFinite(value) || value <= 0) continue
        byDate.set(log.date, value)
    }

    const dates = [...byDate.keys()].sort()
    const points: { date: string; value: number; trend: number }[] = []
    let trend = 0

    dates.forEach((date, i) => {
        const value = byDate.get(date)!
        if (i === 0) {
            trend = value
        } else {
            const gap = Math.max(1, daysBetween(dates[i - 1], date))
            const effective = 1 - Math.pow(1 - alpha, gap)
            trend += effective * (value - trend)
        }
        points.push({ date, value, trend })
    })

    return points
}

/**
 * Rate of change of the trend in kg/week over the `windowDays` ending at the
 * last weigh-in. Measured between the trend at each end of the window — not
 * between raw readings — so a heavy day at either end doesn't invent a result.
 *
 * The window's start anchors to the earliest point on or after the cutoff, and
 * the rate is divided by the days actually spanned. Returns null until the
 * points span a week: two readings a couple of days apart, scaled up to a
 * week, is water and nothing else.
 */
export function weeklyRate(points: TrendPoint[], windowDays = 28): number | null {
    if (points.length < 2) return null

    const last = points[points.length - 1]
    const cutoff = addDaysIso(last.date, -windowDays)
    const first = points.find((p) => p.date >= cutoff) ?? points[0]

    const span = daysBetween(first.date, last.date)
    if (span < MIN_RATE_SPAN_DAYS) return null

    return ((last.trend - first.trend) / span) * 7
}

/** Fewest days the trend must span before its slope is quoted as a weekly rate. */
export const MIN_RATE_SPAN_DAYS = 7

/**
 * How many days the trend runs behind the readings at its last point.
 *
 * Smoothing buys a steady line at the price of a late one: while weight is
 * moving, the trend sits where the body was several days ago (about five and a
 * half at daily weigh-ins, fewer when they're sparse). Measured by folding the
 * same average over the dates themselves, so it's exact for whatever pattern of
 * weigh-ins there is.
 */
export function trendLagDays(points: { date: string }[], alpha = DAILY_ALPHA): number {
    if (points.length < 2) return 0
    const origin = points[0].date
    let smoothed = 0
    let prev = 0
    for (const p of points.slice(1)) {
        const x = daysBetween(origin, p.date)
        const gap = Math.max(1, x - prev)
        smoothed += (1 - Math.pow(1 - alpha, gap)) * (x - smoothed)
        prev = x
    }
    return prev - smoothed
}

/**
 * Where the body is now, rather than where the trend line has got to: the last
 * trend value carried forward by its own lag at the current rate. On a steady
 * half-kilo-a-week cut the trend reads about 0.4 kg heavy; anything projected
 * from it starts that far behind. Falls back to the trend itself until there's
 * a rate to carry it with.
 */
export function settledWeight(points: TrendPoint[], windowDays = 28): number | null {
    if (points.length === 0) return null
    const last = points[points.length - 1]
    const rate = weeklyRate(points, windowDays)
    if (rate === null) return last.trend
    const cutoff = addDaysIso(last.date, -windowDays)
    const lag = trendLagDays(points.filter((p) => p.date >= cutoff))
    return last.trend + (rate / 7) * lag
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
    if (target === last.trend) return last.date
    // Moving away from the target (or the wrong way past it) never arrives.
    if (Math.sign(target - last.trend) !== Math.sign(ratePerWeek)) return null

    // Count from where the body is, not where the lagging trend line has got to:
    // at this rate the line is `lag` days behind, so the date comes that much sooner.
    const cutoff = addDaysIso(last.date, -28)
    const lag = trendLagDays(points.filter((p) => p.date >= cutoff))
    const remaining = target - (last.trend + (ratePerWeek / 7) * lag)
    // The body is already there; the line just hasn't caught up.
    if (Math.sign(remaining) !== Math.sign(ratePerWeek)) return last.date

    const weeks = remaining / ratePerWeek
    return addDaysIso(last.date, Math.ceil(weeks * 7))
}

/**
 * How the observed rate compares to the intended one. 'no-goal' when no rate is
 * set, 'stalled' when barely moving, 'gaining'/'losing' when moving the wrong
 * way, 'on-track' within a quarter-kilo a week of target, else 'slow'/'fast'.
 */
export type RateStatus =
    | 'no-goal'
    | 'no-data'
    | 'on-track'
    | 'slow'
    | 'fast'
    | 'stalled'
    | 'wrong-way'

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
