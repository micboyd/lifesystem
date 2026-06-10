import type { FinanceRow, FinanceEntry, BudgetSpend } from '../types'

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthOf(date: string): string {
    return date.slice(0, 7)
}

/** Day-of-month number from a "YYYY-MM-DD" string. */
export function dayNumOf(date: string): number {
    return Number(date.split('-')[2])
}

/** Number of days in a "YYYY-MM" month. */
export function daysInMonth(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0).getDate()
}

/** "YYYY-MM" + day number → "YYYY-MM-DD". */
function dateKey(month: string, day: number): string {
    return `${month}-${String(day).padStart(2, '0')}`
}

/**
 * Days in `month` that aren't excluded. Excluded days (work trips, holidays)
 * carry no allowance, so the monthly amount is spread across the remaining days.
 */
export function activeDaysInMonth(month: string, excluded: Set<string>): number {
    const total = daysInMonth(month)
    let n = 0
    for (let d = 1; d <= total; d++) {
        if (!excluded.has(dateKey(month, d))) n++
    }
    return n
}

/** Count of non-excluded days strictly before `date` within its month. */
function activeDaysBefore(date: string, excluded: Set<string>): number {
    const month = monthOf(date)
    const dayNum = dayNumOf(date)
    let n = 0
    for (let d = 1; d < dayNum; d++) {
        if (!excluded.has(dateKey(month, d))) n++
    }
    return n
}

export interface BudgetDay {
    /** Budget amount for the month (entry override, else the recurring amount). */
    monthlyAmount: number
    /** monthlyAmount spread evenly across the month's active (non-excluded) days. */
    straightDailyRate: number
    /** Unspent (positive) or overspent (negative) running balance carried into today. */
    carry: number
    /** Amount logged against this row today. */
    spentToday: number
    /** What's left for today after carry and today's spend. */
    remaining: number
    /** What's left for the whole month. */
    monthlyRemaining: number
}

/**
 * Daily-budget maths for a single row on a given date. The "straight daily rate"
 * is the monthly amount divided evenly across the month's active days; any
 * under/overspend on earlier active days carries forward so today's allowance
 * self-corrects. Excluded days carry no allowance and their spend is left out of
 * the running totals, so the figure stays identical to the Daily Log calendar.
 *
 * Single source of truth for every budget surface (Budgets, Daily Log, the
 * dashboard widget, and the insights strip). Pass the month's excluded dates so
 * all surfaces agree; omit them and it behaves as a plain even split.
 */
export function computeBudgetDay(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    date: string,
    excluded: Set<string> = new Set()
): BudgetDay {
    const month = monthOf(date)
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const totalActiveDays = activeDaysInMonth(month, excluded)
    const straightDailyRate = totalActiveDays > 0 ? monthlyAmount / totalActiveDays : 0

    const spentToday = rowSpends
        .filter((s) => s.date === date)
        .reduce((sum, s) => sum + s.amount, 0)
    // Spend on excluded days sits outside the budget, so it never counts against it.
    const totalSpentMonth = rowSpends
        .filter((s) => !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalSpentMonth

    // Excluded days have no allowance of their own.
    if (excluded.has(date)) {
        return {
            monthlyAmount,
            straightDailyRate: 0,
            carry: 0,
            spentToday,
            remaining: 0,
            monthlyRemaining,
        }
    }

    const totalSpentBefore = rowSpends
        .filter((s) => s.date < date && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const carry = activeDaysBefore(date, excluded) * straightDailyRate - totalSpentBefore
    const todaysAllowance = straightDailyRate + carry
    const remaining = todaysAllowance - spentToday

    return { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining }
}
