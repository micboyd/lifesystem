import type { Event } from '../../types'

/**
 * Drinking events that start in `month` (YYYY-MM), in date order. Pass every
 * loaded event, not just the visible ones — the count shouldn't change when a
 * calendar or category is filtered out of view.
 */
export function alcoholEventsInMonth(events: Event[], month: string): Event[] {
    return events
        .filter((e) => e.alcohol && e.startDate.slice(0, 7) === month)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** Distinct days with a drinking event — two events on one night count once. */
export function drinkingDays(events: Event[]): number {
    return new Set(events.map((e) => e.startDate)).size
}

interface Props {
    /** The month's drinking events, from alcoholEventsInMonth. */
    events: Event[]
    /** Opens the month's drinking events in a picker. */
    onOpen: (events: Event[]) => void
}

/** Small beer tab on a month's header: how many days that month involved drinking. Hidden at 0. */
export default function AlcoholTab({ events, onOpen }: Props) {
    const days = drinkingDays(events)
    if (days === 0) return null
    const label = `${days} drinking day${days === 1 ? '' : 's'}`
    return (
        <button
            type="button"
            onClick={() => onOpen(events)}
            title={label}
            aria-label={label}
            className="inline-flex h-7 items-center gap-1.5 border border-amber-300 bg-amber-50 px-2.5 text-[12px] font-medium tabular-nums text-amber-800 transition hover:border-amber-500"
        >
            <i className="fa-solid fa-beer-mug-empty text-[11px]" aria-hidden="true" />
            {days}
        </button>
    )
}
