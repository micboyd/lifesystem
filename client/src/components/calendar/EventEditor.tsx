import { useEffect, useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import DatePicker, { type DateRange } from '../DatePicker'
import Switch from '../Switch'
import TimePicker from '../TimePicker'
import RecurrencePicker from './RecurrencePicker'
import { slotOrdinal } from '../../lib/calendar'
import { FIELD_ERROR_TEXT } from '../fieldStyles'
import {
    EVENT_TYPE_ICON,
    PART_META,
    TypeTile,
    Section,
    ChoiceChip,
    Segmented,
    Segment,
    SettingList,
    SettingRow,
    relativeDay,
    whenLine,
} from './eventUi'
import { useCalendars } from '../../context/CalendarsContext'
import {
    EVENT_TYPES,
    EVENT_TYPE_LABELS,
    EVENT_TYPE_COLORS,
    CALENDAR_COLOR_CLASSES,
    type Event,
    type EventType,
    type Part,
    type RecurrenceFrequency,
} from '../../types'
import type { EventInput } from '../../services/events'

interface EventEditorProps {
    open: boolean
    event: Event | null
    defaultSlot: { date: string; part: Part } | null
    saving: boolean
    conflict: boolean
    onClose: () => void
    onSave: (input: EventInput) => void
    onDelete: () => void
    /**
     * Everything already loaded for the surrounding range, used to warn about
     * slots another layer occupies. Omitted where the caller has no such list.
     */
    knownEvents?: Event[]
    /** Turn a hidden layer back on from the warning notice. */
    onRevealCalendar?: (calendarId: string) => void
}

const REAL_PARTS: Exclude<Part, 'na'>[] = ['morning', 'afternoon', 'evening']

// ── Range-selectable part bar (single-day) ────────────────────────────────────
//
// Click an unselected segment → selects it (start = end = that part)
// Click outside the current selection → extends the range to include it
// Click the start or end of a multi-segment range → shrinks by one
// Click the only selected segment → deselects everything (→ "Anytime")
// Click the middle of a 3-segment range → resets to just that part

function TimeOfDayPicker({
    startPart,
    endPart,
    onChange,
}: {
    startPart: Part
    endPart: Part
    onChange: (start: Part, end: Part) => void
}) {
    const isNa = startPart === 'na'
    const startIdx = isNa ? -1 : REAL_PARTS.indexOf(startPart as Exclude<Part, 'na'>)
    const endIdx = isNa ? -1 : REAL_PARTS.indexOf(endPart as Exclude<Part, 'na'>)

    function handleSegClick(part: Exclude<Part, 'na'>) {
        const i = REAL_PARTS.indexOf(part)
        if (isNa) onChange(part, part)
        else if (i < startIdx) onChange(part, endPart)
        else if (i > endIdx) onChange(startPart, part)
        else if (startIdx === endIdx) onChange('na', 'na')
        else if (i === startIdx) onChange(REAL_PARTS[startIdx + 1], endPart)
        else if (i === endIdx) onChange(startPart, REAL_PARTS[endIdx - 1])
        else onChange(part, part)
    }

    return (
        <Segmented>
            {REAL_PARTS.map((part, i) => (
                <Segment
                    key={part}
                    on={!isNa && i >= startIdx && i <= endIdx}
                    onClick={() => handleSegClick(part)}
                    icon={PART_META[part].icon}
                >
                    {PART_META[part].label}
                </Segment>
            ))}
        </Segmented>
    )
}

/** One part of the day, for a multi-day event's first or last day. */
function PartSegment({ value, onChange }: { value: Part; onChange: (p: Part) => void }) {
    return (
        <Segmented>
            {REAL_PARTS.map((part) => (
                <Segment key={part} on={value === part} onClick={() => onChange(part)}>
                    {PART_META[part].label}
                </Segment>
            ))}
        </Segmented>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EventEditor({
    open,
    event,
    defaultSlot,
    saving,
    conflict,
    onClose,
    onSave,
    onDelete,
    knownEvents = [],
    onRevealCalendar,
}: EventEditorProps) {
    const { calendars, byId, defaultCalendar } = useCalendars()
    const [calendarId, setCalendarId] = useState('')
    const [title, setTitle] = useState('')
    const [location, setLocation] = useState('')
    const [eventType, setEventType] = useState<EventType>('general')
    const [multiDay, setMultiDay] = useState(false)
    const [startDate, setStartDate] = useState('')
    const [startPart, setStartPart] = useState<Part>('morning')
    const [endDate, setEndDate] = useState('')
    const [endPart, setEndPart] = useState<Part>('morning')
    const [time, setTime] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [ignoreClash, setIgnoreClash] = useState(false)
    const [error, setError] = useState('')
    const [recurring, setRecurring] = useState(false)
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly')
    const [recurrenceEndsOn, setRecurrenceEndsOn] = useState('')

    // Derived — no separate allDay state needed
    const isNa = startPart === 'na'
    const isAllDay = !isNa && startPart === 'morning' && endPart === 'evening'

    useEffect(() => {
        if (!open) return
        setCalendarId(event?.calendar ?? '')
        setTitle(event?.title ?? '')
        setLocation(event?.location ?? '')
        setEventType(event?.eventType ?? 'general')
        const md = event ? event.startDate !== event.endDate : false
        setMultiDay(md)
        setStartDate(event?.startDate ?? defaultSlot?.date ?? '')
        setStartPart(event?.startPart ?? defaultSlot?.part ?? 'morning')
        setEndDate(event?.endDate ?? defaultSlot?.date ?? '')
        setEndPart(event?.endPart ?? event?.startPart ?? defaultSlot?.part ?? 'morning')
        setTime(event?.time ?? null)
        setNotes(event?.notes ?? '')
        setIgnoreClash(event?.ignoreClash ?? false)
        setError('')
        const rec = event?.recurrence
        setRecurring(!!rec)
        setRecurrenceFrequency(rec?.frequency ?? 'weekly')
        setRecurrenceEndsOn(rec?.endsOn ?? '')
    }, [open, event, defaultSlot])

    // Calendars load asynchronously, so a new event may open before the default
    // is known. Deriving the fallback (rather than storing it once it arrives)
    // means a late-loading list can't reset a form the user is already filling in.
    const activeCalendarId = calendarId || defaultCalendar?._id || ''

    /**
     * Events on *other* layers that already occupy the slot being edited.
     *
     * These are not errors — separate calendars are allowed to overlap, and the
     * server only rejects a clash within one calendar. This is the one moment
     * where an overlap is worth mentioning: you're claiming the slot right now,
     * and the thing you'd collide with may be hidden from the grid.
     */
    const overlaps = useMemo(() => {
        if (!open || isNa || !startDate) return []
        const finalEnd = multiDay ? endDate || startDate : startDate
        // Same span comparison the server runs, just across calendars instead
        // of within one.
        const startOrd = slotOrdinal(startDate, startPart)
        const endOrd = slotOrdinal(finalEnd, endPart)
        if (startOrd > endOrd) return []

        return knownEvents.filter((other) => {
            if (other._id === event?._id) return false
            if (!other.calendar || other.calendar === activeCalendarId) return false
            if (other.startPart === 'na') return false
            return (
                slotOrdinal(other.startDate, other.startPart) <= endOrd &&
                startOrd <= slotOrdinal(other.endDate, other.endPart)
            )
        })
    }, [
        open,
        isNa,
        multiDay,
        startDate,
        endDate,
        startPart,
        endPart,
        activeCalendarId,
        knownEvents,
        event?._id,
    ])

    function handleTimeOfDayChange(newStart: Part, newEnd: Part) {
        setStartPart(newStart)
        setEndPart(newEnd)
    }

    function handleMultiDayChange(on: boolean) {
        setMultiDay(on)
        if (!on) {
            setEndDate(startDate)
            setEndPart(startPart)
        }
    }

    function handleStartDateChange(date: string) {
        setStartDate(date)
        if (!multiDay) setEndDate(date)
        else if (endDate && date > endDate) setEndDate(date)
    }

    function handleSave() {
        if (!title.trim()) {
            setError('Give the event a title.')
            return
        }
        if (!startDate) {
            setError('Select a start date.')
            return
        }

        const finalEnd = multiDay ? endDate || startDate : startDate
        const finalStartPart = startPart
        const finalEndPart = endPart

        if (!isNa) {
            if (slotOrdinal(startDate, finalStartPart) > slotOrdinal(finalEnd, finalEndPart)) {
                setError("The event can't end before it starts.")
                return
            }
        }

        onSave({
            calendar: activeCalendarId || undefined,
            title: title.trim(),
            notes: notes.trim() || undefined,
            location: location.trim() || undefined,
            eventType,
            allDay: isAllDay,
            time: time || undefined,
            startDate,
            startPart: finalStartPart,
            endDate: finalEnd,
            endPart: finalEndPart,
            ignoreClash,
            recurrence: recurring
                ? { frequency: recurrenceFrequency, endsOn: recurrenceEndsOn || undefined }
                : undefined,
        })
    }

    const finalEnd = multiDay ? endDate || startDate : startDate
    const summary = startDate
        ? whenLine({
              startDate,
              endDate: finalEnd,
              startPart,
              endPart,
              time: !multiDay && !isAllDay && !isNa ? (time ?? undefined) : undefined,
          })
        : 'Pick a date'
    const titleError =
        error ||
        (conflict
            ? 'This calendar already has an event in that slot — adjust the dates, the parts, or the calendar.'
            : '')

    function toggleAllDay() {
        setStartPart('morning')
        setEndPart(isAllDay ? 'morning' : 'evening')
    }

    function toggleAnytime() {
        setStartPart(isNa ? 'morning' : 'na')
        setEndPart(isNa ? 'morning' : 'na')
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            side="right"
            size="xl"
            title={event ? 'Edit event' : 'New event'}
            badge={startDate ? relativeDay(startDate) : undefined}
            footer={
                <>
                    {event && (
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={onDelete}
                            disabled={saving}
                            className="mr-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                            Delete
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : event ? 'Save' : 'Add event'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-7">
                {/* What — the type's tile, the title, and a live summary of when. */}
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3.5">
                        <TypeTile type={eventType} size="lg" />
                        <div className="min-w-0 flex-1">
                            <input
                                value={title}
                                onChange={(e) => {
                                    setTitle(e.target.value)
                                    setError('')
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSave()
                                }}
                                placeholder="What's happening?"
                                aria-label="Title"
                                autoFocus
                                className={`w-full border-b bg-transparent pb-1 text-[22px] font-semibold tracking-[-0.02em] text-neutral-950 outline-none transition-colors placeholder:font-medium placeholder:text-neutral-400 focus-visible:outline-none ${
                                    titleError ? 'border-red-600' : 'border-neutral-200 focus:border-neutral-900'
                                }`}
                            />
                            <p className="mt-1.5 truncate text-[13px] text-neutral-500">{summary}</p>
                        </div>
                    </div>
                    {titleError && (
                        <p className={FIELD_ERROR_TEXT}>
                            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                            {titleError}
                        </p>
                    )}
                </div>

                <Section title="Type">
                    <div className="flex flex-wrap gap-2">
                        {EVENT_TYPES.map((t) => {
                            const c = EVENT_TYPE_COLORS[t]
                            return (
                                <ChoiceChip
                                    key={t}
                                    on={eventType === t}
                                    onClick={() => setEventType(t)}
                                    icon={EVENT_TYPE_ICON[t]}
                                    tone={`${c.light} ${c.text}`}
                                >
                                    {EVENT_TYPE_LABELS[t]}
                                </ChoiceChip>
                            )
                        })}
                    </div>
                </Section>

                {/* Calendar (layer) — only worth showing once there's a choice. */}
                {calendars.length > 1 && (
                    <Section title="Calendar">
                        <div className="flex flex-wrap gap-2">
                            {calendars.map((c) => {
                                const cls = CALENDAR_COLOR_CLASSES[c.color]
                                return (
                                    <ChoiceChip
                                        key={c._id}
                                        on={activeCalendarId === c._id}
                                        onClick={() => setCalendarId(c._id)}
                                        dot={cls.dot}
                                        tone={`${cls.bg} ${cls.text}`}
                                    >
                                        {c.name}
                                    </ChoiceChip>
                                )
                            })}
                        </div>
                    </Section>
                )}

                <Section
                    title="When"
                    aside={<Switch checked={multiDay} onChange={handleMultiDayChange} label="Multi-day" />}
                >
                    {!multiDay ? (
                        <DatePicker
                            value={startDate}
                            onChange={(v) => typeof v === 'string' && v && handleStartDateChange(v)}
                        />
                    ) : (
                        <DatePicker
                            mode="range"
                            value={startDate && endDate ? { start: startDate, end: endDate } : null}
                            onChange={(v) => {
                                if (v && typeof v === 'object' && 'start' in v) {
                                    const r = v as DateRange
                                    if (r.start) handleStartDateChange(r.start)
                                    if (r.end) setEndDate(r.end)
                                }
                            }}
                        />
                    )}

                    {!multiDay ? (
                        <TimeOfDayPicker startPart={startPart} endPart={endPart} onChange={handleTimeOfDayChange} />
                    ) : (
                        !isAllDay &&
                        !isNa && (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <span className="w-12 shrink-0 text-[13px] text-neutral-500">Starts</span>
                                    <div className="flex-1">
                                        <PartSegment value={startPart} onChange={setStartPart} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="w-12 shrink-0 text-[13px] text-neutral-500">Ends</span>
                                    <div className="flex-1">
                                        <PartSegment value={endPart} onChange={setEndPart} />
                                    </div>
                                </div>
                            </div>
                        )
                    )}

                    <div className="flex flex-wrap gap-2">
                        <ChoiceChip on={isAllDay} onClick={toggleAllDay} icon="fa-solid fa-sun">
                            All day
                        </ChoiceChip>
                        <ChoiceChip on={isNa} onClick={toggleAnytime} icon="fa-regular fa-clock">
                            Anytime
                        </ChoiceChip>
                    </div>

                    {/* Optional time — single-day, not all-day, not anytime */}
                    {!multiDay && !isAllDay && !isNa && (
                        <TimePicker value={time} onChange={setTime} placeholder="Add a time (optional)" />
                    )}

                    {/* Cross-calendar overlap — information, not a blocker. */}
                    {overlaps.length > 0 && (
                        <div className="flex flex-col gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
                            <p className="flex items-center gap-1.5 text-[13px] font-medium text-neutral-700">
                                <i className="fa-solid fa-layer-group text-[11px] text-neutral-500" aria-hidden="true" />
                                Also in this slot
                            </p>
                            {overlaps.map((other) => {
                                const cal = other.calendar ? byId.get(other.calendar) : undefined
                                return (
                                    <div key={other._id} className="flex items-center gap-2 text-sm text-neutral-600">
                                        {cal && (
                                            <span
                                                className={`h-2 w-2 shrink-0 rounded-full ${CALENDAR_COLOR_CLASSES[cal.color].dot}`}
                                            />
                                        )}
                                        <span className="min-w-0 truncate">
                                            {cal ? `${cal.name} · ` : ''}
                                            {other.title}
                                        </span>
                                        {cal && !cal.visible && onRevealCalendar && (
                                            <button
                                                type="button"
                                                onClick={() => onRevealCalendar(cal._id)}
                                                className="ml-auto shrink-0 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                                            >
                                                Show
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Section>

                <Section title="Details">
                    <Input
                        label="Location"
                        placeholder="Optional"
                        icon="fa-solid fa-location-dot"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                    />
                    <Textarea
                        label="Notes"
                        rows={3}
                        placeholder="Optional details"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </Section>

                <Section title="Options">
                    <SettingList>
                        <SettingRow
                            icon="fa-solid fa-repeat"
                            label="Repeats"
                            hint={recurring ? undefined : 'Daily, weekly, monthly…'}
                            control={<Switch checked={recurring} onChange={setRecurring} />}
                        >
                            {recurring && (
                                <RecurrencePicker
                                    bare
                                    enabled={recurring}
                                    onEnabledChange={setRecurring}
                                    frequency={recurrenceFrequency}
                                    onFrequencyChange={setRecurrenceFrequency}
                                    endsOn={recurrenceEndsOn}
                                    onEndsOnChange={setRecurrenceEndsOn}
                                    minEndDate={endDate || startDate || undefined}
                                />
                            )}
                        </SettingRow>
                        <SettingRow
                            icon="fa-solid fa-dumbbell"
                            label="Ignore planner clashes"
                            hint="Won’t flag against gym sessions in the same slot."
                            control={<Switch checked={ignoreClash} onChange={setIgnoreClash} />}
                        />
                    </SettingList>
                </Section>
            </div>
        </Drawer>
    )
}
