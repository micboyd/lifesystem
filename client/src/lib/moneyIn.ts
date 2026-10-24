import type { StarlingSpendItem } from '../types'

/**
 * Money coming in: what arrived, where from, and how it sets against what went
 * out. Money moved between your own spaces never shows up here (the server
 * drops it), so this is real income.
 *
 * Sorted into:
 * - Pay: payroll-style credits (BACS/CHAPS, or a business paying you).
 * - Refunds: card payments coming back.
 * - From people: a mate paying you back, splitting a bill.
 * - Government: HMRC, DWP, council refunds.
 * - Interest, and anything else.
 *
 * Pure.
 */

export type IncomeKind = 'pay' | 'refunds' | 'people' | 'government' | 'interest' | 'other'

export const INCOME_LABEL: Record<IncomeKind, { label: string; icon: string }> = {
    pay: { label: 'Pay', icon: 'fa-briefcase' },
    refunds: { label: 'Refunds', icon: 'fa-rotate-left' },
    people: { label: 'From people', icon: 'fa-user-group' },
    government: { label: 'Government', icon: 'fa-landmark' },
    interest: { label: 'Interest', icon: 'fa-percent' },
    other: { label: 'Other', icon: 'fa-circle-plus' },
}

const BUSINESS = /\b(ltd|limited|plc|llp|inc|group|payroll|salary|wages|pay\b|services|solutions|consulting|holdings|uk)\b/i
const PAYROLL = /\b(payroll|salary|wages)\b/i
const SMALL_BUSINESS_CREDIT = 100
const GOVERNMENT = /\b(hmrc|dwp|universal credit|council|nhs|student loans?|slc|gov)\b/i
const PAYROLL_SOURCES = new Set(['DIRECT_CREDIT', 'BACS', 'CHAPS', 'BRITISH_BUSINESS_DEPOSIT', 'NOSTRO_DEPOSIT'])
const CARD_SOURCES = new Set(['MASTER_CARD', 'VISA', 'MAESTRO'])

export function incomeKind(t: StarlingSpendItem): IncomeKind {
    const name = t.merchant ?? ''
    const source = t.source ?? ''
    if (source === 'INTEREST_PAYMENT' || /\binterest\b/i.test(name)) return 'interest'
    if (GOVERNMENT.test(name)) return 'government'
    if (CARD_SOURCES.has(source)) return 'refunds'
    if (PAYROLL_SOURCES.has(source) || PAYROLL.test(name)) return 'pay'
    // A business sending a small sum is money back (a refund, cashback), not wages.
    if (BUSINESS.test(name)) return t.amount < SMALL_BUSINESS_CREDIT ? 'refunds' : 'pay'
    if (source.startsWith('FASTER_PAYMENTS') || source === 'ON_US_PAY_ME') return 'people'
    return 'other'
}

export interface IncomeGroup {
    kind: IncomeKind
    total: number
    items: StarlingSpendItem[]
}

export interface MoneyIn {
    total: number
    /** Last month up to the same day, when known. */
    prevTotal: number
    groups: IncomeGroup[]
    /** Money in minus money out so far: what the month has actually netted. */
    net: number
    /** Biggest single payment in (usually pay). */
    biggest: StarlingSpendItem | null
    /** When pay landed last month, if it hasn't yet this month: "pay due around the 25th". */
    payExpected: { day: number; amount: number } | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * @param month YYYY-MM being looked at
 * @param incoming money in across this month and last (anything outside is ignored)
 * @param asOf the last day counted this month, YYYY-MM-DD
 * @param prevMonth YYYY-MM before it
 * @param spent money out this month so far
 */
export function buildMoneyIn(month: string, incoming: StarlingSpendItem[], asOf: string, prevMonth: string, spent: number): MoneyIn {
    const now = incoming.filter((t) => t.date.startsWith(month) && t.date <= asOf)
    const dayOfMonth = Number(asOf.slice(8, 10))
    const prevCut = `${prevMonth}-${String(dayOfMonth).padStart(2, '0')}`
    const prev = incoming.filter((t) => t.date.startsWith(prevMonth))
    const total = round2(now.reduce((s, t) => s + t.amount, 0))

    const by = new Map<IncomeKind, IncomeGroup>()
    for (const t of now) {
        const kind = incomeKind(t)
        const g = by.get(kind) ?? { kind, total: 0, items: [] }
        g.total = round2(g.total + t.amount)
        g.items.push(t)
        by.set(kind, g)
    }

    const prevPay = prev.filter((t) => incomeKind(t) === 'pay').sort((a, b) => b.amount - a.amount)[0]
    const paidYet = now.some((t) => incomeKind(t) === 'pay')
    return {
        total,
        prevTotal: round2(prev.filter((t) => t.date <= prevCut).reduce((s, t) => s + t.amount, 0)),
        groups: [...by.values()].sort((a, b) => b.total - a.total),
        net: round2(total - spent),
        biggest: now.reduce<StarlingSpendItem | null>((b, t) => (!b || t.amount > b.amount ? t : b), null),
        payExpected: !paidYet && prevPay ? { day: Number(prevPay.date.slice(8, 10)), amount: prevPay.amount } : null,
    }
}
