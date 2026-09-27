/**
 * The line a rest day shows when the calendar has something on — "You're in
 * London (day 2 of 4)", "You've got Sam's birthday in the evening". Read from
 * the day's events: the most telling one leads (a trip over a work trip over
 * plans with people over a hobby over anything else, all-day first), and any
 * others are counted on the end.
 */
import type { Event, EventType } from '../types'
import { eventCoversSlot } from './calendar'

export interface RestDayNote {
    text: string
    /** A Font Awesome class for the lead event's kind. */
    icon: string
}

const RANK: Record<EventType, number> = { trip: 0, worktrip: 1, social: 2, hobby: 3, general: 4 }

const ICON: Record<EventType, string> = {
    trip: 'fa-solid fa-plane',
    worktrip: 'fa-solid fa-briefcase',
    social: 'fa-solid fa-champagne-glasses',
    hobby: 'fa-solid fa-palette',
    general: 'fa-regular fa-calendar',
}

const SLOTS = ['morning', 'afternoon', 'evening'] as const

/** Words that start a title as a plain noun, so they read lower-case mid-sentence. */
const COMMON_START = new Set([
    'a',
    'an',
    'the',
    'dinner',
    'lunch',
    'breakfast',
    'brunch',
    'drinks',
    'coffee',
    'meeting',
    'call',
    'party',
    'wedding',
    'match',
    'game',
    'class',
    'lesson',
    'appointment',
    'date',
    'gig',
    'concert',
    'football',
    'rugby',
    'golf',
    'cinema',
    'haircut',
    'dentist',
    'doctor',
    'work',
    'night',
    'day',
])

/** A title as it reads mid-sentence: "Dinner with Sam" → "dinner with Sam". */
function inline(title: string): string {
    const t = title.trim()
    const first = t.split(/\s+/)[0]?.toLowerCase() ?? ''
    return COMMON_START.has(first) ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

/**
 * Where an event is: its location's first part ("London, UK" → "London"), or
 * a place named in the title after "to" / "in" ("Trip to Lisbon" → "Lisbon").
 */
export function placeOf(event: Event): string | undefined {
    const loc = event.location?.split(',')[0]?.trim()
    if (loc) return loc
    const m = /\b(?:to|in)\s+([A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|upon|on|de|la|le))*)/.exec(
        event.title
    )
    return m?.[1]
}

/** Whole days between two "YYYY-MM-DD" dates. */
function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

/** When on `date` the event runs: " all day", " in the evening", " at 19:00", … */
function whenOn(event: Event, date: string): string {
    const slots = SLOTS.filter((s) => eventCoversSlot(event, date, s))
    if (event.allDay || slots.length === 3) return ' all day'
    if (event.time) return ` at ${event.time}`
    if (slots.length === 0) return ''
    const words = slots.map((s) => (s === 'morning' ? 'morning' : s === 'afternoon' ? 'afternoon' : 'evening'))
    return ` in the ${words.join(' and ')}`
}

/** The sentence for one event on `date`. */
function sentence(event: Event, date: string): string {
    const place = placeOf(event)
    const multi = event.endDate > event.startDate
    const total = daysBetween(event.startDate, event.endDate) + 1
    const nth = daysBetween(event.startDate, date) + 1

    if (event.eventType === 'trip' || event.eventType === 'worktrip') {
        const forWork = event.eventType === 'worktrip' ? ' for work' : ''
        if (!place) {
            const what = inline(event.title)
            return multi ? `You're away — ${what} (day ${nth} of ${total}).` : `You're away — ${what}.`
        }
        if (!multi) return `You're in ${place}${forWork} today.`
        if (nth === 1) return `You're off to ${place}${forWork} — day 1 of ${total}.`
        if (nth === total) return `Last day in ${place} — travelling home.`
        return `You're in ${place}${forWork} — day ${nth} of ${total}.`
    }

    const what = inline(event.title)
    const at = event.location?.trim() && !event.title.includes(event.location.trim())
        ? ` at ${event.location.split(',')[0].trim()}`
        : ''
    if (event.eventType === 'hobby') return `You're busy with ${what}${at}${whenOn(event, date)}.`
    return `You've got ${what}${at}${whenOn(event, date)}.`
}

/**
 * The note for a rest day, from the events on it — or null when there are none.
 * `events` should already be the day's (e.g. the ones in a morning, afternoon
 * or evening slot); the order they come in doesn't matter.
 */
export function restDayNote(events: Event[], date: string): RestDayNote | null {
    if (events.length === 0) return null
    const sorted = [...events].sort(
        (a, b) =>
            RANK[a.eventType] - RANK[b.eventType] ||
            Number(b.allDay) - Number(a.allDay) ||
            (a.time ?? '').localeCompare(b.time ?? '')
    )
    const lead = sorted[0]
    let text = sentence(lead, date)
    const others = sorted.slice(1)
    if (others.length === 1) text += ` Plus ${inline(others[0].title)}.`
    else if (others.length > 1) text += ` Plus ${others.length} more.`
    return { text, icon: ICON[lead.eventType] ?? ICON.general }
}
