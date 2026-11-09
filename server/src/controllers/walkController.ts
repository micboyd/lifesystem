import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Walk from '../models/Walk'
import { Types } from 'mongoose'
import { RouteError, roundTrip, oneWay, through, throughLoose, searchPlaces, nameOfPoint, type OrsRoute } from '../lib/openroute'
import { completeRoute, MAX_COMPLETE_CALLS } from '../lib/walkComplete'
import { generateRoute, MAX_CANDIDATES } from '../lib/routeGenerate'
import { elevationStats, haversine, readPoint, type Coord, type LatLng } from '../lib/routeGeo'
import { dailyLimit, recordCalls, usage, usedToday } from '../lib/routeUsage'
import { MAX_STOPS, readStops, readWalk, readWalkPoint } from '../lib/walkInput'
import { BAD_RADIUS_M, COOLDOWN_MS, ERROR_STATUS, MAX_TARGET_M, MIN_TARGET_M, memoryFor } from './routeController'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Loops remembered, so "Generate another" is new but a neighbourhood doesn't run out. */
const WALK_SEEN = 12
const WALK_KEYS = 200

export async function listWalks(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (typeof from !== 'string' || !DATE.test(from) || typeof to !== 'string' || !DATE.test(to)) {
        res.status(400).json({ message: 'from and to must be YYYY-MM-DD' })
        return
    }
    const walks = await Walk.find({ user: req.userId, date: { $gte: from, $lte: to } }).sort({ date: 1, time: 1 })
    res.json({ message: 'OK', data: walks })
}

export async function getWalk(req: AuthRequest, res: Response) {
    const walk = Types.ObjectId.isValid(String(req.params.id)) ? await Walk.findOne({ _id: req.params.id, user: req.userId }) : null
    if (!walk) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    res.json({ message: 'OK', data: walk })
}

export async function createWalk(req: AuthRequest, res: Response) {
    const read = readWalk(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const walk = await Walk.create({ ...read.value, user: req.userId })
    res.status(201).json({ message: 'Created', data: walk })
}

export async function updateWalk(req: AuthRequest, res: Response) {
    const read = readWalk(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const walk = await Walk.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: read.value },
        { new: true, runValidators: true }
    )
    if (!walk) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    res.json({ message: 'Saved', data: walk })
}

export async function setWalkDone(req: AuthRequest, res: Response) {
    const walk = await Walk.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { doneAt: req.body.done ? new Date() : null } },
        { new: true }
    )
    if (!walk) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    res.json({ message: 'Saved', data: walk })
}

export async function deleteWalk(req: AuthRequest, res: Response) {
    const walk = await Walk.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!walk) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}

/**
 * A route for a walk, not yet saved. With no stops and no separate finish it's
 * a loop sized to the target; otherwise it goes through the places in order,
 * so those decide the length and the page shows the gap to the target.
 */
export async function generateWalkRoute(req: AuthRequest, res: Response) {
    const userId = req.userId!
    const stops = readStops(req.body.stops)
    if (!stops) {
        res.status(400).json({ message: 'Too many places to pass.' })
        return
    }
    const end = req.body.end ? readWalkPoint(req.body.end) : null
    if (req.body.end && !end) {
        res.status(400).json({ code: 'no_start', message: 'Pick a finish point.' })
        return
    }
    const mem = await memoryFor(userId)
    const start: LatLng | null = readPoint(req.body.start)
    if (!start) {
        res.status(400).json({ code: 'no_start', message: 'Pick a start point.' })
        return
    }

    const isLoop = stops.length === 0 && !end
    const targetM = Number(req.body.targetM)
    if (isLoop && (!Number.isFinite(targetM) || targetM < MIN_TARGET_M || targetM > MAX_TARGET_M)) {
        res.status(400).json({ message: `A loop has to be between ${MIN_TARGET_M / 1000} and ${MAX_TARGET_M / 1000} km.` })
        return
    }
    if ((await usedToday()) + (isLoop ? MAX_CANDIDATES : 1) > dailyLimit()) {
        res.status(429).json({ code: 'quota', message: "Today's route quota is used up. It resets at midnight (UTC).", usage: await usage() })
        return
    }

    try {
        if (!isLoop) {
            const raw = await through([start, ...stops, end ?? start])
            await recordCalls(1)
            const measured = elevationStats(raw.coords as Coord[])
            res.status(201).json({
                message: 'Created',
                data: {
                    coords: raw.coords,
                    distanceM: Math.round(raw.distanceM),
                    ascentM: Math.round(raw.ascentM ?? measured.ascent),
                    descentM: Math.round(raw.descentM ?? measured.descent),
                },
                usage: await usage(),
            })
            return
        }

        // A repeated tap shouldn't burn five calls each time.
        const sinceLast = mem.lastPressAt ? Date.now() - mem.lastPressAt.getTime() : Infinity
        if (sinceLast < COOLDOWN_MS) {
            res.status(429).json({ code: 'cooldown', message: 'Just a moment before generating again.', retryInMs: COOLDOWN_MS - sinceLast })
            return
        }
        mem.lastPressAt = new Date()
        await mem.save()

        const result = await generateRoute({
            start,
            targetM,
            kind: 'loop',
            startPref: 'any',
            used: new Set(mem.walk.keys),
            seen: mem.walk.seen,
            bad: mem.bad.filter((b) => haversine(b, start) <= BAD_RADIUS_M).map((b) => b.cells),
            client: { roundTrip, oneWay },
        })
        await recordCalls(result.calls)
        mem.walk.keys = [...mem.walk.keys, ...result.tried].slice(-WALK_KEYS)
        if (!result.route) {
            await mem.save()
            res.status(422).json({ code: 'no_new', message: 'Every route found was one you have just seen. Try again, or change the start.', usage: await usage() })
            return
        }
        mem.walk.seen = [...mem.walk.seen, result.route.cells].slice(-WALK_SEEN)
        await mem.save()
        res.status(201).json({
            message: 'Created',
            data: {
                coords: result.route.coords,
                distanceM: result.route.distanceM,
                ascentM: result.route.ascentM,
                descentM: result.route.descentM,
            },
            usage: await usage(),
        })
    } catch (err) {
        if (!(err instanceof RouteError)) throw err
        // Failed calls still count against the quota; count the most a press can make.
        if (err.code !== 'config') await recordCalls(isLoop ? MAX_CANDIDATES : 1)
        res.status(ERROR_STATUS[err.code]).json({ code: err.code, message: err.message, usage: await usage() })
    }
}

function routeData(raw: OrsRoute) {
    const measured = elevationStats(raw.coords as Coord[])
    return {
        coords: raw.coords,
        distanceM: Math.round(raw.distanceM),
        ascentM: Math.round(raw.ascentM ?? measured.ascent),
        descentM: Math.round(raw.descentM ?? measured.descent),
    }
}

/**
 * Stretch a walk through places to meet its target: the places stay, in order,
 * and one extra point is added to make up the distance.
 */
export async function completeWalkRoute(req: AuthRequest, res: Response) {
    const userId = req.userId!
    const stops = readStops(req.body.stops)
    const start = readPoint(req.body.start)
    const end = req.body.end ? readWalkPoint(req.body.end) : null
    if (!stops || !start || (req.body.end && !end)) {
        res.status(400).json({ code: 'no_start', message: 'Check the start, finish and places to pass.' })
        return
    }
    if (stops.length >= MAX_STOPS) {
        res.status(400).json({ message: `A walk can pass ${MAX_STOPS} places at most, so there's no room to add one.` })
        return
    }
    const targetM = Number(req.body.targetM)
    if (!Number.isFinite(targetM) || targetM < MIN_TARGET_M || targetM > MAX_TARGET_M) {
        res.status(400).json({ message: `The target has to be between ${MIN_TARGET_M / 1000} and ${MAX_TARGET_M / 1000} km.` })
        return
    }
    if ((await usedToday()) + MAX_COMPLETE_CALLS > dailyLimit()) {
        res.status(429).json({ code: 'quota', message: "Today's route quota is used up. It resets at midnight (UTC).", usage: await usage() })
        return
    }
    const mem = await memoryFor(userId)
    const sinceLast = mem.lastPressAt ? Date.now() - mem.lastPressAt.getTime() : Infinity
    if (sinceLast < COOLDOWN_MS) {
        res.status(429).json({ code: 'cooldown', message: 'Just a moment before trying again.', retryInMs: COOLDOWN_MS - sinceLast })
        return
    }
    mem.lastPressAt = new Date()
    await mem.save()

    try {
        const seed = Number(req.body.seed)
        const result = await completeRoute({
            points: [start, ...stops, end ?? start],
            targetM,
            seed: Number.isInteger(seed) && seed >= 0 ? seed : 0,
            client: { route: (points, loose, avoidSteps) => (loose === null ? through(points) : throughLoose(points, loose, avoidSteps)) },
        })
        await recordCalls(result.calls)
        res.status(201).json({
            message: 'Created',
            data: { route: routeData(result.route), stop: result.stop, stopIndex: result.stopIndex },
            usage: await usage(),
        })
    } catch (err) {
        if (!(err instanceof RouteError)) throw err
        if (err.code !== 'config') await recordCalls(MAX_COMPLETE_CALLS)
        res.status(ERROR_STATUS[err.code]).json({ code: err.code, message: err.message, usage: await usage() })
    }
}

/** Places by name, for start points and places to pass. Nearest to `lat`/`lng` first. */
export async function findPlaces(req: AuthRequest, res: Response) {
    const q = String(req.query.q ?? '').trim().slice(0, 120)
    if (q.length < 3) {
        res.json({ message: 'OK', data: [] })
        return
    }
    const near = readPoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
    try {
        res.json({ message: 'OK', data: await searchPlaces(q, near) })
    } catch (err) {
        if (!(err instanceof RouteError)) throw err
        res.status(ERROR_STATUS[err.code]).json({ code: err.code, message: err.message })
    }
}

/** The name of a dropped pin. Nothing found is an empty answer, not an error. */
export async function namePoint(req: AuthRequest, res: Response) {
    const point = readPoint({ lat: Number(req.query.lat), lng: Number(req.query.lng) })
    if (!point) {
        res.status(400).json({ message: 'lat and lng are required' })
        return
    }
    try {
        res.json({ message: 'OK', data: await nameOfPoint(point) })
    } catch (err) {
        if (!(err instanceof RouteError)) throw err
        res.status(ERROR_STATUS[err.code]).json({ code: err.code, message: err.message })
    }
}
