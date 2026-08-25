import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Input from './Input'
import Select from './Select'
import Button from './Button'
import { todayKey } from '../lib/calendar'
import {
    EMPTY_LOG_FILTERS,
    LOG_RANGES,
    filterLogs,
    groupByDate,
    nameOptions,
    pageBounds,
    type DatedLog,
    type LogFilterState,
    type LogRange,
} from '../lib/logFilters'

/** What `useLogFilters` hands back: filter state plus the page to render. */
export interface LogFilters<T extends DatedLog> {
    filters: LogFilterState
    setSearch: (v: string) => void
    setName: (v: string) => void
    setRange: (v: LogRange) => void
    /** Distinct entry names, for the middle select. */
    options: { label: string; value: string }[]
    /** Everything matching the current filters, across all pages. */
    filtered: T[]
    /** The current page, grouped into `[date, entries]` pairs for date headers. */
    grouped: [string, T[]][]
    page: number
    setPage: (page: number) => void
    pageCount: number
    /** 1-based bounds of the current page, for "Showing 1–10 of 43". */
    first: number
    last: number
    /** True when anything is narrowing the list — including `extra`. */
    active: boolean
    clear: () => void
}

interface UseLogFiltersOptions<T extends DatedLog> {
    /** Extra strings the search box should match against, e.g. notes, exercise names. */
    haystack?: (log: T) => (string | undefined)[]
    /**
     * A filter only one log has (conditioning's category). The owner holds the
     * state; `value` is what it's currently set to ('' when off), which both
     * keys the memo and keeps `active` and `clear` honest.
     */
    extra?: { match: (log: T) => boolean; value: string; clear: () => void }
}

/**
 * Filter, group and page a log. Paired with `LogFilterBar` below — the hook owns
 * the state, the bar renders it, and the caller renders the rows.
 */
export function useLogFilters<T extends DatedLog>(
    logs: T[],
    { haystack, extra }: UseLogFiltersOptions<T> = {}
): LogFilters<T> {
    const [filters, setFilters] = useState<LogFilterState>(EMPTY_LOG_FILTERS)
    const [page, setPage] = useState(1)

    const today = todayKey()
    const extraMatch = extra?.match
    const extraValue = extra?.value ?? ''

    const filtered = useMemo(
        () => filterLogs(logs, filters, today, haystack, extraMatch),
        // `haystack` and `extraMatch` are inline arrows — depending on them would
        // refilter every render, so the filter inputs stand in for them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [logs, filters, today, extraValue]
    )

    const { pageCount, start, end, first, last } = pageBounds(page, filtered.length)

    // A new filter or a deleted entry can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])

    const grouped = useMemo(() => groupByDate(filtered.slice(start, end)), [filtered, start, end])

    const options = useMemo(() => nameOptions(logs, 'All'), [logs])

    // Every filter change re-pages from the top.
    function set<K extends keyof LogFilterState>(key: K) {
        return (value: LogFilterState[K]) => {
            setFilters((prev) => ({ ...prev, [key]: value }))
            setPage(1)
        }
    }

    return {
        filters,
        setSearch: set('search'),
        setName: set('name'),
        setRange: set('range'),
        options,
        filtered,
        grouped,
        page,
        setPage,
        pageCount,
        first,
        last,
        active:
            filters.search.trim() !== '' ||
            filters.name !== '' ||
            filters.range !== 'all' ||
            extraValue !== '',
        clear: () => {
            setFilters(EMPTY_LOG_FILTERS)
            extra?.clear()
            setPage(1)
        },
    }
}

/**
 * The controls above an activity log: search, an entry-name filter, a date range,
 * and the count of what survived. `children` slots in a log-specific filter
 * (conditioning's category) between the name and range selects.
 */
export default function LogFilterBar<T extends DatedLog>({
    controls,
    searchPlaceholder,
    nameLabel,
    nameIcon,
    noun,
    children,
}: {
    controls: LogFilters<T>
    searchPlaceholder: string
    /** The "no filter" option, e.g. "All workouts". */
    nameLabel: string
    nameIcon: string
    /** Singular noun for the count line, e.g. "logged workout". */
    noun: string
    children?: ReactNode
}) {
    const { filters, options, filtered, first, last, active, clear } = controls

    // The "all" option carries the caller's wording rather than the generic one.
    const named = useMemo(
        () => options.map((o) => (o.value === '' ? { ...o, label: nameLabel } : o)),
        [options, nameLabel]
    )

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    aria-label={searchPlaceholder}
                    placeholder={searchPlaceholder}
                    value={filters.search}
                    onChange={(e) => controls.setSearch(e.target.value)}
                    className="w-full sm:w-72"
                />
                <Select
                    options={named}
                    value={filters.name}
                    onChange={controls.setName}
                    placeholder={nameLabel}
                    icon={nameIcon}
                    className="w-full sm:w-52"
                />
                {children}
                <Select
                    options={[...LOG_RANGES]}
                    value={filters.range}
                    onChange={(v) => controls.setRange(v as LogRange)}
                    icon="fa-regular fa-calendar"
                    className="w-full sm:w-44"
                />
                {active && (
                    <Button variant="ghost" icon="fa-solid fa-xmark" onClick={clear}>
                        Clear
                    </Button>
                )}
            </div>

            {filtered.length > 0 && (
                <p className="text-xs text-neutral-400">
                    Showing{' '}
                    <span className="font-semibold tabular-nums text-neutral-600">
                        {first}–{last}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold tabular-nums text-neutral-600">
                        {filtered.length}
                    </span>{' '}
                    {noun}
                    {filtered.length === 1 ? '' : 's'}
                </p>
            )}
        </div>
    )
}
