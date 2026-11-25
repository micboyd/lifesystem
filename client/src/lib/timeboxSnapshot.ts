import { addDays, parseDateKey } from './calendar'
import { minutesToTime } from './time'
import { planSuggestions, workWindow } from './timebox'
import type { MealPlanEntry, Timebox, UserSettings } from '../types'

const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The Monday of `date`'s week, matching how the import places repeats. */
export function mondayOf(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay()
    return addDays(date, -((dow + 6) % 7))
}

/** A block the Timebox import accepts as is. Extra fields are ignored by the import. */
export interface SnapshotBlock {
    id: string
    date: string
    start: string
    end: string
    title: string
    category?: string
    notes?: string
    repeat?: string | string[]
    until?: string
    /** Days inside the range where this repeat was deleted for that day only. */
    skippedDays?: string[]
}

export interface TimeboxSnapshot {
    about: string
    range: { kind: 'day' | 'week'; from: string; to: string }
    exportedAt: string
    settings: {
        wake?: string
        bed?: string
        workingHours: { date: string; start: string; end: string; lunch?: { start: string; end: string } }[]
    }
    blocks: SnapshotBlock[]
    /** Notes are left out: they carry call links and dial-in PINs. */
    meetings: { date: string; start: string; end: string; title: string; location?: string }[]
    planned: { date: string; start: string; end: string; title: string; detail: string; category: string; alreadyBoxed: boolean }[]
}

const ABOUT = [
    'Snapshot of a Timebox (a day planned block by block).',
    '"blocks" are the user\'s own blocks, in the same format the Timebox JSON import reads: date (YYYY-MM-DD), start/end (HH:MM, 24h), title, category (work, personal, health, learning, social, travel), notes, repeat ("daily", "weekdays", "weekly" or day names like ["mon","wed"]) and until (YYYY-MM-DD).',
    'A repeating block is listed once; its date is the day the series began and it shows on every matching day from then until "until".',
    'To hand back an improved plan, return an object with a "blocks" list in this shape. The import only ADDS blocks — it does not update or delete by id — so the user deletes the old blocks first. "id" and "skippedDays" are for reference and are ignored on import (skipping single days of a repeat cannot be imported).',
    '"meetings" are read-only Google Calendar meetings: plan around them, never move them. "planned" are meals from the meal plan the user can drop onto the day. "workingHours" are the working day per date. Neither is read by the import.',
].join(' ')

function repeatOf(r: NonNullable<Timebox['recurrence']>): string | string[] {
    return r.freq === 'custom' ? (r.days ?? []).map((d) => DAY_ABBR[d]) : r.freq
}

/**
 * Builds the snapshot from each day's blocks (as listTimeboxes returns them)
 * and meal plan. `days` must be in date order.
 */
export function buildTimeboxSnapshot(
    days: { date: string; items: Timebox[]; meals: MealPlanEntry[] }[],
    settings: UserSettings | undefined,
    kind: 'day' | 'week',
    now = new Date()
): TimeboxSnapshot {
    const from = days[0].date
    const to = days[days.length - 1].date
    const blocks: SnapshotBlock[] = []
    const series = new Set<string>()
    const meetings: TimeboxSnapshot['meetings'] = []
    const planned: TimeboxSnapshot['planned'] = []
    const workingHours: TimeboxSnapshot['settings']['workingHours'] = []

    for (const { date, items, meals } of days) {
        const work = workWindow(date, settings)
        if (work)
            workingHours.push({
                date,
                start: minutesToTime(work.start),
                end: minutesToTime(work.end),
                ...(work.lunch ? { lunch: { start: minutesToTime(work.lunch.start), end: minutesToTime(work.lunch.end) } } : {}),
            })
        for (const item of [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
            if (item.source) {
                meetings.push({
                    date,
                    start: item.startTime,
                    end: item.endTime,
                    title: item.title,
                    ...(item.location ? { location: item.location } : {}),
                })
                continue
            }
            if (item.recurrence && series.has(item._id)) continue
            if (item.recurrence) series.add(item._id)
            const skipped = item.recurrence ? item.exceptions.filter((d) => d >= from && d <= to).sort() : []
            blocks.push({
                id: item._id,
                date: item.recurrence ? (item.seriesStart ?? date) : date,
                start: item.startTime,
                end: item.endTime,
                title: item.title,
                ...(item.category ? { category: item.category } : {}),
                ...(item.notes ? { notes: item.notes } : {}),
                ...(item.recurrence ? { repeat: repeatOf(item.recurrence) } : {}),
                ...(item.recurrence?.until ? { until: item.recurrence.until } : {}),
                ...(skipped.length ? { skippedDays: skipped } : {}),
            })
        }
        for (const s of planSuggestions(meals, items, work?.lunch))
            planned.push({
                date,
                start: s.startTime,
                end: s.endTime,
                title: s.title,
                detail: s.detail,
                category: s.category,
                alreadyBoxed: s.boxed,
            })
    }

    return {
        about: ABOUT,
        range: { kind, from, to },
        exportedAt: now.toISOString(),
        settings: {
            ...(settings?.wakeTime ? { wake: settings.wakeTime } : {}),
            ...(settings?.bedTime ? { bed: settings.bedTime } : {}),
            workingHours,
        },
        blocks,
        meetings,
        planned,
    }
}
