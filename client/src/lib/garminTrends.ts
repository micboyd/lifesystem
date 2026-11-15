/**
 * Long-term trends from the watch's daily history: each measure averaged by
 * week or by month so years of days read as one line, and a few plain figures
 * (the average, the last four weeks, the change across the range) to go with it.
 * Pure — no dates from the clock, no formatting.
 */

/** One day of watch data. A measure that's absent is unknown, not zero. */
export interface WatchDay {
    date: string
    steps?: number
    /** Whole-day calories burned: resting plus active. */
    kcal?: number
    activeKcal?: number
    sleepMin?: number
    sleepScore?: number
    restingHr?: number
}

export type TrendMetric = 'kcal' | 'activeKcal' | 'steps' | 'sleepMin' | 'sleepScore' | 'restingHr'

/**
 * Measures that keep climbing through the day. Today's figure for these is
 * only what's happened so far, so today is left out of every average.
 */
const RUNNING_TOTALS: ReadonlySet<TrendMetric> = new Set(['kcal', 'activeKcal', 'steps'])

export type Bucket = 'week' | 'month'

export interface TrendPoint {
    /** The first day of the week (a Monday) or month. */
    date: string
    /** The average per day, over the days that had a figure. */
    value: number
    /** How many days had a figure. */
    days: number
}

const DAY_MS = 86_400_000
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`)
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function addDaysIso(date: string, n: number): string {
    return toKey(toMs(date) + n * DAY_MS)
}

/** The Monday on or before a date. */
export function weekStart(date: string): string {
    const ms = toMs(date)
    const dow = (new Date(ms).getUTCDay() + 6) % 7
    return toKey(ms - dow * DAY_MS)
}

export function bucketStart(date: string, bucket: Bucket): string {
    return bucket === 'week' ? weekStart(date) : `${date.slice(0, 7)}-01`
}

/** A week with only a day or two of readings isn't a week's average. */
const MIN_DAYS: Record<Bucket, number> = { week: 3, month: 8 }

/** The days in from–to (inclusive) that have a usable figure for the metric. */
export function metricDays(
    days: WatchDay[],
    metric: TrendMetric,
    from: string,
    to: string,
    today: string
): { date: string; value: number }[] {
    const out: { date: string; value: number }[] = []
    for (const d of days) {
        if (d.date < from || d.date > to) continue
        if (d.date === today && RUNNING_TOTALS.has(metric)) continue
        const value = d[metric]
        if (typeof value === 'number' && value > 0) out.push({ date: d.date, value })
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Average per day for each week or month that has enough days to mean something. */
export function bucketAverages(values: { date: string; value: number }[], bucket: Bucket): TrendPoint[] {
    const sums = new Map<string, { total: number; days: number }>()
    for (const v of values) {
        const key = bucketStart(v.date, bucket)
        const sum = sums.get(key) ?? { total: 0, days: 0 }
        sum.total += v.value
        sum.days += 1
        sums.set(key, sum)
    }
    return [...sums.entries()]
        .filter(([, s]) => s.days >= MIN_DAYS[bucket])
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, s]) => ({ date, value: s.total / s.days, days: s.days }))
}

/** Weeks while the line can still show them; months once it covers several years. */
export function bucketFor(from: string, to: string): Bucket {
    return (toMs(to) - toMs(from)) / DAY_MS > 365 * 3 ? 'month' : 'week'
}

/** Whether two neighbouring points are next to each other in time, or there's a gap between. */
export function adjoins(a: TrendPoint, b: TrendPoint, bucket: Bucket): boolean {
    const gapDays = (toMs(b.date) - toMs(a.date)) / DAY_MS
    return bucket === 'week' ? gapDays <= 7 : gapDays <= 31
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** How many days the "then" and "now" ends of a range are averaged over. */
export const EDGE_DAYS = 28
/** Fewer readings than this at either end and there's no fair comparison. */
const MIN_EDGE_READINGS = 10

export interface TrendSummary {
    /** Days with a figure in the range. */
    days: number
    average: number | null
    /** The last four weeks of the range. */
    recent: number | null
    /** The first four weeks of data in the range. */
    start: number | null
    /** recent − start, when both ends have enough readings and don't overlap. */
    change: number | null
    firstDate: string | null
    lastDate: string | null
}

export function summarise(values: { date: string; value: number }[], to: string): TrendSummary {
    if (!values.length)
        return { days: 0, average: null, recent: null, start: null, change: null, firstDate: null, lastDate: null }
    const firstDate = values[0].date
    const recentFrom = addDaysIso(to, -(EDGE_DAYS - 1))
    const startTo = addDaysIso(firstDate, EDGE_DAYS - 1)
    const recentVals = values.filter((v) => v.date >= recentFrom).map((v) => v.value)
    const startVals = values.filter((v) => v.date <= startTo).map((v) => v.value)
    const recent = recentVals.length >= MIN_EDGE_READINGS ? mean(recentVals) : null
    const start = startVals.length >= MIN_EDGE_READINGS && startTo < recentFrom ? mean(startVals) : null
    return {
        days: values.length,
        average: mean(values.map((v) => v.value)),
        recent,
        start,
        change: recent !== null && start !== null ? recent - start : null,
        firstDate,
        lastDate: values[values.length - 1].date,
    }
}

/**
 * A y-axis that starts and ends on round numbers, with a few evenly spaced
 * ticks. The floor on the span keeps a nearly flat series from being stretched
 * into drama.
 */
export function niceScale(min: number, max: number, minSpan = 1): { lo: number; hi: number; ticks: number[] } {
    const mid = (min + max) / 2
    const span = Math.max(max - min, minSpan)
    const rough = span / 3
    const pow = 10 ** Math.floor(Math.log10(rough))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow
    let lo = Math.floor((mid - span / 2) / step) * step
    const hi = Math.ceil((mid + span / 2) / step) * step
    if (min >= 0 && lo < 0) lo = 0
    const ticks: number[] = []
    for (let t = lo; t <= hi + step / 1000; t += step) ticks.push(Number(t.toFixed(6)))
    return { lo, hi, ticks }
}
