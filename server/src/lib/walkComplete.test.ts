import { describe, expect, it } from 'vitest'
import { RouteError, type OrsRoute } from './openroute'
import { haversine, type LatLng } from './routeGeo'
import { completeRoute, detourOffset, MAX_COMPLETE_CALLS, type CompleteClient } from './walkComplete'

const A = { lat: 53.4, lng: -2.2 }
const B = { lat: 53.41, lng: -2.2 } // about 1.1 km north

const line = (points: LatLng[], factor: number): OrsRoute => {
    let m = 0
    for (let i = 1; i < points.length; i++) m += haversine(points[i - 1], points[i])
    return { coords: points.map((p) => [p.lng, p.lat]), distanceM: m * factor, roughShare: 0 }
}

/** Streets that wind by `factor`, recording every call. */
function streets(factor = 1.3) {
    const calls: { points: LatLng[]; loose: number | null; avoidSteps: boolean }[] = []
    const client: CompleteClient = {
        route: async (points, loose, avoidSteps) => {
            calls.push({ points, loose, avoidSteps })
            return line(points, factor)
        },
    }
    return { client, calls }
}

describe('detourOffset', () => {
    it('goes out half the extra on a leg with no length', () => expect(detourOffset(0, 1300)).toBeCloseTo(500))
    it('adds the extra when walked out and back to the line', () => {
        const offset = detourOffset(1000, 1300) // 1000 straight-line extra
        expect(2 * Math.hypot(500, offset) - 1000).toBeCloseTo(1000)
    })
})

describe('completeRoute', () => {
    const points = [A, B, A]

    it('leaves a walk alone when the places already reach the target', async () => {
        const { client, calls } = streets()
        const out = await completeRoute({ points: [A, B], targetM: 1000, seed: 0, client })
        expect(out.stop).toBeNull()
        expect(calls).toHaveLength(1)
    })

    it('adds one point that keeps the places in order and lands near the target', async () => {
        const { client } = streets()
        const out = await completeRoute({ points, targetM: 6000, seed: 0, client })
        expect(out.stop).not.toBeNull()
        expect(Math.abs(out.route.distanceM - 6000)).toBeLessThan(6000 * 0.06)
        expect([0, 1]).toContain(out.stopIndex)
        expect(out.calls).toBeLessThanOrEqual(MAX_COMPLETE_CALLS)
    })

    it('marks only the made-up point as loose and avoids steps', async () => {
        const { client, calls } = streets()
        await completeRoute({ points, targetM: 6000, seed: 0, client })
        expect(calls[0].loose).toBeNull()
        for (const c of calls.slice(1)) {
            expect(c.points).toHaveLength(4)
            expect(c.loose).toBeGreaterThan(0)
            expect(c.avoidSteps).toBe(true)
        }
    })

    it('tries different directions when pressed again', async () => {
        const a = streets()
        const b = streets()
        const one = await completeRoute({ points, targetM: 6000, seed: 0, client: a.client })
        const two = await completeRoute({ points, targetM: 6000, seed: 1, client: b.client })
        expect(two.stop).not.toEqual(one.stop)
    })

    it('prefers the least rough route on target', async () => {
        let n = 0
        const client: CompleteClient = {
            route: async (p, loose) => {
                if (loose === null) return { ...line(p, 1), distanceM: 3000 }
                n += 1
                return { coords: [[0, 0]], distanceM: 6000, roughShare: n === 2 ? 0 : 0.5 }
            },
        }
        const out = await completeRoute({ points, targetM: 6000, seed: 0, client })
        expect(out.route.roughShare).toBe(0)
    })

    it('rescales when the first wave misses', async () => {
        const { client, calls } = streets(1.9) // winds far more than expected, so the first wave overshoots
        await completeRoute({ points, targetM: 9000, seed: 0, client })
        expect(calls.length).toBe(1 + 3 + 2)
    })

    it('allows steps rather than give up', async () => {
        const client: CompleteClient = {
            route: async (p, loose, avoidSteps) => {
                if (loose !== null && avoidSteps) throw new RouteError('no_route', 'no')
                return line(p, 1.3)
            },
        }
        const out = await completeRoute({ points, targetM: 6000, seed: 0, client })
        expect(out.stop).not.toBeNull()
    })

    it('turns a there-and-back that is already long enough into a way round', async () => {
        const { client, calls } = streets()
        const out = await completeRoute({ points, targetM: 2000, seed: 0, client })
        expect(out.stop).not.toBeNull()
        expect(calls.length).toBeGreaterThan(1)
    })

    it('says so when nothing can be added', async () => {
        const client: CompleteClient = {
            route: async (p, loose) => {
                if (loose !== null) throw new RouteError('no_route', 'no')
                return line(p, 1)
            },
        }
        await expect(completeRoute({ points, targetM: 6000, seed: 0, client })).rejects.toMatchObject({ code: 'no_route' })
    })
})
