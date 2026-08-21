import { daysBetween, weeklyRate, trendSeries, type TrendPoint } from './weightTrend'
import type { WeightLog } from '../types'

/**
 * What the scale is actually doing.
 *
 * `weightTrend.ts` smooths the readings; this reads a decision off them. The
 * difference matters because the two have different failure modes: a smoothed
 * line always exists, while a *rate* worth acting on needs enough readings, over
 * enough days, to outrun the two kilos of water a single week can swing.
 *
 * Everything here returns null rather than zero when the data won't support an
 * answer. A stall and a fortnight of not weighing look identical on a chart and
 * mean opposite things, and only one of them is a reason to eat less.
 */

/** The averaging window shown to the user. A week cancels the weekday pattern. */
export const AVERAGE_WINDOW_DAYS = 7

/** The window the headline rate is measured over. */
export const RATE_WINDOW_DAYS = 28

/** Fewest readings in a window before its average is worth quoting. */
export const MIN_AVERAGE_READINGS = 2

/**
 * How far the averaging window may stretch when the last seven days are too
 * sparse to average. Weighing every ninth day should still get you a number;
 * it just shouldn't get you one labelled as a week's worth.
 */
export const MAX_AVERAGE_WINDOW_DAYS = 14

/** Fewest readings before a regression is fitted rather than refused. */
export const MIN_RATE_READINGS = 6

/** Fewest days the readings must span before a rate means anything. */
export const MIN_RATE_SPAN_DAYS = 10

/** The mean of the readings in a window, and how many there were. */
export interface WindowAverage {
    kg: number
    readings: number
    /** Inclusive YYYY-MM-DD bounds of the window actually used. */
    from: string
    to: string
    /** Days the window spans. 7 normally; more when it had to stretch. */
    days: number
}

/** Why a weight trend couldn't be produced. */
export type TrendGap = 'no-weights' | 'too-few-readings' | 'too-short-a-span'

export interface WeightTrend {
    /**
     * The headline number: mean of the last seven days' readings, over a window
     * stretched further back only when a week held too few to average.
     */
    current: WindowAverage
    /** The seven days before that, when there were readings in it. */
    previous: WindowAverage | null
    /** current − previous, in kg. Null without a previous window. */
    weekChangeKg: number | null
    /**
     * kg/week from a least-squares fit over the 28-day window, signed. Null when
     * the readings are too few or too clustered to fit a line to.
     */
    rateKgPerWeek: number | null
    /** The same rate read off the smoothed line, as a cross-check. Null likewise. */
    smoothedRateKgPerWeek: number | null
    /** Readings the rate rests on, and the days they span. */
    rateReadings: number
    rateSpanDays: number
    /** The most recent raw reading, which is not the number to act on. */
    latest: { date: string; kg: number }
}

/** One reading reduced to what the maths needs. */
interface Reading {
    date: string
    kg: number
}

/** Weigh-ins as clean readings, deduped by date (last wins) and sorted. */
function readingsOf(logs: WeightLog[]): Reading[] {
    const byDate = new Map<string, number>()
    for (const log of logs) {
        if (!Number.isFinite(log.weight) || log.weight <= 0) continue
        byDate.set(log.date, log.weight)
    }
    return [...byDate.entries()]
        .map(([date, kg]) => ({ date, kg }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Mean of the readings in the `days` ending at `end`, inclusive, or null when
 * there are too few. Days without a reading are absent, not zero — the average
 * is over what was measured, not over the calendar.
 *
 * When the preferred window holds fewer than two readings it widens, up to
 * `maxDays`, rather than giving up: someone who weighs every ninth day is still
 * owed a number. The window it settled on comes back in `days`, so nothing
 * downstream has to pretend a fortnight's span was a week's.
 */
function averageEnding(
    readings: Reading[],
    end: string,
    days: number,
    maxDays = days
): WindowAverage | null {
    for (let span = days; span <= maxDays; span++) {
        const from = addDaysIso(end, -(span - 1))
        const inWindow = readings.filter((r) => r.date >= from && r.date <= end)
        if (inWindow.length < MIN_AVERAGE_READINGS) continue
        const kg = inWindow.reduce((sum, r) => sum + r.kg, 0) / inWindow.length
        return { kg, readings: inWindow.length, from, to: end, days: span }
    }
    return null
}

/**
 * Least-squares slope of kg against day, converted to kg/week.
 *
 * A regression rather than first-minus-last because the endpoints are exactly
 * the two readings most able to lie: land the window on a heavy Monday and a
 * light Sunday and the naive difference invents half a kilo that never existed.
 * Every reading pulls on a fitted line, so one bad morning moves it a little
 * instead of setting it.
 */
export function regressionRate(readings: Reading[]): number | null {
    if (readings.length < MIN_RATE_READINGS) return null

    const origin = readings[0].date
    const xs = readings.map((r) => daysBetween(origin, r.date))
    const span = xs[xs.length - 1] - xs[0]
    if (span < MIN_RATE_SPAN_DAYS) return null

    const n = readings.length
    const meanX = xs.reduce((a, b) => a + b, 0) / n
    const meanY = readings.reduce((sum, r) => sum + r.kg, 0) / n

    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX
        num += dx * (readings[i].kg - meanY)
        den += dx * dx
    }
    if (den === 0) return null

    return (num / den) * 7
}

/**
 * Read the scale: this week's average, last week's, and the rate underneath
 * both.
 *
 * `asOf` anchors the windows, defaulting to the last weigh-in so the numbers
 * don't evaporate after a few days away from the scale — though the rate will
 * quietly stop updating, which is the honest outcome of not measuring.
 */
export function weightTrend(logs: WeightLog[], asOf?: string): WeightTrend | TrendGap {
    const readings = readingsOf(logs)
    if (readings.length === 0) return 'no-weights'

    const latest = readings[readings.length - 1]
    const end = asOf ?? latest.date

    const current = averageEnding(
        readings,
        end,
        AVERAGE_WINDOW_DAYS,
        MAX_AVERAGE_WINDOW_DAYS
    )
    if (!current) return 'too-few-readings'

    // The previous window ends the day before the current one begins, so the two
    // never share a reading however far the current one had to stretch.
    const previous = averageEnding(
        readings,
        addDaysIso(current.from, -1),
        current.days,
        MAX_AVERAGE_WINDOW_DAYS
    )

    const rateFrom = addDaysIso(end, -(RATE_WINDOW_DAYS - 1))
    const inRateWindow = readings.filter((r) => r.date >= rateFrom && r.date <= end)
    const rateSpanDays =
        inRateWindow.length > 1
            ? daysBetween(inRateWindow[0].date, inRateWindow[inRateWindow.length - 1].date)
            : 0

    return {
        current,
        previous,
        weekChangeKg: previous ? current.kg - previous.kg : null,
        rateKgPerWeek: regressionRate(inRateWindow),
        smoothedRateKgPerWeek: weeklyRate(trendSeries(logs), RATE_WINDOW_DAYS),
        rateReadings: inRateWindow.length,
        rateSpanDays,
        latest: { date: latest.date, kg: latest.kg },
    }
}

/**
 * The rate to steer by, or null.
 *
 * The regression is the primary signal; the smoothed line stands in when there
 * are too few readings to fit one, since it uses history from before the window
 * and so survives a sparse month. Both being absent means the honest answer is
 * that nobody knows yet.
 */
export function usableRate(trend: WeightTrend | TrendGap): number | null {
    if (typeof trend === 'string') return null
    return trend.rateKgPerWeek ?? trend.smoothedRateKgPerWeek
}

/** The headline weight, or null when there isn't a defensible one. */
export function currentWeight(trend: WeightTrend | TrendGap): number | null {
    return typeof trend === 'string' ? null : trend.current.kg
}

// ── Body composition ─────────────────────────────────────────────────────────

export interface Composition {
    date: string
    weightKg: number
    bodyFatPct: number
    /** weight × bf% — an estimate resting on a consumer impedance reading. */
    fatMassKg: number
    /** weight − fat mass, likewise an estimate. */
    leanMassKg: number
}

/**
 * Fat and lean mass for every weigh-in that measured body fat.
 *
 * Both figures are arithmetic on a number a bathroom scale guessed from a small
 * current through your feet, and they move with hydration as much as with
 * tissue. They earn their place over months, comparing like with like — a
 * fortnight of lean mass "gain" during a deficit is the scale changing its mind,
 * not you building muscle — which is why nothing downstream lets them touch a
 * calorie target.
 */
export function compositionSeries(logs: WeightLog[]): Composition[] {
    return logs
        .filter(
            (l) =>
                Number.isFinite(l.weight) &&
                l.weight > 0 &&
                l.bodyFat !== undefined &&
                Number.isFinite(l.bodyFat) &&
                l.bodyFat > 0 &&
                l.bodyFat < 100
        )
        .map((l) => {
            const fatMassKg = (l.weight * l.bodyFat!) / 100
            return {
                date: l.date,
                weightKg: l.weight,
                bodyFatPct: l.bodyFat!,
                fatMassKg,
                leanMassKg: l.weight - fatMassKg,
            }
        })
        .sort((a, b) => a.date.localeCompare(b.date))
}

export interface CompositionChange {
    first: Composition
    last: Composition
    /** Signed change in kg across the span. Negative is loss. */
    fatMassKg: number
    leanMassKg: number
    bodyFatPct: number
    days: number
}

/** Fewest days two body-fat readings must span before comparing them says anything. */
export const MIN_COMPOSITION_SPAN_DAYS = 28

/**
 * Change in composition between the first and last readings, when they're far
 * enough apart to mean something. Null otherwise — comparing two impedance
 * readings a week apart measures how much you drank, and reporting it as
 * muscle gained or lost would be worse than saying nothing.
 */
export function compositionChange(series: Composition[]): CompositionChange | null {
    if (series.length < 2) return null
    const first = series[0]
    const last = series[series.length - 1]
    const days = daysBetween(first.date, last.date)
    if (days < MIN_COMPOSITION_SPAN_DAYS) return null

    return {
        first,
        last,
        fatMassKg: last.fatMassKg - first.fatMassKg,
        leanMassKg: last.leanMassKg - first.leanMassKg,
        bodyFatPct: last.bodyFatPct - first.bodyFatPct,
        days,
    }
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}

export type { TrendPoint }
