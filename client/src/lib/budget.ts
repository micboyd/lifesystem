import type { FinanceRow, FinanceEntry, BudgetSpend } from '../types'

/** "YYYY-MM-DD" → "YYYY-MM". */
export function monthOf(date: string): string {
    return date.slice(0, 7)
}

/** Day-of-month number from a "YYYY-MM-DD" string. */
export function dayNumOf(date: string): number {
    return Number(date.split('-')[2])
}

/** Number of days in a "YYYY-MM" month. */
export function daysInMonth(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0).getDate()
}

/** "YYYY-MM" + day number → "YYYY-MM-DD". */
function dateKey(month: string, day: number): string {
    return `${month}-${String(day).padStart(2, '0')}`
}

/** Format a Date object as "YYYY-MM-DD" using local calendar date (not UTC). */
function localDateStr(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/** ISO Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0 … Sun=6
    d.setDate(d.getDate() - dow)
    return localDateStr(d)
}

/** ISO Sunday of the week containing `date`. */
export function weekEndOf(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    d.setDate(d.getDate() + (6 - dow))
    return localDateStr(d)
}

/**
 * ISO Mon–Sun week containing `date`, clamped to that date's calendar month so
 * every week resets on the 1st (a Mon-30th–Tue-31st stub is its own short week).
 *
 * Single source of truth for week slicing — used by the Budgets page selector and
 * the dashboard budget widget so both agree on month boundaries.
 */
export function clampedWeekRange(date: string): { month: string; weekStart: string; weekEnd: string } {
    const month = monthOf(date)
    const monthStart = `${month}-01`
    const monthEnd = dateKey(month, daysInMonth(month))
    const rawStart = weekStartOf(date)
    const rawEnd = weekEndOf(date)
    return {
        month,
        weekStart: rawStart < monthStart ? monthStart : rawStart,
        weekEnd: rawEnd > monthEnd ? monthEnd : rawEnd,
    }
}

/**
 * Days in `month` that aren't excluded. Excluded days (work trips, holidays)
 * carry no allowance, so the monthly amount is spread across the remaining days.
 */
export function activeDaysInMonth(month: string, excluded: Set<string>): number {
    const total = daysInMonth(month)
    let n = 0
    for (let d = 1; d <= total; d++) {
        if (!excluded.has(dateKey(month, d))) n++
    }
    return n
}

/** Count of non-excluded days strictly before `date` within its month. */
function activeDaysBefore(date: string, excluded: Set<string>): number {
    const month = monthOf(date)
    const dayNum = dayNumOf(date)
    let n = 0
    for (let d = 1; d < dayNum; d++) {
        if (!excluded.has(dateKey(month, d))) n++
    }
    return n
}

export interface BudgetDay {
    /** Budget amount for the month (entry override, else the recurring amount). */
    monthlyAmount: number
    /** monthlyAmount spread evenly across the month's active (non-excluded) days. */
    straightDailyRate: number
    /** Unspent (positive) or overspent (negative) running balance carried into today. */
    carry: number
    /** Amount logged against this row today. */
    spentToday: number
    /** What's left for today after carry and today's spend. */
    remaining: number
    /** What's left for the whole month. */
    monthlyRemaining: number
}

/**
 * Daily-budget maths for a single row on a given date. The "straight daily rate"
 * is the monthly amount divided evenly across the month's active days; any
 * under/overspend on earlier active days carries forward so today's allowance
 * self-corrects. Excluded days carry no allowance and their spend is left out of
 * the running totals, so the figure stays identical to the Daily Log calendar.
 *
 * Single source of truth for every budget surface (Budgets, Daily Log, the
 * dashboard widget, and the insights strip). Pass the month's excluded dates so
 * all surfaces agree; omit them and it behaves as a plain even split.
 */
export function computeBudgetDay(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    date: string,
    excluded: Set<string> = new Set()
): BudgetDay {
    const month = monthOf(date)
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const totalActiveDays = activeDaysInMonth(month, excluded)
    const straightDailyRate = totalActiveDays > 0 ? monthlyAmount / totalActiveDays : 0

    const spentToday = rowSpends
        .filter((s) => s.date === date)
        .reduce((sum, s) => sum + s.amount, 0)
    // Spend on excluded days sits outside the budget, so it never counts against it.
    const totalSpentMonth = rowSpends
        .filter((s) => !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalSpentMonth

    // Excluded days have no allowance of their own.
    if (excluded.has(date)) {
        return {
            monthlyAmount,
            straightDailyRate: 0,
            carry: 0,
            spentToday,
            remaining: 0,
            monthlyRemaining,
        }
    }

    const totalSpentBefore = rowSpends
        .filter((s) => s.date < date && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const carry = activeDaysBefore(date, excluded) * straightDailyRate - totalSpentBefore
    const todaysAllowance = straightDailyRate + carry
    const remaining = todaysAllowance - spentToday

    return { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining }
}

export interface BudgetWeek {
    /** Budget amount for the month (entry override, else the recurring amount). */
    monthlyAmount: number
    /** Daily rate × active days in this week slice. */
    weeklyRate: number
    /** Unspent (positive) or overspent (negative) carry from all prior weeks this month. */
    carry: number
    /** Amount logged against this row during this week's days up to today (or weekEnd for past weeks). */
    spentThisWeek: number
    /** Weekly allowance (weeklyRate + carry) minus spentThisWeek. */
    remaining: number
    /** What's left for the whole month. */
    monthlyRemaining: number
}

/** Add one day to a YYYY-MM-DD string. */
function nextDay(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + 1)
    return localDateStr(d)
}

/** Previous day. */
function prevDay(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() - 1)
    return localDateStr(d)
}

/** Count non-excluded days between start and end inclusive. */
function activeDaysBetween(start: string, end: string, excluded: Set<string>): number {
    let n = 0
    let d = start
    while (d <= end) {
        if (!excluded.has(d)) n++
        d = nextDay(d)
    }
    return n
}

/**
 * Weekly-budget maths for a single row.
 *
 * weekStart / weekEnd must already be clamped to the month (the caller's job).
 * today is the real calendar date — used to limit spentThisWeek for the current week.
 *
 * Carry logic: daily rate × days in each prior week's slice − spend in that slice.
 * With zero spend, the last week of the month carries the full monthly budget.
 */
export function computeBudgetWeek(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    weekStart: string,
    weekEnd: string,
    today: string,
    excluded: Set<string> = new Set()
): BudgetWeek {
    const month = weekStart.slice(0, 7)
    const monthStart = `${month}-01`
    const monthEnd = dateKey(month, daysInMonth(month))
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const totalActiveDays = activeDaysInMonth(month, excluded)
    const dailyRate = totalActiveDays > 0 ? monthlyAmount / totalActiveDays : 0

    // This week's allowance — daily rate × active days in the clamped slice.
    const weeklyRate = dailyRate * activeDaysBetween(weekStart, weekEnd, excluded)

    // Walk prior weeks from the first day of the month up to weekStart.
    let carry = 0
    if (weekStart > monthStart) {
        // First week of the month may start before day 1 (ISO Monday in prior month) — clamp.
        let cursor = weekStartOf(monthStart)
        if (cursor < monthStart) cursor = monthStart

        while (cursor < weekStart) {
            // This prior week's slice: Mon–Sun clamped to [monthStart, weekStart-1]
            const rawEnd = weekEndOf(cursor)
            const sliceEnd = rawEnd >= weekStart ? prevDay(weekStart) : (rawEnd > monthEnd ? monthEnd : rawEnd)

            const priorAllowance = dailyRate * activeDaysBetween(cursor, sliceEnd, excluded)
            const priorSpend = rowSpends
                .filter((s) => s.date >= cursor && s.date <= sliceEnd && !excluded.has(s.date))
                .reduce((sum, s) => sum + s.amount, 0)
            carry += priorAllowance - priorSpend

            // Advance to next ISO Monday after this week's Sunday.
            cursor = nextDay(weekEndOf(cursor))
            // If the next Monday overshoots weekStart (edge case at month start), stop.
            if (cursor >= weekStart) break
        }
    }

    // Spend in this week — for past/current weeks cap at today; for future weeks include all planned spends.
    const spendCutoff = today < weekStart ? weekEnd : today < weekEnd ? today : weekEnd
    const spentThisWeek = rowSpends
        .filter((s) => s.date >= weekStart && s.date <= spendCutoff && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)

    const totalMonthSpend = rowSpends
        .filter((s) => s.date >= monthStart && s.date <= monthEnd && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalMonthSpend

    const remaining = weeklyRate + carry - spentThisWeek

    return { monthlyAmount, weeklyRate, carry, spentThisWeek, remaining, monthlyRemaining }
}
