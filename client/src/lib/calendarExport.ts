/**
 * Building the calendar's export payload.
 *
 * The point of this export is planning: hand a run of months to something (a
 * person, a spreadsheet, an LLM drafting a training plan) and let it see what is
 * already committed — trips, leave, socials, birthdays, month-long flags — and
 * which parts of each day are still open.
 *
 * So besides the events themselves (one row per event, a recurring one listing
 * its dates once rather than repeating itself), there is a day-by-day view that
 * answers "what is on, and what is free" for every date without the reader
 * having to reason about multi-day spans, slots or recurrence rules.
 *
 * Pure functions over already-loaded data so the shaping can be tested without
 * a network or a rendered drawer.
 */
import type {
    Birthday,
    Calendar,
    DayStatus,
    Event,
    EventType,
    MonthNote,
    Part,
    RecurrenceFrequency,
    Reminder,
} from '../types'
import { DAY_STATUS_OPTIONS, EVENT_TYPE_LABELS } from '../types'
import {
    addDays,
    addMonthsToKey,
    dateKey,
    daysInMonth,
    eventCoversSlot,
    formatMonthRange,
    parseDateKey,
    WEEKDAYS_LONG,
} from './calendar'

// ─── Options ────────────────────────────────────────────────────────────────────

export interface CalendarExportOptions {
    /** The day-by-day breakdown: what is on each date and which slots are free. */
    days: boolean
    /** Keep days with nothing on in the breakdown — useful to see open time. */
    emptyDays: boolean
    /** Carry each event's notes and location. */
    details: boolean
    /** Include events on calendars currently hidden in the filter bar. */
    hiddenCalendars: boolean
    reminders: boolean
    birthdays: boolean
}

export const DEFAULT_CALENDAR_EXPORT_OPTIONS: CalendarExportOptions = {
    days: true,
    emptyDays: true,
    details: true,
    hiddenCalendars: true,
    reminders: true,
    birthdays: true,
}

// ─── Payload ────────────────────────────────────────────────────────────────────

/** The three slots a day is planned in. 'na' events are untimed and take none. */
const SLOTS = ['morning', 'afternoon', 'evening'] as const
type Slot = (typeof SLOTS)[number]

export interface ExportedEvent {
    title: string
    calendar: string
    type: EventType
    typeLabel: string
    start: { date: string; part: Part }
    end: { date: string; part: Part }
    allDay: boolean
    time?: string
    location?: string
    notes?: string
    repeats?: { frequency: RecurrenceFrequency; endsOn?: string }
    /** Start dates of each occurrence within the range — only for repeating events. */
    occurrences?: string[]
}

export interface ExportedDayEvent {
    title: string
    calendar: string
    type: EventType
    /** Slots it fills that day, 'all day', or 'untimed' for events without a slot. */
    when: Slot[] | 'all day' | 'untimed'
    time?: string
}

export interface ExportedDay {
    date: string
    weekday: string
    weekend: boolean
    /** Leave or holiday, e.g. "Bank Holiday". */
    status?: string
    events: ExportedDayEvent[]
    /** Slots nothing is booked in. Untimed events don't take a slot. */
    free: Slot[]
    reminders?: string[]
    birthdays?: string[]
    /** Month flags covering this date — "Cutting", "No booze". */
    flags?: string[]
}

export interface CalendarExportPayload {
    kind: 'lifesystem.calendar'
    version: 1
    exportedAt: string
    range: { start: string; end: string; months: number; label: string }
    notes: string[]
    calendars: { name: string; color: string; default: boolean; hidden: boolean }[]
    monthFlags: { label: string; note?: string; fromMonth: string; toMonth: string }[]
    leave: { status: string; start: string; end: string }[]
    events: ExportedEvent[]
    birthdays?: { name: string; date: string }[]
    days?: ExportedDay[]
    summary: {
        days: number
        events: number
        daysWithEvents: number
        fullyFreeDays: number
        leaveDays: number
        freeWeekends: string[]
    }
}

export interface CalendarExportInput {
    /** YYYY-MM of the first month. */
    startMonth: string
    months: number
    events: Event[]
    calendars: Calendar[]
    statuses: DayStatus[]
    monthNotes: MonthNote[]
    reminders: Reminder[]
    birthdays: Birthday[]
    options: CalendarExportOptions
    now?: Date
}

// ─── Range ──────────────────────────────────────────────────────────────────────

/** First and last date of `months` whole months starting at `startMonth`. */
export function monthsRange(startMonth: string, months: number): { start: string; end: string } {
    const endMonth = addMonthsToKey(startMonth, Math.max(1, months) - 1)
    const [ey, em] = endMonth.split('-').map(Number)
    return {
        start: `${startMonth}-01`,
        end: dateKey(ey, em - 1, daysInMonth(ey, em - 1)),
    }
}

function eachDate(start: string, end: string): string[] {
    const out: string[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
    return out
}

function weekdayIndex(date: string): number {
    const { year, month, day } = parseDateKey(date)
    return new Date(Date.UTC(year, month, day)).getUTCDay()
}

// ─── Builder ────────────────────────────────────────────────────────────────────

const STATUS_LABELS = new Map(DAY_STATUS_OPTIONS.map((o) => [o.value, o.label]))

/** Which slots an event fills on a date, or its all-day / untimed marker. */
function whenOn(event: Event, date: string): ExportedDayEvent['when'] {
    if (event.startPart === 'na') return 'untimed'
    const slots = SLOTS.filter((s) => eventCoversSlot(event, date, s))
    return slots.length === SLOTS.length ? 'all day' : slots
}

export function buildCalendarExport(input: CalendarExportInput): CalendarExportPayload {
    const { options } = input
    const months = Math.max(1, input.months)
    const { start, end } = monthsRange(input.startMonth, months)
    const endMonth = end.slice(0, 7)

    const calendarsById = new Map(input.calendars.map((c) => [c._id, c]))
    const defaultCalendar = input.calendars.find((c) => c.isDefault)
    const calendarOf = (e: Event) =>
        (e.calendar && calendarsById.get(e.calendar)) || defaultCalendar
    const calendarName = (e: Event) => calendarOf(e)?.name ?? 'Life'

    // Occurrences inside the range, on calendars the options keep.
    const events = input.events
        .filter((e) => e.startDate <= end && e.endDate >= start)
        .filter((e) => options.hiddenCalendars || calendarOf(e)?.visible !== false)
        .sort((a, b) => (a.startDate === b.startDate ? 0 : a.startDate < b.startDate ? -1 : 1))

    // One row per event; a recurring series comes back as many occurrences
    // sharing an _id, so fold them into one row listing their dates.
    const byId = new Map<string, ExportedEvent>()
    const rows: ExportedEvent[] = []
    for (const e of events) {
        const existing = e.recurrence ? byId.get(e._id) : undefined
        if (existing) {
            existing.occurrences!.push(e.startDate)
            continue
        }
        const row: ExportedEvent = {
            title: e.title,
            calendar: calendarName(e),
            type: e.eventType,
            typeLabel: EVENT_TYPE_LABELS[e.eventType] ?? e.eventType,
            start: { date: e.startDate, part: e.startPart },
            end: { date: e.endDate, part: e.endPart },
            allDay: e.allDay,
        }
        if (e.time) row.time = e.time
        if (options.details && e.location) row.location = e.location
        if (options.details && e.notes) row.notes = e.notes
        if (e.recurrence) {
            row.repeats = { frequency: e.recurrence.frequency }
            if (e.recurrence.endsOn) row.repeats.endsOn = e.recurrence.endsOn
            row.occurrences = [e.startDate]
            byId.set(e._id, row)
        }
        rows.push(row)
    }

    const statuses = input.statuses.filter((s) => s.startDate <= end && s.endDate >= start)
    const flags = input.monthNotes.filter(
        (n) => n.startMonth <= endMonth && n.endMonth >= input.startMonth
    )
    const reminders = input.reminders.filter((r) => r.date >= start && r.date <= end)

    // Birthdays recur yearly on MM-DD; place them on each year the range covers.
    const birthdaysByMmdd = new Map<string, string[]>()
    for (const b of input.birthdays) {
        const list = birthdaysByMmdd.get(b.date) ?? []
        list.push(b.name)
        birthdaysByMmdd.set(b.date, list)
    }

    const dates = eachDate(start, end)
    const days: ExportedDay[] = []
    const birthdayRows: { name: string; date: string }[] = []
    let daysWithEvents = 0
    let fullyFreeDays = 0
    let leaveDays = 0
    const freeByDate = new Map<string, number>()

    for (const date of dates) {
        const dow = weekdayIndex(date)
        const onDay = events.filter((e) => e.startDate <= date && e.endDate >= date)
        const dayEvents: ExportedDayEvent[] = onDay.map((e) => {
            const out: ExportedDayEvent = {
                title: e.title,
                calendar: calendarName(e),
                type: e.eventType,
                when: whenOn(e, date),
            }
            if (e.time && e.startDate === date) out.time = e.time
            return out
        })
        const taken = new Set<Slot>()
        for (const e of onDay) for (const s of SLOTS) if (eventCoversSlot(e, date, s)) taken.add(s)
        const free = SLOTS.filter((s) => !taken.has(s))
        freeByDate.set(date, free.length)

        const status = statuses.find((s) => s.startDate <= date && s.endDate >= date)
        const dayReminders = reminders.filter((r) => r.date === date).map((r) => r.text)
        const dayBirthdays = birthdaysByMmdd.get(date.slice(5)) ?? []
        for (const name of dayBirthdays) birthdayRows.push({ name, date })
        const month = date.slice(0, 7)
        const dayFlags = flags
            .filter((n) => n.startMonth <= month && n.endMonth >= month)
            .map((n) => n.label)

        if (dayEvents.length > 0) daysWithEvents++
        if (free.length === SLOTS.length) fullyFreeDays++
        if (status) leaveDays++

        if (!options.days) continue
        const hasBirthdays = options.birthdays && dayBirthdays.length > 0
        const hasReminders = options.reminders && dayReminders.length > 0
        const empty = !dayEvents.length && !status && !hasBirthdays && !hasReminders
        if (empty && !options.emptyDays) continue

        const day: ExportedDay = {
            date,
            weekday: WEEKDAYS_LONG[dow],
            weekend: dow === 0 || dow === 6,
            events: dayEvents,
            free,
        }
        if (status) day.status = STATUS_LABELS.get(status.status) ?? status.status
        if (hasReminders) day.reminders = dayReminders
        if (hasBirthdays) day.birthdays = dayBirthdays
        if (dayFlags.length) day.flags = dayFlags
        days.push(day)
    }

    // A weekend is free when both Saturday and Sunday have every slot open.
    const freeWeekends = dates.filter(
        (d) =>
            weekdayIndex(d) === 6 &&
            freeByDate.get(d) === SLOTS.length &&
            freeByDate.get(addDays(d, 1)) === SLOTS.length
    )

    const payload: CalendarExportPayload = {
        kind: 'lifesystem.calendar',
        version: 1,
        exportedAt: (input.now ?? new Date()).toISOString(),
        range: {
            start,
            end,
            months,
            label: formatMonthRange(input.startMonth, endMonth),
        },
        notes: [
            'Each day has three slots: morning, afternoon, evening. An event fills every slot from its start part to its end part; "untimed" events take no slot.',
            'days[].free lists the slots nothing is booked in — the open time to plan into.',
            'Repeating events appear once in events[], with the dates they fall on in occurrences.',
            'monthFlags are labels on whole months (a diet phase, a dry month) and apply to every day in them.',
        ],
        calendars: [...input.calendars]
            .sort((a, b) => a.order - b.order)
            .map((c) => ({
                name: c.name,
                color: c.color,
                default: c.isDefault,
                hidden: !c.visible,
            })),
        monthFlags: flags.map((n) => ({
            label: n.label,
            ...(n.note ? { note: n.note } : {}),
            fromMonth: n.startMonth,
            toMonth: n.endMonth,
        })),
        leave: statuses
            .map((s) => ({
                status: STATUS_LABELS.get(s.status) ?? s.status,
                start: s.startDate,
                end: s.endDate,
            }))
            .sort((a, b) => (a.start < b.start ? -1 : 1)),
        events: rows,
        summary: {
            days: dates.length,
            events: rows.length,
            daysWithEvents,
            fullyFreeDays,
            leaveDays,
            freeWeekends,
        },
    }
    if (options.birthdays) payload.birthdays = birthdayRows
    if (options.days) payload.days = days
    return payload
}

export function calendarExportFilename(payload: CalendarExportPayload): string {
    const { start, end } = payload.range
    return `calendar-${start.slice(0, 7)}_to_${end.slice(0, 7)}.json`
}
