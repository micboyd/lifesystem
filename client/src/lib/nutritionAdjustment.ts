import { currentPhaseTargets, entryMacros, targetsFor } from './nutrition'
import { retargetCalories, proteinFloorOf } from './nutritionTargets'
import { rateWithinBand } from './nutritionGoal'
import { usableRate, type TrendGap, type WeightTrend } from './nutritionTrend'
import {
    dailyIntake,
    measuredMaintenance,
    targetTolerance,
    KCAL_PER_KG,
    type Maintenance,
    type MaintenanceGap,
} from './energy'
import { daysBetween, type TrendPoint } from './weightTrend'
import type { TransformationRead } from './transformation'
import type { MacroGoals, MealPlanEntry, NutritionPhase } from '../types'

/**
 * Should the calorie target change, and by how much.
 *
 * This is the end of the loop: plan, eat, weigh, trend, measure maintenance,
 * compare to intent, adjust. Everything before it observes; this is the only
 * part that proposes. It proposes and stops — accepting is a decision, and a
 * system that quietly re-prescribed itself every Sunday would be impossible to
 * reason about six weeks later when the numbers no longer match anything you
 * remember choosing.
 *
 * The engine's first job is not arithmetic, it's telling two failures apart:
 *
 *   "The target is wrong."   →  eat less, or more.
 *   "The target wasn't followed."  →  eat the target.
 *
 * Nearly every bad recommendation a system like this can make comes from
 * confusing the second for the first — cutting calories on a plateau produced by
 * three unlogged weekends, then cutting again when that doesn't work either. So
 * adherence is checked before the rate is even consulted, and a thin or drifting
 * window returns a reason rather than a number.
 */

/** Days of data the review looks back over. */
export const REVIEW_WINDOW_DAYS = 21

/** The longer window, used for the maintenance estimate where the data reaches. */
export const LONG_WINDOW_DAYS = 28

/** Below this many logged days, nothing is proposed — the window is too thin. */
export const MIN_REVIEW_DAYS = 21

/** Below this, even the descriptive figures are not worth quoting. */
export const MIN_ANALYSIS_DAYS = 14

/** Fraction of the window that must carry logged intake before it can be judged. */
export const MIN_COVERAGE = 0.7

/**
 * A day is "logged" only if the intake on it is plausibly a whole day's eating.
 * Marking one breakfast eaten and forgetting the rest would otherwise read as a
 * 400 kcal day and drag the average into recommending a rise.
 */
export const MIN_LOGGED_FRACTION = 0.5

/** And when there's no target to take a fraction of, this flat floor stands in. */
export const MIN_LOGGED_KCAL = 800

/** The smallest change worth making, and the largest allowed at one review. */
export const MIN_STEP_KCAL = 100
export const MAX_STEP_KCAL = 150

/** Steps are rounded to this, so targets stay numbers a person would choose. */
export const STEP_ROUNDING = 25

/**
 * How far past the acceptable rate band the trend must sit before a change is
 * proposed. The two margins differ because the two errors do: a month of
 * apparent stall is rarely anything but a real stall, while a fortnight of
 * rapid loss is very often water — a glycogen drop or less salt empties two
 * kilos and puts them back just as fast — so the fast side gets more room
 * before anyone acts on it.
 */
export const SLOW_MARGIN_KG = 0.05
export const FAST_MARGIN_KG = 0.1

// ── Adherence ────────────────────────────────────────────────────────────────

export interface Adherence {
    /** Calendar days examined. */
    windowDays: number
    /** Days carrying a plausible full day's logged intake. */
    loggedDays: number
    /** loggedDays / windowDays, 0–1. */
    coverage: number
    avgIntakeKcal: number | null
    avgTargetKcal: number | null
    /** Mean of (intake − target) across logged days with a target. Signed. */
    avgDiffKcal: number | null
    /** Logged days landing within tolerance of that day's calorie target. */
    daysWithinTolerance: number
    /** Days that had a protein target, and how many met it. */
    proteinTargetDays: number
    proteinHitDays: number
    avgProteinG: number | null
    /** The tolerance used, in kcal — worth showing so "close" is defined. */
    toleranceKcal: number | null
}

/** Whether the window is complete and consistent enough to judge a target by. */
export function adherenceIsUsable(a: Adherence): boolean {
    if (a.loggedDays < MIN_REVIEW_DAYS) return false
    if (a.coverage < MIN_COVERAGE) return false
    // Eating a long way off the target, consistently, says nothing about whether
    // the target is right — only that something other than the target is setting
    // intake. The measured maintenance is still true; the prescription isn't in play.
    if (a.avgDiffKcal !== null && a.toleranceKcal !== null) {
        if (Math.abs(a.avgDiffKcal) > a.toleranceKcal * 1.5) return false
    }
    return true
}

/**
 * Measure the last `windowDays` against whatever target each day was actually
 * held to — resolved per day, so a window spanning a target change compares each
 * day to the number that was live at the time rather than to today's.
 */
export function adherence(
    entries: MealPlanEntry[],
    phases: NutritionPhase[],
    settingsGoals: MacroGoals | null | undefined,
    asOf: string,
    windowDays = REVIEW_WINDOW_DAYS
): Adherence {
    const eaten = new Map<string, { calories: number; protein: number }>()
    for (const e of entries) {
        if (e.status !== 'eaten') continue
        const age = daysBetween(e.date, asOf)
        if (age < 0 || age >= windowDays) continue
        const m = entryMacros(e)
        const acc = eaten.get(e.date) ?? { calories: 0, protein: 0 }
        acc.calories += m.calories
        acc.protein += m.protein
        eaten.set(e.date, acc)
    }

    let loggedDays = 0
    let intakeSum = 0
    let proteinSum = 0
    let targetSum = 0
    let targetDays = 0
    let diffSum = 0
    let withinTolerance = 0
    let proteinTargetDays = 0
    let proteinHitDays = 0
    let toleranceSum = 0

    for (const [date, day] of eaten) {
        const { goals } = targetsFor(date, phases, settingsGoals)
        const target = goals?.calories
        const floor = target ? target * MIN_LOGGED_FRACTION : MIN_LOGGED_KCAL
        if (day.calories < floor) continue

        loggedDays++
        intakeSum += day.calories
        proteinSum += day.protein

        if (target) {
            targetDays++
            targetSum += target
            diffSum += day.calories - target
            const tol = targetTolerance(target)
            toleranceSum += tol
            if (Math.abs(day.calories - target) <= tol) withinTolerance++
        }
        if (goals?.protein) {
            proteinTargetDays++
            if (day.protein >= goals.protein) proteinHitDays++
        }
    }

    return {
        windowDays,
        loggedDays,
        coverage: windowDays > 0 ? loggedDays / windowDays : 0,
        avgIntakeKcal: loggedDays > 0 ? intakeSum / loggedDays : null,
        avgTargetKcal: targetDays > 0 ? targetSum / targetDays : null,
        avgDiffKcal: targetDays > 0 ? diffSum / targetDays : null,
        daysWithinTolerance: withinTolerance,
        proteinTargetDays,
        proteinHitDays,
        avgProteinG: loggedDays > 0 ? proteinSum / loggedDays : null,
        toleranceKcal: targetDays > 0 ? toleranceSum / targetDays : null,
    }
}

// ── The recommendation ───────────────────────────────────────────────────────

export type RecommendationAction = 'hold' | 'reduce' | 'increase'

/**
 * Why nothing is being proposed. Every one of these is a real answer — "I can't
 * tell yet" is more useful than a number invented to fill the space.
 */
export type HoldReason =
    | 'no-phase'
    | 'not-adaptive'
    | 'no-target'
    | 'too-soon'
    | 'poor-adherence'
    | 'off-target-intake'
    | 'no-trend'
    | 'on-target'
    | 'contradicted'

/** How much the figures deserve to be leant on. */
export type Confidence = 'high' | 'medium' | 'low'

export interface Recommendation {
    action: RecommendationAction
    /** Set when action is 'hold'. */
    holdReason: HoldReason | null
    /** The target in force now. */
    currentCalories: number | null
    /** What to eat instead. Equal to `currentCalories` on a hold. */
    suggestedCalories: number | null
    /** suggested − current, signed. Zero on a hold. */
    deltaKcal: number
    /** The full macro split of the suggestion, protein and fat held. */
    suggestedTargets: MacroGoals | null
    /** A few words: the decision. */
    headline: string
    /** A sentence or two: why. */
    reason: string
    confidence: Confidence
    /** YYYY-MM-DD the change would apply from. */
    effectiveFrom: string
    adherence: Adherence
    maintenance: Maintenance | MaintenanceGap
    observedRateKgPerWeek: number | null
    desiredRateKgPerWeek: number | null
    /** The daily deficit the desired rate implies, signed. */
    desiredDeficitKcal: number | null
    /** The daily deficit the observed rate implies, signed. */
    observedDeficitKcal: number | null
    /**
     * The wider picture — waist, strength, recovery — when it was available.
     * Explains the recommendation; with one exception it does not decide it.
     */
    context: TransformationRead | null
}

export interface ReviewInput {
    phase: NutritionPhase | null
    entries: MealPlanEntry[]
    phases: NutritionPhase[]
    settingsGoals?: MacroGoals | null
    trend: WeightTrend | TrendGap
    weightPoints: TrendPoint[]
    asOf: string
    windowDays?: number
    /**
     * Supporting evidence from the transformation layer. Optional: without it
     * the engine behaves exactly as it did before any of it existed.
     */
    context?: TransformationRead | null
}

/**
 * Review the window and say what, if anything, to change.
 *
 * The order of the checks is the argument. Adherence and data coverage come
 * first, before the rate is looked at, because a plateau measured over a
 * half-logged fortnight is not evidence about the target — and the whole failure
 * mode worth designing against is ratcheting calories down in response to
 * missing data.
 */
export function reviewNutrition(input: ReviewInput): Recommendation {
    const {
        phase,
        entries,
        phases,
        settingsGoals,
        trend,
        weightPoints,
        asOf,
        windowDays = REVIEW_WINDOW_DAYS,
        context = null,
    } = input

    const stats = adherence(entries, phases, settingsGoals, asOf, windowDays)
    const maintenance = measuredMaintenance(
        dailyIntake(entries),
        weightPoints,
        LONG_WINDOW_DAYS,
        asOf
    )
    const observedRate = usableRate(trend)
    const current = phase ? (currentPhaseTargets(phase).calories ?? null) : null
    const goal = phase?.goal ?? null
    const desiredRate = goal?.targetWeeklyRateKg ?? phase?.weeklyRate ?? null

    const base = {
        currentCalories: current,
        suggestedCalories: current,
        deltaKcal: 0,
        suggestedTargets: null,
        effectiveFrom: asOf,
        adherence: stats,
        maintenance,
        observedRateKgPerWeek: observedRate,
        desiredRateKgPerWeek: desiredRate,
        desiredDeficitKcal: desiredRate === null ? null : (desiredRate * KCAL_PER_KG) / 7,
        observedDeficitKcal: observedRate === null ? null : (observedRate * KCAL_PER_KG) / 7,
        confidence: confidenceOf(stats, trend),
        context,
    }

    const hold = (holdReason: HoldReason, headline: string, reason: string): Recommendation => ({
        ...base,
        action: 'hold',
        holdReason,
        headline,
        reason,
    })

    if (!phase) {
        return hold(
            'no-phase',
            'No phase to review',
            'Adaptive targets need a nutrition phase with a goal to steer towards.'
        )
    }
    if (!goal?.adaptive) {
        return hold(
            'not-adaptive',
            'Adaptive targets are off',
            'Turn on adaptive targets for this phase to have its calories reviewed against your weight trend.'
        )
    }
    if (!current) {
        return hold(
            'no-target',
            'No calorie target',
            'This phase has no calorie target, so there is nothing to adjust.'
        )
    }
    if (stats.loggedDays < MIN_REVIEW_DAYS) {
        return hold(
            'too-soon',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            `Only ${stats.loggedDays} of the last ${windowDays} days have complete intake logged. About ${MIN_REVIEW_DAYS} are needed before a calorie change rests on anything.`
        )
    }
    if (stats.coverage < MIN_COVERAGE) {
        return hold(
            'poor-adherence',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            `Intake is logged on ${Math.round(stats.coverage * 100)}% of the window. The gaps make the average intake — and so the maintenance estimate — unreliable.`
        )
    }
    if (
        stats.avgDiffKcal !== null &&
        stats.toleranceKcal !== null &&
        Math.abs(stats.avgDiffKcal) > stats.toleranceKcal * 1.5
    ) {
        const over = stats.avgDiffKcal > 0
        return hold(
            'off-target-intake',
            `Eat the ${Math.round(current).toLocaleString()} kcal target`,
            `Average intake has been ${Math.round(Math.abs(stats.avgDiffKcal)).toLocaleString()} kcal ${over ? 'above' : 'below'} target. That says nothing about whether the target is right — try a few weeks closer to it before changing the number.`
        )
    }
    if (observedRate === null) {
        return hold(
            'no-trend',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            'There are not enough weigh-ins to measure a rate from. A few more readings will settle it.'
        )
    }

    const band = acceptableBand(goal, desiredRate)
    if (!band) {
        return hold(
            'no-target',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            'This phase has no intended rate of change, so there is nothing to compare the trend against.'
        )
    }

    if (rateWithinBand(observedRate, goal) || (observedRate >= band.min && observedRate <= band.max)) {
        return hold(
            'on-target',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `The scale is moving at ${fmtRate(observedRate)} against a target of ${fmtRate(band.min)} to ${fmtRate(band.max)}. Your current intake is producing close to the intended rate — no change needed.`
        )
    }

    const tooSlow = observedRate > band.max + SLOW_MARGIN_KG
    const tooFast = observedRate < band.min - FAST_MARGIN_KG

    /*
     * The one place the wider picture overrides the arithmetic — and it only
     * ever overrides it in one direction.
     *
     * A scale that has stopped moving reads as "eat less" and usually is. But
     * the same flat line, with the tape measure still falling and the bar still
     * going up, is a recomposition working exactly as intended, and cutting food
     * in response would be punishing the outcome the phase exists to produce.
     * When the evidence says that, the reduction is withheld.
     *
     * Strictly one-directional: waist, strength and recovery can stop a cut,
     * never cause one. Making them able to cut would let a single bad tape
     * reading or one poor session ratchet calories down, which is the failure
     * mode the whole engine is built to avoid.
     */
    if (tooSlow && context?.holdsAgainstReduction) {
        return hold(
            'contradicted',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `${context.detail} The scale alone would argue for a reduction here; the rest of the evidence does not.`
        )
    }

    if (!tooSlow && !tooFast) {
        return hold(
            'on-target',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `At ${fmtRate(observedRate)} the trend is just outside the ${fmtRate(band.min)} to ${fmtRate(band.max)} band — near enough that it is as likely to be noise as a real drift.`
        )
    }

    // Size the change from the gap between the rates, then hold it to a step.
    // The arithmetic would happily suggest 400 kcal off one slow month; the cap
    // is what stops a single noisy window from rewriting the prescription.
    const centre = goal.targetWeeklyRateKg ?? (band.min + band.max) / 2
    const rawKcal = ((centre - observedRate) * KCAL_PER_KG) / 7
    const delta = stepFrom(rawKcal)

    const suggested = Math.round(current + delta)
    const floorG = proteinFloorOf(phase)
    const suggestedTargets = retargetCalories(currentPhaseTargets(phase), suggested, floorG)

    if (tooSlow) {
        return {
            ...base,
            action: 'reduce',
            holdReason: null,
            suggestedCalories: suggested,
            deltaKcal: delta,
            suggestedTargets,
            headline: `Reduce to ${suggested.toLocaleString()} kcal`,
            reason: `The trend has slowed to ${fmtRate(observedRate)} against an intended ${fmtRate(centre)}, across ${stats.loggedDays} of ${windowDays} days logged. Take ${Math.abs(delta)} kcal off the baseline, from carbohydrate — protein stays at ${Math.round(suggestedTargets.protein)} g.`,
        }
    }

    return {
        ...base,
        action: 'increase',
        holdReason: null,
        suggestedCalories: suggested,
        deltaKcal: delta,
        suggestedTargets,
        headline: `Increase to ${suggested.toLocaleString()} kcal`,
        reason: `Weight is coming off at ${fmtRate(observedRate)}, faster than the intended ${fmtRate(centre)}. Add ${Math.abs(delta)} kcal of carbohydrate back — at this rate you are spending muscle and session quality for time you do not need to save.`,
    }
}

/**
 * The acceptable rate band, from the goal or built around the desired rate. A
 * quarter-kilo either side is the default: wide enough that ordinary weeks don't
 * trip it, narrow enough that a real drift eventually does.
 */
function acceptableBand(
    goal: { acceptableWeeklyRateKg?: { min: number; max: number }; targetWeeklyRateKg?: number },
    desiredRate: number | null
): { min: number; max: number } | null {
    if (goal.acceptableWeeklyRateKg) return goal.acceptableWeeklyRateKg
    if (desiredRate === null) return null
    return { min: desiredRate - 0.25, max: desiredRate + 0.25 }
}

/**
 * A raw kcal gap turned into a change worth making: at least a step, never more
 * than the cap, rounded to something a person would actually choose. Anything
 * under the minimum step is not worth the disruption and comes back as zero.
 */
export function stepFrom(rawKcal: number): number {
    const size = Math.abs(rawKcal)
    if (size < MIN_STEP_KCAL) return 0
    const capped = Math.min(size, MAX_STEP_KCAL)
    const rounded = Math.round(capped / STEP_ROUNDING) * STEP_ROUNDING
    return Math.sign(rawKcal) * Math.min(rounded, MAX_STEP_KCAL)
}

/**
 * How far to trust the figures. High needs a full window, good coverage and a
 * rate fitted to real readings rather than inferred from the smoothed line.
 */
function confidenceOf(stats: Adherence, trend: WeightTrend | TrendGap): Confidence {
    if (typeof trend === 'string') return 'low'
    const fitted = trend.rateKgPerWeek !== null
    if (stats.loggedDays >= MIN_REVIEW_DAYS && stats.coverage >= 0.85 && fitted) return 'high'
    if (stats.loggedDays >= MIN_ANALYSIS_DAYS && fitted) return 'medium'
    return 'low'
}

/** "−0.21 kg/week", with a real minus sign. */
export function fmtRate(kgPerWeek: number): string {
    const sign = kgPerWeek < 0 ? '−' : '+'
    return `${sign}${Math.abs(kgPerWeek).toFixed(2)} kg/week`
}
