import { describe, it, expect } from 'vitest'
import {
    trendSeries,
    weeklyRate,
    projectTargetDate,
    rateStatus,
    ratePercent,
    daysBetween,
    DAILY_ALPHA,
} from './weightTrend'
import type { WeightLog } from '../types'

/** A weigh-in, with only the fields the trend math reads. */
function log(date: string, weight: number): WeightLog {
    return {
        _id: date,
        date,
        weight,
        createdAt: '',
        updatedAt: '',
    }
}

describe('daysBetween', () => {
    it('counts whole calendar days, signed', () => {
        expect(daysBetween('2026-08-01', '2026-08-08')).toBe(7)
        expect(daysBetween('2026-08-08', '2026-08-01')).toBe(-7)
        expect(daysBetween('2026-08-01', '2026-08-01')).toBe(0)
    })

    it('spans month and year boundaries', () => {
        expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
        expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1)
    })

    it('is unaffected by DST changes', () => {
        // UK clocks go forward on 2026-03-29 — a naive local-time diff gives 0.958 days.
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    })
})

describe('trendSeries', () => {
    it('starts the trend at the first reading', () => {
        const points = trendSeries([log('2026-08-01', 90)])
        expect(points).toHaveLength(1)
        expect(points[0].trend).toBe(90)
    })

    it('sorts by date regardless of input order', () => {
        const points = trendSeries([
            log('2026-08-03', 89),
            log('2026-08-01', 90),
            log('2026-08-02', 91),
        ])
        expect(points.map((p) => p.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    })

    it('moves the trend by alpha of the gap to a next-day reading', () => {
        const points = trendSeries([log('2026-08-01', 90), log('2026-08-02', 92)])
        // 90 + 0.15 × (92 − 90)
        expect(points[1].trend).toBeCloseTo(90.3, 10)
        // The raw reading is preserved alongside it.
        expect(points[1].weight).toBe(92)
    })

    it('damps a single spike far more than a sustained change', () => {
        const spike = trendSeries([
            log('2026-08-01', 90),
            log('2026-08-02', 93), // one heavy morning
            log('2026-08-03', 90),
        ])
        const sustained = trendSeries([
            log('2026-08-01', 90),
            log('2026-08-02', 93),
            log('2026-08-03', 93),
        ])
        expect(spike[2].trend).toBeLessThan(sustained[2].trend)
        // The spike barely shifts the line — that's the whole point of smoothing.
        expect(spike[2].trend).toBeCloseTo(90.3825, 4)
    })

    it('compounds smoothing across skipped days', () => {
        const gapped = trendSeries([log('2026-08-01', 90), log('2026-08-15', 86)])
        // 14 days of compounding: 1 − 0.85^14 ≈ 0.8972
        const effective = 1 - Math.pow(1 - DAILY_ALPHA, 14)
        expect(gapped[1].trend).toBeCloseTo(90 + effective * (86 - 90), 10)
        // A reading after two weeks away should land near it, not be damped to a crawl.
        expect(gapped[1].trend).toBeLessThan(86.5)
    })

    it('keeps the last reading given for a duplicated date', () => {
        const points = trendSeries([log('2026-08-01', 90), log('2026-08-01', 91)])
        expect(points).toHaveLength(1)
        expect(points[0].weight).toBe(91)
    })

    it('ignores non-positive and non-finite readings', () => {
        const points = trendSeries([
            log('2026-08-01', 90),
            log('2026-08-02', 0),
            log('2026-08-03', Number.NaN),
        ])
        expect(points.map((p) => p.date)).toEqual(['2026-08-01'])
    })

    it('returns nothing for no logs', () => {
        expect(trendSeries([])).toEqual([])
    })
})

describe('weeklyRate', () => {
    it('returns null until there are two points a day apart', () => {
        expect(weeklyRate([])).toBeNull()
        expect(weeklyRate(trendSeries([log('2026-08-01', 90)]))).toBeNull()
    })

    it('is negative while losing', () => {
        // A month of steady loss: 90 → 88 over 28 days.
        const logs = Array.from({ length: 29 }, (_, i) =>
            log(`2026-08-${String(i + 1).padStart(2, '0')}`.slice(0, 10), 90 - (2 * i) / 28)
        ).slice(0, 28)
        const rate = weeklyRate(trendSeries(logs))
        expect(rate).not.toBeNull()
        expect(rate!).toBeLessThan(0)
    })

    it('measures only within the window', () => {
        const points = trendSeries([
            log('2026-06-01', 95), // outside a 28-day window
            log('2026-08-01', 90),
            log('2026-08-29', 88),
        ])
        const windowed = weeklyRate(points, 28)!
        const whole = weeklyRate(points, 365)!
        // The old, much heavier reading only shows up in the longer window.
        expect(Math.abs(whole)).toBeGreaterThan(Math.abs(windowed))
    })

    it('divides by the days actually spanned, not the window length', () => {
        // Two points 7 days apart, trend moving 90 → 89.x; a 28-day window must
        // still report a per-week rate based on the 7 days covered.
        const points = trendSeries([log('2026-08-01', 90), log('2026-08-08', 88)])
        const rate = weeklyRate(points, 28)!
        const span = points[1].trend - points[0].trend
        expect(rate).toBeCloseTo(span, 10) // 7 days spanned → rate === the span
    })
})

describe('projectTargetDate', () => {
    const points = trendSeries([log('2026-08-01', 90), log('2026-08-08', 89)])

    it('returns null without a rate', () => {
        expect(projectTargetDate(points, 80, null)).toBeNull()
        expect(projectTargetDate(points, 80, 0)).toBeNull()
    })

    it('returns null with no weigh-ins', () => {
        expect(projectTargetDate([], 80, -0.5)).toBeNull()
    })

    it('projects forward at the given rate', () => {
        const current = points[points.length - 1].trend
        const target = current - 2 // 2 kg to go
        // At 0.5 kg/week that's 4 weeks from the last weigh-in.
        expect(projectTargetDate(points, target, -0.5)).toBe('2026-09-05')
    })

    it('returns null when the rate points away from the target', () => {
        const current = points[points.length - 1].trend
        expect(projectTargetDate(points, current - 5, 0.5)).toBeNull() // gaining, target below
        expect(projectTargetDate(points, current + 5, -0.5)).toBeNull() // losing, target above
    })

    it('returns the last weigh-in date when already at the target', () => {
        const current = points[points.length - 1].trend
        expect(projectTargetDate(points, current, -0.5)).toBe('2026-08-08')
    })
})

describe('rateStatus', () => {
    it('reports no data before a rate exists', () => {
        expect(rateStatus(null, -0.5)).toBe('no-data')
    })

    it('reports no goal when none is set', () => {
        expect(rateStatus(-0.5)).toBe('no-goal')
        expect(rateStatus(-0.5, 0)).toBe('no-goal')
    })

    it('calls a barely-moving trend stalled', () => {
        expect(rateStatus(-0.02, -0.5)).toBe('stalled')
        expect(rateStatus(0, -0.5)).toBe('stalled')
    })

    it('flags movement in the wrong direction', () => {
        expect(rateStatus(0.3, -0.5)).toBe('wrong-way')
        expect(rateStatus(-0.3, 0.5)).toBe('wrong-way')
    })

    it('allows a quarter-kilo either side of the target', () => {
        expect(rateStatus(-0.5, -0.5)).toBe('on-track')
        expect(rateStatus(-0.3, -0.5)).toBe('on-track')
        expect(rateStatus(-0.7, -0.5)).toBe('on-track')
    })

    it('separates too slow from too fast', () => {
        expect(rateStatus(-0.2, -0.5)).toBe('slow')
        expect(rateStatus(-1.0, -0.5)).toBe('fast')
        // Judged on magnitude, so a gain works the same way.
        expect(rateStatus(1.0, 0.5)).toBe('fast')
    })
})

describe('ratePercent', () => {
    it('expresses the rate as a share of current bodyweight', () => {
        const points = trendSeries([log('2026-08-01', 100)])
        expect(ratePercent(points, -1)).toBeCloseTo(-1, 10) // 1 kg of 100 kg
    })

    it('returns null without a rate or any weigh-ins', () => {
        expect(ratePercent(trendSeries([log('2026-08-01', 90)]), null)).toBeNull()
        expect(ratePercent([], -0.5)).toBeNull()
    })
})
