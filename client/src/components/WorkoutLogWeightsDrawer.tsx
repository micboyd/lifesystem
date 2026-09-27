import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PhaseHeading, { phaseSpan } from './PhaseHeading'
import Drawer from './Drawer'
import Button from './Button'
import DatePicker from './DatePicker'
import Textarea from './Textarea'
import ExerciseSwapPicker from './ExerciseSwapPicker'
import { VideoButton } from './ExerciseVideo'
import { CompleteButton, PaceBanner, SaveStatus, SlotChip, type SaveState } from './SessionPace'
import { paceOf, type Slot } from '../lib/sessionPace'
import type {
    Exercise,
    LoggedSet,
    SessionPhase,
    Workout,
    WorkoutExercise,
    WorkoutLog,
} from '../types'
import { flattenPhases, phaseOf } from '../lib/phases'
import { updateLog, type WorkoutLogInput } from '../services/workoutLogs'
import { createExercise, type ExerciseInput } from '../services/exercises'
import { useToast } from '../context/ToastContext'
import {
    clearDraft,
    describeAge,
    draftSignature,
    readDraft,
    writeDraft,
    type DraftExercise,
} from '../lib/workoutLogDraft'

function todayISO(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * One resolved exercise row with its editable sets. The shape is shared with the
 * device-local draft, so an in-progress session round-trips through storage
 * exactly as it sits on screen:
 *
 * - `exerciseId`/`name` — the exercise actually being performed, which changes
 *   when the row is swapped; `swappedFrom` keeps the prescribed original.
 * - `prescription` — the "3 × 8-12" hint.
 * - `sets` — weights and reps as typed, so a blank input stays blank.
 * - `removed` — skipped today. The row stays in the array so every index still
 *   lines up with the workout's exercises, and is dropped at save time.
 * - `completedAt` — when its Completed button was pressed in the gym.
 */
type ExerciseDraft = DraftExercise
type SetDraft = ExerciseDraft['sets'][number]

/**
 * Seed a set's reps from the prescription when it's a plain number (e.g. "8"),
 * leaving ranges/AMRAP (e.g. "8-12") blank for the user to fill in.
 */
function seedReps(reps?: string): string {
    const r = reps?.trim() ?? ''
    return /^\d+$/.test(r) ? r : ''
}

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
function formatPrescription(e: WorkoutExercise): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

/** Build the initial drafts for a workout: one row per resolved exercise —
 *  warm-up, main, then cool-down, the order the server snapshots the log in —
 *  seeded with as many blank sets as the prescription calls for (at least one). */
function seedDrafts(workout: Workout, byId: Map<string, Exercise>): ExerciseDraft[] {
    return flattenPhases(workout)
        .map(({ phase, item }) => ({ phase, item, ex: byId.get(item.exercise) }))
        .filter((r): r is { phase: SessionPhase; item: WorkoutExercise; ex: Exercise } => !!r.ex)
        .map(({ phase, item, ex }) => {
            const count = Math.max(1, item.sets && item.sets > 0 ? item.sets : 1)
            const reps = seedReps(item.reps)
            return {
                exerciseId: ex._id,
                name: ex.name,
                ...(phase !== 'main' ? { phase } : {}),
                prescription: formatPrescription(item),
                sets: Array.from({ length: count }, () => ({ weight: '', reps })),
            }
        })
}

/**
 * Identify the workout's line-up for the draft store: the exercises it resolves
 * to, in order. A draft only comes back onto the same line-up it was typed
 * against, so editing the workout retires the draft instead of misaligning it.
 */
function signatureOf(workout: Workout, byId: Map<string, Exercise>): string {
    // Main lines keep their bare id so the signature reads as it always has.
    return draftSignature(
        flattenPhases(workout)
            .filter(({ item }) => byId.has(item.exercise))
            .map(({ phase, item }) =>
                phase === 'main' ? item.exercise : `${phase}:${item.exercise}`
            )
    )
}

/** True for a 404 — the log this session was writing to is gone. */
function isMissing(err: unknown): boolean {
    return (
        typeof err === 'object' &&
        err !== null &&
        (err as { response?: { status?: number } }).response?.status === 404
    )
}

function toNum(s: string): number | undefined {
    const t = s.trim()
    if (t === '') return undefined
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}


/** A set as "60×8" / "60 kg" / "8 reps" for a completed card's summary. */
function setSummary(s: SetDraft): string | null {
    const w = s.weight.trim()
    const r = s.reps.trim()
    if (w && r) return `${w}×${r}`
    if (w) return `${w} kg`
    if (r) return `${r} reps`
    return null
}

/** How long after the last edit the session saves itself to the log. */
const AUTOSAVE_MS = 2000

/**
 * Logging a strength workout in the gym. Each exercise is a card: its planned
 * slot, the weight × reps of each set, and a big Completed button that stamps
 * the time — a banner on top turns those times into "on time / behind / ahead"
 * against the plan, and says what's next and when it's due. A completed card
 * folds down to a one-line summary and the next one scrolls into view.
 *
 * Nothing needs saving by hand. Every edit lands on the device at once (a
 * locked phone or a reload loses nothing), and once there's something worth
 * recording — an exercise completed, a weight typed — it saves itself to the
 * log a couple of seconds later: the first save creates the log, every later one
 * rewrites that same log. Finish saves one last time and closes.
 */
export default function WorkoutLogWeightsDrawer({
    workout,
    byId,
    defaultDate,
    onClose,
    onExerciseCreated,
    onSubmit,
}: {
    workout: Workout | null
    /** The whole exercise library, keyed by id — it resolves the workout's lines
     *  and doubles as the pool the swap picker draws alternatives from. */
    byId: Map<string, Exercise>
    /** Day to pre-fill, e.g. the planned day when opened from the planner. Defaults to today. */
    defaultDate?: string
    onClose: () => void
    /**
     * An exercise was created from the swap picker mid-session. The drawer already
     * holds it locally; this lets the page it opened from take it into its own
     * library state rather than waiting for a reload.
     */
    onExerciseCreated?: (exercise: Exercise) => void
    /** Record the session for the first time, resolving to the log it created —
     *  the drawer keeps the id so later saves update that log instead of adding another. */
    onSubmit: (workout: Workout, fields: WorkoutLogInput) => Promise<WorkoutLog>
}) {
    const toast = useToast()
    // Retain the last workout while the drawer animates closed.
    const [view, setView] = useState<Workout | null>(workout)
    const [date, setDate] = useState(defaultDate ?? todayISO())
    const [notes, setNotes] = useState('')
    const [drafts, setDrafts] = useState<ExerciseDraft[]>([])
    /** Finish is mid-save. */
    const [finishing, setFinishing] = useState(false)
    /** The log this session has been saved to, once it has been saved at all. */
    const [logId, setLogId] = useState<string | null>(null)
    /** Edits made since the last save to the server. */
    const [unsaved, setUnsaved] = useState(false)
    /** Where the entries are: saving, saved to the log, or only on this device. */
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [serverSavedAt, setServerSavedAt] = useState<number | null>(null)
    /** Index of the row whose swap picker is open, or null when none is. */
    const [swapping, setSwapping] = useState<number | null>(null)
    /** Completed cards opened back up to edit their sets. */
    const [expanded, setExpanded] = useState<Set<number>>(new Set())
    /** Set when this session was picked up from a draft, so the drawer can say so. */
    const [restoredFrom, setRestoredFrom] = useState<number | null>(null)
    /** Bumped to re-run the autosave when an edit lands mid-save. */
    const [retick, setRetick] = useState(0)
    /**
     * Whether anything has been typed yet. Opening the drawer and closing it
     * again shouldn't leave a draft behind — only real edits arm the autosave.
     */
    const dirty = useRef(false)
    /** Counts edits, so a save can tell whether more came in while it ran. */
    const edits = useRef(0)
    /** The save in flight, if any — Finish waits for it rather than racing it. */
    const inflight = useRef<Promise<boolean> | null>(null)
    const cards = useRef<(HTMLElement | null)[]>([])

    const signature = useMemo(() => (view ? signatureOf(view, byId) : ''), [view, byId])

    // Each row's planned slot, aligned to the rows the same way the draft is:
    // the workout's resolved lines, warm-up to cool-down. Skipped rows aren't
    // being done, so pacing leaves them out.
    const slots: Slot[] = useMemo(() => {
        if (!view) return []
        return flattenPhases(view)
            .filter(({ item }) => byId.has(item.exercise))
            .map(({ item }, i) =>
                drafts[i]?.removed ? {} : { startMin: item.startMin, endMin: item.endMin }
            )
    }, [view, byId, drafts])
    const times = drafts.map((d) => (d.removed ? null : (d.completedAt ?? null)))
    const pace = paceOf(slots, times)
    // The exercise to do next: the first not skipped and not completed.
    const nextIndex = drafts.findIndex((d) => !d.removed && d.completedAt == null)

    useEffect(() => {
        if (!workout) return
        const seeded = seedDrafts(workout, byId)
        const draft = readDraft(workout._id, signatureOf(workout, byId))
        setView(workout)
        setDate(draft?.date ?? defaultDate ?? todayISO())
        setNotes(draft?.notes ?? '')
        setDrafts(draft?.exercises ?? seeded)
        setSwapping(null)
        setExpanded(new Set())
        setFinishing(false)
        // A restored draft is already on the device — keep saving over it. If it
        // carries a log id, this session is already in the record and every save
        // from here updates it.
        dirty.current = !!draft
        setRestoredFrom(draft?.savedAt ?? null)
        setLogId(draft?.logId ?? null)
        setUnsaved(false)
        setSaveState(draft ? (draft.logId ? 'saved' : 'local') : 'idle')
        setServerSavedAt(null)
    }, [workout, byId, defaultDate])

    /** Everything on screen as one draft, for the device copy. */
    const draftOf = useCallback(
        (id: string | null) => ({
            signature,
            date,
            notes,
            exercises: drafts,
            ...(id ? { logId: id } : {}),
        }),
        [signature, date, notes, drafts]
    )

    // The device copy — written a moment after every edit.
    useEffect(() => {
        if (!view || !dirty.current) return
        const timer = setTimeout(() => writeDraft(view._id, draftOf(logId)), 400)
        return () => clearTimeout(timer)
    }, [view, draftOf, logId])

    /** Arm the autosave — called by every edit before it changes state. */
    function markDirty() {
        dirty.current = true
        edits.current++
        setUnsaved(true)
        setSaveState((s) => (s === 'error' ? s : 'local'))
    }

    /**
     * Save the session to the log as it stands. The first save records the log
     * through `onSubmit`; every later one rewrites that same log, rebuilt from the
     * workout so a row skipped (or put back) since still lands. Resolves false
     * when it failed — the device copy still has everything.
     */
    const saveToLog = useCallback(async (): Promise<boolean> => {
        if (!view) return false
        const edit = edits.current
        // Align one entry per row, in the order the server snapshots. Skipped
        // rows keep their slot — the indices all have to agree — and send
        // nothing; `omitted` is what actually drops them.
        const loggedSets: LoggedSet[][] = drafts.map((ex) =>
            ex.removed
                ? []
                : ex.sets
                      .map((s): LoggedSet => {
                          const weight = toNum(s.weight)
                          const reps = toNum(s.reps)
                          return {
                              ...(weight !== undefined ? { weight } : {}),
                              ...(reps !== undefined ? { reps } : {}),
                          }
                      })
                      .filter((s) => s.weight !== undefined || s.reps !== undefined)
        )
        // The exercise actually performed, or null when the row went as
        // prescribed. Omitted entirely when nothing was swapped.
        const substitutions = drafts.map((ex) =>
            ex.swappedFrom && !ex.removed ? ex.exerciseId : null
        )
        const swapped = substitutions.some(Boolean)
        const omitted = drafts.flatMap((ex, i) => (ex.removed ? [i] : []))
        const completedAt = drafts.map((ex) =>
            ex.completedAt != null && !ex.removed ? new Date(ex.completedAt).toISOString() : null
        )

        const fields: WorkoutLogInput = {
            workout: view._id,
            date,
            // Always a string on the update path, so clearing the notes clears them.
            notes: notes.trim(),
            loggedSets,
            completedAt,
            ...(swapped ? { substitutions } : {}),
            ...(omitted.length ? { omitted } : {}),
        }

        setSaveState('saving')
        try {
            let id = logId
            let written = false
            if (id) {
                try {
                    await updateLog(id, { ...fields, rebuild: true })
                    written = true
                } catch (err) {
                    // The log was deleted while the session was open (unlogged
                    // from the planner, say) — record it afresh rather than
                    // stranding everything since.
                    if (!isMissing(err)) throw err
                    id = null
                }
            }
            if (!written) {
                const log = await onSubmit(view, fields)
                id = log._id
                setLogId(id)
                // Keep the device copy pointing at the log, so reopening the
                // workout carries on writing to it instead of logging twice.
                writeDraft(view._id, draftOf(id))
            }
            setServerSavedAt(Date.now())
            if (edits.current === edit) {
                setUnsaved(false)
                setSaveState('saved')
            } else {
                // More came in while this ran — go again.
                setRetick((n) => n + 1)
            }
            return true
        } catch {
            setSaveState('error')
            return false
        }
    }, [view, drafts, date, notes, logId, onSubmit, draftOf])

    /** One save at a time: a second waits for the first rather than racing it. */
    const save = useCallback(async (): Promise<boolean> => {
        while (inflight.current) await inflight.current
        const run = saveToLog()
        inflight.current = run
        try {
            return await run
        } finally {
            inflight.current = null
        }
    }, [saveToLog])

    // Autosave to the log — once there's something worth recording.
    const worthSaving =
        !!logId ||
        drafts.some(
            (d) => !d.removed && (d.completedAt != null || d.sets.some((s) => s.weight.trim()))
        )
    useEffect(() => {
        if (!view || !unsaved || !worthSaving) return
        const timer = setTimeout(() => void save(), AUTOSAVE_MS)
        return () => clearTimeout(timer)
        // `save` is rebuilt on every edit, which already restarts the timer.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, unsaved, worthSaving, drafts, notes, date, retick])

    /** Save one last time and close. */
    async function finish() {
        if (!view) return
        setFinishing(true)
        const ok = await save()
        setFinishing(false)
        if (!ok) {
            toast.error('Could not save the log. Your entries are still here.')
            return
        }
        // It's history now, so the in-progress copy has done its job.
        clearDraft(view._id)
        onClose()
    }

    /** Throw the draft away and start the log from the workout as written. */
    function discardDraft() {
        if (!view) return
        clearDraft(view._id)
        setDrafts(seedDrafts(view, byId))
        setDate(defaultDate ?? todayISO())
        setNotes('')
        setSwapping(null)
        setExpanded(new Set())
        dirty.current = false
        setRestoredFrom(null)
        setUnsaved(false)
        setSaveState('idle')
    }

    /**
     * Exercises added from the swap picker during this session. They're kept
     * beside `byId` rather than folded into it, so seeding and the draft
     * signature still see exactly the library the workout was written against —
     * a brand-new exercise can't be part of a prescription, only a stand-in for one.
     */
    const [created, setCreated] = useState<Exercise[]>([])

    /** The library as the picker sees it: what the page passed, plus tonight's additions. */
    const resolved = useMemo(() => {
        if (created.length === 0) return byId
        const m = new Map(byId)
        for (const ex of created) m.set(ex._id, ex)
        return m
    }, [byId, created])

    const library = useMemo(() => [...resolved.values()], [resolved])

    /** Add an exercise to the library from inside the picker, mid-session. */
    async function handleCreateExercise(fields: ExerciseInput): Promise<Exercise> {
        const exercise = await createExercise(fields)
        setCreated((prev) => [...prev, exercise])
        onExerciseCreated?.(exercise)
        toast.show(`${exercise.name} added to your library.`, 'success')
        return exercise
    }

    // Everything already in this session — the picker shouldn't offer a movement
    // back to you that you're doing two rows down anyway. A skipped row is fair
    // game again, since it isn't being done.
    const inSession = useMemo(
        () => drafts.filter((d) => !d.removed).map((d) => d.exerciseId),
        [drafts]
    )

    // Phase headings only earn their place once a warm-up or cool-down is in play.
    const phased = drafts.some((d) => phaseOf(d) !== 'main')
    /** Whether row `i` is the first visible row of its phase. */
    function phaseStarts(i: number): boolean {
        const phase = phaseOf(drafts[i])
        for (let j = i - 1; j >= 0; j--) {
            if (drafts[j].removed) continue
            return phaseOf(drafts[j]) !== phase
        }
        return true
    }

    /** Rows skipped today, with the index each one sits at. */
    const skipped = useMemo(
        () => drafts.map((ex, i) => ({ ex, i })).filter(({ ex }) => ex.removed),
        [drafts]
    )

    // Total training volume (Σ weight × reps) across every filled set, in kg.
    // Skipped rows don't count — they aren't being performed.
    const volume = useMemo(() => {
        let total = 0
        for (const ex of drafts) {
            if (ex.removed) continue
            for (const s of ex.sets) {
                const w = toNum(s.weight)
                const r = toNum(s.reps)
                if (w !== undefined && r !== undefined) total += w * r
            }
        }
        return Math.round(total)
    }, [drafts])

    function patchRow(ei: number, patch: Partial<ExerciseDraft>) {
        markDirty()
        setDrafts((prev) => prev.map((ex, i) => (i === ei ? { ...ex, ...patch } : ex)))
    }

    function updateSet(ei: number, si: number, patch: Partial<SetDraft>) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) =>
                i === ei
                    ? { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
                    : ex
            )
        )
    }

    function addSet(ei: number) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) => {
                if (i !== ei) return ex
                // A new set copies the last set's weight and reps — the next set
                // is usually the same again.
                const last = ex.sets[ex.sets.length - 1]
                return {
                    ...ex,
                    sets: [...ex.sets, { weight: last?.weight ?? '', reps: last?.reps ?? '' }],
                }
            })
        )
    }

    function removeSet(ei: number, si: number) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) =>
                i === ei ? { ...ex, sets: ex.sets.filter((_, j) => j !== si) } : ex
            )
        )
    }

    /**
     * Stamp an exercise completed now, fold its card down and bring the next
     * one into view — in the gym you're straight on to it.
     */
    function complete(ei: number) {
        patchRow(ei, { completedAt: Date.now() })
        setExpanded((prev) => {
            const next = new Set(prev)
            next.delete(ei)
            return next
        })
        setSwapping(null)
        const upcoming = drafts.findIndex(
            (d, i) => i !== ei && !d.removed && d.completedAt == null
        )
        if (upcoming !== -1) {
            setTimeout(
                () => cards.current[upcoming]?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
                60
            )
        }
    }

    function uncomplete(ei: number) {
        patchRow(ei, { completedAt: undefined })
    }

    function toggleExpanded(ei: number) {
        setExpanded((prev) => {
            const next = new Set(prev)
            if (next.has(ei)) next.delete(ei)
            else next.add(ei)
            return next
        })
    }

    /**
     * Skip an exercise for this session — the machine was taken, the shoulder
     * wasn't having it, you ran out of time. The row stays in the draft (one tap
     * from coming back, and keeping every index aligned with the workout's
     * exercises) and is dropped from the log at save time.
     */
    function removeExercise(ei: number) {
        setSwapping(null)
        patchRow(ei, { removed: true })
    }

    /** Put a skipped exercise back, with whatever was already typed into it. */
    function restoreExercise(ei: number) {
        patchRow(ei, { removed: undefined })
    }

    /**
     * Point a row at a different exercise. The prescription and any sets already
     * typed stay put — you're doing the same work on different kit, so the target
     * volume still applies. `swappedFrom` keeps the *first* origin, so swapping
     * twice still records what the workout originally asked for.
     */
    function applySwap(ei: number, exercise: Exercise) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) => {
                if (i !== ei) return ex
                const origin = ex.swappedFrom ?? { id: ex.exerciseId, name: ex.name }
                // Swapping back to the original is an undo, not a substitution.
                if (exercise._id === origin.id) {
                    return {
                        ...ex,
                        exerciseId: origin.id,
                        name: origin.name,
                        swappedFrom: undefined,
                    }
                }
                return { ...ex, exerciseId: exercise._id, name: exercise.name, swappedFrom: origin }
            })
        )
        setSwapping(null)
    }

    function undoSwap(ei: number) {
        const ex = drafts[ei]
        if (!ex?.swappedFrom) return
        patchRow(ei, {
            exerciseId: ex.swappedFrom.id,
            name: ex.swappedFrom.name,
            swappedFrom: undefined,
        })
    }

    const w = view
    const inputCls =
        'h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-base tabular-nums text-neutral-900 outline-none transition-all placeholder:text-neutral-300 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200 sm:text-sm'

    return (
        <Drawer
            open={!!workout}
            onClose={onClose}
            size="2xl"
            title={w ? w.name : 'Log workout'}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm text-neutral-500">
                            Volume{' '}
                            <span className="font-semibold tabular-nums text-neutral-900">
                                {volume.toLocaleString()} kg
                            </span>
                        </span>
                        <SaveStatus
                            state={saveState}
                            savedAt={saveState === 'saved' ? serverSavedAt : null}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                        <Button icon="fa-solid fa-flag-checkered" onClick={finish} disabled={finishing}>
                            {finishing ? 'Saving…' : 'Finish'}
                        </Button>
                    </div>
                </div>
            }
        >
            {w && (
                <div className="flex flex-col gap-5">
                    <PaceBanner slots={slots} completedAt={times} names={drafts.map((d) => d.name)} />

                    {restoredFrom !== null && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marigold-200 bg-marigold-50 px-3 py-2 text-xs text-amber-800">
                            <span className="inline-flex items-center gap-2">
                                <i
                                    className="fa-solid fa-clock-rotate-left text-[11px]"
                                    aria-hidden="true"
                                />
                                {logId
                                    ? `Back in this session — last saved ${describeAge(restoredFrom)}.`
                                    : `Picked up where you left off — ${describeAge(restoredFrom)}.`}
                            </span>
                            {/* Only before the first save: once the session is in
                                the log, throwing the draft away would strand it. */}
                            {!logId && (
                                <button
                                    type="button"
                                    onClick={discardDraft}
                                    className="font-semibold text-amber-900 underline-offset-2 transition-colors hover:underline"
                                >
                                    Start fresh
                                </button>
                            )}
                        </div>
                    )}

                    {drafts.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                            This workout has no exercises to record.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {drafts.map((ex, ei) => {
                                if (ex.removed) return null
                                const done = ex.completedAt != null
                                const folded = done && !expanded.has(ei)
                                const summary = ex.sets.map(setSummary).filter(Boolean)
                                return (
                                    <div key={ei} className="flex flex-col gap-2">
                                        {phased && phaseStarts(ei) && (
                                            <PhaseHeading
                                                phase={phaseOf(ex)}
                                                meta={phaseSpan(
                                                    slots.filter(
                                                        (_, i) =>
                                                            !drafts[i]?.removed &&
                                                            phaseOf(drafts[i]) === phaseOf(ex)
                                                    )
                                                )}
                                                className={ei === 0 ? '' : 'mt-4'}
                                            />
                                        )}
                                        <section
                                            ref={(el) => {
                                                cards.current[ei] = el
                                            }}
                                            className={`flex flex-col gap-3 rounded-2xl border p-3 transition-colors sm:p-4 ${
                                                done
                                                    ? 'border-emerald-200 bg-emerald-50/30'
                                                    : ei === nextIndex
                                                      ? 'border-coral-200 ring-1 ring-coral-100'
                                                      : 'border-neutral-200'
                                            }`}
                                        >
                                            {/* Header: name, planned slot, target; swap and skip. */}
                                            <div className="flex items-start justify-between gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => done && toggleExpanded(ei)}
                                                    className={`min-w-0 text-left ${done ? 'cursor-pointer' : 'cursor-default'}`}
                                                    aria-expanded={done ? !folded : undefined}
                                                >
                                                    <p className="text-base font-semibold text-neutral-900">
                                                        {ex.name}
                                                    </p>
                                                    <p className="mt-0.5 text-xs text-neutral-400">
                                                        {folded
                                                            ? summary.length
                                                                ? summary.join(' · ')
                                                                : 'No sets recorded'
                                                            : ex.prescription
                                                              ? `Target ${ex.prescription}`
                                                              : 'No target set'}
                                                    </p>
                                                </button>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <SlotChip slot={slots[ei] ?? {}} />
                                                    <VideoButton
                                                        url={resolved.get(ex.exerciseId)?.videoUrl}
                                                        title={ex.name}
                                                    />
                                                    {!folded && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setSwapping(
                                                                        swapping === ei ? null : ei
                                                                    )
                                                                }
                                                                aria-expanded={swapping === ei}
                                                                aria-label={`Swap ${ex.name}`}
                                                                title="Machine taken? Swap this out"
                                                                className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                                                            >
                                                                <i
                                                                    className="fa-solid fa-right-left text-xs"
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeExercise(ei)}
                                                                aria-label={`Skip ${ex.name}`}
                                                                title="Skip this exercise today"
                                                                className="grid h-9 w-9 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-coral-600"
                                                            >
                                                                <i
                                                                    className="fa-solid fa-ban text-xs"
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {ex.swappedFrom && !folded && (
                                                <p className="-mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-400">
                                                    <span>
                                                        Swapped in for{' '}
                                                        <span className="font-medium text-neutral-500">
                                                            {ex.swappedFrom.name}
                                                        </span>
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => undoSwap(ei)}
                                                        className="font-semibold text-coral-600 transition-colors hover:text-coral-700"
                                                    >
                                                        Undo
                                                    </button>
                                                </p>
                                            )}

                                            {swapping === ei && resolved.get(ex.exerciseId) && (
                                                <ExerciseSwapPicker
                                                    target={resolved.get(ex.exerciseId)!}
                                                    library={library}
                                                    excludeIds={inSession}
                                                    onPick={(picked) => applySwap(ei, picked)}
                                                    onCreate={handleCreateExercise}
                                                    onCancel={() => setSwapping(null)}
                                                />
                                            )}

                                            {!folded && (
                                                <div className="flex flex-col gap-2">
                                                    <div className="grid grid-cols-[1.75rem_1fr_1fr_2.25rem] items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                                        <span>Set</span>
                                                        <span>kg</span>
                                                        <span>Reps</span>
                                                        <span />
                                                    </div>
                                                    {ex.sets.map((s, si) => (
                                                        <div
                                                            key={si}
                                                            className="grid grid-cols-[1.75rem_1fr_1fr_2.25rem] items-center gap-2"
                                                        >
                                                            <span className="grid h-7 w-7 place-items-center rounded-full bg-neutral-100 text-xs font-semibold tabular-nums text-neutral-500">
                                                                {si + 1}
                                                            </span>
                                                            <input
                                                                type="number"
                                                                inputMode="decimal"
                                                                min={0}
                                                                step="any"
                                                                placeholder="—"
                                                                aria-label={`Set ${si + 1} weight`}
                                                                value={s.weight}
                                                                onChange={(e) =>
                                                                    updateSet(ei, si, {
                                                                        weight: e.target.value,
                                                                    })
                                                                }
                                                                className={inputCls}
                                                            />
                                                            <input
                                                                type="number"
                                                                inputMode="numeric"
                                                                min={0}
                                                                step="1"
                                                                placeholder="—"
                                                                aria-label={`Set ${si + 1} reps`}
                                                                value={s.reps}
                                                                onChange={(e) =>
                                                                    updateSet(ei, si, {
                                                                        reps: e.target.value,
                                                                    })
                                                                }
                                                                className={inputCls}
                                                            />
                                                            <button
                                                                type="button"
                                                                aria-label={`Remove set ${si + 1}`}
                                                                onClick={() => removeSet(ei, si)}
                                                                disabled={ex.sets.length === 1}
                                                                className="grid h-9 w-9 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-0"
                                                            >
                                                                <i className="fa-solid fa-xmark text-xs" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button
                                                        type="button"
                                                        onClick={() => addSet(ei)}
                                                        className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg px-2 text-xs font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                                                    >
                                                        <i className="fa-solid fa-plus text-[10px]" />
                                                        Add set
                                                    </button>
                                                </div>
                                            )}

                                            <CompleteButton
                                                completedAt={ex.completedAt}
                                                delta={pace.delta[ei]}
                                                isNext={ei === nextIndex}
                                                onComplete={() => complete(ei)}
                                                onUndo={() => uncomplete(ei)}
                                            />
                                        </section>
                                    </div>
                                )
                            })}

                            {skipped.length === drafts.length && (
                                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                                    Every exercise skipped — finishing records the session with no
                                    lifts against it.
                                </p>
                            )}

                            {skipped.length > 0 && (
                                <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 px-3 py-3">
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                        Skipped today · left out of the log
                                    </p>
                                    {skipped.map(({ ex, i }) => (
                                        <div
                                            key={i}
                                            className="flex items-center justify-between gap-2"
                                        >
                                            <span className="min-w-0 truncate text-sm text-neutral-500 line-through">
                                                {ex.name}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => restoreExercise(i)}
                                                className="shrink-0 px-1 py-1 text-xs font-semibold text-coral-600 transition-colors hover:text-coral-700"
                                            >
                                                Put back
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    <Textarea
                        label="Notes"
                        rows={3}
                        placeholder="How did it go? Anything to remember for next time…"
                        value={notes}
                        onChange={(e) => {
                            markDirty()
                            setNotes(e.target.value)
                        }}
                    />

                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Date
                        </label>
                        <DatePicker
                            value={date}
                            maxDate={todayISO()}
                            onChange={(v) => {
                                markDirty()
                                setDate(typeof v === 'string' ? v : todayISO())
                            }}
                        />
                    </div>
                </div>
            )}
        </Drawer>
    )
}
