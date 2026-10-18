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
import { monthOf } from '../../lib/budget'
import { spendSummary } from '../../lib/budgetDiscipline'
import { rowVisibleInMonth, recurringAmountForMonth } from '../../lib/finance'
import { formatAmount } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend, BudgetTopUp } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = formatAmount

/**
 * Day-off state — shown when today is excluded. Excluded days carry no
 * allowance by design, so we surface that plainly instead of a confusing £0.
 */
function DayOffNotice({ label }: { label: string }) {
    return (
        <div className="flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-3 ring-1 ring-neutral-900/[0.04]">
            <i className="fa-solid fa-plane-departure text-sm text-neutral-500" aria-hidden="true" />
            <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                    Day off — no budget
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                    {label}
                </p>
            </div>
        </div>
    )
}

// ── Main widget ───────────────────────────────────────────────────────────────

/**
 * What's safe to spend today, pooled across every tracked budget — daily rows
 * on their daily rate, weekly rows on today's share of the week.
 */
export default function BudgetWidget({ date }: { date: string }) {
    useMoneyHidden() // re-render when money is hidden/shown
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [topUps, setTopUps] = useState<BudgetTopUp[]>([])
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
    const hasAmounts = trackedRows.some((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? recurringAmountForMonth(r, month) ?? 0) > 0
    })

    // Pooled via the shared engine, so this widget agrees with the pill and the
    // insights strip.
    const summary = spendSummary(groups, rows, { entries, spends, excluded: excludedDates, topUps }, date)
    const totals = summary.perRow.reduce(
        (acc, r) => {
            acc.allowance += r.today.allowance
            acc.spent += r.today.spent
            acc.remaining += r.today.safe
            acc.monthlyRemaining += r.day.monthlyRemaining
            return acc
        },
        { allowance: 0, spent: 0, remaining: 0, monthlyRemaining: 0 }
    )
    const dayOff = excludedDates.has(date)
    const dayOffLabel = new Date(`${date}T00:00:00`).toLocaleDateString('default', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-500">
                        {trackedRows.length > 0
                            ? `Across ${trackedRows.length} budget${trackedRows.length !== 1 ? 's' : ''}`
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
                <p className="py-4 text-sm text-neutral-500">
                    No budgets yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Add some on the Budgets tab.
                    </Link>
                </p>
            ) : trackedRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-500">
                    No tracked budgets for today.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Turn on tracking for a budget.
                    </Link>
                </p>
            ) : !hasAmounts ? (
                <p className="py-4 text-sm text-neutral-500">
                    No amounts set on your budgets yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Set amounts on the Monthly tab.
                    </Link>
                </p>
            ) : (
                dayOff ? (
                    <div className="rounded-2xl bg-white p-5 ring-1 ring-neutral-900/[0.06]">
                        <DayOffNotice label={dayOffLabel} />
                        {totals.monthlyRemaining !== 0 && (
                            <p
                                className={`mt-3 text-[11px] font-semibold ${totals.monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-500'}`}
                            >
                                £{fmt(Math.abs(totals.monthlyRemaining))}{' '}
                                {totals.monthlyRemaining < 0 ? 'over this month' : 'left this month'}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="rounded-2xl bg-white p-5 ring-1 ring-neutral-900/[0.06]">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-coral-600">
                                    Safe to spend today
                                </p>
                                <p
                                    className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                                        totals.remaining >= 0 ? 'text-emerald-600' : 'text-red-500'
                                    }`}
                                >
                                    £{fmt(Math.abs(totals.remaining))}
                                    {totals.remaining < 0 && <span className="ml-1 text-base font-normal">over</span>}
                                </p>
                                {totals.monthlyRemaining !== 0 && (
                                    <p
                                        className={`mt-0.5 text-[11px] font-semibold ${totals.monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-500'}`}
                                    >
                                        £{fmt(Math.abs(totals.monthlyRemaining))}{' '}
                                        {totals.monthlyRemaining < 0 ? 'over this month' : 'left this month'}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-coral-600">
                                    Budget today
                                </p>
                                <p className="mt-1 text-xl font-bold tabular-nums text-neutral-700">
                                    £{fmt(totals.allowance)}
                                </p>
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
                )
            )}

        </Card>
    )
}
