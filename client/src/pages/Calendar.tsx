import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    MONTHS, WEEKDAYS, PERIODS, daysInMonth, dateKey, eventCoversSlot, isPartPast, todayKey,
    addDays, addMonths, getWeekStart, formatMonthYear, formatWeekRange, parseDateKey,
} from '../lib/calendar'
import { listEvents, updateEvent, deleteEvent, type EventInput } from '../services/events'
import { listStatuses } from '../services/dayStatus'
import { EVENT_TYPE_COLORS, NA_EVENT_COLORS, DAY_STATUS_OPTIONS } from '../types'
import type { Event, Part, DayStatus } from '../types'
import Tabs from '../components/Tabs'
import EventDetailModal from '../components/calendar/EventDetailModal'
import EventEditor from '../components/calendar/EventEditor'
import MonthView from '../components/calendar/MonthView'
import WeekView from '../components/calendar/WeekView'

type CalendarView = 'Week' | 'Month' | 'Year'
const VIEWS: CalendarView[] = ['Year', 'Month', 'Week']

function getRange(view: CalendarView, focusDate: string): { from: string; to: string } {
    if (view === 'Week') {
        const start = getWeekStart(focusDate)
        return { from: start, to: addDays(start, 6) }
    }
    if (view === 'Month') {
        const { year, month } = parseDateKey(focusDate)
        const last = new Date(year, month + 1, 0).getDate()
        return {
            from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
            to: `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
        }
    }
    // Year
    const year = focusDate.slice(0, 4)
    return { from: `${year}-01-01`, to: `${year}-12-31` }
}

function navigate(view: CalendarView, focusDate: string, delta: number): string {
    if (view === 'Week') return addDays(focusDate, delta * 7)
    if (view === 'Month') return addMonths(focusDate, delta)
    // Year
    const { year, month, day } = parseDateKey(focusDate)
    return dateKey(year + delta, month, day)
}

function getTitle(view: CalendarView, focusDate: string): string {
    if (view === 'Year') return focusDate.slice(0, 4)
    if (view === 'Month') return formatMonthYear(focusDate)
    const start = getWeekStart(focusDate)
    return formatWeekRange(start, addDays(start, 6))
}

export default function Calendar() {
    const today = new Date()
    const nav = useNavigate()
    const [view, setView] = useState<CalendarView>('Year')
    const [focusDate, setFocusDate] = useState(todayKey())
    const [events, setEvents] = useState<Event[]>([])
    const [statuses, setStatuses] = useState<DayStatus[]>([])
    const [detailEvent, setDetailEvent] = useState<Event | null>(null)
    const [editingEvent, setEditingEvent] = useState<Event | null>(null)
    const [editorOpen, setEditorOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [conflict, setConflict] = useState(false)

    const isToday = focusDate === todayKey()
    const title = getTitle(view, focusDate)
    const { from, to } = getRange(view, focusDate)

    const reload = useCallback(() => {
        Promise.all([listEvents(from, to), listStatuses(from, to)])
            .then(([evts, sts]) => { setEvents(evts); setStatuses(sts) })
            .catch(() => { setEvents([]); setStatuses([]) })
    }, [from, to])

    useEffect(() => { reload() }, [reload])

    async function handleSave(input: EventInput) {
        if (!editingEvent) return
        setSaving(true)
        setConflict(false)
        try {
            await updateEvent(editingEvent._id, input)
            reload()
            setEditorOpen(false)
            setEditingEvent(null)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status === 409) setConflict(true)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete() {
        if (!editingEvent) return
        setSaving(true)
        try {
            await deleteEvent(editingEvent._id)
            reload()
            setEditorOpen(false)
            setEditingEvent(null)
        } finally { setSaving(false) }
    }

    function openEdit(event: Event) {
        setDetailEvent(null)
        setEditingEvent(event)
        setEditorOpen(true)
        setConflict(false)
    }

    const sharedProps = {
        focusDate,
        events,
        statuses,
        today,
        onOpenDay: (date: string) => nav(`/day/${date}`),
        onOpenPart: (date: string, part: Part) => nav(`/day/${date}`, { state: { openPart: part } }),
        onEventClick: (event: Event) => setDetailEvent(event),
    }

    // Year view: hide past months
    const yearNum = parseInt(focusDate.slice(0, 4))
    const firstMonth = yearNum > today.getFullYear() ? 0 : yearNum === today.getFullYear() ? today.getMonth() : 12
    const visibleMonths = MONTHS.map((_, m) => m).filter((m) => m >= firstMonth)

    return (
        <main className="min-h-screen bg-neutral-50">
            {/* Toolbar */}
            <div className="sticky top-14 z-30 border-b border-neutral-100 bg-white/95 backdrop-blur-sm sm:top-16">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
                    {/* Title + nav */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setFocusDate((d) => navigate(view, d, -1))}
                            aria-label="Previous"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        </button>
                        <h1 className="min-w-32 text-center text-lg font-bold tracking-tight text-neutral-950">
                            {title}
                        </h1>
                        <button
                            type="button"
                            onClick={() => setFocusDate((d) => navigate(view, d, 1))}
                            aria-label="Next"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
                        </button>
                        {!isToday && (
                            <button
                                type="button"
                                onClick={() => setFocusDate(todayKey())}
                                className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                Today
                            </button>
                        )}
                    </div>

                    <Tabs tabs={VIEWS} value={view} onChange={(v) => setView(v as CalendarView)} />
                </div>
            </div>

            {/* Views */}
            <div className="p-4 sm:p-6">
                {view === 'Week' && (
                    <WeekView {...sharedProps} />
                )}

                {view === 'Month' && (
                    <MonthView {...sharedProps} />
                )}

                {view === 'Year' && (
                    <div className="flex flex-col gap-6">
                        {visibleMonths.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
                                <p className="text-sm text-neutral-500">No upcoming months in {yearNum}.</p>
                            </div>
                        ) : (
                            visibleMonths.map((month) => (
                                <MonthBlock
                                    key={month}
                                    year={yearNum}
                                    month={month}
                                    today={today}
                                    events={events}
                                    statuses={statuses}
                                    onOpenDay={(date) => nav(`/day/${date}`)}
                                    onOpenPart={(date, part) => nav(`/day/${date}`, { state: { openPart: part } })}
                                    onEventClick={(event) => setDetailEvent(event)}
                                />
                            ))
                        )}
                    </div>
                )}
            </div>

            <EventDetailModal
                event={detailEvent}
                onClose={() => setDetailEvent(null)}
                onEdit={() => detailEvent && openEdit(detailEvent)}
            />
            <EventEditor
                open={editorOpen}
                event={editingEvent}
                defaultSlot={editingEvent ? { date: editingEvent.startDate, part: editingEvent.startPart } : null}
                saving={saving}
                conflict={conflict}
                onClose={() => { setEditorOpen(false); setEditingEvent(null); setConflict(false) }}
                onSave={handleSave}
                onDelete={handleDelete}
            />
        </main>
    )
}

// ─── Year view: MonthBlock ────────────────────────────────────────────────────

interface MonthBlockProps {
    year: number
    month: number
    today: Date
    events: Event[]
    statuses: DayStatus[]
    onOpenDay: (date: string) => void
    onOpenPart: (date: string, part: Part) => void
    onEventClick: (event: Event) => void
}

function MonthBlock({ year, month, today, events, statuses, onOpenDay, onOpenPart, onEventClick }: MonthBlockProps) {
    const tk = todayKey()
    const total = daysInMonth(year, month)
    const dayNums = Array.from({ length: total }, (_, i) => i + 1)
    const isToday = (day: number) =>
        year === today.getFullYear() && month === today.getMonth() && day === today.getDate()

    return (
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-4 py-3">
                <h2 className="text-base font-bold tracking-tight text-neutral-950">
                    {MONTHS[month]} <span className="font-semibold text-neutral-400">{year}</span>
                </h2>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[64rem] table-fixed border-collapse">
                    <thead>
                        <tr className="border-b border-neutral-200">
                            <th className="sticky left-0 z-10 w-28 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Period
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const todayCol = isToday(day)
                                return (
                                    <th key={day} className={['w-12 px-1 py-2 text-center', weekend ? 'bg-neutral-100' : ''].join(' ')}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenDay(dateKey(year, month, day))}
                                            className={[
                                                'mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-lg transition-colors',
                                                todayCol ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'text-neutral-700 hover:bg-neutral-100',
                                            ].join(' ')}
                                        >
                                            <span className="text-sm font-semibold leading-none tabular-nums">{day}</span>
                                            <span className={['mt-0.5 text-[10px] leading-none', todayCol ? 'text-white/70' : 'text-neutral-400'].join(' ')}>
                                                {WEEKDAYS[weekday]}
                                            </span>
                                        </button>
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {PERIODS.map((period) => (
                            <tr key={period.key} className="border-b border-neutral-100">
                                <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                        <i className={`${period.icon} w-4 text-center text-neutral-400`} aria-hidden="true" />
                                        {period.label}
                                    </span>
                                </th>
                                {dayNums.map((day) => {
                                    const weekday = new Date(year, month, day).getDay()
                                    const weekend = weekday === 0 || weekday === 6
                                    const key = dateKey(year, month, day)
                                    const event = events.find((e) => eventCoversSlot(e, key, period.key)) ?? null
                                    const hasAllDay = !event && events.some((e) => e.allDay && key >= e.startDate && key <= e.endDate)
                                    const past = isPartPast(key, period.key, today)
                                    return (
                                        <td
                                            key={day}
                                            className={[
                                                'h-12 border-l border-neutral-100 p-0.5 align-top',
                                                past ? 'bg-red-100/70' : hasAllDay ? 'bg-neutral-100/70' : weekend ? 'bg-neutral-100/60' : '',
                                            ].join(' ')}
                                        >
                                            <PartCell
                                                event={event}
                                                onClick={event ? () => onEventClick(event) : () => onOpenPart(key, period.key)}
                                                disabled={past}
                                            />
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}

                        {/* Other row */}
                        <tr className="border-t border-neutral-200">
                            <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i className="fa-solid fa-ellipsis w-4 text-center text-neutral-400" aria-hidden="true" />
                                    Other
                                </span>
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const key = dateKey(year, month, day)
                                const event = events.find((e) => e.startPart === 'na' && key >= e.startDate && key <= e.endDate) ?? null
                                const otherPast = key < tk
                                return (
                                    <td key={day} className={['h-12 border-l border-neutral-100 p-0.5 align-top', weekend ? 'bg-neutral-100/60' : ''].join(' ')}>
                                        <PartCell
                                            event={event}
                                            onClick={event ? () => onEventClick(event) : () => onOpenPart(key, 'na')}
                                            disabled={otherPast}
                                        />
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Leave row */}
                        <tr className="border-t border-neutral-200">
                            <th scope="row" className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle">
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i className="fa-solid fa-umbrella-beach w-4 text-center text-neutral-400" aria-hidden="true" />
                                    Leave
                                </span>
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const key = dateKey(year, month, day)
                                const status = statuses.find((s) => s.startDate <= key && s.endDate >= key) ?? null
                                const colors = status ? DAY_STATUS_OPTIONS.find((o) => o.value === status.status) : null
                                return (
                                    <td key={day} className={['h-12 border-l border-neutral-100 p-0.5 align-top', weekend ? 'bg-neutral-100/60' : ''].join(' ')}>
                                        {status && colors ? (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay(key)}
                                                title={colors.label}
                                                className={`flex h-full w-full items-center overflow-hidden rounded-lg px-1.5 text-left transition-colors ${colors.bg} ${colors.hover} ${colors.text}`}
                                            >
                                                <span className="truncate text-[11px] font-semibold leading-tight">{colors.label}</span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay(key)}
                                                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100"
                                            >
                                                <i className="fa-solid fa-plus text-[10px] opacity-0 group-hover:opacity-100" />
                                            </button>
                                        )}
                                    </td>
                                )
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    )
}

function EventCell({
    event,
    onClick,
    disabled = false,
}: {
    event: Event | null
    onClick: () => void
    disabled?: boolean
}) {
    if (!event) {
        if (disabled) return <div className="h-full w-full" />
        return (
            <button
                type="button"
                onClick={onClick}
                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
            >
                <i className="fa-solid fa-plus text-[10px] opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
        )
    }
    const { bg, hover, text } = event.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
    return disabled ? (
        <div title={event.title} className={`flex h-full w-full items-center gap-1 overflow-hidden rounded-lg px-1.5 opacity-50 ${bg} ${text}`}>
            <span className="truncate text-[11px] font-semibold leading-tight">{event.title}</span>
        </div>
    ) : (
        <button
            type="button"
            onClick={onClick}
            title={event.title}
            className={`flex h-full w-full items-center gap-1 overflow-hidden rounded-lg px-1.5 text-left transition-colors ${bg} ${hover} ${text}`}
        >
            <span className="truncate text-[11px] font-semibold leading-tight">{event.title}</span>
            {event.recurrence && <i className="fa-solid fa-repeat shrink-0 text-[8px] opacity-60" />}
        </button>
    )
}

function PartCell({ event, onClick, disabled = false }: { event: Event | null; onClick: () => void; disabled?: boolean }) {
    return <EventCell event={event} onClick={onClick} disabled={disabled} />
}
