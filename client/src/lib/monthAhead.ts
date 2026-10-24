import type { StarlingSpendItem } from '../types'
import { buildMonthStatement, daysIn, isLumpy, type MonthStatement } from './monthStatement'
import { buildInsights, type Insight, type OlderMonth } from './statementInsights'
import { buildDoh, type DohLine } from './statementDoh'

/**
 * The start of a month, when there's little or nothing spent yet: what's coming
 * and how to play it. Bills due (from last month's pattern), a day-to-day budget
 * to match or beat last month, last month in a line, its doh moments, and the
 * one biggest idea to try. The page shows this for the first week, or any time
 * nothing has gone out yet.
 *
 * Pure.
 */

export const AHEAD_DAYS = 7
/** "A bit less than last month" for the stretch budget. */
const TRIM = 0.1

export interface BillDue {
    merchant: string
    amount: number
    /** Day of the month it went out last month. */
    day: number
    paid: boolean
}

export interface MonthAhead {
    bills: BillDue[]
    /** Still to go out (unpaid bills). */
    billsLeft: number
    /** Last month's day-to-day spend: everything bar bills, transfers and one-offs. */
    prevDayToDay: number
    /** Per day for the rest of this month, to match last month's day-to-day. */
    matchPerDay: number
    /** Per day to come in 10% under it, and what that saves. */
    trimPerDay: number
    trimSaving: number
    lastMonth: {
        total: number
        /** The month before it, when loaded, for "up/down on". */
        before: number | null
    }
    /** Last month's doh moments, biggest first. */
    lastDoh: { total: number; lines: DohLine[] }
    /** Last month's biggest saving idea. */
    tryThis: Insight | null
    /** Last month as a finished month, for the savings plan. */
    last: MonthStatement
    /** All of this month's bills, paid or not. */
    billsTotal: number
    /** Day-to-day already spent this month. */
    spentDayToDay: number
    /** Days left to spend in, counting today. */
    daysLeft: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const merchantKey = (t: StarlingSpendItem) => (t.merchant ?? 'Unknown').trim().toLowerCase()

/**
 * @param s this month's statement (current month)
 * @param items both months' payments (as given to buildMonthStatement)
 * @param older the month before last. Without it last month has nothing to be
 *   compared with, so there's no "try this" idea (everything would look new).
 */
export function buildMonthAhead(s: MonthStatement, items: StarlingSpendItem[], older?: OlderMonth): MonthAhead {
    const prevMonth = s.prev.month
    const prevAll = items.filter((t) => t.date.startsWith(prevMonth))
    const counted = s.categories.flatMap((c) => c.items)
    const paidNow = new Set(counted.map(merchantKey))

    // Bills: last month's lumpy payments, one per place, in date order.
    const seen = new Set<string>()
    const bills: BillDue[] = []
    for (const t of [...prevAll].sort((a, b) => (a.date < b.date ? -1 : 1))) {
        if (!isLumpy(t) || seen.has(merchantKey(t))) continue
        seen.add(merchantKey(t))
        bills.push({ merchant: t.merchant ?? 'Unknown', amount: t.amount, day: Number(t.date.slice(8, 10)), paid: paidNow.has(merchantKey(t)) })
    }
    const billsLeft = round2(bills.filter((b) => !b.paid).reduce((sum, b) => sum + b.amount, 0))

    // Day-to-day: what's left per day to match last month, and to beat it by 10%.
    const prevDayToDay = round2(prevAll.filter((t) => !isLumpy(t)).reduce((sum, t) => sum + t.amount, 0))
    const spentDayToDay = counted.filter((t) => !isLumpy(t)).reduce((sum, t) => sum + t.amount, 0)
    // Days still to spend in, counting today.
    const daysLeft = Math.max(1, s.daysInMonth - s.dayOfMonth + 1)
    const matchPerDay = round2(Math.max(0, prevDayToDay - spentDayToDay) / daysLeft)
    const trimPerDay = round2(Math.max(0, prevDayToDay * (1 - TRIM) - spentDayToDay) / daysLeft)

    // Last month, judged as a finished month.
    const lastDay = `${prevMonth}-${String(daysIn(prevMonth)).padStart(2, '0')}`
    const prevItems = older ? [...items, ...older.items] : items
    const last = buildMonthStatement(prevMonth, prevItems, prevItems, lastDay)
    const tryThis = older
        ? (buildInsights(last, prevItems, older.name)
              .filter((i) => i.tone === 'save' && (i.saving ?? 0) > 0)
              .sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0))[0] ?? null)
        : null

    return {
        bills,
        billsLeft,
        prevDayToDay,
        matchPerDay,
        trimPerDay,
        trimSaving: round2(prevDayToDay * TRIM),
        lastMonth: { total: last.total, before: older ? round2(older.items.filter((t) => t.date.startsWith(older.month)).reduce((a, t) => a + t.amount, 0)) : null },
        lastDoh: buildDoh(last.categories.flatMap((c) => c.items)),
        tryThis,
        last,
        billsTotal: round2(bills.reduce((sum, b) => sum + b.amount, 0)),
        spentDayToDay: round2(spentDayToDay),
        daysLeft,
    }
}
