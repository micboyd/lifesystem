import { describe, expect, it } from 'vitest'
import { googleMapsUrl, pickWaypoints, MAX_WAYPOINTS } from './routeMaps'

/** A square loop, 500 m a side, sampled every ~50 m, from a corner. */
function squareLoop(): number[][] {
    const lat0 = 51.5
    const lng0 = -0.12
    const dLat = 500 / 110_540
    const dLng = 500 / (Math.cos((lat0 * Math.PI) / 180) * 111_320)
    const corners = [
        [lng0, lat0],
        [lng0 + dLng, lat0],
        [lng0 + dLng, lat0 + dLat],
        [lng0, lat0 + dLat],
        [lng0, lat0],
    ]
    const out: number[][] = []
    for (let s = 0; s < 4; s++) {
        const [a, b] = [corners[s], corners[s + 1]]
        for (let i = 0; i < 10; i++) out.push([a[0] + ((b[0] - a[0]) * i) / 10, a[1] + ((b[1] - a[1]) * i) / 10, 10])
    }
    out.push(corners[4])
    return out
}

const params = (url: string) => new URL(url).searchParams

describe('pickWaypoints', () => {
    it('picks the three other corners of a square — its turning points', () => {
        const loop = squareLoop()
        expect(pickWaypoints(loop)).toEqual([10, 20, 30])
    })
    it('never returns more than three', () => {
        const zigzag = Array.from({ length: 200 }, (_, i) => [-0.12 + i * 0.0005, 51.5 + (i % 2) * 0.002])
        expect(pickWaypoints(zigzag).length).toBeLessThanOrEqual(MAX_WAYPOINTS)
    })
    it('adds nothing to a straight line', () => {
        const line = Array.from({ length: 20 }, (_, i) => [-0.12 + i * 0.0005, 51.5])
        expect(pickWaypoints(line)).toEqual([])
    })
})

describe('googleMapsUrl', () => {
    it('builds a walking directions URL with the loop starting and finishing on one point', () => {
        const url = googleMapsUrl(squareLoop(), 'loop')
        expect(url.startsWith('https://www.google.com/maps/dir/?api=1&')).toBe(true)
        const p = params(url)
        expect(p.get('origin')).toBe('51.500000,-0.120000')
        expect(p.get('destination')).toBe(p.get('origin'))
        expect(p.get('travelmode')).toBe('walking')
        expect(p.get('dir_action')).toBe('navigate')
        expect(p.get('waypoints')!.split('|')).toHaveLength(3)
    })

    it('encodes the commas and pipes rather than sending them raw', () => {
        const url = googleMapsUrl(squareLoop(), 'loop')
        expect(url).toContain('origin=51.500000%2C-0.120000')
        expect(url).toContain('%7C')
        expect(url).not.toMatch(/waypoints=[^&]*\|/)
    })

    it('caps a long, wiggly route at three waypoints', () => {
        const wiggle = Array.from({ length: 500 }, (_, i) => [-0.12 + i * 0.0002, 51.5 + Math.sin(i / 7) * 0.003])
        expect(params(googleMapsUrl(wiggle, 'loop')).get('waypoints')!.split('|').length).toBeLessThanOrEqual(3)
    })

    it('keeps an out-and-back turn point as a waypoint', () => {
        const out = Array.from({ length: 21 }, (_, i) => [-0.12 + i * 0.001, 51.5 + (i > 10 ? (i - 10) * 0.001 : 0), 5])
        const there = out.slice(0, 21)
        const coords = [...there, ...[...there].reverse().slice(1)]
        const p = params(googleMapsUrl(coords, 'outback'))
        const ways = p.get('waypoints')!.split('|')
        expect(ways.length).toBeLessThanOrEqual(3)
        const turn = there[20]
        expect(ways).toContain(`${turn[1].toFixed(6)},${turn[0].toFixed(6)}`)
        expect(p.get('destination')).toBe(p.get('origin'))
    })
})
