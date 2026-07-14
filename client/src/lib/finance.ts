import type { FinanceGroup, FinanceRow } from '../types'

/** Delete scope for groups and recurring rows. */
export type DeleteMode = 'all' | 'onward' | 'month'

/** Scope for recurring-amount edits: every month, or only from a month onwards. */
export type AmountScope = 'all' | 'onward'

/**
 * The recurring amount a row plans for a given month. `recurringAmount` is the
 * current value; `pastAmounts` boundaries record superseded values ("from this
 * month onwards" edits) — the first boundary strictly after `month` holds the
 * amount that month used. Per-month entry overrides still take precedence at
 * call sites.
 */
export function recurringAmountForMonth(row: FinanceRow, month: string): number | undefined {
    if (row.pastAmounts?.length) {
        const boundary = [...row.pastAmounts]
            .sort((a, b) => (a.beforeMonth < b.beforeMonth ? -1 : 1))
            .find((p) => month < p.beforeMonth)
        if (boundary) return boundary.amount
    }
    return row.recurringAmount
}

/** Shift a "YYYY-MM" string by a number of months. */
export function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface Lifecycle {
    startMonth?: string | null
    endMonth?: string | null
    skipMonths?: string[]
}

/**
 * The single source of truth for month-scoping. An item is visible in `month`
 * when it falls inside its [startMonth, endMonth] window and the month hasn't
 * been explicitly skipped. Absent bounds mean "since forever" / "open-ended",
 * so legacy records with none of these fields are visible everywhere.
 */
export function visibleInMonth(item: Lifecycle, month: string): boolean {
    if (item.startMonth && month < item.startMonth) return false
    if (item.endMonth && month > item.endMonth) return false
    if (item.skipMonths?.includes(month)) return false
    return true
}

export function groupVisibleInMonth(group: FinanceGroup, month: string): boolean {
    return visibleInMonth(group, month)
}

/**
 * Row visibility for a month. One-time rows are pinned to their own month;
 * recurring rows use the lifecycle window. A row is only visible when its
 * parent group is also visible that month (so hiding a group hides its rows
 * in row-only consumers like the dashboard and Budgets).
 */
export function rowVisibleInMonth(row: FinanceRow, month: string, group?: FinanceGroup): boolean {
    if (group && !groupVisibleInMonth(group, month)) return false
    if (row.recurring === false) {
        const rowMonth = row.month ?? row.createdAt.slice(0, 7)
        return rowMonth === month
    }
    return visibleInMonth(row, month)
}
