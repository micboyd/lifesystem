import { describe, expect, it, vi } from 'vitest'
import { generateRoute, type RouteClient } from './routeGenerate'
import { RouteError, type OrsRoute } from './openroute'
import { destinationPoint, type Coord, type LatLng } from './routeGeo'

const START: LatLng = { lat: 51.5, lng: -0.12 }

/** A circular loop through `start` of about `lengthM`, its direction set by `seed`. */
function fakeLoop(start: LatLng, lengthM: number, seed: number, climb = 10): OrsRoute {
    const r = lengthM / (2 * Math.PI)
    const bearing = (seed * 137.508) % 360
    const centre = destinationPoint(start, bearing, r)
    const coords: Coord[] = []
    for (let i = 0; i <= 72; i++) {
        const p = destinationPoint(centre, bearing + 180 + i * 5, r)
        coords.push([p.lng, p.lat, 20 + climb * Math.sin((i / 72) * Math.PI)])
    }
    return { coords, distanceM: lengthM, ascentM: climb, descentM: climb }
}

function client(over: Partial<RouteClient> & { factor?: number } = {}): RouteClient {
    const factor = over.factor ?? 1
    return {
        roundTrip: over.roundTrip ?? (async (s, len, seed) => fakeLoop(s, len * factor, seed)),
        oneWay: over.oneWay ?? (async () => { throw new Error('unused') }),
    }
}

describe('generateRoute', () => {
    it('stops after three calls when it already has a choice', async () => {
        const out = await generateRoute({ start: START, targetM: 3600, kind: 'loop', used: new Set(), seen: [], bad: [], client: client() })
        expect(out.calls).toBe(3)
        expect(out.pick.kind).toBe('valid')
        expect(Math.abs(out.route!.distanceM - 3600)).toBeLessThanOrEqual(250)
    })

    it('rescales the second wave when the first all runs long', async () => {
        const roundTrip = vi.fn(async (s: LatLng, len: number, seed: number) => fakeLoop(s, len * 1.3, seed))
        const out = await generateRoute({ start: START, targetM: 3600, kind: 'loop', used: new Set(), seen: [], bad: [], client: client({ roundTrip }) })
        expect(out.calls).toBe(5)
        const second = roundTrip.mock.calls.slice(3).map((c) => c[1])
        expect(second.every((len) => Math.abs(len - 3600 / 1.3) < 2)).toBe(true)
        expect(out.pick.kind).toBe('valid')
    })

    it('sends new seeds every press and never repeats a route', async () => {
        const used = new Set<string>()
        const seen: string[][] = []
        const shown = new Set<string>()
        for (let press = 0; press < 12; press++) {
            const out = await generateRoute({ start: START, targetM: 3600, kind: 'loop', used, seen, bad: [], client: client() })
            for (const k of out.tried) {
                expect(used.has(k)).toBe(false)
                used.add(k)
            }
            expect(out.route).not.toBeNull()
            expect(shown.has(out.route!.key)).toBe(false)
            shown.add(out.route!.key)
            seen.push(out.route!.cells)
        }
    })

    it('offers the closest route when none is in tolerance', async () => {
        const out = await generateRoute({ start: START, targetM: 3600, kind: 'loop', used: new Set(), seen: [], bad: [], client: client({ roundTrip: async (s, _l, seed) => fakeLoop(s, 4500 + seed % 7, seed) }) })
        expect(out.pick.kind).toBe('closest')
        if (out.pick.kind === 'closest') expect(out.pick.diffM).toBe(out.route!.distanceM - 3600)
    })

    it('doubles an out-and-back leg and counts both directions of climb', async () => {
        const oneWay = async (s: LatLng, e: LatLng): Promise<OrsRoute> => ({
            coords: [[s.lng, s.lat, 10], [e.lng, e.lat, 30]],
            distanceM: 1800,
            ascentM: 20,
            descentM: 0,
        })
        const out = await generateRoute({ start: START, targetM: 3600, kind: 'outback', used: new Set(), seen: [], bad: [], client: client({ oneWay }) })
        expect(out.route!.distanceM).toBe(3600)
        expect(out.route!.ascentM).toBe(20)
        expect(out.route!.descentM).toBe(20)
        const c = out.route!.coords
        expect(c[0]).toEqual(c[c.length - 1])
    })

    it('surfaces a quota error when every call is refused', async () => {
        const roundTrip = async () => { throw new RouteError('quota', 'quota') }
        await expect(
            generateRoute({ start: START, targetM: 3600, kind: 'loop', used: new Set(), seen: [], bad: [], client: client({ roundTrip }) })
        ).rejects.toMatchObject({ code: 'quota' })
    })

    it('surfaces no-route when there is nothing walkable', async () => {
        const roundTrip = async () => { throw new RouteError('no_route', 'none') }
        await expect(
            generateRoute({ start: START, targetM: 3600, kind: 'loop', used: new Set(), seen: [], bad: [], client: client({ roundTrip }) })
        ).rejects.toMatchObject({ code: 'no_route' })
    })
})
