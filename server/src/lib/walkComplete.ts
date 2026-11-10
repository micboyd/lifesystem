import { RouteError, type OrsRoute } from './openroute'
import { destinationPoint, haversine, nearestOnLine, pathLength, repeatedShare, trimSpurs, type Coord, type LatLng } from './routeGeo'

/**
 * Make a walk through fixed places reach its target. The places stay, in order;
 * one made-up point is pushed out to the side of a long leg to add the distance.
 * Spurs are cut, and a route that doubles back loses to one that doesn't, so
 * it comes out a real circuit. The first wave tries a few directions; the second
 * rescales the closest. Among those on target the least rough wins.
 */

export interface CompleteClient {
    /** `loose` is the index of the made-up point, or null for the places alone. */
    route(points: LatLng[], loose: number | null, avoidSteps: boolean): Promise<OrsRoute>
}

export interface CompleteInput {
    /** Start, places to pass, finish. */
    points: LatLng[]
    targetM: number
    /** Changes which directions are tried, so pressing again gives a different walk. */
    seed: number
    client: CompleteClient
}

export interface CompleteResult {
    route: OrsRoute
    /** The added point; null when the places alone already reach the target. */
    stop: LatLng | null
    /** Where it goes in the list of places to pass. */
    stopIndex: number
    calls: number
}

const FIRST_WAVE = 3
const SECOND_WAVE = 2
/** The worst case: the places, a wave, the wave again if steps blocked it, and the rescale. */
export const MAX_COMPLETE_CALLS = 1 + FIRST_WAVE * 2 + SECOND_WAVE

/** Tighter than the page's 5%, so a route picked as on target also reads as on target. */
export const COMPLETE_TOLERANCE = 0.04
/** More of a route than this over ground it already walked, and it isn't a real loop. */
export const MAX_REPEATED = 0.08
/** When the places already reach the target, the detour that turns there-and-back into a circuit. */
const LOOP_ONLY_EXTRA = 0.15
/** Streets wind: the walked extra is roughly this much more than the straight-line extra. */
const DETOUR = 1.3
const ANGLES = [90, -90, 60, -60, 120, -120]

/** How far out from a leg's middle to go, so walking via that point adds `extraM`. */
export function detourOffset(legM: number, extraM: number): number {
    const extra = extraM / DETOUR
    return Math.sqrt(extra * (2 * legM + extra)) / 2
}

function bearing(a: LatLng, b: LatLng): number {
    const rad = (d: number) => (d * Math.PI) / 180
    const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat))
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
    return (Math.atan2(y, x) * 180) / Math.PI
}

interface Plan {
    leg: number
    angle: number
    offsetM: number
}

interface Tried extends Plan {
    stop: LatLng
    route: OrsRoute
    repeated: number
}

/** Cut the spurs from a candidate, keeping the places asked for. Distance keeps the router's scale. */
function tidied(route: OrsRoute, keep: LatLng[]): OrsRoute {
    const coords = trimSpurs(route.coords as Coord[], keep)
    if (coords.length === route.coords.length) return route
    return { ...route, coords, distanceM: route.distanceM * (pathLength(coords) / pathLength(route.coords as Coord[])), ascentM: undefined, descentM: undefined }
}

export async function completeRoute(input: CompleteInput): Promise<CompleteResult> {
    const { points, targetM, seed, client } = input
    const base = await client.route(points, null, false)
    let calls = 1
    const longEnough = base.distanceM >= targetM * (1 - COMPLETE_TOLERANCE)
    if (longEnough && repeatedShare(base.coords as Coord[]) <= MAX_REPEATED) return { route: base, stop: null, stopIndex: 0, calls }

    // Long enough but there and back: a small detour still gives it a way round.
    const extraM = Math.max(targetM - base.distanceM, base.distanceM * LOOP_ONLY_EXTRA)
    const legs = points
        .slice(0, -1)
        .map((p, i) => ({ i, m: haversine(p, points[i + 1]) }))
        .sort((a, b) => b.m - a.m)

    const pointFor = (plan: Plan): LatLng => {
        const a = points[plan.leg]
        const b = points[plan.leg + 1]
        const middle = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }
        return destinationPoint(middle, bearing(a, b) + plan.angle, plan.offsetM)
    }

    const run = async (plans: Plan[], avoidSteps: boolean): Promise<Tried[]> => {
        calls += plans.length
        const settled = await Promise.allSettled(
            plans.map((plan) => {
                const stop = pointFor(plan)
                const via = [...points.slice(0, plan.leg + 1), stop, ...points.slice(plan.leg + 1)]
                return client.route(via, plan.leg + 1, avoidSteps).then((raw) => {
                    const route = tidied(raw, points)
                    // The pin sits on the line, so the route still holds if it's redrawn through it.
                    return { ...plan, stop: nearestOnLine(route.coords as Coord[], stop), route, repeated: repeatedShare(route.coords as Coord[]) }
                })
            })
        )
        return settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    }

    const first: Plan[] = Array.from({ length: FIRST_WAVE }, (_, i) => {
        // Two directions off the longest leg, the third off the next one along.
        const leg = legs[i === 2 && legs.length > 1 ? 1 : 0]
        // The turn of ±30° means a new day's seed gives a new walk, not just one of a few.
        const turn = ((seed * 47) % 61) - 30
        return { leg: leg.i, angle: ANGLES[(seed * FIRST_WAVE + i) % ANGLES.length] + turn, offsetM: detourOffset(leg.m, extraM) }
    })

    let avoidSteps = true
    let tried = await run(first, avoidSteps)
    if (tried.length === 0) {
        // Somewhere only reachable by steps: better a few steps than no walk.
        avoidSteps = false
        tried = await run(first, avoidSteps)
    }
    if (tried.length === 0) throw new RouteError('no_route', 'Couldn’t find a way to add distance from here. Try moving a place.')

    const missBy = (t: Tried) => Math.abs(t.route.distanceM - targetM)
    const allowed = targetM * COMPLETE_TOLERANCE
    const looped = (list: Tried[]) => list.filter((t) => t.repeated <= MAX_REPEATED)
    const pool = (list: Tried[]) => (looped(list).length ? looped(list) : list)
    if (!looped(tried).some((t) => missBy(t) <= allowed)) {
        const closest = [...pool(tried)].sort((a, b) => missBy(a) - missBy(b))[0]
        const added = closest.route.distanceM - base.distanceM
        const ratio = added > 0 ? Math.min(2.5, Math.max(0.4, extraM / added)) : 1.5
        const second = [ratio, ratio * (extraM > added ? 1.15 : 0.85)].slice(0, SECOND_WAVE)
        tried = [...tried, ...(await run(second.map((r) => ({ leg: closest.leg, angle: closest.angle, offsetM: closest.offsetM * r })), avoidSteps))]
    }

    const onTarget = pool(tried)
        .filter((t) => missBy(t) <= allowed)
        .sort((a, b) => (a.route.roughShare ?? 0) - (b.route.roughShare ?? 0))
    const best = onTarget[0] ?? [...pool(tried)].sort((a, b) => missBy(a) - missBy(b))[0]
    return { route: best.route, stop: best.stop, stopIndex: best.leg, calls }
}
