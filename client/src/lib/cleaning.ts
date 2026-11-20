/**
 * Cleaning: the home's rooms and jobs, and the weekly schedule worked out
 * from them. Pure functions only — the page and its tests both lean on these.
 *
 * Scheduling in short: each job turns into "occurrences" (a daily job on every
 * cleaning day, a weekly one once a week, …). Daily jobs are pinned first, then
 * the rest are placed biggest first on the emptiest day they may go on. A job
 * longer than a day's time — or one that no longer fits anywhere whole — is
 * cut into parts (part 1 of n) laid across days.
 *
 * Jobs rarer than weekly need a rotation longer than one week: 4 weeks for
 * fortnightly and monthly (a "month" is 4 weeks), 52 weeks once anything is
 * every 3 or 6 months (13 / 26 weeks) or yearly. Each such job keeps a fixed
 * week offset in the rotation, picked as the lightest.
 */
import type { CleaningFreq, CleaningRoom, CleaningTask } from '../types'
import { addDays } from './calendar'
import { formatDuration, minutesToTime, timeToMinutes } from './time'
import { ROOM_PRESETS, type RoomPreset } from './cleaningPresets'

export { ROOM_PRESETS, SAFETY_NOTES, type PresetTask, type RoomPreset } from './cleaningPresets'

export const FREQ_LABELS: Record<CleaningFreq, string> = {
    daily: 'Every cleaning day',
    '3x-week': '3× a week',
    '2x-week': 'Twice a week',
    weekly: 'Weekly',
    fortnightly: 'Fortnightly',
    monthly: 'Monthly',
    quarterly: 'Every 3 months',
    '6-monthly': 'Every 6 months',
    yearly: 'Yearly',
}

export const FREQS: CleaningFreq[] = ['daily', '3x-week', '2x-week', 'weekly', 'fortnightly', 'monthly', 'quarterly', '6-monthly', 'yearly']

/** Weeks between goes, for jobs placed once per period. */
const PERIOD_WEEKS: Partial<Record<CleaningFreq, number>> = {
    weekly: 1,
    fortnightly: 2,
    monthly: 4,
    quarterly: 13,
    '6-monthly': 26,
    yearly: 52,
}

/** Pieces shorter than this aren't worth a part of their own. */
export const MIN_PART = 10

/** Monday-first order for day pickers: Mon … Sun as 0 = Sun … 6 = Sat. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// ---------------------------------------------------------------- rooms

export const CUSTOM_ICON = 'fa-house'

export function roomIcon(kind: string): string {
    return ROOM_PRESETS.find((p) => p.kind === kind)?.icon ?? CUSTOM_ICON
}

let keySeq = 0
/** A short key unique enough for one home. */
export function newKey(prefix: string): string {
    keySeq += 1
    return `${prefix}${Date.now().toString(36)}${keySeq.toString(36)}${Math.random().toString(36).slice(2, 5)}`
}

/** A new room from a preset, with its default-on jobs ticked. Name gets a number when there's more than one. */
export function roomFromPreset(preset: RoomPreset, name = preset.label): CleaningRoom {
    return {
        key: newKey('r'),
        name,
        kind: preset.kind,
        tasks: preset.tasks.filter((p) => p.on).map((p) => ({ key: newKey('t'), name: p.name, minutes: p.minutes, freq: p.freq })),
    }
}

/** The next free name for another room of a kind: "Bedroom", "Bedroom 2", … */
export function nextRoomName(rooms: CleaningRoom[], label: string): string {
    const taken = new Set(rooms.map((r) => r.name.toLowerCase()))
    if (!taken.has(label.toLowerCase())) return label
    for (let n = 2; ; n++) if (!taken.has(`${label} ${n}`.toLowerCase())) return `${label} ${n}`
}

// ---------------------------------------------------------------- load

/** How many times a job comes round in 52 weeks. Daily depends on how many days you clean. */
export function timesPerYear(freq: CleaningFreq, cleaningDays: number): number {
    if (freq === 'daily') return cleaningDays * 52
    if (freq === '3x-week') return 156
    if (freq === '2x-week') return 104
    return 52 / (PERIOD_WEEKS[freq] ?? 52)
}

/** Average minutes a week a job takes. */
export function weeklyMinutes(task: CleaningTask, cleaningDays: number): number {
    return (task.minutes * timesPerYear(task.freq, cleaningDays)) / 52
}

export function roomWeeklyMinutes(room: CleaningRoom, cleaningDays: number): number {
    return room.tasks.reduce((sum, task) => sum + weeklyMinutes(task, cleaningDays), 0)
}

/** Minutes of daily jobs — they can't be split or moved, so they set a floor on each day. */
export function dailyMinutes(rooms: CleaningRoom[]): number {
    return rooms.reduce((sum, r) => sum + r.tasks.filter((t) => t.freq === 'daily').reduce((s, t) => s + t.minutes, 0), 0)
}

// ---------------------------------------------------------------- schedule

export interface ScheduleItem {
    taskKey: string
    roomKey: string
    roomName: string
    name: string
    minutes: number
    /** Set when the job was cut up: this is part `part` of `parts`. */
    part?: number
    parts?: number
    freq: CleaningFreq
}

export interface ScheduleDay {
    /** 0 = Sun … 6 = Sat */
    dow: number
    items: ScheduleItem[]
    total: number
    capacity: number
}

export interface Schedule {
    /** 1, 4 or 52 weeks; each lists only the cleaning days, Monday first. */
    weeks: ScheduleDay[][]
    /** Jobs that had to be cut into parts. */
    splitJobs: number
    /** Days in the whole rotation that run over the time given, because something couldn't be cut down. */
    overDays: number
}

interface Slot {
    week: number
    order: number
    day: ScheduleDay
    roomOrder: Map<string, number>
}

interface Job {
    task: CleaningTask
    room: CleaningRoom
    roomIndex: number
    taskIndex: number
}

export interface ScheduleSettings {
    minutesPerDay: number
    days: number[]
}

/** How many weeks the rotation runs: 1, 4 or 52. */
export function rotationWeeks(rooms: CleaningRoom[]): number {
    const freqs = new Set(rooms.flatMap((r) => r.tasks.map((t) => t.freq)))
    if (freqs.has('quarterly') || freqs.has('6-monthly') || freqs.has('yearly')) return 52
    if (freqs.has('fortnightly') || freqs.has('monthly')) return 4
    return 1
}

/** Split `list` into `n` runs as even as they come; with fewer items than runs, items repeat. */
function windows<T>(list: T[], n: number): T[][] {
    const out: T[][] = []
    for (let j = 0; j < n; j++) {
        const from = Math.floor((j * list.length) / n)
        const to = Math.floor(((j + 1) * list.length) / n)
        out.push(to > from ? list.slice(from, to) : [list[Math.min(from, list.length - 1)]])
    }
    return out
}

export function buildSchedule(rooms: CleaningRoom[], settings: ScheduleSettings): Schedule {
    const cap = Math.max(5, Math.round(settings.minutesPerDay))
    const dows = WEEK_ORDER.filter((d) => settings.days.includes(d))
    const cycle = rotationWeeks(rooms)
    if (!dows.length) return { weeks: [], splitJobs: 0, overDays: 0 }

    const slots: Slot[] = []
    const weeks: ScheduleDay[][] = []
    const slotsByWeek: Slot[][] = []
    const weekLoad: number[] = []
    for (let w = 0; w < cycle; w++) {
        const week: ScheduleDay[] = []
        const ws: Slot[] = []
        for (const dow of dows) {
            const day: ScheduleDay = { dow, items: [], total: 0, capacity: cap }
            week.push(day)
            const slot = { week: w, order: slots.length, day, roomOrder: new Map() }
            ws.push(slot)
            slots.push(slot)
        }
        weeks.push(week)
        slotsByWeek.push(ws)
        weekLoad.push(0)
    }
    const weekSlots = (w: number) => slotsByWeek[w]
    const free = (s: Slot) => cap - s.day.total

    const jobs: Job[] = rooms.flatMap((room, roomIndex) =>
        room.tasks.map((task, taskIndex) => ({ task, room, roomIndex, taskIndex }))
    )

    const put = (s: Slot, job: Job, minutes: number) => {
        s.day.items.push({
            taskKey: job.task.key,
            roomKey: job.room.key,
            roomName: job.room.name,
            name: job.task.name,
            minutes,
            freq: job.task.freq,
        })
        s.roomOrder.set(job.task.key, job.roomIndex * 1000 + job.taskIndex)
        s.day.total += minutes
        weekLoad[s.week] += minutes
    }

    const splitKeys = new Set<string>()

    /**
     * Place one occurrence of `job` on one (or, cut into parts, several) of
     * `eligible`. Parts may run on into `spill` (the following weeks, for jobs
     * rarer than weekly) when the week itself hasn't room.
     */
    const place = (job: Job, eligible: Slot[], spill: Slot[] = []) => {
        const minutes = job.task.minutes
        // The emptiest day it may go on; ties go to the earliest.
        const best = eligible.reduce((a, b) => (free(b) > free(a) ? b : a))
        if (minutes <= free(best)) {
            put(best, job, minutes)
            return
        }
        // Lay it across days, starting at the emptiest and carrying on in order.
        const start = eligible.indexOf(best)
        const ring = [...eligible.slice(start), ...eligible.slice(0, start), ...spill]
        const pieces: [Slot, number][] = []
        let left = minutes
        for (const s of ring) {
            if (left <= 0) break
            const piece = Math.min(left, free(s))
            if (piece >= Math.min(MIN_PART, left)) {
                pieces.push([s, piece])
                left -= piece
            }
        }
        // Don't leave a scrap as the last part: borrow from the one before.
        const n = pieces.length
        if (left === 0 && n > 1 && pieces[n - 1][1] < MIN_PART) {
            const need = MIN_PART - pieces[n - 1][1]
            if (pieces[n - 2][1] - need >= MIN_PART) {
                pieces[n - 2][1] -= need
                pieces[n - 1][1] += need
            }
        }
        // A job that fits in one day's time isn't worth cutting into scraps, or
        // spreading when there isn't room for it anyway: it goes whole on the
        // emptiest day, and that day runs over.
        if (minutes <= cap && (left > 0 || pieces.some(([, p]) => p < MIN_PART))) {
            put(best, job, minutes)
            return
        }
        if (left > 0) {
            // Out of room everywhere: the rest goes on the least-loaded day.
            const extra = (s: Slot) => pieces.find(([x]) => x === s)?.[1] ?? 0
            const least = eligible.reduce((a, b) => (b.day.total + extra(b) < a.day.total + extra(a) ? b : a))
            const hit = pieces.find(([x]) => x === least)
            if (hit) hit[1] += left
            else pieces.push([least, left])
        }
        const ordered = [...pieces].sort((a, b) => a[0].order - b[0].order)
        if (ordered.length > 1) splitKeys.add(job.task.key)
        ordered.forEach(([s, piece], i) => {
            put(s, job, piece)
            if (ordered.length > 1) {
                const item = s.day.items[s.day.items.length - 1]
                item.part = i + 1
                item.parts = ordered.length
            }
        })
    }

    // Daily jobs are pinned to every cleaning day.
    for (const job of jobs.filter((j) => j.task.freq === 'daily')) for (const s of slots) put(s, job, job.task.minutes)

    // Everything else, biggest first so the small jobs fill the gaps.
    const rest = jobs
        .filter((j) => j.task.freq !== 'daily')
        .sort((a, b) => b.task.minutes - a.task.minutes || a.roomIndex - b.roomIndex || a.taskIndex - b.taskIndex)

    for (const job of rest) {
        const freq = job.task.freq
        if (freq === '3x-week' || freq === '2x-week') {
            const n = freq === '3x-week' ? 3 : 2
            for (let w = 0; w < cycle; w++) for (const win of windows(weekSlots(w), n)) place(job, win)
            continue
        }
        // Once every `period` weeks, at the offset whose weeks are lightest so far.
        const period = Math.min(PERIOD_WEEKS[freq] ?? 1, cycle)
        let offset = 0
        let lightest = Infinity
        for (let o = 0; o < period; o++) {
            let load = 0
            for (let w = o; w < cycle; w += period) load += weekLoad[w]
            if (load < lightest) {
                lightest = load
                offset = o
            }
        }
        // Parts of a rarer job can run into the next few weeks (at most 3).
        const spillWeeks = Math.min(period, 4) - 1
        for (let w = offset; w < cycle; w += period) {
            const spill: Slot[] = []
            for (let k = 1; k <= spillWeeks; k++) spill.push(...weekSlots((w + k) % cycle))
            place(job, weekSlots(w), spill)
        }
    }

    // Read room by room within a day.
    for (const s of slots) {
        s.day.items.sort((a, b) => (s.roomOrder.get(a.taskKey) ?? 0) - (s.roomOrder.get(b.taskKey) ?? 0) || (a.part ?? 0) - (b.part ?? 0))
    }

    const overDays = slots.filter((s) => s.day.total > cap).length
    return { weeks, splitJobs: splitKeys.size, overDays }
}

// ---------------------------------------------------------------- dates

/** The Monday of `date`'s week. */
export function mondayOf(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return addDays(date, -((dow + 6) % 7))
}

export function dowOf(date: string): number {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Which week of the rotation `date` falls in (0-based). */
export function cycleWeekOf(date: string, cycleStart: string, cycle: number): number {
    if (cycle <= 1) return 0
    const a = Date.parse(`${mondayOf(date)}T00:00:00Z`)
    const b = Date.parse(`${mondayOf(cycleStart)}T00:00:00Z`)
    const weeks = Math.round((a - b) / (7 * 86_400_000))
    return ((weeks % cycle) + cycle) % cycle
}

/** The schedule's day for a date, or null when it's not a cleaning day. */
export function dayFor(schedule: Schedule, date: string, cycleStart: string): ScheduleDay | null {
    if (!schedule.weeks.length) return null
    const week = schedule.weeks[cycleWeekOf(date, cycleStart, schedule.weeks.length)]
    return week.find((d) => d.dow === dowOf(date)) ?? null
}

// ---------------------------------------------------------------- timebox

export function itemLabel(item: ScheduleItem): string {
    return item.parts ? `${item.name} (part ${item.part} of ${item.parts})` : item.name
}

/** "Cleaning · Kitchen, Bathroom +2" */
export function blockTitle(day: ScheduleDay): string {
    const rooms = [...new Set(day.items.map((i) => i.roomName))]
    if (!rooms.length) return 'Cleaning'
    const shown = rooms.slice(0, 2).join(', ')
    return `Cleaning · ${shown}${rooms.length > 2 ? ` +${rooms.length - 2}` : ''}`
}

/** One line per job: "Kitchen: Mop the floor · 15m" — cut short with "…and n more" to fit Timebox's 2000 characters. */
export function blockNotes(day: ScheduleDay, limit = 2000): string {
    const lines = day.items.map((i) => `${i.roomName}: ${itemLabel(i)} · ${formatDuration(i.minutes)}`)
    let out = ''
    for (let i = 0; i < lines.length; i++) {
        const next = out ? `${out}\n${lines[i]}` : lines[i]
        const tail = `\n…and ${lines.length - i - 1} more`
        if (next.length + (i < lines.length - 1 ? tail.length : 0) > limit) return `${out}\n…and ${lines.length - i} more`
        out = next
    }
    return out
}

export interface CleaningBlock {
    date: string
    title: string
    startTime: string
    endTime: string
    notes: string
}

/** Timebox blocks for every cleaning day from `from` to `to` (inclusive). Lengths round up to 5 minutes. */
export function timeboxBlocks(
    schedule: Schedule,
    opts: { from: string; to: string; cycleStart: string; startTime: string }
): CleaningBlock[] {
    const out: CleaningBlock[] = []
    const start = timeToMinutes(opts.startTime)
    for (let date = opts.from; date <= opts.to; date = addDays(date, 1)) {
        const day = dayFor(schedule, date, opts.cycleStart)
        if (!day || !day.items.length) continue
        const length = Math.ceil(day.total / 5) * 5
        const end = Math.min(start + length, 24 * 60 - 1)
        if (end <= start) continue
        out.push({
            date,
            title: blockTitle(day),
            startTime: minutesToTime(start),
            endTime: minutesToTime(end),
            notes: blockNotes(day),
        })
    }
    return out
}
