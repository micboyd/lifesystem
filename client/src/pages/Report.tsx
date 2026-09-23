import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import ReportView from '../components/reports/ReportView'
import { useAuth } from '../context/AuthContext'
import { addDays, todayKey } from '../lib/calendar'
import type { DailyReport } from '../lib/dailyReport'
import { loadReport } from '../services/reports'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function NavButton({
    icon,
    label,
    onClick,
    disabled,
}: {
    icon: string
    label: string
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-30 disabled:hover:bg-white/10"
        >
            <i className={`${icon} text-xs`} aria-hidden="true" />
        </button>
    )
}

/** One day's report at /reports/:date, stepping a day at a time. */
export default function Report() {
    const { date = '' } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()
    const settingsGoals = user?.settings?.macroGoals
    const [report, setReport] = useState<DailyReport | null>(null)
    /** The date that failed to load, so moving to another day clears it. */
    const [failed, setFailed] = useState<string | null>(null)
    const valid = DATE_RE.test(date)
    const today = todayKey()

    useEffect(() => {
        if (!valid) return
        let cancelled = false
        loadReport(date, settingsGoals)
            .then((r) => !cancelled && setReport(r))
            .catch(() => !cancelled && setFailed(date))
        return () => {
            cancelled = true
        }
    }, [date, valid, settingsGoals])

    const current = report?.date === date ? report : null
    const error = failed === date

    return (
        <Container as="main" className="py-8 sm:py-10">
            <Link
                to="/reports"
                className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-neutral-500 hover:text-neutral-900"
            >
                <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                All reports
            </Link>

            {!valid ? (
                <EmptyState icon="fa-solid fa-calendar-xmark" title="That isn't a date" />
            ) : error ? (
                <EmptyState
                    icon="fa-solid fa-triangle-exclamation"
                    title="Couldn't load this report"
                    description="Something went wrong pulling the day together. Try reloading."
                />
            ) : !current ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <ReportView
                    report={current}
                    nav={
                        <div className="flex items-center gap-1.5">
                            <NavButton
                                icon="fa-solid fa-chevron-left"
                                label="Previous day"
                                onClick={() => navigate(`/reports/${addDays(date, -1)}`)}
                            />
                            <NavButton
                                icon="fa-solid fa-chevron-right"
                                label="Next day"
                                disabled={date >= today}
                                onClick={() => navigate(`/reports/${addDays(date, 1)}`)}
                            />
                        </div>
                    }
                />
            )}
        </Container>
    )
}
