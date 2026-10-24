import { IFinanceRow, IPastAmount, IPastWeeklyAmount } from '../models/FinanceRow'

/**
 * The recurring amount a row plans for a given month. `recurringAmount` is the
 * current value; `pastAmounts` boundaries record superseded values — the first
 * boundary strictly after `month` (ascending) holds the amount that month used.
 */
export function recurringAmountForMonth(
    row: Pick<IFinanceRow, 'recurringAmount'> & { pastAmounts?: IPastAmount[] },
    month: string
): number | undefined {
    const past = row.pastAmounts
    if (past?.length) {
        const boundary = [...past]
            .sort((a, b) => (a.beforeMonth < b.beforeMonth ? -1 : 1))
            .find((p) => month < p.beforeMonth)
        if (boundary) return boundary.amount
    }
    return row.recurringAmount
}

/** The weekly amount a row budgets for the week starting `weekStart` (a Monday). */
export function weeklyAmountForWeek(
    row: Pick<IFinanceRow, 'weeklyAmount'> & { pastWeeklyAmounts?: IPastWeeklyAmount[] },
    weekStart: string
): number {
    const past = row.pastWeeklyAmounts
    if (past?.length) {
        const boundary = [...past]
            .sort((a, b) => (a.beforeWeek < b.beforeWeek ? -1 : 1))
            .find((p) => weekStart < p.beforeWeek)
        if (boundary) return boundary.amount
    }
    return row.weeklyAmount ?? 0
}

/** Average-month equivalent of a weekly amount (weekly × 52 ÷ 12), to the penny. */
export function monthlyFromWeekly(weekly: number): number {
    return Math.round(((weekly * 52) / 12) * 100) / 100
}

/** A "YYYY-MM-DD" that is a real Monday. */
export function isMonday(v: unknown): v is string {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
    const d = new Date(`${v}T00:00:00`)
    return !Number.isNaN(d.getTime()) && d.getDay() === 1
}
