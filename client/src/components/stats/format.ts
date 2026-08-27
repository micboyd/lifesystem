import { MONTHS, parseDateKey } from '../../lib/calendar'
import type { StatTone } from '../StatTile'
import type { PerformanceStatus } from '../../lib/strengthTrend'

/** Presentation helpers shared by the stats panels. Numbers only — no opinions. */

/** "12 Aug" */
export function shortDate(iso: string): string {
    const { month, day } = parseDateKey(iso)
    return `${day} ${MONTHS[month].slice(0, 3)}`
}

/** "12 Aug 2026" */
export function longDate(iso: string): string {
    const { year, month, day } = parseDateKey(iso)
    return `${day} ${MONTHS[month].slice(0, 3)} ${year}`
}

/**
 * A weight, with the half-kilo kept and the trailing ".0" dropped — plates come
 * in 1.25s, so "62.5 kg" matters, while "60.0 kg" is just noise.
 */
export function kg(value: number, dp = 1): string {
    return `${Number(value.toFixed(dp))} kg`
}

/** Session tonnage, rounded to the kilo and grouped: "42,180 kg". */
export function tonnage(value: number): string {
    return `${Math.round(value).toLocaleString('en-GB')} kg`
}

/** "+4.2%" / "−1.8%" — the sign carries the meaning, so it is always shown. */
export function signedPct(value: number, dp = 1): string {
    const rounded = value.toFixed(dp)
    return `${value > 0 ? '+' : ''}${rounded}%`
}

/** "100 kg × 5" */
export function setLabel(weightKg: number, reps: number): string {
    return `${kg(weightKg)} × ${reps}`
}

/** Rising is good, falling is bad, holding is neither — and no verdict is neutral. */
export const STATUS_TONE: Record<PerformanceStatus, StatTone> = {
    improving: 'good',
    stable: 'neutral',
    declining: 'bad',
    'insufficient-data': 'neutral',
}

/** "3 sessions" / "1 session" */
export function plural(count: number, noun: string, suffix = 's'): string {
    return `${count} ${noun}${count === 1 ? '' : suffix}`
}
