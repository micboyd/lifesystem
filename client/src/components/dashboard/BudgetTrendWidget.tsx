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
import { monthOf } from '../../lib/budget'
import { addMonths } from '../../lib/finance'
import { useAuth } from '../../context/AuthContext'
import { monthTrend, type MonthBudgetTrend } from '../../lib/budgetTrends'
import { formatAmount } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { FinanceGroup, FinanceRow } from '../../types'

const fmt = formatAmount
const MONTHS_BACK = 6

export default function BudgetTrendWidget({ date }: { date: string }) {
    useMoneyHidden() // re-render when money is hidden/shown
    const { user } = useAuth()
    const financeStartMonth = user?.settings?.financeStartDate?.slice(0, 7) ?? null
    const [trends, setTrends] = useState<MonthBudgetTrend[]>([])
    const currentMonth = monthOf(date)
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const loading = loadedKey !== currentMonth
    const budgetVersion = useDataVersion('budget')

    useEffect(() => {
        let active = true
        const months = Array.from({ length: MONTHS_BACK }, (_, i) =>
            addMonths(currentMonth, -(MONTHS_BACK - 1 - i))
        ).filter((m) => !financeStartMonth || m >= financeStartMonth)
        Promise.all([
            listGroups(),
            listRows(),
            ...months.map((m) =>
                Promise.all([
                    listEntries(m),
                    listBudgetSpends({ month: m }),
                    listBudgetExclusions(m),
                ]).then(([entries, spends, exclusions]) => ({
                    month: m,
                    entries,
                    spends,
                    excludedDates: new Set(exclusions.map((d) => d.date)),
                }))
            ),
        ])
            .then((results) => {
                if (!active) return
                const groups = results[0] as FinanceGroup[]
                const rows = results[1] as FinanceRow[]
                const monthly = results.slice(2) as Parameters<typeof monthTrend>[2][]
                setTrends(monthly.map((m) => monthTrend(groups, rows, m)))
            })
            .finally(() => {
                if (active) setLoadedKey(currentMonth)
            })
        return () => {
            active = false
        }
    }, [currentMonth, budgetVersion])

    const hasData = trends.some((t) => t.budget > 0 || t.spent > 0)
    const scale = Math.max(1, ...trends.map((t) => Math.max(t.budget, t.spent)))
    const overMonths = trends.filter((t) => t.budget > 0 && t.over).length
    const trackedMonths = trends.filter((t) => t.budget > 0).length
    const avgSpend =
        trackedMonths > 0
            ? trends.filter((t) => t.budget > 0).reduce((s, t) => s + t.spent, 0) / trackedMonths
            : 0

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget vs actual</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        Spend against target over the last {MONTHS_BACK} months
                    </p>
                </div>
                <Link
                    to="/finances/daily-log"
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Logs
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : !hasData ? (
                <p className="py-4 text-sm text-neutral-400">
                    No budget history yet.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Track spending on a budget
                    </Link>{' '}
                    to see the trend build up.
                </p>
            ) : (
                <>
                    {/* Summary */}
                    <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                        <div>
                            <span className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
                                £{fmt(avgSpend)}
                            </span>
                            <span className="ml-1.5 text-xs font-medium text-neutral-400">
                                avg / month
                            </span>
                        </div>
                        <div className="text-xs font-medium text-neutral-400">
                            <span
                                className={
                                    overMonths > 0
                                        ? 'font-bold text-red-500'
                                        : 'font-bold text-emerald-600'
                                }
                            >
                                {overMonths}
                            </span>{' '}
                            of {trackedMonths} months over budget
                        </div>
                    </div>

                    {/* Bars */}
                    <div className="flex items-end justify-between gap-2 sm:gap-3">
                        {trends.map((t) => {
                            const spentPct = Math.round((t.spent / scale) * 100)
                            const budgetPct = Math.round((t.budget / scale) * 100)
                            const empty = t.budget === 0 && t.spent === 0
                            return (
                                <div
                                    key={t.month}
                                    className="flex flex-1 flex-col items-center gap-2"
                                    title={`${t.label}: £${fmt(t.spent)} spent of £${fmt(t.budget)} budget`}
                                >
                                    <span
                                        className={`text-[10px] tabular-nums ${
                                            empty
                                                ? 'text-neutral-300'
                                                : t.over
                                                  ? 'text-red-500'
                                                  : 'text-neutral-500'
                                        }`}
                                    >
                                        {empty ? '—' : `£${fmt(t.spent, 0)}`}
                                    </span>
                                    {/* Track with target line + spend fill */}
                                    <div className="relative flex h-28 w-full items-end overflow-hidden rounded-lg bg-neutral-100">
                                        <div
                                            className={`w-full rounded-lg transition-all duration-500 ${
                                                t.over ? 'bg-red-400' : 'bg-emerald-400'
                                            }`}
                                            style={{ height: `${spentPct}%` }}
                                        />
                                        {t.budget > 0 && (
                                            <div
                                                className="absolute inset-x-0 border-t-2 border-dashed border-neutral-900/60"
                                                style={{ bottom: `${budgetPct}%` }}
                                                aria-hidden="true"
                                            />
                                        )}
                                    </div>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                                        {t.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 flex items-center gap-4 text-[11px] text-neutral-400">
                        <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Under
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-red-400" /> Over
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-neutral-900/60" />{' '}
                            Target
                        </span>
                    </div>
                </>
            )}

            <CardFooter>
                <Link
                    to="/finances/budgets"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-chart-column text-xs" aria-hidden="true" />
                    Manage budgets
                </Link>
            </CardFooter>
        </Card>
    )
}
