/**
 * Pulling finished runs back from Garmin and linking each to its planned
 * conditioning entry and that entry's log.
 *
 * There's no push from Garmin on the unofficial Connect login, so the app asks
 * when it's opened on a day that has a conditioning entry with nothing linked.
 * Each day's activity list is cached for a while so opening screens doesn't
 * hammer Garmin; "Check Garmin" asks again sooner.
 */
import { Types } from 'mongoose'
import FitnessPlanEntry from '../models/FitnessPlanEntry'
import ConditioningLog from '../models/ConditioningLog'
import GarminActivity, { type IGarminActivity } from '../models/GarminActivity'
import type { IConditioningSession } from '../models/ConditioningSession'
import { buildWatchWorkout } from '../lib/watchSteps'
import { providerFor } from './account'
import { GarminError, type ActivityBrief, type GarminWorkoutProvider } from './provider'
import { activityDate, candidatesFor, logMinutes, matchActivities, unrollSteps } from './activityMatch'

/** How long a day's activity list is trusted before asking Garmin again. */
const AUTO_TTL_MS = 10 * 60 * 1000
/** The least time between asks, even from the button. */
const FORCE_TTL_MS = 15 * 1000
/** Each link is one more Garmin call; the rest wait for the next check (30 s request cap). */
const MAX_LINKS_PER_CHECK = 3
/** The widest range one check covers. */
const MAX_RANGE_DAYS = 14

const cache = new Map<string, { at: number; activities: ActivityBrief[] }>()
const cacheKey = (userId: string, date: string) => `${userId}|${date}`

function daysBetween(from: string, to: string): string[] {
    const out: string[] = []
    const d = new Date(`${from}T00:00:00Z`)
    const end = new Date(`${to}T00:00:00Z`)
    while (d <= end && out.length <= MAX_RANGE_DAYS) {
        out.push(d.toISOString().slice(0, 10))
        d.setUTCDate(d.getUTCDate() + 1)
    }
    return out
}

export function rangeIsValid(from: string, to: string): boolean {
    return from <= to && daysBetween(from, to).length <= MAX_RANGE_DAYS
}

type PopulatedEntry = {
    _id: Types.ObjectId
    date: string
    session: IConditioningSession | null
    garmin?: { workoutId?: string } | null
}

/** A brief for the browser: no workout id, nothing it doesn't show. */
export interface CandidateView {
    activityId: string
    name: string
    typeKey: string
    startLocal: string
    distanceM: number | null
    durationS: number | null
    avgHr: number | null
}

const toCandidate = (a: ActivityBrief): CandidateView => ({
    activityId: a.activityId,
    name: a.name,
    typeKey: a.typeKey,
    startLocal: a.startLocal,
    distanceM: a.distanceM,
    durationS: a.movingS ?? a.durationS,
    avgHr: a.avgHr,
})

export interface CheckResult {
    /** Links made by this check. */
    linked: { entryId: string; activityId: string; logId: string; by: 'workout' | 'day' }[]
    /** For each day with an entry still unlinked: what could be picked by hand. */
    candidates: Record<string, CandidateView[]>
    /** Whether Garmin was asked, or the cached lists were enough. */
    asked: boolean
}

/**
 * Link one activity to one entry: fetch it in full, store it, and tick the
 * entry off — attaching to the log already there, or writing one.
 */
export async function linkActivity(
    userId: string,
    entry: PopulatedEntry,
    activityId: string,
    by: 'workout' | 'day' | 'manual',
    provider: GarminWorkoutProvider
): Promise<IGarminActivity> {
    if (!entry.session) throw new GarminError('not_found')
    const session = entry.session

    // Another entry's run can't be taken without unlinking it there first.
    const existing = await GarminActivity.findOne({ user: userId, activityId })
    // (An entry deleted since doesn't hold on to it.)
    if (
        existing?.entry &&
        String(existing.entry) !== String(entry._id) &&
        (await FitnessPlanEntry.exists({ _id: existing.entry, user: userId }))
    )
        throw new GarminError('bad_request')

    const detail = existing?.summary
        ? { summary: existing.summary, laps: existing.laps, zones: existing.zones, track: existing.track, chart: existing.chart }
        : await provider.getActivity(activityId)
    const date = activityDate(detail.summary) || entry.date

    // The entry's log: on the entry's day, from its session.
    let log = await ConditioningLog.findOne({ user: userId, session: session._id, date: entry.date }).sort({ createdAt: 1 })
    const minutes = logMinutes(detail.summary)
    if (log) {
        log.garminActivity = existing?._id ?? null
        if (!log.duration && minutes) log.duration = minutes
    } else {
        log = new ConditioningLog({
            user: userId,
            session: session._id,
            name: session.name,
            category: session.category,
            date: entry.date,
            duration: minutes,
            source: 'garmin',
        })
    }

    let planned: ReturnType<typeof unrollSteps> = []
    try {
        planned = unrollSteps(buildWatchWorkout(session).steps)
    } catch {
        planned = []
    }

    const record = await GarminActivity.findOneAndUpdate(
        { user: userId, activityId },
        {
            $set: {
                date,
                entry: entry._id,
                log: log._id,
                linkedBy: by,
                dismissed: false,
                ...detail,
                planned,
            },
        },
        { upsert: true, new: true }
    )
    log.garminActivity = record._id as Types.ObjectId
    await log.save()
    return record
}

/** Take a run off its entry. The log stays (it's the user's record); the run won't be re-linked on its own. */
export async function unlinkActivity(userId: string, entryId: string): Promise<void> {
    const records = await GarminActivity.find({ user: userId, entry: entryId })
    for (const r of records) {
        if (r.log) await ConditioningLog.updateOne({ _id: r.log, user: userId }, { $set: { garminActivity: null } })
        r.entry = null
        r.log = null
        r.linkedBy = null
        r.dismissed = true
        await r.save()
    }
}

/** A log was deleted ("Mark as not done"): its run stops counting for that entry too. */
export async function releaseLogActivity(userId: string, logId: string): Promise<void> {
    await GarminActivity.updateMany(
        { user: userId, log: logId },
        { $set: { entry: null, log: null, linkedBy: null, dismissed: true } }
    )
}

/**
 * Look for runs over [from, to] and link what can be linked with confidence.
 * Garmin is only asked when a day in range has an entry still unlinked and its
 * cached list has gone stale.
 */
export async function checkActivities(
    userId: string,
    from: string,
    to: string,
    opts: { force?: boolean; provider?: GarminWorkoutProvider; now?: number } = {}
): Promise<CheckResult> {
    const now = opts.now ?? Date.now()
    const entries = await FitnessPlanEntry.find({
        user: userId,
        kind: 'conditioning',
        skipped: { $ne: true },
        date: { $gte: from, $lte: to },
    })
        .populate<{ session: IConditioningSession | null }>('session')
        .lean<PopulatedEntry[]>()
    const withSession = entries.filter((e) => e.session)
    if (!withSession.length) return { linked: [], candidates: {}, asked: false }

    const records = await GarminActivity.find({ user: userId, date: { $gte: shiftDay(from, -1), $lte: shiftDay(to, 1) } })
        .select('activityId entry dismissed')
        .lean()
    const linkedEntries = new Set(
        (await GarminActivity.find({ user: userId, entry: { $in: withSession.map((e) => e._id) } }).select('entry').lean()).map(
            (r) => String(r.entry)
        )
    )
    // Never matched automatically: linked elsewhere, or unlinked by hand. Only the
    // linked ones are kept off the pick list — an unlinked run can be picked again.
    const taken = new Set(records.filter((r) => r.entry || r.dismissed).map((r) => r.activityId))
    const linkedIds = new Set(records.filter((r) => r.entry).map((r) => r.activityId))
    const open = withSession.filter((e) => !linkedEntries.has(String(e._id)))
    if (!open.length) return { linked: [], candidates: {}, asked: false }

    // Days whose list needs asking for again.
    const ttl = opts.force ? FORCE_TTL_MS : AUTO_TTL_MS
    const openDays = [...new Set(open.map((e) => e.date))].sort()
    const stale = openDays.filter((d) => {
        const c = cache.get(cacheKey(userId, d))
        return !c || now - c.at > ttl
    })

    let provider = opts.provider
    let asked = false
    if (stale.length) {
        provider ??= await providerFor(userId)
        const start = stale[0]
        const end = stale[stale.length - 1]
        const list = await provider.listActivities(start, end)
        asked = true
        for (const d of daysBetween(start, end))
            cache.set(cacheKey(userId, d), { at: now, activities: list.filter((a) => activityDate(a) === d) })
    }
    const activities = openDays.flatMap((d) => cache.get(cacheKey(userId, d))?.activities ?? [])

    const links = matchActivities(
        open.map((e) => ({
            _id: String(e._id),
            date: e.date,
            workoutId: e.garmin?.workoutId ?? null,
            runLike:
                !!e.garmin?.workoutId ||
                !!e.session?.watchSteps?.length ||
                e.session?.category === 'Cardio' ||
                e.session?.category === 'Endurance',
        })),
        activities,
        taken
    ).slice(0, MAX_LINKS_PER_CHECK)

    const linked: CheckResult['linked'] = []
    for (const l of links) {
        const entry = open.find((e) => String(e._id) === l.entryId)!
        provider ??= await providerFor(userId)
        const record = await linkActivity(userId, entry, l.activityId, l.by, provider)
        linked.push({ entryId: l.entryId, activityId: l.activityId, logId: String(record.log), by: l.by })
        taken.add(l.activityId)
        linkedIds.add(l.activityId)
        linkedEntries.add(l.entryId)
    }

    const candidates: CheckResult['candidates'] = {}
    for (const d of openDays) {
        if (!open.some((e) => e.date === d && !linkedEntries.has(String(e._id)))) continue
        candidates[d] = candidatesFor(d, activities, linkedIds).map(toCandidate)
    }
    return { linked, candidates, asked }
}

/** Link by hand: the person picked this run for this entry. */
export async function linkByHand(userId: string, entryId: string, activityId: string): Promise<IGarminActivity> {
    if (!/^\d+$/.test(activityId)) throw new GarminError('bad_request')
    const entry = await FitnessPlanEntry.findOne({ _id: entryId, user: userId, kind: 'conditioning' })
        .populate<{ session: IConditioningSession | null }>('session')
        .lean<PopulatedEntry>()
    if (!entry || !entry.session) throw new GarminError('not_found')
    const provider = await providerFor(userId)
    // One run per entry: picking another replaces the first.
    await unlinkActivity(userId, entryId)
    return linkActivity(userId, entry, activityId, 'manual', provider)
}

function shiftDay(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

/** Forget cached lists — for tests. */
export function clearActivityCache() {
    cache.clear()
}
