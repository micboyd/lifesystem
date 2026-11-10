import type { WalkFields } from './walkInput'

/** The sums for repeating walks: which days they fall on and what each day starts with. */

/** Must match the planner's label: the point "Match my target" added belongs to one day's route. */
export const ADDED_STOP_LABEL = 'Added to match your target'

/** The most days one request will make real, so a wide range can't flood the collection. */
export const MAX_FILL_DAYS = 62

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

export const repeatsOn = (days: number[], date: string) => days.includes(weekdayOf(date))

function nextDate(date: string): string {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    return d.toISOString().slice(0, 10)
}

export interface SeriesDates {
    days: number[]
    startDate: string
    skipped: string[]
}

/** Days in the range this series should have a walk on and doesn't yet. */
export function datesToCreate(series: SeriesDates, from: string, to: string, existing: Set<string>): string[] {
    const out: string[] = []
    let date = from < series.startDate ? series.startDate : from
    for (let n = 0; date <= to && n < MAX_FILL_DAYS; n++, date = nextDate(date)) {
        if (repeatsOn(series.days, date) && !series.skipped.includes(date) && !existing.has(date)) out.push(date)
    }
    return out
}

/** What every future day starts from: the plan, without this day's route or its added point. */
export function seriesTemplate(value: WalkFields) {
    const { time, name, pace, goal, start, stops, end } = value
    return { time, name, pace, goal, start, stops: stops.filter((s) => s.label !== ADDED_STOP_LABEL), end }
}
