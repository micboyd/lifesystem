import type { Macros, MacroGoals } from '../types'
import { type DayLine, addMacros, entryMacros, ZERO_MACROS } from './nutrition'
import { MIN_LOGGED_FRACTION, MIN_LOGGED_KCAL } from './nutritionAdjustment'

/**
 * A week read three ways — consumed, still planned, projected — against the
 * sum of its days' own targets.
 *
 * Averages carry their denominator. Consumed intake is averaged only over days
 * that are *complete*: on or before today, with at least half the day's target
 * logged (the same test adherence uses). A future day or a forgotten Tuesday is
 * unknown, not zero, and averaging it in would report a deficit that never
 * happened.
 */
export interface WeekTarget {
    calories: number
    protein: number
    carbs: number
    fat: number
    days: number
}

export interface WeekSummary {
    consumed: Macros
    stillPlanned: Macros
    projected: Macros
    /** Sum of the daily targets, and how many days had one. */
    target: WeekTarget | null
    /** Days counted as fully logged. */
    completeDays: number
    /** Mean consumed intake over the complete days, or null with none. */
    avgConsumed: Macros | null
    /** Days with any counted food on them, eaten or planned. */
    daysWithFood: number
    /** Mean projected intake over `daysWithFood`. */
    avgProjected: Macros | null
}

function divide(m: Macros, n: number): Macros {
    return { calories: m.calories / n, protein: m.protein / n, carbs: m.carbs / n, fat: m.fat / n }
}

export function weekSummary(
    entries: DayLine[],
    days: string[],
    goalsFor: (date: string) => MacroGoals | null,
    today: string
): WeekSummary {
    let consumed = { ...ZERO_MACROS }
    let stillPlanned = { ...ZERO_MACROS }
    let completeSum = { ...ZERO_MACROS }
    let completeDays = 0
    let daysWithFood = 0
    const target: WeekTarget = { calories: 0, protein: 0, carbs: 0, fat: 0, days: 0 }

    for (const date of days) {
        const dayEntries = entries.filter((e) => e.date === date)
        let eaten = { ...ZERO_MACROS }
        let pending = { ...ZERO_MACROS }
        for (const e of dayEntries) {
            if (e.status === 'eaten') eaten = addMacros(eaten, entryMacros(e))
            else if (e.status === 'planned') pending = addMacros(pending, entryMacros(e))
        }
        consumed = addMacros(consumed, eaten)
        stillPlanned = addMacros(stillPlanned, pending)
        if (eaten.calories > 0 || pending.calories > 0) daysWithFood++

        const goals = goalsFor(date)
        if (goals?.calories) {
            target.calories += goals.calories
            target.protein += goals.protein ?? 0
            target.carbs += goals.carbs ?? 0
            target.fat += goals.fat ?? 0
            target.days++
        }

        const floor = goals?.calories ? goals.calories * MIN_LOGGED_FRACTION : MIN_LOGGED_KCAL
        if (date <= today && eaten.calories >= floor) {
            completeDays++
            completeSum = addMacros(completeSum, eaten)
        }
    }

    const projected = addMacros(consumed, stillPlanned)
    return {
        consumed,
        stillPlanned,
        projected,
        target: target.days > 0 ? target : null,
        completeDays,
        avgConsumed: completeDays > 0 ? divide(completeSum, completeDays) : null,
        daysWithFood,
        avgProjected: daysWithFood > 0 ? divide(projected, daysWithFood) : null,
    }
}
