import type { DailyEnergy, FitnessPlanEntry } from '../types'
import { addDays } from './calendar'
import { classifyDay, type DayType } from './nutritionTargets'

/**
 * What a day is likely to burn, before the watch says.
 *
 * A day's calorie target is its calories out plus the phase's planned balance
 * (lib/nutritionTargets.ts targetsFromOut). The real figure only arrives once
 * the day is over, which is too late to plan meals around. So until then the
 * day borrows a figure from your own history: the average logged burn of
 * recent days that trained the same way — rest, training, or hard.
 *
 * It reads only your watch's own totals, never a formula, and only days that
 * have actually been logged. With too few of the same kind it falls back to the
 * average of every logged day; with too few of those, there's no forecast and
 * the day keeps the phase's fixed target.
 */

/** How far back the forecast looks. */
export const FORECAST_WINDOW_DAYS = 28

/** Logged days of a kind needed before their average is trusted. */
export const MIN_FORECAST_SAMPLES = 3

export interface BurnForecast {
    /** Expected calories out for the day. */
    kcal: number
    /** How the day trains — the bucket the figure came from. */
    dayType: DayType
    /** 'day-type' when same-kind days were enough, else every logged day. */
    basis: 'day-type' | 'all-days'
    /** Logged days the average rests on. */
    samples: number
}

/**
 * How a day trains, for bucketing burns. Skipped sessions don't count — a day
 * whose session was skipped burned like a rest day — and a day with nothing on
 * the planner is a rest day here, unlike in `classifyDay`, which keeps that
 * distinction for the activity modifier.
 */
export function burnDayType(date: string, fitness: FitnessPlanEntry[]): DayType {
    return classifyDay(date, fitness.filter((e) => !e.skipped)) ?? 'rest'
}

/**
 * Expected calories out on `date`, from the logged days in the four weeks
 * before it — or before today, for a day still ahead. Null when there's not
 * enough logged to go on.
 */
export function forecastBurn(
    date: string,
    energy: DailyEnergy[],
    fitness: FitnessPlanEntry[],
    today: string
): BurnForecast | null {
    // A day ahead can only use what's happened; a past day uses what came before it.
    const anchor = date < today ? date : today
    const from = addDays(anchor, -FORECAST_WINDOW_DAYS)
    const history = energy.filter((e) => e.date >= from && e.date < anchor && e.caloriesOut > 0)
    if (history.length < MIN_FORECAST_SAMPLES) return null

    const dayType = burnDayType(date, fitness)
    const same = history.filter((e) => burnDayType(e.date, fitness) === dayType)
    const pool = same.length >= MIN_FORECAST_SAMPLES ? same : history

    return {
        kcal: Math.round(pool.reduce((s, e) => s + e.caloriesOut, 0) / pool.length),
        dayType,
        basis: pool === same ? 'day-type' : 'all-days',
        samples: pool.length,
    }
}

/** A day's calories out for its target: the logged figure, else the forecast. */
export interface DayOut {
    /** What the target is built from: the watch's figure times its correction. */
    kcal: number
    /** The watch's own figure (or the forecast of it), before correction. */
    watch: number
    /** Whether it's a forecast rather than the logged figure. */
    expected: boolean
    /** Whether a correction other than 1 was applied (lib/watchCalibration.ts). */
    adjusted: boolean
}

/**
 * `factor` is the watch's personal correction (lib/watchCalibration.ts). The
 * forecast is averaged in the watch's own terms and corrected the same way as
 * a logged figure, so the two never disagree about the watch.
 */
export function outForTarget(
    date: string,
    energy: DailyEnergy[],
    fitness: FitnessPlanEntry[],
    today: string,
    factor = 1
): DayOut | null {
    const logged = energy.find((e) => e.date === date)?.caloriesOut
    const watch = logged && logged > 0 ? logged : forecastBurn(date, energy, fitness, today)?.kcal
    if (!watch) return null
    return {
        kcal: Math.round(watch * factor),
        watch,
        expected: !(logged && logged > 0),
        adjusted: factor !== 1,
    }
}
