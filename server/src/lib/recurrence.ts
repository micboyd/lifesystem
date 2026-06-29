/**
 * Shared recurrence expansion. A recurring "master" document (event, reminder, …)
 * stores a single startDate plus a recurrence rule; this turns it into the
 * concrete occurrences that fall inside a [from, to] window.
 *
 * Docs with an `endDate` (events) carry their duration onto each occurrence;
 * docs without one (reminders) are single-day.
 */

export const RECURRENCE_FREQUENCIES = [
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'yearly',
    'lastWeekday',
] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export interface RecurrenceSpec {
    frequency: RecurrenceFrequency
    endsOn?: string
}

export interface RecurringDoc {
    startDate: string
    /** Optional — present for ranged docs (events), absent for single-day docs (reminders). */
    endDate?: string
    recurrence?: RecurrenceSpec | null
    exdates?: string[]
}

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
    return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value)
}

/** Last weekday (Mon–Fri) of the given month. `monthIndex` may overflow (Date.UTC normalizes it). */
function lastWeekdayOfMonth(year: number, monthIndex: number): string {
    // Day 0 of the next month is the last day of this month.
    let dt = new Date(Date.UTC(year, monthIndex + 1, 0))
    const dow = dt.getUTCDay()
    if (dow === 6) dt = new Date(dt.getTime() - 86_400_000) // Sat → Fri
    else if (dow === 0) dt = new Date(dt.getTime() - 2 * 86_400_000) // Sun → Fri
    return dt.toISOString().slice(0, 10)
}

/** Add `days` to a YYYY-MM-DD string. */
function addDays(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Add n intervals of `frequency` to a YYYY-MM-DD string. */
function addInterval(date: string, frequency: RecurrenceFrequency, n: number): string {
    const [y, m, d] = date.split('-').map(Number)
    let dt: Date
    switch (frequency) {
        case 'daily':
            dt = new Date(Date.UTC(y, m - 1, d + n))
            break
        case 'weekly':
            dt = new Date(Date.UTC(y, m - 1, d + n * 7))
            break
        case 'biweekly':
            dt = new Date(Date.UTC(y, m - 1, d + n * 14))
            break
        case 'monthly':
            dt = new Date(Date.UTC(y, m - 1 + n, d))
            break
        case 'yearly':
            dt = new Date(Date.UTC(y + n, m - 1, d))
            break
        case 'lastWeekday':
            // The nth occurrence is the last weekday of the month n months on.
            return lastWeekdayOfMonth(y, m - 1 + n)
    }
    return dt.toISOString().slice(0, 10)
}

/**
 * Approximate starting iteration index so expansion begins near `from` rather
 * than from n=0.
 */
function startingN(start: string, frequency: RecurrenceFrequency, from: string): number {
    const diffDays = (Date.parse(from) - Date.parse(start)) / 86_400_000
    if (diffDays <= 0) return 0
    switch (frequency) {
        case 'daily':
            return Math.max(0, Math.floor(diffDays) - 1)
        case 'weekly':
            return Math.max(0, Math.floor(diffDays / 7) - 1)
        case 'biweekly':
            return Math.max(0, Math.floor(diffDays / 14) - 1)
        case 'monthly':
        case 'lastWeekday':
            return Math.max(0, Math.floor(diffDays / 30.44) - 1)
        case 'yearly':
            return Math.max(0, Math.floor(diffDays / 365.25) - 1)
    }
}

/**
 * Expand a recurring master (plain object) into the occurrences that overlap
 * [from, to]. Each occurrence is a shallow copy of `base` with its startDate
 * (and endDate, when present) shifted. Returns [] for non-recurring docs.
 */
export function expandRecurring<T extends RecurringDoc>(base: T, from: string, to: string): T[] {
    if (!base.recurrence) return []
    const { frequency, endsOn } = base.recurrence
    const effectiveTo = endsOn && endsOn < to ? endsOn : to
    const exdates = new Set(base.exdates ?? [])
    const results: T[] = []
    const MAX = 500

    const hasEnd = typeof base.endDate === 'string'
    // For computed-date frequencies (lastWeekday) the end can't be derived by
    // shifting the master's endDate by a fixed interval, so carry its duration.
    const durationDays = hasEnd
        ? Math.round((Date.parse(base.endDate as string) - Date.parse(base.startDate)) / 86_400_000)
        : 0

    let n = startingN(base.startDate, frequency, from)
    let safety = 0
    while (safety++ < MAX) {
        const occStart = addInterval(base.startDate, frequency, n)
        if (occStart > effectiveTo) break
        const occEnd = !hasEnd
            ? occStart
            : frequency === 'lastWeekday'
              ? addDays(occStart, durationDays)
              : addInterval(base.endDate as string, frequency, n)
        // Within the series, overlaps [from, to], and not an excepted ("this one only") occurrence?
        if (
            occStart >= base.startDate &&
            occEnd >= from &&
            occStart <= to &&
            !exdates.has(occStart)
        ) {
            results.push(
                hasEnd
                    ? { ...base, startDate: occStart, endDate: occEnd }
                    : { ...base, startDate: occStart }
            )
        }
        n++
    }
    return results
}
