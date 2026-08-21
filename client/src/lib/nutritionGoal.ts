import { daysBetween } from './weightTrend'
import { usableRate, type TrendGap, type WeightTrend } from './nutritionTrend'
import type { NutritionPhase, PhaseGoal } from '../types'

/**
 * Where the goal stands.
 *
 * Three rates are worth holding apart and the panel is nearly useless if it
 * conflates them:
 *
 *   - **observed** — what the scale is doing.
 *   - **desired**  — what the plan asked for.
 *   - **required** — what would now be needed to arrive on the date.
 *
 * Early on all three agree. The interesting months are the ones where they don't:
 * running slightly behind the desired rate is fine if the required rate is still
 * gentle, and that is a completely different situation from hitting the desired
 * rate on a goal that was never reachable in the time left.
 *
 * Projection is arithmetic on a noisy slope, not a promise. Nothing here should
 * be phrased to the user as one.
 */

/** How the observed rate compares to what the goal needs. */
export const GOAL_STATUSES = [
    'on-track',
    'slightly-ahead',
    'ahead',
    'slightly-behind',
    'behind',
    'wrong-way',
    'reached',
    'insufficient-data',
] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
    'on-track': 'On track',
    'slightly-ahead': 'Slightly ahead',
    ahead: 'Ahead of plan',
    'slightly-behind': 'Slightly behind',
    behind: 'Behind plan',
    'wrong-way': 'Moving away',
    reached: 'Target reached',
    'insufficient-data': 'Insufficient data',
}

/**
 * How far the projection may miss the target before the wording hardens from
 * "slightly" to plain. A recomp aiming at 95 kg landing at 95.4 is the same
 * plan; calling that behind would train you to ignore the word.
 */
export const SLIGHT_MISS_KG = 0.75

/** And beyond this, the projection is missing by enough to mean something. */
export const CLEAR_MISS_KG = 2

export interface GoalProgress {
    goal: PhaseGoal
    /** Where the goal is aimed, and how long is left. */
    targetDate: string | null
    weeksRemaining: number | null
    /** The 7-day average — the weight every figure below is built from. */
    currentKg: number
    startKg: number | null
    /** current − start, signed. Negative is loss. */
    totalChangeKg: number | null
    targetKg: number | null
    /** target − current, signed: what is left to do. */
    remainingKg: number | null
    /** Whether the current weight already sits inside the target band. */
    withinTargetBand: boolean
    /** What the scale is doing, kg/week. Null when the data won't say. */
    observedRateKgPerWeek: number | null
    /** What the plan asked for, kg/week. */
    desiredRateKgPerWeek: number | null
    /** What would be needed from here to arrive on the date, kg/week. */
    requiredRateKgPerWeek: number | null
    /** Where the current rate lands on the target date. Null without a rate or a date. */
    projectedKg: number | null
    /** How far the projection misses the target by, signed. */
    projectedMissKg: number | null
    status: GoalStatus
}

/** The goal block of a phase, when it has one worth reading. */
export function goalOf(phase: NutritionPhase | null): PhaseGoal | null {
    return phase?.goal ?? null
}

/** Whether a weight sits inside the goal's accepted band, falling back to the point target. */
export function withinBand(kg: number, goal: PhaseGoal): boolean {
    const range = goal.targetWeightRangeKg
    if (range) return kg >= range.min && kg <= range.max
    if (goal.targetWeightKg === undefined) return false
    return Math.abs(kg - goal.targetWeightKg) <= SLIGHT_MISS_KG
}

/**
 * Whether an observed rate sits inside the goal's acceptable band. Without a
 * band, anything within a quarter-kilo a week of the desired rate passes.
 */
export function rateWithinBand(rate: number, goal: PhaseGoal): boolean {
    const band = goal.acceptableWeeklyRateKg
    if (band) return rate >= band.min && rate <= band.max
    const desired = goal.targetWeeklyRateKg
    if (desired === undefined) return false
    return Math.abs(rate - desired) <= 0.25
}

/**
 * Read the goal against the scale.
 *
 * `asOf` is the day the projection is made from — today, normally. It is
 * separate from the trend's own anchor so that a week away from the scale
 * shortens the time remaining, as it should, rather than freezing the clock at
 * the last weigh-in.
 */
export function goalProgress(
    phase: NutritionPhase | null,
    trend: WeightTrend | TrendGap,
    asOf: string
): GoalProgress | null {
    const goal = goalOf(phase)
    if (!goal || typeof trend === 'string') return null

    const currentKg = trend.current.kg
    const observedRateKgPerWeek = usableRate(trend)
    const targetDate = goal.targetDate ?? phase?.endDate ?? null
    const targetKg = goal.targetWeightKg ?? null
    const startKg = goal.startWeightKg ?? null

    // A goal date in the past leaves no weeks to run; clamping at zero keeps the
    // required rate from flipping sign and claiming you need to gain.
    const daysRemaining = targetDate ? Math.max(0, daysBetween(asOf, targetDate)) : null
    const weeksRemaining = daysRemaining === null ? null : daysRemaining / 7

    const remainingKg = targetKg === null ? null : targetKg - currentKg
    const withinTargetBand = withinBand(currentKg, goal)

    const requiredRateKgPerWeek =
        remainingKg === null || weeksRemaining === null || weeksRemaining < 0.5
            ? null
            : remainingKg / weeksRemaining

    const projectedKg =
        observedRateKgPerWeek === null || weeksRemaining === null
            ? null
            : currentKg + observedRateKgPerWeek * weeksRemaining

    const projectedMissKg =
        projectedKg === null || targetKg === null ? null : projectedKg - targetKg

    return {
        goal,
        targetDate,
        weeksRemaining,
        currentKg,
        startKg,
        totalChangeKg: startKg === null ? null : currentKg - startKg,
        targetKg,
        remainingKg,
        withinTargetBand,
        observedRateKgPerWeek,
        desiredRateKgPerWeek: goal.targetWeeklyRateKg ?? phase?.weeklyRate ?? null,
        requiredRateKgPerWeek,
        projectedKg,
        projectedMissKg,
        status: statusOf({
            goal,
            currentKg,
            withinTargetBand,
            observedRateKgPerWeek,
            projectedKg,
            projectedMissKg,
            remainingKg,
        }),
    }
}

/**
 * The one-word verdict.
 *
 * Judged on where the projection lands rather than on this week's rate, because
 * the goal is a weight on a date and a fortnight either side of the desired rate
 * changes almost nothing about arriving. Sitting inside the target band wins
 * outright — a goal you have reached is not "behind" because the trend flattened
 * once you got there, which is exactly what should happen.
 */
function statusOf(input: {
    goal: PhaseGoal
    currentKg: number
    withinTargetBand: boolean
    observedRateKgPerWeek: number | null
    projectedKg: number | null
    projectedMissKg: number | null
    remainingKg: number | null
}): GoalStatus {
    const { goal, withinTargetBand, observedRateKgPerWeek, projectedMissKg, remainingKg } = input

    if (withinTargetBand) return 'reached'
    if (observedRateKgPerWeek === null) return 'insufficient-data'

    // Moving away from the target outright — the one case worth saying plainly.
    if (
        remainingKg !== null &&
        Math.abs(observedRateKgPerWeek) > 0.05 &&
        Math.sign(observedRateKgPerWeek) !== Math.sign(remainingKg)
    ) {
        return 'wrong-way'
    }

    if (projectedMissKg === null) {
        // No date to project onto: fall back to whether the rate is acceptable.
        return rateWithinBand(observedRateKgPerWeek, goal) ? 'on-track' : 'insufficient-data'
    }

    // Which side of the target the projection lands on only means "ahead" or
    // "behind" relative to the direction of travel. Landing above 95 kg on the
    // way down is short of the goal; the identical number on the way up is past
    // it. `direction` is the sign of the work left to do, so a projection that
    // has gone further than the target in that direction is ahead.
    const direction = remainingKg !== null && remainingKg > 0 ? 1 : -1
    const signedMiss = projectedMissKg * direction

    const size = Math.abs(projectedMissKg)
    if (size <= SLIGHT_MISS_KG) return 'on-track'
    if (signedMiss > 0) return size <= CLEAR_MISS_KG ? 'slightly-ahead' : 'ahead'
    return size <= CLEAR_MISS_KG ? 'slightly-behind' : 'behind'
}

/**
 * The daily calorie deficit a weekly rate implies, using the 7,700 kcal/kg
 * approximation. Signed: negative for the deficit a loss needs.
 */
export function dailyDeficitFor(weeklyRateKg: number): number {
    return (weeklyRateKg * 7700) / 7
}
