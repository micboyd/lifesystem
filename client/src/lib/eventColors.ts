import { CALENDAR_COLOR_CLASSES, EVENT_TYPE_COLORS, NA_EVENT_COLORS } from '../types'
import type { Calendar, Event } from '../types'

export interface EventColors {
    bg: string
    hover: string
    text: string
    light: string
}

/**
 * The palette a chip should use.
 *
 * The default calendar keeps the original eventType colours, so the day-to-day
 * calendar looks exactly as it always has. Only additional layers tint by
 * calendar — which is what makes a Gym chip readable at a glance as *not* part
 * of the normal week.
 */
export function colorsForEvent(event: Event, byId: Map<string, Calendar>): EventColors {
    const calendar = event.calendar ? byId.get(event.calendar) : undefined
    if (calendar && !calendar.isDefault) return CALENDAR_COLOR_CLASSES[calendar.color]
    return event.startPart === 'na' ? NA_EVENT_COLORS : EVENT_TYPE_COLORS[event.eventType]
}
