import { describe, it, expect } from 'vitest'
import {
    resolveConfig,
    resolveGoalMode,
    resolveRate,
    centreRate,
    directionOf,
    withinRateBand,
    calorieTolerance,
    DEFAULT_ADAPTIVE_SETTINGS,
    DEFAULT_MACRO_POLICY,
    DEFAULT_BAND_WIDTH_KG,
} from './nutritionConfig'
import { retargetCalories } from './nutritionTargets'
import type {
    AdaptiveSettings,
    MacroPolicy,
    NutritionPhase,
    PhaseGoal,
} from '../types'

/**
 * Phase configuration: defaults, normalisation and macro policy. Nothing here
 * may assume a particular person — every figure comes from the phase.
 */

function phase(over: Partial<NutritionPhase> = {}): NutritionPhase {
    return {
        _id: 'p', name: 'Phase', startDate: '2026-08-01', endDate: '2027-05-31',
        kind: 'cut', targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        createdAt: '', updatedAt: '', ...over,
    } as NutritionPhase
}

// ── Defaults and normalisation ───────────────────────────────────────────────

describe('resolveConfig', () => {
    it('is null without a phase', () => {
        expect(resolveConfig(null)).toBeNull()
    })

    it('fills every default for a phase that configures nothing', () => {
        const c = resolveConfig(phase())!
        expect(c.adaptive).toEqual(DEFAULT_ADAPTIVE_SETTINGS)
        expect(c.macroPolicy).toEqual(DEFAULT_MACRO_POLICY)
        expect(c.adaptive.enabled).toBe(false)
    })

    it('lets a phase override one setting without restating the rest', () => {
        const adaptive: AdaptiveSettings = { enabled: true, maxAdjustmentKcal: 75 }
        const c = resolveConfig(phase({ adaptive }))!
        expect(c.adaptive.maxAdjustmentKcal).toBe(75)
        expect(c.adaptive.reviewWindowDays).toBe(DEFAULT_ADAPTIVE_SETTINGS.reviewWindowDays)
        expect(c.adaptive.minCoverage).toBe(DEFAULT_ADAPTIVE_SETTINGS.minCoverage)
    })

    it('honours the legacy adaptive boolean on the goal', () => {
        expect(resolveConfig(phase({ goal: { adaptive: true } }))!.adaptive.enabled).toBe(true)
    })

    it('prefers the settings object over the legacy boolean', () => {
        const c = resolveConfig(phase({ goal: { adaptive: true }, adaptive: { enabled: false } }))!
        expect(c.adaptive.enabled).toBe(false)
    })

    it('reads the prescription from the latest dated revision', () => {
        const c = resolveConfig(
            phase({
                goal: { adaptive: true },
                adjustments: [
                    { effectiveFrom: '2026-10-01', targets: { calories: 2825, protein: 210 }, source: 'adaptive' },
                ],
            })
        )!
        expect(c.prescription.calories).toBe(2825)
    })

    it('ignores a goal-only revision when resolving the prescription', () => {
        const c = resolveConfig(
            phase({
                goal: { adaptive: true },
                adjustments: [
                    { effectiveFrom: '2026-10-01', targets: { calories: 2825 }, source: 'adaptive' },
                    { effectiveFrom: '2026-10-20', previousGoal: {}, source: 'manual' },
                ],
            })
        )!
        expect(c.prescription.calories).toBe(2825)
    })
})

describe('resolveGoalMode', () => {
    it('takes the stated mode', () => {
        expect(resolveGoalMode(phase({ goalMode: 'recomposition' }))).toBe('recomposition')
    })

    it('infers recomposition from the legacy style flag', () => {
        expect(resolveGoalMode(phase({ goal: { style: 'recomp' } }))).toBe('recomposition')
    })

    it('falls back to the phase kind', () => {
        expect(resolveGoalMode(phase({ kind: 'cut' }))).toBe('weight-loss')
        expect(resolveGoalMode(phase({ kind: 'gain' }))).toBe('weight-gain')
        expect(resolveGoalMode(phase({ kind: 'maintain' }))).toBe('maintenance')
    })
})

describe('resolveRate', () => {
    it('builds a band around a stated rate when none is given', () => {
        const r = resolveRate(phase({ weeklyRate: -0.2 }), 'weight-loss')
        expect(r.acceptable).toEqual({ min: -0.2 - DEFAULT_BAND_WIDTH_KG, max: -0.2 + DEFAULT_BAND_WIDTH_KG })
    })

    it('prefers the goal’s own band', () => {
        const goal: PhaseGoal = { targetWeeklyRateKg: -0.2, acceptableWeeklyRateKg: { min: -0.3, max: -0.15 } }
        expect(resolveRate(phase({ goal }), 'recomposition').acceptable).toEqual({ min: -0.3, max: -0.15 })
    })

    it('normalises a band written the wrong way round', () => {
        const goal: PhaseGoal = { acceptableWeeklyRateKg: { min: -0.15, max: -0.3 } }
        expect(resolveRate(phase({ goal }), 'weight-loss').acceptable).toEqual({ min: -0.3, max: -0.15 })
    })

    it('gives a maintenance phase a rate of zero without being told', () => {
        const r = resolveRate(phase({ kind: 'maintain' }), 'maintenance')
        expect(r.targetKgPerWeek).toBe(0)
        expect(r.direction).toBe('hold')
    })

    it('derives direction from the sign of the rate', () => {
        expect(directionOf(-0.2, 'weight-loss')).toBe('down')
        expect(directionOf(0.25, 'weight-gain')).toBe('up')
        expect(directionOf(0, 'maintenance')).toBe('hold')
        expect(directionOf(null, 'weight-gain')).toBe('up')
    })

    it('reads the band and centre back', () => {
        const r = resolveRate(phase({ goal: { acceptableWeeklyRateKg: { min: -0.3, max: -0.15 } } }), 'weight-loss')
        expect(centreRate(r)).toBeCloseTo(-0.225, 5)
        expect(withinRateBand(-0.2, r)).toBe(true)
        expect(withinRateBand(-0.5, r)).toBe(false)
    })
})

describe('calorieTolerance', () => {
    it('uses the configured figure on ordinary targets', () => {
        expect(calorieTolerance(2000, DEFAULT_ADAPTIVE_SETTINGS)).toBe(150)
    })

    it('scales up rather than being absurdly tight on a large target', () => {
        expect(calorieTolerance(4000, DEFAULT_ADAPTIVE_SETTINGS)).toBe(200)
    })

    it('honours a user’s own tolerance', () => {
        const strict = { ...DEFAULT_ADAPTIVE_SETTINGS, calorieAdherenceToleranceKcal: 50 }
        expect(calorieTolerance(2000, strict)).toBe(100)
    })
})

describe('configurable macro policy', () => {
    const current = { calories: 2950, protein: 210, carbs: 325, fat: 90 }

    it('defaults to carbohydrate absorbing the change', () => {
        const next = retargetCalories(current, 2825, 210)
        expect(next.protein).toBe(210)
        expect(next.fat).toBe(90)
        expect(next.carbs).toBeLessThan(325)
    })

    it('lets fat absorb it instead', () => {
        const policy: Required<MacroPolicy> = { protein: 'fixed', fat: 'remainder', carbs: 'fixed' }
        const next = retargetCalories(current, 2825, 210, policy)
        expect(next.protein).toBe(210)
        expect(next.carbs).toBe(325)
        expect(next.fat).toBeLessThan(90)
    })

    it('lets protein absorb it when that is what was asked for', () => {
        const policy: Required<MacroPolicy> = { protein: 'remainder', fat: 'fixed', carbs: 'fixed' }
        const next = retargetCalories(current, 3150, undefined, policy)
        expect(next.carbs).toBe(325)
        expect(next.fat).toBe(90)
        expect(next.protein).toBeGreaterThan(210)
    })

    it('still respects a protein floor when protein is the remainder', () => {
        const policy: Required<MacroPolicy> = { protein: 'remainder', fat: 'fixed', carbs: 'fixed' }
        expect(retargetCalories(current, 2400, 210, policy).protein).toBe(210)
    })

    it('falls back to carbohydrate when no macro is named the remainder', () => {
        const policy: Required<MacroPolicy> = { protein: 'fixed', fat: 'fixed', carbs: 'fixed' }
        const next = retargetCalories(current, 2825, 210, policy)
        expect(next.carbs).toBeLessThan(325)
    })

    it('scales an adjustable macro with calories', () => {
        const policy: Required<MacroPolicy> = { protein: 'adjustable', fat: 'fixed', carbs: 'remainder' }
        const next = retargetCalories(current, 1475, 0, policy)
        expect(next.protein).toBeCloseTo(105, 0)
    })
})
