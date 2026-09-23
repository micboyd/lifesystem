/** Day-counting maths for the Days Until page and dashboard widget. */

import { daysBetween, formatStartDate } from './daysSince'

/** Whole days from `todayKey` up to `targetDate` (both "YYYY-MM-DD"). Negative once it's passed. */
export function daysUntil(targetDate: string, todayKey: string): number {
    return daysBetween(todayKey, targetDate)
}

/** "12 Jun 2026" from a "YYYY-MM-DD" key. */
export const formatTargetDate = formatStartDate
