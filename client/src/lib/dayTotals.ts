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
    let planned = { ...ZERO_MACROS }
    let estimated = false
    if (when !== 'past') {
        for (const e of entries) {
            if (e.status !== 'planned' || e.away) continue
            if (e.box) {
                const est = estimateFor(e)
                if (est) {
                    planned = addMacros(planned, est)
                    estimated = true
                }
            } else {
                planned = addMacros(planned, e.macros)
            }
        }
    }
    return { eaten, planned, total: addMacros(eaten, planned), estimated, when }
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
