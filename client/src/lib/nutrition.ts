import type { Macros, MacroGoals, MealPlanEntry, NutritionPhase } from '../types'

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

/** Where a day's targets came from — worth saying out loud in the UI. */
export type TargetSource = 'phase' | 'settings' | 'none'

export interface ResolvedTargets {
    goals: MacroGoals | null
    source: TargetSource
    /** The phase that supplied them, when one did. */
    phase: NutritionPhase | null
}

/**
 * The targets a given day is judged against: its phase's, falling back to the
 * standing macro goals. A cut's numbers only mean anything if the day inside the
 * cut is actually measured against them.
 */
export function targetsFor(
    date: string,
    phases: NutritionPhase[],
    settingsGoals?: MacroGoals | null
): ResolvedTargets {
    const phase = phaseFor(date, phases)
    const phaseGoals = normGoals(phase?.targets)
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
