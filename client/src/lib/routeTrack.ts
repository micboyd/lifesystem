/**
 * Measuring along a generated route: where each km falls, the point a given
 * distance in, and the elevation profile. Coordinates are [lng, lat, ele?] as
 * the server stores them.
 */

export type RouteCoord = number[]

export interface LatLng {
    lat: number
    lng: number
}

const EARTH_M = 6_371_008.8
const rad = (d: number) => (d * Math.PI) / 180

export function haversine(a: LatLng, b: LatLng): number {
    const dLat = rad(b.lat - a.lat)
    const dLng = rad(b.lng - a.lng)
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

export const toLatLng = (c: RouteCoord): LatLng => ({ lng: c[0], lat: c[1] })

/** Metres from the start to each coordinate. */
export function cumulative(coords: RouteCoord[]): number[] {
    const out = [0]
    for (let i = 1; i < coords.length; i++) out.push(out[i - 1] + haversine(toLatLng(coords[i - 1]), toLatLng(coords[i])))
    return out
}

/** The point (and its elevation) `atM` metres along the route. */
export function pointAt(coords: RouteCoord[], cum: number[], atM: number): { lat: number; lng: number; ele?: number } {
    if (coords.length === 0) return { lat: 0, lng: 0 }
    if (atM <= 0) return { ...toLatLng(coords[0]), ele: coords[0][2] }
    const last = cum.length - 1
    if (atM >= cum[last]) return { ...toLatLng(coords[last]), ele: coords[last][2] }
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (cum[mid] <= atM) lo = mid
        else hi = mid
    }
    const span = cum[hi] - cum[lo] || 1
    const t = (atM - cum[lo]) / span
    const a = coords[lo]
    const b = coords[hi]
    const ele = a[2] !== undefined && b[2] !== undefined ? a[2] + (b[2] - a[2]) * t : undefined
    return { lng: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, ele }
}

/** A marker at every whole km short of the finish. */
export function kmMarkers(coords: RouteCoord[], cum: number[]): { km: number; lat: number; lng: number }[] {
    const total = cum[cum.length - 1] ?? 0
    const out: { km: number; lat: number; lng: number }[] = []
    for (let km = 1; km * 1000 < total; km++) {
        const p = pointAt(coords, cum, km * 1000)
        out.push({ km, lat: p.lat, lng: p.lng })
    }
    return out
}

/** Up to `samples` evenly spaced { atM, ele } points for the elevation chart. */
export function elevationProfile(coords: RouteCoord[], cum: number[], samples = 160): { atM: number; ele: number }[] {
    const total = cum[cum.length - 1] ?? 0
    if (total === 0 || coords.every((c) => c[2] === undefined)) return []
    const out: { atM: number; ele: number }[] = []
    for (let i = 0; i <= samples; i++) {
        const atM = (total * i) / samples
        const p = pointAt(coords, cum, atM)
        if (p.ele !== undefined) out.push({ atM, ele: p.ele })
    }
    return out
}

/** "3.62 km" / "850 m". */
export function formatKm(m: number): string {
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

/** "+120 m" / "−80 m" — the signed gap to the target. */
export function formatDiff(m: number): string {
    const r = Math.round(m)
    if (r === 0) return 'On target'
    return `${r > 0 ? '+' : '−'}${Math.abs(r)} m`
}

/** "38 min" / "1 h 05 min". */
export function formatDuration(sec: number): string {
    const min = Math.round(sec / 60)
    if (min < 60) return `${min} min`
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}
