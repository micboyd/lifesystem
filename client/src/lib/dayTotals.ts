import type { MacroGoals, Macros, MealPlanEntry } from '../types'
import { addMacros, sumEatenMacros, ZERO_MACROS } from './nutrition'

/**
 * One set of numbers for a day, always read against its target. What's been
 * eaten, plus — on today and days ahead — what's still planned, with box
 * notes at their estimated portion. A past day is what was eaten: anything
 * left planned there didn't happen.
 */
export interface DayTotals {
    eaten: Macros
    /** Still planned, estimates included. Zero on a past day. */
    planned: Macros
    /** eaten + planned — the figure shown against the target. */
    total: Macros
    /** Some of `planned` is a box note's estimate, so the total is approximate. */
    estimated: boolean
    /**
     * The whole day's plan: eaten plus everything still planned — on a past
     * day too, so it can be set against what was actually eaten.
     */
    plan: Macros
    /** Some of `plan` is a box note's estimate. */
    planEstimated: boolean
    when: 'past' | 'today' | 'future'
}

export function dayTotals(
    entries: MealPlanEntry[],
    estimateFor: (entry: MealPlanEntry) => Macros | null,
    date: string,
    today: string
): DayTotals {
    const when = date < today ? 'past' : date === today ? 'today' : 'future'
    const eaten = sumEatenMacros(entries)
    let pending = { ...ZERO_MACROS }
    let fromEstimate = false
    for (const e of entries) {
        if (e.status !== 'planned' || e.away) continue
        if (e.box) {
            const est = estimateFor(e)
            if (est) {
                pending = addMacros(pending, est)
                fromEstimate = true
            }
        } else {
            pending = addMacros(pending, e.macros)
        }
    }
    // A past day is what was eaten: anything left planned there didn't happen.
    const planned = when === 'past' ? { ...ZERO_MACROS } : pending
    return {
        eaten,
        planned,
        total: addMacros(eaten, planned),
        estimated: when !== 'past' && fromEstimate,
        plan: addMacros(eaten, pending),
        planEstimated: fromEstimate,
        when,
    }
}

/**
 * The week in one line: the average day's total against the average target,
 * over the days that have anything on them. Null with nothing planned.
 */
export function weekAverage(
    days: { totals: DayTotals; goals: MacroGoals | null }[]
): { calories: number; target: number | null; estimated: boolean } | null {
    const used = days.filter((d) => d.totals.total.calories > 0)
    if (used.length === 0) return null
    const calories = used.reduce((sum, d) => sum + d.totals.total.calories, 0) / used.length
    const targets = used.map((d) => d.goals?.calories ?? 0).filter((t) => t > 0)
    return {
        calories,
        target:
            targets.length === used.length
                ? targets.reduce((a, b) => a + b, 0) / targets.length
                : null,
        estimated: used.some((d) => d.totals.estimated),
    }
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

/** The week's numbers behind the planner's "Week's macros" panel. */
export interface WeekMacros {
    /** The average day, over the days with anything on them. */
    average: Macros
    /** The average target over those same days; a macro with no target on one is left out. */
    averageTarget: MacroGoals
    /** Eaten from Monday through today. */
    soFar: Macros
    /**
     * Where the week lands: each day's total (eaten, plus still planned on
     * today and ahead), with an empty day counted at its target.
     */
    onTrack: Macros
    /** The seven days' targets added up; a macro missing on any day is left out. */
    weekTarget: MacroGoals
    /** Some of the figures lean on a box note's estimate. */
    estimated: boolean
    /** Days with anything on them, and days with nothing (counted at target). */
    usedDays: number
    emptyDays: number
}

export function weekMacros(
    days: { totals: DayTotals; goals: MacroGoals | null }[]
): WeekMacros | null {
    const used = days.filter((d) => d.totals.total.calories > 0)
    if (used.length === 0) return null
    const empty = days.filter((d) => d.totals.total.calories <= 0)

    const sum = (rows: typeof days, pick: (d: (typeof days)[number]) => number) =>
        rows.reduce((s, d) => s + pick(d), 0)
    // A goal summed over rows — undefined when any row lacks it.
    const goalSum = (rows: typeof days, key: (typeof MACRO_KEYS)[number]) =>
        rows.every((d) => (d.goals?.[key] ?? 0) > 0) ? sum(rows, (d) => d.goals![key]!) : undefined

    const average = { ...ZERO_MACROS }
    const soFar = { ...ZERO_MACROS }
    const onTrack = { ...ZERO_MACROS }
    const averageTarget: MacroGoals = {}
    const weekTarget: MacroGoals = {}
    for (const key of MACRO_KEYS) {
        average[key] = sum(used, (d) => d.totals.total[key]) / used.length
        soFar[key] = sum(
            days.filter((d) => d.totals.when !== 'future'),
            (d) => d.totals.eaten[key]
        )
        onTrack[key] = sum(used, (d) => d.totals.total[key]) + sum(empty, (d) => d.goals?.[key] ?? 0)
        const usedTarget = goalSum(used, key)
        if (usedTarget !== undefined) averageTarget[key] = usedTarget / used.length
        const target = goalSum(days, key)
        if (target !== undefined) weekTarget[key] = target
    }
    return {
        average,
        averageTarget,
        soFar,
        onTrack,
        weekTarget,
        estimated: used.some((d) => d.totals.estimated),
        usedDays: used.length,
        emptyDays: empty.length,
    }
}
