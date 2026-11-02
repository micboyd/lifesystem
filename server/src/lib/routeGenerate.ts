import { RouteError, type OrsRoute } from './openroute'
import {
    destinationPoint,
    elevationStats,
    pathLength,
    repeatedShare,
    routeCells,
    type Coord,
    type LatLng,
} from './routeGeo'
import { freshSeeds, pickRoute, scaledLength, withinTolerance, type Candidate, type Pick } from './routeSelect'

/**
 * One press of "Generate route": up to five candidates from openrouteservice,
 * in two waves, then the best one picked. The second wave is only spent when
 * the first didn't give a real choice, and its length is rescaled if the first
 * wave all ran long or all ran short.
 */

export type RouteKind = 'loop' | 'outback'

export interface RouteClient {
    roundTrip(start: LatLng, lengthM: number, seed: number, points: number): Promise<OrsRoute>
    oneWay(start: LatLng, end: LatLng): Promise<OrsRoute>
}

export interface GenerateInput {
    start: LatLng
    targetM: number
    kind: RouteKind
    /** Seed keys already used for this session. */
    used: Set<string>
    /** Fingerprints of routes already shown for this session. */
    seen: string[][]
    /** Fingerprints of routes reported as bad near this start. */
    bad: string[][]
    client: RouteClient
    rand?: () => number
}

export interface BuiltCandidate extends Candidate {
    points: number
    coords: Coord[]
    descentM: number
}

export interface GenerateResult {
    pick: Pick
    route: BuiltCandidate | null
    /** Every key sent this press, so none is sent again. */
    tried: string[]
    /** How many routing calls were made, for the usage counter. */
    calls: number
}

export const MAX_CANDIDATES = 5
const FIRST_WAVE = 3
// Footpaths wind: an out-and-back's walked leg is roughly this much longer than
// the straight line to its turn point.
const DETOUR = 1.3

function build(
    raw: OrsRoute,
    seed: number,
    points: number,
    key: string,
    kind: RouteKind
): BuiltCandidate {
    // An out-and-back is the leg, then the same leg home (the turn point once).
    const coords: Coord[] = kind === 'outback' ? [...raw.coords, ...[...raw.coords].reverse().slice(1)] : raw.coords
    const legM = raw.distanceM || pathLength(raw.coords)
    const distanceM = Math.round(kind === 'outback' ? legM * 2 : legM)
    const measured = elevationStats(coords)
    const up = raw.ascentM ?? undefined
    const down = raw.descentM ?? undefined
    const ascentM = up !== undefined && down !== undefined ? (kind === 'outback' ? up + down : up) : measured.ascent
    const descentM =
        up !== undefined && down !== undefined ? (kind === 'outback' ? up + down : down) : measured.descent
    return {
        key,
        seed,
        points,
        coords,
        distanceM,
        ascentM: Math.round(ascentM),
        descentM: Math.round(descentM),
        repeatedShare: repeatedShare(coords),
        cells: routeCells(coords),
    }
}

async function wave(
    input: GenerateInput,
    n: number,
    request: number,
    used: Set<string>
): Promise<{ built: BuiltCandidate[]; tried: string[]; errors: RouteError[] }> {
    const seeds = freshSeeds(input.kind, used, n, input.rand)
    seeds.forEach((s) => used.add(s.key))
    const settled = await Promise.allSettled(
        seeds.map(({ seed, points }) =>
            input.kind === 'loop'
                ? input.client.roundTrip(input.start, request, seed, points)
                : // Out-and-back: a turn point at `request` metres in the seed's direction.
                  // The golden angle spreads successive seeds evenly round the compass.
                  input.client.oneWay(input.start, destinationPoint(input.start, (seed * 137.508) % 360, request))
        )
    )
    const built: BuiltCandidate[] = []
    const errors: RouteError[] = []
    settled.forEach((r, i) => {
        if (r.status === 'fulfilled') built.push(build(r.value, seeds[i].seed, seeds[i].points, seeds[i].key, input.kind))
        else errors.push(r.reason instanceof RouteError ? r.reason : new RouteError('down', 'The routing service failed.'))
    })
    return { built, tried: seeds.map((s) => s.key), errors }
}

/** The most telling of a press's failures: quota beats down beats no route. */
function worstError(errors: RouteError[]): RouteError {
    const order = ['config', 'quota', 'down', 'no_route']
    return [...errors].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code))[0]
}

export async function generateRoute(input: GenerateInput): Promise<GenerateResult> {
    const used = new Set(input.used)
    const firstRequest = input.kind === 'loop' ? input.targetM : input.targetM / 2 / DETOUR

    const one = await wave(input, FIRST_WAVE, firstRequest, used)
    let built = one.built
    const tried = [...one.tried]
    const errors = [...one.errors]
    let calls = one.tried.length

    const firstPick = pickRoute(built, input.targetM, input.seen, input.bad)
    const validCount = built.filter((c) => withinTolerance(c.distanceM, input.targetM)).length
    const stopEarly =
        (firstPick.kind === 'valid' && validCount >= 2) || errors.some((e) => e.code === 'quota' || e.code === 'config')

    if (!stopEarly) {
        const next = scaledLength(
            input.targetM,
            firstRequest,
            built.map((c) => c.distanceM)
        )
        const two = await wave(input, MAX_CANDIDATES - FIRST_WAVE, next, used)
        built = [...built, ...two.built]
        tried.push(...two.tried)
        errors.push(...two.errors)
        calls += two.tried.length
    }

    if (built.length === 0) throw errors.length ? worstError(errors) : new RouteError('down', 'No routes came back.')

    const pick = pickRoute(built, input.targetM, input.seen, input.bad)
    const route = pick.kind === 'none' ? null : (built.find((b) => b.key === pick.route.key) ?? null)
    return { pick, route, tried, calls }
}
