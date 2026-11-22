import { useMemo, useState, type DragEvent } from 'react'
import Select from '../Select'
import Input from '../Input'

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
    onOpen,
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
    /** Clicking an item's name opens its details. Without it the name is plain text. */
    onOpen?: (item: LibraryEntry<K>) => void
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

    const partLabel = parts.find((p) => p.value === part)?.label ?? ''
    return (
        <aside aria-label={title} className={`flex min-h-0 flex-col ${className}`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">Library</p>
            <h2 className="mt-3 text-[26px] font-normal leading-[1.15] tracking-[-0.02em]">{title}</h2>

            <label htmlFor="library-search" className="mt-5 block text-[13px] text-neutral-600">
                Search
            </label>
            <Input
                id="library-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${title.toLowerCase()}`}
                wrapperClassName="mt-1.5 w-full"
            />

            {filters.length > 2 && (
                <div role="group" aria-label="Filter" className="mt-3 flex border border-neutral-900">
                    {filters.map((f, i) => (
                        <button
                            key={f.value}
                            type="button"
                            aria-pressed={filter === f.value}
                            onClick={() => setFilter(f.value)}
                            className={`h-11 flex-[1_1_auto] lg:h-[38px] px-2.5 text-[13px] ${
                                filter === f.value
                                    ? 'bg-neutral-900 font-medium text-white'
                                    : `bg-white text-neutral-900 hover:bg-neutral-50 ${i > 0 && filters[i - 1].value !== filter ? 'border-l border-[#dcdcdc]' : ''}`
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-y border-[#dcdcdc] py-3">
                <span className="shrink-0 whitespace-nowrap text-neutral-600">Click adds to</span>
                <Select
                    value={part}
                    onChange={(v) => onPart(v as P)}
                    options={parts.map((p) => ({ value: p.value, label: `${target} · ${p.label}` }))}
                    className="min-w-0 flex-1"
                />
            </div>

            <ul className="mt-2 min-h-0 flex-1">
                {shown.length === 0 && <li className="border-b border-[#dcdcdc] py-4 text-[13px] text-neutral-600">Nothing matches.</li>}
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
                        className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-[#dcdcdc] py-3.5 md:cursor-grab md:active:cursor-grabbing"
                    >
                        <span className={`h-2.5 w-2.5 ${item.dot}`} aria-hidden="true" />
                        {(() => {
                            const body = (
                                <>
                                    <span className={`block truncate font-medium ${onOpen ? 'group-hover/open:underline group-hover/open:underline-offset-4' : ''}`}>
                                        {item.name}
                                    </span>
                                    <span className="block text-[13px] text-neutral-600">
                                        {item.meta}
                                        {item.aside && (
                                            <span aria-label={asideLabel ? `${asideLabel}: ${item.aside}` : undefined}> · {item.aside}</span>
                                        )}
                                    </span>
                                </>
                            )
                            return onOpen ? (
                                <button
                                    type="button"
                                    onClick={() => onOpen(item)}
                                    aria-label={`See ${item.name}`}
                                    className="group/open min-w-0 text-left"
                                >
                                    {body}
                                </button>
                            ) : (
                                <span className="min-w-0">{body}</span>
                            )
                        })()}
                        <button
                            type="button"
                            onClick={() => onAdd(item)}
                            aria-label={`Add ${item.name} to ${target} ${partLabel.toLowerCase()}`}
                            className="h-11 border border-neutral-900 px-3 text-[11px] lg:h-10 font-medium uppercase tracking-[0.12em] hover:bg-neutral-900 hover:text-white"
                        >
                            Add
                        </button>
                    </li>
                ))}
            </ul>
        </aside>
    )
}
