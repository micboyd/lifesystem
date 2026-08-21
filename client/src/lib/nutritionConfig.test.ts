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
import { reviewNutrition, adherence } from './nutritionAdjustment'
import { retargetCalories } from './nutritionTargets'
import { weightTrend } from './nutritionTrend'
import { trendSeries } from './weightTrend'
import type {
    AdaptiveSettings,
    EntryStatus,
    MacroPolicy,
    MealPlanEntry,
    NutritionPhase,
    PhaseGoal,
    WeightLog,
} from '../types'

/**
 * The engine must know nothing about any particular person.
 *
 * These tests are the proof: the same functions are driven through four
 * completely different configurations — a recomposition, a stricter
 * recomposition, a lean bulk and a maintenance band — and produce different,
 * correct answers purely from their inputs.
 */

const ASOF = '2026-11-01'
const plus = (d: string, n: number) =>
    new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

function phase(over: Partial<NutritionPhase> = {}): NutritionPhase {
    return {
        _id: 'p', name: 'Phase', startDate: '2026-08-01', endDate: '2027-05-31',
        kind: 'cut', targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        createdAt: '', updatedAt: '', ...over,
    } as NutritionPhase
}

function entry(date: string, kcal: number, p: number, status: EntryStatus = 'eaten'): MealPlanEntry {
    return { _id: date, date, slot: 'dinner', adhoc: { name: 'd', macros: { calories: kcal, protein: p, carbs: 0, fat: 0 } }, servings: 1, status, order: 0, createdAt: '', updatedAt: '' } as MealPlanEntry
}

/** `days` days of intake at the phase's own calorie target. */
function loggedAt(kcal: number, protein: number, days = 21): MealPlanEntry[] {
    return Array.from({ length: days }, (_, i) => entry(plus(ASOF, -(days - 1 - i)), kcal, protein))
}

function weights(perWeek: number, endKg = 100): WeightLog[] {
    return Array.from({ length: 28 }, (_, i) => {
        const back = 27 - i
        return { _id: String(i), date: plus(ASOF, -back), weight: endKg - (perWeek * back) / 7, createdAt: '', updatedAt: '' }
    })
}

/** Run the engine over one configuration and one observed rate. */
function review(p: NutritionPhase, perWeek: number, entries?: MealPlanEntry[]) {
    const logs = weights(perWeek)
    return reviewNutrition({
        phase: p,
        entries: entries ?? loggedAt(p.targets.calories!, p.targets.protein ?? 0),
        phases: [p], settingsGoals: null,
        trend: weightTrend(logs, ASOF), weightPoints: trendSeries(logs), asOf: ASOF,
    })
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

// ── The same engine, four configurations ─────────────────────────────────────

/** Recomp A — the original goal. */
const RECOMP_A = phase({
    name: 'Recomp to 20%', kind: 'cut', goalMode: 'recomposition',
    targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
    goal: {
        startWeightKg: 103, targetWeightKg: 95, targetDate: '2027-05-31',
        targetWeeklyRateKg: -0.2, acceptableWeeklyRateKg: { min: -0.3, max: -0.15 },
        proteinFloorG: 210,
    },
    adaptive: { enabled: true },
})

/** Recomp B — leaner, faster, different macros entirely. */
const RECOMP_B = phase({
    name: 'Recomp to 16%', kind: 'cut', goalMode: 'recomposition',
    targets: { calories: 2600, protein: 190, carbs: 250, fat: 85 },
    goal: {
        startWeightKg: 103, targetWeightKg: 92, targetDate: '2027-12-31',
        targetWeeklyRateKg: -0.4, acceptableWeeklyRateKg: { min: -0.5, max: -0.3 },
        proteinFloorG: 190,
    },
    adaptive: { enabled: true },
})

/** A completely different user: a lean bulk. */
const LEAN_GAIN = phase({
    name: 'Lean Gain', kind: 'gain', goalMode: 'weight-gain',
    targets: { calories: 2600, protein: 150, carbs: 340, fat: 70 },
    goal: {
        startWeightKg: 70, targetWeightKg: 76, targetDate: '2027-08-01',
        targetWeeklyRateKg: 0.15, acceptableWeeklyRateKg: { min: 0.1, max: 0.2 },
    },
    adaptive: { enabled: true },
})

/** And a maintenance band. */
const MAINTAIN = phase({
    name: 'Hold', kind: 'maintain', goalMode: 'maintenance',
    targets: { calories: 2400, protein: 160, carbs: 260, fat: 80 },
    goal: { targetWeightRangeKg: { min: 68, max: 70 }, targetWeeklyRateKg: 0 },
    adaptive: { enabled: true },
})

describe('the same engine, different configurations', () => {
    it('holds each configuration when it is running to its own plan', () => {
        expect(review(RECOMP_A, -0.2).action).toBe('hold')
        expect(review(RECOMP_B, -0.4).action).toBe('hold')
        expect(review(LEAN_GAIN, 0.15).action).toBe('hold')
        expect(review(MAINTAIN, 0).action).toBe('hold')
    })

    it('gives different answers to the same observed rate', () => {
        // −0.45 kg/week is clearly too fast for Recomp A and well inside
        // Recomp B's band. Same rate, same engine, opposite conclusions.
        expect(review(RECOMP_A, -0.45).action).toBe('increase')
        expect(review(RECOMP_B, -0.45).action).toBe('hold')
    })

    it('adds food to a bulk that is not gaining', () => {
        const r = review(LEAN_GAIN, -0.05)
        expect(r.action).toBe('increase')
        expect(r.deltaKcal).toBeGreaterThan(0)
    })

    it('eases a bulk that is gaining far too fast', () => {
        const r = review(LEAN_GAIN, 0.7)
        expect(r.action).toBe('reduce')
        expect(r.deltaKcal).toBeLessThan(0)
    })

    it('never tells a bulk its weight is coming off', () => {
        expect(review(LEAN_GAIN, 0.7).reason).not.toMatch(/coming off/)
        expect(review(LEAN_GAIN, 0.7).reason).not.toMatch(/slowed/)
    })

    it('pulls a maintenance phase back toward its band from either side', () => {
        expect(review(MAINTAIN, 0.4).action).toBe('reduce')
        expect(review(MAINTAIN, -0.4).action).toBe('increase')
    })

    it('assumes nobody’s protein figure', () => {
        expect(review(RECOMP_A, -0.02).suggestedTargets?.protein).toBe(210)
        expect(review(RECOMP_B, -0.05).suggestedTargets?.protein).toBe(190)
        expect(review(LEAN_GAIN, 0.7).suggestedTargets?.protein).toBe(150)
    })

    it('adjusts each from its own prescription', () => {
        expect(review(RECOMP_A, -0.02).currentCalories).toBe(2950)
        expect(review(RECOMP_B, -0.05).currentCalories).toBe(2600)
        expect(review(LEAN_GAIN, 0.7).currentCalories).toBe(2600)
    })
})

describe('configurable adjustment limits', () => {
    /** Recomp A with a different ceiling on a single change. */
    const withCap = (maxAdjustmentKcal: number) =>
        phase({ ...RECOMP_A, adaptive: { enabled: true, maxAdjustmentKcal } } as Partial<NutritionPhase>)

    it('never exceeds a tightened cap', () => {
        const r = review(withCap(75), -0.02)
        expect(r.action).toBe('reduce')
        expect(Math.abs(r.deltaKcal)).toBeLessThanOrEqual(75)
    })

    it('allows a larger change when the cap is raised', () => {
        // The same stall that the 150 cap clips is allowed further at 200.
        const capped = review(withCap(150), 0.05)
        const roomier = review(withCap(200), 0.05)
        expect(Math.abs(capped.deltaKcal)).toBe(150)
        expect(Math.abs(roomier.deltaKcal)).toBeGreaterThan(150)
        expect(Math.abs(roomier.deltaKcal)).toBeLessThanOrEqual(200)
    })

    it('honours a shortened review window', () => {
        const quick = phase({
            ...RECOMP_A,
            adaptive: { enabled: true, reviewWindowDays: 14, preferredDataDays: 14 },
        } as Partial<NutritionPhase>)
        // Fourteen logged days is too thin by default, and enough for this phase.
        const entries = loggedAt(2950, 211, 14)
        expect(review(RECOMP_A, -0.02, entries).holdReason).toBe('too-soon')
        expect(review(quick, -0.02, entries).action).toBe('reduce')
    })

    it('honours a stricter coverage requirement', () => {
        // A 28-day window logged for 21 of its days: 75% coverage. Enough
        // logged days to be reviewed, but short of a strict coverage bar.
        const entries = loggedAt(2950, 211, 21)
        const lenient = phase({
            ...RECOMP_A,
            adaptive: { enabled: true, reviewWindowDays: 28, minCoverage: 0.7 },
        } as Partial<NutritionPhase>)
        const strict = phase({
            ...RECOMP_A,
            adaptive: { enabled: true, reviewWindowDays: 28, minCoverage: 0.9 },
        } as Partial<NutritionPhase>)
        expect(review(lenient, -0.02, entries).action).toBe('reduce')
        expect(review(strict, -0.02, entries).holdReason).toBe('poor-adherence')
    })

    it('uses the configured adherence tolerance', () => {
        const stats = adherence(loggedAt(2950, 211), [RECOMP_A], null, ASOF, 21, {
            ...DEFAULT_ADAPTIVE_SETTINGS,
            calorieAdherenceToleranceKcal: 10,
        })
        expect(stats.toleranceKcal).toBe(2950 * 0.05)
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

describe('optional goal dimensions', () => {
    it('works from a weight target alone', () => {
        const p = phase({ goalMode: 'weight-loss', goal: { targetWeightKg: 80, targetWeeklyRateKg: -0.3 }, adaptive: { enabled: true } })
        expect(review(p, -0.3).action).toBe('hold')
        // Stalled against a −0.30 intent, with the derived band and margin cleared.
        expect(review(p, 0.05).action).toBe('reduce')
    })

    it('works from a weight range alone', () => {
        const c = resolveConfig(phase({ kind: 'maintain', goal: { targetWeightRangeKg: { min: 78, max: 81 } } }))!
        expect(c.goalMode).toBe('maintenance')
        expect(c.rate.direction).toBe('hold')
    })

    it('holds when a goal names no rate to judge against', () => {
        const p = phase({ goal: { targetBodyFatPct: 16, adaptive: true }, weeklyRate: undefined })
        expect(review(p, -0.2).holdReason).toBe('no-target')
    })

    it('leaves an old phase with no goal completely alone', () => {
        const old = phase({ goal: undefined, weeklyRate: -0.5 })
        const r = review(old, -0.1)
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('not-adaptive')
    })
})
