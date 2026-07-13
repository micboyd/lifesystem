import { IFinanceRow, IPastAmount } from '../models/FinanceRow'

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
