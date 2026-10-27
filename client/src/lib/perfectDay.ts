import type { MealPlanEntry, MealType, PerfectDaySelection } from '../types'

/**
 * Which things make a perfect day, and on which weekdays — chosen in
 * Profile → Perfect day, read by Your day. Anything never chosen counts every
 * day, so a new habit shows until it's switched off.
 */

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]

/** Monday first, as the app's weeks run. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export const mealKey = (slot: MealType) => `meal:${slot}`
export const habitKey = (habitId: string) => `habit:${habitId}`

/** The weekdays a thing counts on. */
export function daysFor(selection: PerfectDaySelection | undefined, key: string): number[] {
    return selection?.items.find((i) => i.key === key)?.days ?? ALL_DAYS
}

export function countsOn(selection: PerfectDaySelection | undefined, key: string, weekday: number): boolean {
    return daysFor(selection, key).includes(weekday)
}

/** Whether a thing was chosen at all — the weigh-in shows on its days without the "weighs in" check. */
export function isChosen(selection: PerfectDaySelection | undefined, key: string): boolean {
    return !!selection?.items.some((i) => i.key === key)
}

export function normFood(name: string): string {
    return name.trim().toLowerCase()
}

/** A meal that never counts: its name is skipped, or every food on its plate is. */
export function isSkippedMeal(selection: PerfectDaySelection | undefined, m: MealPlanEntry): boolean {
    const skip = selection?.skipFoods
    if (!skip?.length) return false
    if (m.plate?.length) return m.plate.every((l) => skip.includes(normFood(l.name)))
    return skip.includes(normFood(m.name))
}
