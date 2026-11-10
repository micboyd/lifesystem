import { Types } from 'mongoose'
import Calendar, { ICalendar } from '../models/Calendar'
import Event from '../models/Event'
import IcalFeed, { IIcalFeed } from '../models/IcalFeed'
import { meetingsFromIcs, syncWindow, toLondon, maskFeedUrl } from './icalMeetings'

export const MEETINGS_CALENDAR_NAME = 'Meetings'

/** The sync-on-open skips when the last attempt is younger than this. */
export const STALE_AFTER_MS = 15 * 60_000

/** Leaves room under Heroku's 30s request cap for the database writes. */
const FETCH_TIMEOUT_MS = 15_000
/** A year of a busy work calendar is a few MB; anything far bigger isn't a calendar. */
const MAX_FEED_BYTES = 15 * 1024 * 1024

export class FeedError extends Error {}

/** Downloads the .ics text, with a timeout and a size cap. */
export async function downloadFeed(url: string): Promise<string> {
    let res: Response
    try {
        res = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: 'text/calendar, */*' },
            redirect: 'follow',
        })
    } catch (err) {
        const timedOut = (err as { name?: string })?.name === 'TimeoutError'
        throw new FeedError(
            timedOut ? 'Google Calendar took too long to answer.' : 'Could not reach that address.'
        )
    }
    if (res.status === 404 || res.status === 403 || res.status === 401) {
        throw new FeedError(
            'Google did not accept that address — it may have been reset. Copy it again from Google Calendar settings.'
        )
    }
    if (!res.ok) throw new FeedError(`Google Calendar answered with an error (${res.status}).`)
    const declared = Number(res.headers.get('content-length') ?? 0)
    if (declared > MAX_FEED_BYTES) throw new FeedError('That calendar feed is too large to import.')
    const body = await res.text()
    if (body.length > MAX_FEED_BYTES)
        throw new FeedError('That calendar feed is too large to import.')
    if (!body.includes('BEGIN:VCALENDAR')) {
        throw new FeedError(
            'That address did not return a calendar. Use the "Secret address in iCal format".'
        )
    }
    return body
}

/**
 * The calendar (layer) meetings land on: the feed's own when it still exists,
 * else one called "Meetings" (reused if the user already has one), else a new one.
 */
export async function ensureMeetingsCalendar(
    userId: string | Types.ObjectId,
    preferred?: Types.ObjectId | null
): Promise<ICalendar> {
    if (preferred) {
        const existing = await Calendar.findOne({ _id: preferred, user: userId })
        if (existing) return existing
    }
    const named = await Calendar.findOne({ user: userId, name: MEETINGS_CALENDAR_NAME })
    if (named) return named
    const last = await Calendar.findOne({ user: userId }).sort({ order: -1 })
    try {
        return await Calendar.create({
            user: userId,
            name: MEETINGS_CALENDAR_NAME,
            color: 'indigo',
            isDefault: false,
            visible: true,
            order: (last?.order ?? -1) + 1,
        })
    } catch {
        const winner = await Calendar.findOne({ user: userId, name: MEETINGS_CALENDAR_NAME })
        if (winner) return winner
        throw new Error('Could not create the Meetings calendar')
    }
}

export interface SyncResult {
    added: number
    updated: number
    removed: number
    total: number
}

/**
 * Writes one feed download onto the user's calendar: upserts every occurrence in
 * the window (keyed by UID + occurrence date, so re-syncs never duplicate) and
 * removes imported meetings in the window that the feed no longer has.
 * Imported meetings that ended before the window are left as history.
 */
export async function applyFeed(
    userId: string | Types.ObjectId,
    calendarId: Types.ObjectId,
    ics: string,
    now = new Date()
): Promise<SyncResult> {
    const window = syncWindow(now)
    const occurrences = meetingsFromIcs(ics, window)
    const windowStart = toLondon(window.from).date

    const existing = await Event.find({
        user: userId,
        source: 'ical',
        endDate: { $gte: windowStart },
    }).select('_id externalUid occurrenceDate')
    const existingKeys = new Set(existing.map((e) => `${e.externalUid}|${e.occurrenceDate}`))
    const freshKeys = new Set(occurrences.map((o) => `${o.uid}|${o.occurrenceDate}`))

    const ops = occurrences.map((o) => {
        const $set: Record<string, unknown> = {
            calendar: calendarId,
            title: o.title,
            eventType: 'general',
            allDay: o.allDay,
            startDate: o.startDate,
            startPart: o.startPart,
            endDate: o.endDate,
            endPart: o.endPart,
            ignoreClash: false,
        }
        const $unset: Record<string, 1> = {}
        for (const key of ['time', 'location', 'notes'] as const) {
            if (o[key] !== undefined) $set[key] = o[key]
            else $unset[key] = 1
        }
        return {
            updateOne: {
                filter: {
                    user: userId,
                    source: 'ical',
                    externalUid: o.uid,
                    occurrenceDate: o.occurrenceDate,
                },
                update: { $set, ...(Object.keys($unset).length ? { $unset } : {}) },
                upsert: true,
            },
        }
    })
    if (ops.length) await Event.bulkWrite(ops, { ordered: false })

    const staleIds = existing
        .filter((e) => !freshKeys.has(`${e.externalUid}|${e.occurrenceDate}`))
        .map((e) => e._id)
    if (staleIds.length) await Event.deleteMany({ _id: { $in: staleIds }, user: userId })

    const added = occurrences.filter(
        (o) => !existingKeys.has(`${o.uid}|${o.occurrenceDate}`)
    ).length
    return {
        added,
        updated: occurrences.length - added,
        removed: staleIds.length,
        total: occurrences.length,
    }
}

export interface FeedStatus {
    connected: boolean
    maskedUrl?: string
    calendar?: string
    lastSyncedAt?: Date | null
    lastError?: string | null
    lastCount?: number
}

export async function feedStatus(userId: string): Promise<FeedStatus> {
    const feed = await IcalFeed.findOne({ user: userId }).select('+url')
    if (!feed) return { connected: false }
    return describe(feed)
}

export function describe(feed: IIcalFeed): FeedStatus {
    return {
        connected: true,
        maskedUrl: maskFeedUrl(feed.url),
        calendar: String(feed.calendar),
        lastSyncedAt: feed.lastSyncedAt ?? null,
        lastError: feed.lastError ?? null,
        lastCount: feed.lastCount ?? 0,
    }
}

/**
 * Syncs the user's feed. With `onlyIfStale`, claims the sync atomically and
 * skips when another attempt ran in the last 15 minutes — the Calendar page
 * calls this on every open, sometimes twice at once.
 */
export async function syncUserFeed(
    userId: string,
    { onlyIfStale = false }: { onlyIfStale?: boolean } = {}
): Promise<{ status: FeedStatus; synced: boolean; result?: SyncResult }> {
    const now = new Date()
    const claimFilter: Record<string, unknown> = { user: userId }
    if (onlyIfStale) {
        claimFilter.$or = [
            { lastAttemptAt: null },
            { lastAttemptAt: { $lt: new Date(now.getTime() - STALE_AFTER_MS) } },
        ]
    }
    const feed = await IcalFeed.findOneAndUpdate(
        claimFilter,
        { $set: { lastAttemptAt: now } },
        { new: true }
    ).select('+url')
    if (!feed) return { status: await feedStatus(userId), synced: false }

    try {
        const calendar = await ensureMeetingsCalendar(userId, feed.calendar)
        const ics = await downloadFeed(feed.url)
        const result = await applyFeed(userId, calendar._id as Types.ObjectId, ics, now)
        feed.calendar = calendar._id as Types.ObjectId
        feed.lastSyncedAt = new Date()
        feed.lastError = null
        feed.lastCount = result.total
        await feed.save()
        return { status: describe(feed), synced: true, result }
    } catch (err) {
        feed.lastError =
            err instanceof FeedError ? err.message : 'Something went wrong reading the calendar.'
        await feed.save()
        if (!(err instanceof FeedError)) console.error('iCal sync failed:', err)
        return { status: describe(feed), synced: false }
    }
}

/** Removes the feed and every meeting it imported; drops the Meetings layer if nothing else is on it. */
export async function removeUserFeed(userId: string): Promise<{ removedEvents: number }> {
    const feed = await IcalFeed.findOne({ user: userId })
    const { deletedCount } = await Event.deleteMany({ user: userId, source: 'ical' })
    if (feed) {
        const others = await Event.countDocuments({ user: userId, calendar: feed.calendar })
        if (others === 0) {
            await Calendar.deleteOne({ _id: feed.calendar, user: userId, isDefault: false })
        }
        await feed.deleteOne()
    }
    return { removedEvents: deletedCount }
}
