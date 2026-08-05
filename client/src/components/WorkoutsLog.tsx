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
import LineIcon from './LineIcon'
import { listWorkouts } from '../services/workouts'
import { listLogs, createLog, updateLog, deleteLog, type WorkoutLogInput } from '../services/workoutLogs'
import type { LoggedSet, Workout, WorkoutLog, WorkoutLogExercise } from '../types'

// ─── Helpers ────────────────────────────────────────────────────────────────────

function todayISO(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday-based start of the ISO week containing `iso`, as YYYY-MM-DD. */
function weekStartISO(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    const dow = d.getDay() // 0 = Sun
    const back = dow === 0 ? 6 : dow - 1
    d.setDate(d.getDate() - back)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00`)
    const today = todayISO()
    if (iso === today) return 'Today'
    const yd = new Date(`${today}T00:00:00`)
    yd.setDate(yd.getDate() - 1)
    const ydIso = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`
    if (iso === ydIso) return 'Yesterday'
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
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
 */
export default function WorkoutsLog() {
    const [loading, setLoading] = useState(true)
    const [logs, setLogs] = useState<WorkoutLog[]>([])
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [drawer, setDrawer] = useState<Drawered>(null)

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

    // This-week summary, derived from the log.
    const summary = useMemo(() => {
        const start = weekStartISO(todayISO())
        const thisWeek = logs.filter((l) => l.date >= start)
        const minutes = thisWeek.reduce((sum, l) => sum + (l.durationMin || 0), 0)
        return { count: thisWeek.length, minutes }
    }, [logs])

    // Group the log by day for date headers.
    const grouped = useMemo(() => {
        const map = new Map<string, WorkoutLog[]>()
        for (const l of logs) {
            const arr = map.get(l.date) ?? []
            arr.push(l)
            map.set(l.date, arr)
        }
        return [...map.entries()] // already sorted: logs come newest-first
    }, [logs])

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-3">
                {logs.length > 0 ? (
                    <p className="text-sm text-neutral-500">
                        <span className="font-semibold text-neutral-900">{summary.count}</span>{' '}
                        {summary.count === 1 ? 'workout' : 'workouts'} this week
                        {summary.minutes > 0 && (
                            <>
                                {' · '}
                                <span className="font-semibold text-neutral-900">
                                    {summary.minutes}
                                </span>{' '}
                                min
                            </>
                        )}
                    </p>
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
            ) : workouts.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-dumbbell"
                    title="No workouts to log"
                    description="Build a workout in your Workouts Library first, then record it here once completed — or hit Done from a workout."
                />
            ) : logs.length === 0 ? (
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
                <div className="flex flex-col gap-6">
                    {grouped.map(([date, dayLogs]) => (
                        <section key={date} className="flex flex-col gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {formatDate(date)}
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

function LogRow({
    log,
    onEdit,
    onDelete,
}: {
    log: WorkoutLog
    onEdit: () => void
    onDelete: () => void
}) {
    // When any set weights were recorded, itemise them per exercise; otherwise
    // fall back to the compact name + prescription pills.
    const hasWeights = log.exercises.some((e) => e.loggedSets && e.loggedSets.length > 0)
    const volume = hasWeights ? logVolume(log) : 0

    return (
        <Card as="div" hover={false} className="flex items-start gap-3 !p-4">
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
                            <i className="fa-solid fa-weight-hanging mr-1" aria-hidden="true" />
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

                {log.exercises.length > 0 &&
                    (hasWeights ? (
                        <ul className="mt-2.5 flex flex-col gap-1.5">
                            {log.exercises.map((ex, i) => {
                                const sets = ex.loggedSets ?? []
                                return (
                                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                        <span className="text-sm font-medium text-neutral-800">
                                            {ex.name}
                                        </span>
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
                    ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {log.exercises.map((ex, i) => {
                                const sr = formatSetsReps(ex)
                                return (
                                    <span
                                        key={i}
                                        className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                                    >
                                        {ex.name}
                                        {sr && <span className="text-coral-600">{sr}</span>}
                                    </span>
                                )
                            })}
                        </div>
                    ))}

                {log.notes && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-500">{log.notes}</p>
                )}
            </div>
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
