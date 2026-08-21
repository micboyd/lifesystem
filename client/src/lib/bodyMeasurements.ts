import { daysBetween } from './weightTrend'
import type { BodyMeasurements, MeasurementField, WeightLog } from '../types'

/**
 * Tape-measure readings over time.
 *
 * Waist is the one that earns its keep during a recomp. The scale answers "am I
 * lighter", which is not the question — a kilo of water and a kilo of fat weigh
 * the same and mean opposite things. The tape answers "am I smaller", and
 * through the weeks where the scale sits still on glycogen and salt it keeps
 * moving. Weight flat with waist falling is the signature of the thing working,
 * and no single number shows it.
 *
 * Measurements are sparse by design — weekly at best, and honestly more like
 * fortnightly. So everything here is built to work from a handful of readings
 * spread unevenly across months, and nothing is ever interpolated: a smooth line
 * through invented points would look like diligence and read like data.
 */

/** A single reading of one measurement. */
export interface Reading {
    date: string
    cm: number
}

/** How far back "recent" reaches when quoting a short-term change. */
export const RECENT_WINDOW_DAYS = 28

/** Fewest days two readings must span before their difference means anything. */
export const MIN_SPAN_DAYS = 10

/** Why a measurement trend couldn't be produced. */
export type MeasurementGap = 'none' | 'too-few' | 'too-short-a-span'

export interface MeasurementTrend {
    field: MeasurementField
    /** The most recent reading. */
    current: Reading
    /** The oldest reading held. */
    start: Reading
    /** current − start, in cm. Negative is loss. */
    changeCm: number
    /** Days between the two. */
    spanDays: number
    /**
     * Change across the last four weeks, when there is a reading old enough to
     * compare against. Null when the recent window holds only one reading —
     * which is the honest answer, not zero.
     */
    recentChangeCm: number | null
    /** The reading the recent change was measured from. */
    recentFrom: Reading | null
    /** Change per four weeks implied by the whole span, cm. */
    monthlyRateCm: number | null
    readings: number
}

/** Pull one measurement's readings out of the weigh-ins, cleaned and sorted. */
export function readingsOf(logs: WeightLog[], field: MeasurementField): Reading[] {
    const byDate = new Map<string, number>()
    for (const log of logs) {
        const value = (log as BodyMeasurements)[field]
        if (value === undefined || !Number.isFinite(value) || value <= 0) continue
        byDate.set(log.date, value)
    }
    return [...byDate.entries()]
        .map(([date, cm]) => ({ date, cm }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Read one measurement's history.
 *
 * `asOf` bounds the readings considered, so a historical view doesn't quietly
 * include readings taken after the date being looked at.
 */
export function measurementTrend(
    logs: WeightLog[],
    field: MeasurementField,
    asOf?: string
): MeasurementTrend | MeasurementGap {
    const all = readingsOf(logs, field)
    const readings = asOf ? all.filter((r) => r.date <= asOf) : all

    if (readings.length === 0) return 'none'
    if (readings.length < 2) return 'too-few'

    const start = readings[0]
    const current = readings[readings.length - 1]
    const spanDays = daysBetween(start.date, current.date)
    if (spanDays < MIN_SPAN_DAYS) return 'too-short-a-span'

    // The most recent reading at least four weeks old — the honest comparison
    // point for "this month". Not the nearest reading to 28 days ago, which on
    // sparse data can be two months back and quietly overstate the change.
    const cutoff = addDaysIso(current.date, -RECENT_WINDOW_DAYS)
    const older = readings.filter((r) => r.date <= cutoff)
    const recentFrom = older.length > 0 ? older[older.length - 1] : null

    const changeCm = current.cm - start.cm

    return {
        field,
        current,
        start,
        changeCm,
        spanDays,
        recentChangeCm: recentFrom ? current.cm - recentFrom.cm : null,
        recentFrom,
        monthlyRateCm: (changeCm / spanDays) * 28,
        readings: readings.length,
    }
}

/** Every measurement that has enough history to say something, in field order. */
export function allMeasurementTrends(
    logs: WeightLog[],
    fields: readonly MeasurementField[],
    asOf?: string
): MeasurementTrend[] {
    const out: MeasurementTrend[] = []
    for (const field of fields) {
        const trend = measurementTrend(logs, field, asOf)
        if (typeof trend !== 'string') out.push(trend)
    }
    return out
}

/**
 * Which way a measurement is going, over the month rather than the reading.
 *
 * A single tape measurement moves a centimetre on where you stood and how hard
 * you pulled, so the threshold is deliberately above that: below half a
 * centimetre across four weeks, the honest answer is "flat".
 */
export type MeasurementDirection = 'falling' | 'flat' | 'rising' | 'unknown'

/** Below this, a month's change is measurement error rather than progress (cm). */
export const FLAT_THRESHOLD_CM = 0.5

export function measurementDirection(
    trend: MeasurementTrend | MeasurementGap
): MeasurementDirection {
    if (typeof trend === 'string') return 'unknown'
    // Prefer the last four weeks; fall back to the whole span's monthly rate
    // when the readings are too sparse for a recent comparison.
    const change = trend.recentChangeCm ?? trend.monthlyRateCm
    if (change === null) return 'unknown'
    if (Math.abs(change) < FLAT_THRESHOLD_CM) return 'flat'
    return change < 0 ? 'falling' : 'rising'
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}
