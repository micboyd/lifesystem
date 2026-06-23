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
import { addDays, todayKey } from '../../lib/calendar'
import {
    summariseDiscipline,
    type DisciplineSummary,
    type MonthBudgetData,
} from '../../lib/budgetDiscipline'
import type { FinanceGroup, FinanceRow } from '../../types'

const WINDOW = 30

export default function DisciplineWidget({ date }: { date: string }) {
    const budgetVersion = useDataVersion('budget')
    const today = todayKey()
    const month = monthOf(date)
    const [summary, setSummary] = useState<DisciplineSummary | null>(null)
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const loading = loadedKey !== month

    useEffect(() => {
        let active = true
        const months = [addMonths(month, -1), month]
        Promise.all([
            listGroups(),
            listRows(),
            ...months.map((m) =>
                Promise.all([
                    listEntries(m),
                    listBudgetSpends({ month: m }),
                    listBudgetExclusions(m),
                ]).then(
                    ([entries, spends, exclusions]) =>
                        [
                            m,
                            { entries, spends, excluded: new Set(exclusions.map((d) => d.date)) },
                        ] as [string, MonthBudgetData]
                )
            ),
        ])
            .then((results) => {
                if (!active) return
                const groups = results[0] as FinanceGroup[]
                const rows = results[1] as FinanceRow[]
                const byMonth = new Map(results.slice(2) as [string, MonthBudgetData][])
                setSummary(
                    summariseDiscipline(addDays(today, -(WINDOW - 1)), today, groups, rows, byMonth)
                )
            })
            .finally(() => active && setLoadedKey(month))
        return () => {
            active = false
        }
    }, [month, today, budgetVersion])

    const hasData = summary && summary.eligibleDays > 0

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget discipline</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">Periods kept under your budget target</p>
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
                    Once you're tracking spend (weekly or daily), your on-budget streak builds here.{' '}
                    <Link
                        to="/finances/budgets"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Set up a budget
                    </Link>
                    .
                </p>
            ) : (
                <>
                    {/* Streak + score */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <span
                                className={`grid h-12 w-12 place-items-center rounded-2xl text-xl ${
                                    summary!.currentStreak > 0
                                        ? 'bg-amber-100 text-amber-600'
                                        : 'bg-neutral-100 text-neutral-300'
                                }`}
                            >
                                <i className="fa-solid fa-fire" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
                                    {summary!.currentStreak}
                                    <span className="ml-1 text-sm font-semibold text-neutral-400">
                                        day{summary!.currentStreak !== 1 ? 's' : ''}
                                    </span>
                                </p>
                                <p className="text-xs text-neutral-400">
                                    on-budget streak
                                    {summary!.bestStreak > summary!.currentStreak &&
                                        ` · best ${summary!.bestStreak}`}
                                </p>
                            </div>
                        </div>
                        <div className="ml-auto text-right">
                            <p
                                className={`text-2xl font-bold tabular-nums tracking-tight ${
                                    summary!.score >= 80
                                        ? 'text-emerald-600'
                                        : summary!.score >= 50
                                          ? 'text-amber-600'
                                          : 'text-red-500'
                                }`}
                            >
                                {summary!.score}%
                            </p>
                            <p className="text-xs text-neutral-400">
                                on budget · {summary!.eligibleDays}d
                            </p>
                        </div>
                    </div>

                    {/* 30-day strip */}
                    <div className="mt-5 flex flex-wrap gap-1">
                        {summary!.days.map((d) => {
                            const cls =
                                d.status === 'under'
                                    ? 'bg-emerald-400'
                                    : d.status === 'over'
                                      ? 'bg-red-400'
                                      : 'bg-neutral-100'
                            return (
                                <span
                                    key={d.date}
                                    title={`${d.date}: ${
                                        d.status === 'under'
                                            ? 'on budget'
                                            : d.status === 'over'
                                              ? 'over budget'
                                              : 'no target'
                                    }`}
                                    className={`h-4 w-4 rounded-[4px] ${cls}`}
                                />
                            )
                        })}
                    </div>
                </>
            )}

            <CardFooter>
                <Link
                    to="/finances/budgets"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-shield-halved text-xs" aria-hidden="true" />
                    Manage budgets
                </Link>
            </CardFooter>
        </Card>
    )
}
