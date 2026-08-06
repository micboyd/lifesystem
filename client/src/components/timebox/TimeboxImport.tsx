import { useEffect, useState } from 'react'
import Modal from '../Modal'
import Button from '../Button'
import Accordion from '../Accordion'
import DatePicker, { type DatePickerValue } from '../DatePicker'
import { TIMEBOX_CATEGORIES, type TimeboxCategory, type RecurrenceFreq } from '../../types'
import type { TimeboxInput } from '../../services/timeboxes'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const SAMPLE = `[
  { "title": "Morning routine", "startTime": "07:00", "endTime": "07:45", "category": "personal", "notes": "Stretch, journal, cold shower" },
  { "title": "Deep work", "startTime": "09:00", "endTime": "11:00", "category": "work" },
  { "title": "Lunch", "startTime": "12:30", "endTime": "13:00" },
  { "title": "Gym", "startTime": "18:00", "endTime": "19:00", "category": "health" }
]`

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

/** "2026-08-06" → "6 Aug 2026" for compact summaries. */
function shortDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
    open: boolean
    /** The day being imported into (ISO YYYY-MM-DD) — the default recurrence start. */
    date: string
    /** The day being imported into, for the header. */
    dateLabel: string
    importing: boolean
    onClose: () => void
    /**
     * Called with the parsed, validated blocks to create. When the import
     * repeats, `startDate` is the day the series is anchored to.
     */
    onImport: (blocks: TimeboxInput[], startDate?: string) => void
}

/** Parse the pasted text into timebox inputs, or return an error message. */
function parseBlocks(text: string): { blocks: TimeboxInput[] } | { error: string } {
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        return { error: "That's not valid JSON — check for a stray comma or quote." }
    }
    // Accept a bare array or an object with a `blocks` array.
    const arr = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as { blocks?: unknown })?.blocks)
          ? (raw as { blocks: unknown[] }).blocks
          : null
    if (!arr) return { error: 'Expected a JSON array of blocks.' }
    if (arr.length === 0) return { error: 'No blocks to import.' }

    const blocks: TimeboxInput[] = []
    for (let i = 0; i < arr.length; i++) {
        const b = arr[i] as Record<string, unknown>
        const where = `Block ${i + 1}`
        if (typeof b !== 'object' || b === null) return { error: `${where}: not an object.` }
        const title = typeof b.title === 'string' ? b.title.trim() : ''
        if (!title) return { error: `${where}: "title" is required.` }
        if (!TIME_RE.test(b.startTime as string) || !TIME_RE.test(b.endTime as string))
            return { error: `${where}: "startTime"/"endTime" must be HH:MM (24-hour).` }
        if ((b.endTime as string) <= (b.startTime as string))
            return { error: `${where}: "endTime" must be after "startTime".` }
        const category =
            typeof b.category === 'string' &&
            (TIMEBOX_CATEGORIES as readonly string[]).includes(b.category)
                ? (b.category as TimeboxCategory)
                : undefined
        const notes =
            typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : undefined
        blocks.push({
            title,
            notes,
            category,
            startTime: b.startTime as string,
            endTime: b.endTime as string,
        })
    }
    return { blocks }
}

export default function TimeboxImport({
    open,
    date,
    dateLabel,
    importing,
    onClose,
    onImport,
}: Props) {
    const [text, setText] = useState('')
    const [error, setError] = useState('')

    // Advanced: apply a recurrence to every imported block.
    const [freq, setFreq] = useState<RecurrenceFreq | 'none'>('none')
    const [customDays, setCustomDays] = useState<number[]>([])
    const [startDate, setStartDate] = useState(date)
    const [endsOn, setEndsOn] = useState('') // '' → no end date

    useEffect(() => {
        if (open) {
            setText('')
            setError('')
            setFreq('none')
            setCustomDays([])
            setStartDate(date)
            setEndsOn('')
        }
    }, [open, date])

    const repeats = freq !== 'none'

    function repeatSummary(): string {
        const freqLabel =
            freq === 'daily'
                ? 'every day'
                : freq === 'weekdays'
                  ? 'every weekday (Mon–Fri)'
                  : freq === 'weekly'
                    ? `weekly (${DAY_LABELS[DAY_DOW.indexOf(new Date(`${startDate}T00:00:00`).getDay())] ?? ''})`
                    : customDays.length
                      ? `on ${DAY_DOW.filter((d) => customDays.includes(d))
                            .map((d) => DAY_LABELS[DAY_DOW.indexOf(d)])
                            .join(', ')}`
                      : 'on selected days'
        const ending = endsOn ? `until ${shortDate(endsOn)}` : 'with no end date'
        return `Repeats ${freqLabel}, starting ${shortDate(startDate)}, ${ending}.`
    }

    function handleImport() {
        const result = parseBlocks(text)
        if ('error' in result) {
            setError(result.error)
            return
        }
        let blocks = result.blocks
        if (repeats) {
            if (freq === 'custom' && customDays.length === 0) {
                setError('Pick at least one day for a custom repeat.')
                return
            }
            if (endsOn && endsOn < startDate) {
                setError('The end date must be on or after the start date.')
                return
            }
            const recurrence = {
                freq,
                ...(freq === 'custom' ? { days: customDays } : {}),
                ...(endsOn ? { until: endsOn } : {}),
            }
            blocks = blocks.map((b) => ({ ...b, recurrence }))
        }
        onImport(blocks, repeats ? startDate : undefined)
    }

    const advancedContent = (
        <div className="flex flex-col gap-4">
            {/* Frequency */}
            <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Repeat
                </span>
                <div className="flex flex-wrap gap-1.5">
                    {RECURRENCE_OPTIONS.map((opt) => {
                        const selected = freq === opt.value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                    setFreq(opt.value)
                                    setError('')
                                }}
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
                {freq === 'custom' && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                        {DAY_LABELS.map((label, i) => {
                            const dow = DAY_DOW[i]
                            const active = customDays.includes(dow)
                            return (
                                <button
                                    key={dow}
                                    type="button"
                                    onClick={() => {
                                        setCustomDays(
                                            active
                                                ? customDays.filter((d) => d !== dow)
                                                : [...customDays, dow]
                                        )
                                        setError('')
                                    }}
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
            </div>

            {/* Date range — only meaningful when the import repeats */}
            {repeats && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Starts
                        </span>
                        <DatePicker
                            value={startDate || null}
                            onChange={(v: DatePickerValue) => {
                                setStartDate(typeof v === 'string' && v ? v : date)
                                setError('')
                            }}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Ends{' '}
                            <span className="normal-case font-normal text-neutral-300">
                                (optional)
                            </span>
                        </span>
                        <DatePicker
                            value={endsOn || null}
                            minDate={startDate}
                            placeholder="No end date"
                            onChange={(v: DatePickerValue) => {
                                setEndsOn(typeof v === 'string' && v ? v : '')
                                setError('')
                            }}
                        />
                    </div>
                </div>
            )}

            {repeats && (
                <p className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-xs font-medium text-neutral-500">
                    <i className="fa-solid fa-rotate text-neutral-400" aria-hidden="true" />
                    {repeatSummary()}
                </p>
            )}
        </div>
    )

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Import day plan"
            size="lg"
            footer={
                <>
                    <Button variant="secondary" size="sm" onClick={onClose} disabled={importing}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        icon="fa-solid fa-file-import"
                        onClick={handleImport}
                        disabled={importing || !text.trim()}
                    >
                        {importing ? 'Importing…' : 'Import'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Paste a JSON array of blocks to add to{' '}
                    <span className="font-semibold text-neutral-700">{dateLabel}</span>. Each block
                    needs a <code className="text-neutral-700">title</code>,{' '}
                    <code className="text-neutral-700">startTime</code> and{' '}
                    <code className="text-neutral-700">endTime</code> (HH:MM). An optional{' '}
                    <code className="text-neutral-700">category</code> can be one of:{' '}
                    {TIMEBOX_CATEGORIES.join(', ')}. Optional{' '}
                    <code className="text-neutral-700">notes</code> add detail to a block.
                </p>

                <textarea
                    value={text}
                    onChange={(e) => {
                        setText(e.target.value)
                        setError('')
                    }}
                    spellCheck={false}
                    rows={12}
                    placeholder={SAMPLE}
                    className="w-full resize-y rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-neutral-800 placeholder:text-neutral-300 focus:border-neutral-400 focus:bg-white focus:outline-none"
                    autoFocus
                />

                <button
                    type="button"
                    onClick={() => {
                        setText(SAMPLE)
                        setError('')
                    }}
                    className="self-start text-xs font-semibold text-neutral-400 hover:text-neutral-600"
                >
                    <i className="fa-solid fa-wand-magic-sparkles mr-1" aria-hidden="true" />
                    Insert sample
                </button>

                {/* Advanced — repeat this plan across many days */}
                <Accordion
                    items={[
                        {
                            title: repeats
                                ? `Advanced · repeats ${freq === 'weekdays' ? 'on weekdays' : freq}`
                                : 'Advanced · repeat & schedule',
                            content: advancedContent,
                        },
                    ]}
                />

                {error && (
                    <p className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                        {error}
                    </p>
                )}

                <p className="text-xs text-neutral-400">
                    <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
                    {repeats
                        ? 'Repeating blocks are added as a recurring series and skip overlap checks.'
                        : 'Blocks that overlap an existing block are skipped.'}
                </p>
            </div>
        </Modal>
    )
}
