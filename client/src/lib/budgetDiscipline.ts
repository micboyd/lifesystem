import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend, BudgetTopUp } from '../types'
import {
    computeBudgetDay,
    computeBudgetWeek,
    monthOf,
    dayNumOf,
    daysInMonth,
    weekStartOf,
    weekEndOf,
    clampedWeekRange,
    activeDaysBetween,
    type BudgetDay,
    type BudgetWeek,
} from './budget'
import { rowVisibleInMonth, recurringAmountForMonth } from './finance'
import { addDays } from './calendar'

/** Per-month data the discipline maths needs (rows/groups are global). */
export interface MonthBudgetData {
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excluded: Set<string>
    /** Spending top-ups for the month (optional; used by safe-to-spend). */
    topUps?: BudgetTopUp[]
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
        // Clamp to the month so the week is sliced at the 1st, matching the Budgets page.
        const { weekStart, weekEnd } = clampedWeekRange(date)
        const bw = computeBudgetWeek(row, entry, rowSpends, weekStart, weekEnd, date, data.excluded)
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
 * Weekly discipline for the slice of an ISO week (ending on `weekEnd`) that
 * falls inside `month`. Weeks are chopped at the month edges — the first and
 * last weeks are assessed on just their in-month days and never spill into a
 * neighbouring month — matching how the Daily Log groups weeks.
 *
 * By default an in-progress week (one whose in-month end is after `today`)
 * reports `future`. Pass `running: true` to instead grade it on the spend logged
 * so far — the day grid uses this so a week's already-elapsed days aren't greyed
 * out as upcoming while the week is still open.
 */
export function weekDiscipline(
    month: string,
    weekEnd: string,
    groups: FinanceGroup[],
    rows: FinanceRow[],
    byMonth: Map<string, MonthBudgetData>,
    today: string,
    running = false
): DayDiscipline {
    // Chop the week to the month so edge weeks stay within it.
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    const clampedEnd = weekEnd > monthEnd ? monthEnd : weekEnd

    const data = byMonth.get(month) ?? { entries: [], spends: [], excluded: new Set() }
    const wRows = weeklyRowsInMonth(groups, rows, month)

    let totalTarget = 0
    let totalSpent = 0
    let hasAny = false

    for (const row of wRows) {
        hasAny = true
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const clampedStart = weekStartOf(weekEnd) < `${month}-01` ? `${month}-01` : weekStartOf(weekEnd)
        const bw = computeBudgetWeek(row, entry, rowSpends, clampedStart, clampedEnd, today, data.excluded)
        totalTarget += bw.weeklyRate + bw.carry
        totalSpent += bw.spentThisWeek
    }

    let status: DayDiscipline['status']
    if (!running && clampedEnd > today) status = 'future'
    else if (!hasAny || totalTarget <= 0) status = 'skip'
    else status = totalSpent <= totalTarget + 0.005 ? 'under' : 'over'

    return { date: clampedEnd, target: totalTarget, spent: totalSpent, status, isWeekly: true }
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

    // Pre-compute weekly statuses so days in the same (month-bounded) week share
    // a status. Keyed by month + week end since edge weeks are chopped per month.
    const weeklyStatusCache = new Map<string, DayDiscipline['status']>()
    if (hasWeekly) {
        for (let d = from; d <= today; d = addDays(d, 1)) {
            const key = `${monthOf(d)}|${weekEndOf(d)}`
            if (!weeklyStatusCache.has(key)) {
                weeklyStatusCache.set(
                    key,
                    weekDiscipline(monthOf(d), weekEndOf(d), groups, rows, byMonth, today).status
                )
            }
        }
    }

    const days: DayDiscipline[] = []
    for (let d = from; d <= today; d = addDays(d, 1)) {
        const data = byMonth.get(monthOf(d)) ?? { entries: [], spends: [], excluded: new Set() }
        const dd = dayDiscipline(d, groups, rows, data, today)
        if (hasWeekly && !rows.some((r) => r.budgeted && r.budgetType === 'daily')) {
            // Pure weekly mode: override status from week assessment
            const wStatus = weeklyStatusCache.get(`${monthOf(d)}|${weekEndOf(d)}`) ?? 'skip'
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

/** One period's safe-to-spend triple. `safe = allowance − spent`. */
export interface SpendLens {
    /** What can still be safely spent in this period and stay on track. */
    safe: number
    /** Total available for the period (safe + spent), carry + top-ups included. */
    allowance: number
    /** Logged in this period so far (excluded days count as 0). */
    spent: number
}

export interface RowSpendSummary {
    row: FinanceRow
    /** Safe-to-spend lens for `date` itself. */
    today: SpendLens
    /** Safe-to-spend lens for the month-clamped ISO week containing `date`. */
    week: SpendLens
    /** Underlying daily maths — straight rate, carry, monthly remaining. */
    day: BudgetDay
    /** Underlying weekly maths — weekly rate, carry, monthly remaining. */
    weekMaths: BudgetWeek
}

/**
 * The two safe-to-spend lenses (today + this week) for a single tracked row — the
 * shared per-row engine behind every finance surface, so no two screens can drift.
 * Both lenses are projections of the *same* envelope:
 *
 *   • today — daily rows use the rolling daily allowance (rate + carry − spent);
 *     weekly rows spread the week's pot *as it stood this morning* over the
 *     remaining active days, then subtract today's spend.
 *   • week — every row (daily or weekly) is assessed by {@link computeBudgetWeek}
 *     over the month-clamped week, so a daily row's "this week" is just its daily
 *     rate summed across the week's active days plus carry.
 *
 * Carry and (spending) top-ups are included throughout.
 */
export function rowSpendSummary(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    rowTopUps: BudgetTopUp[],
    date: string,
    excluded: Set<string>
): RowSpendSummary {
    const { weekStart, weekEnd } = clampedWeekRange(date)
    const day = computeBudgetDay(row, entry, rowSpends, date, excluded, rowTopUps)
    const weekMaths = computeBudgetWeek(row, entry, rowSpends, weekStart, weekEnd, date, excluded, rowTopUps)

    let todaySafe: number
    let todaySpent: number
    if (row.budgetType === 'weekly') {
        todaySpent = excluded.has(date)
            ? 0
            : rowSpends.filter((s) => s.date === date).reduce((sum, s) => sum + s.amount, 0)
        const daysLeft = activeDaysBetween(date, weekEnd, excluded)
        // Even share of the week's pot as it stood this morning, minus today's spend.
        const potBeforeToday = weekMaths.remaining + todaySpent
        todaySafe = daysLeft > 0 ? potBeforeToday / daysLeft - todaySpent : weekMaths.remaining
    } else {
        todaySafe = day.remaining
        todaySpent = day.spentToday
    }

    return {
        row,
        today: { safe: todaySafe, spent: todaySpent, allowance: todaySafe + todaySpent },
        week: {
            safe: weekMaths.remaining,
            spent: weekMaths.spentThisWeek,
            allowance: weekMaths.remaining + weekMaths.spentThisWeek,
        },
        day,
        weekMaths,
    }
}

export interface SpendSummary {
    /** Pooled safe-to-spend for `date` across every tracked budget. */
    today: SpendLens
    /** Pooled safe-to-spend for this week across every tracked budget. */
    week: SpendLens
    /** What's left of the whole month across every tracked budget. */
    monthlyRemaining: number
    /** Per-row breakdown (rows with an amount set) — for cards and context lines. */
    perRow: RowSpendSummary[]
    /** Whether any tracked budget with an amount exists. */
    hasBudgets: boolean
}

/**
 * Pooled safe-to-spend across every tracked (daily + weekly) budget, in both the
 * *today* and *this-week* lenses. The single source of truth for the dashboard
 * budget widget, the insights strip, the safe-to-spend pill and the Daily Report —
 * pass `data.topUps` so top-ups are counted.
 */
export function spendSummary(
    groups: FinanceGroup[],
    rows: FinanceRow[],
    data: MonthBudgetData,
    date: string
): SpendSummary {
    const month = monthOf(date)
    const topUps = data.topUps ?? []
    const tracked = trackedRowsInMonth(groups, rows, month).filter((r) => {
        const entry = data.entries.find((e) => e.row === r._id)
        return (entry?.amount ?? recurringAmountForMonth(r, month) ?? 0) > 0
    })

    const today: SpendLens = { safe: 0, allowance: 0, spent: 0 }
    const week: SpendLens = { safe: 0, allowance: 0, spent: 0 }
    let monthlyRemaining = 0
    const perRow: RowSpendSummary[] = []

    for (const row of tracked) {
        const entry = data.entries.find((e) => e.row === row._id)
        const rowSpends = data.spends.filter((s) => s.row === row._id)
        const rowTopUps = topUps.filter((t) => t.row === row._id)
        const r = rowSpendSummary(row, entry, rowSpends, rowTopUps, date, data.excluded)
        today.safe += r.today.safe
        today.allowance += r.today.allowance
        today.spent += r.today.spent
        week.safe += r.week.safe
        week.allowance += r.week.allowance
        week.spent += r.week.spent
        // Both maths agree on the monthly figure; take it from the daily view.
        monthlyRemaining += r.day.monthlyRemaining
        perRow.push(r)
    }

    return { today, week, monthlyRemaining, perRow, hasBudgets: tracked.length > 0 }
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
