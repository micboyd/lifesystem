import { CALENDAR_COLOR_CLASSES } from '../../types'
import { useCalendars } from '../../context/CalendarsContext'
import type { Event } from '../../types'

interface Props {
    /** Events on hidden calendars that touch this day. */
    events: Event[]
    /** Turn the clicked layer back on. */
    onReveal: (calendarId: string) => void
    size?: 'sm' | 'md'
}

/**
 * Ambient presence for hidden layers: a coloured dot per calendar that has
 * something on this day.
 *
 * Deliberately *not* a warning icon. A gym session on a day with dinner plans
 * isn't an error, and an alarm that fires on a non-problem gets tuned out —
 * this only says "the day isn't as empty as it looks". The one place a real
 * nudge appears is the editor, at the moment a slot is actually being claimed.
 */
export default function HiddenCalendarDots({ events, onReveal, size = 'md' }: Props) {
    const { byId } = useCalendars()
    if (events.length === 0) return null

    // Group by calendar, preserving first-seen order.
    const groups = new Map<string, string[]>()
    for (const e of events) {
        if (!e.calendar) continue
        const titles = groups.get(e.calendar)
        if (titles) titles.push(e.title)
        else groups.set(e.calendar, [e.title])
    }
    if (groups.size === 0) return null

    const dot = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2'

    return (
        <span className="inline-flex items-center gap-1">
            {[...groups].map(([calendarId, titles]) => {
                const calendar = byId.get(calendarId)
                if (!calendar) return null
                return (
                    <button
                        key={calendarId}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation()
                            onReveal(calendarId)
                        }}
                        title={`${calendar.name} · ${titles.join(', ')} — click to show`}
                        aria-label={`Show ${calendar.name}: ${titles.join(', ')}`}
                        className="grid place-items-center rounded-full p-0.5 transition-transform hover:scale-125"
                    >
                        <span
                            className={`block rounded-full ${dot} ${CALENDAR_COLOR_CLASSES[calendar.color].dot}`}
                        />
                    </button>
                )
            })}
        </span>
    )
}
