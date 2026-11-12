import type {
    MealPlanEntry,
    MealType,
    Timebox,
    TimeboxCategory,
    TimeboxRepeat,
} from '../types'
import { minutesToTime, timeToMinutes } from './time'
import { parseJsonc } from './jsonc'
import type { TimeboxImportItem } from '../services/timeboxes'

/**
 * Timebox: one day as a list of blocks with the free time between them.
 * Everything here is pure — the rows, the visible hours, what's boxed vs free,
 * and the plan items that could be dropped in — so the page only draws.
 */

export const SNAP_MIN = 15

/** Round minutes to the nearest snap step. */
export const snap = (min: number, step = SNAP_MIN) => Math.round(min / step) * step

/**
 * The hours the timeline shows: wake to bed, widened to whole hours and to fit
 * any block outside them. Falls back to 07:00–23:00 when the settings are odd.
 */
export function dayBounds(
    wake: string | undefined,
    bed: string | undefined,
    items: Timebox[],
    work: WorkWindow | null = null
): { start: number; end: number } {
    let start = wake ? timeToMinutes(wake) : 7 * 60
    let end = bed ? timeToMinutes(bed) : 23 * 60
    if (end <= start) {
        start = 7 * 60
        end = 23 * 60
    }
    if (work) {
        start = Math.min(start, work.start)
        end = Math.max(end, work.end)
    }
    for (const it of items) {
        start = Math.min(start, timeToMinutes(it.startTime))
        end = Math.max(end, timeToMinutes(it.endTime))
    }
    return { start: Math.floor(start / 60) * 60, end: Math.min(24 * 60, Math.ceil(end / 60) * 60) }
}

export interface WorkWindow {
    start: number
    end: number
    /** Lunch break, always inside start–end. */
    lunch?: { start: number; end: number }
}

/**
 * The working hours for one date (YYYY-MM-DD), from settings: start and end
 * time plus working days (0 = Sunday; Mon–Fri when unset). Null on a day off
 * or when the hours aren't set.
 */
export function workWindow(
    date: string,
    settings:
        | {
              workStart?: string
              workEnd?: string
              workDays?: number[]
              lunchStart?: string
              lunchEnd?: string
          }
        | undefined
): WorkWindow | null {
    if (!settings?.workStart || !settings.workEnd) return null
    const start = timeToMinutes(settings.workStart)
    const end = timeToMinutes(settings.workEnd)
    if (end <= start) return null
    const [y, m, d] = date.split('-').map(Number)
    const weekday = new Date(y, m - 1, d).getDay()
    if (!(settings.workDays ?? [1, 2, 3, 4, 5]).includes(weekday)) return null
    // Lunch is clipped to the working day; one outside it is ignored.
    if (settings.lunchStart && settings.lunchEnd) {
        const ls = Math.max(start, timeToMinutes(settings.lunchStart))
        const le = Math.min(end, timeToMinutes(settings.lunchEnd))
        if (le > ls) return { start, end, lunch: { start: ls, end: le } }
    }
    return { start, end }
}

type Zone = { kind: 'free' | 'work' | 'lunch'; start: number; end: number }

/** The working day as zones: work, lunch, work (or one work zone with no lunch). */
function workZones(work: WorkWindow): Zone[] {
    if (!work.lunch) return [{ kind: 'work', start: work.start, end: work.end }]
    return [
        { kind: 'work', start: work.start, end: work.lunch.start },
        { kind: 'lunch', start: work.lunch.start, end: work.lunch.end },
        { kind: 'work', start: work.lunch.end, end: work.end },
    ]
}

/** Minutes covered by at least one block, inside [start, end). Overlaps count once. */
export function boxedMinutes(items: Timebox[], start: number, end: number): number {
    const spans = items
        .map((i) => [
            Math.max(start, timeToMinutes(i.startTime)),
            Math.min(end, timeToMinutes(i.endTime)),
        ])
        .filter(([s, e]) => e > s)
        .sort((a, b) => a[0] - b[0])
    let total = 0
    let curS = -1
    let curE = -1
    for (const [s, e] of spans) {
        if (s > curE) {
            if (curE > curS) total += curE - curS
            curS = s
            curE = e
        } else curE = Math.max(curE, e)
    }
    if (curE > curS) total += curE - curS
    return total
}

/** The block running at `now` (minutes), or else the next one to start. */
export function nowOrNext(
    items: Timebox[],
    now: number
): { item: Timebox; running: boolean } | null {
    const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const running = sorted.find(
        (i) => timeToMinutes(i.startTime) <= now && now < timeToMinutes(i.endTime)
    )
    if (running) return { item: running, running: true }
    const next = sorted.find((i) => timeToMinutes(i.startTime) > now)
    return next ? { item: next, running: false } : null
}

// ── The agenda ─────────────────────────────────────────────────────────────

/** Gaps shorter than this aren't worth a "free" row. */
export const MIN_GAP = 15

export type AgendaRow =
    | { kind: 'block'; key: string; item: Timebox; start: number; end: number; meetings: Timebox[] }
    | { kind: 'planned'; key: string; suggestion: PlanSuggestion; start: number; end: number }
    | { kind: 'free'; key: string; start: number; end: number }
    | { kind: 'work'; key: string; start: number; end: number; meetings: Timebox[] }
    | { kind: 'lunch'; key: string; start: number; end: number; items: Timebox[] }

/** Same start: your blocks, then the lunch row, then plan items, then the rest. */
const ENTRY_ORDER: Record<AgendaRow['kind'], number> = {
    block: 0,
    lunch: 1,
    planned: 2,
    work: 3,
    free: 4,
}

/**
 * Sub-items in time order, grouped where they overlap: each group is one item,
 * or several that clash and so sit side by side.
 */
export function clashGroups(items: Timebox[]): Timebox[][] {
    const sorted = [...items].sort(
        (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
    )
    const groups: Timebox[][] = []
    let groupEnd = -1
    for (const it of sorted) {
        const s = timeToMinutes(it.startTime)
        const e = timeToMinutes(it.endTime)
        if (groups.length && s < groupEnd) {
            groups[groups.length - 1].push(it)
            groupEnd = Math.max(groupEnd, e)
        } else {
            groups.push([it])
            groupEnd = e
        }
    }
    return groups
}

/** The other items in `group` whose time actually overlaps `item`. */
export function clashesWith(item: Timebox, group: Timebox[]): Timebox[] {
    const s = timeToMinutes(item.startTime)
    const e = timeToMinutes(item.endTime)
    return group.filter(
        (o) => o !== item && timeToMinutes(o.startTime) < e && s < timeToMinutes(o.endTime)
    )
}

const covers = (item: Timebox, min: number) =>
    timeToMinutes(item.startTime) <= min && min < timeToMinutes(item.endTime)

/**
 * Whether a Google meeting is listed inside another row rather than standing on
 * its own: it starts under one of your own blocks, or inside working hours
 * (work or lunch). Nested meetings count toward that row, not as boxed time.
 */
export function isNestedMeeting(item: Timebox, items: Timebox[], work: WorkWindow | null): boolean {
    if (!item.source) return false
    const start = timeToMinutes(item.startTime)
    if (items.some((i) => !i.source && covers(i, start))) return true
    return !!work && workZones(work).some((z) => z.start <= start && start < z.end)
}

/** The day's own blocks: everything except meetings nested inside another row. */
export function ownBlocks(items: Timebox[], work: WorkWindow | null): Timebox[] {
    return items.filter((i) => !isNestedMeeting(i, items, work))
}

/** Whether a meeting starts in the day's lunch break. */
export function inLunch(item: Timebox, work: WorkWindow | null): boolean {
    if (!work?.lunch) return false
    const start = timeToMinutes(item.startTime)
    return work.lunch.start <= start && start < work.lunch.end
}

/**
 * The day top to bottom: blocks and not-yet-boxed plan items in start order,
 * with a row wherever at least MIN_GAP minutes go unclaimed between
 * `bounds.start` and `bounds.end` — a work row inside working hours, a free
 * row outside them. Overlapping items simply follow each other.
 *
 * The lunch break, on a working day, is always one row holding everything that
 * starts in it — your own blocks and meetings alike. Other Google meetings sit
 * inside the row that holds their start time — your own block first (the
 * latest-starting one, when blocks overlap), else the work row — and stand on
 * their own only when nothing holds them.
 */
export function agendaRows(
    items: Timebox[],
    suggestions: PlanSuggestion[],
    bounds: { start: number; end: number },
    work: WorkWindow | null = null
): AgendaRow[] {
    const lunch = work?.lunch ?? null
    const lunchItems = lunch
        ? items
              .filter(
                  (i) =>
                      lunch.start <= timeToMinutes(i.startTime) &&
                      timeToMinutes(i.startTime) < lunch.end
              )
              .sort(
                  (a, b) =>
                      a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
              )
        : []
    const rest = items.filter((i) => !lunchItems.includes(i))
    const nested = rest.filter((i) => isNestedMeeting(i, rest, work))
    const entries: AgendaRow[] = [
        ...(lunch
            ? [
                  {
                      kind: 'lunch' as const,
                      key: 'lunch',
                      start: lunch.start,
                      end: lunch.end,
                      items: lunchItems,
                  },
              ]
            : []),
        ...rest
            .filter((i) => !nested.includes(i))
            .map((item) => ({
                kind: 'block' as const,
                key: `b-${item._id}`,
                item,
                start: timeToMinutes(item.startTime),
                end: timeToMinutes(item.endTime),
                meetings: [] as Timebox[],
            })),
        ...suggestions
            .filter((s) => !s.boxed)
            .map((suggestion) => ({
                kind: 'planned' as const,
                key: `p-${suggestion.key}`,
                suggestion,
                start: timeToMinutes(suggestion.startTime),
                end: timeToMinutes(suggestion.endTime),
            })),
    ].sort((a, b) => a.start - b.start || ENTRY_ORDER[a.kind] - ENTRY_ORDER[b.kind])

    const rows: AgendaRow[] = []
    let cursor = bounds.start
    // The day as zones — free outside work, then work / lunch / work — so a
    // gap becomes one row per zone it crosses.
    const zones: Zone[] = work
        ? [
              { kind: 'free', start: -Infinity, end: work.start },
              ...workZones(work),
              { kind: 'free', start: work.end, end: Infinity },
          ]
        : [{ kind: 'free', start: -Infinity, end: Infinity }]
    const gap = (to: number) => {
        for (const z of zones) {
            const from = Math.max(cursor, z.start)
            const until = Math.min(to, z.end)
            if (until - from < MIN_GAP) continue
            // The lunch break is its own entry, so gaps only ever fill free and work time.
            if (z.kind === 'lunch') continue
            rows.push(
                z.kind === 'free'
                    ? { kind: 'free', key: `free-${from}`, start: from, end: until }
                    : { kind: 'work', key: `work-${from}`, start: from, end: until, meetings: [] }
            )
        }
    }
    for (const e of entries) {
        gap(Math.min(e.start, bounds.end))
        rows.push(e)
        cursor = Math.max(cursor, e.end)
    }
    gap(bounds.end)

    const loose: AgendaRow[] = []
    for (const m of [...nested].sort((a, b) => a.startTime.localeCompare(b.startTime))) {
        const start = timeToMinutes(m.startTime)
        const holds = (r: AgendaRow) => r.start <= start && start < r.end
        const own = rows.filter(
            (r): r is Extract<AgendaRow, { kind: 'block' }> =>
                r.kind === 'block' && !r.item.source && holds(r)
        )
        const host =
            own.sort((a, b) => b.start - a.start)[0] ??
            rows.find((r) => r.kind === 'work' && holds(r))
        if (host && 'meetings' in host) host.meetings.push(m)
        else
            loose.push({
                kind: 'block',
                key: `b-${m._id}`,
                item: m,
                start,
                end: timeToMinutes(m.endTime),
                meetings: [],
            })
    }
    if (!loose.length) return rows
    return [...rows, ...loose].sort((a, b) => a.start - b.start)
}

/** Working minutes no block covers (lunch not included) — neither boxed nor free. */
export function unboxedWorkMinutes(items: Timebox[], work: WorkWindow | null): number {
    if (!work) return 0
    return workZones(work)
        .filter((z) => z.kind === 'work')
        .reduce((sum, z) => sum + z.end - z.start - boxedMinutes(items, z.start, z.end), 0)
}

/** A block's place on the day strip, as percentages of the visible day. */
export function stripSegments(
    items: Timebox[],
    bounds: { start: number; end: number }
): { item: Timebox; left: number; width: number }[] {
    const span = bounds.end - bounds.start
    return items
        .map((item) => {
            const s = Math.max(bounds.start, timeToMinutes(item.startTime))
            const e = Math.min(bounds.end, timeToMinutes(item.endTime))
            return { item, left: ((s - bounds.start) / span) * 100, width: ((e - s) / span) * 100 }
        })
        .filter((seg) => seg.width > 0)
}

// ── From your plans ─────────────────────────────────────────────────────────

export interface PlanSuggestion {
    key: string
    title: string
    /** e.g. "Lunch", or the meals in a merged slot. */
    detail: string
    startTime: string
    endTime: string
    category: TimeboxCategory
    /** Already on the timeline — a block with the same title exists today. */
    boxed: boolean
}

/** Where a meal lands when it's first boxed. */
const MEAL_SLOT: Record<MealType, { start: number; len: number; label: string }> = {
    breakfast: { start: 8 * 60, len: 30, label: 'Breakfast' },
    lunch: { start: 12 * 60 + 30, len: 30, label: 'Lunch' },
    snack: { start: 15 * 60 + 30, len: 15, label: 'Snack' },
    dinner: { start: 19 * 60, len: 45, label: 'Dinner' },
}
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']

const norm = (s: string) => s.trim().toLowerCase()

/**
 * The day's planned meals, ready to drop onto the timeline. Training stays in
 * the fitness planner — Timebox and fitness are kept separate. Away notes are
 * left out; a meal slot with several items becomes one block.
 */
export function planSuggestions(
    meals: MealPlanEntry[],
    boxes: Timebox[],
    /** The day's lunch break, when set: the planned lunch goes there. */
    lunch?: { start: number; end: number }
): PlanSuggestion[] {
    const titles = new Set(boxes.map((b) => norm(b.title)))
    const out: PlanSuggestion[] = []

    for (const slot of MEAL_ORDER) {
        const inSlot = meals
            .filter((m) => m.slot === slot && !m.away)
            .sort((a, b) => a.order - b.order)
        if (!inSlot.length) continue
        const { label } = MEAL_SLOT[slot]
        const { start, len } =
            slot === 'lunch' && lunch
                ? { start: lunch.start, len: lunch.end - lunch.start }
                : MEAL_SLOT[slot]
        const title = inSlot.length === 1 ? inSlot[0].name : label
        const others = inSlot.map((m) => m.name).join(', ')
        out.push({
            key: `meal-${slot}`,
            title,
            detail: inSlot.length === 1 ? label : others,
            startTime: minutesToTime(start),
            endTime: minutesToTime(start + len),
            category: 'health',
            boxed: titles.has(norm(title)) || inSlot.some((m) => titles.has(norm(m.name))),
        })
    }
    return out
}

// ── JSON import ─────────────────────────────────────────────────────────────

/**
 * Read pasted JSON into import items: a bare array, or `{ blocks: [...] }`
 * (also `timeboxes` / `items`). Each item needs a title plus start and end
 * ("HH:MM"); comments are allowed.
 */
const DAY_NAMES: Record<string, number> = {
    sun: 0,
    sunday: 0,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    weds: 3,
    wednesday: 3,
    thu: 4,
    thur: 4,
    thurs: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
}

/**
 * A block's `repeat` from an import: "daily", "weekdays", "weekly" (the block's
 * own weekday), or days — ["mon", "wed"] or "mon, wed" — with an optional
 * `until` date. Returns the recurrence, null for no repeat, or an error.
 */
export function parseImportRepeat(
    repeat: unknown,
    until: unknown
): { freq: TimeboxRepeat; days?: number[]; until?: string } | null | { error: string } {
    if (
        repeat === undefined ||
        repeat === null ||
        repeat === false ||
        repeat === '' ||
        repeat === 'none'
    )
        return null
    if (until !== undefined && (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)))
        return { error: '"until" should be a date like "2026-12-31"' }
    const end = typeof until === 'string' ? { until } : {}
    if (
        typeof repeat === 'string' &&
        ['daily', 'weekdays', 'weekly'].includes(repeat.trim().toLowerCase())
    )
        return { freq: repeat.trim().toLowerCase() as TimeboxRepeat, ...end }
    const names = Array.isArray(repeat)
        ? repeat
        : typeof repeat === 'string'
          ? repeat.split(/[\s,]+/)
          : null
    if (!names) return { error: 'repeat should be "daily", "weekdays", "weekly" or a list of days' }
    const days = new Set<number>()
    for (const n of names) {
        const day =
            typeof n === 'string' ? DAY_NAMES[n.trim().toLowerCase().replace(/\.$/, '')] : undefined
        if (day === undefined)
            return { error: `"${String(n)}" isn’t a day — use mon, tue, wed, thu, fri, sat, sun` }
        days.add(day)
    }
    if (!days.size) return { error: 'repeat lists no days' }
    return { freq: 'custom', days: [...days].sort((a, b) => a - b), ...end }
}

export function parseTimeboxImport(
    text: string
): { items: TimeboxImportItem[] } | { error: string } {
    let parsed: unknown
    try {
        parsed = parseJsonc(text)
    } catch {
        return { error: 'That isn’t valid JSON.' }
    }
    let list: unknown = parsed
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const o = parsed as Record<string, unknown>
        list = o.blocks ?? o.timeboxes ?? o.items
    }
    if (!Array.isArray(list) || list.length === 0) return { error: 'Expected a list of blocks.' }
    const items: TimeboxImportItem[] = []
    for (const [i, raw] of list.entries()) {
        if (!raw || typeof raw !== 'object') return { error: `Block ${i + 1} isn’t an object.` }
        const r = raw as Record<string, unknown>
        const start = r.start ?? r.startTime
        const end = r.end ?? r.endTime
        if (typeof r.title !== 'string' || !r.title.trim())
            return { error: `Block ${i + 1} has no title.` }
        if (typeof start !== 'string' || typeof end !== 'string')
            return { error: `Block ${i + 1} needs a start and end, like "09:00".` }
        const recurrence = parseImportRepeat(r.repeat ?? r.repeats ?? r.days, r.until)
        if (recurrence && 'error' in recurrence)
            return { error: `Block ${i + 1}: ${recurrence.error}` }
        items.push({
            title: r.title,
            start: pad(start),
            end: pad(end),
            ...(typeof r.notes === 'string' ? { notes: r.notes } : {}),
            ...(typeof r.category === 'string' ? { category: r.category } : {}),
            ...(typeof r.date === 'string' ? { date: r.date } : {}),
            ...(recurrence ? { recurrence } : {}),
        })
    }
    return { items }
}

/** "9:00" → "09:00", so loose times still match the server's HH:MM. */
const pad = (t: string) => (/^\d:\d\d$/.test(t.trim()) ? `0${t.trim()}` : t.trim())
