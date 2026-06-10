import { useCallback, useEffect, useState } from 'react'
import EventEditor from './EventEditor'
import Spinner from '../Spinner'
import {
    PERIODS,
    eventCoversSlot,
    eventCoversAllDay,
    isPartPast,
    todayKey,
} from '../../lib/calendar'
import {
    listEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    type EventInput,
} from '../../services/events'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS } from '../../types'
import type { Event, Part } from '../../types'

interface DayViewProps {
    date: string
    /** When set, auto-opens the editor for this part after data loads. */
    initialOpenPart?: string
}

export default function DayView({ date, initialOpenPart }: DayViewProps) {
    const [events, setEvents] = useState<Event[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const loading = loadedDate !== date
    const [editing, setEditing] = useState<{ event: Event | null; part: Part | 'allday' } | null>(
        null
    )
    const [saving, setSaving] = useState(false)
    const [conflict, setConflict] = useState(false)

    const load = useCallback(() => listEvents(date, date), [date])

    useEffect(() => {
        let active = true
        load()
            .then((list) => {
                if (!active) return
                setEvents(list)
                // Auto-open the editor for the part that was clicked in the calendar
                if (initialOpenPart) {
                    const part = initialOpenPart as Part
                    const existing =
                        part === 'na'
                            ? (list.find(
                                  (e) =>
                                      e.startPart === 'na' &&
                                      date >= e.startDate &&
                                      date <= e.endDate
                              ) ?? null)
                            : (list.find((e) => eventCoversSlot(e, date, part)) ?? null)
                    setEditing({ event: existing, part })
                }
            })
            .catch(() => active && setEvents([]))
            .finally(() => {
                if (active) setLoadedDate(date)
            })
        return () => {
            active = false
        }
    }, [load, date, initialOpenPart])

    function findEventForPart(list: Event[], part: Part | 'allday'): Event | null {
        if (part === 'allday') return list.find((e) => eventCoversAllDay(e, date)) ?? null
        if (part === 'na')
            return (
                list.find(
                    (e) => e.startPart === 'na' && date >= e.startDate && date <= e.endDate
                ) ?? null
            )
        return list.find((e) => eventCoversSlot(e, date, part)) ?? null
    }

    function openSlot(part: Part | 'allday') {
        setEditing({ event: findEventForPart(events, part), part })
        setConflict(false)
    }

    async function handleSave(input: EventInput) {
        setSaving(true)
        setConflict(false)
        try {
            if (editing?.event) await updateEvent(editing.event._id, input)
            else await createEvent(input)
            setEvents(await load())
            setEditing(null)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status === 409) {
                setConflict(true)
            }
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!editing?.event) return
        setSaving(true)
        try {
            await deleteEvent(editing.event._id)
            setEvents(await load())
            setEditing(null)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const allDayEvents = events.filter((e) => eventCoversAllDay(e, date))

    const defaultSlotPart: Part =
        editing?.part === 'allday' || editing?.part === undefined
            ? 'morning'
            : (editing.part as Part)
    const defaultAllDay = editing?.part === 'allday'

    return (
        <div className="flex flex-col gap-3">
            {/* All day / N/A events */}
            <AllDaySection
                events={allDayEvents}
                date={date}
                onAdd={() => openSlot('allday')}
                isPastDay={date < todayKey()}
            />

            {/* Period rows */}
            {PERIODS.map((period) => (
                <PartRow
                    key={period.key}
                    label={period.label}
                    icon={period.icon}
                    event={events.find((e) => eventCoversSlot(e, date, period.key)) ?? null}
                    date={date}
                    past={isPartPast(date, period.key, new Date())}
                    onClick={() => openSlot(period.key)}
                />
            ))}

            <EventEditor
                open={editing !== null}
                event={editing?.event ?? null}
                defaultSlot={{
                    date,
                    part: defaultAllDay ? 'morning' : defaultSlotPart,
                }}
                saving={saving}
                conflict={conflict}
                onClose={() => {
                    setEditing(null)
                    setConflict(false)
                }}
                onSave={handleSave}
                onDelete={handleDelete}
            />
        </div>
    )
}

function AllDaySection({
    events,
    date,
    onAdd,
    isPastDay = false,
}: {
    events: Event[]
    date: string
    onAdd: () => void
    isPastDay?: boolean
}) {
    return (
        <div className="rounded-2xl border border-neutral-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-2.5">
                <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    <i className="fa-regular fa-calendar text-neutral-300" aria-hidden="true" />
                    All day / Reference
                </span>
                {!isPastDay && (
                    <button
                        type="button"
                        onClick={onAdd}
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                        Add
                    </button>
                )}
            </div>
            <div className="min-h-10 flex flex-col gap-1 p-2">
                {events.length === 0 ? (
                    <p className="py-1 text-center text-xs text-neutral-300">Nothing here</p>
                ) : (
                    events.map((e) => (
                        <AllDayChip key={e._id} event={e} date={date} onClick={onAdd} />
                    ))
                )}
            </div>
        </div>
    )
}

function AllDayChip({ event, date, onClick }: { event: Event; date: string; onClick: () => void }) {
    const colors = event.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
    const isMultiDay = event.startDate !== event.endDate
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-colors ${colors.bg} ${colors.hover} ${colors.text}`}
        >
            <span className="truncate">{event.title}</span>
            {isMultiDay && (
                <span className="ml-auto shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                    {event.startDate === date
                        ? 'starts'
                        : event.endDate === date
                          ? 'ends'
                          : 'continues'}
                </span>
            )}
        </button>
    )
}

interface PartRowProps {
    label: string
    icon: string
    event: Event | null
    date: string
    past?: boolean
    onClick: () => void
}

function PartRow({ label, icon, event, date, past = false, onClick }: PartRowProps) {
    const isMultiDay = event ? event.startDate !== event.endDate : false
    const colors = event
        ? event.startPart === 'na'
            ? NA_EVENT_COLORS
            : EVENT_TYPE_COLORS[event.eventType]
        : null

    const Tag = past ? 'div' : 'button'
    return (
        <Tag
            {...(!past ? { type: 'button' as const, onClick } : {})}
            className={[
                'group flex w-full items-start gap-4 rounded-2xl border p-4 text-left',
                past
                    ? 'border-red-200 bg-red-100/60 cursor-default'
                    : 'border-neutral-200 bg-white transition-colors hover:border-neutral-300 hover:bg-neutral-50',
            ].join(' ')}
        >
            <span
                className={[
                    'mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                    past ? 'bg-red-200/60 text-red-400' : 'bg-neutral-100 text-neutral-500',
                ].join(' ')}
            >
                <i className={icon} aria-hidden="true" />
            </span>

            <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {label}
                </p>
                {event ? (
                    <>
                        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <span
                                className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors?.bg}`}
                            />
                            <span className="truncate">{event.title}</span>
                            {event.time && (
                                <span className="shrink-0 font-medium tabular-nums text-neutral-400">
                                    {event.time}
                                </span>
                            )}
                            {isMultiDay && (
                                <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                    {event.startDate === date
                                        ? 'starts'
                                        : event.endDate === date
                                          ? 'ends'
                                          : 'continues'}
                                </span>
                            )}
                        </p>
                        {event.notes && (
                            <p className="mt-0.5 line-clamp-2 text-sm text-neutral-500">
                                {event.notes}
                            </p>
                        )}
                    </>
                ) : (
                    <p className={`mt-1 text-sm ${past ? 'text-red-400' : 'text-neutral-400'}`}>
                        <i className="fa-solid fa-plus mr-1.5 text-[10px]" aria-hidden="true" />
                        {past ? 'In the past' : 'Add event'}
                    </p>
                )}
            </div>

            {!past && (
                <i
                    className="fa-solid fa-chevron-right mt-1 text-xs text-neutral-300 transition-colors group-hover:text-neutral-500"
                    aria-hidden="true"
                />
            )}
        </Tag>
    )
}
