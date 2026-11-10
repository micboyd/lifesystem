import ical, { type VEvent, type ParameterValue, type CalendarResponse } from 'node-ical'

/**
 * Turns a Google Calendar "secret address in iCal format" feed into single
 * meeting occurrences Timebox can store as read-only blocks.
 *
 * Pure (no Mongo, no network) so the recurrence expansion and the London-time
 * conversion can be tested against a fixture feed.
 */

export const MEETINGS_TIME_ZONE = 'Europe/London'

/** How far around "now" a sync looks: a week back, ninety days ahead. */
export const SYNC_DAYS_BACK = 7
export const SYNC_DAYS_AHEAD = 90

/** A meeting as one block on one day, in London wall-clock time. */
export interface MeetingOccurrence {
    /** The VEVENT UID — shared by every occurrence of a recurring meeting. */
    uid: string
    /**
     * London date of the occurrence's *original* start (its RECURRENCE-ID when it
     * was moved), so a moved meeting keeps its identity across syncs.
     */
    occurrenceDate: string
    title: string
    location?: string
    notes?: string
    /** YYYY-MM-DD the block sits on. */
    date: string
    /** HH:MM. */
    startTime: string
    /** HH:MM, after startTime — clipped to 23:59 when a meeting runs past midnight. */
    endTime: string
}

const DAY_MS = 86_400_000
const NOTES_MAX = 2000
const LAST_MINUTE = '23:59'
/** A zero-length meeting (a reminder, say) still gets a sliver of the day. */
const MIN_LENGTH_MIN = 15

const londonFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: MEETINGS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
})

/** A moment as London wall-clock date + time. */
export function toLondon(at: Date): { date: string; time: string } {
    const parts = Object.fromEntries(
        londonFormat.formatToParts(at).map((p) => [p.type, p.value])
    ) as Record<string, string>
    const hour = Number(parts.hour) % 24
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${String(hour).padStart(2, '0')}:${parts.minute}`,
    }
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
const fromMinutes = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function text(value: ParameterValue | undefined): string | undefined {
    if (value == null) return undefined
    const raw = typeof value === 'string' ? value : (value as { val?: unknown }).val
    if (typeof raw !== 'string') return undefined
    const trimmed = raw.trim()
    return trimmed || undefined
}

function emailOf(value: unknown): string | undefined {
    const raw =
        typeof value === 'string' ? value : (value as { val?: unknown } | null | undefined)?.val
    if (typeof raw !== 'string') return undefined
    return (
        raw
            .replace(/^mailto:/i, '')
            .trim()
            .toLowerCase() || undefined
    )
}

/**
 * Google names a user's primary calendar feed after their address
 * (X-WR-CALNAME). That is the attendee whose answer says "declined".
 */
export function feedOwnerEmail(data: CalendarResponse): string | undefined {
    const name = (data.vcalendar as Record<string, unknown> | undefined)?.['WR-CALNAME']
    return typeof name === 'string' && name.includes('@') ? name.trim().toLowerCase() : undefined
}

/** True when the feed's owner is listed on the meeting and has declined it. */
export function isDeclined(event: VEvent, ownerEmail: string | undefined): boolean {
    if (!ownerEmail) return false
    const raw = (event as Record<string, unknown>).attendee
    const attendees = Array.isArray(raw) ? raw : raw ? [raw] : []
    return attendees.some((a) => {
        if (emailOf(a) !== ownerEmail) return false
        const partstat = (a as { params?: { PARTSTAT?: string } })?.params?.PARTSTAT
        return typeof partstat === 'string' && partstat.toUpperCase() === 'DECLINED'
    })
}

function isCancelled(event: VEvent): boolean {
    return typeof event.status === 'string' && event.status.toUpperCase() === 'CANCELLED'
}

/**
 * One timed meeting as a block on the London day it starts. A meeting that runs
 * past midnight is clipped to 23:59 — Timebox plans one day at a time.
 */
export function occurrenceFrom(input: {
    uid: string
    originalStart: Date
    start: Date
    end: Date
    title: string
    location?: string
    notes?: string
}): MeetingOccurrence {
    const { uid, start, end, title, location, notes } = input
    const from = toLondon(start)
    const to = toLondon(end.getTime() > start.getTime() ? end : start)
    const startMin = toMinutes(from.time)
    let endTime = to.date === from.date ? to.time : LAST_MINUTE
    if (toMinutes(endTime) <= startMin)
        endTime = fromMinutes(Math.min(startMin + MIN_LENGTH_MIN, 24 * 60 - 1))
    if (toMinutes(endTime) <= startMin) endTime = LAST_MINUTE // a 23:59 start
    return {
        uid,
        occurrenceDate: toLondon(input.originalStart).date,
        title,
        location,
        notes,
        date: from.date,
        startTime: from.time,
        endTime,
    }
}

/**
 * Every timed meeting occurrence in the feed that touches [from, to], with
 * recurring series expanded (RRULE), cancelled dates dropped (EXDATE), moved
 * instances applied (RECURRENCE-ID), and cancelled, declined and all-day
 * meetings skipped (Timebox has no all-day blocks).
 */
export function meetingsFromIcs(
    ics: string,
    window: { from: Date; to: Date }
): MeetingOccurrence[] {
    const data = ical.sync.parseICS(ics)
    const owner = feedOwnerEmail(data)
    const out = new Map<string, MeetingOccurrence>()

    for (const component of Object.values(data)) {
        if (!component || (component as { type?: string }).type !== 'VEVENT') continue
        const base = component as VEvent
        if (!base.uid || !base.start) continue

        let instances
        try {
            instances = ical.expandRecurringEvent(base, {
                from: window.from,
                to: window.to,
                expandOngoing: true,
            })
        } catch {
            continue // a rule node-ical can't walk shouldn't sink the whole feed
        }

        for (const inst of instances) {
            const ev = inst.event
            if (inst.isFullDay || isCancelled(ev) || isDeclined(ev, owner)) continue
            const originalStart =
                inst.isOverride && ev.recurrenceid ? (ev.recurrenceid as Date) : inst.start
            const notes = text(ev.description)
            const occ = occurrenceFrom({
                uid: base.uid,
                originalStart,
                start: inst.start,
                end: inst.end ?? inst.start,
                title: text(ev.summary) ?? '(No title)',
                location: text(ev.location),
                notes:
                    notes && notes.length > NOTES_MAX ? `${notes.slice(0, NOTES_MAX - 1)}…` : notes,
            })
            const key = `${occ.uid}|${occ.occurrenceDate}`
            if (!out.has(key)) out.set(key, occ)
        }
    }

    return [...out.values()].sort((a, b) =>
        a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1
    )
}

/** The sync window around `now`. */
export function syncWindow(now: Date): { from: Date; to: Date } {
    return {
        from: new Date(now.getTime() - SYNC_DAYS_BACK * DAY_MS),
        to: new Date(now.getTime() + SYNC_DAYS_AHEAD * DAY_MS),
    }
}

/**
 * Accepts what Google shows under "Secret address in iCal format" (https, or
 * the webcal:// form some apps copy). Returns the https URL, or null.
 */
export function normaliseFeedUrl(input: unknown): string | null {
    if (typeof input !== 'string') return null
    let raw = input.trim()
    if (/^webcals?:\/\//i.test(raw)) raw = raw.replace(/^webcals?:\/\//i, 'https://')
    let url: URL
    try {
        url = new URL(raw)
    } catch {
        return null
    }
    if (url.protocol !== 'https:') return null
    return url.toString()
}

/** "https://calendar.google.com/…/private-ab12…/basic.ics" → "…/private-ab12••••/basic.ics". */
export function maskFeedUrl(url: string): string {
    try {
        const u = new URL(url)
        const masked = u.pathname
            .split('/')
            .map((seg) =>
                seg.startsWith('private-')
                    ? `private-${seg.slice(8, 12)}••••`
                    : seg.length > 24
                      ? `${seg.slice(0, 4)}••••`
                      : seg
            )
            .join('/')
        return `${u.host}${masked}`
    } catch {
        return '••••'
    }
}
