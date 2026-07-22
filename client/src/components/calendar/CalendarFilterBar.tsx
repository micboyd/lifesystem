import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import { CALENDAR_COLORS, CALENDAR_COLOR_CLASSES } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import { createCalendar, deleteCalendar, updateCalendar } from '../../services/calendars'
import type { Calendar, CalendarColor } from '../../types'

/**
 * Layer toggles for the calendar toolbar.
 *
 * The whole point of a second calendar is that it's off most of the time, so
 * visibility lives on the calendar itself (server-side) rather than in local
 * state — the grid looks the same on every device.
 */
export default function CalendarFilterBar({ onChanged }: { onChanged: () => void }) {
    const { calendars, setVisible, reload } = useCalendars()
    const [managing, setManaging] = useState(false)

    if (calendars.length === 0) return null

    return (
        <>
            <div className="flex flex-wrap items-center gap-1.5">
                {calendars.map((calendar) => {
                    const c = CALENDAR_COLOR_CLASSES[calendar.color]
                    return (
                        <button
                            key={calendar._id}
                            type="button"
                            onClick={() => void setVisible(calendar._id, !calendar.visible)}
                            title={
                                calendar.visible
                                    ? `Hide ${calendar.name}`
                                    : `Show ${calendar.name}`
                            }
                            className={[
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors',
                                calendar.visible
                                    ? `border-transparent ${c.bg} ${c.text}`
                                    : 'border-neutral-200 text-neutral-400 hover:bg-neutral-50',
                            ].join(' ')}
                        >
                            <span
                                className={[
                                    'h-2 w-2 rounded-full',
                                    calendar.visible ? c.dot : 'bg-neutral-300',
                                ].join(' ')}
                            />
                            {calendar.name}
                        </button>
                    )
                })}
                <button
                    type="button"
                    onClick={() => setManaging(true)}
                    aria-label="Manage calendars"
                    title="Manage calendars"
                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-sliders text-xs" aria-hidden="true" />
                </button>
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
