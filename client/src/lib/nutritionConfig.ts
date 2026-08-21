import { currentPhaseTargets } from './nutrition'
import type {
    AdaptiveSettings,
    GoalMode,
    MacroGoals,
    MacroPolicy,
    NutritionPhase,
    PhaseGoal,
} from '../types'

/**
 * One place where a phase becomes configuration the engine can read.
 *
 * The engine below this line knows nothing about any particular person. It is
 * handed a goal, a prescription, a rate intent and a set of review settings, and
 * it works the same way whether those describe a nine-month recomposition, a
 * lean bulk, or someone holding a weight inside a two-kilo band. Everything that
 * used to be a decision baked into the code — how long a window must be, how big
 * a change is prudent, which macro absorbs it, which direction counts as
 * progress — arrives here as data.
 *
 * Two distinctions run through this module and are worth stating outright:
 *
 *   - A **universal constant** stays in code. 7,700 kcal per kilogram is a model
 *     assumption about human tissue, not a preference, and no user setting
 *     should pretend otherwise.
 *   - A **default** is a judgement the application makes on the user's behalf
 *     when they haven't expressed one. It lives here, in one table, and is
 *     merged under whatever the phase says — never scattered through the logic
 *     as a number nobody can find.
 *
 * ## Sign convention
 *
 * Every weekly rate in the system is **signed**: negative for loss, positive for
 * gain, around zero for maintenance. A band is `{ min, max }` with `min ≤ max`
 * numerically, so a cut's acceptable band reads `{ min: -0.30, max: -0.15 }` —
 * `min` is the *faster* end because it is the smaller number. This is the one
 * convention; nothing anywhere flips it.
 */

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * What the review does when the phase hasn't said otherwise.
 *
 * These are defensible starting points, not truths. Three weeks is roughly where
 * a bodyweight trend stops being dominated by water; 150 kcal is a change big
 * enough to matter and small enough to be wrong about safely. A user who
 * disagrees can say so per phase.
 */
export const DEFAULT_ADAPTIVE_SETTINGS: Required<AdaptiveSettings> = {
    enabled: false,
    /** Days of history a review reads. */
    reviewWindowDays: 21,
    /** Below this many logged days, even the descriptive figures aren't worth quoting. */
    minimumDataDays: 14,
    /** Below this many logged days, nothing is proposed. */
    preferredDataDays: 21,
    /** Largest change proposed at one review. */
    maxAdjustmentKcal: 150,
    /** Smaller than this isn't worth the disruption. */
    minAdjustmentKcal: 100,
    /** How close to target a day must land to count as adherent. */
    calorieAdherenceToleranceKcal: 150,
    /** Fraction of the window that must carry logged intake. */
    minCoverage: 0.7,
}

/**
 * The default macro policy: hold protein and fat, let carbohydrate take the
 * difference. It suits a hard-training deficit, which is why it is the default —
 * but someone eating low-carb wants the opposite, so it is a setting.
 */
export const DEFAULT_MACRO_POLICY: Required<MacroPolicy> = {
    protein: 'fixed',
    fat: 'fixed',
    carbs: 'remainder',
}

/** Calorie changes are rounded to this, so targets stay numbers a person would pick. */
export const STEP_ROUNDING_KCAL = 25

/**
 * How far past the acceptable band the trend must sit before a change is
 * proposed, in kg/week. Both exist to stop ordinary noise from moving a target.
 *
 * They differ because the two mistakes cost differently. Cutting food that
 * didn't need cutting costs training quality and lean tissue and compounds every
 * week it goes unnoticed; adding food back costs a little time. So the threshold
 * for *reducing* calories sits further out than the one for raising them.
 */
export const DEFAULT_MARGIN_ABOVE_KG = 0.05
export const DEFAULT_MARGIN_BELOW_KG = 0.1

/** Width of the band built around a target rate when the phase names no band. */
export const DEFAULT_BAND_WIDTH_KG = 0.25

// ── The resolved configuration ───────────────────────────────────────────────

/** Which way the goal wants bodyweight to move. Derived, never stored. */
export type RateDirection = 'down' | 'up' | 'hold'

export interface RateIntent {
    /** Intended weekly change, signed. Null when the phase names none. */
    targetKgPerWeek: number | null
    /** The range needing no correction, signed and min ≤ max. Null likewise. */
    acceptable: { min: number; max: number } | null
    /** Which way that points. */
    direction: RateDirection
    /** How far outside the band before calories are cut / raised. */
    marginAboveKg: number
    marginBelowKg: number
}

export interface NutritionConfig {
    phase: NutritionPhase
    goalMode: GoalMode
    /** What the user wants to achieve. */
    goal: PhaseGoal
    /** What they are currently eating — the prescription in force now. */
    prescription: MacroGoals
    /** How progress is judged. */
    rate: RateIntent
    /** How the review behaves, defaults merged under the phase's overrides. */
    adaptive: Required<AdaptiveSettings>
    macroPolicy: Required<MacroPolicy>
}

/**
 * What a phase means, with every default filled in.
 *
 * Handles records written before any of this existed: an old phase carrying only
 * `targets` and `weeklyRate` resolves to a complete configuration, with the goal
 * mode inferred from its `kind` and the adaptive machinery switched off. Nothing
 * needs migrating, and nothing downstream has to ask which vintage it is reading.
 */
export function resolveConfig(phase: NutritionPhase | null): NutritionConfig | null {
    if (!phase) return null

    const goal = phase.goal ?? {}
    const goalMode = resolveGoalMode(phase)

    // The legacy `goal.adaptive` boolean still turns the review on, so phases
    // written before the settings object keep working untouched.
    const adaptive: Required<AdaptiveSettings> = {
        ...DEFAULT_ADAPTIVE_SETTINGS,
        enabled: phase.adaptive?.enabled ?? goal.adaptive ?? DEFAULT_ADAPTIVE_SETTINGS.enabled,
        ...definedOnly(phase.adaptive),
    }

    return {
        phase,
        goalMode,
        goal,
        prescription: currentPhaseTargets(phase),
        rate: resolveRate(phase, goalMode),
        adaptive,
        macroPolicy: { ...DEFAULT_MACRO_POLICY, ...definedOnly(phase.macroPolicy) },
    }
}

/**
 * The goal mode, inferred when not stated.
 *
 * `goal.style: 'recomp'` was how recomposition was expressed before the mode
 * existed, so it is honoured first; otherwise the phase's direction stands in.
 */
export function resolveGoalMode(phase: NutritionPhase): GoalMode {
    if (phase.goalMode) return phase.goalMode
    if (phase.goal?.style === 'recomp') return 'recomposition'
    if (phase.kind === 'gain') return 'weight-gain'
    if (phase.kind === 'maintain') return 'maintenance'
    return 'weight-loss'
}

/**
 * The rate intent: what change is wanted, what range needs no correction, and
 * which way that points.
 *
 * The band falls back to a quarter-kilo either side of the target — wide enough
 * that ordinary weeks don't trip it, narrow enough that a real drift eventually
 * does. A maintenance phase with no stated rate gets a band around zero, which
 * is what "maintenance" means.
 */
export function resolveRate(phase: NutritionPhase, goalMode: GoalMode): RateIntent {
    const goal = phase.goal ?? {}
    const stated = goal.targetWeeklyRateKg ?? phase.weeklyRate ?? null
    const targetKgPerWeek = stated ?? (goalMode === 'maintenance' ? 0 : null)

    let acceptable = goal.acceptableWeeklyRateKg ?? null
    if (!acceptable && targetKgPerWeek !== null) {
        acceptable = {
            min: targetKgPerWeek - DEFAULT_BAND_WIDTH_KG,
            max: targetKgPerWeek + DEFAULT_BAND_WIDTH_KG,
        }
    }
    // Tolerate a band written the way it reads aloud rather than in number order.
    if (acceptable && acceptable.min > acceptable.max) {
        acceptable = { min: acceptable.max, max: acceptable.min }
    }

    return {
        targetKgPerWeek,
        acceptable,
        direction: directionOf(targetKgPerWeek, goalMode),
        marginAboveKg: DEFAULT_MARGIN_ABOVE_KG,
        marginBelowKg: DEFAULT_MARGIN_BELOW_KG,
    }
}

/** Below this a target rate is "hold this weight" rather than a direction. */
export const HOLD_THRESHOLD_KG = 0.02

/** Which way a target rate points, falling back to the goal mode. */
export function directionOf(targetKgPerWeek: number | null, goalMode: GoalMode): RateDirection {
    if (targetKgPerWeek === null) {
        if (goalMode === 'weight-gain') return 'up'
        if (goalMode === 'maintenance') return 'hold'
        return 'down'
    }
    if (Math.abs(targetKgPerWeek) < HOLD_THRESHOLD_KG) return 'hold'
    return targetKgPerWeek < 0 ? 'down' : 'up'
}

/**
 * The centre of the intended band — what the observed rate is compared against.
 * The stated target where there is one, otherwise the middle of the band.
 */
export function centreRate(rate: RateIntent): number | null {
    if (rate.targetKgPerWeek !== null) return rate.targetKgPerWeek
    if (rate.acceptable) return (rate.acceptable.min + rate.acceptable.max) / 2
    return null
}

/** Whether an observed rate sits inside the acceptable band. */
export function withinRateBand(observed: number, rate: RateIntent): boolean {
    if (!rate.acceptable) return false
    return observed >= rate.acceptable.min && observed <= rate.acceptable.max
}

/**
 * Whether the tolerance for "close enough to target" should scale with the
 * target or use the configured flat figure.
 *
 * A flat 150 kcal is far too tight on a 4,000 kcal bulk and too loose on a 1,500
 * kcal cut, so the wider of the configured tolerance and 5% of the target wins.
 */
export function calorieTolerance(target: number, adaptive: Required<AdaptiveSettings>): number {
    return Math.max(adaptive.calorieAdherenceToleranceKcal, target * 0.05)
}

/** Strip undefined values so a spread doesn't punch holes in the defaults. */
function definedOnly<T extends object>(source: T | undefined): Partial<T> {
    if (!source) return {}
    return Object.fromEntries(
        Object.entries(source).filter(([, v]) => v !== undefined && v !== null)
    ) as Partial<T>
}
