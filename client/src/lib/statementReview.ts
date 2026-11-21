/**
 * Good/bad review of a month's payments: every payment starts "good", the
 * user flips the ones they regret to "bad", and this turns that into a report.
 * Pure — the page holds the set of bad ids and the payments.
 */
import type { StarlingSpendItem } from '../types'
import { categoryLabel } from './monthStatement'
import { spendKind, KIND_LABEL } from './statementInsights'
import type { Tag } from './spendTags'

export type Verdict = 'good' | 'bad'

export interface ReviewGroup {
    key: string
    label: string
    total: number
    count: number
    /** Share of all bad money, 0–1. */
    share: number
    items: StarlingSpendItem[]
}

export interface ReviewPattern {
    icon: string
    text: string
    items: StarlingSpendItem[]
}

export interface ReviewReport {
    total: number
    count: number
    good: { total: number; count: number }
    bad: { total: number; count: number; items: StarlingSpendItem[] }
    /** Bad money as a share of everything spent, 0–1. */
    badShare: number
    byCategory: ReviewGroup[]
    byMerchant: ReviewGroup[]
    byTag: ReviewGroup[]
    byKind: ReviewGroup[]
    patterns: ReviewPattern[]
    /** The biggest good payments — what the money was well spent on. */
    topGood: StarlingSpendItem[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: StarlingSpendItem[]) => round2(xs.reduce((s, t) => s + t.amount, 0))
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const SMALL = 5

function group(
    items: StarlingSpendItem[],
    keysOf: (t: StarlingSpendItem) => string[],
    labelOf: (key: string) => string,
    badTotal: number
): ReviewGroup[] {
    const by = new Map<string, StarlingSpendItem[]>()
    for (const t of items) for (const k of keysOf(t)) by.set(k, [...(by.get(k) ?? []), t])
    return [...by.entries()]
        .map(([key, list]) => {
            const total = sum(list)
            return {
                key,
                label: labelOf(key),
                total,
                count: list.length,
                share: badTotal ? total / badTotal : 0,
                items: list,
            }
        })
        .sort((a, b) => b.total - a.total || b.count - a.count)
}

function weekday(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).getDay()
}

function hour(iso: string): number {
    return new Date(iso).getHours()
}

const money = (n: number) => `£${n.toFixed(2)}`

export function buildReviewReport(
    payments: StarlingSpendItem[],
    bad: ReadonlySet<string>,
    tagsOf: ReadonlyMap<string, Tag[]>,
    tagLabel: (t: Tag) => string
): ReviewReport {
    const badItems = payments.filter((t) => bad.has(t.id)).sort((a, b) => b.amount - a.amount)
    const goodItems = payments.filter((t) => !bad.has(t.id))
    const total = sum(payments)
    const badTotal = sum(badItems)

    const patterns: ReviewPattern[] = []
    if (badItems.length >= 2) {
        // The weekday that carries the most bad money, when it clearly leads.
        const days = group(
            badItems,
            (t) => [String(weekday(t.date))],
            (k) => WEEKDAYS[Number(k)],
            badTotal
        )
        const top = days[0]
        if (top && days.length > 1 && top.share >= 0.35)
            patterns.push({
                icon: 'fa-calendar-day',
                text: `${Math.round(top.share * 100)}% of the bad money went on ${top.label}s (${money(top.total)}).`,
                items: top.items,
            })
        const weekend = badItems.filter((t) => [0, 5, 6].includes(weekday(t.date)))
        if (
            weekend.length &&
            (!top || ![0, 5, 6].includes(Number(top.key))) &&
            sum(weekend) / badTotal >= 0.5
        )
            patterns.push({
                icon: 'fa-champagne-glasses',
                text: `Friday to Sunday made up ${Math.round((sum(weekend) / badTotal) * 100)}% of it (${money(sum(weekend))}).`,
                items: weekend,
            })
        const late = badItems.filter((t) => hour(t.time) >= 21 || hour(t.time) < 4)
        if (late.length >= 2)
            patterns.push({
                icon: 'fa-moon',
                text: `${late.length} bad payments were late at night, after 9pm (${money(sum(late))}).`,
                items: late,
            })
        const small = badItems.filter((t) => t.amount < SMALL)
        if (small.length >= 3)
            patterns.push({
                icon: 'fa-coins',
                text: `${small.length} small buys under £${SMALL} added up to ${money(sum(small))}.`,
                items: small,
            })
        const repeat = group(
            badItems,
            (t) => [t.merchant ?? 'Unknown'],
            (k) => k,
            badTotal
        ).find((g) => g.count >= 3)
        if (repeat)
            patterns.push({
                icon: 'fa-repeat',
                text: `${repeat.label} came up ${repeat.count} times as bad (${money(repeat.total)}).`,
                items: repeat.items,
            })
    }

    return {
        total,
        count: payments.length,
        good: { total: sum(goodItems), count: goodItems.length },
        bad: { total: badTotal, count: badItems.length, items: badItems },
        badShare: total ? badTotal / total : 0,
        byCategory: group(
            badItems,
            (t) => [t.category ?? 'NONE'],
            (k) => categoryLabel(k === 'NONE' ? null : k),
            badTotal
        ),
        byMerchant: group(
            badItems,
            (t) => [t.merchant ?? 'Unknown'],
            (k) => k,
            badTotal
        ),
        byTag: group(
            badItems,
            (t) => tagsOf.get(t.id) ?? [],
            (k) => tagLabel(k as Tag),
            badTotal
        ),
        byKind: group(
            badItems,
            (t) => [spendKind(t.category)],
            (k) => KIND_LABEL[k as keyof typeof KIND_LABEL],
            badTotal
        ),
        patterns,
        topGood: [...goodItems].sort((a, b) => b.amount - a.amount).slice(0, 5),
    }
}

// ── Saved review ─────────────────────────────────────────────────────────────

export interface SavedReview {
    bad: string[]
    /** Set once "Create report" has been pressed; the Report tab shows from then on. */
    reportAt: string | null
}

const keyFor = (month: string) => `statement-review:${month}`

export function loadReview(month: string): SavedReview {
    try {
        const raw = localStorage.getItem(keyFor(month))
        if (!raw) return { bad: [], reportAt: null }
        const v = JSON.parse(raw) as Partial<SavedReview>
        return {
            bad: Array.isArray(v.bad) ? v.bad.filter((x) => typeof x === 'string') : [],
            reportAt: v.reportAt ?? null,
        }
    } catch {
        return { bad: [], reportAt: null }
    }
}

export function saveReview(month: string, review: SavedReview): void {
    try {
        if (!review.bad.length && !review.reportAt) localStorage.removeItem(keyFor(month))
        else localStorage.setItem(keyFor(month), JSON.stringify(review))
    } catch {
        // Private window or blocked storage: the review just won't survive a reload.
    }
}
