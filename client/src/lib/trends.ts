import type { StarlingSpendItem } from '../types'
import { categoryLabel, isLumpy } from './monthStatement'
import { spendKind } from './statementInsights'

/**
 * The bigger picture: up to a year of months side by side. What came in, what
 * went out, a typical month, the best and worst, and the categories quietly
 * creeping up (or easing off) over the last three months against the three
 * before.
 *
 * Pure. Takes payments with refined categories (drinks split from eating out).
 */

export interface TrendMonth {
    month: string
    out: number
    in: number
    /** Out minus bills, rent and one-offs. */
    dayToDay: number
    /** Still running: out/in so far, not a full month. */
    partial: boolean
    byCategory: Map<string, number>
}

export interface CategoryTrend {
    key: string
    label: string
    /** Monthly average over the last three finished months. */
    recent: number
    /** Monthly average over the three before. */
    before: number
    change: number
}

export interface Trends {
    months: TrendMonth[]
    /** Averages over finished months only. */
    averageOut: number
    averageIn: number
    averageDayToDay: number
    best: TrendMonth | null
    worst: TrendMonth | null
    creepingUp: CategoryTrend[]
    easingOff: CategoryTrend[]
    /** Finished months that brought in more than went out. */
    monthsAhead: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const CREEP_MIN = 25 // £ a month a category has to move by
const CREEP_PCT = 0.2

/**
 * @param out money out across all the months (finished and current)
 * @param incoming money in across the same months
 * @param months YYYY-MM keys to show, oldest first
 * @param current the running month (shown, but left out of averages and trends)
 */
export function buildTrends(out: StarlingSpendItem[], incoming: StarlingSpendItem[], months: string[], current: string): Trends {
    const rows: TrendMonth[] = months.map((month) => {
        const o = out.filter((t) => t.date.startsWith(month))
        const byCategory = new Map<string, number>()
        for (const t of o) {
            const k = t.category ?? 'NONE'
            byCategory.set(k, (byCategory.get(k) ?? 0) + t.amount)
        }
        return {
            month,
            out: round2(o.reduce((s, t) => s + t.amount, 0)),
            in: round2(incoming.filter((t) => t.date.startsWith(month)).reduce((s, t) => s + t.amount, 0)),
            dayToDay: round2(o.filter((t) => !isLumpy(t)).reduce((s, t) => s + t.amount, 0)),
            partial: month === current,
            byCategory,
        }
    })

    // Only months with something in them count, so a gap before the history starts doesn't drag averages.
    const done = rows.filter((r) => !r.partial && (r.out > 0 || r.in > 0))
    const avg = (f: (r: TrendMonth) => number) => (done.length ? round2(done.reduce((s, r) => s + f(r), 0) / done.length) : 0)
    const byOut = [...done].sort((a, b) => a.out - b.out)

    const recent = done.slice(-3)
    const before = done.slice(-6, -3)
    const trends: CategoryTrend[] = []
    if (recent.length === 3 && before.length >= 2) {
        const keys = new Set([...recent, ...before].flatMap((r) => [...r.byCategory.keys()]))
        for (const key of keys) {
            if (spendKind(key === 'NONE' ? null : key) === 'other') continue
            const mean = (rs: TrendMonth[]) => rs.reduce((s, r) => s + (r.byCategory.get(key) ?? 0), 0) / rs.length
            const r = mean(recent)
            const b = mean(before)
            const change = r - b
            if (Math.abs(change) < CREEP_MIN || (b > 0 && Math.abs(change) / b < CREEP_PCT)) continue
            trends.push({ key, label: categoryLabel(key === 'NONE' ? null : key), recent: round2(r), before: round2(b), change: round2(change) })
        }
    }

    return {
        months: rows,
        averageOut: avg((r) => r.out),
        averageIn: avg((r) => r.in),
        averageDayToDay: avg((r) => r.dayToDay),
        best: byOut[0] ?? null,
        worst: byOut[byOut.length - 1] ?? null,
        creepingUp: trends.filter((t) => t.change > 0).sort((a, b) => b.change - a.change).slice(0, 4),
        easingOff: trends.filter((t) => t.change < 0).sort((a, b) => a.change - b.change).slice(0, 3),
        monthsAhead: done.filter((r) => r.in > r.out).length,
    }
}
