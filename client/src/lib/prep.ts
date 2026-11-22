import type { Meal, MealPlanEntry, PrepRange } from '../types'
import { addDays } from './calendar'

/**
 * Prep: the days you're cooking for, read off the planner. Every meal still to
 * eat in those days is counted — split into what's batch-cooked (portioned
 * into boxes in the Cook step) and what's made fresh on the day. Meals added by
 * hand go on top. Eaten, skipped and past meals, away notes and one-off quick
 * adds aren't counted.
 */

/** Cooked ahead and portioned into boxes — set per meal; a tray is, unless it says not. */
export const isBatch = (m: Pick<Meal, 'batchCook' | 'batchOf'>) => m.batchCook ?? (m.batchOf ?? 0) > 1

export interface PrepRow {
    meal: Meal
    /** Times planned in the days (boxes, for a tray). */
    planned: number
    /** Added by hand on top. */
    extra: number
    /** The days it's planned on, in order. */
    dates: string[]
    batch: boolean
}

export interface Prep {
    batch: PrepRow[]
    fresh: PrepRow[]
    left: { past: number; done: number; noMeal: number }
}

export function prepFor(
    entries: MealPlanEntry[],
    mealsById: Map<string, Meal>,
    range: Pick<PrepRange, 'from' | 'to' | 'extras'>,
    today: string
): Prep {
    const rows = new Map<string, PrepRow>()
    const row = (meal: Meal) => {
        let r = rows.get(meal._id)
        if (!r) {
            r = { meal, planned: 0, extra: 0, dates: [], batch: isBatch(meal) }
            rows.set(meal._id, r)
        }
        return r
    }
    const left = { past: 0, done: 0, noMeal: 0 }
    for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
        if (e.away || e.date < range.from || e.date > range.to) continue
        if (e.status !== 'planned') {
            left.done++
            continue
        }
        if (e.date < today) {
            left.past++
            continue
        }
        const meal = e.meal ? mealsById.get(e.meal) : undefined
        if (!meal) {
            left.noMeal++
            continue
        }
        const r = row(meal)
        r.planned++
        if (!r.dates.includes(e.date)) r.dates.push(e.date)
    }
    for (const x of range.extras) {
        const meal = mealsById.get(x.meal)
        if (meal && x.count > 0) row(meal).extra += x.count
    }
    const all = [...rows.values()].sort(
        (a, b) => b.planned + b.extra - (a.planned + a.extra) || a.meal.name.localeCompare(b.meal.name)
    )
    return { batch: all.filter((r) => r.batch), fresh: all.filter((r) => !r.batch), left }
}

/** What the shopping list's meals should be: every row, planned and extra together (max 99). */
export const prepMeals = (p: Prep) =>
    [...p.batch, ...p.fresh]
        .map((r) => ({ id: r.meal._id, count: Math.min(99, r.planned + r.extra) }))
        .filter((m) => m.count > 0)

/** Quick picks for the days, from today. The week runs Monday to Sunday. */
export function prepPresets(today: string): { label: string; from: string; to: string }[] {
    const dow = (new Date(`${today}T00:00:00`).getDay() + 6) % 7 // Mon 0 … Sun 6
    const sunday = addDays(today, 6 - dow)
    return [
        { label: 'Next 3 days', from: today, to: addDays(today, 2) },
        { label: 'Rest of this week', from: today, to: sunday },
        { label: 'Next week', from: addDays(sunday, 1), to: addDays(sunday, 7) },
    ]
}

/** "Mon 30 Nov". */
export const dayShort = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

/** "Mon, Tue, Thu" — or "Mon 30 Nov, Mon 7 Dec" when the days span more than a week. */
export function daysLabel(dates: string[]): string {
    const wide = dates.length > 1 && dates[dates.length - 1] > addDays(dates[0], 6)
    return dates
        .map((d) =>
            wide ? dayShort(d) : new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
        )
        .join(', ')
}
