import type { StarlingSpendItem } from '../types'
import { isLumpy, type MonthStatement } from './monthStatement'
import { spendKind, type Copy } from './statementInsights'
import type { Doh } from './statementDoh'
import { tagAll } from './spendTags'

/**
 * A savings goal, and a plan to reach it built from last month's real spending.
 *
 * The levers come in order of how painless they are:
 * 1. Skip the doh moments: money that bought nothing.
 * 2. Drop a subscription, if several were running.
 * 3. Trim the biggest lifestyle categories by a quarter (net of any doh in them).
 * The plan takes them in that order until the goal is covered, then turns the
 * goal into a day-to-day budget for this month.
 *
 * Pure.
 */

export type LeverKind = 'skip' | 'drop' | 'trim'

export interface Lever {
    id: string
    kind: LeverKind
    icon: string
    title: Copy
    detail: Copy
    /** What it saves over a month, in £. */
    amount: number
    items: StarlingSpendItem[]
}

export interface SavingsPlan {
    goal: number
    /** Every lever on offer, in the order the plan takes them. */
    levers: Lever[]
    /** Ids of the levers the plan uses to reach the goal. */
    chosen: string[]
    /** What the chosen levers add up to. */
    covered: number
    /** Left uncovered when even every lever isn't enough. */
    short: number
    /** Everything on offer: a realistic ceiling. */
    possible: number
    /** Day-to-day spend for the month that hits the goal, and per day from today. */
    dayToDayBudget: number
    perDay: number
    /** Income − bills − day-to-day at last month's rate, when income is known. */
    leftOver: { income: number; bills: number; dayToDay: number; left: number; leftAfterGoal: number } | null
}

/** A quarter off the biggest treats is noticeable but liveable. */
const TRIM_SHARE = 0.25
const TRIM_MIN = 40 // £ a category has to be before a trim is worth suggesting
const MAX_TRIMS = 4

// What to do about each kind of doh, as a step in the plan.
const DOH_STEP: Record<string, string> = {
    gambling: 'No bets',
    fees: 'Dodge the fees and fines',
    duplicates: 'Claim back the double charge',
    'late-night': 'Nothing after midnight',
    'after-shop': 'No delivery when there’s food in',
    'delivery-premium': 'Collect instead of delivery',
    music: 'Keep just one music service',
    video: 'Rotate your streaming services',
}

const round2 = (n: number) => Math.round(n * 100) / 100
const money = (n: number) => ({ money: round2(n) })

/** Goal presets: round amounts within reach of what's on offer. */
export function goalPresets(possible: number): number[] {
    const presets = [100, 250, 500, 1000].filter((p) => p <= Math.max(250, possible * 1.5))
    return presets.length ? presets : [100]
}

export function buildSavingsPlan(opts: {
    /** Last month, as a finished month. */
    last: MonthStatement
    lastDoh: Doh
    goal: number
    /** Last month's name, e.g. "October". */
    lastName: string
    /** Last month's day-to-day spend (everything bar bills, transfers, one-offs). */
    prevDayToDay: number
    /** This month's bills, from last month's pattern. */
    bills: number
    /** Day-to-day already spent this month. */
    spentDayToDay: number
    /** Days left to spend in, counting today. */
    daysLeft: number
    /** Planned income for this month, from the Monthly sheet. */
    income: number | null
}): SavingsPlan {
    const { last, lastDoh, goal, lastName } = opts
    const levers: Lever[] = []

    // 1. Doh moments: skip them entirely.
    const dohIds = new Set<string>()
    for (const l of lastDoh.lines) {
        for (const t of l.items) dohIds.add(t.id)
        levers.push({
            id: `skip-${l.id}`,
            kind: 'skip',
            icon: l.icon,
            title: [DOH_STEP[l.id] ?? `Skip the ${l.subject.toLowerCase()}`],
            detail: [money(l.saved), ` in ${lastName}. ${l.why}`],
            amount: round2(l.saved),
            items: l.items,
        })
    }

    // 2. Subscriptions: drop the cheapest if several were running (and doh didn't already).
    const lastItems = last.categories.flatMap((c) => c.items)
    const tags = tagAll(lastItems)
    const subs = new Map<string, StarlingSpendItem>()
    for (const t of lastItems) {
        if (dohIds.has(t.id) || !(tags.get(t.id) ?? []).includes('subscription')) continue
        subs.set((t.merchant ?? '').toLowerCase(), t)
    }
    if (subs.size >= 2) {
        const sorted = [...subs.values()].sort((a, b) => a.amount - b.amount)
        const total = sorted.reduce((s, t) => s + t.amount, 0)
        levers.push({
            id: 'drop-subscription',
            kind: 'drop',
            icon: 'fa-rotate',
            title: [`Drop one of ${subs.size} subscriptions`],
            detail: [money(total), ` a month between them. Even the cheapest, ${sorted[0].merchant}, is `, money(sorted[0].amount), '.'],
            amount: round2(sorted[0].amount),
            items: sorted,
        })
    }

    // 3. Trim the biggest treats, net of what doh already covers.
    const trims = last.categories
        .filter((c) => spendKind(c.key) === 'lifestyle')
        .map((c) => {
            const base = c.items.filter((t) => !dohIds.has(t.id) && !isLumpy(t)).reduce((s, t) => s + t.amount, 0)
            return { c, base }
        })
        .filter((x) => x.base >= TRIM_MIN)
        .sort((a, b) => b.base - a.base)
        .slice(0, MAX_TRIMS)
    for (const { c, base } of trims) {
        levers.push({
            id: `trim-${c.key}`,
            kind: 'trim',
            icon: 'fa-scissors',
            title: [`${c.label}: `, money(base), ' → ', money(base * (1 - TRIM_SHARE))],
            detail: [`A quarter less than ${lastName}, about `, money((base * TRIM_SHARE) / 4.3), ' a week.'],
            amount: round2(base * TRIM_SHARE),
            items: c.items,
        })
    }

    // Take levers in order until the goal is covered.
    const chosen: string[] = []
    let covered = 0
    for (const l of levers) {
        if (covered >= goal) break
        chosen.push(l.id)
        covered += l.amount
    }
    covered = round2(covered)
    const possible = round2(levers.reduce((s, l) => s + l.amount, 0))

    // The goal comes out of day-to-day: bills are what they are.
    const dayToDayBudget = round2(Math.max(0, opts.prevDayToDay - goal))
    const perDay = round2(Math.max(0, dayToDayBudget - opts.spentDayToDay) / Math.max(1, opts.daysLeft))

    const leftOver =
        opts.income !== null && opts.income > 0
            ? (() => {
                  const left = round2(opts.income - opts.bills - opts.prevDayToDay)
                  return { income: opts.income, bills: opts.bills, dayToDay: opts.prevDayToDay, left, leftAfterGoal: round2(left + goal) }
              })()
            : null

    return { goal, levers, chosen, covered, short: round2(Math.max(0, goal - possible)), possible, dayToDayBudget, perDay, leftOver }
}
