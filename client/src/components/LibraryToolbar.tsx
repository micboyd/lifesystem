import type { ReactNode } from 'react'
import Input from './Input'
import Button from './Button'

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
    /** Filters and sorting, under the search. */
    children?: ReactNode
}) {
    const searching = search.trim() !== ''
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-neutral-500">
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
                <div className="flex shrink-0 items-center gap-2.5">
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
            {children}
        </div>
    )
}
