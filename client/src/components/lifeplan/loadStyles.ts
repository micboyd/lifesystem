import { RESERVE_UNITS, type LoadLevel, type Reserve } from '../../lib/lifeLoad'

/**
 * One palette for load, shared by the pill, the meters and the timeline ribbon.
 *
 * Quiet has to read as unremarkable and overloaded as a warning, because the
 * whole point of measuring is that one of those is worth stopping on and the
 * others aren't. An unknown level is greyed rather than coloured — it isn't a
 * quiet month, it's a month the app can't price.
 */

export const LEVEL_BAR: Record<LoadLevel, string> = {
    quiet: 'bg-neutral-300',
    steady: 'bg-herb',
    busy: 'bg-marigold',
    overloaded: 'bg-coral-500',
}

export const LEVEL_TINT: Record<LoadLevel, string> = {
    quiet: 'bg-neutral-100',
    steady: 'bg-herb-50',
    busy: 'bg-marigold-50',
    overloaded: 'bg-coral-50',
}

export const LEVEL_TEXT: Record<LoadLevel, string> = {
    quiet: 'text-neutral-500',
    steady: 'text-herb',
    busy: 'text-amber-700',
    overloaded: 'text-coral-600',
}

export const LEVEL_PILL: Record<LoadLevel, string> = {
    quiet: 'bg-neutral-100 text-neutral-500',
    steady: 'bg-herb/15 text-herb',
    busy: 'bg-marigold/20 text-amber-700',
    overloaded: 'bg-red-50 text-red-600',
}

/** The styling for a reserve whose capacity isn't known. */
export const UNKNOWN_BAR = 'bg-neutral-200'
export const UNKNOWN_PILL = 'bg-neutral-100 text-neutral-400'

/**
 * A demand in its reserve's own unit.
 *
 * Money reads in whole pounds because pennies of a monthly commitment are noise;
 * everything else keeps a decimal, since the difference between four and four
 * and a half hard sessions a week is the difference the model is trying to show.
 */
export function formatDemand(reserve: Reserve, value: number): string {
    if (reserve === 'money') return `£${Math.round(value).toLocaleString('en-GB')}`
    const rounded = Math.round(value * 10) / 10
    return reserve === 'time' ? `${rounded}h` : `${rounded}`
}

/** A demand against its capacity, e.g. "7.2 / 6 load/wk". */
export function formatAgainstCapacity(
    reserve: Reserve,
    demand: number,
    capacity: number | null
): string {
    const left = formatDemand(reserve, demand)
    if (capacity === null) return `${left} ${RESERVE_UNITS[reserve]}`
    return `${left} / ${formatDemand(reserve, capacity)} ${RESERVE_UNITS[reserve]}`
}
