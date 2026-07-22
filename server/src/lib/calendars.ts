import { Types } from 'mongoose'
import Calendar, { ICalendar } from '../models/Calendar'

/** Name given to the calendar every pre-existing event is migrated onto. */
export const DEFAULT_CALENDAR_NAME = 'Life'

/**
 * Returns the user's default calendar, creating it on first use.
 *
 * Every event belongs to exactly one calendar, so this is the floor the rest of
 * the feature stands on: a user who has never opened the filter bar still has
 * somewhere for their events to live.
 */
export async function ensureDefaultCalendar(
    userId: string | Types.ObjectId
): Promise<ICalendar> {
    const existing = await Calendar.findOne({ user: userId, isDefault: true })
    if (existing) return existing

    // Calendars exist but none is flagged default (a deleted default, say) —
    // promote the first rather than creating a duplicate "Life".
    const first = await Calendar.findOne({ user: userId }).sort({ order: 1 })
    if (first) {
        first.isDefault = true
        await first.save()
        return first
    }

    try {
        return await Calendar.create({
            user: userId,
            name: DEFAULT_CALENDAR_NAME,
            color: 'neutral',
            isDefault: true,
            visible: true,
            order: 0,
        })
    } catch {
        // Lost a race against a concurrent request — the unique { user, name }
        // index rejected the second insert, so re-read the winner.
        const winner = await Calendar.findOne({ user: userId, name: DEFAULT_CALENDAR_NAME })
        if (winner) return winner
        throw new Error('Could not resolve a default calendar')
    }
}
