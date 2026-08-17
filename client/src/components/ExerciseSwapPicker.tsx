import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { rankSwaps, resolveTags, tokenise, type SwapOption } from '../lib/exerciseSwap'
import type { Exercise } from '../types'

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
            className="flex w-full flex-col gap-1 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-left transition-colors hover:border-coral-300 hover:bg-coral-50/50"
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
 * The "that machine's taken" picker: ranked stand-ins for one exercise, with a
 * search box to override the ranking when you already know what you want.
 *
 * Suggestions are limited to a handful — this is used mid-set with a phone in one
 * hand, so a long list is worse than a short one. Searching drops the relatedness
 * filter entirely and matches the whole library by name, because sometimes the
 * gym decides for you and the honest record is whatever you actually did.
 */
export default function ExerciseSwapPicker({
    target,
    library,
    excludeIds,
    onPick,
    onCancel,
}: {
    /** The exercise that isn't available. */
    target: Exercise
    library: Exercise[]
    /** Exercises already in this session — offering them back is no help. */
    excludeIds?: string[]
    onPick: (exercise: Exercise) => void
    onCancel: () => void
}) {
    const [query, setQuery] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        inputRef.current?.focus()
    }, [])

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

    return (
        <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Swap {target.name}
                </p>
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Cancel swap"
                    className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                </button>
            </div>

            <input
                ref={inputRef}
                type="search"
                placeholder="Search the library…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-300 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-200"
            />

            {shown.length === 0 ? (
                <p className="px-1 py-2 text-xs text-neutral-400">
                    {searching
                        ? `Nothing in your library matches “${query.trim()}”.`
                        : 'No related exercises in your library yet. Search above, or tag your exercises with a muscle group so swaps have something to match on.'}
                </p>
            ) : (
                <div className="flex flex-col gap-1.5">
                    {shown.map((option) => (
                        <Option key={option.exercise._id} option={option} onPick={onPick} />
                    ))}
                </div>
            )}
        </div>
    )
}
