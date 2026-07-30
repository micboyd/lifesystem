import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
    listBudgetTopUps,
} from '../../services/finances'
import { computeBudgetDay, computeBudgetWeek, monthOf, dayNumOf, clampedWeekRange, activeDaysBetween } from '../../lib/budget'
import { spendSummary } from '../../lib/budgetDiscipline'
import Select from '../Select'
import { rowVisibleInMonth, recurringAmountForMonth } from '../../lib/finance'
import { formatAmount } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend, BudgetTopUp } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = formatAmount

/** Sentinel filter value for the pooled "all budgets" view. */
const TOTAL = '__total__'

/**
 * Day-off state for a budget column — shown when the day (or the whole clamped
 * week) is excluded. Excluded days carry no allowance by design, so we surface
 * that plainly instead of a confusing £0 target.
 */
function DayOffNotice({ label, scope }: { label: string; scope: 'day' | 'week' }) {
    return (
        <div className="flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-3 ring-1 ring-black/[0.04]">
            <i className="fa-solid fa-plane-departure text-sm text-neutral-400" aria-hidden="true" />
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Day off — no budget
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-400">
                    {scope === 'week' ? `${label} · every day excluded` : label}
                </p>
            </div>
        </div>
    )
}

// ── Per-budget column ─────────────────────────────────────────────────────────

interface BudgetColProps {
    row: FinanceRow
    entry: FinanceEntry | undefined
    rowSpends: BudgetSpend[]
    rowTopUps: BudgetTopUp[]
    date: string
    excludedDates: Set<string>
}

function BudgetCol({ row, entry, rowSpends, rowTopUps, date, excludedDates }: BudgetColProps) {
    const dayNum = dayNumOf(date)
    const { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining } =
        computeBudgetDay(row, entry, rowSpends, date, excludedDates, rowTopUps)
    // A day off carries no allowance — its spend belongs to the day-off pot, not
    // this budget — so show the day-off state rather than a bare £0 target.
    const isExcluded = excludedDates.has(date)

    if (isExcluded) {
        const dayLabel = new Date(`${date}T00:00:00`).toLocaleDateString('default', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        })
        return (
            <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
                <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>
                <DayOffNotice label={dayLabel} scope="day" />
                {monthlyAmount > 0 && (
                    <p
                        className={[
                            'text-xs font-semibold',
                            monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400',
                        ].join(' ')}
                    >
                        £{fmt(Math.abs(monthlyRemaining))}{' '}
                        {monthlyRemaining < 0 ? 'over monthly budget' : 'left this month'}
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
            <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>

            {/* Allowance highlight — fixed daily rate is the target */}
            <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                    Daily target
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-neutral-900">
                    £{fmt(straightDailyRate)}
                </p>
                {dayNum > 1 && (
                    <p
                        className={`mt-1 text-[11px] font-semibold ${carry >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                        {carry >= 0 ? `+£${fmt(carry)} carry` : `-£${fmt(Math.abs(carry))} deficit`}
                    </p>
                )}
            </div>

            {/* Monthly remaining */}
            {monthlyAmount > 0 && (
                <p
                    className={[
                        'text-xs font-semibold',
                        monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400',
                    ].join(' ')}
                >
                    £{fmt(Math.abs(monthlyRemaining))}{' '}
                    {monthlyRemaining < 0 ? 'over monthly budget' : 'left this month'}
                </p>
            )}

            {/* Spent / Remaining */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Spent
                    </p>
                    <p className="mt-0.5 text-base font-bold tabular-nums text-neutral-700">
                        £{fmt(spentToday)}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Remaining
                    </p>
                    <p
                        className={[
                            'mt-0.5 text-base font-bold tabular-nums',
                            remaining >= 0 ? 'text-emerald-600' : 'text-red-500',
                        ].join(' ')}
                    >
                        £{fmt(Math.abs(remaining))}
                        {remaining < 0 && (
                            <span className="ml-0.5 text-[10px] font-normal">over</span>
                        )}
                    </p>
                </div>
            </div>

            {/* Over daily target warning */}
            {spentToday > straightDailyRate && (
                <div
                    className={[
                        'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold',
                        remaining < 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700',
                    ].join(' ')}
                >
                    <i
                        className="fa-solid fa-triangle-exclamation text-[10px]"
                        aria-hidden="true"
                    />
                    {remaining < 0
                        ? `Over budget by £${fmt(Math.abs(remaining))}`
                        : `Over target — using £${fmt(spentToday - straightDailyRate)} carry`}
                </div>
            )}
        </div>
    )
}

// ── Weekly budget column ──────────────────────────────────────────────────────

function WeeklyBudgetCol({ row, entry, rowSpends, rowTopUps, date, excludedDates }: BudgetColProps) {
    const { weekStart: wStart, weekEnd: wEnd } = clampedWeekRange(date)
    const { monthlyAmount, weeklyRate, carry, spentThisWeek, remaining, monthlyRemaining } =
        computeBudgetWeek(row, entry, rowSpends, wStart, wEnd, date, excludedDates, rowTopUps)
    const weekLabel = (() => {
        const s = new Date(`${wStart}T00:00:00`)
        const e = new Date(`${wEnd}T00:00:00`)
        const sDay = s.getDate()
        const eDay = e.getDate()
        const mon = e.toLocaleString('default', { month: 'short' })
        return `${sDay}–${eDay} ${mon}`
    })()
    // Every day of this (clamped) week is a day off, so there's no allowance to
    // spread — a £0 target would just read as broken. Show the day-off state.
    const allExcluded = activeDaysBetween(wStart, wEnd, excludedDates) === 0
    const spentPct = (weeklyRate + carry) > 0
        ? Math.min(100, (spentThisWeek / (weeklyRate + carry)) * 100)
        : spentThisWeek > 0 ? 100 : 0

    if (allExcluded) {
        return (
            <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
                <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>
                <DayOffNotice label={weekLabel} scope="week" />
                {monthlyAmount > 0 && (
                    <p className={['text-xs font-semibold', monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'].join(' ')}>
                        £{fmt(Math.abs(monthlyRemaining))}{' '}
                        {monthlyRemaining < 0 ? 'over monthly budget' : 'left this month'}
                    </p>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
            <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>

            {/* Weekly allowance highlight */}
            <div className="rounded-xl bg-white px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                    Weekly target
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums text-neutral-900">
                    £{fmt(weeklyRate)}
                </p>
                <p className="mt-1 text-[10px] text-neutral-400">{weekLabel}</p>
                {carry !== 0 && (
                    <p className={`mt-1 text-[11px] font-semibold ${carry >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {carry >= 0 ? `+£${fmt(carry)} carry` : `-£${fmt(Math.abs(carry))} deficit`}
                    </p>
                )}
            </div>

            {/* Week progress bar */}
            <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${remaining >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                        style={{ width: `${spentPct}%` }}
                    />
                </div>
                <p className="mt-1 text-[10px] tabular-nums text-neutral-400">
                    £{fmt(spentThisWeek)} of £{fmt(weeklyRate + carry)} this week
                </p>
            </div>

            {/* Monthly remaining */}
            {monthlyAmount > 0 && (
                <p className={['text-xs font-semibold', monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'].join(' ')}>
                    £{fmt(Math.abs(monthlyRemaining))}{' '}
                    {monthlyRemaining < 0 ? 'over monthly budget' : 'left this month'}
                </p>
            )}

            {/* Remaining */}
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Remaining this week</p>
                <p className={['mt-0.5 text-base font-bold tabular-nums', remaining >= 0 ? 'text-emerald-600' : 'text-red-500'].join(' ')}>
                    £{fmt(Math.abs(remaining))}
                    {remaining < 0 && <span className="ml-0.5 text-[10px] font-normal">over</span>}
                </p>
            </div>
        </div>
    )
}

// ── Main widget ───────────────────────────────────────────────────────────────

/**
 * `cadence` picks the lens: 'today' pools the daily-tracked budgets on their
 * today allowance; 'week' pools the weekly-tracked budgets on their week
 * allowance. Splitting them lets the dashboard show "today only" up top and the
 * weekly outlook lower down.
 */
export default function BudgetWidget({ date, cadence = 'today' }: { date: string; cadence?: 'today' | 'week' }) {
    useMoneyHidden() // re-render when money is hidden/shown
    const isWeek = cadence === 'week'
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [topUps, setTopUps] = useState<BudgetTopUp[]>([])
    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set())
    // Derive loading from which month finished loading — avoids a synchronous
    // setState inside the fetch effect (flagged as cascading renders).
    const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
    // Which budget the filter is showing — TOTAL pools every tracked budget.
    const [selected, setSelected] = useState<string>(TOTAL)

    const month = monthOf(date)
    const loading = loadedMonth !== month
    const budgetVersion = useDataVersion('budget')

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
            listBudgetExclusions(month),
            listBudgetTopUps(month),
        ])
            .then(([g, r, e, s, x, t]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
                setExcludedDates(new Set(x.map((d) => d.date)))
                setTopUps(t)
            })
            .finally(() => {
                if (active) setLoadedMonth(month)
            })
        return () => {
            active = false
        }
    }, [month, budgetVersion])

    // Only rows whose lifecycle (and their group's) covers this month.
    const visibleBudgeted = rows.filter(
        (r) =>
            r.budgeted &&
            rowVisibleInMonth(
                r,
                month,
                groups.find((g) => g._id === r.group)
            )
    )
    const budgetedRows = visibleBudgeted
    const dailyRows = budgetedRows.filter((r) => r.budgetType === 'daily')
    const weeklyRows = budgetedRows.filter((r) => r.budgetType === 'weekly')
    const trackedRows = [...weeklyRows, ...dailyRows]
    // 'today' is one pooled figure across *every* budget (daily rows on their
    // daily rate, weekly rows on today's share of the week) — the tracking type
    // doesn't matter, only "what can I spend today". 'week' is the weekly budgets.
    const cadenceRows = isWeek ? weeklyRows : trackedRows
    const hasAmounts = cadenceRows.some((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? recurringAmountForMonth(r, month) ?? 0) > 0
    })

    // Pooled headline via the shared engine, so this widget agrees with the pill,
    // the insights strip and the Daily Report. 'today' pools every budget on its
    // today lens; 'week' pools the weekly budgets on their week lens.
    const summary = spendSummary(groups, rows, { entries, spends, excluded: excludedDates, topUps }, date)
    const cadencePerRow = isWeek
        ? summary.perRow.filter((r) => r.row.budgetType === 'weekly')
        : summary.perRow
    const lens = cadencePerRow.reduce(
        (acc, r) => {
            const l = isWeek ? r.week : r.today
            acc.allowance += l.allowance
            acc.spent += l.spent
            acc.safe += l.safe
            return acc
        },
        { allowance: 0, spent: 0, safe: 0 }
    )
    const totals = {
        allowance: lens.allowance,
        spent: lens.spent,
        remaining: lens.safe,
        monthlyRemaining: cadencePerRow.reduce((a, r) => a + r.day.monthlyRemaining, 0),
    }
    // A day off means the whole clamped week (weekly) or just today (daily) is
    // excluded, and the £0 allowance needs that context.
    const pooledAllExcluded = isWeek
        ? (() => {
              const { weekStart, weekEnd } = clampedWeekRange(date)
              return activeDaysBetween(weekStart, weekEnd, excludedDates) === 0
          })()
        : excludedDates.has(date)
    const pooledDayOffLabel = (() => {
        if (isWeek) {
            const { weekStart, weekEnd } = clampedWeekRange(date)
            const s = new Date(`${weekStart}T00:00:00`)
            const e = new Date(`${weekEnd}T00:00:00`)
            return `${s.getDate()}–${e.getDate()} ${e.toLocaleString('default', { month: 'short' })}`
        }
        return new Date(`${date}T00:00:00`).toLocaleDateString('default', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        })
    })()
    const allowanceLabel = isWeek ? 'Allowance this week' : 'Safe to spend today'

    // Per-budget drill-down is only offered on the weekly widget — 'today' is a
    // single pooled figure, so it never filters to one budget.
    const filterOptions = [
        { label: 'All budgets — total', value: TOTAL },
        ...cadenceRows.map((r) => ({ label: r.name, value: r._id })),
    ]
    const selectedValue = !isWeek
        ? TOTAL
        : selected !== TOTAL && !cadenceRows.some((r) => r._id === selected)
          ? TOTAL
          : selected
    const selectedRow = selectedValue === TOTAL ? null : cadenceRows.find((r) => r._id === selectedValue)!

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>{isWeek ? 'Weekly budget' : 'Budget'}</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        {cadenceRows.length > 0
                            ? `${isWeek ? 'Weekly spend across' : 'Across'} ${cadenceRows.length} budget${cadenceRows.length !== 1 ? 's' : ''}`
                            : 'Spend tracker'}
                    </p>
                </div>
                <CardAction to="/finances/budgets" className="mt-1">
                    Budgets
                </CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-6">
                    <Spinner />
                </div>
            ) : budgetedRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    No budgets yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Add some on the Budgets tab.
                    </Link>
                </p>
            ) : cadenceRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    {isWeek ? 'No weekly-tracked budgets for the week ahead.' : 'No tracked budgets for today.'}{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        {isWeek ? 'Enable weekly tracking on a card.' : 'Turn on tracking for a budget.'}
                    </Link>
                </p>
            ) : !hasAmounts ? (
                <p className="py-4 text-sm text-neutral-400">
                    No amounts set on your {isWeek ? 'weekly ' : ''}budgets yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Set amounts on the Monthly tab.
                    </Link>
                </p>
            ) : (
                <div className="flex flex-col gap-4">
                    {/* Filter — only the weekly widget drills into a single budget;
                        'today' is always the pooled single figure. */}
                    {isWeek && cadenceRows.length > 1 && (
                        <Select
                            value={selectedValue}
                            onChange={setSelected}
                            options={filterOptions}
                            icon="fa-solid fa-filter"
                        />
                    )}

                    {selectedRow === null && pooledAllExcluded ? (
                        /* Whole period is a day off — no allowance to pool */
                        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                            <DayOffNotice
                                label={pooledDayOffLabel}
                                scope={isWeek ? 'week' : 'day'}
                            />
                            {totals.monthlyRemaining !== 0 && (
                                <p
                                    className={`mt-3 text-[11px] font-semibold ${totals.monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'}`}
                                >
                                    £{fmt(Math.abs(totals.monthlyRemaining))}{' '}
                                    {totals.monthlyRemaining < 0 ? 'over this month' : 'left this month'}
                                </p>
                            )}
                        </div>
                    ) : selectedRow === null ? (
                        /* Pooled total across every tracked budget */
                        <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                            <div className="flex items-end justify-between gap-4">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                                        {allowanceLabel}
                                    </p>
                                    {/* 'today' leads with what's left to spend — the single
                                        actionable figure. 'week' leads with the allowance. */}
                                    <p
                                        className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                                            isWeek
                                                ? 'text-neutral-900'
                                                : totals.remaining >= 0
                                                  ? 'text-emerald-600'
                                                  : 'text-red-500'
                                        }`}
                                    >
                                        £{fmt(Math.abs(isWeek ? totals.allowance : totals.remaining))}
                                        {!isWeek && totals.remaining < 0 && (
                                            <span className="ml-1 text-base font-normal">over</span>
                                        )}
                                    </p>
                                    {totals.monthlyRemaining !== 0 && (
                                        <p
                                            className={`mt-0.5 text-[11px] font-semibold ${totals.monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'}`}
                                        >
                                            £{fmt(Math.abs(totals.monthlyRemaining))}{' '}
                                            {totals.monthlyRemaining < 0 ? 'over this month' : 'left this month'}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                                        {isWeek ? 'Remaining' : 'Budget today'}
                                    </p>
                                    {isWeek ? (
                                        <p
                                            className={`mt-1 text-xl font-bold tabular-nums ${totals.remaining >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                                        >
                                            £{fmt(Math.abs(totals.remaining))}
                                            {totals.remaining < 0 && <span className="ml-1 text-xs font-normal">over</span>}
                                        </p>
                                    ) : (
                                        <p className="mt-1 text-xl font-bold tabular-nums text-neutral-700">
                                            £{fmt(totals.allowance)}
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4">
                                <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${totals.remaining >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                                        style={{ width: `${Math.min(100, (totals.spent / (totals.allowance || 1)) * 100)}%` }}
                                    />
                                </div>
                                <div className="mt-2 flex justify-between text-[11px] tabular-nums text-neutral-500">
                                    <span>£{fmt(totals.spent)} spent</span>
                                    <span>£{fmt(totals.allowance)}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Single chosen budget */
                        <div className="flex">
                            {isWeek ? (
                                <WeeklyBudgetCol
                                    row={selectedRow}
                                    entry={entries.find((e) => e.row === selectedRow._id)}
                                    rowSpends={spends.filter((s) => s.row === selectedRow._id)}
                                    rowTopUps={topUps.filter((t) => t.row === selectedRow._id)}
                                    date={date}
                                    excludedDates={excludedDates}
                                />
                            ) : (
                                <BudgetCol
                                    row={selectedRow}
                                    entry={entries.find((e) => e.row === selectedRow._id)}
                                    rowSpends={spends.filter((s) => s.row === selectedRow._id)}
                                    rowTopUps={topUps.filter((t) => t.row === selectedRow._id)}
                                    date={date}
                                    excludedDates={excludedDates}
                                />
                            )}
                        </div>
                    )}
                </div>
            )}

        </Card>
    )
}
