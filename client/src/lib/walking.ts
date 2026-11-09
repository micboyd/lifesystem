import { partAt, type DayPart } from './yourDay'

/**
 * The sums behind a walk. Time, steps, calories and distance are one setting
 * seen four ways: at a given pace, setting one decides the rest. All of these
 * are estimates — steps by a typical stride, calories by METs and bodyweight.
 */

export type WalkPace = 'relaxed' | 'steady' | 'brisk'
export type WalkGoalKind = 'time' | 'steps' | 'calories' | 'distance'

export interface WalkGoal {
    kind: WalkGoalKind
    value: number
}

/** Speed; stride shortens as you slow down; METs from the Compendium of Physical Activities. */
export const PACES: Record<WalkPace, { label: string; kmh: number; stepsPerKm: number; met: number }> = {
    relaxed: { label: 'Relaxed', kmh: 4, stepsPerKm: 1400, met: 3 },
    steady: { label: 'Steady', kmh: 5, stepsPerKm: 1300, met: 3.6 },
    brisk: { label: 'Brisk', kmh: 6, stepsPerKm: 1200, met: 4.6 },
}

export const GOAL_UNITS: Record<WalkGoalKind, { label: string; unit: string; fallback: number; step: number }> = {
    time: { label: 'Time', unit: 'min', fallback: 45, step: 5 },
    steps: { label: 'Steps', unit: 'steps', fallback: 6000, step: 100 },
    calories: { label: 'Calories', unit: 'kcal', fallback: 250, step: 10 },
    distance: { label: 'Distance', unit: 'km', fallback: 4, step: 0.1 },
}

export const MIN_WALK_M = 400
export const MAX_WALK_M = 42_200

/** Within this share of the target counts as on target. */
export const ON_TARGET_BAND = 0.05

const kcalPerHour = (pace: WalkPace, weightKg: number) => PACES[pace].met * weightKg

/** How far a target means, in metres. Null when it can't be worked out (calories with no weigh-in). */
export function targetMetres(goal: WalkGoal, pace: WalkPace, weightKg: number | null): number | null {
    if (!(goal.value > 0)) return null
    const p = PACES[pace]
    switch (goal.kind) {
        case 'distance':
            return Math.round(goal.value * 1000)
        case 'time':
            return Math.round((goal.value / 60) * p.kmh * 1000)
        case 'steps':
            return Math.round((goal.value / p.stepsPerKm) * 1000)
        case 'calories':
            if (!weightKg) return null
            return Math.round((goal.value / kcalPerHour(pace, weightKg)) * p.kmh * 1000)
    }
}

export interface WalkEstimate {
    distanceM: number
    minutes: number
    steps: number
    /** Null with no weigh-in to work from. */
    kcal: number | null
}

export function estimateWalk(distanceM: number, pace: WalkPace, weightKg: number | null): WalkEstimate {
    const p = PACES[pace]
    const hours = distanceM / 1000 / p.kmh
    return {
        distanceM,
        minutes: Math.round(hours * 60),
        steps: Math.round((distanceM / 1000) * p.stepsPerKm),
        kcal: weightKg ? Math.round(hours * kcalPerHour(pace, weightKg)) : null,
    }
}

/** The figure an estimate gives for a kind of target. */
function figureFor(e: WalkEstimate, kind: WalkGoalKind): number | null {
    switch (kind) {
        case 'time':
            return e.minutes
        case 'steps':
            return e.steps
        case 'calories':
            return e.kcal
        case 'distance':
            return e.distanceM / 1000
    }
}

/** The same distance as a target of another kind, rounded to a sensible step. */
export function convertGoal(distanceM: number | null, kind: WalkGoalKind, pace: WalkPace, weightKg: number | null): number {
    const { fallback, step } = GOAL_UNITS[kind]
    if (!distanceM) return fallback
    const figure = figureFor(estimateWalk(distanceM, pace, weightKg), kind)
    if (figure === null) return fallback
    const rounded = Math.round(figure / step) * step
    return rounded > 0 ? Number(rounded.toFixed(1)) : fallback
}

const n = (x: number) => Math.round(x).toLocaleString('en-GB')

export function formatGoal(goal: WalkGoal): string {
    switch (goal.kind) {
        case 'time':
            return formatMinutes(goal.value)
        case 'steps':
            return `${n(goal.value)} steps`
        case 'calories':
            return `${n(goal.value)} kcal`
        case 'distance':
            return formatWalkKm(goal.value * 1000)
    }
}

function gapAmount(kind: WalkGoalKind, gap: number): string {
    switch (kind) {
        case 'time':
            return `${n(gap)} min`
        case 'steps':
            return `${n(gap)} steps`
        case 'calories':
            return `${n(gap)} kcal`
        case 'distance':
            return `${gap.toFixed(1)} km`
    }
}

export interface WalkGap {
    onTarget: boolean
    text: string
}

/** How a route compares with its target, in the target's own unit. */
export function walkGap(goal: WalkGoal, e: WalkEstimate): WalkGap | null {
    const figure = figureFor(e, goal.kind)
    if (figure === null) return null
    if (Math.abs(figure - goal.value) <= goal.value * ON_TARGET_BAND)
        return { onTarget: true, text: `On target for ${formatGoal(goal)}` }
    const amount = gapAmount(goal.kind, Math.abs(figure - goal.value))
    return { onTarget: false, text: `${amount} ${figure < goal.value ? 'short of' : 'over'} ${formatGoal(goal)}` }
}

/** "45 min" / "1 h 05 min". */
export function formatMinutes(min: number): string {
    const m = Math.round(min)
    if (m < 60) return `${m} min`
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

export function formatWalkKm(m: number): string {
    return `${(m / 1000).toFixed(1)} km`
}

export const toMinutes = (time: string): number => {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
}

export const walkPart = (time: string): DayPart => partAt(toMinutes(time))

/** "16:15". Past midnight it wraps round. */
export function finishTime(time: string, minutes: number): string {
    const total = (toMinutes(time) + Math.round(minutes)) % (24 * 60)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const PART_NAME: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** What the walk is called: its name, or the part of the day it's in. */
export function walkTitle(walk: { name: string; time: string }): string {
    return walk.name || `${PART_NAME[walkPart(walk.time)]} walk`
}

/** The shape of a walk these sums need. */
export interface WalkLike {
    _id: string
    date: string
    time: string
    name: string
    pace: WalkPace
    goal: WalkGoal
    route: { distanceM: number } | null
    doneAt: string | null
}

/** The route's real length if it has one, otherwise what the target works out at. */
export function walkEstimate(walk: WalkLike, weightKg: number | null): WalkEstimate | null {
    const distanceM = walk.route?.distanceM ?? targetMetres(walk.goal, walk.pace, weightKg)
    return distanceM ? estimateWalk(distanceM, walk.pace, weightKg) : null
}

/** "14:30 · 45 min · 4,900 steps". */
export function walkFacts(walk: WalkLike, weightKg: number | null): string {
    const e = walkEstimate(walk, weightKg)
    return [walk.time, e ? formatMinutes(e.minutes) : null, e ? `${n(e.steps)} steps` : null].filter(Boolean).join(' · ')
}

export const sortWalks = <T extends WalkLike>(walks: T[]): T[] => [...walks].sort((a, b) => a.time.localeCompare(b.time))

/** The earliest walk not done yet. */
export function nextWalk<T extends WalkLike>(walks: T[]): T | null {
    return sortWalks(walks).find((w) => !w.doneAt) ?? null
}

export interface WalkDayTotals {
    count: number
    done: number
    distanceM: number
    minutes: number
    steps: number
    /** Null when any walk has no estimate of calories. */
    kcal: number | null
}

export function walkDayTotals(walks: WalkLike[], weightKg: number | null): WalkDayTotals {
    const totals: WalkDayTotals = { count: walks.length, done: 0, distanceM: 0, minutes: 0, steps: 0, kcal: weightKg ? 0 : null }
    for (const w of walks) {
        if (w.doneAt) totals.done += 1
        const e = walkEstimate(w, weightKg)
        if (!e) continue
        totals.distanceM += e.distanceM
        totals.minutes += e.minutes
        totals.steps += e.steps
        if (totals.kcal !== null && e.kcal !== null) totals.kcal += e.kcal
    }
    return totals
}

/** A walk as Your day needs it. */
export interface WalkDayItem {
    id: string
    time: string
    title: string
    detail: string
    done: boolean
}

export const walkDayItems = (walks: WalkLike[], weightKg: number | null): WalkDayItem[] =>
    sortWalks(walks).map((w) => ({
        id: w._id,
        time: w.time,
        title: walkTitle(w),
        detail: walkFacts(w, weightKg),
        done: !!w.doneAt,
    }))
