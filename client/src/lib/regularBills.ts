import type { StarlingSpendItem } from '../types'
import { shiftMonth } from './monthStatement'

/**
 * Regular bills: the direct debits and standing orders the bank shows going out,
 * last month and this month so far. No guessing from names, amounts or dates —
 * if the bank didn't take it as a direct debit or standing order, it isn't here.
 *
 * Pure.
 */

export const BILL_SOURCES = new Set(['DIRECT_DEBIT', 'STANDING_ORDER'])

export interface RegularBill {
    name: string
    /** This month's amount once paid, otherwise last month's. */
    amount: number
    /** Day of the month: this month's once paid, otherwise last month's. */
    day: number
    kind: 'Direct debit' | 'Standing order'
    paid: boolean
}

export interface RegularBills {
    bills: RegularBill[]
    /** Every bill in the list, paid or not. */
    total: number
    paid: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const key = (t: StarlingSpendItem) => (t.merchant ?? 'Unknown').trim().toLowerCase()

/**
 * @param items money out covering at least last month and this month
 * @param month this month, YYYY-MM
 * @param asOf the last day counted this month, YYYY-MM-DD
 */
export function regularBills(items: StarlingSpendItem[], month: string, asOf: string): RegularBills {
    const prev = shiftMonth(month, -1)
    const byName = new Map<string, { last?: StarlingSpendItem; now?: StarlingSpendItem }>()
    const sorted = [...items].sort((a, b) => (a.time < b.time ? -1 : 1))
    for (const t of sorted) {
        if (t.direction === 'IN' || !BILL_SOURCES.has(t.source ?? '')) continue
        const isNow = t.date.startsWith(month) && t.date <= asOf
        if (!isNow && !t.date.startsWith(prev)) continue
        const entry = byName.get(key(t)) ?? {}
        // Latest wins, so a bill taken twice in a month shows its newest amount.
        if (isNow) entry.now = t
        else entry.last = t
        byName.set(key(t), entry)
    }
    const bills = [...byName.values()]
        .map(({ last, now }): RegularBill => {
            const t = (now ?? last)!
            return {
                name: t.merchant ?? 'Unknown',
                amount: t.amount,
                day: Number(t.date.slice(8, 10)),
                kind: t.source === 'STANDING_ORDER' ? 'Standing order' : 'Direct debit',
                paid: !!now,
            }
        })
        .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name))
    return {
        bills,
        total: round2(bills.reduce((s, b) => s + b.amount, 0)),
        paid: round2(bills.filter((b) => b.paid).reduce((s, b) => s + b.amount, 0)),
    }
}
