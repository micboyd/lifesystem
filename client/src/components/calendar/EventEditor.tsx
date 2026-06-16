import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Select from '../Select'
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
    type FinanceRow,
    type FinanceGroup,
    type FinanceEntry,
} from '../../types'
import type { EventInput } from '../../services/events'
import { listRows as listFinanceRows, listGroups, listEntries } from '../../services/finances'

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

// ── Days-until helper ─────────────────────────────────────────────────────────

function daysUntilLabel(dateStr: string): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = dateStr.split('-').map(Number)
    const target = new Date(y, m - 1, d)
    const diff = Math.round((target.getTime() - today.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    if (diff > 0) return `In ${diff} days`
    return `${Math.abs(diff)} days ago`
}

const REAL_PARTS: Part[] = ['morning', 'afternoon', 'evening']
const PART_LABELS: Record<string, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
}

// ── Range-selectable part bar (single-day) ────────────────────────────────────
//
// Click an unselected segment → selects it (start = end = that part)
// Click outside the current selection → extends the range to include it
// Click the start or end of a multi-segment range → shrinks by one
// Click the only selected segment → deselects everything (→ "No fixed time")
// Click the middle of a 3-segment range → resets to just that part
// "All day" chip → selects all three (shortcut)
// "No fixed time" chip → clears selection

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
    const isAllDay = !isNa && startPart === 'morning' && endPart === 'evening'

    const startIdx = isNa ? -1 : REAL_PARTS.indexOf(startPart)
    const endIdx = isNa ? -1 : REAL_PARTS.indexOf(endPart)

    const isSegSelected = (p: Part) => {
        if (isNa) return false
        const i = REAL_PARTS.indexOf(p)
        return i >= startIdx && i <= endIdx
    }

    function handleSegClick(part: Part) {
        const i = REAL_PARTS.indexOf(part)

        if (isNa) {
            onChange(part, part)
            return
        }
        if (i < startIdx) {
            // Expand start backward
            onChange(part, endPart)
        } else if (i > endIdx) {
            // Expand end forward
            onChange(startPart, part)
        } else if (startIdx === endIdx) {
            // Only one selected — deselect → no fixed time
            onChange('na', 'na')
        } else if (i === startIdx) {
            // Shrink from start
            onChange(REAL_PARTS[startIdx + 1], endPart)
        } else if (i === endIdx) {
            // Shrink from end
            onChange(startPart, REAL_PARTS[endIdx - 1])
        } else {
            // Middle of 3-segment range — reset to single
            onChange(part, part)
        }
    }

    const chipCls = (active: boolean) =>
        [
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            active
                ? 'bg-neutral-950 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900',
        ].join(' ')

    return (
        <div className="flex flex-col gap-2">
            {/* Segment range bar */}
            <div className="flex overflow-hidden rounded-xl border border-neutral-200">
                {REAL_PARTS.map((part, i) => {
                    const sel = isSegSelected(part)
                    const prevSel = i > 0 && isSegSelected(REAL_PARTS[i - 1])
                    return (
                        <button
                            key={part}
                            type="button"
                            onClick={() => handleSegClick(part)}
                            className={[
                                'flex-1 py-2.5 text-xs font-semibold transition-colors',
                                i > 0
                                    ? `border-l ${sel && prevSel ? 'border-neutral-700' : 'border-neutral-200'}`
                                    : '',
                                sel
                                    ? 'bg-neutral-950 text-white'
                                    : 'text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            {PART_LABELS[part]}
                        </button>
                    )
                })}
            </div>

            {/* Special-mode chips */}
            <div className="flex gap-1.5">
                <button
                    type="button"
                    onClick={() =>
                        onChange(isAllDay ? 'morning' : 'morning', isAllDay ? 'morning' : 'evening')
                    }
                    className={chipCls(isAllDay)}
                >
                    All day
                </button>
                <button
                    type="button"
                    onClick={() => onChange(isNa ? 'morning' : 'na', isNa ? 'morning' : 'na')}
                    className={chipCls(isNa)}
                >
                    No fixed time
                </button>
            </div>
        </div>
    )
}

// ── Part segment (multi-day start/end) ────────────────────────────────────────

function PartSegment({ value, onChange }: { value: Part; onChange: (p: Part) => void }) {
    return (
        <div className="flex flex-1 gap-1.5">
            {REAL_PARTS.map((part) => (
                <button
                    key={part}
                    type="button"
                    onClick={() => onChange(part)}
                    className={[
                        'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        value === part
                            ? 'bg-neutral-950 text-white'
                            : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900',
                    ].join(' ')}
                >
                    {PART_LABELS[part]}
                </button>
            ))}
        </div>
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
}: EventEditorProps) {
    const [title, setTitle] = useState('')
    const [location, setLocation] = useState('')
    const [eventType, setEventType] = useState<EventType>('general')
    const [multiDay, setMultiDay] = useState(false)
    const [startDate, setStartDate] = useState('')
    const [startPart, setStartPart] = useState<Part>('morning')
    const [endDate, setEndDate] = useState('')
    const [endPart, setEndPart] = useState<Part>('morning')
    const [time, setTime] = useState<string | null>(null)
    const [budgetMode, setBudgetMode] = useState<'manual' | 'linked'>('manual')
    const [budget, setBudget] = useState('')
    const [budgetRow, setBudgetRow] = useState('')
    const [financeRows, setFinanceRows] = useState<FinanceRow[]>([])
    const [financeGroups, setFinanceGroups] = useState<FinanceGroup[]>([])
    const [linkedEntries, setLinkedEntries] = useState<FinanceEntry[]>([])
    const [notes, setNotes] = useState('')
    const [error, setError] = useState('')
    const [recurring, setRecurring] = useState(false)
    const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>('weekly')
    const [recurrenceEndsOn, setRecurrenceEndsOn] = useState('')

    // Derived — no separate allDay state needed
    const isNa = startPart === 'na'
    const isAllDay = !isNa && startPart === 'morning' && endPart === 'evening'

    useEffect(() => {
        if (!open) return
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
        setBudgetMode(event?.budgetRow ? 'linked' : 'manual')
        // When linked, event.budget is the resolved finance amount, not a manual entry.
        setBudget(!event?.budgetRow && event?.budget != null ? String(event.budget) : '')
        setBudgetRow(event?.budgetRow ?? '')
        setNotes(event?.notes ?? '')
        setError('')
        const rec = event?.recurrence
        setRecurring(!!rec)
        setRecurrenceFrequency(rec?.frequency ?? 'weekly')
        setRecurrenceEndsOn(rec?.endsOn ?? '')
    }, [open, event, defaultSlot])

    // Finance rows + groups for the "link to finances" picker.
    useEffect(() => {
        if (!open) return
        Promise.all([listFinanceRows(), listGroups()])
            .then(([rows, groups]) => {
                setFinanceRows(rows)
                setFinanceGroups(groups)
            })
            .catch(() => {
                setFinanceRows([])
                setFinanceGroups([])
            })
    }, [open])

    // Month-scoped entry overrides, used to preview the linked row's amount.
    const startMonth = startDate ? startDate.slice(0, 7) : ''
    useEffect(() => {
        if (!open || budgetMode !== 'linked' || !startMonth) {
            setLinkedEntries([])
            return
        }
        listEntries(startMonth)
            .then(setLinkedEntries)
            .catch(() => setLinkedEntries([]))
    }, [open, budgetMode, startMonth])

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

        let budgetValue: number | undefined
        let budgetRowValue: string | undefined
        if (budgetMode === 'linked') {
            budgetRowValue = budgetRow || undefined
        } else {
            const trimmedBudget = budget.trim()
            if (trimmedBudget) {
                const n = Number(trimmedBudget)
                if (Number.isNaN(n) || n < 0) {
                    setError('Budget must be a positive amount.')
                    return
                }
                budgetValue = n
            }
        }

        onSave({
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
            recurrence: recurring
                ? { frequency: recurrenceFrequency, endsOn: recurrenceEndsOn || undefined }
                : undefined,
            budget: budgetValue,
            budgetRow: budgetRowValue,
        })
    }

    const chipBtn = (active: boolean) =>
        [
            'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
            active
                ? 'bg-neutral-950 text-white'
                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900',
        ].join(' ')

    // ── Linked-budget derived values ──
    const groupName = (id: string) => financeGroups.find((g) => g._id === id)?.name ?? ''

    // Rows relevant to the event's month: recurring rows + non-recurring rows scoped to this month.
    const availableRows = financeRows.filter((r) => {
        if (r.recurring === false) {
            const rowMonth = r.month ?? r.createdAt.substring(0, 7)
            return rowMonth === startMonth
        }
        return true
    })
    const selectedRow = financeRows.find((r) => r._id === budgetRow) ?? null
    // Keep an out-of-month selection visible so an existing link isn't silently dropped.
    const rowOptions = (
        selectedRow && !availableRows.some((r) => r._id === selectedRow._id)
            ? [selectedRow, ...availableRows]
            : availableRows
    ).map((r) => ({ value: r._id, label: `${groupName(r.group)} · ${r.name}` }))

    const resolvedAmount = selectedRow
        ? (linkedEntries.find((e) => e.row === selectedRow._id)?.amount ??
          selectedRow.recurringAmount ??
          0)
        : undefined

    const fmtMoney = (n: number) =>
        n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    return (
        <Drawer
            open={open}
            onClose={onClose}
            side="right"
            size="lg"
            title={event ? 'Edit event' : 'New event'}
            badge={startDate ? daysUntilLabel(startDate) : undefined}
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
                    <Button
                        size="sm"
                        icon="fa-solid fa-check"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                {/* Title */}
                <Input
                    label="Title"
                    placeholder="What's happening?"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value)
                        setError('')
                    }}
                    error={
                        error ||
                        (conflict ? 'That slot is already taken — adjust the dates or parts.' : '')
                    }
                    autoFocus
                />

                {/* Location */}
                <Input
                    label="Location"
                    placeholder="Optional"
                    icon="fa-solid fa-location-dot"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                />

                {/* Type */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Type
                    </label>
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

                {/* Date */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Date
                        </label>
                        <Switch
                            checked={multiDay}
                            onChange={handleMultiDayChange}
                            label="Multi-day"
                        />
                    </div>
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
                </div>

                {/* When in the day */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        When
                    </label>

                    {!multiDay ? (
                        /* Single-day: range-selectable segment bar + special chips */
                        <TimeOfDayPicker
                            startPart={startPart}
                            endPart={endPart}
                            onChange={handleTimeOfDayChange}
                        />
                    ) : (
                        /* Multi-day: all-day / no-fixed-time toggles + optional start/end parts */
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartPart(isAllDay ? 'morning' : 'morning')
                                        setEndPart(isAllDay ? 'morning' : 'evening')
                                    }}
                                    className={chipBtn(isAllDay)}
                                >
                                    All day
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setStartPart(isNa ? 'morning' : 'na')
                                        setEndPart(isNa ? 'morning' : 'na')
                                    }}
                                    className={chipBtn(isNa)}
                                >
                                    No fixed time
                                </button>
                            </div>
                            {!isAllDay && !isNa && (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <span className="w-10 shrink-0 text-xs font-medium text-neutral-400">
                                            Starts
                                        </span>
                                        <PartSegment value={startPart} onChange={setStartPart} />
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="w-10 shrink-0 text-xs font-medium text-neutral-400">
                                            Ends
                                        </span>
                                        <PartSegment value={endPart} onChange={setEndPart} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Optional time — single-day, not all-day, not na */}
                {!multiDay && !isAllDay && !isNa && (
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Time{' '}
                            <span className="normal-case font-normal text-neutral-300">
                                (optional)
                            </span>
                        </label>
                        <TimePicker value={time} onChange={setTime} placeholder="Add a time" />
                    </div>
                )}

                {/* Repeats */}
                <div className="flex flex-col gap-3">
                    <Switch checked={recurring} onChange={setRecurring} label="Repeats" />
                    {recurring && (
                        <>
                            <div className="grid grid-cols-3 gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
                                {RECURRENCE_FREQUENCIES.map((f) => (
                                    <button
                                        key={f}
                                        type="button"
                                        onClick={() => setRecurrenceFrequency(f)}
                                        className={[
                                            'rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                                            recurrenceFrequency === f
                                                ? 'bg-neutral-950 text-white'
                                                : 'text-neutral-500 hover:text-neutral-900',
                                        ].join(' ')}
                                    >
                                        {RECURRENCE_LABELS[f]}
                                    </button>
                                ))}
                            </div>
                            {recurrenceFrequency === 'lastWeekday' && (
                                <p className="flex items-center gap-1.5 text-xs text-neutral-400">
                                    <i
                                        className="fa-solid fa-circle-info text-[10px]"
                                        aria-hidden="true"
                                    />
                                    Repeats on the last working day (Mon–Fri) of each month.
                                </p>
                            )}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Ends on{' '}
                                    <span className="normal-case font-normal text-neutral-300">
                                        (optional)
                                    </span>
                                </span>
                                <DatePicker
                                    value={recurrenceEndsOn || null}
                                    minDate={endDate || startDate || undefined}
                                    onChange={(v) =>
                                        setRecurrenceEndsOn(typeof v === 'string' && v ? v : '')
                                    }
                                    placeholder="No end date"
                                />
                            </div>
                        </>
                    )}
                </div>

                {/* Budget */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Budget
                    </label>
                    <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1 gap-1">
                        {(['manual', 'linked'] as const).map((m) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => {
                                    setBudgetMode(m)
                                    setError('')
                                }}
                                className={[
                                    'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors',
                                    budgetMode === m
                                        ? 'bg-neutral-950 text-white'
                                        : 'text-neutral-500 hover:text-neutral-900',
                                ].join(' ')}
                            >
                                {m === 'manual' ? 'Manual amount' : 'From finances'}
                            </button>
                        ))}
                    </div>

                    {budgetMode === 'manual' ? (
                        <Input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0"
                            placeholder="Optional"
                            icon="fa-solid fa-sterling-sign"
                            value={budget}
                            onChange={(e) => {
                                setBudget(e.target.value)
                                setError('')
                            }}
                            hint="How much you expect to spend on this event."
                        />
                    ) : rowOptions.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-2.5 text-xs text-neutral-400">
                            No finance rows for {startMonth || 'this month'}. Add one on the
                            Finances page first.
                        </p>
                    ) : (
                        <>
                            <Select
                                icon="fa-solid fa-link"
                                placeholder="Choose a finance row"
                                options={rowOptions}
                                value={budgetRow}
                                onChange={(v) => {
                                    setBudgetRow(v)
                                    setError('')
                                }}
                            />
                            {selectedRow && (
                                <p className="flex items-center gap-1.5 text-xs text-neutral-500">
                                    <i
                                        className="fa-solid fa-sterling-sign text-[10px] text-neutral-400"
                                        aria-hidden="true"
                                    />
                                    Pulls{' '}
                                    <span className="font-semibold text-neutral-700">
                                        £{fmtMoney(resolvedAmount ?? 0)}
                                    </span>{' '}
                                    from{' '}
                                    <span className="font-semibold text-neutral-700">
                                        {selectedRow.name}
                                    </span>{' '}
                                    for {startMonth}.
                                </p>
                            )}
                        </>
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
