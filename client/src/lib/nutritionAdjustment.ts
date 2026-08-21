import { entryMacros, targetsFor } from './nutrition'
import { retargetCalories, proteinFloorOf } from './nutritionTargets'
import {
    DEFAULT_ADAPTIVE_SETTINGS,
    STEP_ROUNDING_KCAL,
    calorieTolerance,
    centreRate,
    resolveConfig,
    withinRateBand,
    type NutritionConfig,
} from './nutritionConfig'
import { usableRate, type TrendGap, type WeightTrend } from './nutritionTrend'
import {
    dailyIntake,
    measuredMaintenance,
    KCAL_PER_KG,
    type Maintenance,
    type MaintenanceGap,
} from './energy'
import { daysBetween, type TrendPoint } from './weightTrend'
import type { TransformationRead } from './transformation'
import type { AdaptiveSettings, MacroGoals, MealPlanEntry, NutritionPhase } from '../types'

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

/**
 * The window the maintenance estimate reads, when the data reaches that far.
 * Longer than a review window on purpose: maintenance is a slow-moving quantity
 * and benefits from every day it can get.
 */
export const LONG_WINDOW_DAYS = 28

/** The review window used when a phase names none. Everything else comes from config. */
export const REVIEW_WINDOW_DAYS = DEFAULT_ADAPTIVE_SETTINGS.reviewWindowDays

/**
 * A day is "logged" only if the intake on it is plausibly a whole day's eating.
 * Marking one breakfast eaten and forgetting the rest would otherwise read as a
 * 400 kcal day and drag the average into recommending a rise.
 *
 * A proportion rather than a setting: this is about detecting a half-filled day,
 * which behaves the same at every calorie level.
 */
export const MIN_LOGGED_FRACTION = 0.5

/** And when there's no target to take a fraction of, this flat floor stands in. */
export const MIN_LOGGED_KCAL = 800

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
export function adherenceIsUsable(
    a: Adherence,
    adaptive: Required<AdaptiveSettings> = DEFAULT_ADAPTIVE_SETTINGS
): boolean {
    if (a.loggedDays < adaptive.preferredDataDays) return false
    if (a.coverage < adaptive.minCoverage) return false
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
    windowDays = DEFAULT_ADAPTIVE_SETTINGS.reviewWindowDays,
    adaptive: Required<AdaptiveSettings> = DEFAULT_ADAPTIVE_SETTINGS
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
            const tol = calorieTolerance(target, adaptive)
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
    const { phase, entries, phases, settingsGoals, trend, weightPoints, asOf, context = null } = input

    // Everything the engine is allowed to assume arrives here, resolved from the
    // phase with the application defaults merged underneath. Below this line
    // there is no such thing as a typical goal.
    const config = resolveConfig(phase)
    const adaptive = config?.adaptive ?? DEFAULT_ADAPTIVE_SETTINGS
    const windowDays = input.windowDays ?? adaptive.reviewWindowDays

    const stats = adherence(entries, phases, settingsGoals, asOf, windowDays, adaptive)
    const maintenance = measuredMaintenance(
        dailyIntake(entries),
        weightPoints,
        LONG_WINDOW_DAYS,
        asOf
    )
    const observedRate = usableRate(trend)
    const current = config?.prescription.calories ?? null
    const desiredRate = config ? centreRate(config.rate) : null

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
        confidence: confidenceOf(stats, trend, adaptive),
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
    if (!config || !adaptive.enabled) {
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
    if (stats.loggedDays < adaptive.preferredDataDays) {
        return hold(
            'too-soon',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            `Only ${stats.loggedDays} of the last ${windowDays} days have complete intake logged. About ${adaptive.preferredDataDays} are needed before a calorie change rests on anything.`
        )
    }
    if (stats.coverage < adaptive.minCoverage) {
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

    const band = config.rate.acceptable
    const centre = desiredRate
    if (!band || centre === null) {
        return hold(
            'no-target',
            `Hold ${Math.round(current).toLocaleString()} kcal`,
            'This phase has no intended rate of change, so there is nothing to compare the trend against.'
        )
    }

    if (withinRateBand(observedRate, config.rate)) {
        return hold(
            'on-target',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `The scale is moving at ${fmtRate(observedRate)} against an intended ${fmtRate(band.min)} to ${fmtRate(band.max)}. Your current intake is producing close to the intended rate — no change needed.`
        )
    }

    /*
     * Which way to move the food, without any assumption about which way the
     * scale is meant to go.
     *
     * More calories raise the observed rate and fewer lower it — that holds
     * whether the goal is to lose, hold or gain. So the whole decision is the
     * sign of (intended − observed): a rate running *above* what was asked for
     * means eat less, one running *below* it means eat more. On a cut that reads
     * as "not losing fast enough → reduce"; on a bulk the identical arithmetic
     * reads as "gaining too fast → reduce". Neither case is special.
     *
     * The margins keep ordinary noise from tripping it, and sit outside the
     * band the user configured.
     */
    const aboveBand = observedRate > band.max + config.rate.marginAboveKg
    const belowBand = observedRate < band.min - config.rate.marginBelowKg

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
    if (aboveBand && context?.holdsAgainstReduction) {
        return hold(
            'contradicted',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `${context.detail} The scale alone would argue for a reduction here; the rest of the evidence does not.`
        )
    }

    if (!aboveBand && !belowBand) {
        return hold(
            'on-target',
            `Keep ${Math.round(current).toLocaleString()} kcal`,
            `At ${fmtRate(observedRate)} the trend is just outside the ${fmtRate(band.min)} to ${fmtRate(band.max)} band — near enough that it is as likely to be noise as a real drift.`
        )
    }

    // Size the change from the gap between the rates, then hold it to a step.
    // The arithmetic would happily suggest 400 kcal off one slow month; the cap
    // the user configured is what stops a single noisy window from rewriting the
    // prescription.
    const rawKcal = ((centre - observedRate) * KCAL_PER_KG) / 7
    const delta = stepFrom(rawKcal, adaptive)

    const suggested = Math.round(current + delta)
    const floorG = proteinFloorOf(phase)
    const suggestedTargets = retargetCalories(
        config.prescription,
        suggested,
        floorG,
        config.macroPolicy
    )
    const lever = leverName(config)
    const observedPhrase = ratePhrase(observedRate, config.goalMode)

    if (delta < 0) {
        return {
            ...base,
            action: 'reduce',
            holdReason: null,
            suggestedCalories: suggested,
            deltaKcal: delta,
            suggestedTargets,
            headline: `Reduce to ${suggested.toLocaleString()} kcal`,
            reason: `${observedPhrase} at ${fmtRate(observedRate)} against an intended ${fmtRate(centre)}, across ${stats.loggedDays} of ${windowDays} days logged. Take ${Math.abs(delta)} kcal off the baseline, from ${lever}${proteinNote(config, suggestedTargets)}.`,
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
        reason: `${observedPhrase} at ${fmtRate(observedRate)} against an intended ${fmtRate(centre)}. Add ${Math.abs(delta)} kcal back, to ${lever}${muscleNote(config, observedRate, centre)}.`,
    }
}

/** The macro the policy has absorbing the change, named for a sentence. */
function leverName(config: NutritionConfig): string {
    const { macroPolicy } = config
    if (macroPolicy.fat === 'remainder') return 'fat'
    if (macroPolicy.protein === 'remainder') return 'protein'
    return 'carbohydrate'
}

/** " — protein stays at 210 g", when the policy is actually holding it. */
function proteinNote(config: NutritionConfig, targets: { protein: number }): string {
    if (config.macroPolicy.protein === 'remainder' || config.macroPolicy.protein === 'adjustable') {
        return ''
    }
    return ` — protein stays at ${Math.round(targets.protein)} g`
}

/**
 * The muscle-preservation clause, but only where it is actually true: overshooting
 * on the way down costs lean tissue, whereas a bulk running hot is just gaining
 * faster than intended and costs body fat instead.
 */
function muscleNote(config: NutritionConfig, observed: number, centre: number): string {
    if (config.rate.direction !== 'down' || observed >= centre) return ''
    return '. At this rate you are spending muscle and session quality for time you do not need to save'
}

/**
 * How to describe what the scale is doing, in terms that fit the goal. "Weight
 * is coming off" is exactly wrong on a bulk, and "the trend has slowed" is
 * nonsense when the trend has in fact accelerated upward.
 */
function ratePhrase(observed: number, goalMode: string): string {
    if (Math.abs(observed) < 0.05) return 'The scale has been broadly flat'
    if (observed < 0) return 'Weight is coming off'
    return goalMode === 'weight-gain' || goalMode === 'recomposition'
        ? 'Weight is going on'
        : 'The scale is rising'
}

/**
 * A raw kcal gap turned into a change worth making: at least a step, never more
 * than the cap, rounded to something a person would actually choose. Anything
 * under the minimum step is not worth the disruption and comes back as zero.
 */
export function stepFrom(
    rawKcal: number,
    adaptive: Required<AdaptiveSettings> = DEFAULT_ADAPTIVE_SETTINGS
): number {
    const size = Math.abs(rawKcal)
    if (size < adaptive.minAdjustmentKcal) return 0
    const capped = Math.min(size, adaptive.maxAdjustmentKcal)
    // Rounded for legibility, then re-capped: rounding up must never carry the
    // change past the ceiling the user set.
    const rounded = Math.round(capped / STEP_ROUNDING_KCAL) * STEP_ROUNDING_KCAL
    return Math.sign(rawKcal) * Math.min(rounded, adaptive.maxAdjustmentKcal)
}

/**
 * How far to trust the figures. High needs a full window, good coverage and a
 * rate fitted to real readings rather than inferred from the smoothed line.
 */
function confidenceOf(
    stats: Adherence,
    trend: WeightTrend | TrendGap,
    adaptive: Required<AdaptiveSettings>
): Confidence {
    if (typeof trend === 'string') return 'low'
    const fitted = trend.rateKgPerWeek !== null
    // "Well covered" is a fifth again above the minimum the user set, rather than
    // a second threshold to configure.
    const wellCovered = stats.coverage >= Math.min(1, adaptive.minCoverage * 1.2)
    if (stats.loggedDays >= adaptive.preferredDataDays && wellCovered && fitted) return 'high'
    if (stats.loggedDays >= adaptive.minimumDataDays && fitted) return 'medium'
    return 'low'
}

/** "−0.21 kg/week", with a real minus sign. */
export function fmtRate(kgPerWeek: number): string {
    const sign = kgPerWeek < 0 ? '−' : '+'
    return `${sign}${Math.abs(kgPerWeek).toFixed(2)} kg/week`
}
