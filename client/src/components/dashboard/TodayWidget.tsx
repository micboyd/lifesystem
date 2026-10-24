import { useEffect, useState } from 'react'
import DashSection, { DASH, SectionLoading } from './DashSection'
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
            to={`/calendar?date=${date}`}
            action="Open day"
        >
            {loading ? (
                <SectionLoading />
            ) : (
                <div className="flex flex-col">
                    {allDayEvents.length > 0 && (
                        <div className="mb-4 flex flex-col gap-2">
                            {allDayEvents.map((e) => (
                                <AllDayRow key={e._id} event={e} date={date} />
                            ))}
                        </div>
                    )}
                    <div className={DASH.list}>
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
        <div className={`flex h-10 items-center gap-3 rounded-xl px-4 ${colors.bg}`}>
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
        <div className={DASH.row}>
            <i className={`${icon} ${DASH.rowIcon}`} aria-hidden="true" />
            <span className={DASH.rowLabel}>{label}</span>
            {event ? (
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className={`${DASH.dot} ${colors?.bg}`} />
                    <span className={DASH.rowText}>{event.title}</span>
                    {event.time && (
                        <span className={DASH.rowValue}>{event.time}</span>
                    )}
                    <span
                        className={`hidden h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium sm:inline-flex ${colors?.bg} ${colors?.text}`}
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
