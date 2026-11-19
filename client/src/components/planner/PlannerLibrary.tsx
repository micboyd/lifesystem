import { useMemo, useState, type DragEvent } from 'react'

/** One thing in a planner's library: a workout, a session, a meal. */
export interface LibraryEntry<K extends string = string> {
    /** Which library it comes from (workout, conditioning, a meal type…). */
    kind: K
    id: string
    name: string
    /** One quiet line: what it is, how long, its macros. */
    meta: string
    /** The kind's colour as a solid fill class, for the small square. */
    dot: string
    /** Optional figure on the right, e.g. "7 days" or "780". */
    aside?: string
    /** Other kinds it also counts as for the filter (a meal that's lunch and dinner). */
    alsoKinds?: K[]
}

/** What's being dragged out of the library, for a planner slot to take. */
export interface LibraryDrag<K extends string = string> {
    kind: K
    id: string
}

/**
 * The library beside a week planner: search, a filter, and a list to drag from.
 * Drop an item on any day's slot to plan it there, or click it to add it to
 * the day and part chosen at the top.
 */
export default function PlannerLibrary<K extends string, P extends string>({
    title,
    items,
    filters,
    target,
    parts,
    part,
    onPart,
    onAdd,
    onDragStart,
    onDragEnd,
    asideLabel,
    className = '',
}: {
    title: string
    items: LibraryEntry<K>[]
    /** Filter chips: "All" plus one per kind. */
    filters: { value: K | 'all'; label: string }[]
    /** Where a click adds to, e.g. "Wed 18". */
    target: string
    parts: { value: P; label: string }[]
    part: P
    onPart: (part: P) => void
    onAdd: (item: LibraryEntry<K>) => void
    onDragStart: (drag: LibraryDrag<K>) => void
    onDragEnd: () => void
    /** What the right-hand figure means, for screen readers. */
    asideLabel?: string
    className?: string
}) {
    const [query, setQuery] = useState('')
    const [filter, setFilter] = useState<K | 'all'>('all')

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase()
        return items.filter(
            (i) =>
                (filter === 'all' || i.kind === filter || !!i.alsoKinds?.includes(filter)) &&
                (!q || `${i.name} ${i.meta}`.toLowerCase().includes(q))
        )
    }, [items, query, filter])

    return (
        <aside aria-label={title} className={`flex min-h-0 flex-col gap-3.5 ${className}`}>
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
                <span className="text-[12px] text-neutral-500">Drag onto a day</span>
            </div>

            <label className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-white px-2.5 text-[13px] text-neutral-500 focus-within:border-neutral-900">
                <i className="fa-solid fa-magnifying-glass text-[12px]" aria-hidden="true" />
                <span className="sr-only">Search {title.toLowerCase()}</span>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${title.toLowerCase()}`}
                    className="min-w-0 flex-1 bg-transparent text-neutral-900 outline-none placeholder:text-neutral-500"
                />
            </label>

            {filters.length > 2 && (
                <div role="group" aria-label="Filter" className="flex flex-wrap gap-1 rounded-lg bg-surface-muted p-1 text-[12px] font-medium">
                    {filters.map((f) => (
                        <button
                            key={f.value}
                            type="button"
                            aria-pressed={filter === f.value}
                            onClick={() => setFilter(f.value)}
                            className={`h-7 rounded-md px-2.5 transition-colors ${
                                filter === f.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-neutral-600">
                <span>
                    Click adds to <span className="font-medium text-neutral-900">{target}</span>
                </span>
                <span className="flex gap-0.5 rounded-md bg-surface-muted p-0.5">
                    {parts.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            aria-pressed={part === p.value}
                            onClick={() => onPart(p.value)}
                            className={`h-6 rounded px-2 font-medium transition-colors ${
                                part === p.value ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </span>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto">
                {shown.length === 0 && <li className="border-t border-hairline py-4 text-[13px] text-neutral-500">Nothing matches.</li>}
                {shown.map((item) => (
                    <li
                        key={`${item.kind}:${item.id}`}
                        draggable
                        onDragStart={(e: DragEvent) => {
                            e.dataTransfer.setData('text/plain', item.name)
                            e.dataTransfer.effectAllowed = 'copyMove'
                            onDragStart({ kind: item.kind, id: item.id })
                        }}
                        onDragEnd={onDragEnd}
                        className="group border-t border-hairline md:cursor-grab md:active:cursor-grabbing"
                    >
                        <button
                            type="button"
                            onClick={() => onAdd(item)}
                            title={`Add ${item.name} to ${target}`}
                            className="flex w-full items-center gap-2.5 py-2.5 text-left"
                        >
                            <i
                                className="fa-solid fa-grip-vertical hidden text-[11px] text-neutral-300 group-hover:text-neutral-500 md:inline"
                                aria-hidden="true"
                            />
                            <span className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${item.dot}`} aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-neutral-900">{item.name}</span>
                                <span className="block truncate text-[12px] text-neutral-500">{item.meta}</span>
                            </span>
                            {item.aside && (
                                <span className="shrink-0 text-[12px] text-neutral-500" aria-label={asideLabel ? `${asideLabel}: ${item.aside}` : undefined}>
                                    {item.aside}
                                </span>
                            )}
                            <i
                                className="fa-solid fa-plus text-[11px] text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100"
                                aria-hidden="true"
                            />
                        </button>
                    </li>
                ))}
            </ul>
        </aside>
    )
}
