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
}

export type Fetcher = typeof fetch

/** Read a GeoJSON directions response down to the line and its numbers. */
export function readOrsResponse(body: unknown): OrsRoute {
    const feature = (body as { features?: unknown[] })?.features?.[0] as
        | {
              geometry?: { coordinates?: Coord[] }
              properties?: { summary?: { distance?: number }; ascent?: number; descent?: number }
          }
        | undefined
    const coords = feature?.geometry?.coordinates
    if (!coords || coords.length < 2) throw new RouteError('no_route', 'No walkable route from this start point.')
    return {
        coords,
        distanceM: feature?.properties?.summary?.distance ?? 0,
        ascentM: feature?.properties?.ascent,
        descentM: feature?.properties?.descent,
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
