import { addDays, parseDateKey } from './calendar'

/**
 * Filtering, grouping and paging shared by the activity logs (strength workouts,
 * conditioning sessions). They're all the same shape — a newest-first list of
 * dated entries with a snapshotted name — so the search box, the date-range
 * picker and the pager behave identically across them.
 */

/** How many entries a log page shows. */
export const LOG_PAGE_SIZE = 10

export const LOG_RANGES = [
    { label: 'All time', value: 'all' },
    { label: 'This week', value: 'week' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
] as const

export type LogRange = (typeof LOG_RANGES)[number]['value']

/** The minimum shape a log entry needs to be filtered by this module. */
export interface DatedLog {
    date: string
    name: string
}

export interface LogFilterState {
    search: string
    name: string
    range: LogRange
}

export const EMPTY_LOG_FILTERS: LogFilterState = { search: '', name: '', range: 'all' }

/** Monday-based start of the ISO week containing `iso`, as YYYY-MM-DD. */
export function weekStartMonday(iso: string): string {
    const { year, month, day } = parseDateKey(iso)
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay() // 0 = Sun
    return addDays(iso, -(dow === 0 ? 6 : dow - 1))
}

/**
 * The earliest date a range admits, given today. `''` means "no lower bound" —
 * every comparison against it passes, so callers can skip the check.
 */
export function rangeStart(range: LogRange, today: string): string {
    switch (range) {
        case 'week':
            return weekStartMonday(today)
        case '30d':
            return addDays(today, -29)
        case '90d':
            return addDays(today, -89)
        default:
            return ''
    }
}

/** "Today" / "Yesterday" / "Mon, 3 Aug 2026". */
export function formatLogDate(iso: string, today: string): string {
    if (iso === today) return 'Today'
    if (iso === addDays(today, -1)) return 'Yesterday'
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

/**
 * Narrow `logs` by date range, exact name, and a free-text search matched against
 * the strings `haystack` pulls off each entry (its name is always searched too).
 * `extra` is an optional per-log predicate for a filter only one log has.
 */
export function filterLogs<T extends DatedLog>(
    logs: T[],
    filters: LogFilterState,
    today: string,
    haystack: (log: T) => (string | undefined)[] = () => [],
    extra: (log: T) => boolean = () => true
): T[] {
    const q = filters.search.trim().toLowerCase()
    const from = rangeStart(filters.range, today)

    return logs.filter((l) => {
        if (from && l.date < from) return false
        if (filters.name && l.name !== filters.name) return false
        if (!extra(l)) return false
        if (!q) return true
        return [l.name, ...haystack(l)].some((s) => (s ?? '').toLowerCase().includes(q))
    })
}

/**
 * The distinct names present in a log, as Select options behind an "all" entry.
 * Built from the snapshotted names rather than the source library so entries
 * whose workout or session has since been deleted stay reachable.
 */
export function nameOptions<T extends DatedLog>(
    logs: T[],
    allLabel: string
): { label: string; value: string }[] {
    const names = [...new Set(logs.map((l) => l.name))].sort((a, b) => a.localeCompare(b))
    return [{ label: allLabel, value: '' }, ...names.map((n) => ({ label: n, value: n }))]
}

/**
 * Group already-sorted entries into `[date, entries]` pairs. Insertion order is
 * preserved, so a newest-first list stays newest-first.
 */
export function groupByDate<T extends { date: string }>(items: T[]): [string, T[]][] {
    const map = new Map<string, T[]>()
    for (const item of items) {
        const arr = map.get(item.date) ?? []
        arr.push(item)
        map.set(item.date, arr)
    }
    return [...map.entries()]
}

/** Page bounds for a 1-based page over `total` items, clamped to what exists. */
export function pageBounds(page: number, total: number, size = LOG_PAGE_SIZE) {
    const pageCount = Math.max(1, Math.ceil(total / size))
    const safe = Math.min(Math.max(page, 1), pageCount)
    return {
        pageCount,
        start: (safe - 1) * size,
        end: Math.min(safe * size, total),
        /** 1-based index of the first item shown, for "Showing 1–10 of 43". */
        first: total === 0 ? 0 : (safe - 1) * size + 1,
        last: Math.min(safe * size, total),
    }
}
