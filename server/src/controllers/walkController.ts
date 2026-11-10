import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Walk from '../models/Walk'
import WalkSeries, { type IWalkSeries } from '../models/WalkSeries'
import WalkFavourite from '../models/WalkFavourite'
import WalkLibraryItem from '../models/WalkLibraryItem'
import { Types } from 'mongoose'
import { RouteError, roundTrip, oneWay, through, throughLoose, searchPlaces, nameOfPoint, type OrsRoute } from '../lib/openroute'
import { completeRoute, MAX_COMPLETE_CALLS, MAX_REPEATED } from '../lib/walkComplete'
import { generateRoute, MAX_CANDIDATES } from '../lib/routeGenerate'
import { elevationStats, haversine, readPoint, type Coord, type LatLng } from '../lib/routeGeo'
import { dailyLimit, recordCalls, usage, usedToday } from '../lib/routeUsage'
import { MAX_STOPS, readDays, planOf, readFavourite, readLibraryItem, readStops, readWalk, readWalkPoint, type WalkFields } from '../lib/walkInput'
import { datesToCreate, repeatsOn, seriesTemplate } from '../lib/walkSeries'
import { BAD_RADIUS_M, COOLDOWN_MS, ERROR_STATUS, MAX_TARGET_M, MIN_TARGET_M, memoryFor } from './routeController'

const DATE = /^\d{4}-\d{2}-\d{2}$/
/** Loops remembered, so "Generate another" is new but a neighbourhood doesn't run out. */
const WALK_SEEN = 12
const WALK_KEYS = 200
const MAX_FAVOURITES = 50

/** Make each repeating walk's days in this range real, so ticking and routes work as for any walk. */
async function fillSeries(user: string, from: string, to: string) {
    const all = await WalkSeries.find({ user, startDate: { $lte: to } })
    for (const series of all) {
        const existing = await Walk.find({ user, series: series._id, date: { $gte: from, $lte: to } }, { date: 1 })
        const dates = datesToCreate(series, from, to, new Set(existing.map((w) => w.date)))
        for (const date of dates) {
            const { time, name, pace, goal, start, stops, end } = series
            try {
                await Walk.updateOne(
                    { user, series: series._id, date },
                    { $setOnInsert: { time, name, pace, goal, start, stops, end, route: null, doneAt: null } },
                    { upsert: true }
                )
            } catch (err) {
                // Another screen made this day at the same moment.
                if ((err as { code?: number }).code !== 11000) throw err
            }
        }
    }
}

const newSeries = (user: string, value: WalkFields, days: number[]) =>
    WalkSeries.create({ ...seriesTemplate(value), user, days, startDate: value.date, skipped: [] })

/** Days ahead that nothing has happened on — safe to drop, and they refill from the series. */
const untouchedAfter = (user: string, series: unknown, date: string) => ({ user, series, date: { $gt: date }, route: null, doneAt: null })

async function endSeries(user: string, series: IWalkSeries['_id'], fromDate: string) {
    await Walk.deleteMany(untouchedAfter(user, series, fromDate))
    await Walk.updateMany({ user, series }, { $set: { series: null } })
    await WalkSeries.deleteOne({ _id: series, user })
}

export async function listLibrary(req: AuthRequest, res: Response) {
    res.json({ message: 'OK', data: await WalkLibraryItem.find({ user: req.userId }).sort({ updatedAt: -1 }) })
}

const findItem = (id: unknown, user?: string) => (Types.ObjectId.isValid(String(id)) ? WalkLibraryItem.findOne({ _id: id, user }) : Promise.resolve(null))

export async function getLibraryItem(req: AuthRequest, res: Response) {
    const item = await findItem(req.params.id, req.userId)
    if (!item) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    res.json({ message: 'OK', data: item })
}

export async function createLibraryItem(req: AuthRequest, res: Response) {
    const read = readLibraryItem(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    res.status(201).json({ message: 'Created', data: await WalkLibraryItem.create({ ...read.value, user: req.userId }) })
}

export async function updateLibraryItem(req: AuthRequest, res: Response) {
    const read = readLibraryItem(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const item = await findItem(req.params.id, req.userId)
    if (!item) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    item.set(read.value)
    await item.save()
    res.json({ message: 'Saved', data: item })
}

/** Walks already on a day are copies, so they stay. */
export async function deleteLibraryItem(req: AuthRequest, res: Response) {
    const item = await findItem(req.params.id, req.userId)
    if (!item) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    await item.deleteOne()
    res.json({ message: 'Deleted', data: null })
}

/** Put a copy of a library walk on a day, so that day can have its own route. */
export async function assignLibraryItem(req: AuthRequest, res: Response) {
    const item = await findItem(req.params.id, req.userId)
    if (!item) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    const read = readWalk({ ...item.toObject(), date: req.body.date, time: req.body.time })
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const walk = await Walk.create({ ...read.value, user: req.userId, library: item._id })
    res.status(201).json({ message: 'Created', data: walk })
}

export async function listFavourites(req: AuthRequest, res: Response) {
    const favourites = await WalkFavourite.find({ user: req.userId }).sort({ createdAt: -1 })
    res.json({ message: 'OK', data: favourites })
}

export async function createFavourite(req: AuthRequest, res: Response) {
    const fields = readFavourite(req.body)
    if (!fields) {
        res.status(400).json({ message: 'That route could not be read' })
        return
    }
    const count = await WalkFavourite.countDocuments({ user: req.userId })
    if (count >= MAX_FAVOURITES) {
        res.status(400).json({ message: `You can star up to ${MAX_FAVOURITES} routes. Unstar one first.` })
        return
    }
    res.status(201).json({ message: 'Created', data: await WalkFavourite.create({ ...fields, user: req.userId }) })
}

export async function deleteFavourite(req: AuthRequest, res: Response) {
    const removed = Types.ObjectId.isValid(String(req.params.id)) ? await WalkFavourite.findOneAndDelete({ _id: req.params.id, user: req.userId }) : null
    if (!removed) {
        res.status(404).json({ message: 'Route not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}

export async function listWalks(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    if (typeof from !== 'string' || !DATE.test(from) || typeof to !== 'string' || !DATE.test(to)) {
        res.status(400).json({ message: 'from and to must be YYYY-MM-DD' })
        return
    }
    await fillSeries(req.userId!, from, to)
    const walks = await Walk.find({ user: req.userId, date: { $gte: from, $lte: to } }).sort({ date: 1, time: 1 })
    res.json({ message: 'OK', data: walks })
}

export async function getWalk(req: AuthRequest, res: Response) {
    const walk = Types.ObjectId.isValid(String(req.params.id)) ? await Walk.findOne({ _id: req.params.id, user: req.userId }) : null
    if (!walk) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }
    const series = walk.series ? await WalkSeries.findOne({ _id: walk.series, user: req.userId }) : null
    res.json({ message: 'OK', data: { ...walk.toObject(), seriesDays: series?.days ?? [] } })
}

export async function createWalk(req: AuthRequest, res: Response) {
    const read = readWalk(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const days = readDays(req.body.days)
    if (!days) {
        res.status(400).json({ message: 'Unknown days to repeat on' })
        return
    }
    const series = days.length ? await newSeries(req.userId!, read.value, days) : null
    // A repeat chosen on a day it doesn't cover: this one stands alone, the rest follow.
    const link = series && repeatsOn(days, read.value.date) ? series._id : null
    const item = req.body.saveToLibrary === true ? await WalkLibraryItem.create({ ...planOf(read.value), user: req.userId }) : null
    const walk = await Walk.create({ ...read.value, user: req.userId, series: link, library: item?._id ?? null })
    res.status(201).json({ message: 'Created', data: walk })
}

export async function updateWalk(req: AuthRequest, res: Response) {
    const read = readWalk(req.body)
    if (!read.ok) {
        res.status(400).json({ message: read.message })
        return
    }
    const days = readDays(req.body.days)
    if (!days) {
        res.status(400).json({ message: 'Unknown days to repeat on' })
        return
    }
    const userId = req.userId!
    const existing = Types.ObjectId.isValid(String(req.params.id)) ? await Walk.findOne({ _id: req.params.id, user: userId }) : null
    if (!existing) {
        res.status(404).json({ message: 'Walk not found' })
        return
    }

    const value = read.value
    let series = existing.series
    if (series && value.date !== existing.date) {
        // Moved to another day: it stands alone now, and its old day stays empty.
        await WalkSeries.updateOne({ _id: series, user: userId }, { $addToSet: { skipped: existing.date } })
        series = null
    } else if (series && req.body.applyToSeries === true) {
        if (days.length === 0) {
            await endSeries(userId, series, value.date)
            series = null
        } else {
            await WalkSeries.updateOne({ _id: series, user: userId }, { $set: { ...seriesTemplate(value), days } })
            await Walk.deleteMany(untouchedAfter(userId, series, value.date))
        }
    } else if (!series && days.length) {
        const created = await newSeries(userId, value, days)
        if (repeatsOn(days, value.date)) series = created._id
    }

    const walk = await Walk.findOneAndUpdate({ _id: existing._id, user: userId }, { $set: { ...value, series } }, { new: true, runValidators: true })
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
    // Without this the repeat would put the day straight back.
    if (walk.series) await WalkSeries.updateOne({ _id: walk.series, user: req.userId }, { $addToSet: { skipped: walk.date } })
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
            maxRepeated: MAX_REPEATED,
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
