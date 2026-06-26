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
    /** Pro-rata weekly slice: monthlyAmount × 7 / daysInMonth. */
    weeklyRate: number
    /** Unspent (positive) or overspent (negative) carry from completed weeks this month. */
    carry: number
    /** Amount logged against this row during the current ISO week (Mon–today). */
    spentThisWeek: number
    /** Weekly allowance (rate + carry) minus what's been spent so far this week. */
    remaining: number
    /** What's left for the whole month. */
    monthlyRemaining: number
}

/**
 * Weekly-budget maths for a single row given today's date. The weekly rate is
 * the month's budget multiplied by 7/daysInMonth (a natural pro-rata slice).
 * Carry accumulates across completed weeks within the same month and resets at
 * month boundaries. Individual excluded days reduce the effective allowance for
 * their week proportionally, mirroring how daily budgets handle them.
 */
export function computeBudgetWeek(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    today: string,
    excluded: Set<string> = new Set()
): BudgetWeek {
    const month = monthOf(today)
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const totalDays = daysInMonth(month)
    const dailyRate = totalDays > 0 ? monthlyAmount / totalDays : 0

    const totalSpentMonth = rowSpends
        .filter((s) => s.date.startsWith(month) && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalSpentMonth

    const wStart = weekStartOf(today)

    // This week's allowance is the daily rate × the week's active days that fall
    // within the month. A full in-month week gives 7 × dailyRate (the usual
    // pro-rata slice); partial weeks at month boundaries are prorated down, so
    // the allowance — even with carry — can never exceed the month's budget.
    let activeDaysThisWeek = 0
    {
        const d = new Date(`${wStart}T00:00:00`)
        for (let i = 0; i < 7; i++) {
            const dk = localDateStr(d)
            if (dk.startsWith(month) && !excluded.has(dk)) activeDaysThisWeek++
            d.setDate(d.getDate() + 1)
        }
    }
    const weeklyRate = dailyRate * activeDaysThisWeek

    // Carry = (completed weeks before this one × weeklyRate) − spend in those weeks.
    // We work day-by-day within the month, stopping at the week boundary.
    // Excluded days within a week reduce that week's effective allowance.
    const monthStart = `${month}-01`
    let carry = 0

    if (wStart > monthStart) {
        // Sum up completed weeks from month start to end of last week.
        const lastWeekEndDate = new Date(`${wStart}T00:00:00`)
        lastWeekEndDate.setDate(lastWeekEndDate.getDate() - 1)
        const lastWeekEndStr = localDateStr(lastWeekEndDate)

        // Walk week-by-week from month start up to (but not including) current week.
        let cursor = weekStartOf(monthStart)
        while (cursor <= lastWeekEndStr) {
            const wEnd = weekEndOf(cursor)
            // Active days in this week that fall within the month.
            let activeDaysInWeek = 0
            const d = new Date(`${cursor}T00:00:00`)
            for (let i = 0; i < 7; i++) {
                const dk = localDateStr(d)
                if (dk >= monthStart && dk <= lastWeekEndStr && !excluded.has(dk)) {
                    activeDaysInWeek++
                }
                d.setDate(d.getDate() + 1)
            }
            // Effective weekly allowance = daily rate × active days in this partial/full week.
            const weekAllowance = dailyRate * activeDaysInWeek
            const weekSpend = rowSpends
                .filter((s) => s.date >= cursor && s.date <= wEnd && s.date >= monthStart && !excluded.has(s.date))
                .reduce((sum, s) => sum + s.amount, 0)
            carry += weekAllowance - weekSpend

            // Advance to next week.
            const next = new Date(`${wEnd}T00:00:00`)
            next.setDate(next.getDate() + 1)
            cursor = localDateStr(next)
        }
    }

    const spentThisWeek = rowSpends
        .filter((s) => s.date >= wStart && s.date <= today && s.date.startsWith(month) && !excluded.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)

    const remaining = weeklyRate + carry - spentThisWeek

    return { monthlyAmount, weeklyRate, carry, spentThisWeek, remaining, monthlyRemaining }
}
