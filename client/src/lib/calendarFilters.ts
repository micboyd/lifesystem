import { EVENT_TYPES, type EventType } from '../types'

/**
 * What the calendar is currently choosing not to draw: event categories, and
 * the two standalone grid rows (Other, Leave) that aren't categories at all.
 *
 * Unlike calendar layers — which live on the server because a layer being off
 * is a property of the calendar itself — these are ways of *looking* at the
 * grid right now, so they stay on the device. They're still remembered across
 * reloads: switching to "trips only" to plan a year and losing it on refresh
 * would be worse than the filter following you between devices.
 *
 * Framework-agnostic (mirroring `moneyVisibility`) so the store can be read
 * without React; `useCalendarFilters` subscribes components to it.
 */

/** Grid rows that sit outside the morning/afternoon/evening slots. */
export const CALENDAR_ROWS = ['other', 'leave'] as const
export type CalendarRow = (typeof CALENDAR_ROWS)[number]

export const CALENDAR_ROW_LABELS: Record<CalendarRow, string> = {
    other: 'Other',
    leave: 'Leave',
}

export const CALENDAR_ROW_ICONS: Record<CalendarRow, string> = {
    other: 'fa-solid fa-ellipsis',
    leave: 'fa-solid fa-umbrella-beach',
}

export interface CalendarFilters {
    /** Event categories hidden from every view. */
    types: ReadonlySet<EventType>
    /** Rows dropped from the Week and Year grids. */
    rows: ReadonlySet<CalendarRow>
}

const STORAGE_KEY = 'calendarFilters'

function readList<T extends string>(value: unknown, allowed: readonly T[]): Set<T> {
    if (!Array.isArray(value)) return new Set()
    // Drop anything that isn't live, so a renamed or removed category can't
    // leave events permanently invisible.
    return new Set(value.filter((v): v is T => allowed.includes(v as T)))
}

function readInitial(): CalendarFilters {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { types: new Set(), rows: new Set() }
        const parsed = JSON.parse(raw) as { types?: unknown; rows?: unknown }
        return {
            types: readList(parsed.types, EVENT_TYPES),
            rows: readList(parsed.rows, CALENDAR_ROWS),
        }
    } catch {
        return { types: new Set(), rows: new Set() }
    }
}

let filters = readInitial()
const listeners = new Set<() => void>()

/** Identity is stable until something changes, so this works as a snapshot. */
export function getCalendarFilters(): CalendarFilters {
    return filters
}

function commit(next: CalendarFilters): void {
    filters = next
    try {
        if (next.types.size || next.rows.size) {
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ types: [...next.types], rows: [...next.rows] })
            )
        } else {
            localStorage.removeItem(STORAGE_KEY)
        }
    } catch {
        /* persistence is best-effort (private mode, blocked storage) */
    }
    listeners.forEach((notify) => notify())
}

export function setEventTypeHidden(type: EventType, isHidden: boolean): void {
    if (filters.types.has(type) === isHidden) return
    const types = new Set(filters.types)
    if (isHidden) types.add(type)
    else types.delete(type)
    commit({ ...filters, types })
}

export function toggleEventType(type: EventType): void {
    setEventTypeHidden(type, !filters.types.has(type))
}

export function setRowHidden(row: CalendarRow, isHidden: boolean): void {
    if (filters.rows.has(row) === isHidden) return
    const rows = new Set(filters.rows)
    if (isHidden) rows.add(row)
    else rows.delete(row)
    commit({ ...filters, rows })
}

export function toggleRow(row: CalendarRow): void {
    setRowHidden(row, !filters.rows.has(row))
}

/** Clear the filter — every category and row visible again. */
export function showAllCalendarFilters(): void {
    if (filters.types.size === 0 && filters.rows.size === 0) return
    commit({ types: new Set(), rows: new Set() })
}

export function subscribeCalendarFilters(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
