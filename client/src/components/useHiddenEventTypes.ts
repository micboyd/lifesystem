import { useSyncExternalStore } from 'react'
import { getHiddenEventTypes, subscribeEventTypeFilter } from '../lib/eventTypeFilter'
import type { EventType } from '../types'

/**
 * Subscribe a component to the calendar's event-type filter. Returns the set of
 * categories currently hidden, and re-renders when the filter changes.
 */
export function useHiddenEventTypes(): ReadonlySet<EventType> {
    return useSyncExternalStore(subscribeEventTypeFilter, getHiddenEventTypes, getHiddenEventTypes)
}
