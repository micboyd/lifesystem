import { describe, expect, it } from 'vitest'
import { activityType, clock, isLoop, lapRows, paceScore, paceText, runDistance, series, zoneShares } from './garminRun'
import type { GarminRunLap, PlannedStep } from '../services/garmin'

const lap = (over: Partial<GarminRunLap>): GarminRunLap => ({
    index: 0,
    distanceM: 1000,
    durationS: 360,
    movingS: 360,
    avgSpeed: 1000 / 360,
    avgHr: 150,
    maxHr: 160,
    elevGainM: 2,
    intensity: 'ACTIVE',
    stepIndex: null,
    ...over,
})

const run = (label: string, fastest: number, slowest: number): PlannedStep => ({
    type: 'run',
    label,
    end: { kind: 'distance', metres: 1000 },
    paceTarget: { fastestSecPerKm: fastest, slowestSecPerKm: slowest },
})

describe('formatting', () => {
    it('reads distance, clock and pace plainly', () => {
        expect(runDistance(5012)).toBe('5.01 km')
        expect(runDistance(850.4)).toBe('850 m')
        expect(runDistance(null)).toBe('—')
        expect(clock(1810)).toBe('30:10')
        expect(clock(3723)).toBe('1:02:03')
        expect(paceText(1000 / 360)).toBe('6:00')
        expect(paceText(0)).toBe('—')
    })

    it('names activity types', () => {
        expect(activityType('running')).toBe('Run')
        expect(activityType('treadmill_running')).toBe('Treadmill run')
        expect(activityType('walking')).toBe('Walk')
        expect(activityType('open_water_swimming')).toBe('Open water swimming')
    })
})

describe('lapRows', () => {
    it('pairs laps with steps in order and judges pace against the band', () => {
        const rows = lapRows(
            [run('Easy', 330, 390), run('Fast', 280, 300), run('Easy', 330, 390)],
            [lap({ avgSpeed: 1000 / 360 }), lap({ avgSpeed: 1000 / 310 }), lap({ avgSpeed: 1000 / 320 })]
        )
        expect(rows.map((r) => r.verdict)).toEqual(['on', 'slow', 'fast'])
        expect(paceScore(rows)).toEqual({ on: 1, of: 3 })
    })

    it('keeps extra laps and steps never reached', () => {
        const extra = lapRows([run('A', 300, 400)], [lap({}), lap({})])
        expect(extra[1].label).toBe('Lap 2')
        expect(extra[1].planned).toBeNull()
        const short = lapRows([run('A', 300, 400), run('B', 300, 400)], [lap({})])
        expect(short[1].lap).toBeNull()
        expect(short[1].verdict).toBeNull()
    })

    it('has no score without pace targets', () => {
        expect(paceScore(lapRows([], [lap({})]))).toBeNull()
    })
})

describe('isLoop', () => {
    it('is a loop when the ends are close', () => {
        expect(isLoop([[-0.1, 51.5], [-0.11, 51.51], [-0.1001, 51.5001]])).toBe(true)
        expect(isLoop([[-0.1, 51.5], [-0.12, 51.52]])).toBe(false)
    })
})

describe('zoneShares', () => {
    it('fills all five zones', () => {
        const z = zoneShares({ zones: [{ zone: 2, seconds: 300, lowBpm: 120 }, { zone: 3, seconds: 100, lowBpm: 140 }] })
        expect(z.map((x) => x.zone)).toEqual([1, 2, 3, 4, 5])
        expect(z[1].share).toBeCloseTo(0.75)
        expect(z[0].seconds).toBe(0)
    })

    it('is empty with no HR', () => {
        expect(zoneShares({ zones: [] })).toEqual([])
    })
})

describe('series', () => {
    it('pairs values with time and drops gaps', () => {
        const s = series({ chart: { t: [0, 5, 10], d: [0, 10, 20], hr: [100, null, 140] } }, 'hr')
        expect(s).toEqual([
            { t: 0, d: 0, v: 100 },
            { t: 10, d: 20, v: 140 },
        ])
    })

    it('turns speed into smoothed pace and drops stops', () => {
        const s = series({ chart: { t: [0, 5, 10], speed: [0.1, 0.1, 0.1] } }, 'pace')
        expect(s).toEqual([])
        const p = series({ chart: { t: [0, 5], speed: [1000 / 300, 1000 / 300] } }, 'pace')
        expect(p[0].v).toBeCloseTo(300)
    })
})
