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
    DAYS_SINCE_COLORS,
    DAYS_SINCE_COLOR_CLASSES,
    type DaysSinceItem,
    type DaysSinceColor,
} from '../types'
import {
    listDaysSince,
    createDaysSince,
    updateDaysSince,
    deleteDaysSince,
} from '../services/daysSince'
import { todayKey } from '../lib/calendar'
import {
    daysBetween,
    nextMilestone,
    milestoneLabel,
    milestoneProgress,
    isMilestoneDay,
    formatStartDate,
} from '../lib/daysSince'

const ICON_CHOICES = [
    'fa-solid fa-fire',
    'fa-solid fa-ban-smoking',
    'fa-solid fa-beer-mug-empty',
    'fa-solid fa-wine-glass',
    'fa-solid fa-dumbbell',
    'fa-solid fa-person-praying',
    'fa-solid fa-droplet',
    'fa-solid fa-mobile-screen',
    'fa-solid fa-cookie-bite',
    'fa-solid fa-mug-hot',
    'fa-solid fa-hand-fist',
    'fa-solid fa-seedling',
    'fa-solid fa-heart',
    'fa-solid fa-bed',
    'fa-solid fa-sack-dollar',
    'fa-solid fa-bullseye',
]

interface EditorState {
    id: string | null
    label: string
    icon: string
    color: DaysSinceColor
    startDate: string
}

function blankEditor(): EditorState {
    return { id: null, label: '', icon: 'fa-solid fa-fire', color: 'emerald', startDate: todayKey() }
}

export default function DaysSince() {
    const [items, setItems] = useState<DaysSinceItem[]>([])
    const [loading, setLoading] = useState(true)
    const [editor, setEditor] = useState<EditorState | null>(null)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const today = todayKey()

    useEffect(() => {
        listDaysSince()
            .then(setItems)
            .finally(() => setLoading(false))
    }, [])

    // Longest-running streaks first.
    const sorted = useMemo(
        () => [...items].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        [items]
    )

    function openAdd() {
        setError(null)
        setEditor(blankEditor())
    }

    function openEdit(item: DaysSinceItem) {
        setError(null)
        setEditor({
            id: item._id,
            label: item.label,
            icon: item.icon,
            color: item.color,
            startDate: item.startDate,
        })
    }

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
            icon: editor.icon || 'fa-solid fa-fire',
            color: editor.color,
            startDate: editor.startDate,
        }
        setSaving(true)
        setError(null)
        try {
            if (editor.id) {
                const updated = await updateDaysSince(editor.id, payload)
                setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)))
            } else {
                const created = await createDaysSince(payload)
                setItems((prev) => [...prev, created])
            }
            setEditor(null)
        } catch {
            setError('Could not save. Try again.')
        } finally {
            setSaving(false)
        }
    }

    async function handleReset(item: DaysSinceItem) {
        if (!window.confirm(`Reset "${item.label}" back to zero, starting from today?`)) return
        const updated = await updateDaysSince(item._id, { startDate: today })
        setItems((prev) => prev.map((i) => (i._id === updated._id ? updated : i)))
    }

    async function handleDelete(item: DaysSinceItem) {
        if (!window.confirm(`Delete "${item.label}"?`)) return
        await deleteDaysSince(item._id)
        setItems((prev) => prev.filter((i) => i._id !== item._id))
    }

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex items-center gap-3">
                <Link
                    to="/profile"
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-sm" aria-hidden="true" />
                </Link>
                <div className="flex-1">
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Days Since</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Count the days since you started something good — or stopped something bad.
                    </p>
                </div>
                {items.length > 0 && (
                    <Button icon="fa-solid fa-plus" onClick={openAdd}>
                        New counter
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
                        icon="fa-solid fa-hourglass-half"
                        title="No counters yet"
                        description="Track a milestone like “Quit smoking” or “Started the gym” and watch the days add up."
                        action={
                            <Button icon="fa-solid fa-plus" onClick={openAdd}>
                                Add your first counter
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {sorted.map((item) => {
                        const days = daysBetween(item.startDate, today)
                        const c = DAYS_SINCE_COLOR_CLASSES[item.color]
                        const celebrating = isMilestoneDay(days)
                        const progress = milestoneProgress(days)
                        const next = nextMilestone(days)
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
                                                since {formatStartDate(item.startDate)}
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
                                                {
                                                    label: 'Reset to today',
                                                    icon: 'fa-solid fa-rotate-left',
                                                    onClick: () => handleReset(item),
                                                },
                                                'divider',
                                                {
                                                    label: 'Delete',
                                                    icon: 'fa-solid fa-trash-can',
                                                    danger: true,
                                                    onClick: () => handleDelete(item),
                                                },
                                            ]}
                                        />
                                    </div>

                                    <div className="mt-5 flex items-baseline gap-2">
                                        <span className={`text-5xl font-extrabold tracking-tight ${c.accent}`}>
                                            {days}
                                        </span>
                                        <span className="text-sm font-semibold text-neutral-400">
                                            {days === 1 ? 'day' : 'days'}
                                        </span>
                                        {celebrating && (
                                            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-bold text-white">
                                                <i className="fa-solid fa-trophy" aria-hidden="true" />
                                                {milestoneLabel(days)}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4">
                                        <div className={`h-1.5 w-full overflow-hidden rounded-full ${c.track}`}>
                                            <div
                                                className={`h-full rounded-full ${c.bar} transition-all duration-500`}
                                                style={{ width: `${Math.max(progress * 100, 3)}%` }}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs text-neutral-400">
                                            {next - days} {next - days === 1 ? 'day' : 'days'} to{' '}
                                            {milestoneLabel(next)}
                                        </p>
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
                title={editor?.id ? 'Edit counter' : 'New counter'}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setEditor(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving || !editor?.label.trim()}>
                            {saving ? 'Saving…' : 'Save'}
                        </Button>
                    </>
                }
            >
                {editor && (
                    <form onSubmit={handleSave} className="flex flex-col gap-5">
                        {error && (
                            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
                        )}

                        <Input
                            label="What are you tracking?"
                            value={editor.label}
                            onChange={(e) => setEditor((s) => (s ? { ...s, label: e.target.value } : s))}
                            placeholder="e.g. Quit smoking"
                            autoFocus
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
                                {DAYS_SINCE_COLORS.map((color) => {
                                    const c = DAYS_SINCE_COLOR_CLASSES[color]
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
                                Counting since
                            </span>
                            <DatePicker
                                value={editor.startDate}
                                maxDate={today}
                                onChange={(v: DatePickerValue) =>
                                    setEditor((s) =>
                                        s ? { ...s, startDate: typeof v === 'string' && v ? v : s.startDate } : s
                                    )
                                }
                            />
                        </div>
                    </form>
                )}
            </Modal>
        </Container>
    )
}
