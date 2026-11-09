/**
 * Copying each day's steps from Garmin into DailySteps. Garmin's figure is the
 * only one there is, so a pull simply brings the stored days up to date —
 * today's total keeps climbing, and recent days can change as the watch syncs.
 */
import DailySteps from '../models/DailySteps'
import { providerFor } from './account'
import type { DaySteps, GarminWorkoutProvider } from './provider'

/** How long a range that was asked about isn't asked about again. */
const ASK_TTL_MS = 10 * 60 * 1000

const asked = new Map<string, number>()

/** A year and a day of stored rows: what the target streak reads back through. */
export const MAX_STORED_DAYS = 366
/** Garmin answers up to 28 days in one call; more would mean several per pull. */
export const MAX_PULL_DAYS = 28

/** Whether `from`..`to`, both ends included, is in order and at most `maxDays` long. */
export function stepRangeIsValid(from: string, to: string, maxDays: number): boolean {
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
    return days >= 1 && days <= maxDays
}

export async function storedSteps(userId: string, from: string, to: string): Promise<DaySteps[]> {
    const rows = await DailySteps.find({ user: userId, date: { $gte: from, $lte: to } })
        .select('date steps')
        .sort({ date: 1 })
        .lean()
    return rows.map((r) => ({ date: r.date, steps: r.steps }))
}

/** The days in Garmin's reply that are in range and differ from what's stored. */
export function changedDays(pulled: DaySteps[], stored: DaySteps[], from: string, to: string): DaySteps[] {
    const known = new Map(stored.map((d) => [d.date, d.steps]))
    return pulled.filter((d) => d.date >= from && d.date <= to && known.get(d.date) !== d.steps)
}

export interface StepsPull {
    /** Every stored day in the range, after the pull. */
    days: DaySteps[]
    asked: boolean
}

export async function pullDailySteps(
    userId: string,
    from: string,
    to: string,
    opts: { provider?: GarminWorkoutProvider; now?: number } = {}
): Promise<StepsPull> {
    const now = opts.now ?? Date.now()
    const stored = await storedSteps(userId, from, to)
    const key = `${userId}|${from}|${to}`
    const at = asked.get(key)
    if (at !== undefined && now - at < ASK_TTL_MS) return { days: stored, asked: false }

    const provider = opts.provider ?? (await providerFor(userId))
    const pulled = await provider.dailySteps(from, to)
    asked.set(key, now)

    const changed = changedDays(pulled, stored, from, to)
    if (!changed.length) return { days: stored, asked: true }

    // Unordered and forgiving: two tabs pulling at once collide on { user, date }
    // for a row one of them just made, and that day is already up to date.
    await DailySteps.bulkWrite(
        changed.map((d) => ({
            updateOne: {
                filter: { user: userId, date: d.date },
                update: { $set: { steps: d.steps } },
                upsert: true,
            },
        })),
        { ordered: false }
    ).catch(() => null)
    return { days: await storedSteps(userId, from, to), asked: true }
}
