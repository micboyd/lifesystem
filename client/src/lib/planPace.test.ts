import { describe, it, expect } from 'vitest'
import { planPace, planLine, valueOn, verdictOf } from './planPace'
import { trendSeries } from './weightTrend'
import type { NutritionPhase, PhaseGoal, WeightLog } from '../types'

function phase(over: Partial<NutritionPhase> = {}, goal?: PhaseGoal): NutritionPhase {
    return {
        _id: 'p', name: 'Cut', startDate: '2026-10-01', endDate: '2026-12-24',
        kind: 'cut', targets: { calories: 2500, protein: 200, carbs: 250, fat: 80 },
        createdAt: '', updatedAt: '', goal, ...over,
    } as NutritionPhase
}

const w = (date: string, trend: number) => ({ date, weight: trend, trend })
const f = (date: string, trend: number) => ({ date, bodyFat: trend, trend })

describe('verdictOf', () => {
    it('is on track within half a kilo either side', () => {
        expect(verdictOf(0.4, -0.5)).toBe('on-track')
        expect(verdictOf(-0.5, -0.5)).toBe('on-track')
    })
    it('reads lighter than the line as ahead on a cut, behind on a gain', () => {
        expect(verdictOf(-1, -0.5)).toBe('slightly-ahead')
        expect(verdictOf(-2, -0.5)).toBe('ahead')
        expect(verdictOf(-1, 0.25)).toBe('slightly-behind')
        expect(verdictOf(2, -0.5)).toBe('behind')
    })
    it('says above or below for a hold', () => {
        expect(verdictOf(1, 0)).toBe('above')
        expect(verdictOf(-1, 0)).toBe('below')
    })
})

describe('planLine', () => {
    it('runs start to target by the goal date', () => {
        const line = planLine(phase({}, { targetDate: '2026-11-26' }), 100, 96, null)!
        expect(line.ratePerWeek).toBeCloseTo(-0.5)
        expect(valueOn(line, '2026-10-29')).toBeCloseTo(98)
        // Held at the target past the date, and at the start before it.
        expect(valueOn(line, '2027-01-01')).toBeCloseTo(96)
        expect(valueOn(line, '2026-09-01')).toBe(100)
    })
    it('falls back to the stated rate, then flat for maintain, else nothing', () => {
        expect(planLine(phase(), 100, null, -0.75)!.ratePerWeek).toBe(-0.75)
        expect(planLine(phase({ kind: 'maintain' }), 100, null, null)!.ratePerWeek).toBe(0)
        expect(planLine(phase(), 100, null, null)).toBeNull()
        expect(planLine(phase(), null, 96, null)).toBeNull()
    })
})

describe('planPace', () => {
    it('is null without a plan', () => {
        expect(planPace(null, [w('2026-10-01', 100)], [])).toBeNull()
    })

    it('judges the latest weigh-in against the line on its own date', () => {
        const p = phase({ weeklyRate: -0.5 }, { startWeightKg: 100 })
        // Four weeks in, the line says 98; the trend says 97.
        const pace = planPace(p, [w('2026-10-01', 100), w('2026-10-29', 97)], [])!
        expect(pace.weight!.expected).toBeCloseTo(98, 1)
        expect(pace.weight!.gap).toBeCloseTo(-1, 1)
        expect(pace.weight!.verdict).toBe('slightly-ahead')
    })

    it('reads a body exactly on the line as on track, not behind by the trend lag', () => {
        const p = phase({ weeklyRate: -1 }, { startWeightKg: 100 })
        // Daily weigh-ins exactly on a 1 kg/week line for five weeks.
        const logs: WeightLog[] = Array.from({ length: 36 }, (_, i) => ({
            _id: `d${i}`,
            date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10),
            weight: 100 - i / 7,
            createdAt: '',
            updatedAt: '',
        }))
        const points = trendSeries(logs)
        const last = points[points.length - 1]
        // The trend itself runs ~0.8 kg above the line by now…
        expect(last.trend - last.weight).toBeGreaterThan(0.7)
        // …and that is not being behind.
        const pace = planPace(p, points, [])!
        expect(pace.weight!.gap).toBeCloseTo(0, 5)
        expect(pace.weight!.verdict).toBe('on-track')
    })

    it('takes the start weight from the trend near the start when the plan has none', () => {
        const p = phase({ weeklyRate: -0.5 })
        const pace = planPace(p, [w('2026-09-28', 101), w('2026-10-29', 100)], [])!
        expect(pace.weight!.line.startValue).toBe(101)
        expect(pace.weight!.verdict).toBe('slightly-behind')
    })

    it('has no weight check when nothing places the start', () => {
        const p = phase({ weeklyRate: -0.5 })
        expect(planPace(p, [w('2026-10-29', 100)], [])!.weight).toBeNull()
    })

    it('ignores readings from before the plan began', () => {
        const p = phase({ weeklyRate: -0.5 }, { startWeightKg: 100 })
        expect(planPace(p, [w('2026-09-25', 100)], [])!.weight).toBeNull()
    })

    it('checks body fat only against a stated target, on the reading date', () => {
        const goal = { startBodyFatPct: 30, targetBodyFatPct: 24, targetDate: '2026-12-24' }
        const p = phase({}, goal)
        // 12 weeks for 6 points → 0.5/wk. Six weeks in the line says 27.
        const pace = planPace(p, [], [f('2026-11-12', 27.2)])!
        expect(pace.bodyFat!.expected).toBeCloseTo(27)
        expect(pace.bodyFat!.verdict).toBe('on-track')
        expect(planPace(phase({}, { startBodyFatPct: 30 }), [], [f('2026-11-12', 27)])!.bodyFat).toBeNull()
    })
})
