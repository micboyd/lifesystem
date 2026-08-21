import { describe, it, expect } from 'vitest'
import {
    goalProgress,
    withinBand,
    rateWithinBand,
    dailyDeficitFor,
    GOAL_STATUS_LABELS,
} from './nutritionGoal'
import { weightTrend } from './nutritionTrend'
import type { NutritionPhase, PhaseGoal, WeightLog } from '../types'

const GOAL: PhaseGoal = {
    style: 'recomp',
    startWeightKg: 103,
    targetDate: '2027-05-31',
    targetWeightKg: 95,
    targetWeightRangeKg: { min: 94, max: 96 },
    targetBodyFatPct: 20,
    targetBodyFatRangePct: { min: 19.5, max: 21 },
    targetWeeklyRateKg: -0.2,
    acceptableWeeklyRateKg: { min: -0.3, max: -0.15 },
    proteinFloorG: 210,
    adaptive: true,
}

function phase(goal: PhaseGoal | null = GOAL): NutritionPhase {
    return {
        _id: 'p1',
        name: 'Recomp to 20%',
        startDate: '2026-08-21',
        endDate: '2027-05-31',
        kind: 'cut',
        targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        weeklyRate: -0.2,
        goal: goal ?? undefined,
        createdAt: '',
        updatedAt: '',
    } as NutritionPhase
}

function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Daily weigh-ins ending at `end`, moving at `perWeek` and finishing near `endKg`. */
function logsEnding(end: string, endKg: number, perWeek: number, days = 28): WeightLog[] {
    return Array.from({ length: days }, (_, i) => {
        const back = days - 1 - i
        return {
            _id: String(i),
            date: plus(end, -back),
            weight: endKg - (perWeek * back) / 7,
            createdAt: '',
            updatedAt: '',
        }
    })
}

/** The goal read against a trend ending at `asOf`. */
function progress(asOf: string, endKg: number, perWeek: number, goal = GOAL) {
    const logs = logsEnding(asOf, endKg, perWeek)
    return goalProgress(phase(goal), weightTrend(logs, asOf), asOf)
}

describe('goalProgress basics', () => {
    it('is null without a goal on the phase', () => {
        const logs = logsEnding('2026-11-01', 101, -0.2)
        expect(goalProgress(phase(null), weightTrend(logs, '2026-11-01'), '2026-11-01')).toBeNull()
    })

    it('is null without a phase at all', () => {
        const logs = logsEnding('2026-11-01', 101, -0.2)
        expect(goalProgress(null, weightTrend(logs, '2026-11-01'), '2026-11-01')).toBeNull()
    })

    it('reports insufficient data when there is no weight to read', () => {
        expect(goalProgress(phase(), 'no-weights', '2026-11-01')).toBeNull()
    })

    it('measures total change from the goal’s starting weight', () => {
        const p = progress('2026-11-01', 101, -0.2)!
        expect(p.startKg).toBe(103)
        expect(p.totalChangeKg).toBeCloseTo(p.currentKg - 103, 6)
        expect(p.totalChangeKg!).toBeLessThan(0)
    })

    it('counts the weeks left to the target date', () => {
        const p = progress('2027-05-03', 96, -0.2)!
        expect(p.targetDate).toBe('2027-05-31')
        expect(p.weeksRemaining).toBeCloseTo(4, 5)
    })

    it('falls back to the phase end when the goal names no target date', () => {
        const p = progress('2026-11-01', 101, -0.2, { ...GOAL, targetDate: undefined })!
        expect(p.targetDate).toBe('2027-05-31')
    })
})

describe('required rate', () => {
    it('is what is left divided by the weeks left', () => {
        // 4 weeks out at ~96 kg with 95 kg to reach.
        const p = progress('2027-05-03', 96, -0.2)!
        expect(p.remainingKg).toBeCloseTo(95 - p.currentKg, 6)
        expect(p.requiredRateKgPerWeek).toBeCloseTo(p.remainingKg! / 4, 5)
        expect(p.requiredRateKgPerWeek!).toBeLessThan(0)
    })

    it('is null once the goal date has passed', () => {
        const p = progress('2027-06-15', 96, -0.2)!
        expect(p.weeksRemaining).toBe(0)
        expect(p.requiredRateKgPerWeek).toBeNull()
    })

    it('never flips sign after the date, claiming you must gain', () => {
        const p = progress('2027-08-01', 97, -0.2)!
        expect(p.weeksRemaining).toBe(0)
        expect(p.projectedKg).toBeCloseTo(p.currentKg, 6)
    })
})

describe('projection', () => {
    it('carries the current rate forward to the target date', () => {
        const p = progress('2027-05-03', 95.8, -0.2)!
        expect(p.observedRateKgPerWeek).toBeCloseTo(-0.2, 2)
        expect(p.projectedKg).toBeCloseTo(p.currentKg - 0.8, 1)
    })

    it('has no projection without a usable rate', () => {
        // Two readings a fortnight apart: an average, but nothing to fit or smooth into a rate.
        const sparse: WeightLog[] = [
            { _id: 'a', date: '2026-10-25', weight: 102, createdAt: '', updatedAt: '' },
            { _id: 'b', date: '2026-11-01', weight: 101.8, createdAt: '', updatedAt: '' },
        ]
        const trend = weightTrend(sparse, '2026-11-01')
        if (typeof trend === 'string') throw new Error(trend)
        const p = goalProgress(
            phase(),
            { ...trend, rateKgPerWeek: null, smoothedRateKgPerWeek: null },
            '2026-11-01'
        )!
        expect(p.currentKg).toBeGreaterThan(0)
        expect(p.observedRateKgPerWeek).toBeNull()
        expect(p.projectedKg).toBeNull()
    })
})

describe('goal status', () => {
    it('calls a plan landing on the target on track', () => {
        // ~40 weeks out, 8 kg to lose, moving at the intended 0.2 kg/week.
        const p = progress('2026-08-21', 103, -0.2)!
        expect(p.status).toBe('on-track')
        expect(GOAL_STATUS_LABELS[p.status]).toBe('On track')
    })

    it('calls a weight already inside the band reached', () => {
        const p = progress('2027-04-01', 95.2, -0.05)!
        expect(p.status).toBe('reached')
    })

    it('does not punish a flat trend once the target is reached', () => {
        const p = progress('2027-04-01', 95, 0)!
        expect(p.status).toBe('reached')
    })

    it('calls a small projected miss slightly behind, not failure', () => {
        // 10 weeks out at 97.5 kg, drifting at 0.1 kg/week → lands ~96.5, 1.5 kg over.
        const p = progress('2027-03-22', 97.5, -0.1)!
        expect(p.status).toBe('slightly-behind')
    })

    it('calls a large projected miss behind', () => {
        const p = progress('2027-03-22', 99.5, -0.02)!
        expect(p.status).toBe('behind')
    })

    it('calls overshooting the target ahead of plan', () => {
        // 10 weeks out at 97 kg losing 0.5 kg/week → lands ~92, well under.
        const p = progress('2027-03-22', 97, -0.5)!
        expect(['ahead', 'slightly-ahead']).toContain(p.status)
    })

    it('calls moving away from the target what it is', () => {
        const p = progress('2027-01-01', 101, 0.3)!
        expect(p.status).toBe('wrong-way')
    })

    it('reports insufficient data rather than guessing', () => {
        const sparse: WeightLog[] = [
            { _id: 'a', date: '2026-10-25', weight: 102, createdAt: '', updatedAt: '' },
            { _id: 'b', date: '2026-10-28', weight: 102.1, createdAt: '', updatedAt: '' },
        ]
        const trend = weightTrend(sparse, '2026-10-28')
        if (typeof trend === 'string') throw new Error(trend)
        const p = goalProgress(phase(), { ...trend, rateKgPerWeek: null, smoothedRateKgPerWeek: null }, '2026-10-28')!
        expect(p.status).toBe('insufficient-data')
        expect(p.projectedKg).toBeNull()
    })
})

describe('bands', () => {
    it('accepts a weight inside the target range', () => {
        expect(withinBand(95, GOAL)).toBe(true)
        expect(withinBand(94, GOAL)).toBe(true)
        expect(withinBand(96, GOAL)).toBe(true)
        expect(withinBand(96.5, GOAL)).toBe(false)
    })

    it('falls back to a tolerance around the point target', () => {
        const noRange: PhaseGoal = { targetWeightKg: 95 }
        expect(withinBand(95.5, noRange)).toBe(true)
        expect(withinBand(97, noRange)).toBe(false)
    })

    it('accepts rates inside the acceptable band', () => {
        expect(rateWithinBand(-0.2, GOAL)).toBe(true)
        expect(rateWithinBand(-0.15, GOAL)).toBe(true)
        expect(rateWithinBand(-0.3, GOAL)).toBe(true)
        expect(rateWithinBand(-0.05, GOAL)).toBe(false)
        expect(rateWithinBand(-0.5, GOAL)).toBe(false)
    })

    it('builds a band around the desired rate when none is given', () => {
        const bare: PhaseGoal = { targetWeeklyRateKg: -0.2 }
        expect(rateWithinBand(-0.3, bare)).toBe(true)
        expect(rateWithinBand(-0.6, bare)).toBe(false)
    })
})

describe('dailyDeficitFor', () => {
    it('turns 0.2 kg/week into about 220 kcal a day', () => {
        expect(dailyDeficitFor(-0.2)).toBeCloseTo(-220, 0)
    })

    it('is signed the same way the rate is', () => {
        expect(dailyDeficitFor(0.25)).toBeGreaterThan(0)
    })
})
