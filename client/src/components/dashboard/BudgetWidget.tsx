import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
} from '../../services/finances'
import { computeBudgetDay, computeBudgetWeek, monthOf, dayNumOf, weekStartOf, weekEndOf } from '../../lib/budget'
import { rowVisibleInMonth } from '../../lib/finance'
import { formatAmount } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = formatAmount

// ── Per-budget column ─────────────────────────────────────────────────────────

interface BudgetColProps {
    row: FinanceRow
    entry: FinanceEntry | undefined
    rowSpends: BudgetSpend[]
    date: string
    excludedDates: Set<string>
}

function BudgetCol({ row, entry, rowSpends, date, excludedDates }: BudgetColProps) {
    const dayNum = dayNumOf(date)
    const { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining } =
        computeBudgetDay(row, entry, rowSpends, date, excludedDates)

    return (
        <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-neutral-50 p-4">
            <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>

            {/* Dark allowance block — fixed daily rate is the target */}
            <div className="rounded-xl bg-neutral-950 px-3 py-2.5 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Daily target
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                    £{fmt(straightDailyRate)}
                </p>
                {dayNum > 1 && (
                    <p
                        className={`mt-1 text-[11px] font-semibold ${carry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
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

function WeeklyBudgetCol({ row, entry, rowSpends, date, excludedDates }: BudgetColProps) {
    const wStart = weekStartOf(date)
    const wEnd = weekEndOf(date)
    const { monthlyAmount, weeklyRate, carry, spentThisWeek, remaining, monthlyRemaining } =
        computeBudgetWeek(row, entry, rowSpends, wStart, wEnd, date, excludedDates)
    const weekLabel = (() => {
        const s = new Date(`${wStart}T00:00:00`)
        const e = new Date(`${wEnd}T00:00:00`)
        const sDay = s.getDate()
        const eDay = e.getDate()
        const mon = e.toLocaleString('default', { month: 'short' })
        return `${sDay}–${eDay} ${mon}`
    })()
    const spentPct = (weeklyRate + carry) > 0
        ? Math.min(100, (spentThisWeek / (weeklyRate + carry)) * 100)
        : spentThisWeek > 0 ? 100 : 0

    return (
        <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-neutral-50 p-4">
            <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>

            {/* Dark weekly allowance block */}
            <div className="rounded-xl bg-neutral-950 px-3 py-2.5 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                    Weekly target
                </p>
                <p className="mt-0.5 text-xl font-bold tabular-nums">
                    £{fmt(weeklyRate)}
                </p>
                <p className="mt-1 text-[10px] text-neutral-500">{weekLabel}</p>
                {carry !== 0 && (
                    <p className={`mt-1 text-[11px] font-semibold ${carry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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

export default function BudgetWidget({ date }: { date: string }) {
    useMoneyHidden() // re-render when money is hidden/shown
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set())
    // Derive loading from which month finished loading — avoids a synchronous
    // setState inside the fetch effect (flagged as cascading renders).
    const [loadedMonth, setLoadedMonth] = useState<string | null>(null)

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
        ])
            .then(([g, r, e, s, x]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
                setExcludedDates(new Set(x.map((d) => d.date)))
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
    const hasAmounts = trackedRows.some((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        {trackedRows.length > 0
                            ? `${weeklyRows.length > 0 ? 'Weekly' : 'Daily'} spend across ${trackedRows.length} budget${trackedRows.length !== 1 ? 's' : ''}`
                            : 'Spend tracker'}
                    </p>
                </div>
                <Link
                    to="/finances/budgets"
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Open
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
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
            ) : trackedRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    You have {budgetedRows.length} budget{budgetedRows.length !== 1 ? 's' : ''} but
                    none have weekly or daily tracking on.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Enable tracking on a card.
                    </Link>
                </p>
            ) : !hasAmounts ? (
                <p className="py-4 text-sm text-neutral-400">
                    No amounts set on your daily budgets yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Set amounts on the Monthly tab.
                    </Link>
                </p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {weeklyRows.map((row) => (
                        <WeeklyBudgetCol
                            key={row._id}
                            row={row}
                            entry={entries.find((e) => e.row === row._id)}
                            rowSpends={spends.filter((s) => s.row === row._id)}
                            date={date}
                            excludedDates={excludedDates}
                        />
                    ))}
                    {dailyRows.map((row) => (
                        <BudgetCol
                            key={row._id}
                            row={row}
                            entry={entries.find((e) => e.row === row._id)}
                            rowSpends={spends.filter((s) => s.row === row._id)}
                            date={date}
                            excludedDates={excludedDates}
                        />
                    ))}
                </div>
            )}

            <CardFooter>
                <Link
                    to="/finances/budgets"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-piggy-bank text-xs" aria-hidden="true" />
                    View budgets
                </Link>
            </CardFooter>
        </Card>
    )
}
