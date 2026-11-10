import { RouteError, type OrsRoute } from './openroute'
import {
    destinationPoint,
    elevationStats,
    openingClimb,
    pathLength,
    repeatedShare,
    routeCells,
    trimSpurs,
    type Coord,
    type LatLng,
} from './routeGeo'
import {
    freshSeeds,
    matchesStart,
    pickRoute,
    scaledLength,
    withinTolerance,
    type Candidate,
    type Pick,
    type StartPref,
} from './routeSelect'

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
    /** Start uphill, downhill, or either. Loops are turned round to suit. */
    startPref?: StartPref
    /** Seed keys already used for this session. */
    used: Set<string>
    /** Fingerprints of routes already shown for this session. */
    seen: string[][]
    /** Fingerprints of routes reported as bad near this start. */
    bad: string[][]
    client: RouteClient
    /** Set for true loops: spurs are cut, and routes doubling back past this share lose out. */
    maxRepeated?: number
    rand?: () => number
}

export interface BuiltCandidate extends Candidate {
    points: number
    coords: Coord[]
    descentM: number
    openingM: number
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
    kind: RouteKind,
    pref: StartPref = 'any'
): BuiltCandidate {
    // An out-and-back is the leg, then the same leg home (the turn point once).
    let coords: Coord[] = kind === 'outback' ? [...raw.coords, ...[...raw.coords].reverse().slice(1)] : raw.coords
    const legM = raw.distanceM || pathLength(raw.coords)
    const distanceM = Math.round(kind === 'outback' ? legM * 2 : legM)
    const measured = elevationStats(coords)
    const up = raw.ascentM ?? undefined
    const down = raw.descentM ?? undefined
    let ascentM = up !== undefined && down !== undefined ? (kind === 'outback' ? up + down : up) : measured.ascent
    let descentM =
        up !== undefined && down !== undefined ? (kind === 'outback' ? up + down : down) : measured.descent
    let openingM = openingClimb(coords, distanceM)
    // A loop run the other way round starts with the other end's hill. An
    // out-and-back reads the same both ways, so only the seed can change it.
    if (kind === 'loop' && pref !== 'any' && !matchesStart(openingM, pref)) {
        const reversed = [...coords].reverse()
        const flipped = openingClimb(reversed, distanceM)
        const better = pref === 'uphill' ? flipped > openingM : flipped < openingM
        if (better) {
            coords = reversed
            openingM = flipped
            ;[ascentM, descentM] = [descentM, ascentM]
        }
    }
    return {
        key,
        seed,
        points,
        coords,
        distanceM,
        ascentM: Math.round(ascentM),
        descentM: Math.round(descentM),
        openingM,
        repeatedShare: repeatedShare(coords),
        cells: routeCells(coords),
    }
}

/** The route with its spurs cut, its figures following. Distance keeps the router's own scale. */
function withoutSpurs(raw: OrsRoute, start: LatLng): OrsRoute {
    const coords = trimSpurs(raw.coords, [start])
    if (coords.length === raw.coords.length) return raw
    return { ...raw, coords, distanceM: raw.distanceM * (pathLength(coords) / pathLength(raw.coords)), ascentM: undefined, descentM: undefined }
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
        if (r.status === 'fulfilled') built.push(build(input.maxRepeated === undefined ? r.value : withoutSpurs(r.value, input.start), seeds[i].seed, seeds[i].points, seeds[i].key, input.kind, input.startPref))
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

    const shapely = (list: BuiltCandidate[]) => (input.maxRepeated === undefined ? list : list.filter((c) => c.repeatedShare <= input.maxRepeated!))
    const firstPick = pickRoute(shapely(built), input.targetM, input.seen, input.bad, input.startPref)
    const validCount = shapely(built).filter((c) => withinTolerance(c.distanceM, input.targetM)).length
    // With a start asked for, a real choice means one that also starts that way.
    const matching = shapely(built).filter(
        (c) => withinTolerance(c.distanceM, input.targetM) && matchesStart(c.openingM, input.startPref ?? 'any')
    ).length
    const stopEarly =
        (firstPick.kind === 'valid' && validCount >= 2 && matching >= 1) || errors.some((e) => e.code === 'quota' || e.code === 'config')

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

    // Nothing the right shape: the one that doubles back least, rather than no route.
    const pool = shapely(built).length ? shapely(built) : [...built].sort((a, b) => a.repeatedShare - b.repeatedShare).slice(0, 1)
    let pick = pickRoute(pool, input.targetM, input.seen, input.bad, input.startPref)
    if (pick.kind === 'none') pick = pickRoute(built, input.targetM, input.seen, input.bad, input.startPref)
    const route = pick.kind === 'none' ? null : (built.find((b) => b.key === pick.route.key) ?? null)
    return { pick, route, tried, calls }
}
