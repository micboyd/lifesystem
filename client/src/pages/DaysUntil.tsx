import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import DatePicker, { type DatePickerValue } from '../components/DatePicker'
import DropdownMenu from '../components/DropdownMenu'
import {
    DAYS_UNTIL_COLORS,
    DAYS_UNTIL_COLOR_CLASSES,
    type DaysUntilItem,
    type DaysUntilColor,
    type Event,
} from '../types'
import {
    listDaysUntil,
    createDaysUntil,
    updateDaysUntil,
    deleteDaysUntil,
} from '../services/daysUntil'
import { listEvents } from '../services/events'
import { todayKey, addDays } from '../lib/calendar'
import { daysUntil, formatTargetDate } from '../lib/daysUntil'

/** How far ahead the calendar picker looks for something to count down to. */
const CALENDAR_WINDOW_DAYS = 365

const ICON_CHOICES = [
    'fa-solid fa-hourglass-end',
    'fa-solid fa-plane-departure',
    'fa-solid fa-suitcase-rolling',
    'fa-solid fa-gift',
    'fa-solid fa-cake-candles',
    'fa-solid fa-champagne-glasses',
    'fa-solid fa-graduation-cap',
    'fa-solid fa-ring',
    'fa-solid fa-house',
    'fa-solid fa-briefcase',
    'fa-solid fa-stethoscope',
    'fa-solid fa-calendar-day',
    'fa-solid fa-flag-checkered',
    'fa-solid fa-star',
    'fa-solid fa-heart',
    'fa-solid fa-bullseye',
]

interface EditorState {
    id: string | null
    label: string
    icon: string
    color: DaysUntilColor
    targetDate: string
}

function blankEditor(today: string): EditorState {
    return { id: null, label: '', icon: 'fa-solid fa-hourglass-end', color: 'sky', targetDate: today }
}

export default function DaysUntil() {
    const today = todayKey()

    const [items, setItems] = useState<DaysUntilItem[]>([])
    const [loading, setLoading] = useState(true)
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [pickingEvent, setPickingEvent] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<DaysUntilItem | null>(null)
    const [deleting, setDeleting] = useState(false)

    const [events, setEvents] = useState<Event[] | null>(null)
    const [eventQuery, setEventQuery] = useState('')

    useEffect(() => {
        listDaysUntil()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    // Soonest first; anything already passed sinks to the bottom.
    const sorted = useMemo(() => [...items].sort((a, b) => a.targetDate.localeCompare(b.targetDate)), [items])

    function openAdd() {
        setError(null)
        setPickingEvent(false)
        setEditor(blankEditor(today))
    }

    function openEdit(item: DaysUntilItem) {
        setError(null)
        setPickingEvent(false)
        setEditor({ id: item._id, label: item.label, icon: item.icon, color: item.color, targetDate: item.targetDate })
    }

    function openEventPicker() {
        setEventQuery('')
        setPickingEvent(true)
        if (events === null) {
            listEvents(today, addDays(today, CALENDAR_WINDOW_DAYS)).then((res) =>
                setEvents([...res].sort((a, b) => a.startDate.localeCompare(b.startDate)))
            )
        }
    }

    function pickEvent(event: Event) {
        setEditor((s) => (s ? { ...s, label: event.title, targetDate: event.startDate } : s))
        setPickingEvent(false)
    }

    const matchingEvents = useMemo(() => {
        if (!events) return []
        const q = eventQuery.trim().toLowerCase()
        const upcoming = events.filter((e) => e.startDate >= today)
        if (!q) return upcoming.slice(0, 20)
        return upcoming.filter((e) => e.title.toLowerCase().includes(q)).slice(0, 20)
    }, [events, eventQuery, today])

    async function handleSave(e: FormEvent) {
        e.preventDefault()
        if (!editor) return
        const label = editor.label.trim()
        if (!label) {
            setError('Give it a name.')
            return
        }
        const payload = {
            label,
            icon: editor.icon || 'fa-solid fa-hourglass-end',
            color: editor.color,
            targetDate: editor.targetDate,
        }
        setSaving(true)
        setError(null)
        try {
            if (editor.id) {
                const updated = await updateDaysUntil(editor.id, payload)
                setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)))
            } else {
                const created = await createDaysUntil(payload)
                setItems((prev) => [...prev, created])
            }
            setEditor(null)
        } catch {
            setError('Could not save. Try again.')
        } finally {
            setSaving(false)
        }
    }

    async function handleConfirmDelete() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            await deleteDaysUntil(deleteTarget._id)
            setItems((prev) => prev.filter((i) => i._id !== deleteTarget._id))
            setDeleteTarget(null)
        } finally {
            setDeleting(false)
        }
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex flex-wrap items-center gap-3">
                <Link
                    to="/profile"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-sm" aria-hidden="true" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">Days Until</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Count down to a trip, deadline or milestone — add it yourself or pull the date
                        straight from your calendar.
                    </p>
                </div>
                {items.length > 0 && (
                    <Button icon="fa-solid fa-plus" onClick={openAdd}>
                        New countdown
                    </Button>
                )}
            </header>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : sorted.length === 0 ? (
                <Card>
                    <EmptyState
                        icon="fa-solid fa-hourglass-end"
                        title="No countdowns yet"
                        description="Track a trip, deadline or milestone and watch the days tick down — or pull one straight from your calendar."
                        action={
                            <Button icon="fa-solid fa-plus" onClick={openAdd}>
                                Add your first countdown
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {sorted.map((item) => {
                        const days = daysUntil(item.targetDate, today)
                        const c = DAYS_UNTIL_COLOR_CLASSES[item.color]
                        const passed = days < 0
                        return (
                            <Card key={item._id} className="relative overflow-hidden">
                                <div
                                    className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br ${c.glow} to-transparent opacity-70`}
                                    aria-hidden="true"
                                />
                                <div className="relative">
                                    <div className="flex items-start gap-3">
                                        <span
                                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg ${c.tile} ${c.accent}`}
                                        >
                                            <i className={item.icon} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0 flex-1 pt-0.5">
                                            <p className="truncate font-bold tracking-tight text-neutral-900">
                                                {item.label}
                                            </p>
                                            <p className="text-xs text-neutral-400">
                                                {formatTargetDate(item.targetDate)}
                                            </p>
                                        </div>
                                        <DropdownMenu
                                            align="right"
                                            trigger={
                                                <button
                                                    type="button"
                                                    aria-label="Options"
                                                    className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                >
                                                    <i className="fa-solid fa-ellipsis" aria-hidden="true" />
                                                </button>
                                            }
                                            items={[
                                                {
                                                    label: 'Edit',
                                                    icon: 'fa-solid fa-pen',
                                                    onClick: () => openEdit(item),
                                                },
                                                'divider',
                                                {
                                                    label: 'Delete',
                                                    icon: 'fa-solid fa-trash-can',
                                                    danger: true,
                                                    onClick: () => setDeleteTarget(item),
                                                },
                                            ]}
                                        />
                                    </div>

                                    <div className="mt-5 flex flex-wrap items-baseline gap-2">
                                        {days === 0 ? (
                                            <span className={`text-3xl font-extrabold tracking-tight ${c.accent}`}>
                                                Today!
                                            </span>
                                        ) : passed ? (
                                            <>
                                                <span className="text-3xl font-extrabold tracking-tight text-neutral-300">
                                                    {-days}
                                                </span>
                                                <span className="text-sm font-semibold text-neutral-400">
                                                    {-days === 1 ? 'day ago' : 'days ago'}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <span className={`text-5xl font-extrabold tracking-tight ${c.accent}`}>
                                                    {days}
                                                </span>
                                                <span className="text-sm font-semibold text-neutral-400">
                                                    {days === 1 ? 'day' : 'days'} to go
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            )}

            <Modal
                open={editor !== null}
                onClose={() => setEditor(null)}
                title={pickingEvent ? 'Pick from your calendar' : editor?.id ? 'Edit countdown' : 'New countdown'}
                footer={
                    pickingEvent ? undefined : (
                        <>
                            <Button variant="secondary" onClick={() => setEditor(null)}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={saving || !editor?.label.trim()}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </>
                    )
                }
            >
                {editor && pickingEvent && (
                    <div className="flex flex-col gap-3">
                        <Input
                            icon="fa-solid fa-magnifying-glass"
                            type="search"
                            placeholder="Search your upcoming events…"
                            value={eventQuery}
                            onChange={(e) => setEventQuery(e.target.value)}
                            autoFocus
                        />
                        {events === null ? (
                            <div className="grid place-items-center py-10">
                                <Spinner />
                            </div>
                        ) : matchingEvents.length === 0 ? (
                            <p className="px-1 py-6 text-center text-sm text-neutral-400">
                                {eventQuery.trim()
                                    ? `Nothing upcoming matches “${eventQuery.trim()}”.`
                                    : 'Nothing on your calendar in the next year yet.'}
                            </p>
                        ) : (
                            <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
                                {matchingEvents.map((event) => (
                                    <li key={event._id}>
                                        <button
                                            type="button"
                                            onClick={() => pickEvent(event)}
                                            className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                                        >
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-900">
                                                {event.title}
                                            </span>
                                            <span className="shrink-0 text-xs text-neutral-400">
                                                {formatTargetDate(event.startDate)}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <Button variant="ghost" onClick={() => setPickingEvent(false)}>
                            Back
                        </Button>
                    </div>
                )}

                {editor && !pickingEvent && (
                    <form onSubmit={handleSave} className="flex flex-col gap-5">
                        {error && (
                            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
                        )}

                        {!editor.id && (
                            <button
                                type="button"
                                onClick={openEventPicker}
                                className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 px-4 py-3 text-left transition-colors hover:border-sky-300 hover:bg-sky-50/50"
                            >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
                                    <i className="fa-solid fa-calendar-days" aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-semibold text-neutral-900">
                                        Pick from your calendar
                                    </span>
                                    <span className="block text-xs text-neutral-400">
                                        Fills in the name and date from an existing event
                                    </span>
                                </span>
                                <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                            </button>
                        )}

                        <Input
                            label="What are you counting down to?"
                            value={editor.label}
                            onChange={(e) => setEditor((s) => (s ? { ...s, label: e.target.value } : s))}
                            placeholder="e.g. Flight to Lisbon"
                            autoFocus={!!editor.id}
                        />

                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Icon
                            </span>
                            <div className="flex flex-wrap gap-2">
                                {ICON_CHOICES.map((icon) => (
                                    <button
                                        key={icon}
                                        type="button"
                                        aria-label={icon}
                                        onClick={() => setEditor((s) => (s ? { ...s, icon } : s))}
                                        className={`grid h-10 w-10 place-items-center rounded-xl text-lg transition-colors ${
                                            editor.icon === icon
                                                ? 'bg-neutral-900 text-white'
                                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                        }`}
                                    >
                                        <i className={icon} aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Colour
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                                {DAYS_UNTIL_COLORS.map((color) => {
                                    const c = DAYS_UNTIL_COLOR_CLASSES[color]
                                    return (
                                        <button
                                            key={color}
                                            type="button"
                                            aria-label={color}
                                            onClick={() => setEditor((s) => (s ? { ...s, color } : s))}
                                            className={`h-8 w-8 rounded-full ${c.bar} transition-transform ${
                                                editor.color === color
                                                    ? 'ring-2 ring-neutral-900 ring-offset-2'
                                                    : 'hover:scale-110'
                                            }`}
                                        />
                                    )
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Counting down to
                            </span>
                            <DatePicker
                                value={editor.targetDate}
                                onChange={(v: DatePickerValue) =>
                                    setEditor((s) =>
                                        s ? { ...s, targetDate: typeof v === 'string' && v ? v : s.targetDate } : s
                                    )
                                }
                            />
                        </div>
                    </form>
                )}
            </Modal>

            <Modal
                open={deleteTarget !== null}
                onClose={() => setDeleteTarget(null)}
                title={deleteTarget ? `Delete "${deleteTarget.label}"?` : undefined}
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
                            Cancel
                        </Button>
                        <Button variant="secondary" onClick={handleConfirmDelete} disabled={deleting}>
                            {deleting ? 'Deleting…' : 'Delete'}
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-neutral-500">This can&apos;t be undone.</p>
            </Modal>
        </Container>
    )
}
