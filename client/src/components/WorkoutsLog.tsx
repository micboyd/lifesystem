import { useEffect, useMemo, useState } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Textarea from './Textarea'
import Select from './Select'
import EmptyState from './EmptyState'
import DropdownMenu from './DropdownMenu'
import Drawer from './Drawer'
import DatePicker from './DatePicker'
import Pagination from './Pagination'
import LineIcon from './LineIcon'
import LogFilterBar, { useLogFilters } from './LogFilterBar'
import { todayKey } from '../lib/calendar'
import { formatLogDate, weekStartMonday } from '../lib/logFilters'
import { listWorkouts } from '../services/workouts'
import { listLogs, createLog, updateLog, deleteLog, type WorkoutLogInput } from '../services/workoutLogs'
import type { LoggedSet, Workout, WorkoutLog, WorkoutLogExercise } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** How many exercise chips a collapsed row shows before it says "+N more". */
const CHIP_LIMIT = 6

function todayISO(): string {
    return todayKey()
}

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
function formatSetsReps(e: WorkoutLogExercise): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

/** One performed set as "60kg × 8", "60kg", or "8" — whatever was recorded. */
function formatSet(s: LoggedSet): string {
    if (s.weight != null && s.reps != null) return `${s.weight}kg × ${s.reps}`
    if (s.weight != null) return `${s.weight}kg`
    if (s.reps != null) return `${s.reps} reps`
    return ''
}

/** Heaviest set performed on an exercise — what a collapsed row is worth showing. */
function topSet(e: WorkoutLogExercise): LoggedSet | undefined {
    let best: LoggedSet | undefined
    for (const s of e.loggedSets ?? []) {
        if (s.weight == null && s.reps == null) continue
        if (!best) {
            best = s
            continue
        }
        const bw = best.weight ?? -1
        const sw = s.weight ?? -1
        if (sw > bw || (sw === bw && (s.reps ?? 0) > (best.reps ?? 0))) best = s
    }
    return best
}

/** Total training volume (Σ weight × reps) recorded across a log, in kg. */
function logVolume(log: WorkoutLog): number {
    let total = 0
    for (const e of log.exercises) {
        for (const s of e.loggedSets ?? []) {
            if (s.weight != null && s.reps != null) total += s.weight * s.reps
        }
    }
    return Math.round(total)
}

// ─── Workouts log ─────────────────────────────────────────────────────────────────

type Drawered =
    | { mode: 'create' }
    | { mode: 'edit'; log: WorkoutLog }
    | null

/**
 * The Workouts view is a log of completed strength workouts. Each entry is
 * recorded against a library workout, snapshotting its name and exercise lines.
 *
 * The history grows without bound, so it's filtered and paged ten at a time by
 * the shared log controls; rows collapse to a chip summary and open to the full
 * set-by-set breakdown.
 */
export default function WorkoutsLog() {
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<WorkoutLog[]>([])
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)

    const controls = useLogFilters(logs, {
        haystack: (l) => [l.notes, ...l.exercises.map((e) => e.name)],
    })

    useEffect(() => {
        Promise.all([listLogs(), listWorkouts()])
            .then(([lg, wk]) => {
                setLogs(lg)
                setWorkouts(wk)
            })
            .finally(() => setLoading(false))
    }, [])

    async function handleAdd(fields: WorkoutLogInput) {
        const log = await createLog(fields)
        setLogs((prev) => sortLogs([log, ...prev]))
    }

    async function handleSave(id: string, fields: WorkoutLogInput) {
        const updated = await updateLog(id, fields)
        setLogs((prev) => sortLogs(prev.map((l) => (l._id === id ? updated : l))))
    }

    async function handleDelete(id: string) {
        setLogs((prev) => prev.filter((l) => l._id !== id))
        await deleteLog(id)
    }

    // This-week summary, derived from the whole log rather than the filtered view —
    // it's a training readout, not a description of what's on screen.
    const summary = useMemo(() => {
        const start = weekStartMonday(todayISO())
        const thisWeek = logs.filter((l) => l.date >= start)
        return {
            count: thisWeek.length,
            minutes: thisWeek.reduce((sum, l) => sum + (l.durationMin || 0), 0),
            volume: thisWeek.reduce((sum, l) => sum + logVolume(l), 0),
        }
    }, [logs])

    const hasHistory = logs.length > 0

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                {hasHistory ? (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-neutral-500">
                        <span>
                            <span className="font-semibold text-neutral-900">{summary.count}</span>{' '}
                            {summary.count === 1 ? 'workout' : 'workouts'} this week
                        </span>
                        {summary.minutes > 0 && (
                            <span>
                                <i
                                    className="fa-regular fa-clock mr-1.5 text-neutral-300"
                                    aria-hidden="true"
                                />
                                <span className="font-semibold text-neutral-900">
                                    {summary.minutes}
                                </span>{' '}
                                min
                            </span>
                        )}
                        {summary.volume > 0 && (
                            <span>
                                <i
                                    className="fa-solid fa-weight-hanging mr-1.5 text-neutral-300"
                                    aria-hidden="true"
                                />
                                <span className="font-semibold text-neutral-900">
                                    {summary.volume.toLocaleString()}
                                </span>{' '}
                                kg
                            </span>
                        )}
                    </div>
                ) : (
                    <span />
                )}
                <Button
                    icon="fa-solid fa-plus"
                    onClick={() => setDrawer({ mode: 'create' })}
                    disabled={!loading && workouts.length === 0}
                >
                    Log workout
                </Button>
            </div>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : workouts.length === 0 && !hasHistory ? (
                <EmptyState
                    icon="fa-solid fa-dumbbell"
                    title="No workouts to log"
                    description="Build a workout in your Workouts Library first, then record it here once completed — or hit Done from a workout."
                />
            ) : !hasHistory ? (
                <EmptyState
                    icon="fa-solid fa-clipboard-check"
                    title="No workouts logged yet"
                    description="Completed a session? Record it — or press Done on a workout — to build your training history."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            Log workout
                        </Button>
                    }
                />
            ) : (
                <div className="flex flex-col gap-4">
                    <LogFilterBar
                        controls={controls}
                        searchPlaceholder="Search workouts, exercises, notes…"
                        nameLabel="All workouts"
                        nameIcon="fa-solid fa-dumbbell"
                        noun="logged workout"
                    />

                    {controls.filtered.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-magnifying-glass"
                            title="No matches"
                            description="No logged workouts match these filters."
                            action={
                                <Button variant="secondary" onClick={controls.clear}>
                                    Clear filters
                                </Button>
                            }
                        />
                    ) : (
                        <>
                            <div className="flex flex-col gap-6">
                                {controls.grouped.map(([date, dayLogs]) => (
                                    <section key={date} className="flex flex-col gap-2">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            {formatLogDate(date, todayISO())}
                                        </p>
                                        <div className="flex flex-col gap-2">
                                            {dayLogs.map((log) => (
                                                <LogRow
                                                    key={log._id}
                                                    log={log}
                                                    onEdit={() => setDrawer({ mode: 'edit', log })}
                                                    onDelete={() => handleDelete(log._id)}
                                                />
                                            ))}
                                        </div>
                                    </section>
                                ))}
                            </div>

                            <Pagination
                                page={controls.page}
                                pageCount={controls.pageCount}
                                onChange={controls.setPage}
                                className="mt-2 justify-center"
                            />
                        </>
                    )}
                </div>
            )}

            <LogFormDrawer
                form={drawer}
                workouts={workouts}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

function sortLogs(logs: WorkoutLog[]): WorkoutLog[] {
    return [...logs].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
    )
}

// ─── Log row ──────────────────────────────────────────────────────────────────────

/**
 * One logged session. Collapsed it's a single scannable line — name, totals and
 * a chip per exercise with its top set. Expanding it itemises every set.
 */
function LogRow({
    log,
    onEdit,
    onDelete,
}: {
    log: WorkoutLog
    onEdit: () => void
    onDelete: () => void
}) {
    const [open, setOpen] = useState(false)

    const hasWeights = log.exercises.some((e) => e.loggedSets && e.loggedSets.length > 0)
    const volume = hasWeights ? logVolume(log) : 0
    // Notes make a row worth opening too — collapsed they're clamped to two lines.
    const expandable = log.exercises.length > 0 || !!log.notes
    const chips = log.exercises.slice(0, CHIP_LIMIT)
    const hidden = log.exercises.length - chips.length

    return (
        <Card as="div" hover={false} className="!p-0">
            <div className="flex items-start gap-2 p-4">
                <button
                    type="button"
                    onClick={() => expandable && setOpen((o) => !o)}
                    aria-expanded={expandable ? open : undefined}
                    className={[
                        'flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left',
                        expandable ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                >
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <p className="font-semibold text-neutral-900">{log.name}</p>
                            <span className="text-xs text-neutral-400">
                                <i className="fa-solid fa-dumbbell mr-1" aria-hidden="true" />
                                {log.exercises.length}{' '}
                                {log.exercises.length === 1 ? 'exercise' : 'exercises'}
                            </span>
                            {volume > 0 && (
                                <span className="text-xs text-neutral-400">
                                    <i
                                        className="fa-solid fa-weight-hanging mr-1"
                                        aria-hidden="true"
                                    />
                                    {volume.toLocaleString()} kg
                                </span>
                            )}
                            {log.durationMin != null && log.durationMin > 0 && (
                                <span className="text-xs text-neutral-400">
                                    <i className="fa-regular fa-clock mr-1" aria-hidden="true" />
                                    {log.durationMin} min
                                </span>
                            )}
                        </div>

                        {log.exercises.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {chips.map((ex, i) => {
                                    const best = topSet(ex)
                                    const detail = best ? formatSet(best) : formatSetsReps(ex)
                                    return (
                                        <span
                                            key={i}
                                            className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                                        >
                                            {ex.name}
                                            {detail && (
                                                <span
                                                    className={
                                                        best
                                                            ? 'font-semibold tabular-nums text-coral-600'
                                                            : 'text-coral-600'
                                                    }
                                                >
                                                    {detail}
                                                </span>
                                            )}
                                        </span>
                                    )
                                })}
                                {hidden > 0 && (
                                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium text-neutral-400">
                                        +{hidden} more
                                    </span>
                                )}
                            </div>
                        )}

                        {!open && log.notes && (
                            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-neutral-500">
                                {log.notes}
                            </p>
                        )}
                    </div>

                    {expandable && (
                        <i
                            className={[
                                'fa-solid fa-chevron-down mt-1 shrink-0 text-xs text-neutral-300 transition-transform duration-150',
                                open ? 'rotate-180' : '',
                            ].join(' ')}
                            aria-hidden="true"
                        />
                    )}
                </button>

                <DropdownMenu
                    align="right"
                    className="-mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Log actions"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            {open && expandable && (
                <div className="border-t border-neutral-100 px-4 py-3">
                    <ul className="flex flex-col gap-1.5">
                        {log.exercises.map((ex, i) => {
                            const sets = ex.loggedSets ?? []
                            return (
                                <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                    <span className="text-sm font-medium text-neutral-800">
                                        {ex.name}
                                    </span>
                                    {ex.substitutedFor && (
                                        <span
                                            className="text-[11px] text-neutral-400"
                                            title={`Swapped in for ${ex.substitutedFor}`}
                                        >
                                            for {ex.substitutedFor}
                                        </span>
                                    )}
                                    {sets.length > 0 ? (
                                        sets.map((s, j) => {
                                            const label = formatSet(s)
                                            return label ? (
                                                <span
                                                    key={j}
                                                    className="inline-flex items-center rounded-md bg-coral-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-coral-700"
                                                >
                                                    {label}
                                                </span>
                                            ) : null
                                        })
                                    ) : (
                                        <span className="text-[11px] text-neutral-400">
                                            {formatSetsReps(ex) || 'no sets recorded'}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>

                    {log.notes && (
                        <p className="mt-3 whitespace-pre-wrap border-t border-neutral-100 pt-3 text-sm text-neutral-500">
                            {log.notes}
                        </p>
                    )}
                </div>
            )}
        </Card>
    )
}

// ─── Log form drawer ────────────────────────────────────────────────────────────

function LogFormDrawer({
    form,
    workouts,
    onClose,
    onAdd,
    onSave,
}: {
    form: Drawered
    workouts: Workout[]
    onClose: () => void
    onAdd: (fields: WorkoutLogInput) => Promise<void>
    onSave: (id: string, fields: WorkoutLogInput) => Promise<void>
}) {
    const [view, setView] = useState<Drawered>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.log : undefined

    const [workoutId, setWorkoutId] = useState('')
    const [date, setDate] = useState(todayISO())
    const [duration, setDuration] = useState('')
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (view?.mode === 'edit') {
            const l = view.log
            setWorkoutId(l.workout ?? '')
            setDate(l.date)
            setDuration(l.durationMin != null ? String(l.durationMin) : '')
            setNotes(l.notes ?? '')
        } else {
            setWorkoutId('')
            setDate(todayISO())
            setDuration('')
            setNotes('')
        }
        setSaving(false)
    }, [view])

    const isEdit = view?.mode === 'edit'
    // In create mode a library workout must be picked; edits keep their snapshot.
    const valid = isEdit ? true : workoutId !== ''

    function num(s: string): number | undefined {
        if (s.trim() === '') return undefined
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : undefined
    }

    async function submit() {
        if (!view || !valid) return
        const base = {
            date,
            durationMin: num(duration),
            notes: notes.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') {
                await onAdd({ ...base, workout: workoutId })
            } else {
                await onSave(view.log._id, base)
            }
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const workoutOptions = workouts.map((w) => ({ label: w.name, value: w._id }))

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="lg"
            title={isEdit ? 'Edit logged workout' : 'Log workout'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : isEdit ? 'Save' : 'Log workout'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                {isEdit ? (
                    <p className="font-semibold text-neutral-900">{editing?.name}</p>
                ) : (
                    <Select
                        label="Workout *"
                        placeholder="Choose a workout"
                        value={workoutId}
                        onChange={setWorkoutId}
                        options={workoutOptions}
                    />
                )}

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Date *
                    </label>
                    <DatePicker
                        value={date}
                        maxDate={todayISO()}
                        onChange={(v) => setDate(typeof v === 'string' ? v : todayISO())}
                    />
                </div>

                <Input
                    label="Duration (min)"
                    type="number"
                    min={0}
                    step="any"
                    placeholder="Optional"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-40"
                />

                <Textarea
                    label="Notes"
                    rows={3}
                    placeholder="How did it go? Weights hit, how you felt, anything to remember…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}
