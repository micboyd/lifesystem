import { useEffect, useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Checkbox from '../Checkbox'
import Spinner from '../Spinner'
import DatePicker, { type DatePickerValue } from '../DatePicker'
import { listEvents } from '../../services/events'
import { listCalendars } from '../../services/calendars'
import { listStatuses } from '../../services/dayStatus'
import { listMonthNotes } from '../../services/monthNotes'
import { listReminders } from '../../services/reminders'
import { listBirthdays } from '../../services/birthdays'
import type { Birthday, Calendar, DayStatus, Event, MonthNote, Reminder } from '../../types'
import { formatMonthRange, monthKeyOf, todayKey } from '../../lib/calendar'
import {
    buildCalendarExport,
    calendarExportFilename,
    monthsRange,
    DEFAULT_CALENDAR_EXPORT_OPTIONS,
    type CalendarExportOptions,
} from '../../lib/calendarExport'

const MONTH_PRESETS = [1, 3, 6, 12]
const MAX_MONTHS = 24

const TOGGLES: { key: keyof CalendarExportOptions; label: string; hint: string }[] = [
    {
        key: 'days',
        label: 'Day-by-day breakdown',
        hint: 'Every date with what is on and which of morning, afternoon and evening are free.',
    },
    {
        key: 'emptyDays',
        label: 'Empty days',
        hint: 'Keep dates with nothing on in the breakdown — that is the open time to plan into.',
    },
    {
        key: 'details',
        label: 'Event details',
        hint: 'Notes and location on each event.',
    },
    {
        key: 'hiddenCalendars',
        label: 'Hidden calendars',
        hint: 'Events on calendars switched off in the filter bar.',
    },
    { key: 'reminders', label: 'Reminders', hint: 'The reminders pinned to each day.' },
    { key: 'birthdays', label: 'Birthdays', hint: 'Whose birthday falls on each day.' },
]

interface Loaded {
    start: string
    end: string
    events: Event[]
    calendars: Calendar[]
    statuses: DayStatus[]
    monthNotes: MonthNote[]
    reminders: Reminder[]
    birthdays: Birthday[]
}

/**
 * Exports a run of whole months of the calendar as JSON — events, leave, month
 * flags, reminders and birthdays, plus a day-by-day view of what is booked and
 * what is free — so plans can be built around what is already committed.
 */
export default function CalendarExportDrawer({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    const [startMonth, setStartMonth] = useState(() => monthKeyOf(todayKey()))
    const [months, setMonths] = useState(3)
    const [options, setOptions] = useState<CalendarExportOptions>(DEFAULT_CALENDAR_EXPORT_OPTIONS)
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const range = useMemo(() => monthsRange(startMonth, months), [startMonth, months])

    useEffect(() => {
        if (!open) return
        if (loaded && loaded.start === range.start && loaded.end === range.end) return
        let active = true
        setLoading(true)
        setError(null)
        Promise.all([
            listEvents(range.start, range.end),
            listCalendars(),
            listStatuses(range.start, range.end),
            listMonthNotes(range.start.slice(0, 7), range.end.slice(0, 7)),
            listReminders(range.start, range.end).catch(() => [] as Reminder[]),
            listBirthdays().catch(() => [] as Birthday[]),
        ])
            .then(([events, calendars, statuses, monthNotes, reminders, birthdays]) => {
                if (!active) return
                setLoaded({
                    start: range.start,
                    end: range.end,
                    events,
                    calendars,
                    statuses,
                    monthNotes,
                    reminders,
                    birthdays,
                })
            })
            .catch(() => active && setError('Could not load the calendar. Please try again.'))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [open, range.start, range.end, loaded])

    const payload = useMemo(() => {
        if (!loaded || loaded.start !== range.start || loaded.end !== range.end) return null
        return buildCalendarExport({ ...loaded, startMonth, months, options })
    }, [loaded, range.start, range.end, startMonth, months, options])

    const json = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload])
    const canExport = !!payload && !loading

    function toggle(key: keyof CalendarExportOptions) {
        setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    function download() {
        if (!payload) return
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = calendarExportFilename(payload)
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    async function copy() {
        if (!canExport) return
        try {
            await navigator.clipboard.writeText(json)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
        } catch {
            /* clipboard blocked — the download button still works */
        }
    }

    const endMonth = range.end.slice(0, 7)

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="xl"
            title="Export calendar"
            footer={
                <>
                    <Button
                        variant="ghost"
                        icon="fa-solid fa-copy"
                        onClick={copy}
                        disabled={!canExport}
                    >
                        {copied ? 'Copied' : 'Copy JSON'}
                    </Button>
                    <Button icon="fa-solid fa-download" onClick={download} disabled={!canExport}>
                        Download
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    Whole months of the calendar as JSON — events, leave, month flags, reminders and
                    birthdays, with a day-by-day view of what is booked and which slots are free.
                    Hand it to whatever is drafting a plan so it works around what is already
                    committed.
                </p>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Starting
                    </p>
                    <DatePicker
                        precision="month"
                        value={startMonth}
                        onChange={(v: DatePickerValue) => {
                            if (typeof v === 'string' && v) setStartMonth(v.slice(0, 7))
                        }}
                    />
                </section>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Months
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                        {MONTH_PRESETS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => setMonths(n)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    months === n
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                {n}
                            </button>
                        ))}
                        <input
                            type="number"
                            min={1}
                            max={MAX_MONTHS}
                            value={months}
                            onChange={(e) => {
                                const n = Math.round(Number(e.target.value))
                                if (Number.isFinite(n))
                                    setMonths(Math.min(MAX_MONTHS, Math.max(1, n)))
                            }}
                            aria-label="Number of months"
                            className="w-20 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm"
                        />
                    </div>
                    <p className="text-xs text-neutral-500">
                        {formatMonthRange(startMonth, endMonth)} · {range.start} to {range.end}
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Include
                    </p>
                    {TOGGLES.map((t) => {
                        const disabled = t.key === 'emptyDays' && !options.days
                        return (
                            <label
                                key={t.key}
                                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                                    disabled ? 'pointer-events-none opacity-50' : ''
                                } ${
                                    options[t.key]
                                        ? 'border-coral-200 bg-coral-50/50'
                                        : 'border-neutral-200 hover:bg-neutral-50'
                                }`}
                            >
                                <span className="pt-0.5">
                                    <Checkbox
                                        checked={options[t.key]}
                                        onChange={() => toggle(t.key)}
                                    />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block font-semibold text-neutral-900">
                                        {t.label}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-neutral-500">
                                        {t.hint}
                                    </span>
                                </span>
                            </label>
                        )
                    })}
                </section>

                {loading && (
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <Spinner /> Loading the calendar…
                    </div>
                )}

                {error && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/20">
                        {error}
                    </p>
                )}

                {payload && !loading && (
                    <section className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Preview
                            </p>
                            <p className="text-xs text-neutral-500">
                                {payload.summary.events} event
                                {payload.summary.events === 1 ? '' : 's'} ·{' '}
                                {payload.summary.fullyFreeDays} free days ·{' '}
                                {payload.summary.freeWeekends.length} free weekends
                            </p>
                        </div>
                        <pre className="max-h-72 overflow-auto rounded-xl bg-neutral-900 p-3 text-[11px] leading-relaxed text-neutral-100">
                            {json}
                        </pre>
                    </section>
                )}
            </div>
        </Drawer>
    )
}
