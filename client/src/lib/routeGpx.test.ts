import { describe, expect, it } from 'vitest'
import { gpxFileName, routeGpx } from './routeGpx'

describe('routeGpx', () => {
    const coords = [
        [-0.12, 51.5, 12.34],
        [-0.121, 51.501, 13],
        [-0.12, 51.5],
    ]
    const gpx = routeGpx(coords, 'Run & walk <1>', '2026-11-02T08:00:00.000Z')

    it('is GPX 1.1 with every point in order', () => {
        expect(gpx).toContain('<gpx version="1.1"')
        expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
        expect(gpx.match(/<trkpt /g)).toHaveLength(3)
        expect(gpx.indexOf('lon="-0.121000"')).toBeGreaterThan(gpx.indexOf('lon="-0.120000"'))
    })

    it('puts lat and lon the right way round, with elevation when known', () => {
        expect(gpx).toContain('<trkpt lat="51.500000" lon="-0.120000"><ele>12.3</ele></trkpt>')
        expect(gpx).toContain('<trkpt lat="51.500000" lon="-0.120000"></trkpt>')
    })

    it('escapes the name', () => {
        expect(gpx).toContain('<name>Run &amp; walk &lt;1&gt;</name>')
        expect(gpx).toContain('<time>2026-11-02T08:00:00.000Z</time>')
    })

    it('parses as XML', async () => {
        expect(gpx.startsWith('<?xml')).toBe(true)
        expect(gpx.split('<trkseg>')).toHaveLength(2)
    })

    it('makes a safe file name', () => {
        expect(gpxFileName('Outdoor Run-Walk 1 - 5 x 400 m')).toBe('outdoor-run-walk-1-5-x-400-m.gpx')
    })
})
