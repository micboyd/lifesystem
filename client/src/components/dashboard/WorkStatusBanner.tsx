import { useEffect, useState } from 'react'
import { listStatuses } from '../../services/dayStatus'
import { type DayStatus } from '../../types'
import { todayKey } from '../../lib/calendar'

type WorkState = {
    off: boolean
    title: string
    detail: string
    icon: string
    bg: string
    text: string
}

function resolveState(status: DayStatus | null, isWeekend: boolean, isToday: boolean): WorkState {
    const suffix = isToday ? ' today' : ''
    if (status?.status === 'annual_leave_approved') {
        return { off: true, title: `You're off work${suffix}`, detail: 'Annual leave (approved)', icon: 'fa-solid fa-umbrella-beach', bg: 'bg-green-100', text: 'text-green-700' }
    }
    if (status?.status === 'bank_holiday') {
        return { off: true, title: `You're off work${suffix}`, detail: 'Bank holiday', icon: 'fa-solid fa-champagne-glasses', bg: 'bg-green-100', text: 'text-green-700' }
    }
    if (status?.status === 'annual_leave_pending') {
        return { off: false, title: `You're working${suffix}`, detail: 'Annual leave pending approval', icon: 'fa-solid fa-hourglass-half', bg: 'bg-orange-100', text: 'text-orange-700' }
    }
    if (isWeekend) {
        return { off: true, title: `You're off${suffix}`, detail: 'Weekend', icon: 'fa-solid fa-mug-hot', bg: 'bg-green-100', text: 'text-green-700' }
    }
    return { off: false, title: `You're working${suffix}`, detail: 'No leave booked', icon: 'fa-solid fa-briefcase', bg: 'bg-neutral-100', text: 'text-neutral-700' }
}

export default function WorkStatusBanner({ date = todayKey() }: { date?: string }) {
    const [status, setStatus] = useState<DayStatus | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        let active = true
        listStatuses(date, date)
            .then((list) => active && setStatus(list[0] ?? null))
            .catch(() => active && setStatus(null))
            .finally(() => active && setLoaded(true))
        return () => { active = false }
    }, [date])

    if (!loaded) return null

    const isWeekend = [0, 6].includes(new Date(date + 'T00:00:00').getDay())
    const state = resolveState(status, isWeekend, date === todayKey())

    return (
        <div className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${state.bg}`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/60 ${state.text}`}>
                <i className={`${state.icon} text-lg`} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className={`text-lg font-bold tracking-tight ${state.text}`}>{state.title}</p>
                <p className={`text-sm font-medium ${state.text} opacity-70`}>{state.detail}</p>
            </div>
        </div>
    )
}
