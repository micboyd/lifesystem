import { useEffect, useMemo, useRef, useState } from 'react'
import Drawer from './Drawer'
import Button from './Button'
import DatePicker from './DatePicker'
import Textarea from './Textarea'
import ExerciseSwapPicker from './ExerciseSwapPicker'
import type { Exercise, LoggedSet, Workout, WorkoutExercise } from '../types'
import type { WorkoutLogInput } from '../services/workoutLogs'
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

/** Build the initial drafts for a workout: one row per resolved exercise, seeded
 *  with as many blank sets as the prescription calls for (at least one). */
function seedDrafts(workout: Workout, byId: Map<string, Exercise>): ExerciseDraft[] {
    return workout.exercises
        .map((item) => ({ item, ex: byId.get(item.exercise) }))
        .filter((r): r is { item: WorkoutExercise; ex: Exercise } => !!r.ex)
        .map(({ item, ex }) => {
            const count = Math.max(1, item.sets && item.sets > 0 ? item.sets : 1)
            const reps = seedReps(item.reps)
            return {
                exerciseId: ex._id,
                name: ex.name,
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
    return draftSignature(
        workout.exercises.map((item) => item.exercise).filter((id) => byId.has(id))
    )
}

function toNum(s: string): number | undefined {
    const t = s.trim()
    if (t === '') return undefined
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * A logging drawer that records the actual weight × reps of each set. Seeded from
 * the workout's prescription, so most of the time the user just types a weight per
 * row and hits save. Weights are optional — an empty save still records the
 * workout, matching the quick "Done" button.
 */
export default function WorkoutLogWeightsDrawer({
    workout,
    byId,
    defaultDate,
    onClose,
    onSubmit,
}: {
    workout: Workout | null
    /** The whole exercise library, keyed by id — it resolves the workout's lines
     *  and doubles as the pool the swap picker draws alternatives from. */
    byId: Map<string, Exercise>
    /** Day to pre-fill, e.g. the planned day when opened from the planner. Defaults to today. */
    defaultDate?: string
    onClose: () => void
    onSubmit: (workout: Workout, fields: WorkoutLogInput) => Promise<void>
}) {
    // Retain the last workout while the drawer animates closed.
    const [view, setView] = useState<Workout | null>(workout)
    const [date, setDate] = useState(defaultDate ?? todayISO())
    const [notes, setNotes] = useState('')
    const [drafts, setDrafts] = useState<ExerciseDraft[]>([])
    const [saving, setSaving] = useState(false)
    /** Index of the row whose swap picker is open, or null when none is. */
    const [swapping, setSwapping] = useState<number | null>(null)
    /** When the device-local draft was last written, or null while there isn't one. */
    const [savedAt, setSavedAt] = useState<number | null>(null)
    /** Set when this session was picked up from a draft, so the drawer can say so. */
    const [restoredFrom, setRestoredFrom] = useState<number | null>(null)
    /**
     * Whether anything has been typed yet. Opening the drawer and closing it
     * again shouldn't leave a draft behind — only real edits arm the autosave.
     */
    const dirty = useRef(false)

    const signature = useMemo(() => (view ? signatureOf(view, byId) : ''), [view, byId])

    useEffect(() => {
        if (!workout) return
        const seeded = seedDrafts(workout, byId)
        const draft = readDraft(workout._id, signatureOf(workout, byId))
        setView(workout)
        setDate(draft?.date ?? defaultDate ?? todayISO())
        setNotes(draft?.notes ?? '')
        setDrafts(draft?.exercises ?? seeded)
        setSwapping(null)
        setSaving(false)
        // A restored draft is already on the device — keep saving over it.
        dirty.current = !!draft
        setSavedAt(draft?.savedAt ?? null)
        setRestoredFrom(draft?.savedAt ?? null)
    }, [workout, byId, defaultDate])

    /**
     * Autosave. Everything typed lands on the device a moment later, so a locked
     * phone, a reload or a mis-tapped Cancel mid-session costs nothing — reopen
     * the workout and the sets are still there.
     */
    useEffect(() => {
        if (!view || !dirty.current) return
        const timer = setTimeout(() => {
            const now = Date.now()
            writeDraft(view._id, { signature, date, notes, exercises: drafts }, now)
            setSavedAt(now)
        }, 400)
        return () => clearTimeout(timer)
    }, [view, signature, date, notes, drafts])

    /** Arm the autosave — called by every edit before it changes state. */
    function markDirty() {
        dirty.current = true
    }

    /** Throw the draft away and start the log from the workout as written. */
    function discardDraft() {
        if (!view) return
        clearDraft(view._id)
        setDrafts(seedDrafts(view, byId))
        setDate(defaultDate ?? todayISO())
        setNotes('')
        setSwapping(null)
        dirty.current = false
        setSavedAt(null)
        setRestoredFrom(null)
    }

    const library = useMemo(() => [...byId.values()], [byId])

    // Everything already in this session — the picker shouldn't offer a movement
    // back to you that you're doing two rows down anyway. A skipped row is fair
    // game again, since it isn't being done.
    const inSession = useMemo(
        () => drafts.filter((d) => !d.removed).map((d) => d.exerciseId),
        [drafts]
    )

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
                // A new set copies the last set's reps so the user keeps typing weights.
                const last = ex.sets[ex.sets.length - 1]
                return { ...ex, sets: [...ex.sets, { weight: '', reps: last?.reps ?? '' }] }
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
     * Skip an exercise for this session — the machine was taken, the shoulder
     * wasn't having it, you ran out of time. The row stays in the draft (one tap
     * from coming back, and keeping every index aligned with the workout's
     * exercises) and is dropped from the log at save time.
     */
    function removeExercise(ei: number) {
        markDirty()
        setSwapping(null)
        setDrafts((prev) => prev.map((ex, i) => (i === ei ? { ...ex, removed: true } : ex)))
    }

    /** Put a skipped exercise back, with whatever was already typed into it. */
    function restoreExercise(ei: number) {
        markDirty()
        setDrafts((prev) => prev.map((ex, i) => (i === ei ? { ...ex, removed: undefined } : ex)))
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
        markDirty()
        setDrafts((prev) =>
            prev.map((ex, i) => {
                if (i !== ei || !ex.swappedFrom) return ex
                return {
                    ...ex,
                    exerciseId: ex.swappedFrom.id,
                    name: ex.swappedFrom.name,
                    swappedFrom: undefined,
                }
            })
        )
    }

    async function submit() {
        if (!view) return
        // Align one set-list per exercise, in the same order the server snapshots.
        // Skipped rows keep their slot — the indices below all have to agree —
        // and send nothing; `omitted` is what actually drops them.
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
        // Aligned the same way: the exercise actually performed, or null when the
        // row went as prescribed. Omitted entirely when nothing was swapped.
        const substitutions = drafts.map((ex) =>
            ex.swappedFrom && !ex.removed ? ex.exerciseId : null
        )
        const swapped = substitutions.some(Boolean)
        // The rows to leave out of the record entirely.
        const omitted = drafts.flatMap((ex, i) => (ex.removed ? [i] : []))

        setSaving(true)
        try {
            await onSubmit(view, {
                workout: view._id,
                date,
                notes: notes.trim() || undefined,
                loggedSets,
                ...(swapped ? { substitutions } : {}),
                ...(omitted.length ? { omitted } : {}),
            })
            // It's history now, so the in-progress copy has done its job.
            clearDraft(view._id)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    const w = view

    return (
        <Drawer
            open={!!workout}
            onClose={onClose}
            size="2xl"
            title={w ? `Log · ${w.name}` : 'Log workout'}
            footer={
                <div className="flex w-full items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-sm text-neutral-500">
                            Volume{' '}
                            <span className="font-semibold tabular-nums text-neutral-900">
                                {volume.toLocaleString()} kg
                            </span>
                        </span>
                        {savedAt !== null && (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-neutral-400">
                                <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />
                                Progress kept on this device
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button icon="fa-solid fa-check" onClick={submit} disabled={saving}>
                            {saving ? 'Saving…' : 'Save log'}
                        </Button>
                    </div>
                </div>
            }
        >
            {w && (
                <div className="flex flex-col gap-6">
                    {restoredFrom !== null && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-marigold-200 bg-marigold-50 px-3 py-2 text-xs text-amber-800">
                            <span className="inline-flex items-center gap-2">
                                <i
                                    className="fa-solid fa-clock-rotate-left text-[11px]"
                                    aria-hidden="true"
                                />
                                Picked up where you left off — saved {describeAge(restoredFrom)}.
                            </span>
                            <button
                                type="button"
                                onClick={discardDraft}
                                className="font-semibold text-amber-900 underline-offset-2 transition-colors hover:underline"
                            >
                                Start fresh
                            </button>
                        </div>
                    )}

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

                    {drafts.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                            This workout has no exercises to record.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-5">
                            {drafts.map((ex, ei) =>
                                ex.removed ? null : (
                                    <section key={ei} className="flex flex-col gap-2">
                                        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                            <p className="min-w-0 font-semibold text-neutral-900">
                                                {ex.name}
                                            </p>
                                            <div className="flex shrink-0 items-center gap-2">
                                                {ex.prescription && (
                                                    <span className="text-xs text-neutral-400">
                                                        target {ex.prescription}
                                                    </span>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setSwapping(swapping === ei ? null : ei)
                                                    }
                                                    aria-expanded={swapping === ei}
                                                    title="Machine taken? Swap this out"
                                                    className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                                                >
                                                    <i
                                                        className="fa-solid fa-right-left text-[10px]"
                                                        aria-hidden="true"
                                                    />
                                                    Swap
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => removeExercise(ei)}
                                                    title="Skip this exercise today"
                                                    aria-label={`Skip ${ex.name}`}
                                                    className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-coral-600"
                                                >
                                                    <i
                                                        className="fa-solid fa-ban text-[10px]"
                                                        aria-hidden="true"
                                                    />
                                                    Skip
                                                </button>
                                            </div>
                                        </div>

                                        {ex.swappedFrom && (
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

                                        {swapping === ei && byId.get(ex.exerciseId) && (
                                            <ExerciseSwapPicker
                                                target={byId.get(ex.exerciseId)!}
                                                library={library}
                                                excludeIds={inSession}
                                                onPick={(picked) => applySwap(ei, picked)}
                                                onCancel={() => setSwapping(null)}
                                            />
                                        )}

                                        <div className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                            <span>Set</span>
                                            <span>Weight (kg)</span>
                                            <span>Reps</span>
                                            <span />
                                        </div>

                                        {ex.sets.map((s, si) => (
                                            <div
                                                key={si}
                                                className="grid grid-cols-[1.75rem_1fr_1fr_1.75rem] items-center gap-2"
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
                                                    value={s.weight}
                                                    onChange={(e) =>
                                                        updateSet(ei, si, {
                                                            weight: e.target.value,
                                                        })
                                                    }
                                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none transition-all placeholder:text-neutral-300 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                                />
                                                <input
                                                    type="number"
                                                    inputMode="numeric"
                                                    min={0}
                                                    step="1"
                                                    placeholder="—"
                                                    value={s.reps}
                                                    onChange={(e) =>
                                                        updateSet(ei, si, { reps: e.target.value })
                                                    }
                                                    className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm tabular-nums text-neutral-900 outline-none transition-all placeholder:text-neutral-300 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
                                                />
                                                <button
                                                    type="button"
                                                    aria-label={`Remove set ${si + 1}`}
                                                    onClick={() => removeSet(ei, si)}
                                                    disabled={ex.sets.length === 1}
                                                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-0"
                                                >
                                                    <i className="fa-solid fa-xmark text-xs" />
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => addSet(ei)}
                                            className="mt-0.5 inline-flex items-center gap-1.5 self-start rounded-lg px-1.5 py-1 text-xs font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                                        >
                                            <i className="fa-solid fa-plus text-[10px]" />
                                            Add set
                                        </button>
                                    </section>
                                )
                            )}

                            {skipped.length === drafts.length && (
                                <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                                    Every exercise skipped — saving now records the session with no
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
                                                className="shrink-0 text-xs font-semibold text-coral-600 transition-colors hover:text-coral-700"
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
                </div>
            )}
        </Drawer>
    )
}
