import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import {
    PERIODS,
    WEEKDAYS_LONG,
    todayKey,
    formatDateLong,
    parseDateKey,
    eventCoversSlot,
    eventCoversAllDay,
} from '../../lib/calendar'
import { listEvents } from '../../services/events'
import { EVENT_TYPE_COLORS, EVENT_TYPE_LABELS } from '../../types'
import type { Event, Part } from '../../types'

export default function TodayWidget({ date = todayKey() }: { date?: string }) {
    const [events, setEvents] = useState<Event[]>([])
    const [loading, setLoading] = useState(true)
    const isToday = date === todayKey()
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]

    useEffect(() => {
        let active = true
        listEvents(date, date)
            .then((list) => active && setEvents(list))
            .catch(() => active && setEvents([]))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [date])

    const allDayEvents = events.filter((e) => eventCoversAllDay(e, date))

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>{isToday ? 'Today' : weekday}</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">{formatDateLong(date)}</p>
                </div>
                <Link
                    to={`/day/${date}`}
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Open
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-6">
                    <Spinner />
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    {/* All day / N/A events */}
                    {allDayEvents.map((e) => (
                        <AllDayRow key={e._id} event={e} date={date} />
                    ))}

                    {/* Part rows */}
                    {PERIODS.map((period) => {
                        const event =
                            events.find((e) => eventCoversSlot(e, date, period.key as Part)) ?? null
                        return (
                            <PartRow
                                key={period.key}
                                label={period.label}
                                icon={period.icon}
                                event={event}
                            />
                        )
                    })}
                </div>
            )}

            <CardFooter>
                <Link
                    to="/calendar"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-regular fa-calendar text-xs" aria-hidden="true" />
                    View calendar
                </Link>
            </CardFooter>
        </Card>
    )
}

function AllDayRow({ event, date }: { event: Event; date: string }) {
    const colors = EVENT_TYPE_COLORS[event.eventType]
    const isMultiDay = event.startDate !== event.endDate
    return (
        <div className={`flex items-center gap-3 rounded-xl px-3 py-2 ${colors.bg}`}>
            <i
                className="fa-regular fa-calendar w-4 shrink-0 text-center text-sm opacity-60"
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-semibold ${colors.text}`}>{event.title}</p>
            </div>
            <span className={`shrink-0 text-xs font-medium opacity-60 ${colors.text}`}>
                {isMultiDay
                    ? event.startDate === date
                        ? 'starts'
                        : event.endDate === date
                          ? 'ends'
                          : 'all day'
                    : 'all day'}
            </span>
        </div>
    )
}

function PartRow({ label, icon, event }: { label: string; icon: string; event: Event | null }) {
    const colors = event ? EVENT_TYPE_COLORS[event.eventType] : null

    return (
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50">
            <i
                className={`${icon} w-4 shrink-0 text-center text-sm text-neutral-300`}
                aria-hidden="true"
            />
            <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            {event ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors?.bg}`} />
                    <span className="truncate text-sm font-semibold text-neutral-800">
                        {event.title}
                    </span>
                    {event.time && (
                        <span className="ml-auto shrink-0 tabular-nums text-xs text-neutral-400">
                            {event.time}
                        </span>
                    )}
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors?.bg} ${colors?.text}`}
                    >
                        {EVENT_TYPE_LABELS[event.eventType]}
                    </span>
                </div>
            ) : (
                <span className="text-sm text-neutral-300">—</span>
            )}
        </div>
    )
}
