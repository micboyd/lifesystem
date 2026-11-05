import type { DailyEnergy } from '../types'
import { measuredMaintenance, MAINTENANCE_WINDOW_DAYS, MIN_INTAKE_DAYS, type IntakeByDate } from './energy'
import { addDays } from './calendar'
import type { TrendPoint } from './weightTrend'

/**
 * How far your watch's calories out can be trusted, read off the scale.
 *
 * Watches tend to overstate burn, and a target built as "calories out less the
 * planned deficit" inherits the error in full: a watch 8% high on a 3,400 day
 * hands back 270 kcal of a deficit that was never there. So the figure isn't
 * taken on trust. Over the same four weeks:
 *
 *   - the scale and the food log say what you really burned on average —
 *     maintenance = average intake − the imbalance the weight trend implies
 *     (energy.ts measuredMaintenance), and
 *   - the watch says what it thinks you burned.
 *
 * Their ratio is your watch's personal correction, and every calories out is
 * multiplied by it before a target is built. Only days with both a food log
 * and a burn count, so the two averages cover the same days.
 *
 * It is clamped, and ignored close to 1: a fortnight of data can't tell a 2%
 * error from noise, and an unlogged snack (which reads as a low maintenance)
 * shouldn't be able to drag every target down a long way.
 */

/** The correction is never taken past these. */
export const FACTOR_MIN = 0.8
export const FACTOR_MAX = 1.1

/** Within this of 1, the watch is called accurate rather than corrected by noise. */
export const FACTOR_DEADBAND = 0.03

export interface WatchCalibration {
    /** Multiply calories out by this. 1 means the watch is taken as it is. */
    factor: number
    /** The ratio before clamping and the deadband, for showing. */
    raw: number
    /** What the scale and food log say you burn a day. */
    maintenance: number
    /** What the watch said, on average, over the same days. */
    avgOut: number
    /** Days with both a food log and a burn. */
    days: number
}

export type CalibrationGap = 'not-enough-days' | 'not-enough-weight'

/**
 * The correction as of `today`, from the four weeks before it. A gap when
 * there's not enough to go on, in which case calories out is used as it is.
 */
export function watchCalibration(
    intake: IntakeByDate,
    energy: DailyEnergy[],
    points: TrendPoint[],
    today: string
): WatchCalibration | CalibrationGap {
    const from = addDays(today, -MAINTENANCE_WINDOW_DAYS)
    const outBy = new Map(energy.filter((e) => e.caloriesOut > 0).map((e) => [e.date, e.caloriesOut]))

    // Only days with both — so intake and burn are averaged over the same days.
    const paired: IntakeByDate = new Map()
    for (const [date, kcal] of intake) {
        if (date >= from && date < today && outBy.has(date)) paired.set(date, kcal)
    }
    if (paired.size < MIN_INTAKE_DAYS) return 'not-enough-days'

    const before = points.filter((p) => p.date < today)
    const maintenance = measuredMaintenance(paired, before, MAINTENANCE_WINDOW_DAYS, addDays(today, -1))
    if (typeof maintenance === 'string') {
        return maintenance === 'not-enough-weight' ? 'not-enough-weight' : 'not-enough-days'
    }

    const outs = [...paired.keys()].map((d) => outBy.get(d)!)
    const avgOut = outs.reduce((a, b) => a + b, 0) / outs.length
    const raw = maintenance.kcal / avgOut
    const clamped = Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, raw))
    const factor = Math.abs(clamped - 1) < FACTOR_DEADBAND ? 1 : Math.round(clamped * 100) / 100

    return {
        factor,
        raw: Math.round(raw * 1000) / 1000,
        maintenance: Math.round(maintenance.kcal),
        avgOut: Math.round(avgOut),
        days: paired.size,
    }
}

/** The correction to apply: the factor, or 1 when there isn't one. */
export function factorOf(c: WatchCalibration | CalibrationGap | null | undefined): number {
    return c && typeof c === 'object' ? c.factor : 1
}
