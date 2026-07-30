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

function ordinal(day: number) {
    const rem100 = day % 100
    if (rem100 >= 11 && rem100 <= 13) return 'th'
    switch (day % 10) {
        case 1:
            return 'st'
        case 2:
            return 'nd'
        case 3:
            return 'rd'
        default:
            return 'th'
    }
}

function formatDate(date: Date) {
    const weekday = date.toLocaleDateString(undefined, { weekday: 'long' })
    const month = date.toLocaleDateString(undefined, { month: 'long' })
    const day = date.getDate()
    const year = date.getFullYear()
    return `${weekday}, ${day}${ordinal(day)} ${month} ${year}`
}

type Pill = { label: string; bg: string; text: string }

const STATUS_PILLS: Record<DayStatusType, Pill> = {
    annual_leave_pending: {
        label: 'Annual Leave',
        bg: 'bg-orange-100',
        text: 'text-orange-700',
    },
    annual_leave_approved: {
        label: 'Annual Leave',
        bg: 'bg-green-100',
        text: 'text-green-700',
    },
    bank_holiday: { label: 'Bank Holiday', bg: 'bg-green-100', text: 'text-green-700' },
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
          ? { label: 'Working', bg: 'bg-sky-100', text: 'text-sky-700' }
          : { label: 'Weekend', bg: 'bg-coral-50', text: 'text-coral-600' }

    return (
        <header>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-coral-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
                    {greeting(now)},{' '}
                    <span className="text-coral-500">{firstName}</span>
                </h1>
                <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] ${pill.bg} ${pill.text}`}
                >
                    {pill.label}
                </span>
            </div>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-neutral-900 sm:text-[2.6rem] sm:leading-[1.05]">
                {dateLabel}
            </p>
        </header>
    )
}
