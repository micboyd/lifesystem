import type {
    Macros,
    MacroGoals,
    MealPlanEntry,
    NutritionPhase,
    PhaseAdjustment,
} from '../types'

/**
 * Shared reading of the meal plan.
 *
 * The planner, the dashboard widget and the day view all have to agree on three
 * things: what a plan entry contributes, whether it counts, and which target the
 * day is judged against. They used to answer the first two separately and the
 * third not at all, which is how the same week could total differently in two
 * places. One copy here, imported everywhere.
 */

export const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

/**
 * The macros an entry contributes: its recipe's per-serving figures (or its own,
 * if off-plan) multiplied by the portion on the plate. `servings` is absent on
 * entries written before portions existed, so it falls back to one.
 */
export function entryMacros(entry: MealPlanEntry): Macros {
    const base = entry.meal?.macros ?? entry.adhoc?.macros ?? ZERO_MACROS
    const n = entry.servings ?? 1
    if (n === 1) return base
    return {
        calories: base.calories * n,
        protein: base.protein * n,
        carbs: base.carbs * n,
        fat: base.fat * n,
    }
}

/** What to call an entry — the recipe's name, or the off-plan label. */
export function entryName(entry: MealPlanEntry): string {
    return entry.meal?.name ?? entry.adhoc?.name ?? 'Unknown'
}

/**
 * Whether an entry counts toward a day's total. Skipped food doesn't: the whole
 * point of marking it is to take it back out of the tally.
 */
export function isCounted(entry: MealPlanEntry): boolean {
    return entry.status !== 'skipped'
}

/** Add two macro sets. */
export function addMacros(a: Macros, b: Macros): Macros {
    return {
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        carbs: a.carbs + b.carbs,
        fat: a.fat + b.fat,
    }
}

/**
 * Tally macros across entries, ignoring anything skipped. With everything still
 * 'planned' this is the plan; once the day is marked up it's what was eaten.
 */
export function sumMacros(entries: MealPlanEntry[]): Macros {
    return entries.filter(isCounted).reduce((acc, e) => addMacros(acc, entryMacros(e)), {
        ...ZERO_MACROS,
    })
}

/** Tally only what's been marked eaten — the figure that's actually true. */
export function sumEatenMacros(entries: MealPlanEntry[]): Macros {
    return entries
        .filter((e) => e.status === 'eaten')
        .reduce((acc, e) => addMacros(acc, entryMacros(e)), { ...ZERO_MACROS })
}

/**
 * Tally what's planned but not yet settled either way — the rest of the day, if
 * it goes as written. Kept apart from the eaten total because at nine in the
 * morning the two say very different things.
 */
export function sumPendingMacros(entries: MealPlanEntry[]): Macros {
    return entries
        .filter((e) => e.status === 'planned')
        .reduce((acc, e) => addMacros(acc, entryMacros(e)), { ...ZERO_MACROS })
}

/**
 * Reduce raw macro goals to only the fields with a positive target, returning
 * null when none are set — so callers can treat "no goals" as a single check.
 */
export function normGoals(goals?: MacroGoals | null): MacroGoals | null {
    if (!goals) return null
    const g: MacroGoals = {}
    if (goals.calories && goals.calories > 0) g.calories = goals.calories
    if (goals.protein && goals.protein > 0) g.protein = goals.protein
    if (goals.carbs && goals.carbs > 0) g.carbs = goals.carbs
    if (goals.fat && goals.fat > 0) g.fat = goals.fat
    return Object.keys(g).length ? g : null
}

/**
 * The phase covering a date, or null. Phases shouldn't overlap, but nothing
 * stops them, so the latest-starting match wins — editing a phase by laying a
 * new one over the tail of the old one is the obvious thing to try, and this
 * makes it behave the way you'd expect.
 */
export function phaseFor(date: string, phases: NutritionPhase[]): NutritionPhase | null {
    let best: NutritionPhase | null = null
    for (const p of phases) {
        if (date < p.startDate || date > p.endDate) continue
        if (!best || p.startDate > best.startDate) best = p
    }
    return best
}

/**
 * The targets a phase was prescribing on a given date.
 *
 * A long phase is not one prescription. `targets` is the opening set and every
 * later revision is dated, so the answer depends on when you ask: lowering
 * calories in January must not retroactively rewrite what December was measured
 * against, or every adherence figure older than the change silently becomes a
 * comparison against a target that didn't exist yet. The latest revision
 * effective on or before `date` wins; before the first one, the opening set does.
 *
 * Phases with no revisions — which is all of them until one is accepted — return
 * `targets` unchanged, so this costs existing data nothing.
 */
export function phaseTargetsOn(phase: NutritionPhase, date: string): MacroGoals {
    let best: PhaseAdjustment | null = null
    for (const a of phase.adjustments ?? []) {
        if (a.effectiveFrom > date) continue
        if (!best || a.effectiveFrom > best.effectiveFrom) best = a
    }
    return best ? best.targets : phase.targets
}

/**
 * The targets a phase is prescribing now — the last revision, or the opening
 * set. The figure a recommendation is measured against and adjusts from.
 */
export function currentPhaseTargets(phase: NutritionPhase): MacroGoals {
    const list = phase.adjustments ?? []
    return list.length > 0 ? list[list.length - 1].targets : phase.targets
}

/** Where a day's targets came from — worth saying out loud in the UI. */
export type TargetSource = 'phase' | 'settings' | 'none'

export interface ResolvedTargets {
    goals: MacroGoals | null
    source: TargetSource
    /** The phase that supplied them, when one did. */
    phase: NutritionPhase | null
}

/**
 * The targets a given day is judged against: its phase's *as they stood on that
 * day*, falling back to the standing macro goals. A cut's numbers only mean
 * anything if the day inside the cut is actually measured against them.
 */
export function targetsFor(
    date: string,
    phases: NutritionPhase[],
    settingsGoals?: MacroGoals | null
): ResolvedTargets {
    const phase = phaseFor(date, phases)
    const phaseGoals = phase ? normGoals(phaseTargetsOn(phase, date)) : null
    if (phaseGoals) return { goals: phaseGoals, source: 'phase', phase }

    const fallback = normGoals(settingsGoals)
    return {
        goals: fallback,
        source: fallback ? 'settings' : 'none',
        // Still report the phase even when it set no targets — the day is inside
        // a cut either way, and the mode drives how the numbers are coloured.
        phase,
    }
}

// ── Choosing a meal ──────────────────────────────────────────────────────────

/**
 * Protein per 100 kcal — the one number that says whether a meal helps a cut.
 *
 * Absolute protein flatters big meals: 40 g in a 900 kcal plate is a worse deal
 * on a deficit than 30 g in 350 kcal, and only the density says so. Null for a
 * meal with no calories to divide by.
 */
export function proteinDensity(macros: Macros): number | null {
    if (!macros.calories || macros.calories <= 0) return null
    return (macros.protein / macros.calories) * 100
}

/** Above this, a meal is doing real work for a cut's protein floor. */
export const HIGH_PROTEIN_DENSITY = 10

/** A short, factual label for how a meal sits against what's left of the day. */
export type MealFitLabel = 'high-protein' | 'fits' | 'large' | 'light'

export const MEAL_FIT_LABELS: Record<MealFitLabel, string> = {
    'high-protein': 'High protein',
    fits: 'Fits what’s left',
    large: 'Large meal',
    light: 'Light meal',
}

/**
 * How a meal reads against the calories and protein still unspent today.
 *
 * Deliberately descriptive rather than prescriptive: no meal is recommended or
 * discouraged, and nothing here calls food good or bad. It answers "will this
 * fit" and "is this protein-dense", which are the two things worth knowing at
 * the moment of choosing, and leaves the choice alone.
 *
 * `remaining` may be null — with no target set there is nothing to fit into, and
 * only the density label survives.
 */
export function mealFit(
    macros: Macros,
    remaining: { calories?: number; protein?: number } | null
): MealFitLabel[] {
    const labels: MealFitLabel[] = []

    const density = proteinDensity(macros)
    if (density !== null && density >= HIGH_PROTEIN_DENSITY) labels.push('high-protein')

    const left = remaining?.calories
    if (left !== undefined && left > 0) {
        // "Fits" means it lands inside what's left without finishing it off —
        // a meal that uses the last calorie fits arithmetically and not in practice.
        if (macros.calories <= left * 0.9) labels.push('fits')
        else if (macros.calories > left) labels.push('large')
    }

    if (macros.calories > 0 && macros.calories < 250) labels.push('light')

    return labels
}
