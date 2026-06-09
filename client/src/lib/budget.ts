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

export interface BudgetDay {
    /** Budget amount for the month (entry override, else the recurring amount). */
    monthlyAmount: number
    /** monthlyAmount spread evenly across the month. */
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
 * is the monthly amount divided evenly across the month; any under/overspend on
 * earlier days carries forward so today's allowance self-corrects.
 *
 * Single source of truth shared by the Budget widget and the dashboard insights.
 */
export function computeBudgetDay(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    date: string
): BudgetDay {
    const month = monthOf(date)
    const dayNum = dayNumOf(date)
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const totalDays = daysInMonth(month)

    const straightDailyRate = totalDays > 0 ? monthlyAmount / totalDays : 0
    const totalSpentBefore = rowSpends
        .filter((s) => s.date < date)
        .reduce((sum, s) => sum + s.amount, 0)
    const carry = (dayNum - 1) * straightDailyRate - totalSpentBefore
    const todaysAllowance = straightDailyRate + carry
    const spentToday = rowSpends.filter((s) => s.date === date).reduce((sum, s) => sum + s.amount, 0)
    const remaining = todaysAllowance - spentToday
    const totalSpentMonth = rowSpends.reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalSpentMonth

    return { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining }
}
