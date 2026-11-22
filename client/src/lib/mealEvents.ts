import type { Event, MealType } from '../types'
import { MEAL_TYPES } from '../types'
import { eventCoversSlot } from './calendar'

/**
 * Calendar events against meal times. A meal slot sits in a part of the day —
 * breakfast in the morning, lunch in the afternoon, dinner in the evening — so
 * an event in that part (or one running all day) means that meal might not
 * happen as planned. Snacks fit around anything. Events marked "ignore planner
 * clashes" are left out, as on the fitness planner, and so are "Other" events
 * with no part of the day.
 */

/** The part of the day each meal slot falls in. Snacks have none. */
export const SLOT_PART: Record<MealType, 'morning' | 'afternoon' | 'evening' | null> = {
    breakfast: 'morning',
    lunch: 'afternoon',
    dinner: 'evening',
    snack: null,
}

const MAIN_SLOTS = MEAL_TYPES.filter((s) => SLOT_PART[s])

/**
 * The day's events over one meal slot. Snacks fit around anything — unless
 * events (one, or several back to back) take breakfast, lunch and dinner: then
 * the whole day is out, snacks too, and those events are theirs.
 */
export function eventsInMealSlot(events: Event[], date: string, slot: MealType): Event[] {
    const part = SLOT_PART[slot]
    if (part) return events.filter((e) => !e.ignoreClash && eventCoversSlot(e, date, part))
    const over = MAIN_SLOTS.map((s) => eventsInMealSlot(events, date, s))
    return over.every((l) => l.length > 0) ? [...new Set(over.flat())] : []
}

/** The main meal slots a day's events cover, in day order. */
export function mealSlotsTaken(events: Event[], date: string): MealType[] {
    return MAIN_SLOTS.filter((s) => eventsInMealSlot(events, date, s).length > 0)
}

/** The day's events that touch a meal time at all. */
export function eventsOverMeals(events: Event[], date: string): Event[] {
    return events.filter((e) => MEAL_TYPES.some((s) => eventsInMealSlot([e], date, s).length > 0))
}

/**
 * The day's calendar pill: which meals the events land on ("Lunch & dinner",
 * or "All meals" when breakfast, lunch and dinner are all taken) and by what.
 * Null when nothing touches a meal.
 */
export function mealDayPill(
    events: Event[],
    date: string,
    label: (slot: MealType) => string
): { when: string; what: string; full: boolean; events: Event[] } | null {
    const on = eventsOverMeals(events, date)
    if (on.length === 0) return null
    const slots = mealSlotsTaken(on, date)
    const full = slots.length === 3
    const when = full ? 'All meals' : slots.map((s, i) => (i === 0 ? label(s) : label(s).toLowerCase())).join(' & ')
    return { when, what: on.length === 1 ? on[0].title : `${on.length} events`, full, events: on }
}
