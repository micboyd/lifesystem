import { describe, it, expect } from 'vitest'
import {
    readingsOf,
    measurementTrend,
    measurementDirection,
    allMeasurementTrends,
    FLAT_THRESHOLD_CM,
} from './bodyMeasurements'
import { compositionSeries, compositionChange } from './nutritionTrend'
import type { WeightLog } from '../types'

function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

const START = '2026-08-21'

/** A weigh-in carrying whichever measurements are given. */
function log(date: string, weight: number, extra: Partial<WeightLog> = {}): WeightLog {
    return { _id: date, date, weight, createdAt: '', updatedAt: '', ...extra }
}

/** Waist readings every `every` days, starting at `from` and moving `perMonth` cm. */
function waistSeries(from: number, perMonth: number, count: number, every = 7): WeightLog[] {
    return Array.from({ length: count }, (_, i) =>
        log(plus(START, i * every), 103, { waist: from + (perMonth * i * every) / 28 })
    )
}

describe('readingsOf', () => {
    it('pulls one measurement out, sorted and deduped', () => {
        const logs = [
            log(plus(START, 7), 103, { waist: 111 }),
            log(START, 103, { waist: 112 }),
            log(plus(START, 7), 103, { waist: 110.8 }),
        ]
        expect(readingsOf(logs, 'waist')).toEqual([
            { date: START, cm: 112 },
            { date: plus(START, 7), cm: 110.8 },
        ])
    })

    it('skips weigh-ins that did not record it', () => {
        const logs = [log(START, 103, { waist: 112 }), log(plus(START, 1), 102.8)]
        expect(readingsOf(logs, 'waist')).toHaveLength(1)
    })

    it('ignores nonsensical values rather than plotting them', () => {
        expect(readingsOf([log(START, 103, { waist: 0 })], 'waist')).toHaveLength(0)
    })

    it('reads any measurement, not just waist', () => {
        const logs = [log(START, 103, { chest: 108, armLeft: 38.5 })]
        expect(readingsOf(logs, 'chest')).toHaveLength(1)
        expect(readingsOf(logs, 'armLeft')[0].cm).toBe(38.5)
    })
})

describe('measurementTrend gaps', () => {
    it('says nothing when nothing was measured', () => {
        expect(measurementTrend([log(START, 103)], 'waist')).toBe('none')
    })

    it('refuses a trend from one reading', () => {
        expect(measurementTrend([log(START, 103, { waist: 112 })], 'waist')).toBe('too-few')
    })

    it('refuses two readings taken too close together', () => {
        const logs = [
            log(START, 103, { waist: 112 }),
            log(plus(START, 3), 103, { waist: 111.4 }),
        ]
        expect(measurementTrend(logs, 'waist')).toBe('too-short-a-span')
    })
})

describe('measurementTrend', () => {
    it('reports current, start and the change between them', () => {
        // Weekly readings falling ~1.1 cm a month over 12 weeks.
        const t = measurementTrend(waistSeries(112, -1.1, 13), 'waist')
        if (typeof t === 'string') throw new Error(t)
        expect(t.start.cm).toBe(112)
        expect(t.current.cm).toBeCloseTo(112 - (1.1 * 84) / 28, 5)
        expect(t.changeCm).toBeCloseTo(-3.3, 5)
        expect(t.readings).toBe(13)
    })

    it('measures the last four weeks against a reading at least that old', () => {
        const t = measurementTrend(waistSeries(112, -1.1, 13), 'waist')
        if (typeof t === 'string') throw new Error(t)
        expect(t.recentFrom).not.toBeNull()
        expect(t.recentChangeCm).toBeCloseTo(-1.1, 1)
    })

    it('leaves the recent change null when nothing is old enough to compare', () => {
        // Three weekly readings: none is four weeks behind the last.
        const t = measurementTrend(waistSeries(112, -1.1, 3), 'waist')
        if (typeof t === 'string') throw new Error(t)
        expect(t.recentChangeCm).toBeNull()
        expect(t.recentFrom).toBeNull()
        // The whole-span rate is still available.
        expect(t.monthlyRateCm).not.toBeNull()
    })

    it('handles sparse readings without inventing any', () => {
        const logs = [
            log(START, 103, { waist: 112 }),
            log(plus(START, 33), 103, { waist: 110.6 }),
            log(plus(START, 71), 103, { waist: 108.9 }),
        ]
        const t = measurementTrend(logs, 'waist')
        if (typeof t === 'string') throw new Error(t)
        expect(t.readings).toBe(3)
        expect(t.changeCm).toBeCloseTo(-3.1, 5)
        expect(t.spanDays).toBe(71)
    })

    it('reports an increase as an increase', () => {
        const t = measurementTrend(waistSeries(98, 1.2, 13), 'waist')
        if (typeof t === 'string') throw new Error(t)
        expect(t.changeCm).toBeGreaterThan(0)
        expect(t.monthlyRateCm!).toBeCloseTo(1.2, 1)
    })

    it('ignores readings taken after the date being asked about', () => {
        const logs = waistSeries(112, -1.1, 13)
        const t = measurementTrend(logs, 'waist', plus(START, 28))
        if (typeof t === 'string') throw new Error(t)
        expect(t.current.date <= plus(START, 28)).toBe(true)
        expect(t.readings).toBe(5)
    })

    it('collects every measurement that has enough history', () => {
        const logs = [
            log(START, 103, { waist: 112, chest: 110 }),
            log(plus(START, 28), 103, { waist: 110.8, chest: 109.6, neck: 41 }),
        ]
        const trends = allMeasurementTrends(logs, ['waist', 'chest', 'neck', 'hips'])
        expect(trends.map((t) => t.field)).toEqual(['waist', 'chest'])
    })
})

describe('measurementDirection', () => {
    it('calls a real monthly fall falling', () => {
        expect(measurementDirection(measurementTrend(waistSeries(112, -1.4, 13), 'waist'))).toBe(
            'falling'
        )
    })

    it('calls a real monthly rise rising', () => {
        expect(measurementDirection(measurementTrend(waistSeries(98, 1.4, 13), 'waist'))).toBe(
            'rising'
        )
    })

    it('calls tape-measure noise flat rather than progress', () => {
        const barely = measurementTrend(waistSeries(112, -(FLAT_THRESHOLD_CM / 2), 13), 'waist')
        expect(measurementDirection(barely)).toBe('flat')
    })

    it('is unknown without a trend', () => {
        expect(measurementDirection('none')).toBe('unknown')
        expect(measurementDirection('too-few')).toBe('unknown')
    })
})

describe('body composition', () => {
    it('splits weight into fat and lean mass', () => {
        const [c] = compositionSeries([log(START, 103, { bodyFat: 28.8 })])
        expect(c.fatMassKg).toBeCloseTo(29.664, 3)
        expect(c.leanMassKg).toBeCloseTo(73.336, 3)
        expect(c.fatMassKg + c.leanMassKg).toBeCloseTo(103, 6)
    })

    it('skips readings with no body fat recorded', () => {
        expect(compositionSeries([log(START, 103)])).toHaveLength(0)
    })

    it('rejects impossible body-fat values rather than computing from them', () => {
        expect(compositionSeries([log(START, 103, { bodyFat: 0 })])).toHaveLength(0)
        expect(compositionSeries([log(START, 103, { bodyFat: 100 })])).toHaveLength(0)
        expect(compositionSeries([log(START, 103, { bodyFat: 150 })])).toHaveLength(0)
    })

    it('rejects an impossible weight', () => {
        expect(compositionSeries([log(START, 0, { bodyFat: 28.8 })])).toHaveLength(0)
    })

    it('shows lean mass held when fat falls faster than weight', () => {
        const s = compositionSeries([
            log(START, 103, { bodyFat: 28.8 }),
            log(plus(START, 84), 100.4, { bodyFat: 26.1 }),
        ])
        const change = compositionChange(s)!
        expect(change.fatMassKg).toBeLessThan(-2.5)
        expect(change.leanMassKg).toBeGreaterThan(0)
    })
})
