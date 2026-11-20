import { useEffect, useRef, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import {
    CALENDAR_COLORS,
    CALENDAR_COLOR_CLASSES,
    EVENT_TYPES,
    EVENT_TYPE_DOTS,
    EVENT_TYPE_LABELS,
} from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { useCalendarFilters } from '../useCalendarFilters'
import {
    CALENDAR_ROWS,
    CALENDAR_ROW_LABELS,
    showAllCalendarFilters,
    toggleEventType,
    toggleRow,
} from '../../lib/calendarFilters'
import { createCalendar, deleteCalendar, updateCalendar } from '../../services/calendars'
import type { Calendar, CalendarColor, EventType } from '../../types'

/**
 * The calendar toolbar's "Filters" dropdown.
 *
 * Two kinds of switch live behind one button, because from the toolbar they do
 * the same job — decide what the grid draws:
 *
 *  - event categories (trip, social, …) and the standalone Other/Leave rows are
 *    a *view*, so they're per-device and remembered locally, and hidden ones
 *    simply don't render, and
 *  - calendars are layers that belong to the calendar itself, so their
 *    visibility is server-side and the grid looks the same on every device;
 *    a hidden layer still leaves a presence dot on the days it touches.
 *
 * A count on the trigger keeps an active filter from being forgotten — an empty
 * week that's really a filtered one is the failure mode worth designing out.
 */
export default function CalendarFilterBar({ onChanged }: { onChanged: () => void }) {
    const { calendars, setVisible, reload } = useCalendars()
    const { types: hiddenTypes, rows: hiddenRows } = useCalendarFilters()
    const [open, setOpen] = useState(false)
    const [managing, setManaging] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const hiddenCalendars = calendars.filter((c) => !c.visible).length
    const activeFilters = hiddenTypes.size + hiddenRows.size + hiddenCalendars

    useEffect(() => {
        if (!open) return
        function onPointerDown(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKey)
        }
    }, [open])

    function resetAll() {
        showAllCalendarFilters()
        for (const calendar of calendars) {
            if (!calendar.visible) void setVisible(calendar._id, true)
        }
    }

    return (
        <>
            <div ref={containerRef} className="relative inline-block">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-haspopup="true"
                    aria-expanded={open}
                    className={[
                        'inline-flex h-11 lg:h-10 shrink-0 items-center gap-2.5 whitespace-nowrap border px-3.5 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors',
                        open || activeFilters
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900',
                    ].join(' ')}
                >
                    Filters
                    {activeFilters > 0 && (
                        <span className="grid h-[18px] min-w-[18px] place-items-center bg-white px-1 text-[11px] tracking-normal text-neutral-900">
                            {activeFilters}
                        </span>
                    )}
                    <i className={`fa-solid ${open ? 'fa-chevron-up' : 'fa-chevron-down'} text-[10px]`} aria-hidden="true" />
                </button>

                {open && (
                    <div
                        role="dialog"
                        aria-label="Calendar filters"
                        className="absolute right-0 z-50 mt-2 w-[280px] max-w-[calc(100vw-1rem)] border border-neutral-900 bg-white"
                    >
                        <SectionLabel>Event types</SectionLabel>
                        {EVENT_TYPES.map((type) => (
                            <FilterRow
                                key={type}
                                label={EVENT_TYPE_LABELS[type]}
                                swatch={EVENT_TYPE_DOTS[type]}
                                checked={!hiddenTypes.has(type)}
                                onToggle={() => toggleEventType(type as EventType)}
                            />
                        ))}

                        <div className="h-px bg-hairline" />
                        <SectionLabel>Rows</SectionLabel>
                        {CALENDAR_ROWS.map((row) => (
                            <FilterRow
                                key={row}
                                label={CALENDAR_ROW_LABELS[row]}
                                swatch={row === 'leave' ? 'bg-[#8fa79a]' : 'border border-neutral-400 bg-white'}
                                checked={!hiddenRows.has(row)}
                                onToggle={() => toggleRow(row)}
                            />
                        ))}

                        {calendars.length > 0 && (
                            <>
                                <div className="h-px bg-hairline" />
                                <SectionLabel>Calendars</SectionLabel>
                                {calendars.map((calendar) => (
                                    <FilterRow
                                        key={calendar._id}
                                        label={calendar.name}
                                        swatch={CALENDAR_COLOR_CLASSES[calendar.color].dot}
                                        checked={calendar.visible}
                                        onToggle={() =>
                                            void setVisible(calendar._id, !calendar.visible)
                                        }
                                    />
                                ))}
                            </>
                        )}

                        <div className="h-px bg-hairline" />
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setManaging(true)
                                    setOpen(false)
                                }}
                                className="text-[13px] text-neutral-600 underline underline-offset-4 hover:text-neutral-900"
                            >
                                Manage calendars
                            </button>
                            <button
                                type="button"
                                disabled={activeFilters === 0}
                                onClick={resetAll}
                                className="h-9 border border-neutral-900 px-3 text-[11px] font-medium uppercase tracking-[0.12em] hover:bg-neutral-100 disabled:opacity-40"
                            >
                                Show all
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <Drawer
                open={managing}
                onClose={() => {
                    setManaging(false)
                    onChanged()
                }}
                title="Calendars"
                side="right"
            >
                <ManagePanel calendars={calendars} onChanged={reload} />
            </Drawer>
        </>
    )
}

function SectionLabel({ children }: { children: string }) {
    return (
        <p className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">
            {children}
        </p>
    )
}

/** One toggle line: swatch, label, and a tick that only shows when included. */
function FilterRow({
    label,
    swatch,
    checked,
    onToggle,
}: {
    label: string
    swatch: string
    checked: boolean
    onToggle: () => void
}) {
    return (
        <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={checked}
            onClick={onToggle}
            className={`grid min-h-10 w-full grid-cols-[10px_minmax(0,1fr)_18px] items-center gap-3 px-4 text-left text-[15px] hover:bg-neutral-50 ${
                checked ? 'text-neutral-900' : 'text-neutral-600'
            }`}
        >
            <span className={`h-2.5 w-2.5 ${swatch}`} aria-hidden="true" />
            <span className="min-w-0 truncate">{label}</span>
            <span
                aria-hidden="true"
                className={`grid h-[18px] w-[18px] place-items-center ${checked ? 'bg-neutral-900' : 'border border-neutral-400 bg-white'}`}
            >
                {checked && <i className="fa-solid fa-check text-[10px] text-white" />}
            </span>
        </button>
    )
}

function ManagePanel({
    calendars,
    onChanged,
}: {
    calendars: Calendar[]
    onChanged: () => Promise<void>
}) {
    const [newName, setNewName] = useState('')
    const [newColor, setNewColor] = useState<CalendarColor>('emerald')
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)

    async function run(fn: () => Promise<unknown>) {
        setBusy(true)
        setError('')
        try {
            await fn()
            await onChanged()
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { message?: string } } })?.response?.data
                ?.message
            setError(message ?? 'Something went wrong.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3">
                {calendars.map((calendar) => (
                    <CalendarRow
                        key={calendar._id}
                        calendar={calendar}
                        busy={busy}
                        onRename={(name) => run(() => updateCalendar(calendar._id, { name }))}
                        onRecolour={(color) => run(() => updateCalendar(calendar._id, { color }))}
                        onDelete={() => run(() => deleteCalendar(calendar._id))}
                    />
                ))}
            </div>

            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-neutral-200 p-4">
                <Input
                    label="New calendar"
                    placeholder="Gym"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    error={error}
                />
                <ColorPicker value={newColor} onChange={setNewColor} />
                <Button
                    size="sm"
                    icon="fa-solid fa-plus"
                    disabled={busy || !newName.trim()}
                    onClick={() =>
                        void run(async () => {
                            await createCalendar(newName.trim(), newColor)
                            setNewName('')
                        })
                    }
                >
                    Add calendar
                </Button>
            </div>

            <p className="text-xs leading-relaxed text-neutral-500">
                Deleting a calendar moves its events onto your default calendar — nothing is lost.
            </p>
        </div>
    )
}

function CalendarRow({
    calendar,
    busy,
    onRename,
    onRecolour,
    onDelete,
}: {
    calendar: Calendar
    busy: boolean
    onRename: (name: string) => void
    onRecolour: (color: CalendarColor) => void
    onDelete: () => void
}) {
    const [name, setName] = useState(calendar.name)

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
                <Input
                    value={name}
                    disabled={busy}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => {
                        const trimmed = name.trim()
                        if (trimmed && trimmed !== calendar.name) onRename(trimmed)
                        else setName(calendar.name)
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    wrapperClassName="min-w-0 flex-1"
                />
                {calendar.isDefault ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        Default
                    </span>
                ) : (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onDelete}
                        aria-label={`Delete ${calendar.name}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-[10px] text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                        <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                    </button>
                )}
            </div>
            <ColorPicker value={calendar.color} onChange={onRecolour} />
        </div>
    )
}

function ColorPicker({
    value,
    onChange,
}: {
    value: CalendarColor
    onChange: (color: CalendarColor) => void
}) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {CALENDAR_COLORS.map((color) => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onChange(color)}
                    aria-label={color}
                    title={color}
                    className={[
                        'h-6 w-6 rounded-full transition-transform hover:scale-110',
                        CALENDAR_COLOR_CLASSES[color].dot,
                        value === color ? 'ring-2 ring-neutral-900 ring-offset-2' : '',
                    ].join(' ')}
                />
            ))}
        </div>
    )
}
