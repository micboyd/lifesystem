import type { StarlingSpendItem } from '../types'
import { tagAll, type Tag } from './spendTags'

/**
 * Every subscription and membership in one list, with what it costs a year.
 * "£11 a month" sounds like nothing; "£132 a year" is what gets things cancelled.
 *
 * A payment counts when it's tagged as a subscription, streaming, music, apps or
 * the gym, or when the same place charged a similar amount three months running
 * in a category subscriptions live in (not shopping: a favourite shop isn't a
 * subscription). Bills (energy, phone,
 * council tax) and rent are left to the bills list: they're not optional.
 *
 * Pure.
 */

export interface Subscription {
    key: string
    name: string
    /** The latest charge. */
    amount: number
    /** Monthly, or yearly when it's only charged once a year. */
    every: 'month' | 'year'
    /** What it costs over a year. */
    yearly: number
    lastPaid: string
    /** When the next charge should land. */
    nextDue: string
    /** Months it was seen in, of those looked at. */
    monthsSeen: number
    /** Up since the first charge seen, if it went up. */
    priceRise: { from: number; to: number } | null
    items: StarlingSpendItem[]
}

export interface SubscriptionList {
    subs: Subscription[]
    monthly: number
    yearly: number
}

const SUB_TAGS: Tag[] = ['subscription', 'streaming', 'music', 'software', 'gym']
// Where repeat charges are likely to be subscriptions rather than shopping.
const SUB_CATEGORIES = new Set(['ENTERTAINMENT', 'FITNESS', 'GENERAL'])
/** An untagged repeat has to show up in this many months running to count. */
const REPEAT_MONTHS = 3
const SIMILAR = 0.15 // charges within 15% of each other read as the same subscription
// A one-off only reads as a yearly plan at a yearly sort of price; a single
// £6.99 charge is a monthly plan that was stopped.
const YEARLY_MIN = 30
const round2 = (n: number) => Math.round(n * 100) / 100

function addMonths(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number)
    const target = new Date(y, m - 1 + n, 1)
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`
}

/** The last REPEAT_MONTHS months seen are back to back: a monthly charge, not occasional shopping. */
function consecutive(months: string[]): boolean {
    const recent = months.slice(-REPEAT_MONTHS)
    for (let i = 1; i < recent.length; i++) {
        const [ay, am] = recent[i - 1].split('-').map(Number)
        const [by, bm] = recent[i].split('-').map(Number)
        if ((by - ay) * 12 + (bm - am) !== 1) return false
    }
    return true
}

/**
 * @param items money out over several months (more months, better detection)
 * @param today YYYY-MM-DD
 */
export function findSubscriptions(items: StarlingSpendItem[], today: string): SubscriptionList {
    const tags = tagAll(items)
    const byPlace = new Map<string, StarlingSpendItem[]>()
    for (const t of items) {
        const key = (t.merchant ?? '').trim().toLowerCase()
        if (!key) continue
        byPlace.set(key, [...(byPlace.get(key) ?? []), t])
    }

    const subs: Subscription[] = []
    for (const [key, list] of byPlace) {
        const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1))
        const latest = sorted[sorted.length - 1]
        const tagged = sorted.some((t) => (tags.get(t.id) ?? []).some((x) => SUB_TAGS.includes(x)))
        // Keep only charges similar to the latest: one subscription, not every purchase there.
        const similar = sorted.filter((t) => Math.abs(t.amount - latest.amount) <= latest.amount * SIMILAR || t.amount === latest.amount)
        const months = new Set(similar.map((t) => t.date.slice(0, 7)))
        const repeats =
            months.size >= REPEAT_MONTHS &&
            consecutive([...months].sort()) &&
            SUB_CATEGORIES.has(latest.category ?? '') &&
            similar.length <= months.size + 1
        if (!tagged && !repeats) continue
        // A tagged one-off could be an annual plan; anything seen in 2+ months is monthly.
        const every: Subscription['every'] = months.size >= 2 ? 'month' : 'year'
        if (every === 'year' && (!tagged || latest.amount < YEARLY_MIN)) continue
        const first = similar[0]
        subs.push({
            key,
            name: latest.merchant ?? 'Unknown',
            amount: latest.amount,
            every,
            yearly: round2(every === 'month' ? latest.amount * 12 : latest.amount),
            lastPaid: latest.date,
            nextDue: addMonths(latest.date, every === 'month' ? 1 : 12),
            monthsSeen: months.size,
            priceRise: first.amount < latest.amount - 0.5 ? { from: first.amount, to: latest.amount } : null,
            items: similar,
        })
    }

    // A monthly one not seen for two months has probably been cancelled.
    const live = subs.filter((s) => s.every === 'year' || s.lastPaid >= addMonths(today, -2))
    live.sort((a, b) => b.yearly - a.yearly)
    return {
        subs: live,
        monthly: round2(live.reduce((s, x) => s + (x.every === 'month' ? x.amount : x.amount / 12), 0)),
        yearly: round2(live.reduce((s, x) => s + x.yearly, 0)),
    }
}
