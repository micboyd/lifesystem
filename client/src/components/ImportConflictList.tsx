import { Card } from './Card'

/** One incoming item whose name already exists in the library. */
export interface NameConflict {
    name: string
    existingId: string
}

export type ConflictChoice = 'overwrite' | 'create'

/** Case-insensitive key used to line choices up with incoming items. */
export function conflictKey(name: string): string {
    return name.trim().toLowerCase()
}

/**
 * Lets the user decide, per name clash, whether to overwrite the existing
 * library item (updates it in place — so the weekly planner reflects the change
 * everywhere it's used) or create a separate new copy. A header toggle sets them
 * all at once; each row can then be tweaked individually.
 */
export default function ImportConflictList({
    conflicts,
    noun,
    choices,
    onChange,
}: {
    conflicts: NameConflict[]
    /** Singular noun, e.g. "session". */
    noun: string
    choices: Record<string, ConflictChoice>
    onChange: (choices: Record<string, ConflictChoice>) => void
}) {
    const setAll = (choice: ConflictChoice) => {
        const next: Record<string, ConflictChoice> = {}
        for (const c of conflicts) next[conflictKey(c.name)] = choice
        onChange(next)
    }
    const setOne = (name: string, choice: ConflictChoice) => {
        onChange({ ...choices, [conflictKey(name)]: choice })
    }

    const overwriteCount = conflicts.filter(
        (c) => choices[conflictKey(c.name)] === 'overwrite'
    ).length

    return (
        <Card as="section" hover={false}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-400">
                        Name clashes
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600">
                        <span className="font-semibold">{conflicts.length}</span> of these already
                        exist in your library. Overwriting updates the existing {noun} in place, so it
                        stays linked everywhere it’s used in the planner.
                    </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                    <button
                        type="button"
                        onClick={() => setAll('overwrite')}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                    >
                        Overwrite all
                    </button>
                    <button
                        type="button"
                        onClick={() => setAll('create')}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
                    >
                        Keep both for all
                    </button>
                </div>
            </div>

            <ul className="flex flex-col divide-y divide-neutral-100">
                {conflicts.map((c) => {
                    const choice = choices[conflictKey(c.name)] ?? 'overwrite'
                    return (
                        <li
                            key={c.existingId + c.name}
                            className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                        >
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                                {c.name}
                            </span>
                            <div className="inline-flex overflow-hidden rounded-lg border border-neutral-200 text-xs font-semibold">
                                <button
                                    type="button"
                                    onClick={() => setOne(c.name, 'overwrite')}
                                    className={`px-3 py-1.5 transition-colors ${
                                        choice === 'overwrite'
                                            ? 'bg-coral-500 text-white'
                                            : 'bg-white text-neutral-500 hover:bg-neutral-50'
                                    }`}
                                >
                                    Overwrite
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOne(c.name, 'create')}
                                    className={`border-l border-neutral-200 px-3 py-1.5 transition-colors ${
                                        choice === 'create'
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-white text-neutral-500 hover:bg-neutral-50'
                                    }`}
                                >
                                    Keep both
                                </button>
                            </div>
                        </li>
                    )
                })}
            </ul>

            <p className="mt-3 text-xs text-neutral-400">
                {overwriteCount} will overwrite · {conflicts.length - overwriteCount} will be added as
                new
            </p>
        </Card>
    )
}

/** Turn the per-name choices into the `{ lowercasedName: existingId }` overwrite map. */
export function toOverwriteMap(
    conflicts: NameConflict[],
    choices: Record<string, ConflictChoice>
): Record<string, string> {
    const map: Record<string, string> = {}
    for (const c of conflicts) {
        if ((choices[conflictKey(c.name)] ?? 'overwrite') === 'overwrite') {
            map[conflictKey(c.name)] = c.existingId
        }
    }
    return map
}
