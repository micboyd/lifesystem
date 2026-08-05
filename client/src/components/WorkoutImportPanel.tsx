import { useMemo, useState } from 'react'
import { Card } from './Card'
import Button from './Button'
import Alert from './Alert'
import Select, { type SelectOption } from './Select'
import ImportUndoBanner from './ImportUndoBanner'
import ImportConflictList, {
    conflictKey,
    toOverwriteMap,
    type NameConflict,
    type ConflictChoice,
} from './ImportConflictList'
import { useToast } from '../context/ToastContext'
import {
    previewImportWorkouts,
    importWorkouts,
    type WorkoutImportPreview,
    type ImportExercisePlan,
    type ImportExerciseRef,
} from '../services/workouts'

/** Sentinel choice meaning "create a brand-new exercise for this name". */
const CREATE = '__create__'

const WORKOUT_TEMPLATE = JSON.stringify(
    [
        {
            name: 'Full Body Blast',
            description: 'Combines cardio and strength training.',
            showInPlanner: true,
            exercises: [
                { name: 'Barbell bench press', sets: 4, reps: '6-8' },
                { name: 'Barbell row', sets: 4, reps: '8-10' },
                { name: 'Box Squats', sets: 3, reps: '10' },
            ],
        },
        {
            name: 'Upper Push',
            description: 'Chest, shoulders and triceps focus.',
            exercises: ['Incline dumbbell press', 'Seated overhead press', 'Dips (weighted if able)'],
        },
    ],
    null,
    2
)

/** Pull a human-readable message out of an unknown thrown error. */
function errorMessage(err: unknown): string {
    if (err && typeof err === 'object') {
        const resp = (err as { response?: { data?: { message?: unknown } } }).response
        if (typeof resp?.data?.message === 'string') return resp.data.message
        const msg = (err as { message?: unknown }).message
        if (typeof msg === 'string') return msg
    }
    return 'Something went wrong during import.'
}

/** Find pasted workouts whose name already exists in the library. */
function workoutConflicts(
    parsed: unknown,
    existing: { _id: string; name: string }[]
): NameConflict[] {
    const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { workouts?: unknown }).workouts)
          ? ((parsed as { workouts: unknown[] }).workouts)
          : []
    const byKey = new Map(existing.map((e) => [conflictKey(e.name), e._id]))
    const out: NameConflict[] = []
    const seen = new Set<string>()
    for (const it of list) {
        const name = it && typeof it === 'object' ? (it as { name?: unknown }).name : undefined
        if (typeof name !== 'string' || !name.trim()) continue
        const key = conflictKey(name)
        const id = byKey.get(key)
        if (id && !seen.has(key)) {
            seen.add(key)
            out.push({ name: name.trim(), existingId: id })
        }
    }
    return out
}

type Result = { variant: 'success' | 'danger'; message: string } | null

const STATUS_CHIP: Record<ImportExercisePlan['status'], { label: string; className: string }> = {
    matched: { label: 'Matched', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
    ambiguous: { label: 'Review', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
    new: { label: 'New', className: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
}

/** Build the dropdown options for one exercise row: create (if not matched) + links. */
function optionsFor(plan: ImportExercisePlan, existing: ImportExerciseRef[]): SelectOption[] {
    const opts: SelectOption[] = []
    if (plan.status !== 'matched') {
        opts.push({ label: `Create new exercise`, value: CREATE })
    }
    const suggested = plan.suggestions ?? []
    const suggestedIds = new Set(suggested.map((s) => s.id))
    for (const s of suggested) opts.push({ label: `Link to “${s.name}”`, value: s.id })
    for (const e of existing) {
        if (suggestedIds.has(e.id)) continue
        opts.push({ label: `Link to “${e.name}”`, value: e.id })
    }
    return opts
}

/**
 * Workout import with a reconcile step. Pasting JSON runs a dry-run preview that
 * classifies every exercise name against the library (matched / review / new);
 * the user resolves each before committing, so a typo never silently creates a
 * duplicate exercise.
 */
export default function WorkoutImportPanel({
    onBack,
    onImported,
    onLibraryChanged,
    existingWorkouts = [],
}: {
    onBack: () => void
    onImported: (count: number) => void
    /** Reload the library grid after an import is reverted. */
    onLibraryChanged?: () => void
    /** Existing workouts — enables name-clash overwrite/keep-both prompts. */
    existingWorkouts?: { _id: string; name: string }[]
}) {
    const toast = useToast()
    const [text, setText] = useState('')
    const [copied, setCopied] = useState(false)
    const [result, setResult] = useState<Result>(null)

    // Reconcile stage: set once a preview succeeds. `parsed` is the JSON we'll commit.
    const [preview, setPreview] = useState<WorkoutImportPreview | null>(null)
    const [parsed, setParsed] = useState<unknown>(null)
    const [choices, setChoices] = useState<Record<string, string>>({})
    // Workout-name clashes against the existing library, and per-name choices.
    const [wkConflicts, setWkConflicts] = useState<NameConflict[]>([])
    const [wkChoices, setWkChoices] = useState<Record<string, ConflictChoice>>({})

    const [busy, setBusy] = useState(false)

    async function copyTemplate() {
        try {
            await navigator.clipboard.writeText(WORKOUT_TEMPLATE)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            toast.show('Could not copy to clipboard.')
        }
    }

    async function handlePreview() {
        setResult(null)
        const trimmed = text.trim()
        if (!trimmed) {
            setResult({ variant: 'danger', message: 'Paste some JSON to import first.' })
            return
        }
        let json: unknown
        try {
            json = JSON.parse(trimmed)
        } catch {
            setResult({
                variant: 'danger',
                message: "That isn't valid JSON. Check for missing commas, quotes or brackets.",
            })
            return
        }

        setBusy(true)
        try {
            const plan = await previewImportWorkouts(json)
            setParsed(json)
            setPreview(plan)
            // Default each name: keep an exact match, otherwise create a new exercise.
            setChoices(
                Object.fromEntries(
                    plan.exercises.map((ex) => [ex.key, ex.status === 'matched' ? ex.match!.id : CREATE])
                )
            )
            // Detect workout-name clashes; default each to overwrite-in-place.
            const found = workoutConflicts(json, existingWorkouts)
            setWkConflicts(found)
            setWkChoices(Object.fromEntries(found.map((c) => [conflictKey(c.name), 'overwrite'])))
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
        } finally {
            setBusy(false)
        }
    }

    async function handleImport() {
        if (!preview) return
        // Any row resolved to an existing exercise becomes an explicit link; rows
        // left on "Create new" are omitted so the server creates them.
        const links: Record<string, string> = {}
        for (const [key, choice] of Object.entries(choices)) {
            if (choice !== CREATE) links[key] = choice
        }

        setBusy(true)
        setResult(null)
        try {
            const overwrite = toOverwriteMap(wkConflicts, wkChoices)
            const { created, updated } = await importWorkouts(parsed, links, overwrite)
            const parts: string[] = []
            if (created) parts.push(`${created} added`)
            if (updated) parts.push(`${updated} updated`)
            const summary = parts.length ? parts.join(', ') : 'nothing changed'
            toast.show(`Import complete — ${summary}.`, 'success')
            setResult({ variant: 'success', message: `Import complete — ${summary}. Returning…` })
            setTimeout(() => onImported(created), 1200)
        } catch (err) {
            setResult({ variant: 'danger', message: errorMessage(err) })
            setBusy(false)
        }
    }

    function backToPaste() {
        setPreview(null)
        setParsed(null)
        setResult(null)
    }

    const counts = useMemo(() => {
        let linked = 0
        let created = 0
        for (const choice of Object.values(choices)) {
            if (choice === CREATE) created++
            else linked++
        }
        return { linked, created }
    }, [choices])

    return (
        <div className="flex flex-col gap-6">
            <div>
                <button
                    type="button"
                    onClick={preview ? backToPaste : onBack}
                    className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                    {preview ? 'Back to paste' : 'Back to library'}
                </button>
                <h2 className="text-xl font-bold tracking-tight text-neutral-950">Import workouts</h2>
                <p className="mt-1 text-sm text-neutral-500">
                    {preview
                        ? 'Review how each exercise links to your library, then import. Names that already exist are matched so you never create duplicates.'
                        : 'Copy the template, fill it in with your own workouts, then paste the JSON below. Exercises are linked to your library by name.'}
                </p>
            </div>

            {!preview && (
                <ImportUndoBanner
                    resource="workouts"
                    noun="workout"
                    onReverted={() => onLibraryChanged?.()}
                />
            )}

            {result && (
                <Alert variant={result.variant} onClose={() => setResult(null)}>
                    {result.message}
                </Alert>
            )}

            {preview ? (
                <>
                    {wkConflicts.length > 0 && (
                        <ImportConflictList
                            conflicts={wkConflicts}
                            noun="workout"
                            choices={wkChoices}
                            onChange={setWkChoices}
                        />
                    )}
                    <ReconcileStage
                        preview={preview}
                        choices={choices}
                        counts={counts}
                        busy={busy}
                        onChoose={(key, value) => setChoices((prev) => ({ ...prev, [key]: value }))}
                        onImport={handleImport}
                        onCancel={backToPaste}
                    />
                </>
            ) : (
                <>
                    {/* Template */}
                    <Card as="section" hover={false}>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                                Template
                            </h3>
                            <Button
                                size="sm"
                                variant="secondary"
                                icon={copied ? 'fa-solid fa-check' : 'fa-regular fa-copy'}
                                onClick={copyTemplate}
                            >
                                {copied ? 'Copied' : 'Copy template'}
                            </Button>
                        </div>
                        <pre className="max-h-96 overflow-auto rounded-xl bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-100">
                            <code>{WORKOUT_TEMPLATE}</code>
                        </pre>
                        <div className="mt-4 flex flex-col gap-1.5 text-xs text-neutral-500">
                            <p>
                                <span className="font-semibold text-neutral-700">name</span> is required.{' '}
                                <span className="font-semibold text-neutral-700">description</span> and{' '}
                                <span className="font-semibold text-neutral-700">showInPlanner</span> are
                                optional.
                            </p>
                            <p>
                                <span className="font-semibold text-neutral-700">exercises</span> is a list
                                of exercise names, or{' '}
                                <span className="font-semibold text-neutral-700">
                                    {'{ name, sets, reps }'}
                                </span>{' '}
                                objects to prescribe volume (
                                <span className="font-semibold text-neutral-700">reps</span> is free-form,
                                e.g. &quot;8-12&quot;). On the next step you&apos;ll confirm how each name
                                links to your library — matched to an existing exercise, or created fresh.
                            </p>
                        </div>
                    </Card>

                    {/* Paste + preview */}
                    <Card as="section" hover={false}>
                        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                            Paste JSON
                        </h3>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            spellCheck={false}
                            rows={12}
                            placeholder="Paste your JSON here…"
                            className="w-full resize-y rounded-xl border border-neutral-200 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                        />
                        <div className="mt-4 flex items-center justify-end gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => setText('')}
                                disabled={!text || busy}
                            >
                                Clear
                            </Button>
                            <Button
                                icon="fa-solid fa-arrow-right"
                                onClick={handlePreview}
                                disabled={busy}
                            >
                                {busy ? 'Checking…' : 'Preview import'}
                            </Button>
                        </div>
                    </Card>
                </>
            )}
        </div>
    )
}

function ReconcileStage({
    preview,
    choices,
    counts,
    busy,
    onChoose,
    onImport,
    onCancel,
}: {
    preview: WorkoutImportPreview
    choices: Record<string, string>
    counts: { linked: number; created: number }
    busy: boolean
    onChoose: (key: string, value: string) => void
    onImport: () => void
    onCancel: () => void
}) {
    const workoutCount = preview.workouts.length
    return (
        <div className="flex flex-col gap-6">
            {/* Summary */}
            <Card as="section" hover={false}>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Stat label="Workouts" value={workoutCount} />
                    <div className="hidden h-8 w-px bg-neutral-200 sm:block" />
                    <Stat label="Exercises" value={preview.exercises.length} />
                    <div className="hidden h-8 w-px bg-neutral-200 sm:block" />
                    <Stat label="Will link" value={counts.linked} />
                    <div className="hidden h-8 w-px bg-neutral-200 sm:block" />
                    <Stat label="Will create" value={counts.created} />
                </div>
            </Card>

            {/* Exercise reconciliation */}
            <Card as="section" hover={false}>
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-neutral-400">
                    Exercises
                </h3>
                <p className="mb-4 text-xs text-neutral-500">
                    Each distinct exercise name from your paste. Link it to an existing exercise, or
                    create a new one.
                </p>
                <ul className="flex flex-col divide-y divide-neutral-100">
                    {preview.exercises.map((ex) => {
                        const chip = STATUS_CHIP[ex.status]
                        return (
                            <li
                                key={ex.key}
                                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                            >
                                <div className="min-w-0 sm:flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-medium text-neutral-800">
                                            {ex.name}
                                        </span>
                                        <span
                                            className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${chip.className}`}
                                        >
                                            {chip.label}
                                        </span>
                                    </div>
                                    {ex.status === 'ambiguous' && (
                                        <p className="mt-0.5 text-xs text-amber-600">
                                            No exact match — check the suggestion below.
                                        </p>
                                    )}
                                </div>
                                <Select
                                    value={choices[ex.key]}
                                    onChange={(v) => onChoose(ex.key, v)}
                                    options={optionsFor(ex, preview.existing)}
                                    className="w-full sm:w-72"
                                />
                            </li>
                        )
                    })}
                </ul>
            </Card>

            <div className="flex items-center justify-end gap-3">
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                    Back
                </Button>
                <Button icon="fa-solid fa-file-import" onClick={onImport} disabled={busy}>
                    {busy
                        ? 'Importing…'
                        : `Import ${workoutCount} ${workoutCount === 1 ? 'workout' : 'workouts'}`}
                </Button>
            </div>
        </div>
    )
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className="text-lg font-bold tabular-nums text-neutral-900">{value}</p>
        </div>
    )
}
