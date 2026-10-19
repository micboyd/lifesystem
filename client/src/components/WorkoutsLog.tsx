import { useEffect, useMemo, useState } from 'react'
import { SummaryExerciseList, SummaryStats, type SummaryRow } from './session/WorkoutSummary'
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
import {
    listLogs,
    createLog,
    updateLog,
    deleteLog,
    type WorkoutLogInput,
} from '../services/workoutLogs'
import type { LoggedSet, Workout, WorkoutLog, WorkoutLogExercise } from '../types'
import { isMainWork, phaseOf } from '../lib/phases'
import { driftLabel, driftTone, paceOf, type DriftTone } from '../lib/sessionPace'

const DELTA_TONE: Record<DriftTone, string> = {
    on: 'bg-emerald-50 text-emerald-700',
    behind: 'bg-amber-50 text-amber-700',
    ahead: 'bg-sky-50 text-sky-700',
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** How many exercises a card lists before it says "+N more". */
const ROW_LIMIT = 4

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

/** One performed set as "60 kg × 8", "60 kg", or "8 reps" — whatever was recorded. */
function formatSet(s: LoggedSet): string {
    if (s.weight != null && s.reps != null) return `${s.weight} kg × ${s.reps}`
    if (s.weight != null) return `${s.weight} kg`
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

/** Total training volume (Σ weight × reps) of a log's main work, in kg. */
function logVolume(log: WorkoutLog): number {
    let total = 0
    for (const e of log.exercises.filter(isMainWork)) {
        for (const s of e.loggedSets ?? []) {
            if (s.weight != null && s.reps != null) total += s.weight * s.reps
        }
    }
    return Math.round(total)
}

// ─── Workouts log ─────────────────────────────────────────────────────────────────

type Drawered = { mode: 'create' } | { mode: 'edit'; log: WorkoutLog } | null

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
    /** The logged workout open in the read-out. */
    const [viewing, setViewing] = useState<WorkoutLog | null>(null)

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
                        <Button
                            icon="fa-solid fa-plus"
                            onClick={() => setDrawer({ mode: 'create' })}
                        >
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
                                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                            {formatLogDate(date, todayISO())}
                                        </p>
                                        <div className="flex flex-col gap-2">
                                            {dayLogs.map((log) => (
                                                <LogRow
                                                    key={log._id}
                                                    log={log}
                                                    onOpen={() => setViewing(log)}
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

            <LogSummaryDrawer
                log={viewing}
                onClose={() => setViewing(null)}
                onEdit={(log) => {
                    setViewing(null)
                    setDrawer({ mode: 'edit', log })
                }}
                onDelete={(log) => {
                    setViewing(null)
                    void handleDelete(log._id)
                }}
            />

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
 * One logged session as a card: the name and totals, then the main lifts with
 * the heaviest set of each. Tapping it opens the full read-out.
 */
function LogRow({
    log,
    onOpen,
    onEdit,
    onDelete,
}: {
    log: WorkoutLog
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const volume = logVolume(log)
    // Warm-ups and cool-downs are in the read-out; the card is about the lifting.
    const main = log.exercises.filter(isMainWork)
    const lifts = main.length ? main : log.exercises
    const shown = lifts.slice(0, ROW_LIMIT)
    const hidden = lifts.length - shown.length
    const facts = [
        `${log.exercises.length} ${log.exercises.length === 1 ? 'exercise' : 'exercises'}`,
        volume > 0 && `${volume.toLocaleString()} kg`,
        log.durationMin != null && log.durationMin > 0 && `${log.durationMin} min`,
    ].filter(Boolean)

    return (
        <Card as="div" hover={false} className="!p-0">
            <div className="flex items-start gap-1 p-4 pb-0">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
                >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-50 text-coral-600">
                        <i className="fa-solid fa-dumbbell text-sm" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-neutral-900">
                            {log.name}
                        </span>
                        <span className="block truncate text-xs text-neutral-500">
                            {facts.join(' · ')}
                        </span>
                    </span>
                </button>

                <DropdownMenu
                    align="right"
                    className="-mr-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Log actions"
                            className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        {
                            label: 'Delete',
                            icon: 'fa-solid fa-trash-can',
                            danger: true,
                            onClick: onDelete,
                        },
                    ]}
                />
            </div>

            <button type="button" onClick={onOpen} className="block w-full p-4 pt-3 text-left">
                {shown.length > 0 && (
                    <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl bg-neutral-50 px-3">
                        {shown.map((ex, i) => {
                            const best = topSet(ex)
                            return (
                                <li
                                    key={i}
                                    className="flex items-center justify-between gap-3 py-2"
                                >
                                    <span className="min-w-0 truncate text-sm text-neutral-700">
                                        {ex.name}
                                    </span>
                                    <span
                                        className={`shrink-0 text-sm tabular-nums ${
                                            best
                                                ? 'font-semibold text-neutral-900'
                                                : 'text-neutral-400'
                                        }`}
                                    >
                                        {best ? formatSet(best) : formatSetsReps(ex) || '—'}
                                    </span>
                                </li>
                            )
                        })}
                    </ul>
                )}
                {(hidden > 0 || log.notes) && (
                    <div className="mt-2.5 flex flex-col gap-1 px-1">
                        {hidden > 0 && (
                            <span className="text-xs font-medium text-neutral-500">
                                +{hidden} more
                            </span>
                        )}
                        {log.notes && (
                            <p className="line-clamp-2 whitespace-pre-wrap text-sm text-neutral-500">
                                {log.notes}
                            </p>
                        )}
                    </div>
                )}
            </button>
        </Card>
    )
}

// ─── Log read-out ───────────────────────────────────────────────────────────────

/**
 * A logged workout laid out like the logger's wrap-up — totals, then each
 * exercise with the sets done — so a past session reads the same as one just
 * finished.
 */
function LogSummaryDrawer({
    log,
    onClose,
    onEdit,
    onDelete,
}: {
    log: WorkoutLog | null
    onClose: () => void
    onEdit: (log: WorkoutLog) => void
    onDelete: (log: WorkoutLog) => void
}) {
    // Keep the last log on screen while the drawer animates closed.
    const [view, setView] = useState<WorkoutLog | null>(log)
    if (log && log !== view) setView(log)

    const l = view
    const rows: SummaryRow[] = (l?.exercises ?? []).map((ex, i) => {
        const sets = (ex.loggedSets ?? []).map(formatSet).filter(Boolean)
        const main = isMainWork(ex)
        return {
            key: i,
            name: ex.name,
            phase: phaseOf(ex),
            // In the log means it was done; a main lift with no sets was a quick "Done".
            progress: sets.length || !main ? 'all' : 'none',
            detail: sets.length
                ? sets.join(' · ')
                : main
                  ? formatSetsReps(ex) || 'No sets recorded'
                  : 'Done',
            note: ex.substitutedFor ? `Swapped in for ${ex.substitutedFor}` : undefined,
        }
    })
    const mainRows = (l?.exercises ?? []).filter(isMainWork)
    const setCount = mainRows.reduce((n, e) => n + (e.loggedSets?.length ?? 0), 0)
    const withSets = mainRows.filter((e) => e.loggedSets?.length).length
    const times = l
        ? l.exercises.map((e) => (e.completedAt ? Date.parse(e.completedAt) : null))
        : []
    const pace = l ? paceOf(l.exercises, times) : null

    return (
        <Drawer
            open={!!log}
            onClose={onClose}
            size="2xl"
            title={l?.name ?? 'Workout'}
            footer={
                l && (
                    <div className="flex w-full items-center gap-3">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(l)}
                            className="mr-auto"
                        >
                            Delete
                        </Button>
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-pen"
                            onClick={() => onEdit(l)}
                        >
                            Edit
                        </Button>
                        <Button onClick={onClose}>Done</Button>
                    </div>
                )
            }
        >
            {l && (
                <div className="flex flex-col gap-7">
                    <header>
                        <h3 className="text-2xl font-semibold tracking-[-0.02em] text-neutral-900">
                            {formatLogDate(l.date, todayISO())}
                        </h3>
                        <p className="mt-1 text-sm text-neutral-500">
                            {l.exercises.length}{' '}
                            {l.exercises.length === 1 ? 'exercise' : 'exercises'}
                            {l.durationMin ? ` · ${l.durationMin} min` : ''}
                        </p>
                    </header>

                    <SummaryStats
                        items={[
                            {
                                label: 'Exercises',
                                value: mainRows.length ? `${withSets}/${mainRows.length}` : 0,
                            },
                            { label: 'Sets', value: setCount },
                            { label: 'Volume', value: `${logVolume(l).toLocaleString()} kg` },
                        ]}
                    />

                    {pace?.drift != null && (
                        <p className="-mt-3 text-xs text-neutral-500">
                            Pace:{' '}
                            <span
                                className={`rounded-full px-2 py-0.5 font-semibold ${DELTA_TONE[driftTone(pace.drift)]}`}
                            >
                                {driftLabel(pace.drift)}
                            </span>{' '}
                            by the last completed exercise
                        </p>
                    )}

                    <SummaryExerciseList rows={rows} />

                    {l.notes && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[13px] font-medium text-neutral-700">Notes</p>
                            <p className="whitespace-pre-wrap rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
                                {l.notes}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </Drawer>
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
                    <label className="text-[13px] font-medium text-neutral-700">Date *</label>
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
