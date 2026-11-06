import { describe, expect, it } from 'vitest'
import { cumulative } from './routeTrack'
import { formatClock, formatPace, openingText, recentPace, snapToRoute, type Fix } from './routeProgress'

// A straight 1 km leg east, then back again — an out-and-back over the same ground.
const LAT = 51.5
const east = (m: number) => -0.12 + m / (111_320 * Math.cos((LAT * Math.PI) / 180))
const leg = [0, 250, 500, 750, 1000].map((m) => [east(m), LAT])
const outback = [...leg, ...[...leg].reverse().slice(1)]
const cum = cumulative(outback)

describe('snapToRoute', () => {
    it('stays on the outward leg early in the run', () => {
        const s = snapToRoute(outback, cum, { lat: LAT, lng: east(300) }, 200)!
        expect(s.atM).toBeGreaterThan(280)
        expect(s.atM).toBeLessThan(320)
    })

    it('stays on the return leg late in the run, at the same spot', () => {
        const s = snapToRoute(outback, cum, { lat: LAT, lng: east(300) }, 1600)!
        expect(s.atM).toBeGreaterThan(1680)
        expect(s.atM).toBeLessThan(1720)
    })

    it('measures how far off the line you are', () => {
        const s = snapToRoute(outback, cum, { lat: LAT + 60 / 110_540, lng: east(500) }, 400)!
        expect(s.offM).toBeGreaterThan(55)
        expect(s.offM).toBeLessThan(65)
    })

    it('jumps ahead when you have clearly moved on', () => {
        const s = snapToRoute(outback, cum, { lat: LAT, lng: east(990) }, 0)!
        expect(s.atM).toBeGreaterThan(950)
    })
})

describe('recentPace', () => {
    const fixes = (secPerKm: number, n: number, accuracy = 5): Fix[] =>
        Array.from({ length: n }, (_, i) => ({ lat: LAT, lng: east((i * 5 * 1000) / secPerKm), t: i * 5000, accuracy }))

    it('reads a steady 6:00 /km', () => {
        expect(recentPace(fixes(360, 8))).toBeCloseTo(360, 0)
    })
    it('waits for enough movement', () => {
        expect(recentPace(fixes(360, 1))).toBeNull()
    })
    it('ignores rough fixes', () => {
        expect(recentPace(fixes(360, 8, 80))).toBeNull()
    })
})

describe('formatting', () => {
    it('formats pace and clock', () => {
        expect(formatPace(342)).toBe('5:42 /km')
        expect(formatPace(null)).toBe('—')
        expect(formatClock(725)).toBe('12:05')
        expect(formatClock(3725)).toBe('1:02:05')
    })
    it('describes how the route starts', () => {
        expect(openingText(18, 3600)).toBe('Starts uphill · +18 m over the first 900 m')
        expect(openingText(-9, 8000)).toBe('Starts downhill · −9 m over the first 1500 m')
        expect(openingText(1, 3600)).toBe('Starts flat over the first 900 m')
    })
})
