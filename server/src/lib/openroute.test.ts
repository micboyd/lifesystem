import { afterEach, describe, expect, it } from 'vitest'
import { nameOfPoint, roundTrip, RouteError, searchPlaces, through } from './openroute'

const json = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

describe('openroute client', () => {
    afterEach(() => {
        delete process.env.ORS_API_KEY
    })

    it('sends the key in a header, never the URL, and reads 3D coordinates', async () => {
        process.env.ORS_API_KEY = 'secret-key'
        let seenUrl = ''
        let seenAuth = ''
        let seenBody: Record<string, unknown> = {}
        const fetcher = (async (url: string, init: RequestInit) => {
            seenUrl = url
            seenAuth = (init.headers as Record<string, string>).Authorization
            seenBody = JSON.parse(String(init.body))
            return new Response(
                JSON.stringify({
                    features: [
                        {
                            geometry: { coordinates: [[-0.1, 51.5, 12], [-0.11, 51.51, 15]] },
                            properties: { summary: { distance: 3612 }, ascent: 14, descent: 13 },
                        },
                    ],
                }),
                { status: 200 }
            )
        }) as unknown as typeof fetch
        const route = await roundTrip({ lat: 51.5, lng: -0.1 }, 3600, 42, 4, fetcher)
        expect(seenUrl).not.toContain('secret-key')
        expect(seenAuth).toBe('secret-key')
        expect(seenBody).toMatchObject({ elevation: true, options: { round_trip: { length: 3600, seed: 42, points: 4 } } })
        expect(route).toMatchObject({ distanceM: 3612, ascentM: 14, descentM: 13 })
        expect(route.coords[0]).toEqual([-0.1, 51.5, 12])
    })

    it.each([
        [403, {}, 'quota'],
        [429, {}, 'quota'],
        [503, {}, 'down'],
        [404, { error: { code: 2009 } }, 'no_route'],
        [400, { error: { code: 2010 } }, 'no_route'],
        [500, { error: { code: 2099 } }, 'down'],
    ])('maps HTTP %i to %s', async (status, body, code) => {
        process.env.ORS_API_KEY = 'k'
        await expect(roundTrip({ lat: 51.5, lng: -0.1 }, 3600, 1, 3, json(status, body))).rejects.toMatchObject({ code })
    })

    it('refuses to run without a key', async () => {
        await expect(roundTrip({ lat: 51.5, lng: -0.1 }, 3600, 1, 3, json(200, {}))).rejects.toBeInstanceOf(RouteError)
    })

    it('routes through points in order, as lng/lat, with no round trip', async () => {
        process.env.ORS_API_KEY = 'k'
        let body: Record<string, unknown> = {}
        const fetcher = (async (_url: string, init: RequestInit) => {
            body = JSON.parse(String(init.body))
            return new Response(
                JSON.stringify({ features: [{ geometry: { coordinates: [[-2, 53], [-2.1, 53.1]] }, properties: { summary: { distance: 900 } } }] }),
                { status: 200 }
            )
        }) as unknown as typeof fetch
        const route = await through([{ lat: 53, lng: -2 }, { lat: 53.1, lng: -2.1 }, { lat: 53, lng: -2 }], fetcher)
        expect(body.coordinates).toEqual([[-2, 53], [-2.1, 53.1], [-2, 53]])
        expect(body.options).toBeUndefined()
        expect(route.distanceM).toBe(900)
    })

    it('searches places near a point, with the key in a header, skipping broken results', async () => {
        process.env.ORS_API_KEY = 'secret-key'
        let seenUrl = ''
        let seenAuth = ''
        const fetcher = (async (url: string, init: RequestInit) => {
            seenUrl = url
            seenAuth = (init.headers as Record<string, string>).Authorization
            return new Response(
                JSON.stringify({
                    features: [
                        { geometry: { coordinates: [-2.2, 53.4] }, properties: { label: 'Heaton Park, Manchester' } },
                        { geometry: {}, properties: { label: 'Nowhere' } },
                    ],
                }),
                { status: 200 }
            )
        }) as unknown as typeof fetch
        const places = await searchPlaces('heaton', { lat: 53.4, lng: -2.2 }, fetcher)
        expect(places).toEqual([{ label: 'Heaton Park, Manchester', lat: 53.4, lng: -2.2 }])
        expect(seenUrl).toContain('focus.point.lat=53.4')
        expect(seenUrl).not.toContain('secret-key')
        expect(seenAuth).toBe('secret-key')
    })

    it('reads a place search quota error', async () => {
        process.env.ORS_API_KEY = 'k'
        await expect(searchPlaces('heaton', null, json(429, {}))).rejects.toMatchObject({ code: 'quota' })
    })

    it('names a point with its short name, or nothing when nothing is there', async () => {
        process.env.ORS_API_KEY = 'k'
        const named = json(200, { features: [{ properties: { name: '12 High Street', label: '12 High Street, Town, UK' } }] })
        await expect(nameOfPoint({ lat: 53, lng: -2 }, named)).resolves.toBe('12 High Street')
        await expect(nameOfPoint({ lat: 0, lng: 0 }, json(200, { features: [] }))).resolves.toBeNull()
    })
})
