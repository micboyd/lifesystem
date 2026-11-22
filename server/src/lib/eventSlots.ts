import { Types } from 'mongoose'
import Event, { type IEvent } from '../models/Event'
import { expandRecurring } from './recurrence'

/**
 * Calendar events against meal slots — the server's copy of the client's
 * lib/mealEvents rules. Breakfast sits in the morning, lunch in the afternoon,
 * dinner in the evening; an event in that part of the day (or one running all
 * day) takes the meal. Snacks fit around anything — unless events (one, or
 * several back to back) take breakfast, lunch and dinner: then the whole day is
 * out, snacks too. Events marked "ignore
 * planner clashes" and "Other" ones with no part of the day never take a slot.
 */

type EventLike = Pick<IEvent, 'title' | 'allDay' | 'startDate' | 'startPart' | 'endDate' | 'endPart' | 'ignoreClash'>

const PART_ORDER = ['morning', 'afternoon', 'evening', 'na'] as const
const SLOT_PART = { breakfast: 'morning', lunch: 'afternoon', dinner: 'evening' } as const
export type EventMealSlot = keyof typeof SLOT_PART

const ordinal = (date: string, part: string) =>
    (Date.parse(`${date}T00:00:00Z`) / 86_400_000) * 4 + PART_ORDER.indexOf(part as (typeof PART_ORDER)[number])

function covers(e: EventLike, date: string, part: string): boolean {
    if (e.ignoreClash || e.startPart === 'na') return false
    if (e.allDay) return date >= e.startDate && date <= e.endDate
    const o = ordinal(date, part)
    return ordinal(e.startDate, e.startPart) <= o && o <= ordinal(e.endDate, e.endPart)
}

/** The first event over a meal slot on a day, if any. Snacks: the lunch-time one, when every main meal is taken. */
export function eventInMealSlot<E extends EventLike>(events: E[], date: string, slot: string): E | null {
    const part = SLOT_PART[slot as EventMealSlot]
    if (part) return events.find((e) => covers(e, date, part)) ?? null
    if (slot !== 'snack') return null
    const over = (Object.keys(SLOT_PART) as EventMealSlot[]).map((s) => eventInMealSlot(events, date, s))
    return over.every(Boolean) ? over[1] : null
}

/** The user's events between two days, repeating ones expanded. */
export async function eventsBetween(user: string | Types.ObjectId, from: string, to: string) {
    const regular = await Event.find({
        user,
        startDate: { $lte: to },
        endDate: { $gte: from },
        recurrence: { $exists: false },
    }).sort({ startDate: 1 })
    const recurring = await Event.find({
        user,
        startDate: { $lte: to },
        $or: [{ 'recurrence.endsOn': { $exists: false } }, { 'recurrence.endsOn': { $gte: from } }],
        recurrence: { $exists: true },
    })
    const instances = recurring.flatMap((e) => expandRecurring(e.toObject(), from, to))
    return [...regular.map((e) => e.toObject()), ...instances].sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
}
