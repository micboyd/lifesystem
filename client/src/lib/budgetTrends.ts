import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../types'
import { rowVisibleInMonth, recurringAmountForMonth } from './finance'
import { MONTHS } from './calendar'

export interface MonthBudgetTrend {
    /** "YYYY-MM" */
    month: string
    /** "Jun" */
    label: string
    /** Total monthly target across daily-tracked budgeted rows active that month. */
    budget: number
    /** Total logged spend for those rows that month (excluded days left out). */
    spent: number
    /** budget − spent (positive = under, negative = over). */
    remaining: number
    over: boolean
}

/** Per-month data fetched for one month of the trend. */
export interface MonthInputs {
    month: string
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excludedDates: Set<string>
}

/**
 * Budget-vs-actual for one month across the daily-tracked budgeted rows. The
 * target is each row's month amount (entry override, else recurring); spend is
 * the sum of logged transactions on non-excluded days — identical scope to the
 * Budgets cards and Daily Log so the trend can't drift from them.
 */
export function monthTrend(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    { month, entries, spends, excludedDates }: MonthInputs
): MonthBudgetTrend {
    const dailyRows = rows.filter(
        (r) =>
            r.budgeted &&
            (r.budgetType === 'daily' || r.budgetType === 'weekly') &&
            rowVisibleInMonth(
                r,
                month,
                groups.find((g) => g._id === r.group)
            )
    )
    const rowIds = new Set(dailyRows.map((r) => r._id))

    const budget = dailyRows.reduce((sum, r) => {
        const entry = entries.find((e) => e.row === r._id)
        return sum + (entry?.amount ?? recurringAmountForMonth(r, month) ?? 0)
    }, 0)

    const spent = spends
        .filter((s) => rowIds.has(s.row) && !excludedDates.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)

    const m = Number(month.slice(5, 7)) - 1
    return {
        month,
        label: MONTHS[m].slice(0, 3),
        budget,
        spent,
        remaining: budget - spent,
        over: spent > budget,
    }
}
