import type { Event, Part } from '../types'

/** An imported Google meeting as the server lists it for a date range. */
export interface MeetingBlock {
    _id: string
    date: string
    title: string
    startTime: string
    endTime: string
    location?: string
    notes?: string
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

/** Morning before 12:00, afternoon before 17:00, evening from 17:00. */
export function partForMinutes(min: number): Exclude<Part, 'na'> {
    if (min < 12 * 60) return 'morning'
    if (min < 17 * 60) return 'afternoon'
    return 'evening'
}

/**
 * A meeting in the shape the planner's clash code reads: one day, from the part
 * it starts in to the part its last minute falls in — so 9:00–12:00 is morning
 * only, and 11:30–13:00 covers morning and afternoon. Meetings live in Timebox,
 * not on the calendar, so these are built on the fly and never saved.
 */
export function meetingAsEvent(m: MeetingBlock): Event {
    const start = toMinutes(m.startTime)
    const lastMinute = Math.max(start, toMinutes(m.endTime) - 1)
    return {
        _id: `meeting-${m._id}`,
        calendar: '',
        title: m.title,
        notes: m.notes,
        location: m.location,
        eventType: 'general',
        allDay: false,
        time: m.startTime,
        startDate: m.date,
        startPart: partForMinutes(start),
        endDate: m.date,
        endPart: partForMinutes(lastMinute),
        ignoreClash: false,
        createdAt: '',
        updatedAt: '',
    }
}
