import type { StarlingSpendItem } from '../types'

/**
 * The monthly statement: one calendar month of Starling spend, analysed up to
 * a cut-off day. For the current month that's today, so it starts empty on the
 * 1st and fills in as the month goes. For a past month it's the last day.
 *
 * Pure: the page fetches the month and the month before, and hands both here.
 */

/** One slice of the month (a category, merchant or space) and how it compares. */
export interface StatementGroup {
    key: string
    label: string
    total: number
    count: number
    /** Share of the month's spend, 0–1. */
    share: number
    /** The same slice last month, up to the same day of the month. */
    prevTotal: number
    items: StarlingSpendItem[]
}

export interface StatementDay {
    date: string
    total: number
    count: number
}

export interface MonthStatement {
    month: string
    /** The last day counted, YYYY-MM-DD. */
    asOf: string
    dayOfMonth: number
    daysInMonth: number
    /** The month is still running, so pace and projection mean something. */
    isCurrent: boolean
    total: number
    count: number
    /** Spend per day so far, counting days with nothing spent. */
    dailyAverage: number
    /** Where the month should land. Null once it's over. See `forecast`. */
    projected: number | null
    /**
     * How `projected` is made up, so it can be explained. Only day-to-day spend
     * is run forward at its daily rate; rent, bills, transfers and big one-offs
     * aren't, because they don't repeat every day. Bills that came out later in
     * last month and haven't come out yet are added as still to come.
     */
    forecast: {
        /**
         * The day-to-day rate the forecast runs on (no bills, transfers or
         * one-offs). Early in the month it leans on last month's rate, moving
         * to this month's own as the days add up.
         */
        dayToDayPerDay: number
        /** Last month's day-to-day spend per day. */
        prevDayToDayPerDay: number
        /** Day-to-day spend expected over the rest of the month. */
        dayToDayRest: number
        /** Last month's bills and big payments still due this month. */
        stillToCome: number
        stillToComeItems: StarlingSpendItem[]
        daysLeft: number
    } | null
    prev: {
        month: string
        /** Last month up to the same day of the month. */
        toSameDay: number
        /** All of last month. */
        fullTotal: number
    }
    /** Running total by day of month, index 0 = day 1, up to asOf. */
    cumulative: number[]
    /** Last month's running total, the whole month. */
    prevCumulative: number[]
    categories: StatementGroup[]
    merchants: StatementGroup[]
    spaces: StatementGroup[]
    /** Every day up to asOf, newest first. */
    days: StatementDay[]
    noSpendDays: number
    biggest: StarlingSpendItem | null
    busiestDay: StatementDay | null
    /** Merchants paid this month that weren't paid at all last month. */
    newMerchants: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

// Payments that don't happen "per day": bills, rent and transfers to people,
// savings, anything uncategorised, and any single payment this big.
const LUMPY_CATEGORIES = new Set(['BILLS_AND_SERVICES', 'PAYMENTS', 'SAVING'])
const LUMP_MIN = 150
/** Days until this month's own day-to-day rate fully takes over from last month's. */
const FORECAST_SETTLE_DAYS = 10

/** A bill, a transfer or a one-off: real spend, but not something to run forward day by day. */
export function isLumpy(t: StarlingSpendItem): boolean {
    return !t.category || LUMPY_CATEGORIES.has(t.category) || t.amount >= LUMP_MIN
}

export function daysIn(month: string): number {
    const [y, m] = month.split('-').map(Number)
    return new Date(y, m, 0).getDate()
}

export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Starling's "EATING_OUT" → "Eating out". */
export function categoryLabel(category: string | null): string {
    if (!category) return 'Uncategorised'
    const words = category.toLowerCase().split('_').join(' ')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

function merchantKey(t: StarlingSpendItem): string {
    return (t.merchant ?? 'Unknown').trim().toLowerCase()
}

function groupBy(
    items: StarlingSpendItem[],
    prevItems: StarlingSpendItem[],
    keyOf: (t: StarlingSpendItem) => string,
    labelOf: (t: StarlingSpendItem) => string,
    total: number
): StatementGroup[] {
    const prevTotals = new Map<string, number>()
    for (const t of prevItems) prevTotals.set(keyOf(t), (prevTotals.get(keyOf(t)) ?? 0) + t.amount)

    const groups = new Map<string, StatementGroup>()
    for (const t of items) {
        const key = keyOf(t)
        let g = groups.get(key)
        if (!g) {
            g = { key, label: labelOf(t), total: 0, count: 0, share: 0, prevTotal: 0, items: [] }
            groups.set(key, g)
        }
        g.total += t.amount
        g.count++
        g.items.push(t)
    }

    return [...groups.values()]
        .map((g) => ({
            ...g,
            total: round2(g.total),
            share: total > 0 ? g.total / total : 0,
            prevTotal: round2(prevTotals.get(g.key) ?? 0),
            items: [...g.items].sort((a, b) => (a.time < b.time ? 1 : -1)),
        }))
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
}

function cumulativeByDay(items: StarlingSpendItem[], days: number): number[] {
    const perDay = new Array<number>(days).fill(0)
    for (const t of items) {
        const d = Number(t.date.slice(8, 10))
        if (d >= 1 && d <= days) perDay[d - 1] += t.amount
    }
    let run = 0
    return perDay.map((v) => (run = round2(run + v)))
}

/**
 * @param month YYYY-MM being analysed
 * @param items that month's spend (anything outside the month or after asOf is ignored)
 * @param prevItems the whole of the month before
 * @param today YYYY-MM-DD, decides whether the month is still running
 */
export function buildMonthStatement(
    month: string,
    items: StarlingSpendItem[],
    prevItems: StarlingSpendItem[],
    today: string
): MonthStatement {
    const daysInMonth = daysIn(month)
    const isCurrent = today.slice(0, 7) === month
    const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : daysInMonth
    const asOf = `${month}-${String(dayOfMonth).padStart(2, '0')}`

    const counted = items.filter((t) => t.date.startsWith(month) && t.date <= asOf)

    const prevMonth = shiftMonth(month, -1)
    const prevDays = daysIn(prevMonth)
    const prevAll = prevItems.filter((t) => t.date.startsWith(prevMonth))
    const prevCut = `${prevMonth}-${String(Math.min(dayOfMonth, prevDays)).padStart(2, '0')}`
    const prevToSameDay = prevAll.filter((t) => t.date <= prevCut)

    const total = round2(counted.reduce((s, t) => s + t.amount, 0))
    const dailyAverage = round2(total / dayOfMonth)

    const dayMap = new Map<string, StatementDay>()
    for (let d = 1; d <= dayOfMonth; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`
        dayMap.set(date, { date, total: 0, count: 0 })
    }
    for (const t of counted) {
        const day = dayMap.get(t.date)
        if (day) {
            day.total = round2(day.total + t.amount)
            day.count++
        }
    }
    const days = [...dayMap.values()].reverse()

    const biggest = counted.reduce<StarlingSpendItem | null>(
        (best, t) => (!best || t.amount > best.amount ? t : best),
        null
    )
    const busiestDay = days.reduce<StatementDay | null>(
        (best, d) => (d.total > 0 && (!best || d.total > best.total) ? d : best),
        null
    )

    const merchants = groupBy(counted, prevToSameDay, merchantKey, (t) => t.merchant ?? 'Unknown', total)

    let forecast: MonthStatement['forecast'] = null
    if (isCurrent) {
        const daysLeft = daysInMonth - dayOfMonth
        const dayToDay = counted.filter((t) => !isLumpy(t)).reduce((sum, t) => sum + t.amount, 0)
        const prevDayToDayPerDay = round2(prevAll.filter((t) => !isLumpy(t)).reduce((sum, t) => sum + t.amount, 0) / prevDays)
        // Day 1 alone says nothing about a month, so blend: last month's rate first,
        // this month's own by FORECAST_SETTLE_DAYS (or straight away with no history).
        const w = prevAll.length ? Math.min(1, dayOfMonth / FORECAST_SETTLE_DAYS) : 1
        const dayToDayPerDay = round2(w * (dayToDay / dayOfMonth) + (1 - w) * prevDayToDayPerDay)
        // Last month's bills from today on (today's may not have gone yet) that haven't been paid this month.
        const paidThisMonth = new Set(counted.map(merchantKey))
        const stillToComeItems = prevAll.filter(
            (t) => isLumpy(t) && Number(t.date.slice(8, 10)) >= dayOfMonth && !paidThisMonth.has(merchantKey(t))
        )
        forecast = {
            dayToDayPerDay,
            prevDayToDayPerDay,
            dayToDayRest: round2(dayToDayPerDay * daysLeft),
            stillToCome: round2(stillToComeItems.reduce((sum, t) => sum + t.amount, 0)),
            stillToComeItems,
            daysLeft,
        }
    }
    const paidLastMonth = new Set(prevAll.map(merchantKey))

    return {
        month,
        asOf,
        dayOfMonth,
        daysInMonth,
        isCurrent,
        total,
        count: counted.length,
        dailyAverage,
        projected: forecast ? round2(total + forecast.dayToDayRest + forecast.stillToCome) : null,
        forecast,
        prev: {
            month: prevMonth,
            toSameDay: round2(prevToSameDay.reduce((s, t) => s + t.amount, 0)),
            fullTotal: round2(prevAll.reduce((s, t) => s + t.amount, 0)),
        },
        cumulative: cumulativeByDay(counted, daysInMonth).slice(0, dayOfMonth),
        prevCumulative: cumulativeByDay(prevAll, prevDays),
        categories: groupBy(
            counted,
            prevToSameDay,
            (t) => t.category ?? 'NONE',
            (t) => categoryLabel(t.category),
            total
        ),
        merchants,
        spaces: groupBy(counted, prevToSameDay, (t) => t.space, (t) => t.space, total),
        days,
        noSpendDays: days.filter((d) => d.count === 0).length,
        biggest,
        busiestDay,
        newMerchants: merchants.filter((m) => !paidLastMonth.has(m.key)).map((m) => m.label),
    }
}
