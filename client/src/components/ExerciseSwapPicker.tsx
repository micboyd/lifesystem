import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
    EQUIPMENT,
    MUSCLE_GROUPS,
    rankSwaps,
    resolveTags,
    tokenise,
    type SwapOption,
} from '../lib/exerciseSwap'
import type { ExerciseInput } from '../services/exercises'
import type { Exercise } from '../types'
import Button from './Button'
import Input from './Input'

/**
 * 16px on phones so iOS doesn't zoom the whole drawer when a field takes focus
 * mid-session; back to the library's `text-sm` from the small breakpoint up.
 */
const NO_ZOOM = 'text-base sm:text-sm'

const SUGGESTION_LIMIT = 6

/** A small tag chip — muscle group or equipment. */
function Chip({ children }: { children: ReactNode }) {
    return (
        <span className="inline-flex items-center rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
            {children}
        </span>
    )
}

/** One tappable alternative. */
function Option({
    option,
    onPick,
}: {
    option: SwapOption
    onPick: (exercise: Exercise) => void
}) {
    return (
        <button
            type="button"
            onClick={() => onPick(option.exercise)}
            className="flex w-full flex-col gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-coral-300 hover:bg-coral-50/50 active:bg-coral-50"
        >
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-semibold text-neutral-900">
                    {option.exercise.name}
                </span>
                {option.muscleGroup && <Chip>{option.muscleGroup}</Chip>}
                {option.equipment && <Chip>{option.equipment}</Chip>}
            </span>
            <span className="text-[11px] text-neutral-400">{option.reason}</span>
        </button>
    )
}

/**
 * A single-choice row of tag pills. Tapping the selected one clears it, so every
 * value is one thumb-tap away and none of them opens a second layer — a dropdown
 * on top of an already-open drawer is a lot of chrome for a tag.
 */
function TagPills({
    label,
    options,
    value,
    onChange,
    hint,
}: {
    label: string
    options: readonly string[]
    value: string
    onChange: (value: string) => void
    hint?: string
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <div className="flex flex-wrap gap-1.5">
                {options.map((option) => {
                    const on = value === option
                    return (
                        <button
                            key={option}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onChange(on ? '' : option)}
                            className={[
                                'min-h-[36px] rounded-full border px-3 text-xs font-semibold transition-colors',
                                on
                                    ? 'border-coral-500 bg-coral-500 text-white'
                                    : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300 active:bg-neutral-100',
                            ].join(' ')}
                        >
                            {option}
                        </button>
                    )
                })}
            </div>
            {hint && <p className="text-[11px] text-neutral-400">{hint}</p>}
        </div>
    )
}

/**
 * The "that machine's taken" picker: ranked stand-ins for one exercise, with a
 * search box to override the ranking when you already know what you want.
 *
 * Suggestions are limited to a handful — this is used mid-set with a phone in one
 * hand, so a long list is worse than a short one. Searching drops the relatedness
 * filter entirely and matches the whole library by name, because sometimes the
 * gym decides for you and the honest record is whatever you actually did.
 *
 * When the gym decides on something that isn't in the library at all, the picker
 * adds it: one field and two rows of pills, prefilled from what's already known,
 * so the fast path is type-and-tap without leaving the session.
 */
export default function ExerciseSwapPicker({
    target,
    library,
    excludeIds,
    onPick,
    onCreate,
    onCancel,
}: {
    /** The exercise that isn't available. */
    target: Exercise
    library: Exercise[]
    /** Exercises already in this session — offering them back is no help. */
    excludeIds?: string[]
    onPick: (exercise: Exercise) => void
    /**
     * Add a new exercise to the library, resolving to the created record. Left
     * out, the picker offers only what is already there.
     */
    onCreate?: (fields: ExerciseInput) => Promise<Exercise>
    onCancel: () => void
}) {
    const [query, setQuery] = useState('')
    /** The picker is either browsing the library or filling in a new exercise. */
    const [mode, setMode] = useState<'list' | 'create'>('list')
    const inputRef = useRef<HTMLInputElement>(null)
    const nameRef = useRef<HTMLInputElement>(null)

    // New-exercise fields. The tags follow the name until the user overrides one,
    // at which point that pill row is theirs.
    const [name, setName] = useState('')
    const [muscleGroup, setMuscleGroup] = useState('')
    const [equipment, setEquipment] = useState('')
    const [touched, setTouched] = useState({ group: false, equipment: false })
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    const targetTags = useMemo(() => resolveTags(target), [target])

    const suggestions = useMemo(
        () => rankSwaps(target, library, { excludeIds, limit: SUGGESTION_LIMIT }),
        [target, library, excludeIds]
    )

    // Searching goes wider than the suggestions: any library exercise but this one.
    const matches = useMemo(() => {
        const words = tokenise(query)
        if (words.length === 0) return []
        const excluded = new Set(excludeIds ?? [])
        return library
            .filter((e) => e._id !== target._id && !excluded.has(e._id))
            .filter((e) => {
                const hay = tokenise(`${e.name} ${e.description ?? ''}`).join(' ')
                return words.every((w) => hay.includes(w))
            })
            .slice(0, SUGGESTION_LIMIT)
            .map((exercise): SwapOption => {
                const tags = resolveTags(exercise)
                return {
                    exercise,
                    muscleGroup: tags.muscleGroup,
                    equipment: tags.equipment,
                    score: 0,
                    reason: 'From your library',
                    avoidsStation: false,
                }
            })
    }, [query, library, target, excludeIds])

    const searching = query.trim() !== ''
    const shown = searching ? matches : suggestions

    /**
     * Read the tags off the name as it's typed, falling back to the target's
     * muscle group — a stand-in for a chest press is nearly always chest work, and
     * an untagged exercise is one that never turns up in a future swap.
     */
    useEffect(() => {
        if (mode !== 'create') return
        const guess = resolveTags({ name, description: '' })
        if (!touched.group) setMuscleGroup(guess.muscleGroup ?? targetTags.muscleGroup ?? '')
        if (!touched.equipment) setEquipment(guess.equipment ?? '')
    }, [mode, name, touched, targetTags])

    /** An existing library entry by this name — a second copy of it helps nobody. */
    const duplicate = useMemo(() => {
        const key = name.trim().toLowerCase()
        if (!key) return undefined
        return library.find((e) => e.name.trim().toLowerCase() === key)
    }, [name, library])

    const isTarget = duplicate?._id === target._id

    function openCreate() {
        setName(query.trim())
        setTouched({ group: false, equipment: false })
        setError(null)
        setMode('create')
        // The tag effect fills the pills in; the keyboard should land on the name.
        requestAnimationFrame(() => nameRef.current?.focus())
    }

    function closeCreate() {
        setMode('list')
        setError(null)
        requestAnimationFrame(() => inputRef.current?.focus())
    }

    async function submitCreate() {
        const trimmed = name.trim()
        if (!onCreate || !trimmed || creating) return
        // Typing the name of something already in the library swaps that in
        // instead of filling the library with near-duplicates.
        if (duplicate) {
            if (!isTarget) onPick(duplicate)
            return
        }
        setCreating(true)
        setError(null)
        try {
            const created = await onCreate({ name: trimmed, muscleGroup, equipment })
            onPick(created)
        } catch {
            setError('Could not save that exercise. Try again.')
        } finally {
            setCreating(false)
        }
    }

    return (
        <div className="flex flex-col gap-2.5 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {mode === 'create' && (
                        <button
                            type="button"
                            onClick={closeCreate}
                            aria-label="Back to suggestions"
                            className="-my-1 -ml-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                        >
                            <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        </button>
                    )}
                    <span className="truncate">
                        {mode === 'create' ? 'New exercise' : `Swap ${target.name}`}
                    </span>
                </p>
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Cancel swap"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                </button>
            </div>

            {mode === 'list' ? (
                <>
                    <Input
                        ref={inputRef}
                        icon="fa-solid fa-magnifying-glass"
                        type="search"
                        placeholder="Search the library…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoCapitalize="words"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="search"
                        aria-label="Search exercises"
                        className={NO_ZOOM}
                    />

                    {shown.length === 0 ? (
                        <p className="px-1 text-xs text-neutral-400">
                            {searching
                                ? `Nothing in your library matches “${query.trim()}”.`
                                : onCreate
                                  ? 'No related exercises in your library yet — add what you’re actually doing below, or tag your exercises with a muscle group so swaps have something to match on.'
                                  : 'No related exercises in your library yet. Search above, or tag your exercises with a muscle group so swaps have something to match on.'}
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {shown.map((option) => (
                                <Option key={option.exercise._id} option={option} onPick={onPick} />
                            ))}
                        </div>
                    )}

                    {onCreate && (
                        <button
                            type="button"
                            onClick={openCreate}
                            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-600 transition-colors hover:border-coral-300 hover:text-coral-600 active:bg-neutral-100"
                        >
                            <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                            <span className="min-w-0 truncate">
                                {searching ? `Create “${query.trim()}”` : 'New exercise'}
                            </span>
                        </button>
                    )}
                </>
            ) : (
                <div className="flex flex-col gap-3">
                    <Input
                        ref={nameRef}
                        type="text"
                        placeholder="e.g. Plate-loaded chest press"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault()
                                void submitCreate()
                            }
                        }}
                        autoCapitalize="words"
                        autoCorrect="off"
                        enterKeyHint="done"
                        aria-label="Exercise name"
                        className={NO_ZOOM}
                    />

                    <TagPills
                        label="Trains"
                        options={MUSCLE_GROUPS}
                        value={muscleGroup}
                        onChange={(v) => {
                            setTouched((t) => ({ ...t, group: true }))
                            setMuscleGroup(v)
                        }}
                        hint={
                            muscleGroup
                                ? undefined
                                : 'Set this so the exercise turns up in future swaps'
                        }
                    />

                    <TagPills
                        label="Equipment"
                        options={EQUIPMENT}
                        value={equipment}
                        onChange={(v) => {
                            setTouched((t) => ({ ...t, equipment: true }))
                            setEquipment(v)
                        }}
                        hint={equipment ? undefined : 'Optional — read from the name when blank'}
                    />

                    {duplicate && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                            {isTarget
                                ? `“${duplicate.name}” is the exercise you’re swapping out.`
                                : `“${duplicate.name}” is already in your library.`}
                        </p>
                    )}

                    {error && <p className="px-1 text-[11px] text-red-500">{error}</p>}

                    <p className="px-1 text-[11px] text-neutral-400">
                        Saved to your exercise library and swapped into this session.
                    </p>

                    {/* Primary fills the row: at arm's length on a phone, the tap
                        that matters shouldn't be the one you have to aim for. */}
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={closeCreate} className="shrink-0 px-4">
                            Back
                        </Button>
                        <Button
                            onClick={() => void submitCreate()}
                            disabled={creating || name.trim() === '' || isTarget}
                            className="flex-1"
                        >
                            {creating
                                ? 'Saving…'
                                : duplicate && !isTarget
                                  ? 'Use it instead'
                                  : 'Create & swap in'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
