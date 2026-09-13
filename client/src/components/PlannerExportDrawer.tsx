import { useEffect, useMemo, useState } from 'react'
import Drawer from './Drawer'
import Button from './Button'
import Checkbox from './Checkbox'
import Spinner from './Spinner'
import DatePicker, { type DateRange, type DatePickerValue } from './DatePicker'
import { listPlanEntries, listPlanNotes } from '../services/fitnessPlan'
import { listExercises } from '../services/exercises'
import { listLogs as listWorkoutLogs } from '../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../services/conditioningLogs'
import { listLogs as listMobilityLogs } from '../services/mobilityLogs'
import { listLogs as listRecoveryLogs } from '../services/recoveryLogs'
import type { Exercise, FitnessPlanEntry, FitnessPlanNote } from '../types'
import {
    addDays,
    dateKey,
    daysInMonth,
    formatMonthRange,
    formatWeekRange,
    monthKeyOf,
} from '../lib/calendar'
import {
    buildPlannerExport,
    countCompleted,
    countEntries,
    exportFilename,
    weekRangeFor,
    DEFAULT_EXPORT_OPTIONS,
    type PlannerExportLogs,
    type PlannerExportOptions,
} from '../lib/plannerExport'

// ─── Range presets ──────────────────────────────────────────────────────────────

type PresetKey =
    | 'week'
    | 'four'
    | 'twelve'
    | 'lastFour'
    | 'lastTwelve'
    | 'months'
    | 'custom'

/** `back` counts the weeks backwards from the planner's week instead of forwards. */
const PRESETS: { key: PresetKey; label: string; weeks?: number; back?: true }[] = [
    { key: 'week', label: 'This week', weeks: 1 },
    { key: 'four', label: 'Next 4 weeks', weeks: 4 },
    { key: 'twelve', label: 'Next 12 weeks', weeks: 12 },
    { key: 'lastFour', label: 'Last 4 weeks', weeks: 4, back: true },
    { key: 'lastTwelve', label: 'Last 12 weeks', weeks: 12, back: true },
    { key: 'months', label: 'Months' },
    { key: 'custom', label: 'Custom' },
]

/** The first day of a "YYYY-MM" month key. */
function monthFirst(month: string): string {
    return `${month}-01`
}

/** The last day of a "YYYY-MM" month key. */
function monthLast(month: string): string {
    const [year, m] = month.split('-').map(Number)
    return dateKey(year, m - 1, daysInMonth(year, m - 1))
}

// ─── Option toggles ─────────────────────────────────────────────────────────────

const TOGGLES: { key: keyof PlannerExportOptions; label: string; hint: string }[] = [
    {
        key: 'flags',
        label: 'Day and week flags',
        hint: 'The coloured labels — "Deload", "Race week" and the like.',
    },
    {
        key: 'completion',
        label: 'Completion',
        hint: 'Marks each item done or not, from the logs for its day.',
    },
    {
        key: 'logs',
        label: 'Completed sessions',
        hint: 'Everything actually done each day — including sessions never planned.',
    },
    {
        key: 'details',
        label: 'Item details',
        hint: 'Expands each item into its sets and reps, and each completed session into the sets and rounds performed.',
    },
    {
        key: 'emptyDays',
        label: 'Empty days',
        hint: 'Keeps every date in the range, even the ones with nothing on.',
    },
]

/** Everything loaded for the chosen range. */
interface Loaded {
    start: string
    end: string
    entries: FitnessPlanEntry[]
    notes: FitnessPlanNote[]
    logs: PlannerExportLogs
    exercisesById: Map<string, Exercise>
}

/**
 * Exports the planner as it currently stands — the items sitting on each day and
 * slot of a range of weeks, with their flags, and what was actually done. This is
 * the state, not the training plan: a plan is the template that places items, and
 * lives in the Plans tab; what came out of it, and everything changed by hand
 * since, is what this writes out.
 *
 * The range runs backwards as readily as forwards, by weeks or by whole months,
 * so a past stretch can be pulled out for analysis alongside a planned one.
 */
export default function PlannerExportDrawer({
    open,
    onClose,
    weekStart,
}: {
    open: boolean
    onClose: () => void
    /** Monday of the week the planner is showing — where the range starts. */
    weekStart: string
}) {
    const [preset, setPreset] = useState<PresetKey>('week')
    // Null until a custom range is actually picked, so the default keeps tracking
    // the week the planner is on rather than the one it was on at first render.
    const [custom, setCustom] = useState<DateRange | null>(null)
    // Likewise for the month range, which defaults to the month the planner is in.
    const [months, setMonths] = useState<DateRange | null>(null)
    const [options, setOptions] = useState<PlannerExportOptions>(DEFAULT_EXPORT_OPTIONS)
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const customRange: DateRange = custom ?? { start: weekStart, end: addDays(weekStart, 6) }
    const monthRange: DateRange = months ?? {
        start: monthKeyOf(weekStart),
        end: monthKeyOf(weekStart),
    }

    // The range on offer, always widened to whole Monday–Sunday weeks so a week
    // is never exported half-full — which means a month range spills a few days
    // into its neighbours rather than cutting a week in half.
    const range = useMemo(() => {
        const p = PRESETS.find((x) => x.key === preset)
        if (p?.weeks) {
            // A backwards preset ends with the week the planner is on, so "last 12
            // weeks" is the twelve up to and including now.
            return p.back
                ? weekRangeFor(addDays(weekStart, -(p.weeks - 1) * 7), addDays(weekStart, 6))
                : weekRangeFor(weekStart, addDays(weekStart, p.weeks * 7 - 1))
        }
        if (preset === 'months')
            return weekRangeFor(monthFirst(monthRange.start), monthLast(monthRange.end))
        return weekRangeFor(customRange.start, customRange.end || customRange.start)
    }, [preset, customRange.start, customRange.end, monthRange.start, monthRange.end, weekStart])

    // Load the range from the server rather than reusing the grid's copy: the
    // planner saves every change as it is made, so the server is the state on
    // screen, and a range wider than one week was never loaded anyway.
    useEffect(() => {
        if (!open) return
        if (loaded && loaded.start === range.start && loaded.end === range.end) return
        let active = true
        setLoading(true)
        setError(null)
        Promise.all([
            listPlanEntries(range.start, range.end),
            listPlanNotes(range.start, range.end),
            listExercises().catch(() => [] as Exercise[]),
            listWorkoutLogs().catch(() => []),
            listConditioningLogs().catch(() => []),
            listMobilityLogs().catch(() => []),
            listRecoveryLogs().catch(() => []),
        ])
            .then(([entries, notes, exercises, wLogs, cLogs, mLogs, rLogs]) => {
                if (!active) return
                setLoaded({
                    start: range.start,
                    end: range.end,
                    entries,
                    notes,
                    // Handed over whole: the builder narrows them to the range and
                    // decides what counts as done.
                    logs: {
                        workout: wLogs,
                        conditioning: cLogs,
                        mobility: mLogs,
                        recovery: rLogs,
                    },
                    exercisesById: new Map(exercises.map((e) => [e._id, e])),
                })
            })
            .catch(() => active && setError('Could not load the planner. Please try again.'))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [open, range.start, range.end, loaded])

    const payload = useMemo(() => {
        if (!loaded) return null
        return buildPlannerExport({ ...loaded, options })
    }, [loaded, options])

    const json = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload])
    const total = payload ? countEntries(payload) : 0
    const completed = payload ? countCompleted(payload) : 0
    const canExport = !!payload && !loading

    function toggle(key: keyof PlannerExportOptions) {
        setOptions((prev) => ({ ...prev, [key]: !prev[key] }))
    }

    function download() {
        if (!payload) return
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = exportFilename(payload)
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

    const weekCount = payload?.weeks.length ?? 0

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="xl"
            title="Export planner"
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
                        Download{canExport ? ` (${total + completed})` : ''}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    The planner exactly as it stands — what sits on each day and slot, with its
                    flags and what was actually done. This is the state, not a plan: applying a
                    plan is one of the things that put items here. Ranges run backwards as well as
                    forwards, so a past stretch comes out alongside a planned one.
                </p>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Range
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {PRESETS.map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => setPreset(p.key)}
                                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    preset === p.key
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                    {preset === 'months' && (
                        <DatePicker
                            mode="range"
                            precision="month"
                            value={monthRange}
                            onChange={(v: DatePickerValue) => {
                                if (v && typeof v === 'object' && 'start' in v) {
                                    const r = v as DateRange
                                    // Mid-selection the end comes back empty; hold
                                    // the old one so the range stays valid.
                                    setMonths({
                                        start: r.start || monthRange.start,
                                        end: r.end || r.start || monthRange.end,
                                    })
                                }
                            }}
                        />
                    )}
                    {preset === 'custom' && (
                        <DatePicker
                            mode="range"
                            value={customRange}
                            onChange={(v: DatePickerValue) => {
                                if (v && typeof v === 'object' && 'start' in v) {
                                    const r = v as DateRange
                                    // Mid-selection the end comes back empty; hold
                                    // the old one so the range stays valid.
                                    setCustom({
                                        start: r.start || customRange.start,
                                        end: r.end || r.start || customRange.end,
                                    })
                                }
                            }}
                        />
                    )}
                    <p className="text-xs text-neutral-500">
                        {preset === 'months' && (
                            <>{formatMonthRange(monthRange.start, monthRange.end)} · </>
                        )}
                        {formatWeekRange(range.start, range.end)} — whole weeks, Monday to Sunday.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Include
                    </p>
                    {TOGGLES.map((t) => (
                        <label
                            key={t.key}
                            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                                options[t.key]
                                    ? 'border-coral-200 bg-coral-50/50'
                                    : 'border-neutral-200 hover:bg-neutral-50'
                            }`}
                        >
                            <span className="pt-0.5">
                                <Checkbox checked={options[t.key]} onChange={() => toggle(t.key)} />
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
                    ))}
                </section>

                {loading && (
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <Spinner /> Loading the planner…
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
                                {total} planned
                                {options.logs ? ` · ${completed} completed` : ''} · {weekCount} week
                                {weekCount === 1 ? '' : 's'}
                            </p>
                        </div>
                        {total === 0 && completed === 0 && !options.emptyDays ? (
                            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-500 ring-1 ring-neutral-200">
                                Nothing planned or logged in this range — pick a wider one, or keep
                                empty days to export the bare dates.
                            </p>
                        ) : (
                            <pre className="max-h-72 overflow-auto rounded-xl bg-neutral-900 p-3 text-[11px] leading-relaxed text-neutral-100">
                                {json}
                            </pre>
                        )}
                    </section>
                )}
            </div>
        </Drawer>
    )
}
