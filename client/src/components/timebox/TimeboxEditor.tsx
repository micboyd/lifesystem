import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import TimePicker from '../TimePicker'
import { formatDuration, timeToMinutes } from '../../lib/time'
import {
    TIMEBOX_CATEGORIES,
    TIMEBOX_CATEGORY_LABELS,
    TIMEBOX_CATEGORY_COLORS,
    type Timebox,
    type TimeboxCategory,
    type RecurrenceFreq,
} from '../../types'
import type { TimeboxInput } from '../../services/timeboxes'

const RECURRENCE_OPTIONS: { value: RecurrenceFreq | 'none'; label: string }[] = [
    { value: 'none', label: 'Does not repeat' },
    { value: 'daily', label: 'Every day' },
    { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'custom', label: 'Custom days' },
]

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// UI order Mon–Sun mapped to JS day-of-week (0=Sun…6=Sat)
const DAY_DOW = [1, 2, 3, 4, 5, 6, 0]

interface Props {
    open: boolean
    item: Timebox | null
    /** Pre-filled values when adding (e.g. from clicking a slot or dropping a task). */
    defaults: { startTime: string; endTime: string; title?: string }
    /** Bounds from the user's wake/bed settings. */
    minTime: string
    maxTime: string
    saving: boolean
    /** True when the last save was rejected for overlapping another block. */
    conflict?: boolean
    onClose: () => void
    onSave: (input: TimeboxInput) => void
    onDelete: () => void
}

export default function TimeboxEditor({
    open,
    item,
    defaults,
    minTime,
    maxTime,
    saving,
    conflict = false,
    onClose,
    onSave,
    onDelete,
}: Props) {
    const [title, setTitle] = useState('')
    const [category, setCategory] = useState<TimeboxCategory | undefined>(undefined)
    const [startTime, setStartTime] = useState<string | null>(null)
    const [endTime, setEndTime] = useState<string | null>(null)
    const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq | 'none'>('none')
    const [customDays, setCustomDays] = useState<number[]>([])
    const [error, setError] = useState('')

    useEffect(() => {
        if (!open) return
        setTitle(item?.title ?? defaults.title ?? '')
        setCategory(item?.category ?? undefined)
        setStartTime(item?.startTime ?? defaults.startTime)
        setEndTime(item?.endTime ?? defaults.endTime)
        setRecurrenceFreq(item?.recurrence?.freq ?? 'none')
        setCustomDays(item?.recurrence?.days ?? [])
        setError('')
    }, [open, item, defaults])

    const duration =
        startTime && endTime && timeToMinutes(endTime) > timeToMinutes(startTime)
            ? formatDuration(timeToMinutes(endTime) - timeToMinutes(startTime))
            : null

    function handleSave() {
        if (!title.trim()) {
            setError('Give the block a title.')
            return
        }
        if (!startTime || !endTime) {
            setError('Set a start and end time.')
            return
        }
        if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
            setError('End time must be after start.')
            return
        }
        onSave({
            title: title.trim(),
            category,
            startTime,
            endTime,
            recurrence:
                recurrenceFreq !== 'none'
                    ? {
                          freq: recurrenceFreq,
                          ...(recurrenceFreq === 'custom' ? { days: customDays } : {}),
                      }
                    : undefined,
        })
    }

    const isRecurring = item?.recurrence != null || item?.isRecurringInstance

    return (
        <Drawer
            open={open}
            onClose={onClose}
            side="right"
            size="lg"
            title={item ? 'Edit block' : 'New block'}
            footer={
                <>
                    {item && (
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
            <div className="flex flex-col gap-5">
                <Input
                    label="Title"
                    placeholder="What are you doing?"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value)
                        setError('')
                    }}
                    error={error}
                    autoFocus
                />

                {/* Category */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Category{' '}
                        <span className="normal-case font-normal text-neutral-300">(optional)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {TIMEBOX_CATEGORIES.map((cat) => {
                            const c = TIMEBOX_CATEGORY_COLORS[cat]
                            const selected = category === cat
                            return (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategory(selected ? undefined : cat)}
                                    className={[
                                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                        selected
                                            ? `${c.bg} ${c.border} ${c.text}`
                                            : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
                                    ].join(' ')}
                                >
                                    {TIMEBOX_CATEGORY_LABELS[cat]}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Times */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Start
                        </span>
                        <TimePicker
                            value={startTime}
                            onChange={setStartTime}
                            minuteStep={5}
                            minTime={minTime}
                            maxTime={maxTime}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            End
                        </span>
                        <TimePicker
                            value={endTime}
                            onChange={setEndTime}
                            minuteStep={5}
                            minTime={startTime ?? minTime}
                            maxTime={maxTime}
                            align="right"
                        />
                    </div>
                </div>

                {duration && (
                    <p className="text-sm font-medium text-neutral-500">
                        <i
                            className="fa-regular fa-clock mr-1.5 text-neutral-400"
                            aria-hidden="true"
                        />
                        Duration: <span className="font-semibold text-neutral-700">{duration}</span>
                    </p>
                )}

                {/* Recurrence */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Repeat
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                        {RECURRENCE_OPTIONS.map((opt) => {
                            const selected = recurrenceFreq === opt.value
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setRecurrenceFreq(opt.value)}
                                    className={[
                                        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                        selected
                                            ? 'border-neutral-900 bg-neutral-900 text-white'
                                            : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
                                    ].join(' ')}
                                >
                                    {opt.label}
                                </button>
                            )
                        })}
                    </div>
                    {recurrenceFreq === 'custom' && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {DAY_LABELS.map((label, i) => {
                                const dow = DAY_DOW[i]
                                const active = customDays.includes(dow)
                                return (
                                    <button
                                        key={dow}
                                        type="button"
                                        onClick={() =>
                                            setCustomDays(
                                                active
                                                    ? customDays.filter((d) => d !== dow)
                                                    : [...customDays, dow]
                                            )
                                        }
                                        className={[
                                            'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                                            active
                                                ? 'border-blue-500 bg-blue-500 text-white'
                                                : 'border-neutral-200 bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700',
                                        ].join(' ')}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </div>
                    )}
                    {isRecurring && recurrenceFreq !== 'none' && (
                        <p className="text-xs text-neutral-400">
                            <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
                            Saving will update all occurrences of this block.
                        </p>
                    )}
                </div>

                {conflict && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        That time overlaps another block — pick a free slot.
                    </p>
                )}
            </div>
        </Drawer>
    )
}
