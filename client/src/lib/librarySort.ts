import { useState } from 'react'

/**
 * How a library (meals, exercises, workouts, sessions, plans) is ordered.
 * `library` is the order it was built in — whatever the library did before.
 */
export type LibrarySort = 'library' | 'recent' | 'updated' | 'name' | 'oldest'

export const LIBRARY_SORTS: { value: LibrarySort; label: string }[] = [
    { value: 'library', label: 'Library order' },
    { value: 'recent', label: 'Recently added' },
    { value: 'updated', label: 'Recently edited' },
    { value: 'name', label: 'A–Z' },
    { value: 'oldest', label: 'Oldest first' },
]

const SORT_VALUES = new Set<string>(LIBRARY_SORTS.map((s) => s.value))

export function isLibrarySort(v: unknown): v is LibrarySort {
    return typeof v === 'string' && SORT_VALUES.has(v)
}

interface Sortable {
    name: string
    createdAt?: string
    updatedAt?: string
}

const time = (iso?: string) => (iso ? Date.parse(iso) || 0 : 0)

/** A copy of `list` in the chosen order; `library` leaves it as it came. */
export function sortLibrary<T extends Sortable>(list: T[], sort: LibrarySort): T[] {
    const out = [...list]
    if (sort === 'recent') out.sort((a, b) => time(b.createdAt) - time(a.createdAt))
    else if (sort === 'oldest') out.sort((a, b) => time(a.createdAt) - time(b.createdAt))
    else if (sort === 'updated')
        out.sort((a, b) => time(b.updatedAt ?? b.createdAt) - time(a.updatedAt ?? a.createdAt))
    else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
    return out
}

/** Added in the last week — gets a "New" tag in a library. */
export function isNew(item: { createdAt?: string }, now = Date.now()): boolean {
    const t = time(item.createdAt)
    return t > 0 && now - t < 7 * 24 * 60 * 60 * 1000
}

/** A library's sort, remembered on this device per library. */
export function useLibrarySort<S extends string = LibrarySort>(
    library: string,
    fallback: S = 'library' as S,
    valid: (v: string) => boolean = isLibrarySort
): [S, (next: S) => void] {
    const key = `librarySort:${library}`
    const [sort, setSort] = useState<S>(() => {
        try {
            const saved = localStorage.getItem(key)
            return saved && valid(saved) ? (saved as S) : fallback
        } catch {
            return fallback
        }
    })
    return [
        sort,
        (next: S) => {
            setSort(next)
            try {
                localStorage.setItem(key, next)
            } catch {
                /* private mode — still sorts for this visit */
            }
        },
    ]
}

/**
 * A library's Sort menu and "New this week" filter together: give it the list
 * (after search) and it hands back the list to show plus the toolbar's props.
 */
export function useLibraryView<T extends Sortable>(library: string, list: T[]) {
    const [sort, onSort] = useLibrarySort(library)
    const [newOnly, onNewOnly] = useState(false)
    const [now] = useState(() => Date.now())
    const fresh = list.filter((i) => isNew(i, now))
    const shown = sortLibrary(newOnly ? fresh : list, sort)
    return { shown, sort, onSort, newOnly, onNewOnly, newCount: fresh.length }
}
