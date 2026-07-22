import { useCallback, useEffect, useState } from 'react'
import EventEditor from './EventEditor'
import DeleteRecurringEventDialog, { type DeleteScope } from './DeleteRecurringEventDialog'
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
import { EVENT_TYPE_ICONS } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { colorsForEvent } from '../../lib/eventColors'
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
    const [scopeEvent, setScopeEvent] = useState<Event | null>(null)
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

    /** Open the editor on a blank event in the given slot. */
    function openNew(part: Part | 'allday') {
        setEditing({ event: null, part })
        setConflict(false)
    }

    /** Open the editor on one specific existing event. */
    function openExisting(event: Event, part: Part | 'allday') {
        setEditing({ event, part })
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

    async function removeEvent(event: Event, scope: DeleteScope) {
        setSaving(true)
        try {
            // 'instance' records the occurrence's date as an exception; 'series'
            // (and any non-recurring event) deletes the master document outright.
            await deleteEvent(event._id, scope === 'instance' ? event.startDate : undefined)
            setEvents(await load())
            setEditing(null)
            setScopeEvent(null)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!editing?.event) return
        // Recurring events offer a this-one / whole-series choice; others delete directly.
        if (editing.event.recurrence) {
            setScopeEvent(editing.event)
            return
        }
        await removeEvent(editing.event, 'series')
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
                onAdd={() => openNew('allday')}
                onEdit={(event) => openExisting(event, 'allday')}
                isPastDay={date < todayKey()}
            />

            {/* Period rows */}
            {PERIODS.map((period) => (
                <PartRow
                    key={period.key}
                    label={period.label}
                    icon={period.icon}
                    events={events.filter((e) => eventCoversSlot(e, date, period.key))}
                    date={date}
                    past={isPartPast(date, period.key, new Date())}
                    onEdit={(event) => openExisting(event, period.key)}
                    onAdd={() => openNew(period.key)}
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
                knownEvents={events}
                onClose={() => {
                    setEditing(null)
                    setConflict(false)
                }}
                onSave={handleSave}
                onDelete={handleDelete}
            />
            {scopeEvent && (
                <DeleteRecurringEventDialog
                    title={scopeEvent.title}
                    occurrenceDate={scopeEvent.startDate}
                    onClose={() => setScopeEvent(null)}
                    onConfirm={(scope) => removeEvent(scopeEvent, scope)}
                />
            )}
        </div>
    )
}

function AllDaySection({
    events,
    date,
    onAdd,
    onEdit,
    isPastDay = false,
}: {
    events: Event[]
    date: string
    onAdd: () => void
    onEdit: (event: Event) => void
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
                        <AllDayChip key={e._id} event={e} date={date} onClick={() => onEdit(e)} />
                    ))
                )}
            </div>
        </div>
    )
}

function AllDayChip({ event, date, onClick }: { event: Event; date: string; onClick: () => void }) {
    const { byId } = useCalendars()
    const colors = colorsForEvent(event, byId)
    const isMultiDay = event.startDate !== event.endDate
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm font-semibold transition-colors ${colors.bg} ${colors.hover} ${colors.text}`}
        >
            {EVENT_TYPE_ICONS[event.eventType] && (
                <i
                    className={`${EVENT_TYPE_ICONS[event.eventType]} shrink-0 text-xs opacity-80`}
                    aria-hidden="true"
                />
            )}
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
    /** Every event occupying this part — layers can share a slot, so this is a list. */
    events: Event[]
    date: string
    past?: boolean
    onEdit: (event: Event) => void
    onAdd: () => void
}

function PartRow({ label, icon, events, date, past = false, onEdit, onAdd }: PartRowProps) {
    const { byId } = useCalendars()

    return (
        <div
            className={[
                'flex w-full items-start gap-4 rounded-2xl border p-4 text-left',
                past ? 'border-red-200 bg-red-100/60' : 'border-neutral-200 bg-white',
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

                {events.map((event) => {
                    const colors = colorsForEvent(event, byId)
                    const calendar = event.calendar ? byId.get(event.calendar) : undefined
                    const isMultiDay = event.startDate !== event.endDate
                    return (
                        <button
                            key={event._id}
                            type="button"
                            disabled={past}
                            onClick={() => onEdit(event)}
                            className="group -mx-2 mt-1 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left transition-colors enabled:hover:bg-neutral-100 disabled:cursor-default"
                        >
                            <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                                <span
                                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors.bg}`}
                                />
                                <span className="truncate">{event.title}</span>
                                {event.time && (
                                    <span className="shrink-0 font-medium tabular-nums text-neutral-400">
                                        {event.time}
                                    </span>
                                )}
                                {calendar && !calendar.isDefault && (
                                    <span
                                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colors.bg} ${colors.text}`}
                                    >
                                        {calendar.name}
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
                        </button>
                    )
                })}

                {past && events.length === 0 && <p className="mt-1 text-sm text-red-400">In the past</p>}

                {!past && (
                    <button
                        type="button"
                        onClick={onAdd}
                        className="-mx-2 mt-1 rounded-lg px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <i className="fa-solid fa-plus mr-1.5 text-[10px]" aria-hidden="true" />
                        Add event
                    </button>
                )}
            </div>
        </div>
    )
}
