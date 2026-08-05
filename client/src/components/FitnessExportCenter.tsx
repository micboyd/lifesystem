import { useCallback, useEffect, useMemo, useState } from 'react'
import Drawer from './Drawer'
import Button from './Button'
import Checkbox from './Checkbox'
import Spinner from './Spinner'
import { listExercises } from '../services/exercises'
import { listWorkouts } from '../services/workouts'
import { listSessions } from '../services/conditioning'
import { listMobility } from '../services/mobility'
import { listRecovery } from '../services/recovery'
import { listLogs as listWorkoutLogs } from '../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../services/conditioningLogs'
import type {
    Exercise,
    Workout,
    ConditioningSession,
    Mobility,
    Recovery,
    WorkoutLog,
    ConditioningLog,
} from '../types'

// ─── Datasets ───────────────────────────────────────────────────────────────────

/** Everything the export centre can pull, in display order. */
type DatasetKey =
    | 'exercises'
    | 'workouts'
    | 'conditioning'
    | 'mobility'
    | 'recovery'
    | 'workoutLogs'
    | 'conditioningLogs'

interface DatasetMeta {
    key: DatasetKey
    label: string
    hint: string
    icon: string
    group: 'Libraries' | 'Logs'
}

const DATASETS: DatasetMeta[] = [
    {
        key: 'exercises',
        label: 'Exercises',
        hint: 'Your strength exercise library.',
        icon: 'fa-dumbbell',
        group: 'Libraries',
    },
    {
        key: 'workouts',
        label: 'Workouts',
        hint: 'Strength workouts with their exercises, sets and reps.',
        icon: 'fa-clipboard-list',
        group: 'Libraries',
    },
    {
        key: 'conditioning',
        label: 'Conditioning sessions',
        hint: 'Cardio / interval sessions with their parts.',
        icon: 'fa-heart-pulse',
        group: 'Libraries',
    },
    {
        key: 'mobility',
        label: 'Mobility routines',
        hint: 'Mobility flows and circuits.',
        icon: 'fa-person-walking',
        group: 'Libraries',
    },
    {
        key: 'recovery',
        label: 'Recovery items',
        hint: 'Stretching, sauna, foam rolling and more.',
        icon: 'fa-spa',
        group: 'Libraries',
    },
    {
        key: 'workoutLogs',
        label: 'Workout log',
        hint: 'Completed strength workouts, by date.',
        icon: 'fa-calendar-check',
        group: 'Logs',
    },
    {
        key: 'conditioningLogs',
        label: 'Conditioning log',
        hint: 'Completed conditioning sessions, by date.',
        icon: 'fa-calendar-check',
        group: 'Logs',
    },
]

/** Loaded, in-memory copy of every dataset. */
interface Bundle {
    exercises: Exercise[]
    workouts: Workout[]
    conditioning: ConditioningSession[]
    mobility: Mobility[]
    recovery: Recovery[]
    workoutLogs: WorkoutLog[]
    conditioningLogs: ConditioningLog[]
}

// ─── Import-ready shaping ────────────────────────────────────────────────────────
// Each dataset is stripped of ids / order / timestamps so a top-level array can be
// pasted straight back into the matching importer.

function shapeExercises(rows: Exercise[]) {
    return rows.map((e) => ({ name: e.name, description: e.description }))
}

function shapeWorkouts(rows: Workout[], nameById: Map<string, string>) {
    return rows.map((w) => ({
        name: w.name,
        description: w.description,
        showInPlanner: w.showInPlanner,
        exercises: w.exercises.map((x) => ({
            name: nameById.get(x.exercise) ?? x.exercise,
            ...(x.sets != null ? { sets: x.sets } : {}),
            ...(x.reps ? { reps: x.reps } : {}),
        })),
    }))
}

function shapeParts(parts: ConditioningSession['parts']) {
    return parts.map((p) => ({
        name: p.name,
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.rounds ? { rounds: p.rounds } : {}),
        ...(p.rounds && p.roundLabel ? { roundLabel: p.roundLabel } : {}),
    }))
}

function shapeConditioning(rows: ConditioningSession[]) {
    return rows.map((s) => ({
        name: s.name,
        duration: s.duration,
        category: s.category,
        ...(s.purpose ? { purpose: s.purpose } : {}),
        parts: shapeParts(s.parts),
        ...(s.howToUse ? { howToUse: s.howToUse } : {}),
    }))
}

function shapeMobility(rows: Mobility[]) {
    return rows.map((m) => ({
        name: m.name,
        duration: m.duration,
        ...(m.purpose ? { purpose: m.purpose } : {}),
        parts: shapeParts(m.parts),
        ...(m.howToUse ? { howToUse: m.howToUse } : {}),
    }))
}

function shapeRecovery(rows: Recovery[]) {
    return rows.map((r) => ({
        name: r.name,
        duration: r.duration,
        ...(r.purpose ? { purpose: r.purpose } : {}),
        ...(r.notes ? { notes: r.notes } : {}),
    }))
}

function shapeWorkoutLogs(rows: WorkoutLog[]) {
    return rows.map((l) => ({
        name: l.name,
        date: l.date,
        exercises: l.exercises,
        ...(l.durationMin != null ? { durationMin: l.durationMin } : {}),
        ...(l.notes ? { notes: l.notes } : {}),
    }))
}

function shapeConditioningLogs(rows: ConditioningLog[]) {
    return rows.map((l) => ({
        name: l.name,
        category: l.category,
        date: l.date,
        duration: l.duration,
        ...(l.rpe != null ? { rpe: l.rpe } : {}),
        ...(l.notes ? { notes: l.notes } : {}),
    }))
}

/** Build the export payload for the chosen datasets. */
function buildPayload(bundle: Bundle, selected: Set<DatasetKey>): Record<string, unknown> {
    const nameById = new Map(bundle.exercises.map((e) => [e._id, e.name]))
    const out: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        source: 'AdminLife Fitness',
    }
    if (selected.has('exercises')) out.exercises = shapeExercises(bundle.exercises)
    if (selected.has('workouts')) out.workouts = shapeWorkouts(bundle.workouts, nameById)
    if (selected.has('conditioning')) out.conditioning = shapeConditioning(bundle.conditioning)
    if (selected.has('mobility')) out.mobility = shapeMobility(bundle.mobility)
    if (selected.has('recovery')) out.recovery = shapeRecovery(bundle.recovery)
    if (selected.has('workoutLogs')) out.workoutLogs = shapeWorkoutLogs(bundle.workoutLogs)
    if (selected.has('conditioningLogs'))
        out.conditioningLogs = shapeConditioningLogs(bundle.conditioningLogs)
    return out
}

const LIBRARY_KEYS: DatasetKey[] = ['exercises', 'workouts', 'conditioning', 'mobility', 'recovery']

// ─── Component ──────────────────────────────────────────────────────────────────

export default function FitnessExportCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [bundle, setBundle] = useState<Bundle | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    // Default: every library selected, logs left off.
    const [selected, setSelected] = useState<Set<DatasetKey>>(new Set(LIBRARY_KEYS))
    const [copied, setCopied] = useState(false)

    // Lazy-load everything the first time the drawer opens.
    useEffect(() => {
        if (!open || bundle || loading) return
        setLoading(true)
        setError(null)
        Promise.all([
            listExercises(),
            listWorkouts(),
            listSessions(),
            listMobility(),
            listRecovery(),
            listWorkoutLogs(),
            listConditioningLogs(),
        ])
            .then(([exercises, workouts, conditioning, mobility, recovery, workoutLogs, conditioningLogs]) =>
                setBundle({
                    exercises,
                    workouts,
                    conditioning,
                    mobility,
                    recovery,
                    workoutLogs,
                    conditioningLogs,
                })
            )
            .catch(() => setError('Could not load your fitness data. Please try again.'))
            .finally(() => setLoading(false))
    }, [open, bundle, loading])

    const counts = useMemo<Record<DatasetKey, number>>(
        () => ({
            exercises: bundle?.exercises.length ?? 0,
            workouts: bundle?.workouts.length ?? 0,
            conditioning: bundle?.conditioning.length ?? 0,
            mobility: bundle?.mobility.length ?? 0,
            recovery: bundle?.recovery.length ?? 0,
            workoutLogs: bundle?.workoutLogs.length ?? 0,
            conditioningLogs: bundle?.conditioningLogs.length ?? 0,
        }),
        [bundle]
    )

    const toggle = useCallback((key: DatasetKey) => {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }, [])

    const selectedKeys = DATASETS.map((d) => d.key).filter((k) => selected.has(k))
    const totalRows = selectedKeys.reduce((sum, k) => sum + counts[k], 0)
    const canExport = !!bundle && selectedKeys.length > 0

    const json = useMemo(
        () => (bundle ? JSON.stringify(buildPayload(bundle, selected), null, 2) : ''),
        [bundle, selected]
    )

    function filename() {
        const day = new Date().toISOString().slice(0, 10)
        // A single-dataset export gets a specific name; a mixed one is generic.
        const stem = selectedKeys.length === 1 ? selectedKeys[0] : 'export'
        return `fitness-${stem}-${day}.json`
    }

    function download() {
        if (!canExport) return
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename()
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

    const groups: DatasetMeta['group'][] = ['Libraries', 'Logs']

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="xl"
            title="Fitness export centre"
            footer={
                <>
                    <Button variant="ghost" icon="fa-solid fa-copy" onClick={copy} disabled={!canExport}>
                        {copied ? 'Copied' : 'Copy JSON'}
                    </Button>
                    <Button icon="fa-solid fa-download" onClick={download} disabled={!canExport}>
                        Download{selectedKeys.length ? ` (${totalRows})` : ''}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <p className="text-sm text-neutral-500">
                    Choose what to export. Each section downloads as a top-level array in one JSON
                    file — and matches the matching importer, so you can paste any section straight
                    back in.
                </p>

                {loading && (
                    <div className="flex items-center gap-3 text-sm text-neutral-500">
                        <Spinner /> Loading your fitness data…
                    </div>
                )}

                {error && (
                    <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-700 ring-1 ring-rose-600/20">
                        {error}
                    </p>
                )}

                {bundle && (
                    <>
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {selectedKeys.length} of {DATASETS.length} selected
                            </span>
                            <div className="flex gap-1">
                                <button
                                    type="button"
                                    onClick={() => setSelected(new Set(DATASETS.map((d) => d.key)))}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                                >
                                    Select all
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelected(new Set())}
                                    className="rounded-lg px-2 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>

                        {groups.map((group) => (
                            <section key={group} className="flex flex-col gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    {group}
                                </p>
                                {DATASETS.filter((d) => d.group === group).map((d) => {
                                    const on = selected.has(d.key)
                                    const empty = counts[d.key] === 0
                                    return (
                                        <label
                                            key={d.key}
                                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                                                on
                                                    ? 'border-coral-200 bg-coral-50/50'
                                                    : 'border-neutral-200 hover:bg-neutral-50'
                                            }`}
                                        >
                                            <Checkbox
                                                checked={on}
                                                onChange={() => toggle(d.key)}
                                            />
                                            <span
                                                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                                                    on
                                                        ? 'bg-coral-100 text-coral-600'
                                                        : 'bg-neutral-100 text-neutral-400'
                                                }`}
                                            >
                                                <i className={`fa-solid ${d.icon}`} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="font-semibold text-neutral-900">
                                                        {d.label}
                                                    </span>
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                                            empty
                                                                ? 'bg-neutral-100 text-neutral-400'
                                                                : 'bg-neutral-900 text-white'
                                                        }`}
                                                    >
                                                        {counts[d.key]}
                                                    </span>
                                                </span>
                                                <span className="mt-0.5 block text-xs text-neutral-500">
                                                    {d.hint}
                                                </span>
                                            </span>
                                        </label>
                                    )
                                })}
                            </section>
                        ))}
                    </>
                )}
            </div>
        </Drawer>
    )
}
