import type { FinanceGroup, FinanceRow } from '../types'

/** Delete scope for groups and recurring rows. */
export type DeleteMode = 'all' | 'onward' | 'month'

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
