/**
 * Reading the watch's whole history back from Garmin into GarminDay, for the
 * long-term trends: steps, calories burned, sleep and resting heart rate.
 *
 * Years of days is far more than one request can fetch inside Heroku's 30 s
 * cap, so a sync runs in the background, a stretch at a time, newest first:
 * the most recent stretch is always refreshed (recent days change as the watch
 * syncs), then it walks backwards from wherever it last got to until Garmin has
 * had nothing at all for about two years — the start of the data. How far back
 * it has got is kept on the account, so a restart or a failure picks up where
 * it stopped rather than starting again.
 */
import GarminAccount from '../models/GarminAccount'
import GarminDay from '../models/GarminDay'
import { providerFor } from './account'
import {
    GARMIN_ERROR_MESSAGES,
    MAX_HISTORY_DAYS,
    isGarminError,
    type GarminErrorCode,
    type GarminWorkoutProvider,
    type HistoryDay,
    type HistoryMeasure,
} from './provider'

/**
 * Stretches with no data at all, in a row, before the walk back stops: about
 * two years. Long enough that a spell without a watch between two devices
 * doesn't get mistaken for the start; it only costs a few extra calls, once.
 */
export const EMPTY_STRETCHES_TO_STOP = 9
/** Nothing is asked about before this — the first wrist-worn Garmin trackers. */
export const HISTORY_FLOOR = '2010-01-01'
/** How long before the most recent stretch is refreshed again. */
const REFRESH_TTL_MS = 10 * 60 * 1000
/** A breath between stretches, so a long walk back doesn't hammer Garmin. */
const PAUSE_MS = 400

const DAY_MS = 86_400_000

export function addDays(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
}

/** Today's date where the watch is worn. Dynos run UTC, so this is spelled out. */
export function londonToday(now = new Date()): string {
    return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export interface Stretch {
    from: string
    to: string
}

/** The most recent stretch: the days up to and including today. */
export function recentStretch(today: string): Stretch {
    return { from: addDays(today, -(MAX_HISTORY_DAYS - 1)), to: today }
}

/**
 * The stretch just before `before` (the earliest day already covered), or null
 * when that would start before the floor.
 */
export function earlierStretch(before: string, floor = HISTORY_FLOOR): Stretch | null {
    const to = addDays(before, -1)
    if (to < floor) return null
    const from = addDays(to, -(MAX_HISTORY_DAYS - 1))
    return { from: from < floor ? floor : from, to }
}

export interface HistorySyncState {
    running: boolean
    /** The earliest day read back to so far; null before the first sync. */
    from: string | null
    /** True once there is nothing earlier on Garmin. */
    complete: boolean
    /** Why the last sync stopped early, if it did. */
    error: { code: GarminErrorCode; message: string } | null
    /** Measures Garmin didn't answer for on some stretch of the last sync. */
    failed: HistoryMeasure[]
}

interface Job {
    running: boolean
    error: GarminErrorCode | null
    failed: Set<HistoryMeasure>
}

const jobs = new Map<string, Job>()
const refreshedAt = new Map<string, number>()

export async function historyState(userId: string): Promise<HistorySyncState> {
    const account = await GarminAccount.findOne({ user: userId }).select('historyFrom historyComplete').lean()
    const job = jobs.get(userId)
    return {
        running: job?.running ?? false,
        from: account?.historyFrom ?? null,
        complete: account?.historyComplete ?? false,
        error: job?.error ? { code: job.error, message: GARMIN_ERROR_MESSAGES[job.error] } : null,
        failed: job ? [...job.failed] : [],
    }
}

export async function storedHistory(userId: string): Promise<HistoryDay[]> {
    const rows = await GarminDay.find({ user: userId })
        .select('-_id date steps kcal activeKcal sleepMin sleepScore restingHr')
        .sort({ date: 1 })
        .lean()
    return rows.map((r) => {
        const day: HistoryDay = { date: r.date }
        if (r.steps != null) day.steps = r.steps
        if (r.kcal != null) day.kcal = r.kcal
        if (r.activeKcal != null) day.activeKcal = r.activeKcal
        if (r.sleepMin != null) day.sleepMin = r.sleepMin
        if (r.sleepScore != null) day.sleepScore = r.sleepScore
        if (r.restingHr != null) day.restingHr = r.restingHr
        return day
    })
}

async function storeDays(userId: string, days: HistoryDay[]): Promise<void> {
    if (!days.length) return
    await GarminDay.bulkWrite(
        days.map(({ date, ...fields }) => ({
            updateOne: {
                filter: { user: userId, date },
                update: { $set: fields },
                upsert: true,
            },
        })),
        { ordered: false }
    )
}

/** What a sync reads and writes, so the walk can be tested without Mongo or Garmin. */
export interface HistoryStore {
    progress(): Promise<{ from: string | null; complete: boolean }>
    saveDays(days: HistoryDay[]): Promise<void>
    saveProgress(from: string, complete: boolean): Promise<void>
}

function mongoStore(userId: string): HistoryStore {
    return {
        async progress() {
            const a = await GarminAccount.findOne({ user: userId }).select('historyFrom historyComplete').lean()
            return { from: a?.historyFrom ?? null, complete: a?.historyComplete ?? false }
        },
        saveDays: (days) => storeDays(userId, days),
        async saveProgress(from, complete) {
            await GarminAccount.updateOne({ user: userId }, { $set: { historyFrom: from, historyComplete: complete } })
        },
    }
}

/**
 * One sync: refresh the recent stretch (unless `skipRecent`), then walk back
 * from the earliest day covered until the data runs out. Throws on the first
 * Garmin failure, with everything before it already saved.
 */
export async function walkHistory(
    provider: Pick<GarminWorkoutProvider, 'dailyHistory'>,
    store: HistoryStore,
    today: string,
    opts: { skipRecent?: boolean; pause?: () => Promise<void>; onFailed?: (m: HistoryMeasure) => void } = {}
): Promise<void> {
    const pull = async (s: Stretch) => {
        const { days, failed } = await provider.dailyHistory(s.from, s.to)
        failed.forEach((m) => opts.onFailed?.(m))
        await store.saveDays(days)
        return days.length
    }

    let { from, complete } = await store.progress()
    const recent = recentStretch(today)
    if (!opts.skipRecent || from === null) {
        await pull(recent)
        if (from === null || recent.from < from) {
            from = recent.from
            await store.saveProgress(from, complete)
        }
    }

    let empty = 0
    while (!complete && from !== null) {
        const stretch = earlierStretch(from)
        if (!stretch) {
            complete = true
        } else {
            await opts.pause?.()
            empty = (await pull(stretch)) === 0 ? empty + 1 : 0
            from = stretch.from
            complete = empty >= EMPTY_STRETCHES_TO_STOP
        }
        await store.saveProgress(from, complete)
    }
}

/**
 * Start a background sync for the user, unless one is already running. Fails
 * straight away when Garmin isn't connected; anything that goes wrong later is
 * kept on the state for the screen to show. `restart` forgets how far back the
 * last sync got and reads everything again.
 */
export async function startHistorySync(
    userId: string,
    opts: { today?: string; restart?: boolean } = {}
): Promise<HistorySyncState> {
    if (jobs.get(userId)?.running) return historyState(userId)
    const provider = await providerFor(userId)
    const store = mongoStore(userId)
    if (opts.restart) {
        await GarminAccount.updateOne({ user: userId }, { $set: { historyFrom: null, historyComplete: false } })
        refreshedAt.delete(userId)
    }
    const last = refreshedAt.get(userId)
    const skipRecent = last !== undefined && Date.now() - last < REFRESH_TTL_MS
    const { from, complete } = await store.progress()
    if (skipRecent && complete && from !== null) return historyState(userId)

    const job: Job = { running: true, error: null, failed: new Set() }
    jobs.set(userId, job)
    void walkHistory(provider, store, opts.today ?? londonToday(), {
        skipRecent,
        pause: () => new Promise((r) => setTimeout(r, PAUSE_MS)),
        onFailed: (m) => job.failed.add(m),
    })
        .then(() => {
            refreshedAt.set(userId, Date.now())
        })
        .catch((err) => {
            job.error = isGarminError(err) ? err.code : 'error'
            if (!isGarminError(err))
                console.error(`[garmin] history sync failed: ${err instanceof Error ? err.name : 'unknown error'}`)
        })
        .finally(() => {
            job.running = false
        })
    return historyState(userId)
}
