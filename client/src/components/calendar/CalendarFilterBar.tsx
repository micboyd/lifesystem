import { useEffect, useRef, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import {
    CALENDAR_COLORS,
    CALENDAR_COLOR_CLASSES,
    EVENT_TYPES,
    EVENT_TYPE_DOTS,
    EVENT_TYPE_ICONS,
    EVENT_TYPE_LABELS,
} from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { useHiddenEventTypes } from '../useHiddenEventTypes'
import { showAllEventTypes, toggleEventType } from '../../lib/eventTypeFilter'
import { createCalendar, deleteCalendar, updateCalendar } from '../../services/calendars'
import type { Calendar, CalendarColor, EventType } from '../../types'

/**
 * The calendar toolbar's "Filters" dropdown.
 *
 * Two kinds of switch live behind one button, because from the toolbar they do
 * the same job — decide what the grid draws:
 *
 *  - event categories (trip, social, …) are a *view*, so they're per-device and
 *    remembered locally, and hidden ones simply don't render, and
 *  - calendars are layers that belong to the calendar itself, so their
 *    visibility is server-side and the grid looks the same on every device;
 *    a hidden layer still leaves a presence dot on the days it touches.
 *
 * A count on the trigger keeps an active filter from being forgotten — an empty
 * week that's really a filtered one is the failure mode worth designing out.
 */
export default function CalendarFilterBar({ onChanged }: { onChanged: () => void }) {
    const { calendars, setVisible, reload } = useCalendars()
    const hiddenTypes = useHiddenEventTypes()
    const [open, setOpen] = useState(false)
    const [managing, setManaging] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const hiddenCalendars = calendars.filter((c) => !c.visible).length
    const activeFilters = hiddenTypes.size + hiddenCalendars

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
        showAllEventTypes()
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
                        'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
                        activeFilters
                            ? 'border-transparent bg-neutral-900 text-white hover:bg-neutral-800'
                            : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
                    ].join(' ')}
                >
                    <i className="fa-solid fa-filter text-xs" aria-hidden="true" />
                    Filters
                    {activeFilters > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/20 px-1 text-[10px] font-bold">
                            {activeFilters}
                        </span>
                    )}
                </button>

                {open && (
                    <div
                        role="dialog"
                        aria-label="Calendar filters"
                        className="absolute right-0 z-50 mt-2 w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-neutral-100 bg-white p-1.5 shadow-lg"
                    >
                        <SectionLabel>Event types</SectionLabel>
                        {EVENT_TYPES.map((type) => (
                            <FilterRow
                                key={type}
                                label={EVENT_TYPE_LABELS[type]}
                                icon={EVENT_TYPE_ICONS[type]}
                                swatch={EVENT_TYPE_DOTS[type]}
                                checked={!hiddenTypes.has(type)}
                                onToggle={() => toggleEventType(type as EventType)}
                            />
                        ))}

                        {calendars.length > 0 && (
                            <>
                                <div className="my-1 h-px bg-neutral-100" />
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

                        <div className="my-1 h-px bg-neutral-100" />
                        <div className="flex items-center justify-between gap-2 px-1 py-1">
                            <button
                                type="button"
                                disabled={activeFilters === 0}
                                onClick={resetAll}
                                className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:pointer-events-none disabled:opacity-40"
                            >
                                Show all
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setManaging(true)
                                    setOpen(false)
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <i className="fa-solid fa-sliders text-[10px]" aria-hidden="true" />
                                Manage calendars
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
        <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
            {children}
        </p>
    )
}

/** One toggle line: swatch, label, and a tick that only shows when included. */
function FilterRow({
    label,
    icon,
    swatch,
    checked,
    onToggle,
}: {
    label: string
    icon?: string
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
            className={[
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors duration-100 hover:bg-neutral-100',
                checked ? 'text-neutral-700' : 'text-neutral-400',
            ].join(' ')}
        >
            <span
                className={[
                    'h-2.5 w-2.5 shrink-0 rounded-full transition-colors',
                    checked ? swatch : 'bg-neutral-200',
                ].join(' ')}
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {icon && (
                <i className={`${icon} shrink-0 text-[10px] text-neutral-300`} aria-hidden="true" />
            )}
            <i
                className={`fa-solid fa-check shrink-0 text-[10px] ${checked ? 'text-neutral-900' : 'invisible'}`}
                aria-hidden="true"
            />
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

            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-neutral-200 p-4">
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

            <p className="text-xs leading-relaxed text-neutral-400">
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
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
                <input
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
                    className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-semibold text-neutral-900 outline-none hover:border-neutral-200 focus:border-neutral-400"
                />
                {calendar.isDefault ? (
                    <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                        Default
                    </span>
                ) : (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onDelete}
                        aria-label={`Delete ${calendar.name}`}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
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
