import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import IcalFeed from '../models/IcalFeed'
import { normaliseFeedUrl } from '../lib/icalMeetings'
import {
    FeedError,
    applyFeed,
    describe,
    downloadFeed,
    ensureMeetingsCalendar,
    feedStatus,
    removeUserFeed,
    syncUserFeed,
} from '../lib/icalSync'

/** GET /api/ical — whether a feed is set, masked, and how its last sync went. */
export async function getFeed(req: AuthRequest, res: Response) {
    res.json({ message: 'OK', data: await feedStatus(req.userId!) })
}

/**
 * PUT /api/ical { url } — saves the secret address and runs the first sync.
 * The address is downloaded before it is saved, so a typo never gets stored.
 */
export async function setFeed(req: AuthRequest, res: Response) {
    const url = normaliseFeedUrl(req.body?.url)
    if (!url) {
        res.status(400).json({ message: 'Paste the full https:// address ending in .ics' })
        return
    }
    let ics: string
    try {
        ics = await downloadFeed(url)
    } catch (err) {
        if (err instanceof FeedError) {
            res.status(400).json({ message: err.message })
            return
        }
        throw err
    }

    const existing = await IcalFeed.findOne({ user: req.userId })
    const calendar = await ensureMeetingsCalendar(req.userId!, existing?.calendar)
    const calendarId = calendar._id as Types.ObjectId
    const result = await applyFeed(req.userId!, calendarId, ics)
    const now = new Date()
    const feed = await IcalFeed.findOneAndUpdate(
        { user: req.userId },
        {
            $set: {
                url,
                calendar: calendarId,
                lastSyncedAt: now,
                lastAttemptAt: now,
                lastError: null,
                lastCount: result.total,
            },
        },
        { upsert: true, new: true }
    ).select('+url')
    res.json({ message: 'Saved', data: { status: describe(feed!), result } })
}

/** POST /api/ical/sync[?ifStale=1] — "Sync now", or the quiet sync on page open. */
export async function syncFeed(req: AuthRequest, res: Response) {
    const onlyIfStale = req.query.ifStale === '1' || req.query.ifStale === 'true'
    const out = await syncUserFeed(req.userId!, { onlyIfStale })
    res.json({ message: 'OK', data: out })
}

/** DELETE /api/ical — forgets the address and removes every imported meeting. */
export async function deleteFeed(req: AuthRequest, res: Response) {
    const out = await removeUserFeed(req.userId!)
    res.json({ message: 'Removed', data: out })
}
