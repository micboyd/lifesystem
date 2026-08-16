import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    MONTHS,
    WEEKDAYS,
    PERIODS,
    daysInMonth,
    dateKey,
    eventCoversSlot,
    isPartPast,
    todayKey,
    addDays,
    addMonths,
    getWeekStart,
    formatMonthYear,
    formatWeekRange,
    formatDateLong,
    parseDateKey,
    monthKey,
    monthKeyOf,
} from '../lib/calendar'
import {
    listEvents,
    createEvent,
    updateEvent,
    updateEventOccurrence,
    deleteEvent,
    type EventInput,
} from '../services/events'
import { listBirthdays } from '../services/birthdays'
import { listStatuses } from '../services/dayStatus'
import { listReminders } from '../services/reminders'
import { listMonthNotes } from '../services/monthNotes'
import { listRows, createRow, updateRow, deleteRow, listValues, setValue } from '../services/totals'
import { useAuth } from '../context/AuthContext'
import { useCalendars } from '../context/CalendarsContext'
import { DAY_STATUS_OPTIONS } from '../types'
import type { Event, Part, DayStatus, TotalRow, Reminder, MonthNote, Birthday } from '../types'
import Container from '../components/Container'
import Checkbox from '../components/Checkbox'
import ConfirmModal from '../components/ConfirmModal'
import Tabs from '../components/Tabs'
import EventDetailModal from '../components/calendar/EventDetailModal'
import EventEditor from '../components/calendar/EventEditor'
import EventStack from '../components/calendar/EventStack'
import EventPickerModal from '../components/calendar/EventPickerModal'
import DeleteRecurringEventDialog, {
    type DeleteScope,
} from '../components/calendar/DeleteRecurringEventDialog'
import EditRecurringEventDialog, {
    type EditScope,
} from '../components/calendar/EditRecurringEventDialog'
import MonthView from '../components/calendar/MonthView'
import MonthFlags from '../components/calendar/MonthFlags'
import MonthNoteEditor from '../components/calendar/MonthNoteEditor'
import WeekView from '../components/calendar/WeekView'
import CalendarFilterBar from '../components/calendar/CalendarFilterBar'
import HiddenCalendarDots from '../components/calendar/HiddenCalendarDots'
import Drawer from '../components/Drawer'
import DayStatusSection from '../components/calendar/DayStatusSection'
import BirthdaysDaySection from '../components/calendar/BirthdaysDaySection'
import BirthdayBadge from '../components/calendar/BirthdayBadge'
import RemindersDaySection from '../components/reminders/RemindersDaySection'

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

/** Whole-day distance from start to end (0 for a same-day event). */
function daySpan(start: string, end: string): number {
    const a = new Date(start + 'T00:00:00')
    const b = new Date(end + 'T00:00:00')
    return Math.round((b.getTime() - a.getTime()) / 86_400_000)
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
    const { user } = useAuth()
    const { byId: calendarsById, setVisible } = useCalendars()
    const [view, setView] = useState<CalendarView>('Year')
    const [showPastMonths, setShowPastMonths] = useState(false)
    const [focusDate, setFocusDate] = useState(todayKey())
    const [events, setEvents] = useState<Event[]>([])
    const [statuses, setStatuses] = useState<DayStatus[]>([])
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [birthdays, setBirthdays] = useState<Birthday[]>([])
    const [monthNotes, setMonthNotes] = useState<MonthNote[]>([])
    const [rows, setRows] = useState<TotalRow[]>([])
    const [values, setValues] = useState<Record<string, number>>({})
    const [detailEvent, setDetailEvent] = useState<Event | null>(null)
    const [pickerEvents, setPickerEvents] = useState<Event[] | null>(null)
    const [editingEvent, setEditingEvent] = useState<Event | null>(null)
    const [scopeEvent, setScopeEvent] = useState<Event | null>(null)
    // Non-recurring event awaiting confirmation of a right-click delete.
    const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<Event | null>(null)
    // A pending save of a recurring event, held while the this-one / whole-series
    // chooser is open. Applied once the user picks a scope.
    const [editScopeInput, setEditScopeInput] = useState<EventInput | null>(null)
    const [editorOpen, setEditorOpen] = useState(false)
    const [defaultSlot, setDefaultSlot] = useState<{ date: string; part: Part } | null>(null)
    const [saving, setSaving] = useState(false)
    const [conflict, setConflict] = useState(false)
    // Day whose leave/holiday is being edited in the drawer (Year-view Leave row).
    const [leaveDate, setLeaveDate] = useState<string | null>(null)
    // Day whose reminders are being edited in the drawer.
    const [reminderDate, setReminderDate] = useState<string | null>(null)
    // Day whose birthdays are being listed in the drawer.
    const [birthdayDate, setBirthdayDate] = useState<string | null>(null)
    // Event copied via a chip's copy icon, ready to paste into an empty slot.
    const [copiedEvent, setCopiedEvent] = useState<Event | null>(null)
    // Month flag being edited. `note: null` with a month set means "create one
    // starting here"; the whole thing null means the editor is closed.
    const [noteEdit, setNoteEdit] = useState<{ note: MonthNote | null; month: string } | null>(null)

    // ── Totals cell selection + in-app copy buffer ──
    const [selection, setSelection] = useState<CellSel | null>(null)
    const [clipboard, setClipboard] = useState<(number | null)[][] | null>(null)
    const [dragging, setDragging] = useState(false)
    const dragAnchor = useRef<{ month: number; r: number; d: number } | null>(null)
    // Always-current handle to the value setter, so the copy/paste callbacks
    // don't need it in their dependency lists.
    const onSetValueRef = useRef<(rowId: string, date: string, value: number | null) => void>(
        () => {}
    )

    const isToday = focusDate === todayKey()
    const title = getTitle(view, focusDate)
    const { from, to } = getRange(view, focusDate)

    // Totals are a Year-view-only feature gated behind a user setting.
    const totalsOn = !!user?.settings?.showTotals && view === 'Year'

    const reload = useCallback(() => {
        Promise.all([
            listEvents(from, to),
            listStatuses(from, to),
            listBirthdays(),
            listReminders(from, to),
            listMonthNotes(monthKeyOf(from), monthKeyOf(to)),
        ])
            .then(([evts, sts, bdays, rems, notes]) => {
                setEvents(evts as Event[])
                setStatuses(sts)
                setBirthdays(bdays)
                setReminders(rems)
                setMonthNotes(notes)
            })
            .catch(() => {
                setEvents([])
                setStatuses([])
                setBirthdays([])
                setReminders([])
                setMonthNotes([])
            })

        if (totalsOn) {
            Promise.all([listRows(), listValues(from, to)])
                .then(([rs, vs]) => {
                    setRows(rs)
                    setValues(Object.fromEntries(vs.map((v) => [`${v.row}:${v.date}`, v.value])))
                })
                .catch(() => {
                    setRows([])
                    setValues({})
                })
        } else {
            setRows([])
            setValues({})
        }
    }, [from, to, totalsOn])

    useEffect(() => {
        reload()
    }, [reload])

    // ── Totals handlers ──
    async function handleSetValue(rowId: string, date: string, value: number | null) {
        const key = `${rowId}:${date}`
        setValues((prev) => {
            const next = { ...prev }
            if (value === null) delete next[key]
            else next[key] = value
            return next
        })
        try {
            await setValue(rowId, date, value)
        } catch {
            reload()
        }
    }

    async function handleAddRow(name: string, granularity: 'daily' | 'weekly' = 'daily') {
        const row = await createRow(name, granularity)
        setRows((prev) => [...prev, row])
    }

    async function handleRenameRow(id: string, name: string) {
        const row = await updateRow(id, { name })
        setRows((prev) => prev.map((r) => (r._id === id ? row : r)))
    }

    async function handleChangeGranularity(id: string, granularity: 'daily' | 'weekly') {
        const row = await updateRow(id, { granularity })
        setRows((prev) => prev.map((r) => (r._id === id ? row : r)))
    }

    async function handleDeleteRow(id: string) {
        setRows((prev) => prev.filter((r) => r._id !== id))
        setValues((prev) => {
            const next: Record<string, number> = {}
            for (const [k, v] of Object.entries(prev)) if (!k.startsWith(`${id}:`)) next[k] = v
            return next
        })
        await deleteRow(id)
    }

    // Editing an existing recurring event first asks whether the change applies
    // to this occurrence or the whole series; everything else saves straight away.
    function handleSave(input: EventInput) {
        if (editingEvent?.recurrence) {
            setEditScopeInput(input)
            return
        }
        void commitSave(input, 'series')
    }

    async function commitSave(input: EventInput, scope: EditScope) {
        setEditScopeInput(null)
        setSaving(true)
        setConflict(false)
        try {
            if (!editingEvent) {
                await createEvent(input)
            } else if (scope === 'instance') {
                // Detach just this occurrence into its own standalone event.
                await updateEventOccurrence(editingEvent._id, editingEvent.startDate, input)
            } else {
                await updateEvent(editingEvent._id, input)
            }
            reload()
            setEditorOpen(false)
            setEditingEvent(null)
            setDefaultSlot(null)
        } catch (err: unknown) {
            if ((err as { response?: { status?: number } })?.response?.status === 409)
                setConflict(true)
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
            reload()
            setEditorOpen(false)
            setEditingEvent(null)
            setScopeEvent(null)
            setDetailEvent(null)
        } finally {
            setSaving(false)
        }
    }

    // Delete requested from an event's right-click menu. Recurring events go
    // straight to the this-one / whole-series chooser; anything else asks for a
    // plain confirmation first, since a context-menu click is easy to misfire.
    function requestDeleteEvent(event: Event) {
        if (event.recurrence) {
            setScopeEvent(event)
            return
        }
        setConfirmDeleteEvent(event)
    }

    async function handleDelete() {
        if (!editingEvent) return
        // Recurring events offer a this-one / whole-series choice; others delete directly.
        if (editingEvent.recurrence) {
            setScopeEvent(editingEvent)
            return
        }
        await removeEvent(editingEvent, 'series')
    }

    function openEdit(event: Event) {
        setDetailEvent(null)
        setEditingEvent(event)
        setEditorOpen(true)
        setConflict(false)
    }

    // Duplicate the copied event into the target slot, preserving its day span
    // and remaining details. Recurrence is dropped — a paste is a one-off copy.
    async function pasteEvent(date: string, part: Part) {
        if (!copiedEvent) return
        const src = copiedEvent
        const span = daySpan(src.startDate, src.endDate)
        const input: EventInput = {
            calendar: src.calendar,
            title: src.title,
            notes: src.notes,
            location: src.location,
            eventType: src.eventType,
            allDay: src.allDay,
            time: src.time,
            startDate: date,
            startPart: part,
            endDate: addDays(date, span),
            // Single-slot events collapse onto the target part; multi-part spans
            // keep their original ending shape.
            endPart: span === 0 ? part : src.endPart,
            ignoreClash: src.ignoreClash,
        }
        setSaving(true)
        try {
            await createEvent(input)
        } catch (err: unknown) {
            // The user deliberately pasted here — if it clashes, force it through
            // rather than dropping the paste silently.
            if ((err as { response?: { status?: number } })?.response?.status === 409) {
                try {
                    await createEvent({ ...input, ignoreClash: true })
                } catch {
                    /* give up quietly */
                }
            }
        } finally {
            setSaving(false)
            reload()
        }
    }

    // ── Totals cell selection ──
    // Begin a selection (single cell) and record the drag anchor.
    const startCell = useCallback((month: number, r: number, d: number) => {
        dragAnchor.current = { month, r, d }
        setSelection({ month, rowStart: r, rowEnd: r, dayStart: d, dayEnd: d })
    }, [])

    // Extend the selection while the mouse is held; clears native text selection.
    const extendCell = useCallback((month: number, r: number, d: number) => {
        const a = dragAnchor.current
        if (!a || a.month !== month) return
        setDragging(true)
        window.getSelection()?.removeAllRanges()
        ;(document.activeElement as HTMLElement | null)?.blur?.()
        setSelection({
            month,
            rowStart: Math.min(a.r, r),
            rowEnd: Math.max(a.r, r),
            dayStart: Math.min(a.d, d),
            dayEnd: Math.max(a.d, d),
        })
    }, [])

    // Keep the value-setter ref pointing at the latest closure.
    useEffect(() => {
        onSetValueRef.current = handleSetValue
    })

    // End any drag on mouse release anywhere.
    useEffect(() => {
        function up() {
            dragAnchor.current = null
            setDragging(false)
        }
        window.addEventListener('mouseup', up)
        return () => window.removeEventListener('mouseup', up)
    }, [])

    // Clicking anywhere outside the totals cells clears the selection. Only
    // listens while a selection exists; the mousedown that creates one happens
    // before this re-attaches, so it never clears itself.
    useEffect(() => {
        if (!selection) return
        function onDown(e: MouseEvent) {
            const target = e.target as HTMLElement | null
            if (target?.closest('[data-totals-cell]')) return
            setSelection(null)
        }
        document.addEventListener('mousedown', onDown)
        return () => document.removeEventListener('mousedown', onDown)
    }, [selection])

    // A stale selection from another month/year is meaningless after navigating.
    useEffect(() => {
        setSelection(null)
    }, [focusDate, view])

    const copySelection = useCallback(() => {
        if (!selection) return
        const year = parseInt(focusDate.slice(0, 4))
        const { month, rowStart, rowEnd, dayStart, dayEnd } = selection
        const block: (number | null)[][] = []
        for (let r = rowStart; r <= rowEnd; r++) {
            const row = rows[r]
            if (!row) continue
            const line: (number | null)[] = []
            for (let d = dayStart; d <= dayEnd; d++) {
                line.push(values[`${row._id}:${cellDate(row, year, month, d)}`] ?? null)
            }
            block.push(line)
        }
        if (block.length) setClipboard(block)
    }, [selection, rows, values, focusDate])

    const pasteSelection = useCallback(() => {
        if (!selection || !clipboard) return
        const year = parseInt(focusDate.slice(0, 4))
        const { month, rowStart, rowEnd, dayStart, dayEnd } = selection
        const monthDays = daysInMonth(year, month)
        const clipRows = clipboard.length
        const clipCols = clipboard[0]?.length ?? 0
        if (!clipRows || !clipCols) return
        // Fill the larger of the copied block and the target selection, tiling
        // the block when the selection is bigger (Excel-style fill). A 1×1
        // selection just stamps the whole block at that anchor.
        const outRows = Math.max(rowEnd - rowStart + 1, clipRows)
        const outCols = Math.max(dayEnd - dayStart + 1, clipCols)
        for (let i = 0; i < outRows; i++) {
            const row = rows[rowStart + i]
            if (!row) continue
            for (let j = 0; j < outCols; j++) {
                const dayIndex = dayStart + j
                if (dayIndex >= monthDays) continue
                const val = clipboard[i % clipRows][j % clipCols]
                onSetValueRef.current(row._id, cellDate(row, year, month, dayIndex), val)
            }
        }
        // Move the selection to cover the filled block.
        setSelection({
            month,
            rowStart,
            rowEnd: Math.min(rowStart + outRows - 1, rows.length - 1),
            dayStart,
            dayEnd: Math.min(dayStart + outCols - 1, monthDays - 1),
        })
    }, [selection, clipboard, rows, focusDate])

    const clearSelectionValues = useCallback(() => {
        if (!selection) return
        const year = parseInt(focusDate.slice(0, 4))
        const { month, rowStart, rowEnd, dayStart, dayEnd } = selection
        const monthDays = daysInMonth(year, month)
        for (let r = rowStart; r <= rowEnd; r++) {
            const row = rows[r]
            if (!row) continue
            for (let d = dayStart; d <= Math.min(dayEnd, monthDays - 1); d++) {
                onSetValueRef.current(row._id, cellDate(row, year, month, d), null)
            }
        }
    }, [selection, rows, focusDate])

    useEffect(() => {
        if (!totalsOn) return
        function onKey(e: KeyboardEvent) {
            if (!selection) return
            const mod = e.ctrlKey || e.metaKey
            const tag = (document.activeElement?.tagName ?? '').toUpperCase()
            const inInput = tag === 'INPUT' || tag === 'TEXTAREA'
            if (mod && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault()
                copySelection()
            } else if (mod && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault()
                pasteSelection()
            } else if (e.key === 'Escape') {
                setSelection(null)
            } else if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
                e.preventDefault()
                clearSelectionValues()
            }
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [totalsOn, selection, copySelection, pasteSelection, clearSelectionValues])

    // An event is drawn when its calendar is visible. Events with no calendar
    // aren't a layer you manage, so they're always shown.
    const isShown = useCallback(
        (event: Event) => {
            if (!event.calendar) return true
            return calendarsById.get(event.calendar)?.visible ?? true
        },
        [calendarsById]
    )

    const visibleEvents = useMemo(() => events.filter(isShown), [events, isShown])

    // Everything on a hidden layer, indexed by every date it touches, so each
    // day cell can show a presence dot without re-scanning the whole list.
    const hiddenByDate = useMemo(() => {
        const map = new Map<string, Event[]>()
        for (const event of events) {
            if (isShown(event)) continue
            for (let d = event.startDate; d <= event.endDate; d = addDays(d, 1)) {
                const bucket = map.get(d)
                if (bucket) bucket.push(event)
                else map.set(d, [event])
            }
        }
        return map
    }, [events, isShown])

    // Birthdays keyed by their MM-DD, so any year in view can look up a day's
    // birthdays without expanding them into per-year rows.
    const birthdaysByDay = useMemo(() => {
        const map = new Map<string, Birthday[]>()
        for (const b of birthdays) {
            const bucket = map.get(b.date)
            if (bucket) bucket.push(b)
            else map.set(b.date, [b])
        }
        return map
    }, [birthdays])

    const revealCalendar = useCallback(
        (calendarId: string) => void setVisible(calendarId, true),
        [setVisible]
    )

    const sharedProps = {
        focusDate,
        events: visibleEvents,
        statuses,
        reminders,
        today,
        hiddenByDate,
        birthdaysByDay,
        onRevealCalendar: revealCalendar,
        onOpenDay: (date: string) => nav(`/day/${date}`),
        onOpenReminders: (date: string) => setReminderDate(date),
        onOpenBirthdays: (date: string) => setBirthdayDate(date),
        // Adding an event from a slot opens the editor in place — only the day
        // number navigates to the day view.
        onOpenPart: (date: string, part: Part) => {
            setEditingEvent(null)
            setEditorOpen(true)
            setDefaultSlot({ date, part })
        },
        onEventClick: (event: Event) => setDetailEvent(event),
        onPickEvents: (evts: Event[]) => setPickerEvents(evts),
        onCopyEvent: (event: Event) => setCopiedEvent(event),
        onDeleteEvent: requestDeleteEvent,
        onPasteEvent: pasteEvent,
        canPaste: !!copiedEvent,
        onCreateEvent: (date: string) => {
            setEditingEvent(null)
            setEditorOpen(true)
            setDefaultSlot({ date, part: 'morning' })
        },
    }

    // Year view: hide past months unless the user opts in.
    const yearNum = parseInt(focusDate.slice(0, 4))
    const firstMonth = showPastMonths
        ? 0
        : yearNum > today.getFullYear()
          ? 0
          : yearNum === today.getFullYear()
            ? today.getMonth()
            : 12
    const visibleMonths = MONTHS.map((_, m) => m).filter((m) => m >= firstMonth)

    return (
        <main className="min-h-screen bg-neutral-50">
            {/* Toolbar — the bar is full-bleed; its content uses the fluid container. */}
            <div className="sticky top-14 z-30 border-b border-neutral-100 bg-white/95 backdrop-blur-sm lg:top-0">
                <Container fluid className="flex flex-wrap items-center justify-between gap-3 py-3">
                    {/* Title + nav. Wraps on phones: in Year view the arrows, the
                        title, "Today" and the past-months checkbox total ~460px,
                        and none of them shrink. */}
                    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setFocusDate((d) => navigate(view, d, -1))}
                            aria-label="Previous"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        </button>
                        <h1 className="min-w-0 flex-1 text-center text-lg font-bold tracking-tight text-neutral-950 sm:min-w-32 sm:flex-none">
                            {title}
                        </h1>
                        <button
                            type="button"
                            onClick={() => setFocusDate((d) => navigate(view, d, 1))}
                            aria-label="Next"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
                        </button>
                        {!isToday && (
                            <button
                                type="button"
                                onClick={() => setFocusDate(todayKey())}
                                className="shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                Today
                            </button>
                        )}
                        {view === 'Year' && (
                            <Checkbox
                                checked={showPastMonths}
                                onChange={setShowPastMonths}
                                label="View previous months"
                                className="ml-0 shrink-0 sm:ml-2"
                            />
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <CalendarFilterBar onChanged={reload} />
                        <Tabs
                            tabs={VIEWS}
                            value={view}
                            onChange={(v) => setView(v as CalendarView)}
                        />
                    </div>
                </Container>
            </div>

            {/* Views */}
            <Container fluid className="py-4 sm:py-6">
                {view === 'Week' && <WeekView {...sharedProps} />}

                {view === 'Month' && (
                    <div className="flex flex-col gap-3">
                        <MonthFlags
                            month={monthKeyOf(focusDate)}
                            notes={monthNotes}
                            onEdit={(note) => setNoteEdit({ note, month: note.startMonth })}
                            onAdd={(m) => setNoteEdit({ note: null, month: m })}
                        />
                        <MonthView {...sharedProps} />
                    </div>
                )}

                {view === 'Year' && (
                    <div className="flex flex-col gap-6">
                        {visibleMonths.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-10 text-center">
                                <p className="text-sm text-neutral-500">
                                    No upcoming months in {yearNum}.
                                </p>
                            </div>
                        ) : (
                            visibleMonths.map((month) => (
                                <MonthBlock
                                    key={month}
                                    year={yearNum}
                                    month={month}
                                    today={today}
                                    events={visibleEvents}
                                    hiddenByDate={hiddenByDate}
                                    birthdaysByDay={birthdaysByDay}
                                    onRevealCalendar={revealCalendar}
                                    statuses={statuses}
                                    reminders={reminders}
                                    monthNotes={monthNotes}
                                    onEditMonthNote={(note) =>
                                        setNoteEdit({ note, month: note.startMonth })
                                    }
                                    onAddMonthNote={(m) => setNoteEdit({ note: null, month: m })}
                                    totalsOn={totalsOn}
                                    rows={rows}
                                    values={values}
                                    sel={selection?.month === month ? selection : null}
                                    dragging={dragging}
                                    onCellDown={startCell}
                                    onCellEnter={extendCell}
                                    onSetValue={handleSetValue}
                                    onAddRow={handleAddRow}
                                    onRenameRow={handleRenameRow}
                                    onDeleteRow={handleDeleteRow}
                                    onChangeGranularity={handleChangeGranularity}
                                    onOpenDay={(date) => nav(`/day/${date}`)}
                                    onOpenPart={(date, part) => {
                                        setEditingEvent(null)
                                        setEditorOpen(true)
                                        setDefaultSlot({ date, part })
                                    }}
                                    onLeaveClick={(date) => setLeaveDate(date)}
                                    onReminderClick={(date) => setReminderDate(date)}
                                    onBirthdayClick={(date) => setBirthdayDate(date)}
                                    onEventClick={(event) => setDetailEvent(event)}
                                    onPickEvents={(evts) => setPickerEvents(evts)}
                                    onCopyEvent={(event) => setCopiedEvent(event)}
                                    onDeleteEvent={requestDeleteEvent}
                                    onPasteEvent={pasteEvent}
                                    canPaste={!!copiedEvent}
                                />
                            ))
                        )}
                    </div>
                )}
            </Container>

            <MonthNoteEditor
                open={!!noteEdit}
                note={noteEdit?.note ?? null}
                defaultMonth={noteEdit?.month ?? monthKeyOf(focusDate)}
                onClose={() => setNoteEdit(null)}
                onSaved={reload}
            />

            <EventDetailModal
                event={detailEvent}
                onClose={() => setDetailEvent(null)}
                onEdit={() => detailEvent && openEdit(detailEvent)}
                onDelete={
                    detailEvent
                        ? (event) => {
                              // Recurring events offer this-one / whole-series; the
                              // scope dialog takes over from the closing detail modal.
                              if (event.recurrence) {
                                  setScopeEvent(event)
                                  setDetailEvent(null)
                                  return
                              }
                              return removeEvent(event, 'series')
                          }
                        : undefined
                }
                onSaveNotes={
                    // Inline notes only for non-recurring events. Recurring
                    // instances carry an occurrence date, so saving would move
                    // the whole series — they stay read-only.
                    detailEvent && !detailEvent.recurrence
                        ? async (notes) => {
                              const ev = detailEvent
                              await updateEvent(ev._id, {
                                  calendar: ev.calendar,
                                  title: ev.title,
                                  notes: notes || undefined,
                                  location: ev.location,
                                  eventType: ev.eventType,
                                  allDay: ev.allDay,
                                  time: ev.time,
                                  startDate: ev.startDate,
                                  startPart: ev.startPart,
                                  endDate: ev.endDate,
                                  endPart: ev.endPart,
                                  ignoreClash: ev.ignoreClash,
                              })
                              setDetailEvent({ ...ev, notes: notes || undefined })
                              reload()
                          }
                        : undefined
                }
            />
            <EventPickerModal
                events={pickerEvents}
                onClose={() => setPickerEvents(null)}
                onSelect={(event) => {
                    setPickerEvents(null)
                    setDetailEvent(event)
                }}
            />
            <EventEditor
                open={editorOpen}
                event={editingEvent}
                defaultSlot={
                    editingEvent
                        ? { date: editingEvent.startDate, part: editingEvent.startPart }
                        : defaultSlot
                }
                saving={saving}
                conflict={conflict}
                knownEvents={events}
                onRevealCalendar={revealCalendar}
                onClose={() => {
                    setEditorOpen(false)
                    setEditingEvent(null)
                    setDefaultSlot(null)
                    setConflict(false)
                    setEditScopeInput(null)
                }}
                onSave={handleSave}
                onDelete={handleDelete}
            />
            <ConfirmModal
                open={!!confirmDeleteEvent}
                title="Delete event?"
                message={
                    <>
                        <span className="font-semibold text-neutral-900">
                            {confirmDeleteEvent?.title}
                        </span>{' '}
                        will be permanently deleted.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    if (confirmDeleteEvent) void removeEvent(confirmDeleteEvent, 'series')
                }}
                onClose={() => setConfirmDeleteEvent(null)}
            />
            {scopeEvent && (
                <DeleteRecurringEventDialog
                    title={scopeEvent.title}
                    occurrenceDate={scopeEvent.startDate}
                    onClose={() => setScopeEvent(null)}
                    onConfirm={(scope) => removeEvent(scopeEvent, scope)}
                />
            )}
            {editScopeInput && editingEvent && (
                <EditRecurringEventDialog
                    title={editingEvent.title}
                    occurrenceDate={editingEvent.startDate}
                    onClose={() => setEditScopeInput(null)}
                    onConfirm={(scope) => commitSave(editScopeInput, scope)}
                />
            )}

            {/* Leave / holiday editor — opened from the Year-view Leave row. */}
            <Drawer
                open={!!leaveDate}
                onClose={() => {
                    setLeaveDate(null)
                    reload()
                }}
                title="Leave & Holidays"
            >
                {leaveDate && <DayStatusSection key={leaveDate} date={leaveDate} defaultAdding />}
            </Drawer>

            {/* Reminders editor — opened from any view's reminder affordance. */}
            <Drawer
                open={!!reminderDate}
                onClose={() => setReminderDate(null)}
                title={reminderDate ? `Reminders · ${formatDateLong(reminderDate)}` : 'Reminders'}
            >
                {reminderDate && (
                    <RemindersDaySection
                        key={reminderDate}
                        date={reminderDate}
                        autoFocus
                        showDaysAway
                        onChange={reload}
                    />
                )}
            </Drawer>

            {/* Birthdays for a day — opened from a day's cake icon. */}
            <Drawer
                open={!!birthdayDate}
                onClose={() => setBirthdayDate(null)}
                title={birthdayDate ? `Birthdays · ${formatDateLong(birthdayDate)}` : 'Birthdays'}
            >
                {birthdayDate && (
                    <BirthdaysDaySection
                        birthdays={birthdaysByDay.get(birthdayDate.slice(5)) ?? []}
                    />
                )}
            </Drawer>
        </main>
    )
}

// ─── Weekly grouping helper ───────────────────────────────────────────────────

function weekGroupsForMonth(
    year: number,
    month: number,
    dayNums: number[]
): { anchor: string; days: number[] }[] {
    const groups: { anchor: string; days: number[] }[] = []
    for (const day of dayNums) {
        const d = new Date(year, month, day)
        // ISO Monday anchor: subtract day-of-week offset (Mon=0 … Sun=6)
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
        const monday = new Date(d)
        monday.setDate(d.getDate() - dow)
        const anchor = dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate())
        const last = groups[groups.length - 1]
        if (last?.anchor === anchor) last.days.push(day)
        else groups.push({ anchor, days: [day] })
    }
    return groups
}

// ─── Totals cell selection ─────────────────────────────────────────────────────

/** A rectangular block of totals cells within one month, in row/day index space. */
interface CellSel {
    month: number
    rowStart: number
    rowEnd: number
    dayStart: number
    dayEnd: number
}

/** ISO-Monday week anchor for a 1-based day, mirroring weekGroupsForMonth. */
function weekAnchorFor(year: number, month: number, day: number): string {
    const d = new Date(year, month, day)
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1
    const monday = new Date(d)
    monday.setDate(d.getDate() - dow)
    return dateKey(monday.getFullYear(), monday.getMonth(), monday.getDate())
}

/** The value key date for a row at a 0-based day index (week anchor when weekly). */
function cellDate(row: TotalRow, year: number, month: number, dayIndex: number): string {
    return row.granularity === 'weekly'
        ? weekAnchorFor(year, month, dayIndex + 1)
        : dateKey(year, month, dayIndex + 1)
}

// ─── Year view: MonthBlock ────────────────────────────────────────────────────

interface MonthBlockProps {
    year: number
    month: number
    today: Date
    events: Event[]
    /** Events on hidden calendars, keyed by date — drawn as presence dots. */
    hiddenByDate: Map<string, Event[]>
    /** Birthdays keyed by MM-DD — drawn as a cake in the day header. */
    birthdaysByDay: Map<string, Birthday[]>
    onRevealCalendar: (calendarId: string) => void
    statuses: DayStatus[]
    reminders: Reminder[]
    monthNotes: MonthNote[]
    onEditMonthNote: (note: MonthNote) => void
    onAddMonthNote: (month: string) => void
    totalsOn: boolean
    rows: TotalRow[]
    values: Record<string, number>
    sel: CellSel | null
    dragging: boolean
    onCellDown: (month: number, r: number, d: number) => void
    onCellEnter: (month: number, r: number, d: number) => void
    onSetValue: (rowId: string, date: string, value: number | null) => void
    onAddRow: (name: string, granularity: 'daily' | 'weekly') => void
    onRenameRow: (id: string, name: string) => void
    onDeleteRow: (id: string) => void
    onChangeGranularity: (id: string, granularity: 'daily' | 'weekly') => void
    onOpenDay: (date: string) => void
    onOpenPart: (date: string, part: Part) => void
    onLeaveClick: (date: string) => void
    onReminderClick: (date: string) => void
    onBirthdayClick: (date: string) => void
    onEventClick: (event: Event) => void
    onPickEvents: (events: Event[]) => void
    onCopyEvent: (event: Event) => void
    onDeleteEvent: (event: Event) => void
    onPasteEvent: (date: string, part: Part) => void
    canPaste: boolean
}

function MonthBlock({
    year,
    month,
    today,
    events,
    hiddenByDate,
    birthdaysByDay,
    onRevealCalendar,
    statuses,
    reminders,
    monthNotes,
    onEditMonthNote,
    onAddMonthNote,
    totalsOn,
    rows,
    values,
    sel,
    dragging,
    onCellDown,
    onCellEnter,
    onSetValue,
    onAddRow,
    onRenameRow,
    onDeleteRow,
    onChangeGranularity,
    onOpenDay,
    onOpenPart,
    onLeaveClick,
    onReminderClick,
    onBirthdayClick,
    onEventClick,
    onPickEvents,
    onCopyEvent,
    onDeleteEvent,
    onPasteEvent,
    canPaste,
}: MonthBlockProps) {
    const tk = todayKey()
    const total = daysInMonth(year, month)
    const dayNums = Array.from({ length: total }, (_, i) => i + 1)
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
    const isToday = (day: number) => isCurrentMonth && day === today.getDate()

    // On load, centre today's column when the grid overflows (e.g. on mobile),
    // so the user lands on the current date instead of having to swipe across.
    const scrollRef = useRef<HTMLDivElement>(null)
    const todayRef = useRef<HTMLTableCellElement>(null)
    useLayoutEffect(() => {
        if (!isCurrentMonth) return
        const container = scrollRef.current
        const cell = todayRef.current
        if (!container || !cell) return
        if (container.scrollWidth <= container.clientWidth) return // fits, nothing to swipe
        const cRect = container.getBoundingClientRect()
        const tRect = cell.getBoundingClientRect()
        const delta = tRect.left - cRect.left - (container.clientWidth / 2 - tRect.width / 2)
        container.scrollLeft += delta
    }, [isCurrentMonth])

    const colSpan = totalsOn ? dayNums.length + 2 : dayNums.length + 1

    return (
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
                <h2 className="text-base font-bold tracking-tight text-neutral-950">
                    {MONTHS[month]} <span className="font-semibold text-neutral-400">{year}</span>
                </h2>
                <MonthFlags
                    month={monthKey(year, month)}
                    notes={monthNotes}
                    onEdit={onEditMonthNote}
                    onAdd={onAddMonthNote}
                />
            </div>
            <div ref={scrollRef} className="overflow-x-auto">
                <table
                    className={`w-full min-w-[64rem] table-fixed border-collapse ${dragging ? 'select-none' : ''}`}
                >
                    <thead>
                        <tr className="border-b border-neutral-200">
                            <th className="sticky left-0 z-10 w-28 bg-neutral-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Period
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const todayCol = isToday(day)
                                const key = dateKey(year, month, day)
                                const dayReminders = reminders.filter((r) => r.date === key)
                                return (
                                    <th
                                        key={day}
                                        ref={todayCol ? todayRef : undefined}
                                        className={[
                                            'group/day w-12 px-1 py-2 text-center',
                                            weekend ? 'bg-neutral-100' : '',
                                            todayCol ? 'border-r border-neutral-400' : '',
                                        ].join(' ')}
                                    >
                                        <div className="flex flex-col items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => onOpenDay(key)}
                                                className={[
                                                    'flex h-9 w-9 flex-col items-center justify-center rounded-lg transition-colors',
                                                    todayCol
                                                        ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                                                        : 'text-neutral-700 hover:bg-neutral-100',
                                                ].join(' ')}
                                            >
                                                <span className="text-sm font-semibold leading-none tabular-nums">
                                                    {day}
                                                </span>
                                                <span
                                                    className={[
                                                        'mt-0.5 text-[10px] leading-none',
                                                        todayCol
                                                            ? 'text-white/70'
                                                            : 'text-neutral-400',
                                                    ].join(' ')}
                                                >
                                                    {WEEKDAYS[weekday]}
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onReminderClick(key)}
                                                aria-label="Reminders"
                                                title={
                                                    dayReminders.length
                                                        ? dayReminders.map((r) => r.text).join('\n')
                                                        : 'Add reminder'
                                                }
                                                className={[
                                                    'inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 transition-colors hover:bg-amber-100',
                                                    dayReminders.length
                                                        ? 'text-amber-500'
                                                        : 'text-neutral-300 opacity-100 sm:opacity-0 sm:group-hover/day:opacity-100',
                                                ].join(' ')}
                                            >
                                                <i
                                                    className="fa-solid fa-bell text-[10px]"
                                                    aria-hidden="true"
                                                />
                                                {dayReminders.length > 1 && (
                                                    <span className="text-[9px] font-bold leading-none">
                                                        {dayReminders.length}
                                                    </span>
                                                )}
                                            </button>
                                            <BirthdayBadge
                                                birthdays={birthdaysByDay.get(key.slice(5)) ?? []}
                                                onOpen={() => onBirthdayClick(key)}
                                            />
                                            <HiddenCalendarDots
                                                size="sm"
                                                events={hiddenByDate.get(key) ?? []}
                                                onReveal={onRevealCalendar}
                                            />
                                        </div>
                                    </th>
                                )
                            })}
                            {totalsOn && (
                                <th className="w-16 bg-neutral-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Total
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {PERIODS.map((period) => (
                            <tr key={period.key} className="border-b border-neutral-100">
                                <th
                                    scope="row"
                                    className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle"
                                >
                                    <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                        <i
                                            className={`${period.icon} w-4 text-center text-neutral-400`}
                                            aria-hidden="true"
                                        />
                                        {period.label}
                                    </span>
                                </th>
                                {dayNums.map((day) => {
                                    const weekday = new Date(year, month, day).getDay()
                                    const weekend = weekday === 0 || weekday === 6
                                    const key = dateKey(year, month, day)
                                    const slotEvents = events.filter((e) =>
                                        eventCoversSlot(e, key, period.key)
                                    )
                                    const past = isPartPast(key, period.key, today)
                                    return (
                                        <td
                                            key={day}
                                            className={[
                                                'h-12 p-0.5 align-top',
                                                isToday(day)
                                                    ? 'border-r border-neutral-400'
                                                    : 'border-l border-neutral-100',
                                                past
                                                    ? 'bg-neutral-300/60'
                                                    : weekend
                                                      ? 'bg-neutral-100/60'
                                                      : '',
                                            ].join(' ')}
                                        >
                                            <EventStack
                                                events={slotEvents}
                                                disabled={past}
                                                onEventClick={onEventClick}
                                                onAdd={() => onOpenPart(key, period.key)}
                                                onPick={onPickEvents}
                                                onCopyEvent={onCopyEvent}
                                                onDeleteEvent={onDeleteEvent}
                                                onPaste={() => onPasteEvent(key, period.key)}
                                                canPaste={canPaste}
                                            />
                                        </td>
                                    )
                                })}
                                {totalsOn && (
                                    <td className="border-l border-neutral-200 bg-neutral-50/50" />
                                )}
                            </tr>
                        ))}

                        {/* Other row */}
                        <tr className="border-t border-neutral-200">
                            <th
                                scope="row"
                                className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i
                                        className="fa-solid fa-ellipsis w-4 text-center text-neutral-400"
                                        aria-hidden="true"
                                    />
                                    Other
                                </span>
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const key = dateKey(year, month, day)
                                const slotEvents = events.filter(
                                    (e) =>
                                        e.startPart === 'na' &&
                                        key >= e.startDate &&
                                        key <= e.endDate
                                )
                                const otherPast = key < tk
                                return (
                                    <td
                                        key={day}
                                        className={[
                                            'h-12 p-0.5 align-top',
                                            isToday(day)
                                                ? 'border-r border-neutral-400'
                                                : 'border-l border-neutral-100',
                                            weekend ? 'bg-neutral-100/60' : '',
                                        ].join(' ')}
                                    >
                                        <EventStack
                                            events={slotEvents}
                                            disabled={otherPast}
                                            onEventClick={onEventClick}
                                            onAdd={() => onOpenPart(key, 'na')}
                                            onPick={onPickEvents}
                                            onCopyEvent={onCopyEvent}
                                            onDeleteEvent={onDeleteEvent}
                                            onPaste={() => onPasteEvent(key, 'na')}
                                            canPaste={canPaste}
                                        />
                                    </td>
                                )
                            })}
                            {totalsOn && (
                                <td className="border-l border-neutral-200 bg-neutral-50/50" />
                            )}
                        </tr>

                        {/* Leave row */}
                        <tr className="border-t border-neutral-200">
                            <th
                                scope="row"
                                className="sticky left-0 z-10 bg-neutral-50 px-3 py-2 text-left align-middle"
                            >
                                <span className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
                                    <i
                                        className="fa-solid fa-umbrella-beach w-4 text-center text-neutral-400"
                                        aria-hidden="true"
                                    />
                                    Leave
                                </span>
                            </th>
                            {dayNums.map((day) => {
                                const weekday = new Date(year, month, day).getDay()
                                const weekend = weekday === 0 || weekday === 6
                                const key = dateKey(year, month, day)
                                const status =
                                    statuses.find((s) => s.startDate <= key && s.endDate >= key) ??
                                    null
                                const colors = status
                                    ? DAY_STATUS_OPTIONS.find((o) => o.value === status.status)
                                    : null
                                return (
                                    <td
                                        key={day}
                                        className={[
                                            'h-12 p-0.5 align-top',
                                            isToday(day)
                                                ? 'border-r border-neutral-400'
                                                : 'border-l border-neutral-100',
                                            weekend ? 'bg-neutral-100/60' : '',
                                        ].join(' ')}
                                    >
                                        {status && colors ? (
                                            <button
                                                type="button"
                                                onClick={() => onLeaveClick(key)}
                                                title={colors.label}
                                                className={`flex h-full w-full items-center overflow-hidden rounded-lg px-1.5 text-left transition-colors ${colors.bg} ${colors.hover} ${colors.text}`}
                                            >
                                                <span className="truncate text-[11px] font-semibold leading-tight">
                                                    {colors.label}
                                                </span>
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => onLeaveClick(key)}
                                                className="group grid h-full w-full place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-neutral-100"
                                            >
                                                <i className="fa-solid fa-plus text-[10px] opacity-100 sm:opacity-0 sm:group-hover:opacity-100" />
                                            </button>
                                        )}
                                    </td>
                                )
                            })}
                            {totalsOn && (
                                <td className="border-l border-neutral-200 bg-neutral-50/50" />
                            )}
                        </tr>

                        {/* Totals rows */}
                        {totalsOn &&
                            rows.map((row, i) => {
                                const weekly = row.granularity === 'weekly'
                                const wGroups = weekly
                                    ? weekGroupsForMonth(year, month, dayNums)
                                    : null
                                const rowTotal = weekly
                                    ? (wGroups ?? []).reduce(
                                          (sum, g) => sum + (values[`${row._id}:${g.anchor}`] ?? 0),
                                          0
                                      )
                                    : dayNums.reduce(
                                          (sum, day) =>
                                              sum +
                                              (values[`${row._id}:${dateKey(year, month, day)}`] ??
                                                  0),
                                          0
                                      )
                                return (
                                    <TotalRowCells
                                        key={row._id}
                                        row={row}
                                        rowIndex={i}
                                        first={i === 0}
                                        year={year}
                                        month={month}
                                        dayNums={dayNums}
                                        weekGroups={wGroups}
                                        values={values}
                                        rowTotal={rowTotal}
                                        sel={sel}
                                        onCellDown={onCellDown}
                                        onCellEnter={onCellEnter}
                                        onSetValue={onSetValue}
                                        onRename={onRenameRow}
                                        onDelete={onDeleteRow}
                                        onChangeGranularity={onChangeGranularity}
                                    />
                                )
                            })}

                        {/* Add-row */}
                        {totalsOn && (
                            <tr className="border-t border-neutral-100">
                                <td
                                    colSpan={colSpan}
                                    className="sticky left-0 bg-neutral-50 px-3 py-2"
                                >
                                    <AddTotalRow onAdd={onAddRow} />
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

// ─── Totals ───────────────────────────────────────────────────────────────────

function roundNum(n: number) {
    return Math.round(n * 100) / 100
}

interface TotalRowCellsProps {
    row: TotalRow
    rowIndex: number
    first: boolean
    year: number
    month: number
    dayNums: number[]
    weekGroups: { anchor: string; days: number[] }[] | null
    values: Record<string, number>
    rowTotal: number
    sel: CellSel | null
    onCellDown: (month: number, r: number, d: number) => void
    onCellEnter: (month: number, r: number, d: number) => void
    onSetValue: (rowId: string, date: string, value: number | null) => void
    onRename: (id: string, name: string) => void
    onDelete: (id: string) => void
    onChangeGranularity: (id: string, granularity: 'daily' | 'weekly') => void
}

/** Tailwind classes for a selected cell — overrides weekend/weekday backgrounds. */
const SEL_CLASS = 'bg-sky-200/70 ring-1 ring-inset ring-sky-400'

function TotalRowCells({
    row,
    rowIndex,
    first,
    year,
    month,
    dayNums,
    weekGroups,
    values,
    rowTotal,
    sel,
    onCellDown,
    onCellEnter,
    onSetValue,
    onRename,
    onDelete,
    onChangeGranularity,
}: TotalRowCellsProps) {
    // Is this row within the active selection's row span?
    const inRowRange = !!sel && rowIndex >= sel.rowStart && rowIndex <= sel.rowEnd
    // 0-based day index selected? (week cells: any of their days selected.)
    const daySelected = (dayIndex: number) =>
        inRowRange && dayIndex >= sel!.dayStart && dayIndex <= sel!.dayEnd
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(row.name)
    useEffect(() => {
        setName(row.name)
    }, [row.name])
    const tk = todayKey()
    const isToday = (day: number) => dateKey(year, month, day) === tk
    const weekly = row.granularity === 'weekly'

    function commitName() {
        setEditing(false)
        const n = name.trim()
        if (n && n !== row.name) onRename(row._id, n)
        else setName(row.name)
    }

    return (
        <tr className={first ? 'border-t border-neutral-200' : 'border-t border-neutral-100'}>
            <th
                scope="row"
                className="sticky left-0 z-10 bg-neutral-50 px-3 py-1 text-left align-middle"
            >
                {editing ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') {
                                setName(row.name)
                                setEditing(false)
                            }
                        }}
                        className="w-full rounded-md border border-neutral-200 px-2 py-1 text-sm outline-none focus:border-neutral-400"
                    />
                ) : (
                    <div className="group flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            title="Rename"
                            className="flex-1 truncate text-left text-sm font-semibold text-neutral-700 hover:text-neutral-900"
                        >
                            {row.name}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                onChangeGranularity(row._id, weekly ? 'daily' : 'weekly')
                            }
                            title={weekly ? 'Switch to daily' : 'Switch to weekly'}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold opacity-100 transition-all sm:opacity-0 sm:group-hover:opacity-100 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-600"
                        >
                            {weekly ? 'W' : 'D'}
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(row._id)}
                            aria-label="Delete row"
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-300 opacity-100 transition-all hover:bg-neutral-200 hover:text-neutral-600 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                            <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </th>
            {weekly && weekGroups
                ? weekGroups.map((g) => {
                      const containsToday = g.days.some((d) => isToday(d))
                      const weekend = g.days.every((d) => {
                          const wd = new Date(year, month, d).getDay()
                          return wd === 0 || wd === 6
                      })
                      const anchorDay = g.days[0] - 1
                      const selected = g.days.some((d) => daySelected(d - 1))
                      return (
                          <td
                              key={g.anchor}
                              colSpan={g.days.length}
                              data-totals-cell
                              onMouseDown={() => onCellDown(month, rowIndex, anchorDay)}
                              onMouseEnter={() => onCellEnter(month, rowIndex, anchorDay)}
                              className={[
                                  containsToday
                                      ? 'border-r border-neutral-400'
                                      : 'border-l border-neutral-100',
                                  'cursor-cell p-0.5 align-middle',
                                  selected
                                      ? SEL_CLASS
                                      : weekend
                                        ? 'bg-neutral-100/70'
                                        : 'bg-neutral-50',
                              ].join(' ')}
                          >
                              <TotalCell
                                  value={values[`${row._id}:${g.anchor}`]}
                                  onCommit={(v) => onSetValue(row._id, g.anchor, v)}
                              />
                          </td>
                      )
                  })
                : dayNums.map((day) => {
                      const key = dateKey(year, month, day)
                      const weekday = new Date(year, month, day).getDay()
                      const weekend = weekday === 0 || weekday === 6
                      const selected = daySelected(day - 1)
                      return (
                          <td
                              key={day}
                              data-totals-cell
                              onMouseDown={() => onCellDown(month, rowIndex, day - 1)}
                              onMouseEnter={() => onCellEnter(month, rowIndex, day - 1)}
                              className={[
                                  isToday(day)
                                      ? 'border-r border-neutral-400'
                                      : 'border-l border-neutral-100',
                                  'cursor-cell p-0.5 align-middle',
                                  selected
                                      ? SEL_CLASS
                                      : weekend
                                        ? 'bg-neutral-100/70'
                                        : 'bg-neutral-50',
                              ].join(' ')}
                          >
                              <TotalCell
                                  value={values[`${row._id}:${key}`]}
                                  onCommit={(v) => onSetValue(row._id, key, v)}
                              />
                          </td>
                      )
                  })}
            <td className="border-l border-neutral-200 bg-neutral-50/50 px-2 text-center text-xs font-bold tabular-nums text-neutral-700">
                {rowTotal ? roundNum(rowTotal) : ''}
            </td>
        </tr>
    )
}

function TotalCell({
    value,
    onCommit,
}: {
    value: number | undefined
    onCommit: (v: number | null) => void
}) {
    // Idle cells show a plain value so a single click only selects (via the
    // parent cell's handlers); double-click swaps in an editable input.
    const [editing, setEditing] = useState(false)
    const [text, setText] = useState(value === undefined ? '' : String(value))
    useEffect(() => {
        if (!editing) setText(value === undefined ? '' : String(value))
    }, [value, editing])

    function commit() {
        setEditing(false)
        const trimmed = text.trim()
        if (trimmed === '') {
            if (value !== undefined) onCommit(null)
            return
        }
        const n = Number(trimmed)
        if (Number.isNaN(n)) {
            setText(value === undefined ? '' : String(value))
            return
        }
        if (n !== value) onCommit(n)
    }

    if (!editing) {
        return (
            <div
                onDoubleClick={() => setEditing(true)}
                className="flex h-9 w-full items-center justify-center rounded-md px-1 text-center text-xs tabular-nums text-neutral-800 transition-colors hover:bg-black/[0.03]"
            >
                {value === undefined ? '' : value}
            </div>
        )
    }

    return (
        <input
            type="number"
            inputMode="decimal"
            step="any"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commit}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                    setText(value === undefined ? '' : String(value))
                    setEditing(false)
                }
            }}
            className="h-9 w-full rounded-md border border-neutral-400 bg-white px-1 text-center text-xs tabular-nums text-neutral-800 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
    )
}

function AddTotalRow({
    onAdd,
}: {
    onAdd: (name: string, granularity: 'daily' | 'weekly') => void
}) {
    const [name, setName] = useState('')
    function submit() {
        const n = name.trim()
        if (!n) return
        onAdd(n, 'daily')
        setName('')
    }
    return (
        <div className="flex items-center gap-2">
            <i className="fa-solid fa-plus text-xs text-neutral-300" aria-hidden="true" />
            <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') submit()
                }}
                placeholder="Add a log row…"
                className="w-56 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
            {name.trim() && (
                <button
                    type="button"
                    onClick={submit}
                    className="rounded-full bg-neutral-950 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                    Add
                </button>
            )}
        </div>
    )
}
