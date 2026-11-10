import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Modal from '../Modal'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import TimePicker from '../TimePicker'
import PillToggle from '../PillToggle'
import { FIELD_ERROR_TEXT, FIELD_HINT, FIELD_LABEL } from '../fieldStyles'
import { CATEGORY_STYLE } from './timeboxStyles'
import { formatDateLong, WEEKDAYS_LONG } from '../../lib/calendar'
import { formatDuration, timeToMinutes } from '../../lib/time'
import { TIMEBOX_CATEGORIES, type Timebox, type TimeboxCategory, type TimeboxRepeat } from '../../types'
import type { TimeboxInput } from '../../services/timeboxes'

export interface TimeboxDraft {
    title: string
    startTime: string
    endTime: string
    category?: TimeboxCategory
    notes?: string
}

type Repeat = 'none' | TimeboxRepeat

const REPEATS: { value: Repeat; label: string }[] = [
    { value: 'none', label: 'Once' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekdays', label: 'Weekdays' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'custom', label: 'Pick days' },
]

/** Mon-first for the day picker; values stay 0 = Sun. */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface Props {
    open: boolean
    date: string
    /** The block being edited, or null to add one. */
    editing: Timebox | null
    /** Starting values for a new block. */
    draft: TimeboxDraft
    onClose: () => void
    onSave: (input: TimeboxInput) => Promise<void>
    onDelete: (scope: 'this' | 'all') => Promise<void>
}

/** Add or edit one block. */
export default function TimeboxDrawer({ open, date, editing, draft, onClose, onSave, onDelete }: Props) {
    const [title, setTitle] = useState('')
    const [start, setStart] = useState('09:00')
    const [end, setEnd] = useState('10:00')
    const [category, setCategory] = useState<TimeboxCategory | undefined>()
    const [notes, setNotes] = useState('')
    const [repeat, setRepeat] = useState<Repeat>('none')
    const [days, setDays] = useState<number[]>([])
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [askDelete, setAskDelete] = useState(false)

    // Fill the form each time the drawer opens (set during render, not in an effect).
    const [shownOpen, setShownOpen] = useState(false)
    if (open !== shownOpen) {
        setShownOpen(open)
        if (open) fill()
    }
    function fill() {
        const src = editing ?? draft
        setTitle(src.title)
        setStart(src.startTime)
        setEnd(src.endTime)
        setCategory(src.category)
        setNotes(src.notes ?? '')
        setRepeat(editing?.recurrence?.freq ?? 'none')
        setDays(editing?.recurrence?.days ?? [new Date(`${date}T12:00:00`).getDay()])
        setError(null)
        setAskDelete(false)
    }

    const length = timeToMinutes(end) - timeToMinutes(start)
    const repeating = Boolean(editing?.recurrence)

    async function submit(e?: FormEvent) {
        e?.preventDefault()
        if (!title.trim()) return setError('Give the block a name.')
        if (length <= 0) return setError('The end has to be after the start.')
        if (repeat === 'custom' && days.length === 0) return setError('Pick at least one day.')
        setSaving(true)
        setError(null)
        try {
            await onSave({
                // A series keeps its first day; a new or one-off block sits on this one.
                date: editing?.seriesStart ?? date,
                title: title.trim(),
                startTime: start,
                endTime: end,
                category,
                notes: notes.trim() || undefined,
                recurrence:
                    repeat === 'none'
                        ? null
                        : { freq: repeat, ...(repeat === 'custom' ? { days } : {}), ...(editing?.recurrence?.until ? { until: editing.recurrence.until } : {}) },
            })
        } catch {
            setError('Couldn’t save that block. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    async function remove(scope: 'this' | 'all') {
        setSaving(true)
        try {
            await onDelete(scope)
        } finally {
            setSaving(false)
            setAskDelete(false)
        }
    }

    // Meetings imported from Google Calendar are shown, never edited here.
    if (editing?.source) {
        const len = timeToMinutes(editing.endTime) - timeToMinutes(editing.startTime)
        return (
            <Drawer
                open={open}
                onClose={onClose}
                title="Meeting"
                size="lg"
                footer={
                    <Button variant="ghost" className="ml-auto" onClick={onClose}>
                        Close
                    </Button>
                }
            >
                <div className="flex flex-col gap-5">
                    <div>
                        <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-neutral-950">
                            {editing.title}
                        </h2>
                        <p className="mt-1.5 text-sm nums text-neutral-500">
                            {formatDateLong(date)} · {editing.startTime}–{editing.endTime} · {formatDuration(len)}
                        </p>
                    </div>
                    {editing.location && (
                        <p className="flex items-start gap-2.5 text-sm text-neutral-800">
                            <i className="fa-solid fa-location-dot mt-0.5 text-xs text-neutral-500" aria-hidden="true" />
                            <span className="min-w-0 break-words">{editing.location}</span>
                        </p>
                    )}
                    {editing.notes && (
                        <p className="whitespace-pre-line break-words rounded-2xl bg-neutral-50 px-4 py-3.5 text-sm leading-relaxed text-neutral-700">
                            {editing.notes}
                        </p>
                    )}
                    <p className="flex items-center gap-2 rounded-xl bg-neutral-100 px-3 py-2.5 text-[13px] text-neutral-700">
                        <i className="fa-solid fa-video text-xs" aria-hidden="true" />
                        From Google Calendar — change it there and it updates on the next sync.
                    </p>
                </div>
            </Drawer>
        )
    }

    return (
        <>
            <Drawer
                open={open}
                onClose={onClose}
                title={editing ? 'Edit block' : 'New block'}
                size="lg"
                footer={
                    <div className="flex w-full items-center gap-2">
                        {editing && (
                            <Button
                                variant="danger"
                                icon="fa-solid fa-trash-can"
                                disabled={saving}
                                onClick={() => (repeating ? setAskDelete(true) : remove('all'))}
                            >
                                Delete
                            </Button>
                        )}
                        <div className="ml-auto flex gap-2">
                            <Button variant="ghost" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button onClick={() => submit()} disabled={saving}>
                                {saving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </div>
                }
            >
                <form onSubmit={submit} className="flex flex-col gap-5">
                    <p className="text-sm text-neutral-500">{formatDateLong(date)}</p>

                    <Input label="What" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deep work" autoFocus />

                    <div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <span className={FIELD_LABEL}>Start</span>
                                <TimePicker value={start} onChange={(v) => v && setStart(v)} minuteStep={5} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className={FIELD_LABEL}>End</span>
                                <TimePicker value={end} onChange={(v) => v && setEnd(v)} minuteStep={5} align="right" />
                            </div>
                        </div>
                        {length > 0 && <p className={`mt-1.5 ${FIELD_HINT}`}>{formatDuration(length)}</p>}
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className={FIELD_LABEL}>Category</span>
                        <div className="flex flex-wrap gap-2">
                            {TIMEBOX_CATEGORIES.map((c) => {
                                const on = category === c
                                return (
                                    <button
                                        key={c}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => setCategory(on ? undefined : c)}
                                        className={`flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                            on
                                                ? 'bg-neutral-900 text-neutral-50'
                                                : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <span className={`h-2 w-2 rounded-full ${CATEGORY_STYLE[c].dot}`} aria-hidden="true" />
                                        {CATEGORY_STYLE[c].label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <span className={FIELD_LABEL}>Repeat</span>
                        <PillToggle label="Repeat" options={REPEATS} value={repeat} onChange={setRepeat} />
                        {repeat === 'custom' && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {DAY_ORDER.map((d) => {
                                    const on = days.includes(d)
                                    return (
                                        <button
                                            key={d}
                                            type="button"
                                            aria-pressed={on}
                                            aria-label={WEEKDAYS_LONG[d]}
                                            onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                                            className={`h-9 w-11 rounded-[10px] text-[13px] font-medium transition-colors ${
                                                on ? 'bg-neutral-900 text-neutral-50' : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
                                            }`}
                                        >
                                            {WEEKDAYS_LONG[d].slice(0, 3)}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                        {repeating && (
                            <p className={FIELD_HINT}>Changes here apply to every day this block repeats.</p>
                        )}
                    </div>

                    <Textarea label="Notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />

                    {error && (
                        <p className={FIELD_ERROR_TEXT}>
                            <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                            {error}
                        </p>
                    )}
                    <button type="submit" hidden />
                </form>
            </Drawer>

            <Modal
                open={askDelete}
                onClose={() => setAskDelete(false)}
                title="Delete a repeating block"
                size="sm"
                footer={
                    <>
                        <Button variant="secondary" disabled={saving} onClick={() => remove('this')}>
                            Just this day
                        </Button>
                        <Button variant="danger" disabled={saving} onClick={() => remove('all')}>
                            Every day
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-neutral-600">
                    “{editing?.title}” repeats. Remove it from {formatDateLong(date)} only, or delete the whole series?
                </p>
            </Modal>
        </>
    )
}
