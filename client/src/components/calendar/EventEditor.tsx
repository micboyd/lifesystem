import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import DatePicker, { type DateRange } from '../DatePicker'
import Switch from '../Switch'
import TimePicker from '../TimePicker'
import { slotOrdinal } from '../../lib/calendar'
import {
    EVENT_TYPES,
    EVENT_TYPE_LABELS,
    EVENT_TYPE_COLORS,
    RECURRENCE_FREQUENCIES,
    RECURRENCE_LABELS,
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
}

const REAL_PARTS: Part[] = ['morning', 'afternoon', 'evening']

const PART_LABELS: Record<Part, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    na: 'N/A',
}

export default function EventEditor({
    open,
    event,
    defaultSlot,
    saving,
    conflict,
    onClose,
    onSave,
    onDelete,
}: EventEditorProps) {
    const [title, setTitle] = useState('')
    const [eventType, setEventType] = useState<EventType>('general')
    const [allDay, setAllDay] = useState(false)
    const [multiDay, setMultiDay] = useState(false)
    const [startDate, setStartDate] = useState('')
    const [startPart, setStartPart] = useState<Part>('morning')
    const [endDate, setEndDate] = useState('')
    const [endPart, setEndPart] = useState<Part>('morning')
    const [time, setTime] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [error, setError] = useState('')
    const [advanced, setAdvanced] = useState(false)
    const [recurring, setRecurring] = useState(false)
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly')
    const [recurrenceEndsOn, setRecurrenceEndsOn] = useState('')

    const isNa = startPart === 'na'
    const isAllDay = !isNa && startPart === 'morning' && endPart === 'evening'

    useEffect(() => {
        if (!open) return
        setTitle(event?.title ?? '')
        setEventType(event?.eventType ?? 'general')
        const ad = event?.allDay ?? false
        setAllDay(ad)
        const md = event ? event.startDate !== event.endDate : false
        setMultiDay(md)
        setStartDate(event?.startDate ?? defaultSlot?.date ?? '')
        setStartPart(event?.startPart ?? defaultSlot?.part ?? 'morning')
        setEndDate(event?.endDate ?? defaultSlot?.date ?? '')
        setEndPart(event?.endPart ?? (event?.startPart ?? defaultSlot?.part ?? 'morning'))
        setTime(event?.time ?? null)
        setNotes(event?.notes ?? '')
        setError('')
        const rec = event?.recurrence
        setRecurring(!!rec)
        setRecurrenceFrequency(rec?.frequency ?? 'weekly')
        setRecurrenceEndsOn(rec?.endsOn ?? '')
        setAdvanced(!!rec)
    }, [open, event, defaultSlot])

    /** Single-day range change — also drives the allDay flag. */
    function handleRangeChange(newStart: Part, newEnd: Part) {
        setStartPart(newStart)
        setEndPart(newEnd)
        const ad = newStart === 'morning' && newEnd === 'evening'
        setAllDay(ad)
    }

    function handleNaToggle() {
        if (isNa) {
            setStartPart('morning')
            setEndPart('morning')
            setAllDay(false)
        } else {
            setStartPart('na')
            setEndPart('na')
            setAllDay(false)
        }
    }

    function handleMultiDayChange(on: boolean) {
        setMultiDay(on)
        if (on) {
            // N/A events can be multi-day — preserve the na part
            if (startPart !== 'na') setAllDay(false)
        } else {
            setEndDate(startDate)
            setEndPart(startPart)
        }
    }

    function handleMultiDayAllDayChange(on: boolean) {
        setAllDay(on)
        if (on) {
            setStartPart('morning')
            setEndPart('evening')
        }
    }

    function handleStartDateChange(date: string) {
        setStartDate(date)
        if (!multiDay) setEndDate(date)
        else if (endDate && date > endDate) setEndDate(date)
    }

    function handleSave() {
        if (!title.trim()) { setError('Give the event a title.'); return }
        if (!startDate) { setError('Select a start date.'); return }

        const finalEnd = multiDay ? endDate || startDate : startDate
        const finalStartPart: Part = allDay ? 'morning' : startPart
        const finalEndPart: Part = allDay ? 'evening' : endPart

        if (!isNa && !allDay) {
            if (slotOrdinal(startDate, finalStartPart) > slotOrdinal(finalEnd, finalEndPart)) {
                setError("The event can't end before it starts.")
                return
            }
        }

        onSave({
            title: title.trim(),
            notes: notes.trim() || undefined,
            eventType,
            allDay,
            time: time || undefined,
            startDate,
            startPart: finalStartPart,
            endDate: finalEnd,
            endPart: finalEndPart,
            recurrence: recurring
                ? { frequency: recurrenceFrequency, endsOn: recurrenceEndsOn || undefined }
                : undefined,
        })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            side="right"
            size="lg"
            title={event ? 'Edit event' : 'New event'}
            footer={
                <>
                    {event && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="fa-solid fa-trash-can"
                            onClick={onDelete}
                            disabled={saving}
                            className="mr-auto text-red-500 hover:bg-red-50 hover:text-red-600"
                        >
                            Remove
                        </Button>
                    )}
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button size="sm" icon="fa-solid fa-check" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                {/* Title */}
                <Input
                    label="Title"
                    placeholder="What's happening?"
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setError('') }}
                    error={error || (conflict ? 'That slot is already taken — adjust the dates or parts.' : '')}
                    autoFocus
                />

                {/* Event type */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Type</label>
                    <div className="grid grid-cols-3 gap-2">
                        {EVENT_TYPES.map((t) => {
                            const c = EVENT_TYPE_COLORS[t]
                            const selected = eventType === t
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setEventType(t)}
                                    className={[
                                        'rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
                                        selected
                                            ? `${c.bg} border-transparent ${c.text}`
                                            : `border-neutral-200 ${c.text} hover:${c.light}`,
                                    ].join(' ')}
                                >
                                    {EVENT_TYPE_LABELS[t]}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* When */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">When</label>
                        <Switch checked={multiDay} onChange={handleMultiDayChange} label="Multi-day" />
                    </div>

                    {/* ── Single-day ── */}
                    {!multiDay && (
                        <>
                            <DatePicker
                                value={startDate}
                                onChange={(v) => typeof v === 'string' && v && handleStartDateChange(v)}
                            />
                            {/* Part range selector */}
                            <PartRangeSelector
                                startPart={startPart}
                                endPart={endPart}
                                isNa={isNa}
                                isAllDay={isAllDay}
                                onChange={handleRangeChange}
                                onNaToggle={handleNaToggle}
                            />
                            {/* Time — only for timed single-day events */}
                            {!isAllDay && !isNa && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Time <span className="normal-case font-normal text-neutral-300">(informational)</span>
                                    </label>
                                    <TimePicker value={time} onChange={setTime} placeholder="Optional time" />
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Multi-day ── */}
                    {multiDay && (
                        <div className="flex flex-col gap-3">
                            {/* N/A toggle — available in multi-day too */}
                            <button
                                type="button"
                                onClick={handleNaToggle}
                                className={[
                                    'w-full rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                                    isNa
                                        ? 'bg-neutral-950 border-transparent text-white'
                                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700',
                                ].join(' ')}
                            >
                                N/A — informational only
                            </button>

                            {/* All day only relevant when not N/A */}
                            {!isNa && (
                                <Switch checked={allDay} onChange={handleMultiDayAllDayChange} label="All day" />
                            )}

                            {/* Date range picker */}
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

                            {/* Start part */}
                            {!allDay && !isNa && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-neutral-400">Start part</span>
                                    <PartSegment value={startPart} onChange={setStartPart} />
                                </div>
                            )}

                            {/* End part */}
                            {!allDay && !isNa && (
                                <div className="flex flex-col gap-1.5">
                                    <span className="text-xs font-medium text-neutral-400">End part</span>
                                    <PartSegment value={endPart} onChange={setEndPart} />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Advanced */}
                <div className="rounded-xl border border-neutral-200">
                    <button
                        type="button"
                        onClick={() => setAdvanced((v) => !v)}
                        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
                    >
                        <span className="flex items-center gap-2">
                            <i className="fa-solid fa-sliders text-xs text-neutral-400" aria-hidden="true" />
                            Advanced
                        </span>
                        <i className={`fa-solid fa-chevron-down text-[10px] text-neutral-400 transition-transform duration-200 ${advanced ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>

                    {advanced && (
                        <div className="flex flex-col gap-4 border-t border-neutral-100 px-4 py-4">
                            {/* Recurring toggle */}
                            <Switch checked={recurring} onChange={setRecurring} label="Recurring" />

                            {recurring && (
                                <>
                                    {/* Frequency */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Frequency</span>
                                        <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 gap-1">
                                            {RECURRENCE_FREQUENCIES.map((f) => (
                                                <button
                                                    key={f}
                                                    type="button"
                                                    onClick={() => setRecurrenceFrequency(f)}
                                                    className={[
                                                        'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                                                        recurrenceFrequency === f
                                                            ? 'bg-neutral-950 text-white'
                                                            : 'text-neutral-500 hover:text-neutral-900',
                                                    ].join(' ')}
                                                >
                                                    {RECURRENCE_LABELS[f]}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Optional end date */}
                                    <div className="flex flex-col gap-1.5">
                                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            Ends on <span className="normal-case font-normal text-neutral-300">(optional)</span>
                                        </span>
                                        <DatePicker
                                            value={recurrenceEndsOn || null}
                                            minDate={endDate || startDate || undefined}
                                            onChange={(v) => setRecurrenceEndsOn(typeof v === 'string' && v ? v : '')}
                                            placeholder="No end date"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Notes */}
                <Textarea
                    label="Notes"
                    rows={3}
                    placeholder="Optional details"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

/** Single-day part range selector: selects a contiguous range of Morning/Afternoon/Evening.
 *  Selecting all three = All Day. N/A is a separate exclusive option. */
function PartRangeSelector({
    startPart,
    endPart,
    isNa,
    isAllDay,
    onChange,
    onNaToggle,
}: {
    startPart: Part
    endPart: Part
    isNa: boolean
    isAllDay: boolean
    onChange: (start: Part, end: Part) => void
    onNaToggle: () => void
}) {
    const startIdx = REAL_PARTS.indexOf(startPart)
    const endIdx = REAL_PARTS.indexOf(endPart)

    function inRange(part: Part) {
        if (isNa) return false
        const i = REAL_PARTS.indexOf(part)
        return i >= startIdx && i <= endIdx
    }

    function handleClick(part: Part) {
        const idx = REAL_PARTS.indexOf(part)

        if (isNa) {
            // Coming from N/A — start fresh on this part
            onChange(part, part)
            return
        }

        if (inRange(part)) {
            // Shrink the range
            if (startIdx === endIdx) return // Already single, can't shrink further
            if (idx === startIdx) {
                onChange(REAL_PARTS[startIdx + 1] as Part, endPart)
            } else if (idx === endIdx) {
                onChange(startPart, REAL_PARTS[endIdx - 1] as Part)
            }
            // Clicking the middle of a 3-part range: do nothing
        } else {
            // Extend if adjacent, otherwise reset to single
            if (idx === startIdx - 1) onChange(part, endPart)       // extend left
            else if (idx === endIdx + 1) onChange(startPart, part)   // extend right
            else onChange(part, part)                                 // reset
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {/* Range pills */}
            <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 gap-1">
                {REAL_PARTS.map((part) => {
                    const selected = inRange(part)
                    return (
                        <button
                            key={part}
                            type="button"
                            onClick={() => handleClick(part)}
                            className={[
                                'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                                selected
                                    ? 'bg-neutral-950 text-white'
                                    : 'text-neutral-500 hover:text-neutral-900',
                            ].join(' ')}
                        >
                            {selected && isAllDay && part === 'afternoon' ? 'All day' : PART_LABELS[part]}
                        </button>
                    )
                })}
            </div>

            {/* N/A option */}
            <button
                type="button"
                onClick={onNaToggle}
                className={[
                    'w-full rounded-xl border px-3 py-2 text-xs font-semibold transition-colors',
                    isNa
                        ? 'bg-neutral-950 border-transparent text-white'
                        : 'border-neutral-200 text-neutral-500 hover:border-neutral-300 hover:text-neutral-700',
                ].join(' ')}
            >
                N/A — informational only
            </button>
        </div>
    )
}

/** Simple single-part selector for multi-day start/end (no N/A, no range). */
function PartSegment({ value, onChange }: { value: Part; onChange: (p: Part) => void }) {
    return (
        <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 gap-1">
            {REAL_PARTS.map((part) => (
                <button
                    key={part}
                    type="button"
                    onClick={() => onChange(part)}
                    className={[
                        'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                        value === part
                            ? 'bg-neutral-950 text-white'
                            : 'text-neutral-500 hover:text-neutral-900',
                    ].join(' ')}
                >
                    {PART_LABELS[part]}
                </button>
            ))}
        </div>
    )
}
