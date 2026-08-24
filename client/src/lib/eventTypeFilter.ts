import { EVENT_TYPES, type EventType } from '../types'

/**
 * Which event categories the calendar is currently hiding.
 *
 * Unlike calendar layers — which live on the server because a layer being off
 * is a property of the calendar itself — a type filter is a way of *looking* at
 * the grid right now, so it stays on the device. It's still remembered across
 * reloads: switching to "trips only" to plan a year and losing it on refresh
 * would be worse than the filter following you between devices.
 *
 * Framework-agnostic (mirroring `moneyVisibility`) so the store can be read
 * without React; `useHiddenEventTypes` subscribes components to it.
 */

const STORAGE_KEY = 'calendarHiddenEventTypes'

function readInitial(): Set<EventType> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return new Set()
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return new Set()
        // Drop anything that isn't a live type, so a renamed or removed
        // category can't leave events permanently invisible.
        return new Set(parsed.filter((t): t is EventType => EVENT_TYPES.includes(t as EventType)))
    } catch {
        return new Set()
    }
}

let hidden = readInitial()
const listeners = new Set<() => void>()

/** The hidden set. Identity is stable until it changes, so it works as a snapshot. */
export function getHiddenEventTypes(): ReadonlySet<EventType> {
    return hidden
}

function commit(next: Set<EventType>): void {
    hidden = next
    try {
        if (next.size) localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
        else localStorage.removeItem(STORAGE_KEY)
    } catch {
        /* persistence is best-effort (private mode, blocked storage) */
    }
    listeners.forEach((notify) => notify())
}

export function setEventTypeHidden(type: EventType, isHidden: boolean): void {
    if (hidden.has(type) === isHidden) return
    const next = new Set(hidden)
    if (isHidden) next.add(type)
    else next.delete(type)
    commit(next)
}

export function toggleEventType(type: EventType): void {
    setEventTypeHidden(type, !hidden.has(type))
}

/** Clear the filter — every category visible again. */
export function showAllEventTypes(): void {
    if (hidden.size === 0) return
    commit(new Set())
}

export function subscribeEventTypeFilter(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
