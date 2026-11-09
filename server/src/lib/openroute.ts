import type { Coord, LatLng } from './routeGeo'

/**
 * The openrouteservice client — the only place the routing key is read, and it
 * never leaves the server. Every route the app draws comes through here.
 *
 * Free (Standard) plan: 2,000 directions requests a day, 40 a minute. The app
 * keeps its own daily count (see routeUsage) well under that.
 */

const BASE = 'https://api.openrouteservice.org/v2/directions/foot-walking/geojson'
const TIMEOUT_MS = 12_000

export type RouteErrorCode = 'quota' | 'down' | 'no_route' | 'config'

export class RouteError extends Error {
    constructor(
        public code: RouteErrorCode,
        message: string
    ) {
        super(message)
    }
}

export interface OrsRoute {
    coords: Coord[]
    distanceM: number
    ascentM?: number
    descentM?: number
    /** Share of the route (0–1) on unpaved ground or steps, when it was asked for. */
    roughShare?: number
}

export type Fetcher = typeof fetch

interface OrsExtras {
    surface?: { summary?: { value: number; amount: number }[] }
    waytype?: { summary?: { value: number; amount: number }[] }
}

// ORS surface codes: unpaved, the gravels, dirt, ground, ice, sand, woodchips, grass.
const ROUGH_SURFACES = new Set([2, 8, 9, 10, 11, 12, 13, 15, 16, 17])
const STEPS_WAYTYPE = 8

function roughShareOf(extras: OrsExtras | undefined): number | undefined {
    if (!extras?.surface?.summary) return undefined
    const sum = (rows: { amount: number }[]) => rows.reduce((t, r) => t + r.amount, 0)
    const rough = sum(extras.surface.summary.filter((r) => ROUGH_SURFACES.has(r.value)))
    const steps = sum((extras.waytype?.summary ?? []).filter((r) => r.value === STEPS_WAYTYPE))
    return Math.min(1, (rough + steps) / 100)
}

/** Read a GeoJSON directions response down to the line and its numbers. */
export function readOrsResponse(body: unknown): OrsRoute {
    const feature = (body as { features?: unknown[] })?.features?.[0] as
        | {
              geometry?: { coordinates?: Coord[] }
              properties?: { summary?: { distance?: number }; ascent?: number; descent?: number; extras?: OrsExtras }
          }
        | undefined
    const coords = feature?.geometry?.coordinates
    if (!coords || coords.length < 2) throw new RouteError('no_route', 'No walkable route from this start point.')
    return {
        coords,
        distanceM: feature?.properties?.summary?.distance ?? 0,
        ascentM: feature?.properties?.ascent,
        descentM: feature?.properties?.descent,
        roughShare: roughShareOf(feature?.properties?.extras),
    }
}

async function post(body: object, fetcher: Fetcher): Promise<OrsRoute> {
    const key = process.env.ORS_API_KEY
    if (!key) throw new RouteError('config', 'Route generation is not set up: ORS_API_KEY is missing.')
    let res: Response
    try {
        res = await fetcher(BASE, {
            method: 'POST',
            headers: {
                Authorization: key,
                'Content-Type': 'application/json',
                Accept: 'application/geo+json, application/json',
            },
            body: JSON.stringify({ ...body, elevation: true, instructions: false }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch {
        throw new RouteError('down', 'The routing service is not responding.')
    }
    if (res.ok) return readOrsResponse(await res.json())

    // 403 is the daily quota, 429 the per-minute one.
    if (res.status === 403 || res.status === 429)
        throw new RouteError('quota', 'The routing service quota is used up for now.')
    // 2009 route not found, 2010 point not found, 2004 limits exceeded — all mean
    // "nothing walkable here", whatever status they arrive with.
    const err = (await res.json().catch(() => null)) as { error?: { code?: number } } | null
    const code = err?.error?.code
    const noRoute = code === 2009 || code === 2010 || code === 2004
    if (noRoute || res.status === 400 || res.status === 404)
        throw new RouteError('no_route', 'No walkable route from this start point.')
    throw new RouteError('down', 'The routing service is down.')
}

/** A loop of about `lengthM` from `start`. `seed` and `points` change its shape. */
export function roundTrip(
    start: LatLng,
    lengthM: number,
    seed: number,
    points: number,
    fetcher: Fetcher = fetch
): Promise<OrsRoute> {
    return post(
        {
            coordinates: [[start.lng, start.lat]],
            options: { round_trip: { length: Math.round(lengthM), points, seed } },
        },
        fetcher
    )
}

/** A one-way walk from `start` to `end`. */
export function oneWay(start: LatLng, end: LatLng, fetcher: Fetcher = fetch): Promise<OrsRoute> {
    return post(
        {
            coordinates: [
                [start.lng, start.lat],
                [end.lng, end.lat],
            ],
        },
        fetcher
    )
}

/** A walk through `points` in order: start, any places to pass, finish. */
export function through(points: LatLng[], fetcher: Fetcher = fetch): Promise<OrsRoute> {
    return post({ coordinates: points.map((p) => [p.lng, p.lat]) }, fetcher)
}

/**
 * A walk through `points` that reports how rough it is. The point at `loose`
 * is one we made up, so it may snap to the nearest path however far away.
 */
export function throughLoose(
    points: LatLng[],
    loose: number,
    avoidSteps: boolean,
    fetcher: Fetcher = fetch
): Promise<OrsRoute> {
    return post(
        {
            coordinates: points.map((p) => [p.lng, p.lat]),
            radiuses: points.map((_, i) => (i === loose ? -1 : 350)),
            extra_info: ['surface', 'waytype'],
            ...(avoidSteps ? { options: { avoid_features: ['steps'] } } : {}),
        },
        fetcher
    )
}

export interface Place {
    label: string
    lat: number
    lng: number
}

const GEOCODE = 'https://api.openrouteservice.org/geocode/autocomplete'
const MAX_PLACES = 6

/** Places matching `text`, the ones nearest `near` first when it's given. */
export async function searchPlaces(text: string, near: LatLng | null, fetcher: Fetcher = fetch): Promise<Place[]> {
    const key = process.env.ORS_API_KEY
    if (!key) throw new RouteError('config', 'Place search is not set up: ORS_API_KEY is missing.')
    const params = new URLSearchParams({ text, size: String(MAX_PLACES) })
    if (near) {
        params.set('focus.point.lat', String(near.lat))
        params.set('focus.point.lon', String(near.lng))
    }
    let res: Response
    try {
        res = await fetcher(`${GEOCODE}?${params}`, {
            headers: { Authorization: key, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch {
        throw new RouteError('down', 'The place search is not responding.')
    }
    if (res.status === 403 || res.status === 429) throw new RouteError('quota', 'The place search quota is used up for now.')
    if (!res.ok) throw new RouteError('down', 'The place search is down.')
    const body = (await res.json()) as {
        features?: { geometry?: { coordinates?: number[] }; properties?: { label?: string; name?: string } }[]
    }
    return (body.features ?? []).flatMap((f) => {
        const [lng, lat] = f.geometry?.coordinates ?? []
        const label = f.properties?.label ?? f.properties?.name
        return typeof lat === 'number' && typeof lng === 'number' && label ? [{ label, lat, lng }] : []
    })
}

/** What's at a point, in a few words: the nearest address or named place. */
export async function nameOfPoint(point: LatLng, fetcher: Fetcher = fetch): Promise<string | null> {
    const key = process.env.ORS_API_KEY
    if (!key) throw new RouteError('config', 'Place search is not set up: ORS_API_KEY is missing.')
    const params = new URLSearchParams({ 'point.lat': String(point.lat), 'point.lon': String(point.lng), size: '1' })
    let res: Response
    try {
        res = await fetcher(`https://api.openrouteservice.org/geocode/reverse?${params}`, {
            headers: { Authorization: key, Accept: 'application/json' },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        })
    } catch {
        throw new RouteError('down', 'The place search is not responding.')
    }
    if (res.status === 403 || res.status === 429) throw new RouteError('quota', 'The place search quota is used up for now.')
    if (!res.ok) throw new RouteError('down', 'The place search is down.')
    const body = (await res.json()) as { features?: { properties?: { name?: string; label?: string } }[] }
    const found = body.features?.[0]?.properties
    return found?.name ?? found?.label ?? null
}
