import { readPoint } from './routeGeo'
import type { WalkGoalKind, WalkPace, WalkPoint, WalkRoute } from '../models/Walk'
import { WALK_GOALS, WALK_PACES } from '../models/Walk'

/** Reading a walk from a request body. Everything is checked; nothing unknown gets through. */

export const MAX_STOPS = 8
const MAX_LABEL = 160
const MAX_NAME = 80
const MAX_ROUTE_POINTS = 40_000

const DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

export interface WalkFields {
    date: string
    time: string
    name: string
    pace: WalkPace
    goal: { kind: WalkGoalKind; value: number }
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute | null
}

export type WalkRead = { ok: true; value: WalkFields } | { ok: false; message: string }

export function readWalkPoint(raw: unknown): WalkPoint | null {
    const p = readPoint(raw)
    if (!p) return null
    const label = (raw as { label?: unknown }).label
    return { ...p, label: typeof label === 'string' ? label.trim().slice(0, MAX_LABEL) : '' }
}

/** Stops from a body: an empty list if absent, null if malformed or too many. */
export function readStops(raw: unknown): WalkPoint[] | null {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw) || raw.length > MAX_STOPS) return null
    const stops = raw.map(readWalkPoint)
    return stops.every((s): s is WalkPoint => s !== null) ? stops : null
}

function readRoute(raw: unknown): WalkRoute | null | undefined {
    if (raw === null || raw === undefined) return null
    const r = raw as Partial<WalkRoute>
    const fine =
        Array.isArray(r.coords) &&
        r.coords.length >= 2 &&
        r.coords.length <= MAX_ROUTE_POINTS &&
        r.coords.every((c) => Array.isArray(c) && c.length >= 2 && c.length <= 3 && c.every(Number.isFinite)) &&
        typeof r.distanceM === 'number' &&
        Number.isFinite(r.distanceM) &&
        r.distanceM >= 0
    if (!fine) return undefined
    return {
        coords: r.coords as number[][],
        distanceM: Math.round(r.distanceM as number),
        ascentM: Math.max(0, Math.round(Number(r.ascentM) || 0)),
        descentM: Math.max(0, Math.round(Number(r.descentM) || 0)),
    }
}

export type LibraryFields = Omit<WalkFields, 'date' | 'time'>

/** A walk with no day: read as a walk on a placeholder day, then the day taken off. */
export function readLibraryItem(body: Record<string, unknown>): { ok: true; value: LibraryFields } | { ok: false; message: string } {
    const read = readWalk({ ...body, date: '2000-01-01', time: '00:00' })
    if (!read.ok) return read
    return { ok: true, value: planOf(read.value) }
}

/** A walk's plan, without the day it's on. */
export function planOf(v: WalkFields): LibraryFields {
    return { name: v.name, pace: v.pace, goal: v.goal, start: v.start, stops: v.stops, end: v.end, route: v.route }
}

/** Weekdays (0 Sunday – 6 Saturday), sorted. Absent is none; null if malformed. */
export function readDays(raw: unknown): number[] | null {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw) || !raw.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null
    return [...new Set(raw as number[])].sort((a, b) => a - b)
}

export interface FavouriteFields {
    start: WalkPoint
    stops: WalkPoint[]
    end: WalkPoint | null
    route: WalkRoute
}

/** A route to star: it must have a real line and a start. */
export function readFavourite(body: Record<string, unknown>): FavouriteFields | null {
    const start = readWalkPoint(body.start)
    const stops = readStops(body.stops)
    const end = body.end ? readWalkPoint(body.end) : null
    const route = readRoute(body.route)
    if (!start || !stops || (body.end && !end) || !route) return null
    return { start, stops, end, route }
}

export function readWalk(body: Record<string, unknown>): WalkRead {
    const fail = (message: string): WalkRead => ({ ok: false, message })
    const { date, time, pace, goal } = body
    if (typeof date !== 'string' || !DATE.test(date)) return fail('date must be YYYY-MM-DD')
    if (typeof time !== 'string' || !TIME.test(time)) return fail('time must be HH:MM')
    if (!WALK_PACES.includes(pace as WalkPace)) return fail('Unknown pace')

    const g = goal as { kind?: unknown; value?: unknown } | undefined
    if (!WALK_GOALS.includes(g?.kind as WalkGoalKind)) return fail('Unknown target')
    const value = Number(g?.value)
    if (!Number.isFinite(value) || value <= 0) return fail('The target must be more than zero')

    const start = readWalkPoint(body.start)
    if (!start) return fail('Pick a start point')
    const stops = readStops(body.stops)
    if (!stops) return fail(`Up to ${MAX_STOPS} places to pass`)
    const end = body.end === null || body.end === undefined ? null : readWalkPoint(body.end)
    if (body.end && !end) return fail('Pick a finish point')
    const route = readRoute(body.route)
    if (route === undefined) return fail('That route could not be read')

    return {
        ok: true,
        value: {
            date,
            time,
            name: typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME) : '',
            pace: pace as WalkPace,
            goal: { kind: g!.kind as WalkGoalKind, value },
            start,
            stops,
            end,
            route,
        },
    }
}
