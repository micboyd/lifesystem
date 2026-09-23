import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { DayBadge } from '../components/planner/WeekPlannerUI'
import { reportTitle } from '../components/reports/ReportView'
import { useAuth } from '../context/AuthContext'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { formatMoney } from '../lib/money'
import { addDays, formatDateLong, todayKey } from '../lib/calendar'
import { reportHeadline, type DailyReport } from '../lib/dailyReport'
import { loadReports } from '../services/reports'

/** Days fetched per page — two weeks keeps the Starling call to one per space. */
const PAGE_DAYS = 14

function Stat({
    icon,
    children,
    tone = 'neutral',
}: {
    icon: string
    children: ReactNode
    tone?: 'neutral' | 'good' | 'bad'
}) {
    const tones = {
        neutral: 'bg-neutral-50 text-neutral-700 ring-neutral-200/70',
        good: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
        bad: 'bg-amber-50 text-amber-700 ring-amber-100',
    }
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${tones[tone]}`}
        >
            <i className={`fa-solid ${icon} text-[10px] opacity-60`} aria-hidden="true" />
            {children}
        </span>
    )
}

function ReportRow({ report }: { report: DailyReport }) {
    const today = todayKey()
    const habitTotal = report.habits.done.length + report.habits.missed.length
    const title = reportTitle(report.date)
    return (
        <Link
            to={`/reports/${report.date}`}
            className="group flex items-start gap-4 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_30px_-16px_rgba(0,0,0,0.25)] sm:p-5"
        >
            <DayBadge date={report.date} isToday={report.date === today} />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-base font-bold tracking-tight text-neutral-900">
                        {title === 'Daily Report' ? formatDateLong(report.date) : title}
                    </p>
                    <i
                        className="fa-solid fa-chevron-right text-xs text-neutral-300 transition-colors group-hover:text-brand-600"
                        aria-hidden="true"
                    />
                </div>
                <p className="mt-0.5 text-sm text-neutral-500">{reportHeadline(report)}</p>
                {!report.empty && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {report.money && (
                            <Stat icon="fa-sterling-sign">{formatMoney(report.money.total)}</Stat>
                        )}
                        {report.training.sessions.length > 0 && (
                            <Stat icon="fa-dumbbell">
                                {report.training.minutes > 0
                                    ? `${report.training.minutes} min`
                                    : `${report.training.sessions.length} session${report.training.sessions.length === 1 ? '' : 's'}`}
                            </Stat>
                        )}
                        {habitTotal > 0 && (
                            <Stat icon="fa-repeat">
                                {report.habits.done.length}/{habitTotal} habits
                            </Stat>
                        )}
                        {report.wins.length > 0 && (
                            <Stat icon="fa-circle-check" tone="good">
                                {report.wins.length} went well
                            </Stat>
                        )}
                        {report.misses.length > 0 && (
                            <Stat icon="fa-circle-exclamation" tone="bad">
                                {report.misses.length} to work on
                            </Stat>
                        )}
                    </div>
                )}
            </div>
        </Link>
    )
}

/** Every daily report, newest first, two weeks at a time. */
export default function Reports() {
    useMoneyHidden()
    const { user } = useAuth()
    const settingsGoals = user?.settings?.macroGoals
    const [reports, setReports] = useState<DailyReport[]>([])
    const [oldest, setOldest] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    // The latest two weeks. Goals only shift the food verdicts, but when they
    // change the list reloads from the top so every day agrees.
    useEffect(() => {
        let cancelled = false
        const to = todayKey()
        const from = addDays(to, -(PAGE_DAYS - 1))
        loadReports(from, to, settingsGoals)
            .then((page) => {
                if (cancelled) return
                setReports(page)
                setOldest(from)
                setError(false)
            })
            .catch(() => !cancelled && setError(true))
            .finally(() => !cancelled && setLoading(false))
        return () => {
            cancelled = true
        }
    }, [settingsGoals])

    /** The two weeks before the oldest day on show, added to the end. */
    async function loadOlder() {
        if (!oldest) return
        const to = addDays(oldest, -1)
        const from = addDays(to, -(PAGE_DAYS - 1))
        setLoading(true)
        setError(false)
        try {
            const page = await loadReports(from, to, settingsGoals)
            setReports((prev) => [...prev, ...page])
            setOldest(from)
        } catch {
            setError(true)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header className="mb-6 sm:mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                    Reports
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Each day read back — spending across every space, training you logged, habits,
                    food and what slipped.
                </p>
            </header>

            {reports.length === 0 && loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : reports.length === 0 && error ? (
                <EmptyState
                    icon="fa-solid fa-triangle-exclamation"
                    title="Couldn't load reports"
                    description="Something went wrong pulling the days together. Try reloading."
                />
            ) : (
                <div className="flex flex-col gap-3">
                    {reports.map((r) => (
                        <ReportRow key={r.date} report={r} />
                    ))}
                    <div className="mt-3 flex justify-center">
                        {error ? (
                            <p className="text-sm text-neutral-500">Couldn’t load older reports.</p>
                        ) : (
                            <Button
                                variant="ghost"
                                icon={loading ? undefined : 'fa-solid fa-clock-rotate-left'}
                                disabled={loading || !oldest}
                                onClick={loadOlder}
                            >
                                {loading ? 'Loading…' : 'Load older'}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </Container>
    )
}
