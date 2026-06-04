import type { Event, Part } from '../types'

export const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

export const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const PERIODS: { key: Part; label: string; icon: string }[] = [
    { key: 'morning', label: 'Morning', icon: 'fa-solid fa-sun' },
    { key: 'afternoon', label: 'Afternoon', icon: 'fa-solid fa-cloud-sun' },
    { key: 'evening', label: 'Evening', icon: 'fa-solid fa-moon' },
]

/** All part keys in ordinal order. 'na' is index 3. */
export const PART_KEYS: Part[] = ['morning', 'afternoon', 'evening', 'na']

export function daysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate()
}

export function dateKey(year: number, month: number, day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDateKey(date: string) {
    const [year, month, day] = date.split('-').map(Number)
    return { year, month: month - 1, day }
}

export function todayKey() {
    const now = new Date()
    return dateKey(now.getFullYear(), now.getMonth(), now.getDate())
}

export function formatDateLong(date: string) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return `${weekday} ${day} ${MONTHS[month]} ${year}`
}

/** Epoch days × 4 slots/day + part index. Matches the server calculation. */
export function slotOrdinal(date: string, part: Part) {
    const { year, month, day } = parseDateKey(date)
    return (Date.UTC(year, month, day) / 86_400_000) * 4 + PART_KEYS.indexOf(part)
}

/**
 * True if the event occupies the given (date, part) slot in the period grid.
 * allDay events fill morning/afternoon/evening for every day in their range.
 * 'na' events are informational and don't appear in part rows.
 */
export function eventCoversSlot(event: Event, date: string, part: Part): boolean {
    if (event.startPart === 'na') return false
    if (event.allDay) return date >= event.startDate && date <= event.endDate
    const o = slotOrdinal(date, part)
    return slotOrdinal(event.startDate, event.startPart) <= o && o <= slotOrdinal(event.endDate, event.endPart)
}

/** True if the event should appear in the all-day row for the given date. */
export function eventCoversAllDay(event: Event, date: string): boolean {
    if (date < event.startDate || date > event.endDate) return false
    return event.allDay || event.startPart === 'na'
}

/**
 * Returns true if the given (date, part) slot is in the past relative to `now`.
 * Part thresholds: morning ends at 12:00, afternoon ends at 18:00.
 * Evening on today is never considered past.
 */
export function isPartPast(date: string, part: Part, now: Date): boolean {
    const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate())
    if (date < today) return true
    if (date > today) return false
    // Today — check wall-clock time against part start times
    const mins = now.getHours() * 60 + now.getMinutes()
    if (part === 'morning') return mins >= 12 * 60   // past noon
    if (part === 'afternoon') return mins >= 18 * 60 // past 6 pm
    return false                                      // evening: goes red at midnight when the date rolls over to tomorrow
}

/** Add n days to a YYYY-MM-DD string. */
export function addDays(date: string, n: number): string {
    const { year, month, day } = parseDateKey(date)
    const d = new Date(Date.UTC(year, month, day + n))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Add n months to a YYYY-MM-DD string (clamps to end of month). */
export function addMonths(date: string, n: number): string {
    const { year, month, day } = parseDateKey(date)
    const d = new Date(Date.UTC(year, month + n, 1))
    const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
    d.setUTCDate(Math.min(day, maxDay))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Return the Sunday that starts the week containing `date`. */
export function getWeekStart(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const d = new Date(Date.UTC(year, month, day))
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** "June 2026" */
export function formatMonthYear(date: string): string {
    const { year, month } = parseDateKey(date)
    return `${MONTHS[month]} ${year}`
}

/** "4–10 Jun 2026" or "28 Jun–4 Jul 2026" */
export function formatWeekRange(start: string, end: string): string {
    const s = parseDateKey(start)
    const e = parseDateKey(end)
    const sm = MONTHS[s.month].slice(0, 3)
    const em = MONTHS[e.month].slice(0, 3)
    if (s.year === e.year && s.month === e.month) return `${s.day}–${e.day} ${sm} ${s.year}`
    if (s.year === e.year) return `${s.day} ${sm} – ${e.day} ${em} ${s.year}`
    return `${s.day} ${sm} ${s.year} – ${e.day} ${em} ${e.year}`
}

export function isEventStartSlot(event: Event, date: string, part: Part): boolean {
    return event.startDate === date && event.startPart === part
}

export function isEventStartDay(event: Event, date: string): boolean {
    return event.startDate === date
}
