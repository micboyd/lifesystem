import { cellOverlap } from './routeGeo'

/**
 * Picking a route out of a press's candidates. openrouteservice's round-trip
 * `length` is a preference, not a promise, so every candidate is measured
 * against the target and the near-misses are thrown out. Pure, so it can be
 * tested without the network.
 */

export interface Candidate {
    /** "loop:1234:4" — kind, seed and point count; never sent twice for one session. */
    key: string
    seed: number
    distanceM: number
    ascentM: number
    /** 0–1 share of the route over ground it already ran. */
    repeatedShare: number
    cells: string[]
    /** Net climb (+) or drop (−) over the opening stretch, in metres. */
    openingM?: number
}

/** How the user wants the run to begin. */
export type StartPref = 'any' | 'uphill' | 'downhill'
export const START_PREFS: readonly StartPref[] = ['any', 'uphill', 'downhill']

/** Under this net change the opening counts as flat — DEM noise, not a hill. */
export const START_MIN_M = 3

export function matchesStart(openingM: number | undefined, pref: StartPref): boolean {
    if (pref === 'any') return true
    const m = openingM ?? 0
    return pref === 'uphill' ? m >= START_MIN_M : m <= -START_MIN_M
}

/** Within 5% or 250 m of the target, whichever is larger. */
export function toleranceM(targetM: number): number {
    return Math.max(targetM * 0.05, 250)
}

export function withinTolerance(distanceM: number, targetM: number): boolean {
    return Math.abs(distanceM - targetM) <= toleranceM(targetM)
}

/** A candidate counts as one already shown when most of its ground is shared. */
export const SAME_ROUTE_OVERLAP = 0.85
/** A reported route rules out a candidate sharing this much of its ground. */
export const BAD_ROUTE_OVERLAP = 0.6

export function looksSeen(cells: string[], seen: string[][]): boolean {
    return seen.some((s) => cellOverlap(cells, s) >= SAME_ROUTE_OVERLAP)
}

export function looksBad(cells: string[], bad: string[][]): boolean {
    return bad.some((s) => cellOverlap(cells, s) >= BAD_ROUTE_OVERLAP)
}

// Climb is compared in 5 m steps so a metre or two of DEM noise doesn't
// outrank a route with half the doubling back.
const climbBand = (m: number) => Math.round(m / 5)

/**
 * Routes that start the way asked first (when a way was asked), then lowest
 * climb, then the least doubling back, then closest to target.
 */
export function rankValid(cands: Candidate[], targetM: number, pref: StartPref = 'any'): Candidate[] {
    const miss = (c: Candidate) => (matchesStart(c.openingM, pref) ? 0 : 1)
    return [...cands].sort(
        (a, b) =>
            miss(a) - miss(b) ||
            climbBand(a.ascentM) - climbBand(b.ascentM) ||
            a.repeatedShare - b.repeatedShare ||
            Math.abs(a.distanceM - targetM) - Math.abs(b.distanceM - targetM)
    )
}

export type Pick =
    | { kind: 'valid'; route: Candidate }
    | { kind: 'closest'; route: Candidate; diffM: number }
    | { kind: 'none' }

/**
 * The route to show for a press. Seen and reported routes never come back; of
 * the rest, an in-tolerance route wins, ranked by `rankValid`. With none in
 * tolerance the closest one is offered with its exact difference.
 */
export function pickRoute(
    cands: Candidate[],
    targetM: number,
    seen: string[][],
    bad: string[][],
    pref: StartPref = 'any'
): Pick {
    const fresh = cands.filter((c) => !looksSeen(c.cells, seen) && !looksBad(c.cells, bad))
    const valid = fresh.filter((c) => withinTolerance(c.distanceM, targetM))
    if (valid.length > 0) return { kind: 'valid', route: rankValid(valid, targetM, pref)[0] }
    if (fresh.length === 0) return { kind: 'none' }
    const closest = [...fresh].sort(
        (a, b) => Math.abs(a.distanceM - targetM) - Math.abs(b.distanceM - targetM)
    )[0]
    return { kind: 'closest', route: closest, diffM: Math.round(closest.distanceM - targetM) }
}

export const SEED_MAX = 99_999
/** Waypoint counts the round trip is asked for — more points make rounder loops. */
export const POINT_COUNTS = [3, 4, 5] as const

/**
 * `n` seed/point pairs never used before for this session. `rand` is injected
 * so tests can pin it.
 */
export function freshSeeds(
    kind: string,
    used: Set<string>,
    n: number,
    rand: () => number = Math.random
): { seed: number; points: number; key: string }[] {
    const out: { seed: number; points: number; key: string }[] = []
    const taken = new Set(used)
    for (let tries = 0; out.length < n && tries < n * 50; tries++) {
        const seed = Math.floor(rand() * (SEED_MAX + 1))
        const points = POINT_COUNTS[Math.floor(rand() * POINT_COUNTS.length)]
        const key = `${kind}:${seed}:${points}`
        if (taken.has(key)) continue
        taken.add(key)
        out.push({ seed, points, key })
    }
    return out
}

/**
 * The length to ask for next, given how far off the first wave came back.
 * `requestedM` is whatever was sent — a loop's `length`, or the straight-line
 * reach of an out-and-back — so the answer is in the same units.
 * If every result ran long (or every one short) the request is scaled by the
 * median ratio; mixed results leave it alone. Clamped so one odd wave can't
 * send the next one wildly off.
 */
export function scaledLength(targetM: number, requestedM: number, actualM: number[]): number {
    if (actualM.length === 0) return requestedM
    const tol = toleranceM(targetM)
    const allLong = actualM.every((d) => d > targetM + tol)
    const allShort = actualM.every((d) => d < targetM - tol)
    if (!allLong && !allShort) return requestedM
    const ratios = actualM.map((d) => d / requestedM).sort((a, b) => a - b)
    const median = ratios[Math.floor(ratios.length / 2)]
    const next = targetM / median
    return Math.round(Math.min(requestedM * 2, Math.max(requestedM * 0.5, next)))
}

/**
 * Which past routes to drop when a new one is saved: never a chosen route, and
 * of the rest only those past the newest `keep`. Generating again therefore
 * never touches the chosen route.
 */
export function historyToPrune<T extends { id: string; chosen: boolean; createdAt: Date }>(
    routes: T[],
    keep: number
): string[] {
    return routes
        .filter((r) => !r.chosen)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(keep)
        .map((r) => r.id)
}
