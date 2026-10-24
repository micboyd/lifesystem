import type { StarlingSpendItem } from '../types'
import { isLumpy, type MonthStatement } from './monthStatement'

/**
 * How the savings goal is going, any day of the month.
 *
 * The goal is kept by spending less day-to-day than last month (bills are what
 * they are), the same rule the start-of-month plan uses. So progress is:
 * last month's day-to-day − where this month's day-to-day is heading.
 *
 * Pure.
 */

export interface GoalProgress {
    goal: number
    /** Day-to-day for the month that keeps the goal. */
    budget: number
    /** Day-to-day spent so far. */
    spent: number
    /** Where day-to-day is heading by month end (actual once it's over). */
    heading: number
    /** What you're on course to keep: last month's day-to-day − heading. */
    onCourseToKeep: number
    /** Kept so far against the budget's pace: positive is ahead. */
    aheadBy: number
    /** Per day from today that still hits the goal (0 once the budget's gone). */
    perDayToHit: number
    daysLeft: number
    status: 'ahead' | 'on-track' | 'behind' | 'missed' | 'kept'
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * @param s the month's statement
 * @param prevItems last month's payments (the list given to buildMonthStatement)
 * @param goal £ to keep back
 */
export function goalProgress(s: MonthStatement, prevItems: StarlingSpendItem[], goal: number): GoalProgress {
    const prevDayToDay = prevItems
        .filter((t) => t.date.startsWith(s.prev.month) && !isLumpy(t))
        .reduce((sum, t) => sum + t.amount, 0)
    const spent = s.categories.flatMap((c) => c.items).filter((t) => !isLumpy(t)).reduce((sum, t) => sum + t.amount, 0)
    const budget = Math.max(0, prevDayToDay - goal)
    const daysLeft = s.isCurrent ? s.daysInMonth - s.dayOfMonth : 0
    // Day-to-day still to come at the forecast's rate (which leans on last month early on).
    const heading = s.forecast ? spent + s.forecast.dayToDayRest : spent
    const onCourseToKeep = prevDayToDay - heading
    // Where spending "should" be by today for the budget to hold.
    const pace = (budget * s.dayOfMonth) / s.daysInMonth
    const perDayToHit = daysLeft > 0 ? Math.max(0, budget - spent) / daysLeft : 0

    let status: GoalProgress['status']
    if (!s.isCurrent) status = onCourseToKeep >= goal ? 'kept' : 'missed'
    else if (spent > budget) status = 'missed'
    else if (onCourseToKeep >= goal * 1.1) status = 'ahead'
    else if (onCourseToKeep >= goal * 0.9) status = 'on-track'
    else status = 'behind'

    return {
        goal,
        budget: round2(budget),
        spent: round2(spent),
        heading: round2(heading),
        onCourseToKeep: round2(onCourseToKeep),
        aheadBy: round2(pace - spent),
        perDayToHit: round2(perDayToHit),
        daysLeft,
        status,
    }
}
