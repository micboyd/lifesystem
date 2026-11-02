import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import type { IConditioningSession } from '../models/ConditioningSession'
import {
    connectGarmin,
    disconnectGarmin,
    garminStatus,
    mongoSyncStore,
    providerFor,
    submitGarminMfa,
} from '../garmin/account'
import { GARMIN_ERROR_STATUS, GarminError, isGarminError } from '../garmin/provider'
import { entryGarminState, previewSession, sendEntry, type SyncSession } from '../garmin/sync'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Every Garmin handler runs through this: a Garmin failure goes back as its own
 * fixed message and code, and anything else as a plain 500. Nothing from the
 * request — the password above all — or from Garmin is ever logged or echoed.
 */
export function handle(fn: (req: AuthRequest, res: Response) => Promise<void>) {
    return async (req: AuthRequest, res: Response) => {
        try {
            await fn(req, res)
        } catch (err) {
            if (isGarminError(err)) {
                res.status(GARMIN_ERROR_STATUS[err.code]).json({ message: err.message, code: err.code })
                return
            }
            console.error(`Garmin route failed: ${err instanceof Error ? err.name : 'unknown error'}`)
            res.status(500).json({ message: 'Something went wrong.', code: 'error' })
        }
    }
}

function toSyncSession(s: IConditioningSession): SyncSession {
    return {
        _id: String(s._id),
        name: s.name,
        duration: s.duration,
        warmUp: s.warmUp,
        main: s.main,
        coolDown: s.coolDown,
        watchSteps: s.watchSteps,
    }
}

/** A conditioning entry of the caller's, with its session. */
async function loadEntry(req: AuthRequest) {
    const entry = await FitnessPlanEntry.findOne({
        _id: req.params.id,
        user: req.userId,
        kind: 'conditioning',
    }).populate<{ session: IConditioningSession | null }>('session')
    if (!entry || !entry.session) throw new GarminError('not_found')
    return { entry, session: toSyncSession(entry.session) }
}

/** GET /api/garmin/status */
export const status = handle(async (req, res) => {
    res.json({ message: 'OK', data: await garminStatus(req.userId!) })
})

/** POST /api/garmin/connect — { email, password } → { status: connected | needs_mfa } */
export const connect = handle(async (req, res) => {
    const { email, password } = req.body ?? {}
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
        res.status(400).json({ message: 'Email and password are required.', code: 'bad_request' })
        return
    }
    const result = await connectGarmin(req.userId!, email.trim(), password)
    res.json({ message: 'OK', data: { status: result } })
})

/** POST /api/garmin/connect/mfa — { code } */
export const connectMfa = handle(async (req, res) => {
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : ''
    if (!/^\d{4,8}$/.test(code)) {
        res.status(400).json({ message: 'Enter the code Garmin sent you.', code: 'bad_request' })
        return
    }
    await submitGarminMfa(req.userId!, code)
    res.json({ message: 'OK', data: { status: 'connected' } })
})

/** DELETE /api/garmin/connect */
export const disconnect = handle(async (req, res) => {
    await disconnectGarmin(req.userId!)
    res.json({ message: 'Disconnected' })
})

/**
 * GET /api/garmin/entries?start&end — where each conditioning entry in the range
 * stands on Garmin. Keyed by entry id; strength entries aren't included.
 */
export const entryStates = handle(async (req, res) => {
    const { start, end } = req.query
    if (typeof start !== 'string' || typeof end !== 'string' || !DATE_RE.test(start) || !DATE_RE.test(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required', code: 'bad_request' })
        return
    }
    const entries = await FitnessPlanEntry.find({
        user: req.userId,
        kind: 'conditioning',
        date: { $gte: start, $lte: end },
    }).populate<{ session: IConditioningSession | null }>('session')
    // One preview per session, however many days it's on.
    const hashes = new Map<string, string>()
    const data: Record<string, { state: string; lastSentAt: Date | null; scheduledDate: string | null }> = {}
    for (const e of entries) {
        if (!e.session) continue
        const sid = String(e.session._id)
        if (!hashes.has(sid)) hashes.set(sid, previewSession(toSyncSession(e.session)).hash)
        data[String(e._id)] = {
            state: entryGarminState({ _id: String(e._id), date: e.date, garmin: e.garmin }, hashes.get(sid)!),
            lastSentAt: e.garmin?.lastSentAt ?? null,
            scheduledDate: e.garmin?.scheduledDate ?? null,
        }
    }
    res.json({ message: 'OK', data })
})

/** GET /api/garmin/entries/:id/preview — the steps that would be sent. */
export const preview = handle(async (req, res) => {
    const { entry, session } = await loadEntry(req)
    const p = previewSession(session)
    res.json({
        message: 'OK',
        data: {
            name: p.name,
            steps: p.steps,
            approximated: p.approximated,
            source: p.source,
            state: entryGarminState({ _id: String(entry._id), date: entry.date, garmin: entry.garmin }, p.hash),
            lastSentAt: entry.garmin?.lastSentAt ?? null,
            scheduledDate: entry.garmin?.scheduledDate ?? null,
        },
    })
})

/** POST /api/garmin/entries/:id/send — create or update, schedule, push. */
export const send = handle(async (req, res) => {
    const { entry, session } = await loadEntry(req)
    const provider = await providerFor(req.userId!)
    const result = await sendEntry(
        { _id: String(entry._id), date: entry.date, garmin: entry.garmin },
        session,
        provider,
        mongoSyncStore(req.userId!)
    )
    res.json({
        message: result.message,
        data: {
            state: 'sent',
            pushed: result.pushed,
            lastSentAt: result.garmin.lastSentAt,
            scheduledDate: result.garmin.scheduledDate,
        },
    })
})
