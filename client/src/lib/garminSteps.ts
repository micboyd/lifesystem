/**
 * Watch workout steps as plain text for the Send to Garmin preview: what ends
 * each step and any pace alert, e.g. "400 m · 8:00–9:00 /km".
 */
import type { GarminState, WatchStep } from '../types'

/** 400 → "400 m", 5000 → "5 km". */
export function formatMetres(m: number): string {
    return m >= 1000 && m % 100 === 0 ? `${m / 1000} km` : `${m} m`
}

/** 75 → "1:15", 720 → "12 min", 45 → "45 s". */
export function formatSeconds(s: number): string {
    if (s < 60) return `${s} s`
    if (s % 60 === 0) return `${s / 60} min`
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** 480 → "8:00". */
export function formatPace(secPerKm: number): string {
    const s = Math.round(secPerKm)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

type Leaf = Exclude<WatchStep, { type: 'repeat' }>

/** How the step ends. */
export function stepEnd(step: Leaf): string {
    if (step.end.kind === 'distance') return formatMetres(step.end.metres)
    if (step.end.kind === 'time') return formatSeconds(step.end.seconds)
    return 'Lap button'
}

/** The pace alert band, or null. */
export function stepPace(step: Leaf): string | null {
    if (!step.paceTarget) return null
    return `${formatPace(step.paceTarget.fastestSecPerKm)}–${formatPace(step.paceTarget.slowestSecPerKm)} /km`
}

export const STEP_TYPE_LABEL: Record<Leaf['type'], string> = {
    warmup: 'Warm-up',
    run: 'Run',
    walk: 'Walk',
    recovery: 'Recovery',
    cooldown: 'Cool-down',
    other: 'Step',
}

/** How many steps the watch will run, repeats counted once per pass. */
export function countSteps(steps: WatchStep[]): number {
    return steps.reduce((n, s) => n + (s.type === 'repeat' ? s.times * countSteps(s.steps) : 1), 0)
}

/** What each Garmin state is called on screen. */
export const GARMIN_STATE_LABEL: Record<GarminState, string> = {
    not_sent: 'Not sent',
    sent: 'On Garmin',
    out_of_date: 'Out of date',
    moved: 'Moved',
}
