import { useSyncExternalStore } from 'react'
import { getCalendarFilters, subscribeCalendarFilters } from '../lib/calendarFilters'
import type { CalendarFilters } from '../lib/calendarFilters'

/**
 * Subscribe a component to the calendar's local filters (hidden event types and
 * hidden grid rows), re-rendering it whenever they change.
 */
export function useCalendarFilters(): CalendarFilters {
    return useSyncExternalStore(subscribeCalendarFilters, getCalendarFilters, getCalendarFilters)
}
