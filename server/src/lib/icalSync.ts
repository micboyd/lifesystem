import { Types } from 'mongoose'
import Calendar from '../models/Calendar'
import Event from '../models/Event'
import Timebox from '../models/Timebox'
import IcalFeed, { IIcalFeed } from '../models/IcalFeed'
import { meetingsFromIcs, syncWindow, toLondon, maskFeedUrl } from './icalMeetings'

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

export interface SyncResult {
    added: number
    updated: number
    removed: number
    total: number
}

/**
 * Writes one feed download into Timebox: upserts every meeting in the window
 * as a read-only block (keyed by UID + occurrence date, so re-syncs never
 * duplicate) and removes imported blocks in the window that the feed no longer
 * has. Imported blocks before the window are left as history.
 */
export async function applyFeed(
    userId: string | Types.ObjectId,
    ics: string,
    now = new Date()
): Promise<SyncResult> {
    const window = syncWindow(now)
    const occurrences = meetingsFromIcs(ics, window)
    const windowStart = toLondon(window.from).date

    const existing = await Timebox.find({
        user: userId,
        source: 'ical',
        date: { $gte: windowStart },
    }).select('_id externalUid occurrenceDate')
    const existingKeys = new Set(existing.map((e) => `${e.externalUid}|${e.occurrenceDate}`))
    const freshKeys = new Set(occurrences.map((o) => `${o.uid}|${o.occurrenceDate}`))

    const ops = occurrences.map((o) => {
        const $set: Record<string, unknown> = {
            date: o.date,
            title: o.title.slice(0, 200),
            startTime: o.startTime,
            endTime: o.endTime,
            category: 'work',
        }
        const $unset: Record<string, 1> = {}
        for (const key of ['location', 'notes'] as const) {
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
                update: {
                    $set,
                    $setOnInsert: { exceptions: [] },
                    ...(Object.keys($unset).length ? { $unset } : {}),
                },
                upsert: true,
            },
        }
    })
    if (ops.length) await Timebox.bulkWrite(ops, { ordered: false })

    const staleIds = existing
        .filter((e) => !freshKeys.has(`${e.externalUid}|${e.occurrenceDate}`))
        .map((e) => e._id)
    if (staleIds.length) await Timebox.deleteMany({ _id: { $in: staleIds }, user: userId })

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

/**
 * Meetings first landed on a "Meetings" calendar as events. They live in
 * Timebox now, so take those events off the calendar, and the layer with them
 * when nothing else is on it.
 */
export async function clearLegacyCalendarMeetings(feed: IIcalFeed): Promise<void> {
    await Event.deleteMany({ user: feed.user, source: 'ical' })
    if (feed.calendar) {
        const others = await Event.countDocuments({ user: feed.user, calendar: feed.calendar })
        if (others === 0)
            await Calendar.deleteOne({ _id: feed.calendar, user: feed.user, isDefault: false })
        feed.calendar = null
    }
}

export interface FeedStatus {
    connected: boolean
    maskedUrl?: string
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
        lastSyncedAt: feed.lastSyncedAt ?? null,
        lastError: feed.lastError ?? null,
        lastCount: feed.lastCount ?? 0,
    }
}

/**
 * Syncs the user's feed. With `onlyIfStale`, claims the sync atomically and
 * skips when another attempt ran in the last 15 minutes — the Timebox page
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
        await clearLegacyCalendarMeetings(feed)
        const ics = await downloadFeed(feed.url)
        const result = await applyFeed(userId, ics, now)
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

/** Removes the feed and every meeting it imported. */
export async function removeUserFeed(userId: string): Promise<{ removedMeetings: number }> {
    const feed = await IcalFeed.findOne({ user: userId })
    if (feed) await clearLegacyCalendarMeetings(feed)
    const { deletedCount } = await Timebox.deleteMany({ user: userId, source: 'ical' })
    if (feed) await feed.deleteOne()
    return { removedMeetings: deletedCount }
}
