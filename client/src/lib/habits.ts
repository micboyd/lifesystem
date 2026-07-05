import { addDays } from './calendar'
import type { HabitDef, HabitLog } from '../types'

/** Today's completion count plus a rolling consecutive-day streak. */
export interface HabitStreak {
    doneToday: number
    total: number
    streak: number
}

/**
 * Count back from `date`; an incomplete `date` doesn't break a streak that
 * ended the day before (so "today" can still be in progress).
 */
export function computeHabitStreak(
    habits: HabitDef[],
    logs: HabitLog[],
    date: string,
    windowDays = 30
): HabitStreak {
    const active = habits.filter((h) => h.active)
    if (active.length === 0) {
        return { doneToday: 0, total: 0, streak: 0 }
    }

    const completedOn = (d: string) =>
        new Set(logs.filter((l) => l.date === d && l.completed).map((l) => l.habit))
    const isPerfect = (d: string) => active.every((h) => completedOn(d).has(h._id))

    const doneToday = active.filter((h) => completedOn(date).has(h._id)).length

    let streak = 0
    let cursor = isPerfect(date) ? date : addDays(date, -1)
    for (let i = 0; i < windowDays && isPerfect(cursor); i++) {
        streak++
        cursor = addDays(cursor, -1)
    }

    return { doneToday, total: active.length, streak }
}
