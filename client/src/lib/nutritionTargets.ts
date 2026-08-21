import { currentPhaseTargets, normGoals, targetsFor, type ResolvedTargets } from './nutrition'
import { isHardSession } from './overload'
import type { FitnessPlanEntry, MacroGoals, NutritionPhase } from '../types'

/**
 * What to eat on a particular day.
 *
 * `nutrition.ts` answers "which targets govern this date" — the phase's, as they
 * stood then, or the standing goals. This adds the two things that turn that
 * into a day's actual prescription: the split of a calorie figure into macros
 * when the figure changes, and the optional shift for how hard the day trains.
 *
 * Both are here rather than in a component because Today, the planner and the
 * dashboard all have to arrive at the same number. Three views quietly
 * disagreeing about what today's target is would be worse than having no
 * target at all.
 */

/** Calories per gram, for reconciling a macro split against a calorie figure. */
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

/**
 * Split a calorie target into macros, holding protein and fat and letting
 * carbohydrate take the difference.
 *
 * This is the whole macro policy of a hard-training cut in one function. Protein
 * is what keeps the loss coming off fat rather than muscle, and dropping it to
 * make a calorie cut arithmetically tidy defeats the point of the cut. Fat has a
 * floor below which hormones and satiety suffer. Carbohydrate is the one that
 * can move without costing you tissue — it costs you session quality, which is
 * the price of the deficit and is meant to be felt.
 *
 * Returns whole grams. The rounding means the macros reconcile to within a few
 * kcal of the target rather than exactly; `caloriesOf` reports where they land.
 */
export function macrosForCalories(
    calories: number,
    proteinG: number,
    fatG: number
): Required<MacroGoals> {
    const protein = Math.max(0, Math.round(proteinG))
    const fat = Math.max(0, Math.round(fatG))
    const fromProteinAndFat = protein * KCAL_PER_G.protein + fat * KCAL_PER_G.fat
    // A calorie target beneath its own protein and fat floors can't be split;
    // carbs go to zero rather than negative, and the caller sees the overshoot
    // in `caloriesOf` rather than being handed impossible macros.
    const carbs = Math.max(0, Math.round((calories - fromProteinAndFat) / KCAL_PER_G.carbs))
    return { calories: Math.round(calories), protein, carbs, fat }
}

/** What a macro set actually adds up to — the check that a split reconciles. */
export function caloriesOf(goals: MacroGoals): number {
    return (
        (goals.protein ?? 0) * KCAL_PER_G.protein +
        (goals.carbs ?? 0) * KCAL_PER_G.carbs +
        (goals.fat ?? 0) * KCAL_PER_G.fat
    )
}

/**
 * Re-split an existing target to a new calorie figure, keeping protein and fat
 * exactly where they were. The macro half of accepting an adjustment: the
 * calorie number is the decision, this is its consequence.
 *
 * A protein floor overrides whatever protein the old target carried, so a phase
 * that set one can never have it eroded by a run of adjustments.
 */
export function retargetCalories(
    current: MacroGoals,
    calories: number,
    proteinFloorG?: number
): Required<MacroGoals> {
    const protein = Math.max(proteinFloorG ?? 0, current.protein ?? 0)
    const fat = current.fat ?? 0
    return macrosForCalories(calories, protein, fat)
}

// ── Activity-based targets ───────────────────────────────────────────────────

/**
 * How much the day asks for. Deliberately three buckets: the difference between
 * a hard session and a very hard one is well inside the error bars of any
 * calorie figure, and pretending otherwise would invite precision that isn't
 * there.
 */
export const DAY_TYPES = ['hard', 'standard', 'rest'] as const
export type DayType = (typeof DAY_TYPES)[number]

export const DAY_TYPE_LABELS: Record<DayType, string> = {
    hard: 'Hard training',
    standard: 'Training',
    rest: 'Rest',
}

/** Default modifiers, in kcal, either side of the phase's baseline. */
export const DEFAULT_HARD_KCAL = 100
export const DEFAULT_REST_KCAL = 150

/**
 * Conditioning that reads as a hard day on its own. Cardio is the odd one out
 * deliberately — a steady half-hour is a training day, not a demanding one.
 */
const DEMANDING_CONDITIONING = new Set(['HIIT', 'Endurance'])

/**
 * Classify a date from what the fitness planner already has on it.
 *
 * Nutrition does not get its own training calendar — that would be a second
 * source of truth about the same week, and the two would drift within a month.
 * It reads the planner: two hard sessions in a day, or one demanding
 * conditioning session, is a hard day; a single ordinary session is a training
 * day; anything that leaves only mobility or recovery, or nothing at all, is
 * rest.
 *
 * A date with no fitness data at all returns null rather than 'rest' — the
 * distinction between "nothing planned" and "no planner" is exactly the
 * unknown-is-not-zero rule, and callers fall back to the flat baseline.
 */
export function classifyDay(
    date: string,
    entries: FitnessPlanEntry[],
    override?: DayType
): DayType | null {
    if (override) return override

    const onDay = entries.filter((e) => e.date === date)
    if (onDay.length === 0) return null

    const hard = onDay.filter((e) => isHardSession(e.kind))
    if (hard.length === 0) return 'rest'
    if (hard.length > 1) return 'hard'

    const only = hard[0]
    const category = only.session?.category
    if (category && DEMANDING_CONDITIONING.has(category)) return 'hard'
    return 'standard'
}

/**
 * The calorie shift a day type earns under a phase's strategy, or 0 when the
 * phase doesn't cycle. Signed, so it adds straight onto the baseline.
 */
export function activityModifier(
    phase: NutritionPhase | null,
    dayType: DayType | null
): number {
    if (!phase || phase.strategy?.type !== 'activity' || !dayType) return 0
    if (dayType === 'hard') return phase.strategy.hardKcal ?? DEFAULT_HARD_KCAL
    if (dayType === 'rest') return -(phase.strategy.restKcal ?? DEFAULT_REST_KCAL)
    return 0
}

export interface EffectiveTargets extends ResolvedTargets {
    /** How the day was classified, or null when there was nothing to classify it from. */
    dayType: DayType | null
    /** The calorie shift applied, signed. Zero on a flat phase. */
    modifier: number
    /** The targets before the modifier — what the phase prescribes on an average day. */
    baseGoals: MacroGoals | null
}

/**
 * The targets a day is actually held to: the phase's for that date, shifted by
 * how hard the day trains, with carbohydrate absorbing the shift.
 *
 * Wrapping `targetsFor` rather than changing it keeps the plain question — what
 * does this phase prescribe — answerable on its own, and means a phase that
 * doesn't cycle gets back precisely what it always got. `goals` is what to show;
 * `baseGoals` is what the phase says on average, which is the figure a weekly
 * total should be judged against.
 */
export function effectiveTargetsFor(
    date: string,
    phases: NutritionPhase[],
    settingsGoals?: MacroGoals | null,
    fitness: FitnessPlanEntry[] = [],
    override?: DayType
): EffectiveTargets {
    const resolved = targetsFor(date, phases, settingsGoals)
    const dayType = classifyDay(date, fitness, override)
    const modifier = resolved.source === 'phase' ? activityModifier(resolved.phase, dayType) : 0

    if (modifier === 0 || !resolved.goals?.calories) {
        return { ...resolved, dayType, modifier: 0, baseGoals: resolved.goals }
    }

    const base = resolved.goals
    const shifted = macrosForCalories(
        base.calories! + modifier,
        base.protein ?? 0,
        base.fat ?? 0
    )
    // Only the macros the phase actually set are reported back, so a phase that
    // targets calories alone doesn't sprout invented protein and fat figures.
    const goals: MacroGoals = { calories: shifted.calories }
    if (base.protein !== undefined) goals.protein = shifted.protein
    if (base.carbs !== undefined) goals.carbs = shifted.carbs
    if (base.fat !== undefined) goals.fat = shifted.fat

    return { ...resolved, goals: normGoals(goals), dayType, modifier, baseGoals: base }
}

/**
 * The protein a phase wants held, whatever its calories do: its floor, else
 * whatever its current target says. The one macro the adjustment engine is
 * never allowed to trade away.
 */
export function proteinFloorOf(phase: NutritionPhase | null): number | undefined {
    if (!phase) return undefined
    return phase.goal?.proteinFloorG ?? currentPhaseTargets(phase).protein
}
