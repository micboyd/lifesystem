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
import { addDays, formatWeekRange } from '../lib/calendar'
import {
    buildPlannerExport,
    countEntries,
    exportFilename,
    logKey,
    weekRangeFor,
    DEFAULT_EXPORT_OPTIONS,
    type PlannerExportOptions,
} from '../lib/plannerExport'

// ─── Range presets ──────────────────────────────────────────────────────────────

type PresetKey = 'week' | 'four' | 'twelve' | 'custom'

const PRESETS: { key: PresetKey; label: string; weeks?: number }[] = [
    { key: 'week', label: 'This week', weeks: 1 },
    { key: 'four', label: '4 weeks', weeks: 4 },
    { key: 'twelve', label: '12 weeks', weeks: 12 },
    { key: 'custom', label: 'Custom' },
]

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
        key: 'details',
        label: 'Item details',
        hint: 'Expands each item into its sets and reps, or its parts.',
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
    doneKeys: Set<string>
    exercisesById: Map<string, Exercise>
}

/**
 * Exports the planner as it currently stands — the items sitting on each day and
 * slot of a range of weeks, with their flags and completion. This is the state,
 * not the training plan: a plan is the template that places items, and lives in
 * the Plans tab; what came out of it, and everything changed by hand since, is
 * what this writes out.
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
    const [options, setOptions] = useState<PlannerExportOptions>(DEFAULT_EXPORT_OPTIONS)
    const [loaded, setLoaded] = useState<Loaded | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [copied, setCopied] = useState(false)

    const customRange: DateRange = custom ?? { start: weekStart, end: addDays(weekStart, 6) }

    // The range on offer, always widened to whole Monday–Sunday weeks so a week
    // is never exported half-full.
    const range = useMemo(() => {
        const weeks = PRESETS.find((p) => p.key === preset)?.weeks
        if (weeks) return weekRangeFor(weekStart, addDays(weekStart, weeks * 7 - 1))
        return weekRangeFor(customRange.start, customRange.end || customRange.start)
    }, [preset, customRange.start, customRange.end, weekStart])

    // Load the range from the server rather than reusing the grid's copy: the
    // planner saves every change as it is made, so the server is the state on
    // screen, and a range wider than one week was never loaded anyway.
    useEffect(() => {
        if (!open) return
        if (loaded && loaded.start === range.start && loaded.end === range.end) return
        let active = true
        setLoading(true)
        setError(null)
        const inRange = (date: string) => date >= range.start && date <= range.end
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
                const doneKeys = new Set<string>()
                for (const l of wLogs)
                    if (l.workout && inRange(l.date))
                        doneKeys.add(logKey('workout', l.workout, l.date))
                for (const l of cLogs)
                    if (l.session && inRange(l.date))
                        doneKeys.add(logKey('conditioning', l.session, l.date))
                for (const l of mLogs)
                    if (l.mobility && inRange(l.date))
                        doneKeys.add(logKey('mobility', l.mobility, l.date))
                for (const l of rLogs)
                    if (l.recovery && inRange(l.date))
                        doneKeys.add(logKey('recovery', l.recovery, l.date))
                setLoaded({
                    start: range.start,
                    end: range.end,
                    entries,
                    notes,
                    doneKeys,
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
                        Download{canExport ? ` (${total})` : ''}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    The planner exactly as it stands — what sits on each day and slot, with its
                    flags and what has been done. This is the state, not a plan: applying a plan is
                    one of the things that put items here.
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
                                {total} item{total === 1 ? '' : 's'} · {weekCount} week
                                {weekCount === 1 ? '' : 's'}
                            </p>
                        </div>
                        {total === 0 && !options.emptyDays ? (
                            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-500 ring-1 ring-neutral-200">
                                Nothing planned in this range — pick a wider one, or keep empty days
                                to export the bare dates.
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
