import { addDays } from './calendar'

export interface DaySteps {
    date: string
    steps: number
}

export interface StepsWeekDay {
    date: string
    /** Null when Garmin has no figure for the day. */
    steps: number | null
    /** Whether the day reached the target; false with no target or no figure. */
    hit: boolean
}

export interface StepsSummary {
    /** So far today; null until the watch has synced. */
    today: number | null
    /** The seven finished days before today, oldest first. */
    week: StepsWeekDay[]
    /** Mean over the days of `week` that have a figure; null if none do. */
    average: number | null
    /** How many days of `week` have a figure. */
    counted: number
    /** How many days of `week` reached the target. */
    hit: number
    /** Days in a row at or over the target, counted back from today. */
    streak: number
}

/**
 * Today only ever adds to the streak: it's still going until the day is over.
 * A day with no figure ends it, since the target can't be said to be met.
 */
function targetStreak(byDate: Map<string, number>, today: string, target?: number): number {
    if (target === undefined) return 0
    const met = (date: string) => (byDate.get(date) ?? -1) >= target
    let streak = met(today) ? 1 : 0
    for (let date = addDays(today, -1); met(date); date = addDays(date, -1)) streak++
    return streak
}

/**
 * Today plus the last seven finished days. Today is kept out of the average:
 * half a day's steps would drag it down every morning. A day with no figure
 * (watch off) is left out too, rather than counted as zero steps.
 */
export function stepsSummary(days: DaySteps[], today: string, target?: number): StepsSummary {
    const byDate = new Map(days.map((d) => [d.date, d.steps]))
    const week: StepsWeekDay[] = []
    for (let back = 7; back >= 1; back--) {
        const date = addDays(today, -back)
        const steps = byDate.get(date) ?? null
        week.push({ date, steps, hit: steps !== null && target !== undefined && steps >= target })
    }
    const known = week.flatMap((d) => (d.steps === null ? [] : [d.steps]))
    return {
        today: byDate.get(today) ?? null,
        week,
        average: known.length ? Math.round(known.reduce((sum, n) => sum + n, 0) / known.length) : null,
        counted: known.length,
        hit: week.filter((d) => d.hit).length,
        streak: targetStreak(byDate, today, target),
    }
}
