/**
 * Plain geometry for generated running routes. Coordinates are GeoJSON order,
 * [lng, lat] or [lng, lat, ele], so they pass straight through from
 * openrouteservice without being flipped.
 */

export type Coord = [number, number] | [number, number, number]

export interface LatLng {
    lat: number
    lng: number
}

/** A { lat, lng } from a request body, or null if it isn't a real point. */
export function readPoint(raw: unknown): LatLng | null {
    if (!raw || typeof raw !== 'object') return null
    const { lat, lng } = raw as Record<string, unknown>
    if (typeof lat !== 'number' || typeof lng !== 'number') return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { lat, lng }
}

const EARTH_M = 6_371_008.8
const rad = (d: number) => (d * Math.PI) / 180

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h =
        Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

const toLatLng = (c: Coord): LatLng => ({ lng: c[0], lat: c[1] })

/** Total length of a line in metres. */
export function pathLength(coords: Coord[]): number {
    let total = 0
    for (let i = 1; i < coords.length; i++) total += haversine(toLatLng(coords[i - 1]), toLatLng(coords[i]))
    return total
}

/** The point `distM` away from `from` on a compass bearing (degrees). */
export function destinationPoint(from: LatLng, bearingDeg: number, distM: number): LatLng {
    const d = distM / EARTH_M
    const b = rad(bearingDeg)
    const lat1 = rad(from.lat)
    const lng1 = rad(from.lng)
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
    const lng2 =
        lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
    return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 }
}

/** Climb and drop along a line, ignoring wobbles under `noiseM` so DEM jitter doesn't count. */
export function elevationStats(coords: Coord[], noiseM = 1): { ascent: number; descent: number } {
    let ascent = 0
    let descent = 0
    let ref: number | undefined
    for (const c of coords) {
        const ele = c[2]
        if (ele === undefined) continue
        if (ref === undefined) {
            ref = ele
            continue
        }
        const diff = ele - ref
        if (Math.abs(diff) < noiseM) continue
        if (diff > 0) ascent += diff
        else descent -= diff
        ref = ele
    }
    return { ascent: Math.round(ascent), descent: Math.round(descent) }
}

/** Evenly spaced points every `stepM` along a line, for comparing shapes. */
export function resample(coords: Coord[], stepM: number): LatLng[] {
    if (coords.length === 0) return []
    const out: LatLng[] = [toLatLng(coords[0])]
    let carry = 0
    for (let i = 1; i < coords.length; i++) {
        const a = toLatLng(coords[i - 1])
        const b = toLatLng(coords[i])
        const seg = haversine(a, b)
        if (seg === 0) continue
        let at = stepM - carry
        while (at <= seg) {
            const t = at / seg
            out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
            at += stepM
        }
        carry = seg - (at - stepM)
    }
    return out
}

// About 50 m square at UK latitudes — coarse enough that the same street drawn
// slightly differently lands in the same cell, fine enough to tell streets apart.
const CELL_DEG_LAT = 0.00045
const CELL_DEG_LNG = 0.0007

const cellOf = (p: LatLng) => `${Math.floor(p.lat / CELL_DEG_LAT)}:${Math.floor(p.lng / CELL_DEG_LNG)}`

/** The set of grid cells a route passes through — its fingerprint for "same route?". */
export function routeCells(coords: Coord[]): string[] {
    return [...new Set(resample(coords, 20).map(cellOf))].sort()
}

/** How much of `a` is also in `b`, as the overlap over the smaller set (0–1). */
export function cellOverlap(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0
    const [small, big] = a.length <= b.length ? [a, new Set(b)] : [b, new Set(a)]
    let shared = 0
    for (const c of small) if (big.has(c)) shared++
    return shared / small.length
}

/**
 * The share of a route (0–1) that runs over ground it already covered — a loop
 * that doubles back on itself scores high. Samples every 20 m and counts a cell
 * as repeated when it's revisited after the route has been away from it.
 */
export function repeatedShare(coords: Coord[]): number {
    const cells = resample(coords, 20).map(cellOf)
    if (cells.length < 2) return 0
    const lastSeen = new Map<string, number>()
    let repeated = 0
    cells.forEach((c, i) => {
        const prev = lastSeen.get(c)
        // Gone for more than a few samples (~100 m) and back again.
        if (prev !== undefined && i - prev > 5) repeated++
        lastSeen.set(c, i)
    })
    return repeated / cells.length
}

/** Metres within which a spur's tip counts as reaching a place you asked to pass. */
const KEEP_NEAR_M = 75

/**
 * Cut out "up the street and back": wherever the line reverses over its own
 * points, the spur goes, unless its tip is somewhere in `keep`. Routes come off
 * one street graph, so a retraced stretch repeats the same coordinates exactly.
 * If that would leave under 30% of the line, it was all spur: left alone.
 */
export function trimSpurs(coords: Coord[], keep: LatLng[]): Coord[] {
    const same = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1]
    const kept = (c: Coord) => keep.some((p) => haversine(toLatLng(c), p) <= KEEP_NEAR_M)
    const out: Coord[] = []
    for (const c of coords) {
        const n = out.length
        if (n >= 2 && same(c, out[n - 2]) && !kept(out[n - 1])) out.pop()
        else out.push(c)
    }
    return pathLength(out) < pathLength(coords) * 0.3 ? coords : out
}

/** The point of a line nearest `p`. */
export function nearestOnLine(coords: Coord[], p: LatLng): LatLng {
    let best = toLatLng(coords[0])
    let bestM = Infinity
    for (const c of coords) {
        const m = haversine(toLatLng(c), p)
        if (m < bestM) {
            bestM = m
            best = toLatLng(c)
        }
    }
    return best
}

/** The elevation `atM` metres along a line, or undefined where it has none. */
export function elevationAt(coords: Coord[], atM: number): number | undefined {
    let walked = 0
    for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1]
        const b = coords[i]
        const seg = haversine(toLatLng(a), toLatLng(b))
        if (walked + seg >= atM) {
            if (a[2] === undefined || b[2] === undefined) return b[2] ?? a[2]
            const t = seg === 0 ? 0 : (atM - walked) / seg
            return a[2] + (b[2] - a[2]) * t
        }
        walked += seg
    }
    return coords[coords.length - 1]?.[2]
}

/** How far in "the start" of a run reaches: a quarter of it, between 400 m and 1.5 km. */
export function openingLength(distanceM: number): number {
    return Math.min(1500, Math.max(400, distanceM * 0.25))
}

/**
 * Net climb (positive) or drop (negative) over the opening of a line, in
 * metres — what "starts uphill" or "starts downhill" is judged on. Zero when
 * the line carries no elevation.
 */
export function openingClimb(coords: Coord[], distanceM = pathLength(coords)): number {
    const from = coords[0]?.[2]
    const to = elevationAt(coords, openingLength(distanceM))
    if (from === undefined || to === undefined) return 0
    return Math.round(to - from)
}
