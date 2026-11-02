import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import ConditioningSession from '../models/ConditioningSession'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import RunRoute, { ROUTE_KINDS, type RunRouteKind } from '../models/RunRoute'
import RouteMemory, { type IRouteMemory } from '../models/RouteMemory'
import { RouteError, roundTrip, oneWay } from '../lib/openroute'
import { generateRoute, MAX_CANDIDATES } from '../lib/routeGenerate'
import { haversine, routeCells, type Coord, type LatLng } from '../lib/routeGeo'
import { historyToPrune } from '../lib/routeSelect'
import { dailyLimit, recordCalls, usage, usedToday } from '../lib/routeUsage'

/** Unchosen routes kept per session; chosen ones are always kept. */
const HISTORY = 12
const COOLDOWN_MS = 8_000
const MIN_TARGET_M = 400
const MAX_TARGET_M = 42_200
/** Reported routes count against candidates starting within this distance. */
const BAD_RADIUS_M = 3_000
const MAX_SEEN = 80
const MAX_KEYS = 2_000

const ERROR_STATUS: Record<RouteError['code'], number> = {
    quota: 429,
    down: 503,
    no_route: 422,
    config: 503,
}

function readPoint(raw: unknown): LatLng | null {
    if (!raw || typeof raw !== 'object') return null
    const { lat, lng } = raw as Record<string, unknown>
    if (typeof lat !== 'number' || typeof lng !== 'number') return null
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { lat, lng }
}

async function memoryFor(userId: string): Promise<IRouteMemory> {
    const found = await RouteMemory.findOne({ user: userId })
    return found ?? RouteMemory.create({ user: userId })
}

export async function getSettings(req: AuthRequest, res: Response) {
    const mem = await memoryFor(req.userId!)
    res.json({ message: 'OK', data: { home: mem.home, usage: await usage(), cooldownMs: COOLDOWN_MS } })
}

export async function setHome(req: AuthRequest, res: Response) {
    const home = req.body.home === null ? null : readPoint(req.body.home)
    if (req.body.home !== null && !home) {
        res.status(400).json({ message: 'home must be { lat, lng } or null' })
        return
    }
    const mem = await memoryFor(req.userId!)
    mem.home = home
    await mem.save()
    res.json({ message: 'Saved', data: { home: mem.home } })
}

/** Routes saved for a session, newest first. */
export async function listRoutes(req: AuthRequest, res: Response) {
    const session = String(req.query.session ?? '')
    if (!Types.ObjectId.isValid(session)) {
        res.status(400).json({ message: 'session is required' })
        return
    }
    const routes = await RunRoute.find({ user: req.userId, session }).sort({ createdAt: -1 })
    res.json({ message: 'OK', data: routes })
}

export async function generate(req: AuthRequest, res: Response) {
    const userId = req.userId!
    const sessionId = String(req.body.session ?? '')
    const targetM = Number(req.body.targetM)
    const kind: RunRouteKind = ROUTE_KINDS.includes(req.body.kind) ? req.body.kind : 'loop'

    if (!Types.ObjectId.isValid(sessionId) || !(await ConditioningSession.exists({ _id: sessionId, user: userId }))) {
        res.status(404).json({ message: 'Session not found' })
        return
    }
    if (!Number.isFinite(targetM) || targetM < MIN_TARGET_M || targetM > MAX_TARGET_M) {
        res.status(400).json({ message: `Distance must be between ${MIN_TARGET_M / 1000} and ${MAX_TARGET_M / 1000} km.` })
        return
    }

    const mem = await memoryFor(userId)
    const start = req.body.start === 'home' ? mem.home : readPoint(req.body.start)
    if (!start) {
        res.status(400).json({
            code: 'no_start',
            message: req.body.start === 'home' ? 'No home location saved yet.' : 'Pick a start point.',
        })
        return
    }

    // A repeated tap shouldn't burn five calls each time.
    const sinceLast = mem.lastPressAt ? Date.now() - mem.lastPressAt.getTime() : Infinity
    if (sinceLast < COOLDOWN_MS) {
        res.status(429).json({
            code: 'cooldown',
            message: 'Just a moment before generating again.',
            retryInMs: COOLDOWN_MS - sinceLast,
        })
        return
    }
    if ((await usedToday()) + MAX_CANDIDATES > dailyLimit()) {
        res.status(429).json({
            code: 'quota',
            message: "Today's route quota is used up. It resets at midnight (UTC).",
            usage: await usage(),
        })
        return
    }
    mem.lastPressAt = new Date()
    await mem.save()

    let memSession = mem.sessions.find((s) => String(s.session) === sessionId)
    if (!memSession) {
        mem.sessions.push({ session: new Types.ObjectId(sessionId), keys: [], seen: [] })
        memSession = mem.sessions[mem.sessions.length - 1]
    }
    const bad = mem.bad.filter((b) => haversine(b, start) <= BAD_RADIUS_M).map((b) => b.cells)

    let result
    try {
        result = await generateRoute({
            start,
            targetM,
            kind,
            used: new Set(memSession.keys),
            seen: memSession.seen,
            bad,
            client: { roundTrip, oneWay },
        })
    } catch (err) {
        if (!(err instanceof RouteError)) throw err
        // Failed calls still count against the quota; count the most a press can make.
        if (err.code !== 'config') await recordCalls(MAX_CANDIDATES)
        res.status(ERROR_STATUS[err.code]).json({ code: err.code, message: err.message, usage: await usage() })
        return
    }
    await recordCalls(result.calls)

    memSession.keys = [...memSession.keys, ...result.tried].slice(-MAX_KEYS)
    if (!result.route) {
        await mem.save()
        res.status(422).json({
            code: 'no_new',
            message: 'Every route found was one you have already seen. Try again, or change the start.',
            usage: await usage(),
        })
        return
    }
    memSession.seen = [...memSession.seen, result.route.cells].slice(-MAX_SEEN)
    await mem.save()

    const route = await RunRoute.create({
        user: userId,
        session: sessionId,
        kind,
        coords: result.route.coords,
        targetM: Math.round(targetM),
        distanceM: result.route.distanceM,
        ascentM: result.route.ascentM,
        descentM: result.route.descentM,
        seed: result.route.seed,
        points: result.route.points,
        offTarget: result.pick.kind === 'closest',
    })

    const existing = await RunRoute.find({ user: userId, session: sessionId }, { chosenFor: 1, createdAt: 1 })
    const prune = historyToPrune(
        existing.map((r) => ({ id: String(r._id), chosen: r.chosenFor.length > 0, createdAt: r.createdAt })),
        HISTORY
    )
    if (prune.length) await RunRoute.deleteMany({ _id: { $in: prune }, user: userId, chosenFor: { $size: 0 } })

    res.status(201).json({
        message: 'Created',
        data: route,
        diffM: result.route.distanceM - Math.round(targetM),
        usage: await usage(),
    })
}

/** Make a route the chosen one for a planned entry (and no other route). */
export async function choose(req: AuthRequest, res: Response) {
    const entryId = String(req.body.entry ?? '')
    if (!Types.ObjectId.isValid(entryId) || !(await FitnessPlanEntry.exists({ _id: entryId, user: req.userId }))) {
        res.status(404).json({ message: 'Planned item not found' })
        return
    }
    const route = await RunRoute.findOne({ _id: req.params.id, user: req.userId })
    if (!route) {
        res.status(404).json({ message: 'Route not found' })
        return
    }
    await RunRoute.updateMany({ user: req.userId, chosenFor: entryId }, { $pull: { chosenFor: entryId } })
    await RunRoute.updateOne({ _id: route._id }, { $addToSet: { chosenFor: entryId } })
    res.json({ message: 'Saved', data: await RunRoute.findById(route._id) })
}

export async function unchoose(req: AuthRequest, res: Response) {
    const entryId = String(req.body.entry ?? '')
    const route = await RunRoute.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $pull: { chosenFor: entryId } },
        { new: true }
    )
    if (!route) {
        res.status(404).json({ message: 'Route not found' })
        return
    }
    res.json({ message: 'Saved', data: route })
}

/** Report a route as bad: it's flagged, unchosen, and nothing like it is offered near there again. */
export async function report(req: AuthRequest, res: Response) {
    const route = await RunRoute.findOne({ _id: req.params.id, user: req.userId })
    if (!route) {
        res.status(404).json({ message: 'Route not found' })
        return
    }
    const [lng, lat] = route.coords[0]
    const mem = await memoryFor(req.userId!)
    mem.bad.push({ lat, lng, cells: routeCells(route.coords as Coord[]) })
    await mem.save()
    route.reported = true
    route.chosenFor = []
    await route.save()
    res.json({ message: 'Reported', data: route })
}

export async function deleteRoute(req: AuthRequest, res: Response) {
    const route = await RunRoute.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!route) {
        res.status(404).json({ message: 'Route not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
