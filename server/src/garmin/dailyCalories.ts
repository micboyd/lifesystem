/**
 * Pulling each finished day's calories out from Garmin into DailyEnergy, so
 * the figure every calorie target is built from doesn't have to be typed.
 *
 * Only days before the user's today: a day still under way has a total that
 * is still climbing, and the target for it runs on the forecast until then.
 * Garmin's figure is the day's default. A figure typed over it is an override:
 * the pull stores Garmin's figure beside it (so clearing the override falls
 * back to it) but never replaces it. A figure typed before Garmin had one for
 * the day overrode nothing, so Garmin's replaces it. A pulled figure is refreshed for a couple
 * of days, while Garmin may still be syncing the watch; after that it's final
 * and Garmin isn't asked again.
 */
import DailyEnergy from '../models/DailyEnergy'
import { providerFor } from './account'
import type { DayCalories, GarminWorkoutProvider } from './provider'

/** A pulled figure this recent (days before today) may still change. */
export const SETTLE_DAYS = 2
/** How long a day that was asked about isn't asked about again. */
const ASK_TTL_MS = 30 * 60 * 1000
/** The most days one pull covers — one Garmin call each, under Heroku's 30 s cap. */
export const MAX_PULL_DAYS = 14

const asked = new Map<string, number>()
const key = (userId: string, date: string) => `${userId}|${date}`

export function addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
}

/** What's already stored for a day. */
export interface StoredDay {
    date: string
    source?: 'manual' | 'garmin'
    garminCaloriesOut?: number
}

/**
 * The days worth asking Garmin about: in range, before today, without a
 * settled Garmin figure, and not asked about recently. A typed override still
 * gets Garmin's figure stored beside it.
 */
export function daysToAsk(
    from: string,
    to: string,
    today: string,
    stored: StoredDay[],
    recentlyAsked: (date: string) => boolean
): string[] {
    const byDate = new Map(stored.map((s) => [s.date, s]))
    const settledBefore = addDays(today, -SETTLE_DAYS)
    const out: string[] = []
    for (let d = from; d <= to && d < today && out.length < MAX_PULL_DAYS; d = addDays(d, 1)) {
        const row = byDate.get(d)
        const hasGarmin = row !== undefined && (row.source === 'garmin' || row.garminCaloriesOut !== undefined)
        if (hasGarmin && d < settledBefore) continue
        if (recentlyAsked(d)) continue
        out.push(d)
    }
    return out
}

export interface PullResult {
    /** Days whose stored figure was added or changed. */
    updated: DayCalories[]
    asked: boolean
}

export async function pullDailyCalories(
    userId: string,
    from: string,
    to: string,
    today: string,
    opts: { provider?: GarminWorkoutProvider; now?: number } = {}
): Promise<PullResult> {
    const now = opts.now ?? Date.now()
    const stored = await DailyEnergy.find({ user: userId, date: { $gte: from, $lte: to } })
        .select('date source caloriesOut garminCaloriesOut')
        .lean()
    const dates = daysToAsk(from, to, today, stored, (d) => {
        const at = asked.get(key(userId, d))
        return at !== undefined && now - at < ASK_TTL_MS
    })
    if (!dates.length) return { updated: [], asked: false }

    const provider = opts.provider ?? (await providerFor(userId))
    const days = await provider.dailyCalories(dates)
    for (const d of dates) asked.set(key(userId, d), now)

    const updated: DayCalories[] = []
    for (const day of days) {
        if (!dates.includes(day.date)) continue
        const row = stored.find((s) => s.date === day.date)
        if (row?.garminCaloriesOut === day.kcal) continue
        // A figure typed over Garmin's keeps its figure; Garmin's is refreshed beside it.
        const typed = await DailyEnergy.updateOne(
            { user: userId, date: day.date, source: { $ne: 'garmin' }, garminCaloriesOut: { $exists: true } },
            { $set: { garminCaloriesOut: day.kcal } }
        ).catch(() => null)
        if (typed?.matchedCount) {
            if (typed.modifiedCount) updated.push(day)
            continue
        }
        // Otherwise Garmin's figure is the day's — including over a figure typed
        // before Garmin had one, which wasn't overriding anything. A row typed
        // over Garmin's in the meantime doesn't match, and the upsert then
        // collides on { user, date } and is dropped.
        const res = await DailyEnergy.updateOne(
            {
                user: userId,
                date: day.date,
                $or: [{ source: 'garmin' }, { garminCaloriesOut: { $exists: false } }],
            },
            { $set: { caloriesOut: day.kcal, garminCaloriesOut: day.kcal, source: 'garmin' } },
            { upsert: true }
        ).catch(() => null)
        if (res && (res.modifiedCount || res.upsertedCount)) updated.push(day)
    }
    return { updated, asked: true }
}

/** How long today's so-far figure is reused before Garmin is asked again. */
const TODAY_TTL_MS = 10 * 60 * 1000
const todayCache = new Map<string, { at: number; kcal: number | null }>()

/**
 * Today's calories burned so far, read straight from Garmin and never stored:
 * the day is still under way, and DailyEnergy only holds finished days.
 */
export async function todayCalories(
    userId: string,
    date: string,
    opts: { provider?: GarminWorkoutProvider; now?: number } = {}
): Promise<number | null> {
    const now = opts.now ?? Date.now()
    const k = key(userId, date)
    const hit = todayCache.get(k)
    if (hit && now - hit.at < TODAY_TTL_MS) return hit.kcal
    const provider = opts.provider ?? (await providerFor(userId))
    const days = await provider.dailyCalories([date])
    const kcal = days.find((d) => d.date === date)?.kcal ?? null
    todayCache.set(k, { at: now, kcal })
    return kcal
}
