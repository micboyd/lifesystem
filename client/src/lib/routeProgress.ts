import { haversine, type LatLng, type RouteCoord } from './routeTrack'

/**
 * Following a run along its planned route from live GPS fixes: how far along
 * the route you are, how far off it, and your recent pace. Pure, so it's
 * tested without a phone.
 */

export interface Snap {
    /** Metres along the route to the nearest point on it. */
    atM: number
    /** Metres from the route line. */
    offM: number
}

// Metres per degree near the fix — fine for the few hundred metres a segment spans.
function local(origin: LatLng) {
    const kx = 111_320 * Math.cos((origin.lat * Math.PI) / 180)
    const ky = 110_540
    return (p: LatLng) => ({ x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * ky })
}

/** Nearest point on each segment whose start lies in [fromM, toM]. */
function nearestIn(coords: RouteCoord[], cum: number[], p: LatLng, fromM: number, toM: number): Snap | null {
    const xy = local(p)
    let best: Snap | null = null
    for (let i = 0; i < coords.length - 1; i++) {
        if (cum[i + 1] < fromM || cum[i] > toM) continue
        const a = xy({ lng: coords[i][0], lat: coords[i][1] })
        const b = xy({ lng: coords[i + 1][0], lat: coords[i + 1][1] })
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len2 = dx * dx + dy * dy
        const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (-a.x * dx - a.y * dy) / len2))
        const off = Math.hypot(a.x + dx * t, a.y + dy * t)
        if (!best || off < best.offM) best = { atM: cum[i] + (cum[i + 1] - cum[i]) * t, offM: off }
    }
    return best
}

/** Searching this far behind and ahead of the last known spot keeps an out-and-back on the right leg. */
export const BEHIND_M = 150
export const AHEAD_M = 800
/** Beyond this far from the line you count as off the route. */
export const OFF_ROUTE_M = 40

/**
 * Where a fix sits on the route. It looks near `lastM` first, so on ground the
 * route covers twice (an out-and-back, a shared stretch) you stay on the leg
 * you're running; only if that finds nothing close does it search the whole
 * route — after a shortcut, say, or a GPS jump.
 */
export function snapToRoute(coords: RouteCoord[], cum: number[], p: LatLng, lastM: number): Snap | null {
    if (coords.length < 2) return null
    const near = nearestIn(coords, cum, p, lastM - BEHIND_M, lastM + AHEAD_M)
    if (near && near.offM <= OFF_ROUTE_M) return near
    const any = nearestIn(coords, cum, p, -Infinity, Infinity)
    if (!near) return any
    // Somewhere else on the route is clearly closer: you've moved on.
    return any && any.offM + 10 < near.offM ? any : near
}

export interface Fix {
    lat: number
    lng: number
    /** ms since epoch */
    t: number
    accuracy: number
}

/** Fixes worse than this are too rough to add up distance from. */
export const MAX_ACCURACY_M = 35

/**
 * Seconds per km over the last `windowS` seconds of fixes, or null until
 * there's enough movement to tell. Rough fixes are skipped.
 */
export function recentPace(fixes: Fix[], windowS = 30): number | null {
    const good = fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M)
    if (good.length < 2) return null
    const end = good[good.length - 1].t
    const inWindow = good.filter((f) => end - f.t <= windowS * 1000)
    if (inWindow.length < 2) return null
    let m = 0
    for (let i = 1; i < inWindow.length; i++) m += haversine(inWindow[i - 1], inWindow[i])
    const s = (end - inWindow[0].t) / 1000
    if (s < 8 || m < 15) return null
    return (s / m) * 1000
}

/** "5:42 /km". */
export function formatPace(secPerKm: number | null): string {
    if (secPerKm === null || !Number.isFinite(secPerKm) || secPerKm > 30 * 60) return '—'
    const r = Math.round(secPerKm)
    return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')} /km`
}

/** "12:05" or "1:02:05". */
export function formatClock(sec: number): string {
    const s = Math.max(0, Math.floor(sec))
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = String(s % 60).padStart(2, '0')
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "Starts uphill · +18 m over the first 900 m" — or flat. */
export function openingText(openingM: number, distanceM: number): string {
    const over = Math.round(Math.min(1500, Math.max(400, distanceM * 0.25)) / 100) * 100
    if (Math.abs(openingM) < 3) return `Starts flat over the first ${over} m`
    return `Starts ${openingM > 0 ? 'uphill' : 'downhill'} · ${openingM > 0 ? '+' : '−'}${Math.abs(openingM)} m over the first ${over} m`
}

/** Compass bearing from `a` to `b`, degrees clockwise from north (0–360). */
export function bearing(a: LatLng, b: LatLng): number {
    const r = Math.PI / 180
    const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r)
    const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r)
    return ((Math.atan2(y, x) / r) % 360 + 360) % 360
}

/** You need to have moved this far for the direction of travel to mean anything. */
export const HEADING_MIN_M = 12

/**
 * Which way you're heading, in compass degrees, or null when you're standing
 * still. Uses the device's own heading when it gives one while moving;
 * otherwise the line from the latest good fix back to one at least
 * HEADING_MIN_M behind it (within the last 30 s).
 */
export function travelHeading(fixes: Fix[], deviceHeading?: number | null, speed?: number | null): number | null {
    if (deviceHeading != null && Number.isFinite(deviceHeading) && (speed ?? 0) > 0.7) return deviceHeading
    const good = fixes.filter((f) => f.accuracy <= MAX_ACCURACY_M)
    const last = good[good.length - 1]
    if (!last) return null
    for (let i = good.length - 2; i >= 0; i--) {
        const f = good[i]
        if (last.t - f.t > 30_000) break
        if (haversine(f, last) >= HEADING_MIN_M) return bearing(f, last)
    }
    return null
}
