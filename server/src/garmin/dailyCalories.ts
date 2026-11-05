/**
 * Pulling each finished day's calories out from Garmin into DailyEnergy, so
 * the figure every calorie target is built from doesn't have to be typed.
 *
 * Only days before the user's today: a day still under way has a total that
 * is still climbing, and the target for it runs on the forecast until then.
 * A figure typed by hand is never overwritten — it's a correction. A pulled
 * figure is refreshed for a couple of days, while Garmin may still be syncing
 * the watch; after that it's final and Garmin isn't asked again.
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
}

/**
 * The days worth asking Garmin about: in range, before today, not typed by
 * hand, not already pulled and settled, and not asked about recently.
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
        if (row && row.source !== 'garmin') continue
        if (row && d < settledBefore) continue
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
        .select('date source caloriesOut')
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
        if (row?.caloriesOut === day.kcal) continue
        // Only ever a pulled row: one typed in the meantime doesn't match, and
        // the upsert then collides with it on { user, date } and is dropped.
        const res = await DailyEnergy.updateOne(
            { user: userId, date: day.date, source: 'garmin' },
            { $set: { caloriesOut: day.kcal } },
            { upsert: true }
        ).catch(() => null)
        if (res && (res.modifiedCount || res.upsertedCount)) updated.push(day)
    }
    return { updated, asked: true }
}
