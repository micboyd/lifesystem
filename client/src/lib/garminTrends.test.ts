import { describe, it, expect } from 'vitest'
import {
    addDaysIso,
    adjoins,
    bucketAverages,
    bucketFor,
    metricDays,
    niceScale,
    summarise,
    weekStart,
    type WatchDay,
} from './garminTrends'

const TODAY = '2026-11-14' // a Saturday

function run(from: string, n: number, value: (i: number) => number) {
    return Array.from({ length: n }, (_, i) => ({ date: addDaysIso(from, i), value: value(i) }))
}

describe('weekStart', () => {
    it('is the Monday on or before the date', () => {
        expect(weekStart('2026-11-14')).toBe('2026-11-09')
        expect(weekStart('2026-11-09')).toBe('2026-11-09')
        expect(weekStart('2026-11-15')).toBe('2026-11-09')
    })
})

describe('metricDays', () => {
    const days: WatchDay[] = [
        { date: '2026-11-12', steps: 12000, sleepMin: 430 },
        { date: '2026-11-13', sleepMin: 344 },
        { date: TODAY, steps: 7000, sleepMin: 543 },
    ]

    it('leaves today out of measures still climbing, and keeps it for the rest', () => {
        expect(metricDays(days, 'steps', '2026-01-01', TODAY, TODAY)).toEqual([{ date: '2026-11-12', value: 12000 }])
        expect(metricDays(days, 'sleepMin', '2026-01-01', TODAY, TODAY)).toHaveLength(3)
    })

    it('a day without the measure is unknown, not zero', () => {
        expect(metricDays(days, 'restingHr', '2026-01-01', TODAY, TODAY)).toEqual([])
    })

    it('keeps to the range', () => {
        expect(metricDays(days, 'sleepMin', '2026-11-13', '2026-11-13', TODAY)).toEqual([
            { date: '2026-11-13', value: 344 },
        ])
    })
})

describe('bucketAverages', () => {
    it('averages each week over the days that had a figure', () => {
        const values = [...run('2026-11-02', 7, () => 10000), ...run('2026-11-09', 4, (i) => 8000 + i * 1000)]
        expect(bucketAverages(values, 'week')).toEqual([
            { date: '2026-11-02', value: 10000, days: 7 },
            { date: '2026-11-09', value: 9500, days: 4 },
        ])
    })

    it('drops a week with too few days to be an average', () => {
        expect(bucketAverages(run('2026-11-09', 2, () => 5000), 'week')).toEqual([])
    })

    it('groups by calendar month', () => {
        const points = bucketAverages(run('2026-09-01', 61, (i) => (i < 30 ? 100 : 200)), 'month')
        expect(points.map((p) => [p.date, p.value])).toEqual([
            ['2026-09-01', 100],
            ['2026-10-01', 200],
        ])
    })
})

describe('bucketFor / adjoins', () => {
    it('uses weeks up to three years and months beyond', () => {
        expect(bucketFor('2024-11-15', TODAY)).toBe('week')
        expect(bucketFor('2019-01-01', TODAY)).toBe('month')
    })

    it('spots a gap between points', () => {
        const p = (date: string) => ({ date, value: 1, days: 7 })
        expect(adjoins(p('2026-11-02'), p('2026-11-09'), 'week')).toBe(true)
        expect(adjoins(p('2026-10-19'), p('2026-11-09'), 'week')).toBe(false)
        expect(adjoins(p('2026-09-01'), p('2026-10-01'), 'month')).toBe(true)
        expect(adjoins(p('2026-07-01'), p('2026-10-01'), 'month')).toBe(false)
    })
})

describe('summarise', () => {
    it('compares the first four weeks with the last four', () => {
        const values = run(addDaysIso(TODAY, -364), 365, (i) => (i < 28 ? 8000 : i >= 365 - 28 ? 11000 : 9000))
        const s = summarise(values, TODAY)
        expect(s.start).toBe(8000)
        expect(s.recent).toBe(11000)
        expect(s.change).toBe(3000)
        expect(s.days).toBe(365)
        expect(s.firstDate).toBe(addDaysIso(TODAY, -364))
    })

    it('gives no change when the two ends would overlap', () => {
        const s = summarise(run(addDaysIso(TODAY, -39), 40, () => 9000), TODAY)
        expect(s.average).toBe(9000)
        expect(s.recent).toBe(9000)
        expect(s.change).toBeNull()
    })

    it('gives no recent figure when the watch has not been worn lately', () => {
        const s = summarise(run('2025-01-01', 100, () => 9000), TODAY)
        expect(s.recent).toBeNull()
        expect(s.change).toBeNull()
    })

    it('is empty without readings', () => {
        expect(summarise([], TODAY).average).toBeNull()
    })
})

describe('niceScale', () => {
    it('lands on round numbers around the data', () => {
        const s = niceScale(8200, 12900)
        expect(s.lo).toBeLessThanOrEqual(8200)
        expect(s.hi).toBeGreaterThanOrEqual(12900)
        expect(s.ticks[0]).toBe(s.lo)
        expect(s.ticks[s.ticks.length - 1]).toBe(s.hi)
        expect(s.ticks.every((t) => t % 500 === 0)).toBe(true)
    })

    it('does not stretch a flat series', () => {
        const s = niceScale(55, 55, 10)
        expect(s.hi - s.lo).toBeGreaterThanOrEqual(10)
    })

    it('never dips below zero for positive data', () => {
        expect(niceScale(1, 40, 100).lo).toBe(0)
    })
})
