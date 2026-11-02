import ApiUsage from '../models/ApiUsage'

/**
 * The app's own daily count of openrouteservice calls. The free plan allows
 * 2,000 directions requests a day; the app stops itself at ORS_DAILY_LIMIT
 * (default 1,000) so a bad day can't run into the real wall.
 */

const SERVICE = 'ors'

export function dailyLimit(): number {
    const n = Number(process.env.ORS_DAILY_LIMIT)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1000
}

const today = () => new Date().toISOString().slice(0, 10)

export async function usedToday(): Promise<number> {
    const doc = await ApiUsage.findOne({ service: SERVICE, day: today() })
    return doc?.count ?? 0
}

export async function recordCalls(n: number): Promise<void> {
    if (n <= 0) return
    await ApiUsage.updateOne({ service: SERVICE, day: today() }, { $inc: { count: n } }, { upsert: true })
}

export async function usage(): Promise<{ used: number; limit: number }> {
    return { used: await usedToday(), limit: dailyLimit() }
}
