import { haversine, toLatLng, type LatLng, type RouteCoord } from './routeTrack'

/**
 * The hand-off to Google Maps: a directions URL with the route's start, finish
 * and up to three waypoints. Mobile browsers drop waypoints past three, so the
 * three are chosen to hold the route's shape — the turning points furthest from
 * the line drawn so far — rather than spaced at round fractions of the distance.
 */

export const MAX_WAYPOINTS = 3
export const MAPS_WARNING = 'Google Maps may adjust this route between waypoints, so its distance can differ.'

/** Distance in metres from `p` to the segment a–b (flat projection; fine at route scale). */
function offLine(p: LatLng, a: LatLng, b: LatLng): number {
    const kx = Math.cos((a.lat * Math.PI) / 180) * 111_320
    const ky = 110_540
    const px = (p.lng - a.lng) * kx
    const py = (p.lat - a.lat) * ky
    const bx = (b.lng - a.lng) * kx
    const by = (b.lat - a.lat) * ky
    const len2 = bx * bx + by * by
    if (len2 === 0) return haversine(p, a)
    const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2))
    return Math.hypot(px - t * bx, py - t * by)
}

/**
 * Indices of up to `n` shape-holding points, in route order. Greedy
 * Douglas–Peucker: start from the two ends, then keep adding whichever point
 * sits furthest off the line through the points picked so far.
 */
export function pickWaypoints(coords: RouteCoord[], n = MAX_WAYPOINTS): number[] {
    if (coords.length < 3) return []
    const pts = coords.map(toLatLng)
    const picked = [0, pts.length - 1]
    for (let k = 0; k < n; k++) {
        let best = -1
        let bestD = 0
        for (let s = 0; s < picked.length - 1; s++) {
            const a = picked[s]
            const b = picked[s + 1]
            for (let i = a + 1; i < b; i++) {
                const d = offLine(pts[i], pts[a], pts[b])
                if (d > bestD) {
                    bestD = d
                    best = i
                }
            }
        }
        // Nothing meaningfully off the line: the rest of the route is straight.
        if (best < 0 || bestD < 15) break
        picked.push(best)
        picked.sort((x, y) => x - y)
    }
    return picked.slice(1, -1)
}

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`

/**
 * The Google Maps directions URL. A loop starts and finishes on the same
 * point. An out-and-back's waypoints come from the outward leg only (the turn
 * point among them); Maps brings it home the same way. A one-way walk ends
 * where its line ends. Coordinates only, never
 * place names, each encoded.
 */
export function googleMapsUrl(coords: RouteCoord[], kind: 'loop' | 'outback' | 'oneway'): string {
    const start = toLatLng(coords[0])
    const finish = kind === 'loop' ? start : toLatLng(coords[coords.length - 1])
    let wayIdx: number[]
    if (kind === 'outback') {
        const half = coords.slice(0, Math.ceil(coords.length / 2))
        // The turn point is always kept; the other two hold the outward leg's shape.
        wayIdx = [...pickWaypoints(half, MAX_WAYPOINTS - 1), half.length - 1]
        wayIdx = [...new Set(wayIdx)].sort((a, b) => a - b)
    } else {
        wayIdx = pickWaypoints(coords, MAX_WAYPOINTS)
    }
    const params = new URLSearchParams({
        api: '1',
        origin: fmt(start),
        destination: fmt(finish),
    })
    if (wayIdx.length) params.set('waypoints', wayIdx.map((i) => fmt(toLatLng(coords[i]))).join('|'))
    params.set('travelmode', 'walking')
    params.set('dir_action', 'navigate')
    return `https://www.google.com/maps/dir/?${params.toString()}`
}
