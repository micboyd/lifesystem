import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../types'
import { computeBudgetDay, computeBudgetWeek, monthOf, dayNumOf, daysInMonth, weekStartOf, weekEndOf } from './budget'
import { rowVisibleInMonth } from './finance'
import { addDays } from './calendar'

/** Per-month data the discipline maths needs (rows/groups are global). */
export interface MonthBudgetData {
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excluded: Set<string>
}

/** Daily-tracked, budgeted rows visible in `month`. */
export function dailyRowsInMonth(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    month: string
): FinanceRow[] {
    return rows.filter(
        (r) =>
            r.budgeted &&
            r.budgetType === 'daily' &&
            rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
}

/** Weekly-tracked, budgeted rows visible in `month`. */
export function weeklyRowsInMonth(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    month: string
): FinanceRow[] {
    return rows.filter(
        (r) =>
            r.budgeted &&
            r.budgetType === 'weekly' &&
            rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
}

/** All tracked (daily + weekly) budgeted rows visible in `month`. */
export function trackedRowsInMonth(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    month: string
): FinanceRow[] {
    return rows.filter(
        (r) =>
            r.budgeted &&
            (r.budgetType === 'daily' || r.budgetType === 'weekly') &&
            rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
}

export interface DayDiscipline {
    date: string
    /** Sum of targets for this date (daily rate for daily rows; weekly rate÷7 for weekly rows). */
    target: number
    /** Sum logged that day (excluded days count as 0). */
    spent: number
    /** under = on/under budget · over = blew it · skip = excluded or no budget · future. */
    status: 'under' | 'over' | 'skip' | 'future'
    /** True when this day's status is derived from a weekly-granularity budget assessment. */
    isWeekly?: boolean
}

/** Under/over status for a single date, using that date's month bucket. */
export function dayDiscipline(
    date: string,
    groups: FinanceGroup[],
    rows: FinanceRow[],
    data: MonthBudgetData,
    today: string
): DayDiscipline {
    const month = monthOf(date)
    const dRows = dailyRowsInMonth(groups, rows, month)
    const wRows = weeklyRowsInMonth(groups, rows, month)
    const isExcluded = data.excluded.has(date)

    let target = 0
    let spent = 0

    // Daily rows: score per day
    for (const row of dRows) {
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const bd = computeBudgetDay(row, entry, rowSpends, date, data.excluded)
        target += bd.straightDailyRate
        if (!isExcluded) {
            spent += rowSpends.filter((s) => s.date === date).reduce((a, s) => a + s.amount, 0)
        }
    }

    // Weekly rows: contribute daily-rate-equivalent target; status determined by weekly totals
    // (handled in summariseDiscipline for weekly granularity dots)
    for (const row of wRows) {
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const bw = computeBudgetWeek(row, entry, rowSpends, date, data.excluded)
        target += bw.weeklyRate / 7
        if (!isExcluded) {
            spent += rowSpends.filter((s) => s.date === date).reduce((a, s) => a + s.amount, 0)
        }
    }

    let status: DayDiscipline['status']
    if (date > today) status = 'future'
    else if (isExcluded || target <= 0) status = 'skip'
    else status = spent <= target + 0.005 ? 'under' : 'over'

    return { date, target, spent, status }
}

/**
 * Weekly discipline assessment for a single ISO week ending on `weekEnd` (or
 * `today` if the week is still in progress). Used by summariseDiscipline to
 * produce one "dot" per week for weekly-budget rows.
 *
 * By default an in-progress week (one whose end is after `today`) reports
 * `future`. Pass `running: true` to instead grade it on the spend logged so far
 * — the day grid uses this so a week's already-elapsed days aren't greyed out
 * as upcoming while the week is still open.
 */
export function weekDiscipline(
    weekEnd: string,
    groups: FinanceGroup[],
    rows: FinanceRow[],
    byMonth: Map<string, MonthBudgetData>,
    today: string,
    running = false
): DayDiscipline {
    const effectiveEnd = weekEnd > today ? today : weekEnd
    const wStart = weekStartOf(weekEnd)

    // Gather all months that overlap this week
    const months = new Set([monthOf(wStart), monthOf(effectiveEnd)])
    let totalTarget = 0
    let totalSpent = 0
    let hasAny = false

    for (const month of months) {
        const data = byMonth.get(month) ?? { entries: [], spends: [], excluded: new Set() }
        const wRows = weeklyRowsInMonth(groups, rows, month)
        for (const row of wRows) {
            hasAny = true
            const entry = data.entries.find((e) => e.row === row._id)
            const rowSpends = data.spends.filter((s) => s.row === row._id)
            const bw = computeBudgetWeek(row, entry, rowSpends, effectiveEnd, data.excluded)
            totalTarget += bw.weeklyRate + bw.carry
            totalSpent += bw.spentThisWeek
        }
    }

    let status: DayDiscipline['status']
    if (!running && weekEnd > today) status = 'future'
    else if (!hasAny || totalTarget <= 0) status = 'skip'
    else status = totalSpent <= totalTarget + 0.005 ? 'under' : 'over'

    return { date: weekEnd, target: totalTarget, spent: totalSpent, status, isWeekly: true }
}

export interface DisciplineSummary {
    days: DayDiscipline[]
    /** Consecutive on-budget days ending today (an in-progress today never breaks it). */
    currentStreak: number
    /** Longest on-budget run within the window. */
    bestStreak: number
    /** % of eligible (past, non-skipped) days that were on budget. */
    score: number
    /** Eligible day count behind the score. */
    eligibleDays: number
    overDays: number
}

/**
 * Roll a date range into discipline stats. `byMonth` maps "YYYY-MM" to that
 * month's entries/spends/exclusions. Days are walked oldest→newest; the streak
 * is counted back from today, where an as-yet-unfinished today can't break a
 * run but an overspend on any completed day does.
 *
 * When weekly budgets exist, the dot strip uses week-granularity dots for those
 * rows and day-granularity dots for daily rows. If both exist, the day strip
 * shows blended per-day status (daily rows scored daily, weekly rows scored by
 * the week they belong to).
 */
export function summariseDiscipline(
    from: string,
    today: string,
    groups: FinanceGroup[],
    rows: FinanceRow[],
    byMonth: Map<string, MonthBudgetData>
): DisciplineSummary {
    const hasWeekly = rows.some((r) => r.budgeted && r.budgetType === 'weekly')

    // Pre-compute weekly statuses so days in the same week share a status.
    const weeklyStatusCache = new Map<string, DayDiscipline['status']>()
    if (hasWeekly) {
        for (let d = from; d <= today; d = addDays(d, 1)) {
            const wEnd = weekEndOf(d)
            if (!weeklyStatusCache.has(wEnd)) {
                weeklyStatusCache.set(wEnd, weekDiscipline(wEnd, groups, rows, byMonth, today).status)
            }
        }
    }

    const days: DayDiscipline[] = []
    for (let d = from; d <= today; d = addDays(d, 1)) {
        const data = byMonth.get(monthOf(d)) ?? { entries: [], spends: [], excluded: new Set() }
        const dd = dayDiscipline(d, groups, rows, data, today)
        if (hasWeekly && !rows.some((r) => r.budgeted && r.budgetType === 'daily')) {
            // Pure weekly mode: override status from week assessment
            const wStatus = weeklyStatusCache.get(weekEndOf(d)) ?? 'skip'
            days.push({ ...dd, status: d > today ? 'future' : wStatus, isWeekly: true })
        } else {
            days.push(dd)
        }
    }

    const statusOf = new Map(days.map((d) => [d.date, d.status]))

    // Current streak: walk back from today; skip days carry through, over breaks.
    let currentStreak = 0
    for (let cursor = today; ; cursor = addDays(cursor, -1)) {
        const st = statusOf.get(cursor)
        if (st === undefined) break
        if (st === 'skip' || st === 'future') continue
        if (st === 'over') break
        currentStreak++
    }

    // Best streak within the window.
    let bestStreak = 0
    let run = 0
    for (const d of days) {
        if (d.status === 'under') {
            run++
            bestStreak = Math.max(bestStreak, run)
        } else if (d.status === 'over') {
            run = 0
        }
    }

    const eligible = days.filter((d) => d.status === 'under' || d.status === 'over')
    const overDays = eligible.filter((d) => d.status === 'over').length
    const score = eligible.length > 0 ? Math.round((1 - overDays / eligible.length) * 100) : 100

    return {
        days,
        currentStreak,
        bestStreak,
        score,
        eligibleDays: eligible.length,
        overDays,
    }
}

export interface SafeToSpend {
    /** Pooled allowance left across all daily budgets today (rate + carry − spent). */
    remaining: number
    /** Logged across daily budgets today. */
    spentToday: number
    /** Pooled straight daily target. */
    target: number
    /** Whether any daily budgets with amounts exist. */
    hasBudgets: boolean
}

/** Today's pooled safe-to-spend across every daily and weekly budget.
 *
 * For daily rows: uses the rolling daily allowance (rate + carry − spent today).
 * For weekly rows: spreads the week's remaining allowance evenly over the active
 * days left in the current week (including today), so the pill stays meaningful
 * day-by-day even when tracking at weekly granularity.
 */
export function safeToSpendToday(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    data: MonthBudgetData,
    today: string
): SafeToSpend {
    const month = monthOf(today)
    const wEnd = weekEndOf(today)

    const allDailyRows = dailyRowsInMonth(groups, rows, month).filter((r) => {
        const entry = data.entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })
    const allWeeklyRows = weeklyRowsInMonth(groups, rows, month).filter((r) => {
        const entry = data.entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })

    let remaining = 0
    let spentToday = 0
    let target = 0

    for (const row of allDailyRows) {
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const bd = computeBudgetDay(row, entry, rowSpends, today, data.excluded)
        remaining += bd.remaining
        spentToday += bd.spentToday
        target += bd.straightDailyRate
    }

    for (const row of allWeeklyRows) {
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const bw = computeBudgetWeek(row, entry, rowSpends, today, data.excluded)
        // Count active days remaining in the week from today (inclusive).
        let activeDaysLeft = 0
        let d = new Date(`${today}T00:00:00`)
        const end = new Date(`${wEnd}T00:00:00`)
        while (d <= end) {
            const dk = d.toISOString().slice(0, 10)
            if (!data.excluded.has(dk)) activeDaysLeft++
            d.setDate(d.getDate() + 1)
        }
        // Today's share = weekly remaining spread evenly across active days left.
        const todayShare = activeDaysLeft > 0 ? bw.remaining / activeDaysLeft : bw.remaining
        // Spent today from this weekly row.
        const st = rowSpends
            .filter((s) => s.date === today && !data.excluded.has(s.date))
            .reduce((sum, s) => sum + s.amount, 0)
        remaining += todayShare
        spentToday += st
        target += bw.weeklyRate / 7
    }

    const hasBudgets = allDailyRows.length > 0 || allWeeklyRows.length > 0
    return { remaining, spentToday, target, hasBudgets }
}

/** Non-excluded days left in this month after `today` — used for overspend knock-on. */
export function remainingActiveDays(today: string, excluded: Set<string>): number {
    const month = monthOf(today)
    const total = daysInMonth(month)
    let n = 0
    for (let d = dayNumOf(today) + 1; d <= total; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`
        if (!excluded.has(date)) n++
    }
    return n
}
