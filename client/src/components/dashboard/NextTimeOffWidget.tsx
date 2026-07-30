import { useEffect, useState } from 'react'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listStatuses } from '../../services/dayStatus'
import { addDays } from '../../lib/calendar'
import { DAY_STATUS_OPTIONS } from '../../types'
import type { DayStatus } from '../../types'

/** How far ahead we look for booked time off. */
const WINDOW_DAYS = 365
/** Most entries to list. */
const MAX_SHOWN = 4

/** Whole days from `a` to `b` (both "YYYY-MM-DD"), via UTC to dodge DST. */
function daysBetween(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number)
    const [by, bm, bd] = b.split('-').map(Number)
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** "Sat 2 Aug". */
function fmt(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

interface Upcoming {
    status: DayStatus
    /** Days from today to the start (0 while it's already running). */
    daysUntil: number
    /** Inclusive length in days. */
    length: number
    ongoing: boolean
}

export default function NextTimeOffWidget({ date }: { date: string }) {
    const [items, setItems] = useState<Upcoming[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        listStatuses(date, addDays(date, WINDOW_DAYS))
            .then((statuses) => {
                if (!active) return
                const results = statuses
                    // Anything still current or in the future.
                    .filter((s) => s.endDate >= date)
                    .map((s) => ({
                        status: s,
                        daysUntil: s.startDate <= date ? 0 : daysBetween(date, s.startDate),
                        length: daysBetween(s.startDate, s.endDate) + 1,
                        ongoing: s.startDate <= date && s.endDate >= date,
                    }))
                    .sort((a, b) => a.status.startDate.localeCompare(b.status.startDate))
                    .slice(0, MAX_SHOWN)
                setItems(results)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [date])

    // Nothing booked — stay out of the way.
    if (!loading && items.length === 0) return null

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Next time off</CardTitle>
                <CardAction to="/calendar">Calendar</CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : (
                <ul className="divide-y divide-neutral-100">
                    {items.map(({ status, daysUntil, length, ongoing }) => {
                        const opt = DAY_STATUS_OPTIONS.find((o) => o.value === status.status)
                        const single = status.startDate === status.endDate
                        const range = single
                            ? fmt(status.startDate)
                            : `${fmt(status.startDate)} – ${fmt(status.endDate)}`
                        return (
                            <li key={status._id} className="flex items-center gap-4 py-3">
                                <span
                                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm ${
                                        opt ? `${opt.bg} ${opt.text}` : 'bg-neutral-100 text-neutral-400'
                                    }`}
                                >
                                    <i className="fa-solid fa-umbrella-beach" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-neutral-900">
                                        {opt?.label ?? 'Time off'}
                                    </p>
                                    <p className="text-xs text-neutral-400">
                                        {range}
                                        {!single && ` · ${length} days`}
                                    </p>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                                        ongoing
                                            ? 'bg-green-100 text-green-700'
                                            : daysUntil === 0
                                              ? 'bg-green-100 text-green-700'
                                              : daysUntil <= 7
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-neutral-100 text-neutral-500'
                                    }`}
                                >
                                    {ongoing ? 'Now' : daysUntil === 0 ? 'Today' : `${daysUntil}d`}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </Card>
    )
}
