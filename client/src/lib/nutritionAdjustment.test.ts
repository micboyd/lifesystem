import { describe, it, expect } from 'vitest'
import {
    adherence,
    adherenceIsUsable,
    reviewNutrition,
    stepFrom,
    MAX_STEP_KCAL,
    MIN_STEP_KCAL,
    MIN_REVIEW_DAYS,
    REVIEW_WINDOW_DAYS,
    type ReviewInput,
} from './nutritionAdjustment'
import { weightTrend } from './nutritionTrend'
import { trendSeries } from './weightTrend'
import { caloriesOf } from './nutritionTargets'
import type { EntryStatus, MealPlanEntry, NutritionPhase, PhaseGoal, WeightLog } from '../types'

const GOAL: PhaseGoal = {
    style: 'recomp',
    startWeightKg: 103,
    targetDate: '2027-05-31',
    targetWeightKg: 95,
    targetWeightRangeKg: { min: 94, max: 96 },
    targetWeeklyRateKg: -0.2,
    acceptableWeeklyRateKg: { min: -0.3, max: -0.15 },
    proteinFloorG: 210,
    adaptive: true,
}

const ASOF = '2026-11-01'

function phase(over: Partial<NutritionPhase> = {}): NutritionPhase {
    return {
        _id: 'p1',
        name: 'Recomp to 20%',
        startDate: '2026-08-21',
        endDate: '2027-05-31',
        kind: 'cut',
        targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        weeklyRate: -0.2,
        goal: GOAL,
        createdAt: '',
        updatedAt: '',
        ...over,
    } as NutritionPhase
}

function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

function entry(
    date: string,
    calories: number,
    protein: number,
    status: EntryStatus = 'eaten'
): MealPlanEntry {
    return {
        _id: `${date}-${calories}`,
        date,
        slot: 'dinner',
        adhoc: { name: 'day', macros: { calories, protein, carbs: 0, fat: 0 } },
        servings: 1,
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as MealPlanEntry
}

/** One entry per day for `days` days ending at ASOF. */
function eaten(days: number, calories = 2950, protein = 211, span = days): MealPlanEntry[] {
    return Array.from({ length: days }, (_, i) => entry(plus(ASOF, -(span - 1 - i)), calories, protein))
}

/** Daily weigh-ins ending at ASOF, moving at `perWeek`. */
function weights(perWeek: number, endKg = 101, days = 28): WeightLog[] {
    return Array.from({ length: days }, (_, i) => {
        const back = days - 1 - i
        return {
            _id: String(i),
            date: plus(ASOF, -back),
            weight: endKg - (perWeek * back) / 7,
            createdAt: '',
            updatedAt: '',
        }
    })
}

function review(over: Partial<ReviewInput> = {}) {
    const logs = over.weightPoints ? [] : weights(-0.2)
    const p = over.phase === undefined ? phase() : over.phase
    return reviewNutrition({
        phase: p,
        entries: eaten(21),
        phases: p ? [p] : [],
        settingsGoals: null,
        trend: weightTrend(logs, ASOF),
        weightPoints: trendSeries(logs),
        asOf: ASOF,
        ...over,
    })
}

describe('stepFrom', () => {
    it('ignores a gap too small to be worth changing', () => {
        expect(stepFrom(40)).toBe(0)
        expect(stepFrom(-99)).toBe(0)
    })

    it('caps a single change at 150 kcal however large the gap', () => {
        expect(stepFrom(-800)).toBe(-MAX_STEP_KCAL)
        expect(stepFrom(2000)).toBe(MAX_STEP_KCAL)
    })

    it('rounds to a figure a person would choose', () => {
        expect(stepFrom(-131)).toBe(-125)
        expect(stepFrom(112)).toBe(100)
    })

    it('keeps the sign of the gap', () => {
        expect(stepFrom(-MIN_STEP_KCAL)).toBeLessThan(0)
        expect(stepFrom(MIN_STEP_KCAL)).toBeGreaterThan(0)
    })
})

describe('adherence', () => {
    it('counts only days with a plausible whole day logged', () => {
        const entries = [...eaten(10), entry(plus(ASOF, -12), 300, 20)]
        const a = adherence(entries, [phase()], null, ASOF)
        expect(a.loggedDays).toBe(10)
    })

    it('ignores planned and skipped food', () => {
        const entries = [
            ...eaten(5),
            entry(plus(ASOF, -6), 2950, 210, 'planned'),
            entry(plus(ASOF, -7), 2950, 210, 'skipped'),
        ]
        expect(adherence(entries, [phase()], null, ASOF).loggedDays).toBe(5)
    })

    it('reports coverage as a fraction of the window', () => {
        const a = adherence(eaten(9, 2950, 211, 21), [phase()], null, ASOF)
        expect(a.windowDays).toBe(REVIEW_WINDOW_DAYS)
        expect(a.loggedDays).toBe(9)
        expect(a.coverage).toBeCloseTo(9 / 21, 5)
    })

    it('averages intake, target and the gap between them', () => {
        const a = adherence(eaten(21, 2900, 205), [phase()], null, ASOF)
        expect(a.avgIntakeKcal).toBeCloseTo(2900, 5)
        expect(a.avgTargetKcal).toBeCloseTo(2950, 5)
        expect(a.avgDiffKcal).toBeCloseTo(-50, 5)
        expect(a.avgProteinG).toBeCloseTo(205, 5)
    })

    it('counts days landing within tolerance of the target', () => {
        const a = adherence(eaten(21, 2900), [phase()], null, ASOF)
        expect(a.daysWithinTolerance).toBe(21)
        const far = adherence(eaten(21, 3400), [phase()], null, ASOF)
        expect(far.daysWithinTolerance).toBe(0)
    })

    it('counts protein hits against the day’s protein target', () => {
        const hit = adherence(eaten(21, 2950, 215), [phase()], null, ASOF)
        expect(hit.proteinTargetDays).toBe(21)
        expect(hit.proteinHitDays).toBe(21)
        const miss = adherence(eaten(21, 2950, 180), [phase()], null, ASOF)
        expect(miss.proteinHitDays).toBe(0)
    })

    it('measures each day against the target that was live on it', () => {
        const revised = phase({
            adjustments: [
                { effectiveFrom: plus(ASOF, -9), targets: { calories: 2825, protein: 210 }, source: 'adaptive' },
            ],
        })
        // Eating 2,825 throughout: on target since the change, under it before.
        const a = adherence(eaten(21, 2825, 211), [revised], null, ASOF)
        expect(a.avgTargetKcal).toBeGreaterThan(2825)
        expect(a.avgTargetKcal).toBeLessThan(2950)
        expect(a.daysWithinTolerance).toBe(21)
    })

    it('leaves averages null rather than zero with nothing logged', () => {
        const a = adherence([], [phase()], null, ASOF)
        expect(a.loggedDays).toBe(0)
        expect(a.avgIntakeKcal).toBeNull()
        expect(a.avgDiffKcal).toBeNull()
        expect(a.avgProteinG).toBeNull()
    })

    it('rejects a thin or drifting window', () => {
        expect(adherenceIsUsable(adherence(eaten(9, 2950, 211, 21), [phase()], null, ASOF))).toBe(false)
        expect(adherenceIsUsable(adherence(eaten(21, 3400), [phase()], null, ASOF))).toBe(false)
        expect(adherenceIsUsable(adherence(eaten(21), [phase()], null, ASOF))).toBe(true)
    })
})

describe('reviewNutrition holds', () => {
    it('holds without a phase', () => {
        const r = review({ phase: null, phases: [] })
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('no-phase')
    })

    it('holds when the phase is not adaptive', () => {
        const p = phase({ goal: { ...GOAL, adaptive: false } })
        const r = review({ phase: p, phases: [p] })
        expect(r.holdReason).toBe('not-adaptive')
    })

    it('holds when the phase has no calorie target', () => {
        const p = phase({ targets: { protein: 210 } })
        const r = review({ phase: p, phases: [p] })
        expect(r.holdReason).toBe('no-target')
    })

    it('holds when too few days are logged, naming the shortfall', () => {
        const r = review({ entries: eaten(9, 2950, 211, 21) })
        expect(r.holdReason).toBe('too-soon')
        expect(r.reason).toContain('9 of the last 21 days')
        expect(r.deltaKcal).toBe(0)
        expect(r.suggestedCalories).toBe(2950)
    })

    it('holds when intake is nowhere near the target, blaming the intake not the target', () => {
        // A stalled scale, but eating 400 kcal over target throughout.
        const r = review({ entries: eaten(21, 3350, 211), trend: weightTrend(weights(0), ASOF), weightPoints: trendSeries(weights(0)) })
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('off-target-intake')
        expect(r.reason).toContain('above target')
    })

    it('holds when there is no usable weight trend', () => {
        const r = review({ trend: 'no-weights', weightPoints: [] })
        expect(r.holdReason).toBe('no-trend')
    })

    it('holds when the rate is on target', () => {
        const r = review()
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('on-target')
        expect(r.headline).toContain('2,950')
        expect(r.deltaKcal).toBe(0)
    })

    it('holds when the rate is only just outside the band', () => {
        // −0.12 kg/week: outside −0.30…−0.15, but inside the noise margin.
        const logs = weights(-0.12)
        const r = review({ trend: weightTrend(logs, ASOF), weightPoints: trendSeries(logs) })
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('on-target')
    })
})

describe('reviewNutrition changes', () => {
    /** A review with intake on target and the scale moving at `perWeek`. */
    function at(perWeek: number, over: Partial<ReviewInput> = {}) {
        const logs = weights(perWeek)
        return review({ trend: weightTrend(logs, ASOF), weightPoints: trendSeries(logs), ...over })
    }

    it('proposes a modest reduction when the scale has stalled', () => {
        const r = at(-0.02)
        expect(r.action).toBe('reduce')
        expect(r.deltaKcal).toBeLessThan(0)
        expect(Math.abs(r.deltaKcal)).toBeGreaterThanOrEqual(MIN_STEP_KCAL)
        expect(Math.abs(r.deltaKcal)).toBeLessThanOrEqual(MAX_STEP_KCAL)
        expect(r.suggestedCalories).toBe(2950 + r.deltaKcal)
    })

    it('proposes an increase when weight is coming off too fast', () => {
        const r = at(-0.55)
        expect(r.action).toBe('increase')
        expect(r.deltaKcal).toBeGreaterThan(0)
        expect(r.deltaKcal).toBeLessThanOrEqual(MAX_STEP_KCAL)
        expect(r.reason).toMatch(/muscle/)
    })

    it('never moves more than 150 kcal at one review, however extreme the gap', () => {
        expect(Math.abs(at(0.4).deltaKcal)).toBeLessThanOrEqual(MAX_STEP_KCAL)
        expect(Math.abs(at(-1.5).deltaKcal)).toBeLessThanOrEqual(MAX_STEP_KCAL)
    })

    it('holds protein at the floor when it lowers calories', () => {
        const r = at(-0.02)
        expect(r.suggestedTargets?.protein).toBe(210)
    })

    it('holds protein at the floor even on a phase whose target had drifted below it', () => {
        const p = phase({ targets: { calories: 2950, protein: 150, carbs: 380, fat: 90 } })
        const logs = weights(-0.02)
        const r = review({
            phase: p,
            phases: [p],
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
            entries: eaten(21, 2950, 211),
        })
        expect(r.suggestedTargets?.protein).toBe(210)
    })

    it('takes the change out of carbohydrate and leaves fat alone', () => {
        const r = at(-0.02)
        expect(r.suggestedTargets?.fat).toBe(90)
        expect(r.suggestedTargets!.carbs!).toBeLessThan(325)
        // The protein and fat calories are untouched, so carbs carry all of it —
        // to within the half-gram that whole-gram rounding can swallow.
        const carbDelta = (r.suggestedTargets!.carbs! - 325) * 4
        expect(Math.abs(carbDelta - r.deltaKcal)).toBeLessThanOrEqual(2)
    })

    it('puts an increase into carbohydrate too', () => {
        const r = at(-0.55)
        expect(r.suggestedTargets?.protein).toBe(210)
        expect(r.suggestedTargets?.fat).toBe(90)
        expect(r.suggestedTargets!.carbs!).toBeGreaterThan(325)
    })

    it('produces macros that reconcile with the suggested calories', () => {
        for (const rate of [-0.02, -0.55, 0.1]) {
            const r = at(rate)
            if (r.action === 'hold') continue
            expect(Math.abs(caloriesOf(r.suggestedTargets!) - r.suggestedCalories!)).toBeLessThanOrEqual(3)
        }
    })

    it('adjusts from the current target, not the phase’s opening one', () => {
        const revised = phase({
            adjustments: [
                {
                    effectiveFrom: plus(ASOF, -30),
                    targets: { calories: 2825, protein: 210, carbs: 294, fat: 90 },
                    source: 'adaptive',
                },
            ],
        })
        const logs = weights(-0.02)
        const r = review({
            phase: revised,
            phases: [revised],
            entries: eaten(21, 2825, 211),
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
        })
        expect(r.currentCalories).toBe(2825)
        expect(r.suggestedCalories).toBe(2825 + r.deltaKcal)
    })

    it('dates the change to the day it was reviewed', () => {
        expect(at(-0.02).effectiveFrom).toBe(ASOF)
    })

    it('reports high confidence on a full, well-logged window', () => {
        expect(at(-0.02).confidence).toBe('high')
    })

    it('reports the maintenance and deficits behind the decision', () => {
        const r = at(-0.02)
        expect(typeof r.maintenance).toBe('object')
        expect(r.desiredDeficitKcal).toBeCloseTo(-220, 0)
        expect(r.observedDeficitKcal).toBeCloseTo(-22, 0)
    })
})

describe('the plateau trap', () => {
    it('does not cut calories on a plateau it cannot see the intake behind', () => {
        // A dead-flat month, but only half the days logged. The naive read is
        // "eat less"; the right answer is "log properly first".
        const logs = weights(0)
        const r = review({
            entries: eaten(10, 2950, 211, 21),
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
        })
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('too-soon')
    })

    it('does cut once the same plateau is properly logged', () => {
        const logs = weights(0)
        const r = review({
            entries: eaten(MIN_REVIEW_DAYS),
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
        })
        expect(r.action).toBe('reduce')
    })
})
