import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listStatuses } from '../../services/dayStatus'
import { todayKey } from '../../lib/calendar'
import type { DayStatusType } from '../../types'

function greeting(date: Date) {
    const h = date.getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
}

/** "Saturday 17 October" — the year is never in doubt on a dashboard. */
function formatDate(date: Date) {
    const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' })
    const month = date.toLocaleDateString('en-GB', { month: 'long' })
    return `${weekday} ${date.getDate()} ${month}`
}

type Pill = { label: string; bg: string; text: string }

const STATUS_PILLS: Record<DayStatusType, Pill> = {
    annual_leave_pending: {
        label: 'Annual leave',
        bg: 'bg-warning-bg',
        text: 'text-warning',
    },
    annual_leave_approved: {
        label: 'Annual leave',
        bg: 'bg-success-bg',
        text: 'text-success',
    },
    bank_holiday: { label: 'Bank holiday', bg: 'bg-success-bg', text: 'text-success' },
    christmas_new_year: {
        label: 'Christmas & New Year',
        bg: 'bg-danger-bg',
        text: 'text-danger',
    },
}

export default function DashboardHeader() {
    const { user } = useAuth()
    const now = new Date()
    const firstName = user?.name?.split(' ')[0] ?? 'there'
    const dateLabel = formatDate(now)

    const workDays = user?.settings?.workDays ?? [1, 2, 3, 4, 5]
    const [override, setOverride] = useState<DayStatusType | null>(null)

    useEffect(() => {
        const today = todayKey()
        let active = true
        listStatuses(today, today)
            .then((statuses) => {
                if (!active) return
                const match = statuses.find(
                    (s) => s.startDate <= today && s.endDate >= today
                )
                setOverride(match?.status ?? null)
            })
            .catch(() => {})
        return () => {
            active = false
        }
    }, [])

    const pill: Pill = override
        ? STATUS_PILLS[override]
        : workDays.includes(now.getDay())
          ? { label: 'Working', bg: 'bg-info-bg', text: 'text-info' }
          : { label: 'Weekend', bg: 'bg-coral-50', text: 'text-coral-700' }

    return (
        <header className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
                <p className="text-sm text-neutral-500">{dateLabel}</p>
                <span
                    className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${pill.bg} ${pill.text}`}
                >
                    {pill.label}
                </span>
            </div>
            <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-neutral-950 sm:text-5xl sm:leading-[1.05]">
                {greeting(now)}, {firstName}
            </h1>
        </header>
    )
}
