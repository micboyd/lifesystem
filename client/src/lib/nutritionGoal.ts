import { daysBetween } from './weightTrend'
import { usableRate, type TrendGap, type WeightTrend } from './nutritionTrend'
import { DEFAULT_BAND_WIDTH_KG } from './nutritionConfig'
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
 * band, one is built around the desired rate at the same default width the rest
 * of the system uses — rather than a second, quietly different, quarter-kilo.
 */
export function rateWithinBand(rate: number, goal: PhaseGoal): boolean {
    const band = goal.acceptableWeeklyRateKg
    if (band) return rate >= band.min && rate <= band.max
    const desired = goal.targetWeeklyRateKg
    if (desired === undefined) return false
    return Math.abs(rate - desired) <= DEFAULT_BAND_WIDTH_KG
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

// ── Body-composition targets ─────────────────────────────────────────────────

/**
 * What a body-fat target implies for the scale.
 *
 * A goal of "16% body fat" says nothing about weight on its own — it depends
 * entirely on how much lean mass survives the process, which is the one thing
 * nobody can promise. So this answers a narrower, honest question:
 *
 *   *If lean mass were held exactly as it is now, what would the scale read at
 *   that body fat?*
 *
 *     weight = leanMass / (1 − targetBodyFat)
 *
 * That is a useful anchor and a terrible prediction. It is deliberately never
 * written into `targetWeightKg`: lean mass moves, and quietly converting a
 * composition goal into a scale goal would hand the user a number the system
 * had invented and then hold them to it.
 */
export function weightAtBodyFat(leanMassKg: number, targetBodyFatPct: number): number | null {
    if (!Number.isFinite(leanMassKg) || leanMassKg <= 0) return null
    if (!Number.isFinite(targetBodyFatPct) || targetBodyFatPct <= 0 || targetBodyFatPct >= 100) {
        return null
    }
    return leanMassKg / (1 - targetBodyFatPct / 100)
}

export interface CompositionTarget {
    /** Scale weight at the target body fat, holding current lean mass. */
    weightIfLeanHeldKg: number
    /** Fat mass at the goal, on the same assumption. */
    fatMassAtGoalKg: number
    /** Fat that would have to come off to get there. Negative is loss. */
    fatChangeKg: number
    /**
     * Lean mass the *stated* target weight would require at the target body
     * fat, when a weight target is also set. Null when there is no weight target.
     */
    leanMassRequiredKg: number | null
    /** leanMassRequired − current lean mass. Positive means lean mass must be gained. */
    leanChangeRequiredKg: number | null
    /** Whether that implied lean change is large enough to be worth flagging. */
    demanding: boolean
}

/**
 * Lean mass a goal implies you would have to gain before it counts as an
 * ambitious body-composition target rather than ordinary fat loss.
 */
export const DEMANDING_LEAN_GAIN_KG = 1.5

/**
 * What a weight-and-body-fat pair implies together.
 *
 * The two are not mutually exclusive and the app should not force a choice.
 * Where both are set, the interesting quantity is the lean mass the combination
 * requires: "95 kg at 20%" and "95 kg at 16%" are the same scale number and
 * wildly different undertakings, and only this shows the difference.
 *
 * Reported, never enforced. Nothing here refuses to save a goal — whether a
 * target is physiologically reachable is not something this can know.
 */
export function compositionTarget(
    currentWeightKg: number,
    currentBodyFatPct: number,
    goal: PhaseGoal
): CompositionTarget | null {
    const targetBf = goal.targetBodyFatPct
    if (targetBf === undefined) return null
    if (!Number.isFinite(currentWeightKg) || currentWeightKg <= 0) return null
    if (!Number.isFinite(currentBodyFatPct) || currentBodyFatPct <= 0 || currentBodyFatPct >= 100) {
        return null
    }

    const currentFat = (currentWeightKg * currentBodyFatPct) / 100
    const currentLean = currentWeightKg - currentFat

    const weightIfLeanHeldKg = weightAtBodyFat(currentLean, targetBf)
    if (weightIfLeanHeldKg === null) return null

    const fatMassAtGoalKg = (weightIfLeanHeldKg * targetBf) / 100

    // If a scale target is also set, the lean mass it would take to hit both.
    const targetWeight = goal.targetWeightKg ?? null
    const leanMassRequiredKg =
        targetWeight === null ? null : targetWeight * (1 - targetBf / 100)
    const leanChangeRequiredKg =
        leanMassRequiredKg === null ? null : leanMassRequiredKg - currentLean

    return {
        weightIfLeanHeldKg,
        fatMassAtGoalKg,
        fatChangeKg: fatMassAtGoalKg - currentFat,
        leanMassRequiredKg,
        leanChangeRequiredKg,
        demanding:
            leanChangeRequiredKg !== null && leanChangeRequiredKg > DEMANDING_LEAN_GAIN_KG,
    }
}

/**
 * A sentence describing what a goal asks for, or null when there is nothing
 * worth saying. Non-blocking context shown while editing — it explains the
 * implication and leaves the decision alone.
 */
export function goalImplication(target: CompositionTarget | null): string | null {
    if (!target) return null

    const atBf = `${target.weightIfLeanHeldKg.toFixed(1)} kg`
    if (target.leanChangeRequiredKg === null) {
        return `Holding your current lean mass, that body fat would put you around ${atBf}.`
    }

    const change = target.leanChangeRequiredKg
    if (Math.abs(change) < 0.5) {
        return `That pairing is about right for your current lean mass — roughly ${atBf} if it holds.`
    }
    if (change > 0) {
        return `That pairing implies gaining about ${change.toFixed(1)} kg of lean mass while losing fat. It is possible, but it is a more ambitious target than fat loss alone — holding your lean mass exactly as it is would put you nearer ${atBf}.`
    }
    return `That pairing implies losing about ${Math.abs(change).toFixed(1)} kg of lean mass along the way. Holding your lean mass instead would put you nearer ${atBf}.`
}
