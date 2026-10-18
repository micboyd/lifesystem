import { useEffect, useState } from 'react'
import DashSection, { SectionLoading } from './DashSection'
import {
    PERIODS,
    todayKey,
    eventCoversSlot,
    eventCoversAllDay,
} from '../../lib/calendar'
import { listEvents } from '../../services/events'
import { EVENT_TYPE_LABELS } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event, Part } from '../../types'

/** The day's events, loaded once on the dashboard and shared with the strip above. */
export function useDayEvents(date: string) {
    const [state, setState] = useState<{ date: string; events: Event[] } | null>(null)

    useEffect(() => {
        let active = true
        listEvents(date, date)
            .then((list) => active && setState({ date, events: list }))
            .catch(() => active && setState({ date, events: [] }))
        return () => {
            active = false
        }
    }, [date])

    return { loading: state?.date !== date, events: state?.date === date ? state.events : [] }
}

/** Morning, afternoon and evening, with any all-day events above them. */
export default function TodayWidget({
    date = todayKey(),
    events,
    loading,
}: {
    date?: string
    events: Event[]
    loading: boolean
}) {
    const allDayEvents = events.filter((e) => eventCoversAllDay(e, date))

    const count = events.length

    return (
        <DashSection
            title="Schedule"
            icon="fa-regular fa-calendar"
            tone="violet"
            meta={loading ? undefined : count === 0 ? 'A clear day' : `${count} ${count === 1 ? 'event' : 'events'}`}
            to={`/day/${date}`}
            action="Open day"
        >
            {loading ? (
                <SectionLoading />
            ) : (
                <div className="flex flex-col">
                    {allDayEvents.length > 0 && (
                        <div className="mb-3 flex flex-col gap-1.5">
                            {allDayEvents.map((e) => (
                                <AllDayRow key={e._id} event={e} date={date} />
                            ))}
                        </div>
                    )}
                    <div className="divide-y divide-neutral-200 border-y border-neutral-200">
                        {PERIODS.map((period) => {
                            const event = events.find((e) => eventCoversSlot(e, date, period.key as Part)) ?? null
                            return <PartRow key={period.key} label={period.label} icon={period.icon} event={event} />
                        })}
                    </div>
                </div>
            )}
        </DashSection>
    )
}

function AllDayRow({ event, date }: { event: Event; date: string }) {
    const { byId } = useCalendars()
    const colors = colorsForEvent(event, byId)
    const isMultiDay = event.startDate !== event.endDate
    return (
        <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${colors.bg}`}>
            <i
                className="fa-regular fa-calendar w-4 shrink-0 text-center text-sm opacity-60"
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${colors.text}`}>{event.title}</p>
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
    const { byId } = useCalendars()
    const colors = event ? colorsForEvent(event, byId) : null

    return (
        <div className="flex items-center gap-4 py-4">
            <i className={`${icon} w-4 shrink-0 text-center text-sm text-neutral-400`} aria-hidden="true" />
            <span className="w-24 shrink-0 text-[13px] text-neutral-500">{label}</span>
            {event ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors?.bg}`} />
                    <span className="truncate text-[15px] font-medium text-neutral-900">{event.title}</span>
                    {event.time && (
                        <span className="ml-auto shrink-0 tabular-nums text-[13px] text-neutral-500">{event.time}</span>
                    )}
                    <span
                        className={`hidden shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline ${colors?.bg} ${colors?.text} ${event.time ? '' : 'ml-auto'}`}
                    >
                        {EVENT_TYPE_LABELS[event.eventType]}
                    </span>
                </div>
            ) : (
                <span className="text-[15px] text-neutral-500">Free</span>
            )}
        </div>
    )
}
