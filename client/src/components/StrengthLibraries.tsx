import { useCallback, useEffect, useMemo, useState } from 'react'
import { BringInput } from './BringList'
import PhaseHeading, { phaseSpan } from './PhaseHeading'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Textarea from './Textarea'
import Select from './Select'
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
    listWorkoutsPage,
    createWorkout,
    updateWorkout,
    deleteWorkout,
    type WorkoutInput,
} from '../services/workouts'
import WorkoutsLog from './WorkoutsLog'
import WorkoutDetail from './session/WorkoutDetail'
import { createLog as createWorkoutLog } from '../services/workoutLogs'
import { useToast } from '../context/ToastContext'
import { todayKey } from '../lib/calendar'
import { MUSCLE_GROUPS, EQUIPMENT, resolveTags } from '../lib/exerciseSwap'
import { StepsInput, useStepTicks, workoutStepsKey } from './session/SessionUI'
import { VideoButton } from './ExerciseVideo'
import { parseVideo } from '../lib/video'
import { SESSION_PHASES } from '../types'
import type { Exercise, Phased, SessionPhase, Workout, WorkoutExercise } from '../types'
import {
    emptyPhases,
    estimateWorkoutMinutes,
    mapPhases,
} from '../lib/phases'

// ─── Import templates ─────────────────────────────────────────────────────────

const EXERCISE_TEMPLATE = JSON.stringify(
    [
        {
            name: 'Barbell bench press',
            description: 'Horizontal press for chest, shoulders and triceps.',
            muscleGroup: 'Chest',
            equipment: 'Barbell',
            videoUrl: 'https://youtu.be/xxxxxxxxxxx',
        },
        {
            name: 'Barbell row',
            description: 'Bent-over pull for the mid-back and lats.',
            muscleGroup: 'Back',
            equipment: 'Barbell',
        },
    ],
    null,
    2
)

/** Blank-able option lists for the two tag fields. */
const GROUP_OPTIONS = [
    { label: 'Not set', value: '' },
    ...MUSCLE_GROUPS.map((g) => ({ label: g, value: g })),
]
const EQUIPMENT_OPTIONS = [
    { label: 'Not set', value: '' },
    ...EQUIPMENT.map((e) => ({ label: e, value: e })),
]

const SUB_TABS = ['Workouts Library', 'Exercises', 'Workouts'] as const
type SubTab = (typeof SUB_TABS)[number]

const PAGE_SIZE = 9

/**
 * The Strength area holds two linked libraries: reusable exercises, and workouts
 * that are built from them. The exercise library is loaded in full up front so
 * the workout builder and the workout cards can resolve exercise names without a
 * second round-trip; workouts are fetched a page at a time by the grid itself.
 */
export default function StrengthLibraries() {
    const [sub, setSub] = useState<SubTab>('Workouts Library')
    const [loading, setLoading] = useState(true)
    const [exercises, setExercises] = useState<Exercise[]>([])

    // Refetch the exercise library. Used after a bulk import — a workout import
    // can create new exercises too, so it runs for either library's import.
    const reload = useCallback(async () => {
        setExercises(await listExercises())
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
                    reload={reload}
                />
            ) : sub === 'Workouts Library' ? (
                <WorkoutLibrary exercises={exercises} reload={reload} />
            ) : (
                <WorkoutsLog />
            )}
        </div>
    )
}

// ─── Exercise library ───────────────────────────────────────────────────────────

type ExerciseDrawered = { mode: 'create' } | { mode: 'edit'; exercise: Exercise } | null

function ExerciseLibrary({
    exercises,
    setExercises,
    reload,
}: {
    exercises: Exercise[]
    setExercises: React.Dispatch<React.SetStateAction<Exercise[]>>
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
                e.name.toLowerCase().includes(q) || (e.description ?? '').toLowerCase().includes(q)
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
                            <span className="font-semibold text-neutral-700">name</span> is
                            required.{' '}
                            <span className="font-semibold text-neutral-700">description</span>,{' '}
                            <span className="font-semibold text-neutral-700">muscleGroup</span> and{' '}
                            <span className="font-semibold text-neutral-700">equipment</span> are
                            optional, and so is{' '}
                            <span className="font-semibold text-neutral-700">videoUrl</span> — a
                            demo video (a YouTube link plays in the app from the exercise&apos;s
                            card; <span className="font-semibold text-neutral-700">youtubeLink</span>{' '}
                            works too).
                        </p>
                        <p>
                            The last two are what the swap button matches on when a machine is
                            taken. Leave them out and they&apos;re read from the name instead —
                            tagging them just makes the suggestions surer.
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
        // The exercise is pulled from any workouts server-side. The workout grid
        // fetches its own page on mount, so it picks that up when the user
        // switches back to it — nothing to mirror locally.
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
                        <Button
                            icon="fa-solid fa-plus"
                            onClick={() => setDrawer({ mode: 'create' })}
                        >
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
                                    <p className="min-w-0 flex-1 truncate font-semibold text-neutral-900">
                                        {exercise.name}
                                    </p>
                                    <VideoButton url={exercise.videoUrl} title={exercise.name} />
                                    <DropdownMenu
                                        align="right"
                                        className="-mr-1 -mt-1 shrink-0"
                                        trigger={
                                            <span
                                                aria-label="Exercise actions"
                                                className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                            >
                                                <LineIcon name="more" className="h-4 w-4" />
                                            </span>
                                        }
                                        items={[
                                            {
                                                label: 'Edit',
                                                icon: 'fa-solid fa-pen',
                                                onClick: () =>
                                                    setDrawer({ mode: 'edit', exercise }),
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
                                    <p className="text-sm text-neutral-500">
                                        {exercise.description}
                                    </p>
                                )}
                                <ExerciseTagChips exercise={exercise} />
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

/**
 * The muscle group and equipment an exercise carries. Inferred values are shown
 * in a lighter style — they're what a swap will match on either way, so it's
 * worth seeing the guess and being able to correct it.
 */
function ExerciseTagChips({ exercise }: { exercise: Exercise }) {
    const tags = resolveTags(exercise)
    const chips = [
        { value: tags.muscleGroup, exact: tags.taggedGroup },
        { value: tags.equipment, exact: tags.taggedEquipment },
    ].filter((c): c is { value: string; exact: boolean } => !!c.value)

    if (chips.length === 0) return null

    return (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
            {chips.map((chip) => (
                <span
                    key={chip.value}
                    title={chip.exact ? undefined : 'Read from the name — edit to set it exactly'}
                    className={[
                        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em]',
                        chip.exact
                            ? 'bg-neutral-100 text-neutral-600'
                            : 'border border-dashed border-neutral-200 text-neutral-500',
                    ].join(' ')}
                >
                    {chip.value}
                </span>
            ))}
        </div>
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
    const [muscleGroup, setMuscleGroup] = useState('')
    const [equipment, setEquipment] = useState('')
    const [videoUrl, setVideoUrl] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(editing?.name ?? '')
        setDescription(editing?.description ?? '')
        setMuscleGroup(editing?.muscleGroup ?? '')
        setEquipment(editing?.equipment ?? '')
        setVideoUrl(editing?.videoUrl ?? '')
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    // What the swap picker would assume if these are left blank, so the hint can
    // show the guess rather than leaving the user to wonder whether it matters.
    const guess = resolveTags({ name, description })

    const video = parseVideo(videoUrl)
    const videoBad = videoUrl.trim() !== '' && !video
    const valid = name.trim() !== '' && description.trim() !== '' && !videoBad

    async function submit() {
        if (!view || !valid) return
        const fields: ExerciseInput = {
            name: name.trim(),
            description: description.trim(),
            muscleGroup,
            equipment,
            videoUrl: videoUrl.trim(),
        }
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
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <Select
                        label="Muscle group"
                        options={GROUP_OPTIONS}
                        value={muscleGroup}
                        onChange={setMuscleGroup}
                        placeholder="Not set"
                        hint={
                            muscleGroup
                                ? undefined
                                : guess.muscleGroup
                                  ? `Reads as ${guess.muscleGroup}`
                                  : 'Set this so swaps can match it'
                        }
                    />
                    <Select
                        label="Equipment"
                        options={EQUIPMENT_OPTIONS}
                        value={equipment}
                        onChange={setEquipment}
                        placeholder="Not set"
                        hint={
                            equipment
                                ? undefined
                                : guess.equipment
                                  ? `Reads as ${guess.equipment}`
                                  : 'Swaps prefer a different one'
                        }
                    />
                </div>
                <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                        <Input
                            label="Demo video"
                            type="url"
                            inputMode="url"
                            placeholder="https://youtu.be/…"
                            value={videoUrl}
                            onChange={(e) => setVideoUrl(e.target.value)}
                            error={videoBad ? 'That isn’t a web link.' : undefined}
                            hint={
                                video?.kind === 'youtube'
                                    ? 'Plays in the app from this exercise’s card.'
                                    : video
                                      ? 'Not YouTube — opens in a new tab.'
                                      : 'A YouTube link plays in the app, in the gym.'
                            }
                        />
                    </div>
                    {video && (
                        <div className={videoBad ? '' : 'pb-6'}>
                            <VideoButton url={videoUrl} title={name || 'Exercise'} />
                        </div>
                    )}
                </div>
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
 * The minutes to show for a workout: its stated duration when one was given (an
 * imported plan usually says), otherwise the estimate above. `estimated` drives
 * whether the label is hedged with a "~".
 */
function workoutMinutes(workout: Workout): { minutes: number; estimated: boolean } {
    if (workout.duration > 0) return { minutes: workout.duration, estimated: false }
    return { minutes: estimateWorkoutMinutes(workout), estimated: true }
}

function WorkoutLibrary({
    exercises,
    reload,
}: {
    exercises: Exercise[]
    reload: () => Promise<void>
}) {
    const toast = useToast()
    const [drawer, setDrawer] = useState<WorkoutDrawered>(null)
    const [importing, setImporting] = useState(false)
    const [openingImport, setOpeningImport] = useState(false)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [page, setPage] = useState(1)
    // One server page of the library (20 workouts), plus the page count and the
    // matching total — the total tells "no workouts yet" apart from "no matches".
    const [lib, setLib] = useState<{ workouts: Workout[]; pages: number; total: number }>({
        workouts: [],
        pages: 1,
        total: 0,
    })
    const [libLoading, setLibLoading] = useState(true)
    // The whole library, pulled only when the import panel opens — it needs
    // every name to spot clashes against what's already there.
    const [allWorkouts, setAllWorkouts] = useState<Workout[]>([])

    // Fast id → exercise lookup for rendering workout contents. Declared before
    // any early return so the hook order stays stable.
    const byId = useMemo(() => {
        const m = new Map<string, Exercise>()
        for (const e of exercises) m.set(e._id, e)
        return m
    }, [exercises])

    // Debounce the search box so we query the server ~300ms after typing stops.
    // A new term resets to page 1 so matches aren't hidden past the end.
    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedSearch(search.trim())
            setPage(1)
        }, 300)
        return () => clearTimeout(id)
    }, [search])

    // Fetch the current page. The server matches `search` against the workout's
    // name and description and the names of the exercises it contains, which is
    // what the grid used to filter on locally.
    const reloadPage = useCallback(() => {
        // No spinner on refetch — the grid keeps the cards it has until the new
        // page lands, so paging and searching never flash. The first paint is
        // covered by `libLoading` starting true.
        return listWorkoutsPage(page, debouncedSearch)
            .then((r) => {
                setLib({ workouts: r.workouts, pages: r.pages, total: r.total })
                // Deletes can leave `page` past the end — step back onto a real one.
                if (page > r.pages) setPage(r.pages)
            })
            .finally(() => setLibLoading(false))
    }, [page, debouncedSearch])

    useEffect(() => {
        reloadPage()
    }, [reloadPage])

    // After an import (or its undo): exercises may have been created too, and the
    // full list the clash check reads from is now stale.
    const refreshAll = useCallback(async () => {
        const [, wk] = await Promise.all([reload(), listWorkouts()])
        setAllWorkouts(wk)
        await reloadPage()
    }, [reload, reloadPage])

    async function openImport() {
        setOpeningImport(true)
        try {
            setAllWorkouts(await listWorkouts())
            setImporting(true)
        } catch {
            toast.show('Could not load the workout library.')
        } finally {
            setOpeningImport(false)
        }
    }

    if (importing) {
        return (
            <WorkoutImportPanel
                onBack={() => setImporting(false)}
                onLibraryChanged={refreshAll}
                existingWorkouts={allWorkouts}
                onImported={async () => {
                    await refreshAll()
                    setImporting(false)
                }}
            />
        )
    }

    async function handleAdd(fields: WorkoutInput) {
        const created = await createWorkout(fields)
        const r = await listWorkoutsPage(page, debouncedSearch)
        setLib({ workouts: r.workouts, pages: r.pages, total: r.total })
        // New workouts are appended to the end of the library, so once a page is
        // full the new one lands on the last page — follow it there rather than
        // leave the user looking at a page that seems unchanged.
        if (!debouncedSearch && !r.workouts.some((w) => w._id === created._id)) setPage(r.pages)
    }

    async function handleSave(id: string, fields: WorkoutInput) {
        const updated = await updateWorkout(id, fields)
        // Keep an open view drawer showing the saved data.
        setDrawer((d) =>
            d?.mode === 'view' && d.workout._id === id ? { mode: 'view', workout: updated } : d
        )
        await reloadPage()
    }

    async function handleDelete(id: string) {
        setDrawer((d) => (d && d.mode !== 'create' && d.workout._id === id ? null : d))
        await deleteWorkout(id)
        await reloadPage()
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
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-64"
                />
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        icon="fa-solid fa-file-import"
                        onClick={openImport}
                        disabled={openingImport}
                    >
                        Import
                    </Button>
                    <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                        New workout
                    </Button>
                </div>
            </div>

            {libLoading && lib.workouts.length === 0 ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : lib.total === 0 && !debouncedSearch ? (
                <EmptyState
                    icon="fa-solid fa-list-check"
                    title="No workouts yet"
                    description="Combine exercises from your library into a repeatable workout."
                    action={
                        <Button
                            icon="fa-solid fa-plus"
                            onClick={() => setDrawer({ mode: 'create' })}
                        >
                            New workout
                        </Button>
                    }
                />
            ) : lib.total === 0 ? (
                <EmptyState
                    icon="fa-solid fa-magnifying-glass"
                    title="No matches"
                    description={`No workouts match “${debouncedSearch}”.`}
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {lib.workouts.map((workout) => (
                            <Card
                                key={workout._id}
                                as="div"
                                className="relative flex flex-col gap-3"
                            >
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
                                        <p className="mt-0.5 text-xs text-neutral-500">
                                            {workout.main.length}{' '}
                                            {workout.main.length === 1 ? 'exercise' : 'exercises'}
                                            {workout.warmUp.length > 0 && ' + warm-up'}
                                            {workout.main.length > 0 &&
                                                ` · ${workoutMinutes(workout).estimated ? '~' : ''}${workoutMinutes(workout).minutes} min`}
                                        </p>
                                    </div>
                                    <DropdownMenu
                                        align="right"
                                        className="relative z-20 -mr-1 -mt-1 shrink-0"
                                        trigger={
                                            <span
                                                aria-label="Workout actions"
                                                className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
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
                                    <p className="text-sm text-neutral-500">
                                        {workout.description}
                                    </p>
                                )}

                                {workout.main.length > 0 && (
                                    <div className="mt-auto flex flex-wrap gap-1.5 border-t border-neutral-100 pt-3">
                                        {workout.main.slice(0, 4).map((item, i) => {
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
                                        {workout.main.length > 4 && (
                                            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
                                                +{workout.main.length - 4}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </Card>
                        ))}
                    </div>
                    <Pagination
                        page={page}
                        pageCount={lib.pages}
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

/**
 * A library workout opened for a look: the very same view the planner's drawer
 * shows (shared `WorkoutDetail`), just without starting the workout — that's
 * done from the planner. Here it can be edited, deleted or marked as done.
 */
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
    // Steps ticked here are today's for this workout — the same ticks the
    // planner and the logger read on the day.
    const steps = useStepTicks(w ? workoutStepsKey(w._id, todayKey()) : null)

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
            size="2xl"
            title={w?.name ?? 'Workout'}
            footer={
                w && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-3">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            className="mr-auto"
                            onClick={() => onDelete(w._id)}
                        >
                            Delete
                        </Button>
                        <Button variant="secondary" icon="fa-solid fa-pen" onClick={() => onEdit(w)}>
                            Edit
                        </Button>
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-check"
                            onClick={markDone}
                            disabled={logging}
                        >
                            {logging ? 'Logging…' : 'Mark as done'}
                        </Button>
                    </div>
                )
            }
        >
            {w && (
                <WorkoutDetail
                    workout={w}
                    exercisesById={byId}
                    packKey={w._id}
                    stepTicks={steps.ticks}
                    onToggleStep={steps.toggle}
                />
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
    const [bring, setBring] = useState<string[]>([])
    const [selected, setSelected] = useState<Phased<WorkoutExercise>>(emptyPhases)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setName(editing?.name ?? '')
        setDescription(editing?.description ?? '')
        setShowInPlanner(editing?.showInPlanner ?? false)
        setBring(editing?.bring ?? [])
        // Drop any entries that no longer resolve to a library exercise.
        setSelected(
            editing
                ? mapPhases(editing, (list) =>
                      list.filter((e) => exercises.some((x) => x._id === e.exercise))
                  )
                : emptyPhases()
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
            bring,
            ...selected,
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
            size="2xl"
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

                <BringInput value={bring} onChange={setBring} />

                {/* Week planner toggle */}
                <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 p-3">
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-neutral-900">
                            Show in Week Planner
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                            Pin this workout to the top of the planner
                        </p>
                    </div>
                    <Switch checked={showInPlanner} onChange={setShowInPlanner} />
                </div>

                {/* One exercise picker per phase. */}
                {SESSION_PHASES.map((phase) => (
                    <ExercisePicker
                        key={phase}
                        phase={phase}
                        exercises={exercises}
                        selected={selected[phase]}
                        onChange={(rows) => setSelected((prev) => ({ ...prev, [phase]: rows }))}
                    />
                ))}
            </div>
        </Drawer>
    )
}

// ─── Exercise picker ────────────────────────────────────────────────────────────

/**
 * Picks one phase's exercises. The main session's search list is always open;
 * the warm-up's and cool-down's open on demand, so the drawer isn't three long
 * lists stacked up.
 */
function ExercisePicker({
    phase,
    exercises,
    selected,
    onChange,
}: {
    phase: SessionPhase
    exercises: Exercise[]
    selected: WorkoutExercise[]
    onChange: (rows: WorkoutExercise[]) => void
}) {
    const [query, setQuery] = useState('')
    const [browsing, setBrowsing] = useState(phase === 'main')
    /** Lines with their sub-list editor opened (a line with steps always shows it). */
    const [stepsOpen, setStepsOpen] = useState<Set<string>>(new Set())

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
        else {
            onChange([...selected, { exercise: id }])
        }
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
            <PhaseHeading
                phase={phase}
                meta={phaseSpan(selected)}
                right={
                    <div className="flex items-center gap-2">
                        {selected.length > 0 && (
                            <span className="text-xs font-medium text-neutral-500">
                                {selected.length} added
                            </span>
                        )}
                        {phase !== 'main' && exercises.length > 0 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                icon={browsing ? 'fa-solid fa-chevron-up' : 'fa-solid fa-plus'}
                                onClick={() => setBrowsing((b) => !b)}
                            >
                                {browsing ? 'Done' : 'Add exercise'}
                            </Button>
                        )}
                    </div>
                }
            />

            {/* Chosen exercises, in order, with per-exercise sets & reps. */}
            {selected.length > 0 && (
                <ul className="flex flex-col gap-2">
                    {selected.map((row, i) => {
                        const ex = byId.get(row.exercise)
                        if (!ex) return null
                        const showSteps = stepsOpen.has(row.exercise) || !!row.steps?.length
                        return (
                            <li
                                key={row.exercise}
                                className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2.5"
                            >
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium text-neutral-800">
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
                                    className="w-16 rounded-[10px] border border-neutral-200 hover:border-neutral-300 bg-white px-2 h-10.5 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100 focus-visible:outline-none"
                                />
                                <input
                                    type="text"
                                    placeholder="Reps"
                                    aria-label={`Reps for ${ex.name}`}
                                    value={row.reps ?? ''}
                                    onChange={(e) =>
                                        update(row.exercise, { reps: e.target.value || undefined })
                                    }
                                    className="w-24 rounded-[10px] border border-neutral-200 hover:border-neutral-300 bg-white px-2 h-10.5 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100 focus-visible:outline-none"
                                />
                                <button
                                    type="button"
                                    aria-label={`Sub-list for ${ex.name}`}
                                    aria-pressed={showSteps}
                                    title="Add a sub-list of steps to tick off"
                                    onClick={() =>
                                        setStepsOpen((prev) => {
                                            const next = new Set(prev)
                                            if (next.has(row.exercise)) next.delete(row.exercise)
                                            else next.add(row.exercise)
                                            return next
                                        })
                                    }
                                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-colors hover:bg-neutral-100 ${showSteps ? 'text-neutral-900' : 'text-neutral-500'}`}
                                >
                                    <i className="fa-solid fa-list-check text-xs" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Remove ${ex.name}`}
                                    onClick={() => remove(row.exercise)}
                                    className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-red-600"
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                                {showSteps && (
                                    <div className="basis-full pl-8">
                                        <StepsInput
                                            steps={row.steps}
                                            label={ex.name}
                                            onChange={(steps) => update(row.exercise, { steps })}
                                        />
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}

            {exercises.length === 0 ? (
                phase === 'main' && (
                    <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-500">
                        No exercises yet — add some in the Exercises library first.
                    </p>
                )
            ) : !browsing ? (
                selected.length === 0 && (
                    <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-3 text-center text-xs text-neutral-500">
                        {phase === 'warmUp'
                            ? 'No warm-up — the time estimate assumes 8 minutes.'
                            : 'No cool-down.'}
                    </p>
                )
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
                            <li className="px-3 py-4 text-center text-xs text-neutral-500">
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
                                                <i
                                                    className="fa-solid fa-check text-[11px]"
                                                    aria-hidden="true"
                                                />
                                            </span>
                                            <span
                                                className={
                                                    isOn
                                                        ? 'font-medium text-neutral-900'
                                                        : 'text-neutral-600'
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
