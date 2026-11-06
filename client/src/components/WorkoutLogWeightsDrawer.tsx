import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BringChips } from './BringList'
import { PhaseChip } from './PhaseHeading'
import Drawer from './Drawer'
import Button from './Button'
import DatePicker from './DatePicker'
import Textarea from './Textarea'
import ExerciseSwapPicker from './ExerciseSwapPicker'
import { VideoButton } from './ExerciseVideo'
import { SaveStatus, type SaveState } from './SessionPace'
import { ItemCue, StepChecklist, useStepTicks, workoutStepsKey } from './session/SessionUI'
import {
    SummaryExerciseList,
    SummaryStats,
    lastTimeFor,
    suggestNext,
    type LastTime,
    type Suggestion,
} from './session/WorkoutSummary'
import { resolveTags } from '../lib/exerciseSwap'
import {
    describeSet,
    lastSetsFor,
    setDelta,
    setInsight,
    shortSet,
    type LastSets,
    type TodaySet,
} from '../lib/setInsight'
import type {
    Exercise,
    LoggedSet,
    SessionPhase,
    Workout,
    WorkoutExercise,
    WorkoutLog,
} from '../types'
import { flattenPhases, phaseOf } from '../lib/phases'
import { listLogs, updateLog, type WorkoutLogInput } from '../services/workoutLogs'
import { formatLogDate } from '../lib/logFilters'
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
import { seedDrafts, seedFromLog } from '../lib/workoutLogEdit'

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
 * - `sets` — weights and reps as typed, so a blank input stays blank, and
 *   whether each was ticked off. Only ticked sets go into the log.
 * - `removed` — skipped today. The row stays in the array so every index still
 *   lines up with the workout's exercises, and is dropped at save time.
 */
type ExerciseDraft = DraftExercise
type SetDraft = ExerciseDraft['sets'][number]

/** Where the stepper is: on one exercise (its row index), or the wrap-up. */
type Step = number | 'summary'

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

/** A set as "60 kg × 8" / "60 kg" / "8 reps" / "done", for the wrap-up. */
function setSummary(s: SetDraft): string {
    const w = s.weight.trim()
    const r = s.reps.trim()
    if (w && r) return `${w}kg × ${r}`
    if (w) return `${w}kg`
    if (r) return `${r} reps`
    return 'done'
}

/**
 * Warm-ups are a checklist, not sets and reps: one tick says it's done, and
 * nothing from them goes into the log's sets.
 */
function isWarmUp(ex: ExerciseDraft): boolean {
    return ex.phase === 'warmUp'
}

/** How far through an exercise is: none, some or all of its sets ticked. */
function progressOf(ex: ExerciseDraft): 'none' | 'some' | 'all' {
    const done = ex.sets.filter((s) => s.done).length
    if (isWarmUp(ex)) return done > 0 ? 'all' : 'none'
    if (done === 0) return 'none'
    return done === ex.sets.length ? 'all' : 'some'
}

/** Where to open: the first exercise not finished, else the wrap-up. */
function resumeStep(drafts: ExerciseDraft[]): Step {
    const i = drafts.findIndex((d) => !d.removed && progressOf(d) !== 'all')
    return i !== -1 ? i : 'summary'
}

/** The ticked sets of a row as numbers, for the log. Warm-ups and skipped rows send none. */
function loggedSetsOf(ex: ExerciseDraft): LoggedSet[] {
    if (ex.removed || isWarmUp(ex)) return []
    return ex.sets
        .filter((s) => s.done)
        .map((s): LoggedSet => {
            const weight = toNum(s.weight)
            const reps = toNum(s.reps)
            return {
                ...(weight !== undefined ? { weight } : {}),
                ...(reps !== undefined ? { reps } : {}),
            }
        })
        .filter((s) => s.weight !== undefined || s.reps !== undefined)
}

/** Stepper order: warm-up, main, cool-down. Added rows are main work, so they
 *  slot in after the workout's main exercises and ahead of its cool-down. */
const PHASE_RANK: Record<SessionPhase, number> = { warmUp: 0, main: 1, coolDown: 2 }

/** How many blank sets an added exercise starts with when there's no history. */
const ADDED_SETS = 3

/** How long after the last edit the session saves itself to the log. */
const AUTOSAVE_MS = 2000

/**
 * Logging a strength workout in the gym, one exercise at a time. A stepper runs
 * across the top; each step is a single exercise — its target, any cue and
 * sub-list, and its sets to fill in and tick off — with Back and Next at the
 * bottom. After the last exercise comes a wrap-up: what was done, notes, the
 * date, and Finish.
 *
 * Nothing needs saving by hand. Every edit lands on the device at once (a
 * locked phone or a reload loses nothing), and once there's something worth
 * recording — a set ticked, a weight typed — it saves itself to the log a
 * couple of seconds later: the first save creates the log, every later one
 * rewrites that same log. Finish saves one last time and closes.
 */
export default function WorkoutLogWeightsDrawer({
    workout,
    byId,
    defaultDate,
    onClose,
    onExerciseCreated,
    onSubmit,
    log,
    onSaved,
}: {
    workout: Workout | null
    /**
     * A log of this workout that's already been saved, to reopen for editing.
     * The logger opens on its wrap-up with everything as it was recorded, and
     * every change saves back into that same log.
     */
    log?: WorkoutLog | null
    /** The log was written — handed the saved record, e.g. to follow a change of date. */
    onSaved?: (log: WorkoutLog) => void
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
    const [step, setStep] = useState<Step>(0)
    /** Finish is mid-save. */
    const [finishing, setFinishing] = useState(false)
    /** The log this session has been saved to, once it has been saved at all. */
    const [logId, setLogId] = useState<string | null>(null)
    /** Edits made since the last save to the server. */
    const [unsaved, setUnsaved] = useState(false)
    /** Where the entries are: saving, saved to the log, or only on this device. */
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [serverSavedAt, setServerSavedAt] = useState<number | null>(null)
    /** The swap picker is open on the current exercise. */
    const [swapping, setSwapping] = useState(false)
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
    /** The top of the step, scrolled back into view on every move. */
    const top = useRef<HTMLDivElement | null>(null)

    const signature = useMemo(() => (view ? signatureOf(view, byId) : ''), [view, byId])

    // Each row's line in the workout, aligned to the rows the same way the draft
    // is — its rest, cue and sub-list.
    const lines: WorkoutExercise[] = useMemo(
        () =>
            view
                ? flattenPhases(view)
                      .filter(({ item }) => byId.has(item.exercise))
                      .map(({ item }) => item)
                : [],
        [view, byId]
    )
    // Sub-list ticks, shared with the planner drawer for the same workout and day.
    const stepTicks = useStepTicks(view ? workoutStepsKey(view._id, date) : null)

    /** Past logs, for the "last time" note on each exercise. Fetched as the drawer opens. */
    const [history, setHistory] = useState<WorkoutLog[]>([])
    useEffect(() => {
        if (!workout) return
        let live = true
        listLogs()
            .then((logs) => live && setHistory(logs))
            .catch(() => {})
        return () => {
            live = false
        }
    }, [workout])

    useEffect(() => {
        if (!workout) return
        const found = readDraft(workout._id, signatureOf(workout, byId))
        // Reopening a saved log: a device copy is only this session if it was
        // writing to that same log; otherwise the rows come from the log itself.
        const draft = log ? (found?.logId === log._id ? found : null) : found
        const fromLog = log && !draft ? seedFromLog(workout, log, byId) : null
        const rows = draft?.exercises ?? fromLog ?? seedDrafts(workout, byId)
        setView(workout)
        setDate(draft?.date ?? (fromLog ? log!.date : undefined) ?? defaultDate ?? todayISO())
        setNotes(draft?.notes ?? (fromLog ? (log!.notes ?? '') : ''))
        setDrafts(rows)
        // A finished session opens on its wrap-up: everything at a glance, tap to change.
        setStep(log ? 'summary' : resumeStep(rows))
        setSwapping(false)
        setFinishing(false)
        // A restored draft is already on the device — keep saving over it. If it
        // carries a log id, this session is already in the record and every save
        // from here updates it.
        dirty.current = !!draft
        setRestoredFrom(draft && !log ? draft.savedAt : null)
        setLogId(draft?.logId ?? (fromLog ? log!._id : null))
        setUnsaved(false)
        setSaveState(draft ? (draft.logId ? 'saved' : 'local') : fromLog ? 'saved' : 'idle')
        setServerSavedAt(null)
        // `log` is read once, as the drawer opens on a workout.
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // The workout's own rows come first and line up one-to-one with the lines
        // the server snapshots; rows added today sit after them and go separately.
        const own = drafts.filter((ex) => !ex.added)
        // Align one entry per row, in the order the server snapshots. Skipped
        // rows keep their slot — the indices all have to agree — and send
        // nothing; `omitted` is what actually drops them. Only ticked sets count.
        const loggedSets: LoggedSet[][] = own.map(loggedSetsOf)
        // The exercise actually performed, or null when the row went as
        // prescribed. Omitted entirely when nothing was swapped.
        const substitutions = own.map((ex) =>
            ex.swappedFrom && !ex.removed ? ex.exerciseId : null
        )
        const swapped = substitutions.some(Boolean)
        const omitted = own.flatMap((ex, i) => (ex.removed ? [i] : []))
        const added = drafts
            .filter((ex) => ex.added && !ex.removed)
            .map((ex) => ({ exercise: ex.exerciseId, loggedSets: loggedSetsOf(ex) }))

        const fields: WorkoutLogInput = {
            workout: view._id,
            date,
            // Always a string on the update path, so clearing the notes clears them.
            notes: notes.trim(),
            loggedSets,
            ...(swapped ? { substitutions } : {}),
            ...(omitted.length ? { omitted } : {}),
            // Always sent, so removing the last added exercise clears it from the log.
            added,
        }

        setSaveState('saving')
        try {
            let id = logId
            let written = false
            if (id) {
                try {
                    onSaved?.(await updateLog(id, { ...fields, rebuild: true }))
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
                const created = await onSubmit(view, fields)
                onSaved?.(created)
                id = created._id
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
    }, [view, drafts, date, notes, logId, onSubmit, onSaved, draftOf])

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
        !!logId || drafts.some((d) => !d.removed && d.sets.some((s) => s.done || s.weight.trim()))
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
        const rows = seedDrafts(view, byId)
        setDrafts(rows)
        setStep(resumeStep(rows))
        setDate(defaultDate ?? todayISO())
        setNotes('')
        setSwapping(false)
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

    /** The exercises being done today, in order — the steps of the stepper. */
    const active = useMemo(
        () =>
            drafts
                .flatMap((d, i) => (d.removed ? [] : [i]))
                .sort(
                    (a, b) =>
                        PHASE_RANK[phaseOf(drafts[a])] - PHASE_RANK[phaseOf(drafts[b])] || a - b
                ),
        [drafts]
    )

    /** Rows skipped today, with the index each one sits at. */
    const skipped = useMemo(
        () => drafts.map((ex, i) => ({ ex, i })).filter(({ ex }) => ex.removed),
        [drafts]
    )

    // Total training volume (Σ weight × reps) across every ticked set, in kg.
    const volume = useMemo(() => {
        let total = 0
        for (const ex of drafts) {
            if (ex.removed) continue
            for (const s of ex.sets) {
                if (!s.done) continue
                const w = toNum(s.weight)
                const r = toNum(s.reps)
                if (w !== undefined && r !== undefined) total += w * r
            }
        }
        return Math.round(total)
    }, [drafts])

    const setsDone = drafts.reduce(
        (n, d) => n + (d.removed || isWarmUp(d) ? 0 : d.sets.filter((s) => s.done).length),
        0
    )
    const exercisesDone = drafts.filter((d) => !d.removed && progressOf(d) === 'all').length

    // ── Moving between steps ──────────────────────────────────────────────────

    function goTo(next: Step) {
        setStep(next)
        setSwapping(false)
        setAdding(false)
        setTimeout(() => top.current?.scrollIntoView({ block: 'start' }), 0)
    }

    const current = typeof step === 'number' ? drafts[step] : undefined
    const onSummary = !current || current.removed
    /** Where the stepper stands among today's exercises; the wrap-up comes after them all. */
    const pos = onSummary ? active.length : active.indexOf(step as number)
    const isLast = pos === active.length - 1

    function goNext() {
        goTo(pos + 1 < active.length ? active[pos + 1] : 'summary')
    }
    function goBack() {
        if (pos > 0) goTo(active[pos - 1])
    }

    // ── Editing the current exercise ──────────────────────────────────────────

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

    /**
     * Tick a set off (or back on). Ticking carries its weight down to the next
     * set if that one's still blank — the next set is usually the same again.
     */
    function toggleSet(ei: number, si: number) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) => {
                if (i !== ei) return ex
                const done = !ex.sets[si].done
                const sets = ex.sets.map((s, j) => {
                    if (j === si) return { ...s, done }
                    if (done && j === si + 1 && !s.weight.trim() && !s.done)
                        return { ...s, weight: ex.sets[si].weight }
                    return s
                })
                return { ...ex, sets }
            })
        )
    }

    /** Put the suggested load (and reps, if blank) on every set not done yet. */
    function applySuggestion(ei: number, sg: Suggestion) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) =>
                i === ei
                    ? {
                          ...ex,
                          sets: ex.sets.map((s) =>
                              s.done
                                  ? s
                                  : {
                                        ...s,
                                        weight: String(sg.weight),
                                        reps: s.reps.trim() || (sg.reps ? String(sg.reps) : ''),
                                    }
                          ),
                      }
                    : ex
            )
        )
    }

    /** A warm-up's one tick: done or not. */
    function setWarmUpDone(ei: number, done: boolean) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) =>
                i === ei
                    ? { ...ex, sets: ex.sets.map((s, j) => (j === 0 ? { ...s, done } : s)) }
                    : ex
            )
        )
    }

    /** Tick a sub-list step; finishing a warm-up's whole checklist marks it done. */
    function toggleStep(ei: number, si: number) {
        stepTicks.toggle(ei, si)
        const ex = drafts[ei]
        const steps = lines[ei]?.steps ?? []
        if (!ex || !isWarmUp(ex) || steps.length === 0) return
        const was = stepTicks.ticks[ei] ?? []
        const now = was.includes(si) ? was.filter((x) => x !== si) : [...was, si]
        const all = steps.every((_, i) => now.includes(i))
        if (all !== !!ex.sets[0]?.done) setWarmUpDone(ei, all)
    }

    function addSet(ei: number) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) => {
                if (i !== ei) return ex
                // A new set copies the last set's weight and reps.
                const last = ex.sets[ex.sets.length - 1]
                return {
                    ...ex,
                    sets: [...ex.sets, { weight: last?.weight ?? '', reps: last?.reps ?? '' }],
                }
            })
        )
    }

    function removeLastSet(ei: number) {
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) =>
                i === ei && ex.sets.length > 1 ? { ...ex, sets: ex.sets.slice(0, -1) } : ex
            )
        )
    }

    /**
     * Skip an exercise for this session — the machine was taken, the shoulder
     * wasn't having it. The row stays in the draft (one tap from coming back on
     * the wrap-up, and keeping every index aligned with the workout's exercises)
     * and is dropped from the log at save time. The stepper moves on.
     */
    function skipExercise(ei: number) {
        const next = active.find((i) => i > ei)
        patchRow(ei, { removed: true })
        goTo(next ?? 'summary')
    }

    /** Put a skipped exercise back, and go to it. */
    function restoreExercise(ei: number) {
        patchRow(ei, { removed: undefined })
        setAdding(false)
        goTo(ei)
    }

    /** The add-an-exercise picker is open. */
    const [adding, setAdding] = useState(false)

    /**
     * Add an exercise to this session only — the workout itself is left alone.
     * It starts with as many blank sets as last time (or three), and the stepper
     * goes straight to it.
     */
    function addExercise(exercise: Exercise) {
        const count = lastSetsFor(history, exercise.name, logId)?.sets.length || ADDED_SETS
        const at = drafts.length
        markDirty()
        setDrafts((prev) => [
            ...prev,
            {
                exerciseId: exercise._id,
                name: exercise.name,
                prescription: '',
                added: true,
                sets: Array.from({ length: count }, () => ({ weight: '', reps: '' })),
            },
        ])
        setAdding(false)
        goTo(at)
    }

    /**
     * Take an added exercise back out. Nothing of the workout's to keep in step
     * with, so it goes entirely rather than sitting in the skipped list. Added
     * rows are last in the array, so removing one shifts only the added rows after it.
     */
    function removeAdded(ei: number) {
        const next = active[active.indexOf(ei) + 1]
        markDirty()
        setDrafts((prev) => prev.filter((_, i) => i !== ei))
        goTo(next === undefined ? 'summary' : next > ei ? next - 1 : next)
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
                // An added row has no prescription to stand in for — just change it.
                if (ex.added) return { ...ex, exerciseId: exercise._id, name: exercise.name }
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
        setSwapping(false)
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

    const lastTime = current ? lastTimeFor(history, current.name, logId) : null
    const lastSets = current ? lastSetsFor(history, current.name, logId) : null
    const currentEx = current ? resolved.get(current.exerciseId) : undefined
    const equipment = (currentEx && resolveTags(currentEx).equipment) || ''

    return (
        <Drawer
            open={!!workout}
            onClose={onClose}
            size="2xl"
            title={w ? w.name : 'Log workout'}
            footer={
                <div className="flex w-full items-center gap-3">
                    <div className="mr-auto min-w-0">
                        <SaveStatus
                            state={saveState}
                            savedAt={saveState === 'saved' ? serverSavedAt : null}
                        />
                    </div>
                    {pos > 0 && (
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-arrow-left"
                            onClick={goBack}
                            aria-label="Previous exercise"
                        >
                            <span className="hidden sm:inline">Back</span>
                        </Button>
                    )}
                    {onSummary ? (
                        <Button
                            icon="fa-solid fa-flag-checkered"
                            onClick={finish}
                            disabled={finishing}
                        >
                            {finishing ? 'Saving…' : log ? 'Done' : 'Finish workout'}
                        </Button>
                    ) : (
                        <Button onClick={goNext}>
                            {isLast ? 'Wrap up' : 'Next exercise'}
                            <i
                                className="fa-solid fa-arrow-right ml-2 text-xs"
                                aria-hidden="true"
                            />
                        </Button>
                    )}
                </div>
            }
        >
            {w && (
                <div ref={top} className="flex scroll-mt-5 flex-col gap-6">
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
                        <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-500">
                            This workout has no exercises to record.
                        </p>
                    ) : (
                        <>
                            <StepperBar
                                drafts={drafts}
                                active={active}
                                step={onSummary ? 'summary' : step}
                                onGo={goTo}
                                adding={adding}
                                onAdd={() => {
                                    setSwapping(false)
                                    setAdding((v) => !v)
                                }}
                            />

                            {adding && (
                                <ExerciseSwapPicker
                                    library={library}
                                    excludeIds={inSession}
                                    onPick={addExercise}
                                    onCreate={handleCreateExercise}
                                    onCancel={() => setAdding(false)}
                                />
                            )}

                            {!onSummary && skipped.length > 0 && (
                                <SkippedStrip skipped={skipped} onRestore={restoreExercise} />
                            )}

                            {pos === 0 && <BringChips items={w.bring} />}

                            {onSummary || typeof step !== 'number' ? (
                                <WrapUp
                                    drafts={drafts}
                                    active={active}
                                    skipped={skipped}
                                    exercisesDone={exercisesDone}
                                    setsDone={setsDone}
                                    volume={volume}
                                    notes={notes}
                                    date={date}
                                    onNotes={(v) => {
                                        markDirty()
                                        setNotes(v)
                                    }}
                                    onDate={(v) => {
                                        markDirty()
                                        setDate(v)
                                    }}
                                    onGo={goTo}
                                    onRestore={restoreExercise}
                                    adding={adding}
                                    onAdd={() => setAdding(true)}
                                    editing={!!log}
                                />
                            ) : (
                                <ExerciseStep
                                    ex={current!}
                                    line={lines[step]}
                                    number={pos + 1}
                                    total={active.length}
                                    videoUrl={resolved.get(current!.exerciseId)?.videoUrl}
                                    swapPicker={
                                        swapping && resolved.get(current!.exerciseId) ? (
                                            <ExerciseSwapPicker
                                                target={resolved.get(current!.exerciseId)!}
                                                library={library}
                                                excludeIds={inSession}
                                                onPick={(picked) => applySwap(step, picked)}
                                                onCreate={handleCreateExercise}
                                                onCancel={() => setSwapping(false)}
                                            />
                                        ) : null
                                    }
                                    swapping={swapping}
                                    ticks={stepTicks.ticks[step]}
                                    onToggleStep={(s) => toggleStep(step, s)}
                                    lastTime={lastTime}
                                    lastSets={lastSets}
                                    suggestion={
                                        lastTime
                                            ? suggestNext(lastTime, lines[step]?.reps, equipment)
                                            : null
                                    }
                                    onUseSuggestion={(sg) => applySuggestion(step, sg)}
                                    onWarmUpDone={(d) => setWarmUpDone(step, d)}
                                    onSwap={() => setSwapping((v) => !v)}
                                    onUndoSwap={() => undoSwap(step)}
                                    onSkip={() =>
                                        current!.added ? removeAdded(step) : skipExercise(step)
                                    }
                                    onSet={(si, patch) => updateSet(step, si, patch)}
                                    onToggleSet={(si) => toggleSet(step, si)}
                                    onAddSet={() => addSet(step)}
                                    onRemoveSet={() => removeLastSet(step)}
                                />
                            )}
                        </>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Stepper bar ────────────────────────────────────────────────────────────────

/**
 * One segment per exercise being done today, then a flag for the wrap-up.
 * Green once every set is ticked, pale green part-way, ink for where you are.
 * Every segment jumps straight to its exercise.
 */
function StepperBar({
    drafts,
    active,
    step,
    onGo,
    adding,
    onAdd,
}: {
    drafts: ExerciseDraft[]
    active: number[]
    step: Step
    onGo: (step: Step) => void
    adding: boolean
    onAdd: () => void
}) {
    return (
        <nav aria-label="Exercises" className="flex items-center gap-1">
            {active.map((i, n) => {
                const ex = drafts[i]
                const p = progressOf(ex)
                const here = step === i
                return (
                    <button
                        key={i}
                        type="button"
                        onClick={() => onGo(i)}
                        aria-label={`Exercise ${n + 1}: ${ex.name}`}
                        aria-current={here ? 'step' : undefined}
                        className="group flex flex-1 items-center py-2"
                    >
                        <span
                            className={`h-1.5 w-full rounded-full transition-colors ${
                                here
                                    ? 'bg-neutral-900'
                                    : p === 'all'
                                      ? 'bg-emerald-600'
                                      : p === 'some'
                                        ? 'bg-emerald-100'
                                        : 'bg-neutral-200 group-hover:bg-neutral-300'
                            }`}
                        />
                    </button>
                )
            })}
            <button
                type="button"
                onClick={onAdd}
                aria-label="Add an exercise to this session"
                aria-pressed={adding}
                title="Add an exercise to this session"
                className={`ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] transition-colors ${
                    adding
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
            >
                <i className="fa-solid fa-plus" aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={() => onGo('summary')}
                aria-label="Wrap up"
                aria-current={step === 'summary' ? 'step' : undefined}
                className={`ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] transition-colors ${
                    step === 'summary'
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
            >
                <i className="fa-solid fa-flag-checkered" aria-hidden="true" />
            </button>
        </nav>
    )
}

// ─── One exercise ───────────────────────────────────────────────────────────────

const inputCls =
    'h-12 w-full min-w-0 rounded-xl border bg-white px-2 text-center text-base font-semibold tabular-nums text-neutral-900 outline-none transition-[border-color,box-shadow] placeholder:font-normal placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100 focus-visible:outline-none'

function ExerciseStep({
    ex,
    line,
    number,
    total,
    videoUrl,
    swapping,
    swapPicker,
    ticks,
    onToggleStep,
    lastSets,
    suggestion,
    onUseSuggestion,
    onWarmUpDone,
    onSwap,
    onUndoSwap,
    onSkip,
    onSet,
    onToggleSet,
    onAddSet,
    onRemoveSet,
}: {
    ex: ExerciseDraft
    line?: WorkoutExercise
    number: number
    total: number
    videoUrl?: string
    swapping: boolean
    swapPicker: ReactNode
    ticks?: number[]
    onToggleStep: (step: number) => void
    /** The heaviest set the last time this exercise was logged with a weight. */
    lastTime: LastTime | null
    /** Every set from the last time, for the set-by-set comparison. */
    lastSets: LastSets | null
    /** What to try today, worked out from last time. */
    suggestion: Suggestion | null
    onUseSuggestion: (s: Suggestion) => void
    onWarmUpDone: (done: boolean) => void
    onSwap: () => void
    onUndoSwap: () => void
    onSkip: () => void
    onSet: (si: number, patch: Partial<SetDraft>) => void
    onToggleSet: (si: number) => void
    onAddSet: () => void
    onRemoveSet: () => void
}) {
    const done = ex.sets.filter((s) => s.done).length
    const allDone = done === ex.sets.length
    // The set you're on: the first not ticked.
    const nextSet = ex.sets.findIndex((s) => !s.done)
    const rest = line?.rest?.trim()
    const warmUp = isWarmUp(ex)
    const warmedUp = warmUp && !!ex.sets[0]?.done
    const settled = useSettledSets(ex.sets, `${number}:${ex.exerciseId}`)
    const volume = warmUp ? undefined : liveInsight(settled, lastSets).volume
    const prev = lastSets?.sets ?? []
    const hasLast = prev.length > 0
    const cols = hasLast
        ? 'grid-cols-[1.75rem_3.5rem_minmax(0,1fr)_minmax(0,1fr)_3rem]'
        : 'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_3rem]'
    const moreLastTime = prev.length - ex.sets.length

    return (
        <div className="flex flex-col gap-6">
            <header className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        Exercise {number} of {total}
                    </span>
                    <PhaseChip phase={phaseOf(ex)} />
                </div>
                <div>
                    <h3 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-neutral-900">
                        {ex.name}
                    </h3>
                    {warmUp ? (
                        <p className="mt-1.5 text-[15px] text-neutral-500">
                            {line?.steps?.length
                                ? 'Work through the checklist, then move on.'
                                : 'Tick it off when you’re warm.'}
                        </p>
                    ) : (
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[15px] text-neutral-500">
                            <span className="font-medium tabular-nums text-neutral-800">
                                {ex.prescription ||
                                    (ex.added ? 'Added for today' : 'No target set')}
                            </span>
                            {rest && (
                                <>
                                    <span aria-hidden="true" className="text-neutral-300">
                                        ·
                                    </span>
                                    <span>Rest {rest}</span>
                                </>
                            )}
                        </p>
                    )}
                    {ex.swappedFrom && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
                            <span>
                                Swapped in for{' '}
                                <span className="font-medium text-neutral-700">
                                    {ex.swappedFrom.name}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={onUndoSwap}
                                className="font-medium text-coral-600 transition-colors hover:text-coral-700"
                            >
                                Undo
                            </button>
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <StepAction
                        icon="fa-solid fa-right-left"
                        label="Swap"
                        pressed={swapping}
                        title={ex.added ? 'Change this exercise' : 'Machine taken? Swap this out'}
                        onClick={onSwap}
                    />
                    {ex.added ? (
                        <StepAction
                            icon="fa-solid fa-trash-can"
                            label="Remove"
                            title="Take this added exercise back out"
                            onClick={onSkip}
                        />
                    ) : (
                        <StepAction
                            icon="fa-solid fa-forward"
                            label="Skip"
                            title="Skip this exercise today"
                            onClick={onSkip}
                        />
                    )}
                    <VideoButton url={videoUrl} title={ex.name} />
                </div>
            </header>

            {swapPicker}

            {!warmUp && suggestion && (
                <TargetCard
                    suggestion={suggestion}
                    filled={
                        nextSet !== -1 &&
                        ex.sets.every((s) => s.done || s.weight.trim() === String(suggestion.weight))
                    }
                    onUse={() => onUseSuggestion(suggestion)}
                />
            )}

            {(line?.notes || !!line?.steps?.length) && (
                <div className="flex flex-col gap-4">
                    <ItemCue>{line?.notes}</ItemCue>
                    <StepChecklist steps={line?.steps} ticked={ticks} onToggle={onToggleStep} />
                </div>
            )}

            {warmUp ? (
                <button
                    type="button"
                    onClick={() => onWarmUpDone(!warmedUp)}
                    aria-pressed={warmedUp}
                    className={`flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[15px] font-semibold transition-colors ${
                        warmedUp
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-neutral-900 text-white hover:bg-neutral-800'
                    }`}
                >
                    <i className="fa-solid fa-check" aria-hidden="true" />
                    {warmedUp ? 'Warm-up done' : 'Mark warm-up done'}
                </button>
            ) : (
                <section className="flex flex-col gap-2" aria-label="Sets">
                    <div className="flex items-baseline justify-between gap-3 px-2 pb-1">
                        <h4 className="text-[15px] font-semibold text-neutral-900">
                            Sets
                            <span className="ml-2 text-[13px] font-normal text-neutral-500">
                                {lastSets
                                    ? `vs ${formatLogDate(lastSets.date, todayISO()).toLowerCase()}`
                                    : 'first time logging this'}
                            </span>
                        </h4>
                        <span
                            className={`text-[13px] font-semibold tabular-nums ${allDone ? 'text-emerald-700' : 'text-neutral-500'}`}
                        >
                            {allDone ? (
                                <>
                                    <i className="fa-solid fa-check mr-1 text-[11px]" aria-hidden="true" />
                                    All done
                                </>
                            ) : (
                                `${done} of ${ex.sets.length}`
                            )}
                        </span>
                    </div>
                    <div
                        className={`grid ${cols} items-center gap-x-2 px-2 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400`}
                    >
                        <span className="text-center">Set</span>
                        {hasLast && <span className="text-center">Last</span>}
                        <span className="text-center">kg</span>
                        <span className="text-center">Reps</span>
                        <span />
                    </div>
                    {ex.sets.map((s, si) => {
                        const here = si === nextSet
                        const prevWeight = si > 0 ? ex.sets[si - 1].weight : ''
                        const was = prev[si]
                        const delta = setDelta(toTodaySet(s), was)
                        return (
                            <div
                                key={si}
                                className={`grid ${cols} items-center gap-x-2 rounded-2xl px-2 py-2 ring-1 ring-inset transition-colors ${
                                    s.done
                                        ? 'bg-emerald-50 ring-emerald-100'
                                        : here
                                          ? 'bg-neutral-50 ring-neutral-200'
                                          : 'ring-transparent'
                                }`}
                            >
                                <span
                                    className={`text-center text-sm font-semibold tabular-nums ${
                                        s.done
                                            ? 'text-emerald-700'
                                            : here
                                              ? 'text-neutral-900'
                                              : 'text-neutral-400'
                                    }`}
                                >
                                    {si + 1}
                                </span>
                                {hasLast &&
                                    (was && !s.done ? (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                onSet(si, {
                                                    weight: was.weight != null ? String(was.weight) : s.weight,
                                                    reps: was.reps != null ? String(was.reps) : s.reps,
                                                })
                                            }
                                            aria-label={`Copy last time’s ${describeSet(was)} into set ${si + 1}`}
                                            title="Copy into this set"
                                            className="h-12 truncate rounded-xl text-center text-xs font-medium tabular-nums text-neutral-500 transition-colors hover:text-neutral-900 active:text-neutral-900"
                                        >
                                            {shortSet(was)}
                                        </button>
                                    ) : (
                                        <span
                                            className={`truncate text-center text-xs tabular-nums ${s.done ? 'text-emerald-700/70' : 'text-neutral-300'}`}
                                        >
                                            {was ? shortSet(was) : '—'}
                                        </span>
                                    ))}
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    step="any"
                                    placeholder={prevWeight || '—'}
                                    aria-label={`Set ${si + 1} weight`}
                                    value={s.weight}
                                    onChange={(e) => onSet(si, { weight: e.target.value })}
                                    className={`${inputCls} ${s.done ? 'border-emerald-200' : 'border-neutral-200'}`}
                                />
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step="1"
                                    placeholder="—"
                                    aria-label={`Set ${si + 1} reps`}
                                    value={s.reps}
                                    onChange={(e) => onSet(si, { reps: e.target.value })}
                                    className={`${inputCls} ${s.done ? 'border-emerald-200' : 'border-neutral-200'}`}
                                />
                                <button
                                    type="button"
                                    onClick={() => onToggleSet(si)}
                                    aria-pressed={!!s.done}
                                    aria-label={
                                        s.done ? `Untick set ${si + 1}` : `Tick off set ${si + 1}`
                                    }
                                    className={`grid h-12 w-12 place-items-center rounded-xl transition-colors ${
                                        s.done
                                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                            : here
                                              ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                                              : 'border border-neutral-200 bg-white text-neutral-300 hover:text-neutral-600'
                                    }`}
                                >
                                    <i className="fa-solid fa-check" aria-hidden="true" />
                                </button>
                                {delta && (delta.weight !== 0 || delta.reps !== 0) && (
                                    <>
                                        <span className="col-start-3">
                                            <DeltaTag n={delta.weight} unit="kg" />
                                        </span>
                                        <span>
                                            <DeltaTag n={delta.reps} unit="rep" />
                                        </span>
                                    </>
                                )}
                            </div>
                        )
                    })}
                    <div className="flex items-center gap-1 pt-1">
                        <button
                            type="button"
                            onClick={onAddSet}
                            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                        >
                            <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                            Add set
                        </button>
                        {ex.sets.length > 1 && (
                            <button
                                type="button"
                                onClick={onRemoveSet}
                                className="inline-flex h-11 items-center rounded-xl px-3 text-sm font-medium text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                            >
                                Remove last
                            </button>
                        )}
                        {moreLastTime > 0 && (
                            <span className="ml-auto pr-1 text-xs text-neutral-500">
                                Last time: {prev.length} sets
                            </span>
                        )}
                    </div>
                    {volume && (
                        <p
                            className="mt-1 flex items-center gap-2.5 rounded-xl bg-neutral-50 px-3 py-2.5 text-[13px] text-neutral-600"
                            aria-live="polite"
                        >
                            <i
                                className={`fa-solid ${volume.tone === 'up' ? 'fa-arrow-trend-up text-emerald-600' : volume.tone === 'down' ? 'fa-arrow-trend-down text-neutral-400' : 'fa-equals text-neutral-400'} text-xs`}
                                aria-hidden="true"
                            />
                            <span className="min-w-0">
                                {volume.parts.map((p, j) =>
                                    typeof p === 'string' ? (
                                        p
                                    ) : (
                                        <span key={j} className="font-semibold tabular-nums text-neutral-900">
                                            {p.v}
                                        </span>
                                    )
                                )}
                            </span>
                        </p>
                    )}
                </section>
            )}
        </div>
    )

}

/** "+5 kg" / "−2 reps" under an input — green when it's up, quiet grey when it's down. */
function DeltaTag({ n, unit }: { n: number; unit: 'kg' | 'rep' }) {
    if (n === 0) return null
    const abs = Math.abs(n)
    const label = unit === 'kg' ? `${abs} kg` : `${abs} rep${abs === 1 ? '' : 's'}`
    return (
        <span
            className={`block pt-1.5 text-center text-[11px] leading-none font-semibold tabular-nums ${n > 0 ? 'text-emerald-700' : 'text-neutral-400'}`}
        >
            {n > 0 ? '+' : '−'}
            {label}
        </span>
    )
}

/**
 * Today's aim, worked out from last time: one big number to read under the
 * bar, why it's that, and one tap to put it on every set still to do.
 */
function TargetCard({
    suggestion,
    filled,
    onUse,
}: {
    suggestion: Suggestion
    /** Every set still to do already carries the suggested weight. */
    filled: boolean
    onUse: () => void
}) {
    return (
        <div className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-inset ring-neutral-900/[0.08]">
            <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                    <i
                        className={`fa-solid ${suggestion.kind === 'up' ? 'fa-arrow-trend-up text-emerald-600' : 'fa-repeat text-neutral-400'} text-[10px]`}
                        aria-hidden="true"
                    />
                    {suggestion.kind === 'up' ? 'Go heavier today' : 'Same weight, more reps'}
                </p>
                <p className="mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-neutral-900">
                    {suggestion.weight}
                    <span className="ml-0.5 text-base font-medium text-neutral-500">kg</span>
                    {suggestion.reps != null && (
                        <>
                            <span className="mx-1.5 text-lg font-normal text-neutral-300">×</span>
                            {suggestion.reps}
                        </>
                    )}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-neutral-500">{suggestion.why}</p>
            </div>
            <button
                type="button"
                onClick={onUse}
                disabled={filled}
                className={`h-11 shrink-0 rounded-xl px-4 text-sm font-semibold transition-colors ${
                    filled
                        ? 'bg-neutral-100 text-neutral-500'
                        : 'bg-neutral-900 text-white hover:bg-neutral-800'
                }`}
            >
                {filled ? (
                    <>
                        <i className="fa-solid fa-check mr-1.5 text-xs" aria-hidden="true" />
                        Filled
                    </>
                ) : (
                    'Fill sets'
                )}
            </button>
        </div>
    )
}

/** How long typing has to pause before the volume read-out rewrites. */
const INSIGHT_SETTLE_MS = 600

/**
 * The sets as the volume read-out should read them: typed weights and reps
 * land once you stop typing, so it isn't rewriting on every keystroke.
 * Ticking, adding or removing a set, or moving to another exercise (`key`)
 * lands at once.
 */
function useSettledSets(sets: SetDraft[], key: string): SetDraft[] {
    const [settled, setSettled] = useState(sets)
    const shape = `${key}|${sets.map((s) => (s.done ? 1 : 0)).join('')}`
    const [seenShape, setSeenShape] = useState(shape)
    if (shape !== seenShape) {
        setSeenShape(shape)
        setSettled(sets)
    }

    useEffect(() => {
        const t = setTimeout(() => setSettled(sets), INSIGHT_SETTLE_MS)
        return () => clearTimeout(t)
    }, [sets])

    return settled
}

/** A typed set as numbers, blanks left out. */
function toTodaySet(s: SetDraft): TodaySet {
    return { weight: toNum(s.weight), reps: toNum(s.reps) }
}

/** Today's sets so far against the same sets last time. */
function liveInsight(sets: SetDraft[], lastSets: LastSets | null) {
    // A set counts once it's ticked, or once it has a weight in — so adding a
    // set (which copies the last one's weight) registers straight away.
    // Bodyweight work goes on ticks alone, as its reps come pre-filled.
    const weighted = !lastSets || lastSets.sets.some((s) => s.weight != null)
    const done = sets
        .filter((s) => s.done || (weighted && toNum(s.weight) != null))
        .map(toTodaySet)
        .filter((s) => s.weight != null || s.reps != null)
    return setInsight(lastSets, done, null)
}

function StepAction({
    icon,
    label,
    title,
    pressed,
    onClick,
}: {
    icon: string
    label: string
    title: string
    pressed?: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            aria-pressed={pressed}
            className={`inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] font-medium transition-colors ${
                pressed
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
        >
            <i className={`${icon} text-[11px]`} aria-hidden="true" />
            {label}
        </button>
    )
}

/**
 * What's been skipped so far, on every exercise — so changing your mind (the
 * machine came free) is one tap, not a trip to the wrap-up.
 */
function SkippedStrip({
    skipped,
    onRestore,
}: {
    skipped: { ex: ExerciseDraft; i: number }[]
    onRestore: (i: number) => void
}) {
    return (
        <div className="-mt-3 flex flex-col divide-y divide-neutral-100 rounded-2xl bg-neutral-50 px-4">
            {skipped.map(({ ex, i }) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                    <i
                        className="fa-solid fa-forward w-3 text-center text-[10px] text-neutral-400"
                        aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-neutral-500">
                        Skipped <span className="text-neutral-700">{ex.name}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => onRestore(i)}
                        className="h-9 shrink-0 px-1 text-xs font-semibold text-coral-600 transition-colors hover:text-coral-700"
                    >
                        Put back
                    </button>
                </div>
            ))}
        </div>
    )
}

// ─── Wrap-up ────────────────────────────────────────────────────────────────────

function WrapUp({
    drafts,
    active,
    skipped,
    exercisesDone,
    setsDone,
    volume,
    notes,
    date,
    onNotes,
    onDate,
    onGo,
    onRestore,
    adding,
    onAdd,
    editing,
}: {
    drafts: ExerciseDraft[]
    active: number[]
    skipped: { ex: ExerciseDraft; i: number }[]
    exercisesDone: number
    setsDone: number
    volume: number
    notes: string
    date: string
    onNotes: (v: string) => void
    onDate: (v: string) => void
    onGo: (step: Step) => void
    onRestore: (i: number) => void
    adding: boolean
    onAdd: () => void
    /** Reopened from a saved log, rather than at the end of a session. */
    editing?: boolean
}) {
    return (
        <div className="flex flex-col gap-7">
            <header>
                <h3 className="text-2xl font-semibold tracking-[-0.02em] text-neutral-900">
                    {editing ? 'Edit log' : 'Wrap up'}
                </h3>
                <p className="mt-1 text-sm text-neutral-500">
                    {editing
                        ? 'Tap an exercise to change it. Changes save as you go.'
                        : 'Check it over, add a note, and finish.'}
                </p>
            </header>

            <SummaryStats
                items={[
                    { label: 'Exercises', value: `${exercisesDone}/${active.length}` },
                    { label: 'Sets', value: setsDone },
                    { label: 'Volume', value: volume.toLocaleString(), unit: 'kg' },
                ]}
            />

            <SummaryExerciseList
                rows={active.map((i) => {
                    const ex = drafts[i]
                    const p = progressOf(ex)
                    const sets = ex.sets.filter((s) => s.done).map(setSummary)
                    return {
                        key: i,
                        name: ex.name,
                        phase: ex.phase,
                        progress: p,
                        sets: isWarmUp(ex) ? undefined : sets,
                        detail: isWarmUp(ex)
                            ? p === 'all'
                                ? 'Done'
                                : 'Not done yet'
                            : 'Nothing ticked yet',
                        onClick: () => onGo(i),
                    }
                })}
            />

            {!adding && (
                <button
                    type="button"
                    onClick={onAdd}
                    className="-mt-4 inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] px-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                >
                    <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                    Add exercise
                </button>
            )}

            {skipped.length > 0 && (
                <div className="flex flex-col gap-1 rounded-2xl bg-neutral-50 px-4 py-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        Skipped · not logged
                    </p>
                    {skipped.map(({ ex, i }) => (
                        <div key={i} className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-sm text-neutral-500 line-through">
                                {ex.name}
                            </span>
                            <button
                                type="button"
                                onClick={() => onRestore(i)}
                                className="shrink-0 px-1 py-1 text-xs font-semibold text-coral-600 transition-colors hover:text-coral-700"
                            >
                                Put back
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <Textarea
                label="Notes"
                rows={3}
                placeholder="How did it go? Anything to remember for next time…"
                value={notes}
                onChange={(e) => onNotes(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-neutral-700">Date</label>
                <DatePicker
                    value={date}
                    maxDate={todayISO()}
                    onChange={(v) => onDate(typeof v === 'string' ? v : todayISO())}
                />
            </div>
        </div>
    )
}
