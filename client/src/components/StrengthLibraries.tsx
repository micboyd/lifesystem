import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Textarea from './Textarea'
import Switch from './Switch'
import EmptyState from './EmptyState'
import DropdownMenu from './DropdownMenu'
import Drawer from './Drawer'
import Tabs from './Tabs'
import Pagination from './Pagination'
import LineIcon from './LineIcon'
import JsonImportPanel from './JsonImportPanel'
import WorkoutImportPanel from './WorkoutImportPanel'
import {
    listExercises,
    createExercise,
    updateExercise,
    deleteExercise,
    importExercises,
    type ExerciseInput,
} from '../services/exercises'
import {
    listWorkouts,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    type WorkoutInput,
} from '../services/workouts'
import WorkoutsLog from './WorkoutsLog'
import { createLog as createWorkoutLog } from '../services/workoutLogs'
import { useToast } from '../context/ToastContext'
import { todayKey } from '../lib/calendar'
import type { Exercise, Workout, WorkoutExercise } from '../types'

// ─── Import templates ─────────────────────────────────────────────────────────

const EXERCISE_TEMPLATE = JSON.stringify(
    [
        { name: 'Barbell bench press', description: 'Horizontal press for chest, shoulders and triceps.' },
        { name: 'Barbell row', description: 'Bent-over pull for the mid-back and lats.' },
    ],
    null,
    2
)

const SUB_TABS = ['Workouts', 'Exercises', 'Workouts Library'] as const
type SubTab = (typeof SUB_TABS)[number]

const PAGE_SIZE = 9

/**
 * The Strength area holds two linked libraries: reusable exercises, and workouts
 * that are built from them. Both are loaded up front so the workout builder can
 * resolve exercise names without a second round-trip.
 */
export default function StrengthLibraries() {
    const [sub, setSub] = useState<SubTab>('Workouts')
    const [loading, setLoading] = useState(true)
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [workouts, setWorkouts] = useState<Workout[]>([])

    // Refetch both libraries. Used after a bulk import — a workout import can
    // create new exercises too, so both lists may change.
    const reload = useCallback(async () => {
        const [ex, wk] = await Promise.all([listExercises(), listWorkouts()])
        setExercises(ex)
        setWorkouts(wk)
    }, [])

    useEffect(() => {
        reload().finally(() => setLoading(false))
    }, [reload])

    return (
        <div className="flex flex-col gap-6">
            <Tabs
                tabs={[...SUB_TABS]}
                value={sub}
                onChange={(t) => setSub(t as SubTab)}
                className="self-start"
            />

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : sub === 'Exercises' ? (
                <ExerciseLibrary
                    exercises={exercises}
                    setExercises={setExercises}
                    setWorkouts={setWorkouts}
                    reload={reload}
                />
            ) : sub === 'Workouts Library' ? (
                <WorkoutLibrary
                    exercises={exercises}
                    workouts={workouts}
                    setWorkouts={setWorkouts}
                    reload={reload}
                />
            ) : (
                <WorkoutsLog />
            )}
        </div>
    )
}

// ─── Exercise library ───────────────────────────────────────────────────────────

type ExerciseDrawered =
    | { mode: 'create' }
    | { mode: 'edit'; exercise: Exercise }
    | null

function ExerciseLibrary({
    exercises,
    setExercises,
    setWorkouts,
    reload,
}: {
    exercises: Exercise[]
    setExercises: React.Dispatch<React.SetStateAction<Exercise[]>>
    setWorkouts: React.Dispatch<React.SetStateAction<Workout[]>>
    reload: () => Promise<void>
}) {
    const [drawer, setDrawer] = useState<ExerciseDrawered>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)

    // Filter by name/description, then paginate the matches 9 at a time.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return exercises
        return exercises.filter(
            (e) =>
                e.name.toLowerCase().includes(q) ||
                (e.description ?? '').toLowerCase().includes(q)
        )
    }, [exercises, search])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import exercises"
                description="Copy the template, fill it in with your own movements, then paste the JSON below to add them all to your library at once."
                template={EXERCISE_TEMPLATE}
                itemNoun="exercise"
                onBack={() => setImporting(false)}
                doImport={importExercises}
                resource="exercises"
                existingItems={exercises}
                onLibraryChanged={reload}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
                notes={
                    <>
                        <p>
                            <span className="font-semibold text-neutral-700">name</span> is required.{' '}
                            <span className="font-semibold text-neutral-700">description</span> is
                            optional.
                        </p>
                    </>
                }
            />
        )
    }

    async function handleAdd(fields: ExerciseInput) {
        const exercise = await createExercise(fields)
        setExercises((prev) => [...prev, exercise])
    }

    async function handleSave(id: string, fields: ExerciseInput) {
        const updated = await updateExercise(id, fields)
        setExercises((prev) => prev.map((e) => (e._id === id ? updated : e)))
    }

    async function handleDelete(id: string) {
        setExercises((prev) => prev.filter((e) => e._id !== id))
        // The exercise is pulled from any workouts server-side; mirror that locally.
        setWorkouts((prev) =>
            prev.map((w) =>
                w.exercises.some((e) => e.exercise === id)
                    ? { ...w, exercises: w.exercises.filter((e) => e.exercise !== id) }
                    : w
            )
        )
        await deleteExercise(id)
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search exercises…"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                    }}
                    className="w-full sm:w-64"
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-file-import"
                        onClick={() => setImporting(true)}
                    >
                        Import
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                        New exercise
                    </Button>
                </div>
            </div>

            {exercises.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-dumbbell"
                    title="No exercises yet"
                    description="Build a library of movements you can drop into workouts."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            New exercise
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No exercises match “${search.trim()}”.`}
                />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {pageItems.map((exercise) => (
                        <Card key={exercise._id} as="div" className="flex flex-col gap-2">
                            <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 truncate font-semibold text-neutral-900">
                                    {exercise.name}
                                </p>
                                <DropdownMenu
                                    align="right"
                                    className="-mr-1 -mt-1 shrink-0"
                                    trigger={
                                        <span
                                            aria-label="Exercise actions"
                                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                        >
                                            <LineIcon name="more" className="h-4 w-4" />
                                        </span>
                                    }
                                    items={[
                                        {
                                            label: 'Edit',
                                            icon: 'fa-solid fa-pen',
                                            onClick: () => setDrawer({ mode: 'edit', exercise }),
                                        },
                                        {
                                            label: 'Delete',
                                            icon: 'fa-solid fa-trash-can',
                                            danger: true,
                                            onClick: () => handleDelete(exercise._id),
                                        },
                                    ]}
                                />
                            </div>
                            {exercise.description && (
                                <p className="text-sm text-neutral-500">{exercise.description}</p>
                            )}
                        </Card>
                    ))}
                </div>
                <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                    className="mt-6 justify-center"
                />
              </>
            )}

            <ExerciseFormDrawer
                form={drawer}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

function ExerciseFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: ExerciseDrawered
    onClose: () => void
    onAdd: (fields: ExerciseInput) => Promise<void>
    onSave: (id: string, fields: ExerciseInput) => Promise<void>
}) {
    const [view, setView] = useState<ExerciseDrawered>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.exercise : undefined

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(editing?.name ?? '')
        setDescription(editing?.description ?? '')
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const valid = name.trim() !== '' && description.trim() !== ''

    async function submit() {
        if (!view || !valid) return
        const fields: ExerciseInput = { name: name.trim(), description: description.trim() }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.exercise._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            title={view?.mode === 'edit' ? 'Edit exercise' : 'New exercise'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : 'Save exercise'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Exercise name *"
                    autoFocus
                    placeholder="e.g. Push-Ups"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <Textarea
                    label="Description *"
                    rows={3}
                    placeholder="e.g. Upper body pushing movement"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

// ─── Workout library ────────────────────────────────────────────────────────────

type WorkoutDrawered =
    | { mode: 'view'; workout: Workout }
    | { mode: 'create' }
    | { mode: 'edit'; workout: Workout }
    | null

/**
 * Rough completion estimate for a strength workout: a fixed warm-up plus a block
 * per exercise. When sets are prescribed we count ~2 min per working set (work +
 * rest); otherwise we fall back to a flat per-exercise block. Deliberately
 * transparent so the number reads as the ballpark it is.
 */
const WARMUP_MIN = 8
const PER_EXERCISE_MIN = 6
const PER_SET_MIN = 2
function estimateWorkoutMinutes(exercises: WorkoutExercise[]): number {
    if (exercises.length === 0) return 0
    const work = exercises.reduce(
        (sum, e) => sum + (e.sets && e.sets > 0 ? e.sets * PER_SET_MIN : PER_EXERCISE_MIN),
        0
    )
    return WARMUP_MIN + work
}

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
function formatSetsReps(e: { sets?: number; reps?: string }): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

function WorkoutLibrary({
    exercises,
    workouts,
    setWorkouts,
    reload,
}: {
    exercises: Exercise[]
    workouts: Workout[]
    setWorkouts: React.Dispatch<React.SetStateAction<Workout[]>>
    reload: () => Promise<void>
}) {
    const toast = useToast()
    const [drawer, setDrawer] = useState<WorkoutDrawered>(null)
    const [importing, setImporting] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)

    // Fast id → exercise lookup for rendering workout contents. Declared before
    // any early return so the hook order stays stable.
    const byId = useMemo(() => {
        const m = new Map<string, Exercise>()
        for (const e of exercises) m.set(e._id, e)
        return m
    }, [exercises])

    // Match on the workout's name/description and any exercise names it contains,
    // then paginate the matches 9 at a time.
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return workouts
        return workouts.filter(
            (w) =>
                w.name.toLowerCase().includes(q) ||
                (w.description ?? '').toLowerCase().includes(q) ||
                w.exercises.some((e) => byId.get(e.exercise)?.name.toLowerCase().includes(q))
        )
    }, [workouts, search, byId])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    if (importing) {
        return (
            <WorkoutImportPanel
                onBack={() => setImporting(false)}
                onLibraryChanged={reload}
                existingWorkouts={workouts}
                onImported={async () => {
                    await reload()
                    setImporting(false)
                }}
            />
        )
    }

    async function handleAdd(fields: WorkoutInput) {
        const workout = await createWorkout(fields)
        setWorkouts((prev) => [...prev, workout])
    }

    async function handleSave(id: string, fields: WorkoutInput) {
        const updated = await updateWorkout(id, fields)
        setWorkouts((prev) => prev.map((w) => (w._id === id ? updated : w)))
    }

    async function handleDelete(id: string) {
        setWorkouts((prev) => prev.filter((w) => w._id !== id))
        await deleteWorkout(id)
    }

    // Record a completed workout — snapshotted server-side from the library
    // workout, dated today. Surfaces in the "Workouts" log tab.
    async function handleDone(workout: Workout) {
        await createWorkoutLog({ workout: workout._id, date: todayKey() })
        toast.show(`Logged “${workout.name}”.`, 'success')
    }

    return (
        <>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search workouts…"
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        setPage(1)
                    }}
                    className="w-full sm:w-64"
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-file-import"
                        onClick={() => setImporting(true)}
                    >
                        Import
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                        New workout
                    </Button>
                </div>
            </div>

            {workouts.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-list-check"
                    title="No workouts yet"
                    description="Combine exercises from your library into a repeatable workout."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            New workout
                        </Button>
                    }
                />
            ) : filtered.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No workouts match “${search.trim()}”.`}
                />
            ) : (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {pageItems.map((workout) => (
                        <Card key={workout._id} as="div" className="relative flex flex-col gap-3">
                            {/* Stretched overlay: clicking the card opens the workout.
                                Interactive children (the actions menu) sit above it. */}
                            <button
                                type="button"
                                aria-label={`View ${workout.name}`}
                                onClick={() => setDrawer({ mode: 'view', workout })}
                                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                            />
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="min-w-0 truncate font-semibold text-neutral-900">
                                            {workout.name}
                                        </p>
                                        {workout.showInPlanner && (
                                            <i
                                                className="fa-solid fa-thumbtack shrink-0 text-xs text-coral-500"
                                                aria-hidden="true"
                                                title="Pinned to week planner"
                                            />
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-xs text-neutral-400">
                                        {workout.exercises.length}{' '}
                                        {workout.exercises.length === 1 ? 'exercise' : 'exercises'}
                                        {workout.exercises.length > 0 &&
                                            ` · ~${estimateWorkoutMinutes(workout.exercises)} min`}
                                    </p>
                                </div>
                                <DropdownMenu
                                    align="right"
                                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                                    trigger={
                                        <span
                                            aria-label="Workout actions"
                                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                        >
                                            <LineIcon name="more" className="h-4 w-4" />
                                        </span>
                                    }
                                    items={[
                                        {
                                            label: 'Edit',
                                            icon: 'fa-solid fa-pen',
                                            onClick: () => setDrawer({ mode: 'edit', workout }),
                                        },
                                        {
                                            label: 'Delete',
                                            icon: 'fa-solid fa-trash-can',
                                            danger: true,
                                            onClick: () => handleDelete(workout._id),
                                        },
                                    ]}
                                />
                            </div>

                            {workout.description && (
                                <p className="text-sm text-neutral-500">{workout.description}</p>
                            )}

                            {workout.exercises.length > 0 && (
                                <div className="mt-auto flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3">
                                    {workout.exercises.slice(0, 4).map((item, i) => {
                                        const ex = byId.get(item.exercise)
                                        if (!ex) return null
                                        return (
                                            <span
                                                key={`${item.exercise}-${i}`}
                                                className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600"
                                            >
                                                {ex.name}
                                            </span>
                                        )
                                    })}
                                    {workout.exercises.length > 4 && (
                                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                                            +{workout.exercises.length - 4}
                                        </span>
                                    )}
                                </div>
                            )}
                        </Card>
                    ))}
                </div>
                <Pagination
                    page={page}
                    pageCount={pageCount}
                    onChange={setPage}
                    className="mt-6 justify-center"
                />
              </>
            )}

            <WorkoutViewDrawer
                workout={drawer?.mode === 'view' ? drawer.workout : null}
                byId={byId}
                onClose={() => setDrawer(null)}
                onEdit={(workout) => setDrawer({ mode: 'edit', workout })}
                onDelete={handleDelete}
                onDone={handleDone}
            />

            <WorkoutFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                exercises={exercises}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </>
    )
}

// ─── Workout view drawer ──────────────────────────────────────────────────────

function WorkoutViewDrawer({
    workout,
    byId,
    onClose,
    onEdit,
    onDelete,
    onDone,
}: {
    workout: Workout | null
    byId: Map<string, Exercise>
    onClose: () => void
    onEdit: (workout: Workout) => void
    onDelete: (id: string) => void
    onDone: (workout: Workout) => Promise<void>
}) {
    // Retain the last workout while the drawer animates closed.
    const [view, setView] = useState<Workout | null>(workout)
    const [logging, setLogging] = useState(false)
    useEffect(() => {
        if (workout) {
            setView(workout)
            setLogging(false)
        }
    }, [workout])

    const w = view
    // Pair each workout slot with its resolved library exercise, in order,
    // dropping any that were since deleted.
    const rows = w
        ? w.exercises
              .map((item) => ({ item, ex: byId.get(item.exercise) }))
              .filter((r): r is { item: WorkoutExercise; ex: Exercise } => !!r.ex)
        : []
    const est = w ? estimateWorkoutMinutes(w.exercises) : 0

    async function markDone() {
        if (!w) return
        setLogging(true)
        try {
            await onDone(w)
            onClose()
        } finally {
            setLogging(false)
        }
    }

    return (
        <Drawer
            open={!!workout}
            onClose={onClose}
            size="xl"
            title={w?.name ?? 'Workout'}
            footer={
                w && (
                    <>
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(w._id)}
                        >
                            Delete
                        </Button>
                        <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => onEdit(w)}>
                            Edit
                        </Button>
                        <Button icon="fa-solid fa-check" onClick={markDone} disabled={logging}>
                            {logging ? 'Logging…' : 'Done'}
                        </Button>
                    </>
                )
            }
        >
            {w && (
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
                            <i className="fa-solid fa-dumbbell text-neutral-400" aria-hidden="true" />
                            {rows.length} {rows.length === 1 ? 'exercise' : 'exercises'}
                        </span>
                        {rows.length > 0 && (
                            <span
                                title="Rough estimate: an 8-minute warm-up plus working sets (~2 min each), or ~6 min per exercise where sets aren't set."
                                className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600"
                            >
                                <i className="fa-regular fa-clock text-neutral-400" aria-hidden="true" />
                                ~{est} min
                            </span>
                        )}
                        {w.showInPlanner && (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-50 px-2.5 py-1 text-xs font-semibold text-coral-600">
                                <i className="fa-solid fa-thumbtack" aria-hidden="true" />
                                Pinned
                            </span>
                        )}
                    </div>

                    {w.description && (
                        <p className="whitespace-pre-wrap text-sm text-neutral-600">{w.description}</p>
                    )}

                    <section>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Exercises
                        </p>
                        {rows.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                                No exercises in this workout yet.
                            </p>
                        ) : (
                            <ol className="flex flex-col gap-3">
                                {rows.map(({ item, ex }, i) => (
                                    <li key={`${ex._id}-${i}`} className="flex gap-3 text-sm">
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                            {i + 1}
                                        </span>
                                        <div className="min-w-0 pt-0.5">
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                <p className="font-semibold text-neutral-900">
                                                    {ex.name}
                                                </p>
                                                {formatSetsReps(item) && (
                                                    <span className="text-xs font-medium text-coral-600">
                                                        {formatSetsReps(item)}
                                                    </span>
                                                )}
                                            </div>
                                            {ex.description && (
                                                <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                                    {ex.description}
                                                </p>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                </div>
            )}
        </Drawer>
    )
}

function WorkoutFormDrawer({
    form,
    exercises,
    onClose,
    onAdd,
    onSave,
}: {
    form: WorkoutDrawered
    exercises: Exercise[]
    onClose: () => void
    onAdd: (fields: WorkoutInput) => Promise<void>
    onSave: (id: string, fields: WorkoutInput) => Promise<void>
}) {
    const [view, setView] = useState<WorkoutDrawered>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.workout : undefined

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [showInPlanner, setShowInPlanner] = useState(false)
    const [selected, setSelected] = useState<WorkoutExercise[]>([])
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(editing?.name ?? '')
        setDescription(editing?.description ?? '')
        setShowInPlanner(editing?.showInPlanner ?? false)
        // Drop any entries that no longer resolve to a library exercise.
        setSelected(
            (editing?.exercises ?? []).filter((e) => exercises.some((x) => x._id === e.exercise))
        )
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const valid = name.trim() !== '' && description.trim() !== ''

    async function submit() {
        if (!view || !valid) return
        const fields: WorkoutInput = {
            name: name.trim(),
            description: description.trim(),
            showInPlanner,
            exercises: selected,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.workout._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.mode === 'edit' ? 'Edit workout' : 'New workout'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : 'Save workout'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Workout name *"
                    autoFocus
                    placeholder="e.g. Full Body Blast"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
                <Textarea
                    label="Description *"
                    rows={2}
                    placeholder="e.g. Combines cardio and strength training"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />

                {/* Week planner toggle */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 p-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">Show in Week Planner</p>
                        <p className="mt-0.5 text-xs text-neutral-400">
                            Pin this workout to the top of the planner
                        </p>
                    </div>
                    <Switch checked={showInPlanner} onChange={setShowInPlanner} />
                </div>

                {/* Exercise picker */}
                <ExercisePicker exercises={exercises} selected={selected} onChange={setSelected} />
            </div>
        </Drawer>
    )
}

// ─── Exercise picker ────────────────────────────────────────────────────────────

function ExercisePicker({
    exercises,
    selected,
    onChange,
}: {
    exercises: Exercise[]
    selected: WorkoutExercise[]
    onChange: (rows: WorkoutExercise[]) => void
}) {
    const [query, setQuery] = useState('')

    const byId = useMemo(() => {
        const m = new Map<string, Exercise>()
        for (const e of exercises) m.set(e._id, e)
        return m
    }, [exercises])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return exercises
        return exercises.filter((e) => e.name.toLowerCase().includes(q))
    }, [exercises, query])

    const selectedIds = useMemo(() => new Set(selected.map((s) => s.exercise)), [selected])

    function toggle(id: string) {
        if (selectedIds.has(id)) onChange(selected.filter((s) => s.exercise !== id))
        else onChange([...selected, { exercise: id }])
    }
    function update(id: string, patch: Partial<WorkoutExercise>) {
        onChange(selected.map((s) => (s.exercise === id ? { ...s, ...patch } : s)))
    }
    function remove(id: string) {
        onChange(selected.filter((s) => s.exercise !== id))
    }

    function onSets(id: string, v: string) {
        const n = Number(v)
        update(id, { sets: v === '' || !Number.isFinite(n) || n < 0 ? undefined : Math.round(n) })
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Exercises
                </label>
                {selected.length > 0 && (
                    <span className="text-xs font-medium text-neutral-500">
                        {selected.length} added
                    </span>
                )}
            </div>

            {/* Chosen exercises, in order, with per-exercise sets & reps. */}
            {selected.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {selected.map((row, i) => {
                        const ex = byId.get(row.exercise)
                        if (!ex) return null
                        return (
                            <li
                                key={row.exercise}
                                className="flex items-center gap-2 rounded-xl border border-neutral-200 p-2.5"
                            >
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                                    {ex.name}
                                </span>
                                <input
                                    type="number"
                                    min={0}
                                    inputMode="numeric"
                                    placeholder="Sets"
                                    aria-label={`Sets for ${ex.name}`}
                                    value={row.sets ?? ''}
                                    onChange={(e) => onSets(row.exercise, e.target.value)}
                                    className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                />
                                <input
                                    type="text"
                                    placeholder="Reps"
                                    aria-label={`Reps for ${ex.name}`}
                                    value={row.reps ?? ''}
                                    onChange={(e) =>
                                        update(row.exercise, { reps: e.target.value || undefined })
                                    }
                                    className="w-24 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                />
                                <button
                                    type="button"
                                    aria-label={`Remove ${ex.name}`}
                                    onClick={() => remove(row.exercise)}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}

            {exercises.length === 0 ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                    No exercises yet — add some in the Exercises library first.
                </p>
            ) : (
                <div className="rounded-xl border border-neutral-200">
                    <div className="border-b border-neutral-100 p-2">
                        <Input
                            icon="fa-solid fa-magnifying-glass"
                            placeholder="Search to add…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>
                    <ul className="max-h-64 overflow-y-auto p-1.5">
                        {filtered.length === 0 ? (
                            <li className="px-3 py-4 text-center text-xs text-neutral-400">
                                No matches for “{query}”.
                            </li>
                        ) : (
                            filtered.map((ex) => {
                                const isOn = selectedIds.has(ex._id)
                                return (
                                    <li key={ex._id}>
                                        <button
                                            type="button"
                                            onClick={() => toggle(ex._id)}
                                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100"
                                        >
                                            <span
                                                className={[
                                                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                                                    isOn
                                                        ? 'border-neutral-950 bg-neutral-950 text-white'
                                                        : 'border-neutral-300 text-transparent',
                                                ].join(' ')}
                                            >
                                                <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                                            </span>
                                            <span
                                                className={
                                                    isOn ? 'font-medium text-neutral-900' : 'text-neutral-600'
                                                }
                                            >
                                                {ex.name}
                                            </span>
                                        </button>
                                    </li>
                                )
                            })
                        )}
                    </ul>
                </div>
            )}
        </div>
    )
}
