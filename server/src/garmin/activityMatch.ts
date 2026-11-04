/**
 * Which finished Garmin activity was the run for which planned conditioning
 * entry. Pure, so it can be tested without Garmin or Mongo.
 *
 * In order of confidence:
 *  1. The activity was started from the Garmin workout the entry was sent as.
 *  2. The entry is the only unlinked conditioning entry on its day and is a
 *     run or walk session, and the activity is the only unlinked run or walk.
 * Anything else is left for a person to pick: never a silent guess.
 */
import type { ActivityBrief } from './provider'
import type { WatchStep } from '../lib/watchSteps'
import type { PlannedStep } from '../models/GarminActivity'

export interface MatchEntry {
    _id: string
    date: string
    /** The Garmin workout the entry was sent as, if it was. */
    workoutId: string | null
    /**
     * Whether the session is a run or walk (sent to the watch, has watch steps,
     * or is Cardio/Endurance) — only those take the day's run without asking.
     * A mobility or HIIT session on a day with a separate run shouldn't.
     */
    runLike?: boolean
}

export interface MatchLink {
    entryId: string
    activityId: string
    by: 'workout' | 'day'
}

/** Garmin type keys that count as a run or walk for the same-day match. */
export function isRunOrWalk(typeKey: string): boolean {
    return /running|walking|hiking/.test(typeKey)
}

/** The day an activity started on, in the watch's local time. */
export function activityDate(a: Pick<ActivityBrief, 'startLocal'>): string {
    return a.startLocal.slice(0, 10)
}

const length = (a: ActivityBrief) => a.movingS ?? a.durationS ?? 0

/**
 * Links to make. `taken` holds activity ids already linked (to anything) or
 * dismissed, which are never offered again automatically. `entries` should be
 * only those with nothing linked yet.
 */
export function matchActivities(entries: MatchEntry[], activities: ActivityBrief[], taken: Set<string>): MatchLink[] {
    const links: MatchLink[] = []
    const used = new Set(taken)
    const open = activities.filter((a) => !used.has(a.activityId))

    // 1. Started from the entry's own workout, on the entry's day. Longest wins
    //    if it was started twice (a false start, then the real run).
    const left: MatchEntry[] = []
    for (const e of entries) {
        const hit = e.workoutId
            ? open
                  .filter((a) => !used.has(a.activityId) && a.workoutId === e.workoutId && activityDate(a) === e.date)
                  .sort((x, y) => length(y) - length(x))[0]
            : undefined
        if (hit) {
            links.push({ entryId: e._id, activityId: hit.activityId, by: 'workout' })
            used.add(hit.activityId)
        } else left.push(e)
    }

    // 2. One of each on the day.
    const byDate = new Map<string, MatchEntry[]>()
    for (const e of left) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
    for (const [date, dayEntries] of byDate) {
        if (dayEntries.length !== 1 || dayEntries[0].runLike === false) continue
        const runs = open.filter((a) => !used.has(a.activityId) && activityDate(a) === date && isRunOrWalk(a.typeKey))
        if (runs.length !== 1) continue
        links.push({ entryId: dayEntries[0]._id, activityId: runs[0].activityId, by: 'day' })
        used.add(runs[0].activityId)
    }
    return links
}

/** Activities on a day that could still be linked by hand, newest first. */
export function candidatesFor(date: string, activities: ActivityBrief[], taken: Set<string>): ActivityBrief[] {
    return activities
        .filter((a) => activityDate(a) === date && !taken.has(a.activityId))
        .sort((x, y) => y.startLocal.localeCompare(x.startLocal))
}

/** Watch steps with repeats unrolled — one per lap the watch will take. */
export function unrollSteps(steps: WatchStep[], cap = 200): PlannedStep[] {
    const out: PlannedStep[] = []
    const walk = (list: WatchStep[]) => {
        for (const s of list) {
            if (out.length >= cap) return
            if (s.type === 'repeat') for (let i = 0; i < s.times; i++) walk(s.steps)
            else out.push(s)
        }
    }
    walk(steps)
    return out
}

/** Whole minutes for a log's duration, from moving time where Garmin has it. */
export function logMinutes(a: Pick<ActivityBrief, 'movingS' | 'durationS'>): number {
    return Math.max(0, Math.round((a.movingS ?? a.durationS ?? 0) / 60))
}
