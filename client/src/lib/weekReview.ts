import type { StarlingSpendItem } from '../types'
import { categoryLabel, isLumpy } from './monthStatement'
import { buildDoh, type DohLine } from './statementDoh'
import { spendKind, type Copy } from './statementInsights'

/**
 * The weekly check-in: a Monday-to-Sunday week of day-to-day spend against a
 * weekly budget, what it went on, the week's doh moments, and one thing to do
 * about it. On Sunday the week is complete; on Monday it's the week just gone
 * that's reviewed. The rest of the week it's the week in progress.
 *
 * Pure.
 */

export interface WeekReview {
    /** Monday, YYYY-MM-DD. */
    start: string
    /** Sunday, YYYY-MM-DD. */
    end: string
    /** The week is over (a review) rather than in progress. */
    done: boolean
    /** Days counted so far (7 once it's over). */
    days: number
    /** Day-to-day spend this week. */
    spent: number
    /** Bills and big one-offs this week, shown separately. */
    bills: number
    budget: number
    /** Budget left for the rest of the week (negative = over). */
    left: number
    /** Same days of the week before, for a like-for-like comparison. */
    lastWeek: number
    topPlaces: { label: string; total: number; count: number }[]
    topCategory: { label: string; total: number } | null
    doh: { total: number; lines: DohLine[] }
    /** One concrete nudge. */
    tip: Copy
    items: StarlingSpendItem[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

function iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date: string, n: number): string {
    const [y, m, d] = date.split('-').map(Number)
    return iso(new Date(y, m - 1, d + n))
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(y, m - 1, d).getDay() // 0 = Sunday
    return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/**
 * @param items money out covering this week and last (refined categories)
 * @param today YYYY-MM-DD
 * @param perDay the day-to-day budget per day (from the goal, or last month's rate)
 */
export function buildWeekReview(items: StarlingSpendItem[], today: string, perDay: number): WeekReview {
    // Monday: review last week. Otherwise: this week so far.
    const thisMonday = mondayOf(today)
    const reviewing = today === thisMonday
    const start = reviewing ? addDays(thisMonday, -7) : thisMonday
    const end = addDays(start, 6)
    const upTo = reviewing ? end : today
    const days = Math.round((Date.parse(upTo) - Date.parse(start)) / 86_400_000) + 1

    const week = items.filter((t) => t.date >= start && t.date <= upTo)
    const dayToDay = week.filter((t) => !isLumpy(t))
    const spent = round2(dayToDay.reduce((s, t) => s + t.amount, 0))
    const bills = round2(week.filter(isLumpy).reduce((s, t) => s + t.amount, 0))
    const budget = round2(perDay * 7)

    const prevStart = addDays(start, -7)
    const prevUpTo = addDays(upTo, -7)
    const lastWeek = round2(
        items.filter((t) => t.date >= prevStart && t.date <= prevUpTo && !isLumpy(t)).reduce((s, t) => s + t.amount, 0)
    )

    const places = new Map<string, { label: string; total: number; count: number }>()
    for (const t of dayToDay) {
        const key = (t.merchant ?? 'Unknown').toLowerCase()
        const p = places.get(key) ?? { label: t.merchant ?? 'Unknown', total: 0, count: 0 }
        p.total = round2(p.total + t.amount)
        p.count++
        places.set(key, p)
    }
    const cats = new Map<string, number>()
    for (const t of dayToDay) {
        if (spendKind(t.category) !== 'lifestyle') continue
        cats.set(t.category!, (cats.get(t.category!) ?? 0) + t.amount)
    }
    const [topKey, topTotal] = [...cats.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    const doh = buildDoh(week)
    const left = round2(budget - spent)
    const daysToGo = 7 - days

    const money = (n: number) => ({ money: round2(n) })
    let tip: Copy
    if (doh.lines.length) tip = [`Next week, skip the ${doh.lines[0].subject.toLowerCase()} and that’s `, money(doh.lines[0].saved), ' kept.']
    else if (left < 0) tip = ['Over by ', money(-left), '. A quiet weekend or two no-spend days puts it right.']
    else if (!reviewing && daysToGo > 0)
        tip = [money(left), ` left for ${daysToGo} day${daysToGo === 1 ? '' : 's'}: about `, money(left / daysToGo), ' a day.']
    else tip = ['Under budget by ', money(left), '. Move it to savings before it gets spent.']

    return {
        start,
        end,
        // Sunday's week is complete too: that's the end-of-week check-in.
        done: reviewing || upTo === end,
        days,
        spent,
        bills,
        budget,
        left,
        lastWeek,
        topPlaces: [...places.values()].sort((a, b) => b.total - a.total).slice(0, 3),
        topCategory: topKey ? { label: categoryLabel(topKey), total: round2(topTotal!) } : null,
        doh,
        tip,
        items: week,
    }
}
