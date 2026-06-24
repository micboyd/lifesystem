import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import Tabs from '../Tabs'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
} from '../../services/finances'
import { monthOf, daysInMonth, weekStartOf, weekEndOf } from '../../lib/budget'
import { addMonths } from '../../lib/finance'
import { todayKey, addDays, formatMonthYear, formatWeekRange } from '../../lib/calendar'
import {
    dayDiscipline,
    weekDiscipline,
    dailyRowsInMonth,
    weeklyRowsInMonth,
    type DayDiscipline,
    type MonthBudgetData,
} from '../../lib/budgetDiscipline'
import type { FinanceGroup, FinanceRow } from '../../types'

type Mode = 'days' | 'weeks'

interface LoadedData {
    groups: FinanceGroup[]
    rows: FinanceRow[]
    byMonth: Map<string, MonthBudgetData>
}

interface WeekCell {
    wStart: string
    wEnd: string
    status: DayDiscipline['status']
}

const EMPTY_MONTH: MonthBudgetData = { entries: [], spends: [], excluded: new Set() }
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const STATUS_CLASS: Record<DayDiscipline['status'], string> = {
    under: 'bg-emerald-400',
    over: 'bg-red-400',
    skip: 'bg-neutral-200',
    future: 'bg-neutral-100',
}

const STATUS_LABEL: Record<DayDiscipline['status'], string> = {
    under: 'on budget',
    over: 'over budget',
    skip: 'no target',
    future: 'upcoming',
}

export default function DisciplineWidget({ date }: { date: string }) {
    const budgetVersion = useDataVersion('budget')
    const today = todayKey()
    const currentMonth = monthOf(today)
    const [month, setMonth] = useState(monthOf(date))
    const [mode, setMode] = useState<Mode>('days')
    const [data, setData] = useState<LoadedData | null>(null)
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const loading = loadedKey !== month

    useEffect(() => {
        let active = true
        // Load the viewed month plus its neighbours so weeks that straddle a
        // month boundary have the data they need on both sides.
        const months = [addMonths(month, -1), month, addMonths(month, 1)]
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
                setData({ groups, rows, byMonth })
            })
            .finally(() => active && setLoadedKey(month))
        return () => {
            active = false
        }
    }, [month, budgetVersion])

    const view = useMemo(() => {
        if (!data) return null
        const { groups, rows, byMonth } = data
        const monthData = byMonth.get(month) ?? EMPTY_MONTH

        const dRows = dailyRowsInMonth(groups, rows, month)
        const wRows = weeklyRowsInMonth(groups, rows, month)
        const anyBudget = rows.some(
            (r) => r.budgeted && (r.budgetType === 'daily' || r.budgetType === 'weekly')
        )
        const pureWeekly = wRows.length > 0 && dRows.length === 0

        // Cache week assessments so days in the same week (and the week strip) agree.
        const weekCache = new Map<string, DayDiscipline['status']>()
        const weekStatus = (wEnd: string): DayDiscipline['status'] => {
            if (wEnd > today) return 'future'
            const cached = weekCache.get(wEnd)
            if (cached) return cached
            const st = weekDiscipline(wEnd, groups, rows, byMonth, today).status
            weekCache.set(wEnd, st)
            return st
        }

        // ── Day cells ──
        const total = daysInMonth(month)
        const firstDow = (new Date(`${month}-01T00:00:00`).getDay() + 6) % 7 // Mon=0…Sun=6
        const days: DayDiscipline[] = []
        for (let d = 1; d <= total; d++) {
            const dk = `${month}-${String(d).padStart(2, '0')}`
            if (dk > today) {
                days.push({ date: dk, target: 0, spent: 0, status: 'future' })
                continue
            }
            const dd = dayDiscipline(dk, groups, rows, monthData, today)
            days.push(pureWeekly ? { ...dd, status: weekStatus(weekEndOf(dk)) } : dd)
        }

        // ── Week cells (weeks overlapping this month) ──
        const monthStart = `${month}-01`
        const monthEnd = `${month}-${String(total).padStart(2, '0')}`
        const weeks: WeekCell[] = []
        let cursorEnd = weekEndOf(monthStart)
        while (weekStartOf(cursorEnd) <= monthEnd) {
            weeks.push({
                wStart: weekStartOf(cursorEnd),
                wEnd: cursorEnd,
                status: weekStatus(cursorEnd),
            })
            cursorEnd = addDays(cursorEnd, 7)
        }

        const score = (cells: { status: DayDiscipline['status'] }[]) => {
            const eligible = cells.filter((c) => c.status === 'under' || c.status === 'over')
            const onBudget = eligible.filter((c) => c.status === 'under').length
            return {
                pct: eligible.length > 0 ? Math.round((onBudget / eligible.length) * 100) : null,
                onBudget,
                eligible: eligible.length,
            }
        }

        return {
            anyBudget,
            hasWeekly: wRows.length > 0,
            firstDow,
            days,
            weeks,
            dayScore: score(days),
            weekScore: score(weeks),
        }
    }, [data, month, today])

    const score = mode === 'weeks' ? view?.weekScore : view?.dayScore
    const scoreColor =
        score?.pct == null
            ? 'text-neutral-300'
            : score.pct >= 80
              ? 'text-emerald-600'
              : score.pct >= 50
                ? 'text-amber-600'
                : 'text-red-500'

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget discipline</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        Days and weeks you kept under your budget target
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
            ) : !view?.anyBudget ? (
                <p className="py-4 text-sm text-neutral-400">
                    Once you're tracking spend (weekly or daily), your on-budget record builds here.{' '}
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
                    {/* Month navigator + view toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setMonth((m) => addMonths(m, -1))}
                                aria-label="Previous month"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                            </button>
                            <span className="min-w-[8.5rem] text-center text-sm font-semibold tracking-tight text-neutral-900">
                                {formatMonthYear(`${month}-01`)}
                            </span>
                            <button
                                type="button"
                                onClick={() => setMonth((m) => addMonths(m, 1))}
                                disabled={month >= currentMonth}
                                aria-label="Next month"
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                            >
                                <i
                                    className="fa-solid fa-chevron-right text-xs"
                                    aria-hidden="true"
                                />
                            </button>
                        </div>
                        <Tabs
                            tabs={['Days', 'Weeks']}
                            value={mode === 'days' ? 'Days' : 'Weeks'}
                            onChange={(t) => setMode(t === 'Weeks' ? 'weeks' : 'days')}
                        />
                    </div>

                    {/* Score */}
                    <div className="mt-4 flex items-baseline gap-2">
                        <span className={`text-2xl font-bold tabular-nums tracking-tight ${scoreColor}`}>
                            {score?.pct == null ? '—' : `${score.pct}%`}
                        </span>
                        <span className="text-xs text-neutral-400">
                            {score && score.eligible > 0
                                ? `${score.onBudget} of ${score.eligible} ${mode === 'weeks' ? 'weeks' : 'days'} on budget`
                                : `nothing tracked this month`}
                        </span>
                    </div>

                    {/* Grid */}
                    {mode === 'days' ? (
                        <div className="mt-4 max-w-[20rem]">
                            <div className="mb-1 grid grid-cols-7 gap-1.5">
                                {WEEKDAYS.map((w, i) => (
                                    <span
                                        key={i}
                                        className="text-center text-[10px] font-semibold uppercase text-neutral-300"
                                    >
                                        {w}
                                    </span>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5">
                                {Array.from({ length: view.firstDow }).map((_, i) => (
                                    <span key={`pad-${i}`} className="aspect-square" />
                                ))}
                                {view.days.map((d) => (
                                    <span
                                        key={d.date}
                                        title={`${d.date}: ${STATUS_LABEL[d.status]}`}
                                        className={`aspect-square rounded-[5px] ${STATUS_CLASS[d.status]} ${
                                            d.date === today ? 'ring-2 ring-neutral-900' : ''
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-4">
                            <div className="flex flex-wrap gap-2.5">
                                {view.weeks.map((w, i) => (
                                    <div key={w.wEnd} className="flex flex-col items-center gap-1">
                                        <span
                                            title={`${formatWeekRange(w.wStart, w.wEnd)}: ${STATUS_LABEL[w.status]}`}
                                            className={`grid h-9 w-9 place-items-center rounded-lg text-[11px] font-bold text-white/80 ${STATUS_CLASS[w.status]}`}
                                        >
                                            {w.status === 'over' && (
                                                <i
                                                    className="fa-solid fa-xmark"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            {w.status === 'under' && (
                                                <i
                                                    className="fa-solid fa-check"
                                                    aria-hidden="true"
                                                />
                                            )}
                                        </span>
                                        <span className="text-[10px] text-neutral-400">
                                            W{i + 1}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            {!view.hasWeekly && (
                                <p className="mt-3 text-xs text-neutral-400">
                                    No weekly budgets this month — weeks you stick to weekly targets
                                    show here.
                                </p>
                            )}
                        </div>
                    )}
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
