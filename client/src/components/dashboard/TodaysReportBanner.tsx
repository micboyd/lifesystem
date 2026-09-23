import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HeroChip } from '../planner/WeekPlannerUI'
import { useAuth } from '../../context/AuthContext'
import { useDataVersion } from '../../context/DataSyncContext'
import { useMoneyHidden } from '../useMoneyHidden'
import { formatMoney } from '../../lib/money'
import { formatDateLong } from '../../lib/calendar'
import { bannerReportDate, reportHeadline, type DailyReport } from '../../lib/dailyReport'
import { loadReport } from '../../services/reports'

/** The report date the banner was last dismissed for. */
const DISMISS_KEY = 'reportBannerDismissed'

function readDismissed(): string | null {
    try {
        return localStorage.getItem(DISMISS_KEY)
    } catch {
        return null
    }
}

/** Which report the banner is offering right now, re-read every minute. */
function useBannerDate(): string | null {
    const [date, setDate] = useState(() => bannerReportDate(new Date()))
    useEffect(() => {
        const id = window.setInterval(() => setDate(bannerReportDate(new Date())), 60_000)
        return () => window.clearInterval(id)
    }, [])
    return date
}

/**
 * "Today's Report" — the evening roundup on the dashboard. Appears at 9pm,
 * stays until noon the next day, and once dismissed stays gone for that day's
 * report (the next evening brings a new one).
 */
export default function TodaysReportBanner() {
    useMoneyHidden()
    const { user } = useAuth()
    const date = useBannerDate()
    const [dismissed, setDismissed] = useState(readDismissed)
    const [report, setReport] = useState<DailyReport | null>(null)
    const version = useDataVersion('habits', 'tasks', 'budget')
    const settingsGoals = user?.settings?.macroGoals

    const visible = date !== null && dismissed !== date

    useEffect(() => {
        if (!visible || !date) return
        let cancelled = false
        loadReport(date, settingsGoals)
            .then((r) => {
                if (!cancelled) setReport(r)
            })
            .catch(() => {
                // The banner is a nudge, not a page — if it can't load, it stays quiet.
            })
        return () => {
            cancelled = true
        }
    }, [visible, date, settingsGoals, version])

    if (!visible || !date) return null

    function dismiss() {
        try {
            localStorage.setItem(DISMISS_KEY, date!)
        } catch {
            /* best-effort */
        }
        setDismissed(date)
    }

    const current = report?.date === date ? report : null
    const habitTotal = current ? current.habits.done.length + current.habits.missed.length : 0

    return (
        <section
            aria-label="Today's Report"
            className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-neutral-900 via-brand-700 to-brand-600 text-white shadow-[0_18px_40px_-20px_rgba(1,61,90,0.6)]"
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-coral-500/25 blur-3xl"
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl"
            />
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss today's report"
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
            >
                <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
            </button>

            <div className="relative flex flex-col gap-4 p-5 pr-12 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pr-14">
                <div className="flex min-w-0 items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/15">
                        <i className="fa-solid fa-moon text-lg text-coral-200" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                            {formatDateLong(date)}
                        </p>
                        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                            Today’s Report
                        </h2>
                        <p className="mt-0.5 text-sm text-white/70">
                            {current ? reportHeadline(current) : 'Pulling the day together…'}
                        </p>
                        {current && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {current.money && (
                                    <HeroChip>
                                        <i
                                            className="fa-solid fa-sterling-sign text-white/60"
                                            aria-hidden="true"
                                        />
                                        {formatMoney(current.money.total)} spent
                                    </HeroChip>
                                )}
                                <HeroChip>
                                    <i
                                        className="fa-solid fa-dumbbell text-white/60"
                                        aria-hidden="true"
                                    />
                                    {current.training.sessions.length === 0
                                        ? 'No training'
                                        : current.training.minutes > 0
                                          ? `${current.training.minutes} min trained`
                                          : `${current.training.sessions.length} logged`}
                                </HeroChip>
                                {habitTotal > 0 && (
                                    <HeroChip>
                                        <i
                                            className="fa-solid fa-repeat text-white/60"
                                            aria-hidden="true"
                                        />
                                        {current.habits.done.length}/{habitTotal} habits
                                    </HeroChip>
                                )}
                                {current.misses.length > 0 && (
                                    <HeroChip>
                                        <i
                                            className="fa-solid fa-circle-exclamation text-amber-300"
                                            aria-hidden="true"
                                        />
                                        {current.misses.length} to work on
                                    </HeroChip>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <Link
                    to={`/reports/${date}`}
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] sm:self-center"
                >
                    Read report
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </div>
        </section>
    )
}
