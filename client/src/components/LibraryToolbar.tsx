import type { ReactNode } from 'react'
import Input from './Input'
import Button from './Button'
import Select from './Select'
import { LIBRARY_SORTS, type LibrarySort } from '../lib/librarySort'

/**
 * The top of a library tab (workouts, exercises, conditioning sessions): how
 * many there are beside Import and New, and a full-width search under them.
 */
export default function LibraryToolbar({
    search,
    onSearch,
    placeholder,
    count,
    noun,
    onImport,
    importDisabled = false,
    newLabel,
    onNew,
    menu,
    sort,
    onSort,
    newCount = 0,
    newOnly = false,
    onNewOnly,
    children,
}: {
    search: string
    onSearch: (value: string) => void
    placeholder: string
    /** How many match — hidden while unknown. */
    count?: number
    /** Singular, e.g. "workout". */
    noun: string
    /** Leave out for a library with nothing to import. */
    onImport?: () => void
    importDisabled?: boolean
    newLabel: string
    onNew: () => void
    /** An overflow menu after New, e.g. "Delete all". */
    menu?: ReactNode
    /** The library's order — with `onSort`, a Sort menu sits under the search. */
    sort?: LibrarySort
    onSort?: (next: LibrarySort) => void
    /** How many were added this week — a "New this week" filter shows when any were. */
    newCount?: number
    newOnly?: boolean
    onNewOnly?: (next: boolean) => void
    /** Filters and sorting, under the search. */
    children?: ReactNode
}) {
    const searching = search.trim() !== ''
    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
                <p className="whitespace-nowrap text-sm text-neutral-500">
                    {count != null && (
                        <>
                            <span className="font-semibold tabular-nums text-neutral-900">
                                {count}
                            </span>{' '}
                            {count === 1 ? noun : `${noun}s`}
                            {searching && ' found'}
                        </>
                    )}
                </p>
                <div className="flex max-w-full flex-wrap items-center gap-2 sm:gap-2.5">
                    {onImport && (
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-file-import"
                            onClick={onImport}
                            disabled={importDisabled}
                            aria-label="Import"
                            className="px-3.5 sm:px-[18px]"
                        >
                            <span className="hidden sm:inline">Import</span>
                        </Button>
                    )}
                    <Button icon="fa-solid fa-plus" onClick={onNew}>
                        {newLabel}
                    </Button>
                    {menu}
                </div>
            </div>
            <Input
                icon="fa-solid fa-magnifying-glass"
                type="search"
                placeholder={placeholder}
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                aria-label={placeholder}
            />
            {(onSort || (onNewOnly && (newCount > 0 || newOnly))) && (
                <LibraryFilters
                    sort={sort}
                    onSort={onSort}
                    newCount={newCount}
                    newOnly={newOnly}
                    onNewOnly={onNewOnly}
                />
            )}
            {children}
        </div>
    )
}

/**
 * A library's "New this week" filter and Sort menu, on one row. Used under the
 * toolbar's search, and on its own where a library has no toolbar.
 */
export function LibraryFilters({
    sort,
    onSort,
    newCount = 0,
    newOnly = false,
    onNewOnly,
    children,
}: {
    sort?: LibrarySort
    onSort?: (next: LibrarySort) => void
    newCount?: number
    newOnly?: boolean
    onNewOnly?: (next: boolean) => void
    /** More filters, before the New chip. */
    children?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {children}
            {onNewOnly && (newCount > 0 || newOnly) && (
                <button
                    type="button"
                    aria-pressed={newOnly}
                    onClick={() => onNewOnly(!newOnly)}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors ${
                        newOnly
                            ? 'border-neutral-900 bg-neutral-900 text-white'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                    }`}
                >
                    <i className="fa-regular fa-calendar-plus text-[11px]" aria-hidden="true" />
                    New this week
                    <span className={`tabular-nums ${newOnly ? 'text-white/70' : 'text-neutral-400'}`}>
                        {newCount}
                    </span>
                </button>
            )}
            {onSort && (
                <Select
                    value={sort ?? 'library'}
                    onChange={(v) => onSort(v as LibrarySort)}
                    options={LIBRARY_SORTS}
                    className="ml-auto w-full sm:w-48"
                />
            )}
        </div>
    )
}
