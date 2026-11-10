import type { FitnessPlanEntry, MealPlanEntry, MealType, Timebox, TimeboxCategory } from '../types'
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
        | { workStart?: string; workEnd?: string; workDays?: number[]; lunchStart?: string; lunchEnd?: string }
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
        .map((i) => [Math.max(start, timeToMinutes(i.startTime)), Math.min(end, timeToMinutes(i.endTime))])
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
export function nowOrNext(items: Timebox[], now: number): { item: Timebox; running: boolean } | null {
    const sorted = [...items].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const running = sorted.find((i) => timeToMinutes(i.startTime) <= now && now < timeToMinutes(i.endTime))
    if (running) return { item: running, running: true }
    const next = sorted.find((i) => timeToMinutes(i.startTime) > now)
    return next ? { item: next, running: false } : null
}

// ── The agenda ─────────────────────────────────────────────────────────────

/** Gaps shorter than this aren't worth a "free" row. */
export const MIN_GAP = 15

export type AgendaRow =
    | { kind: 'block'; key: string; item: Timebox; start: number; end: number }
    | { kind: 'planned'; key: string; suggestion: PlanSuggestion; start: number; end: number }
    | { kind: 'free'; key: string; start: number; end: number }
    | { kind: 'work'; key: string; start: number; end: number }
    | { kind: 'lunch'; key: string; start: number; end: number }

/**
 * The day top to bottom: blocks and not-yet-boxed plan items in start order,
 * with a row wherever at least MIN_GAP minutes go unclaimed between
 * `bounds.start` and `bounds.end` — a work row inside working hours, a free
 * row outside them. Overlapping items simply follow each other.
 */
export function agendaRows(
    items: Timebox[],
    suggestions: PlanSuggestion[],
    bounds: { start: number; end: number },
    work: WorkWindow | null = null
): AgendaRow[] {
    const entries: AgendaRow[] = [
        ...items.map((item) => ({
            kind: 'block' as const,
            key: `b-${item._id}`,
            item,
            start: timeToMinutes(item.startTime),
            end: timeToMinutes(item.endTime),
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
    ].sort((a, b) => a.start - b.start || (a.kind === 'block' ? -1 : 1))

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
            if (until - from >= MIN_GAP) rows.push({ kind: z.kind, key: `${z.kind}-${from}`, start: from, end: until })
        }
    }
    for (const e of entries) {
        gap(Math.min(e.start, bounds.end))
        rows.push(e)
        cursor = Math.max(cursor, e.end)
    }
    gap(bounds.end)
    return rows
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
    kind: 'training' | 'meal'
    title: string
    /** e.g. "Morning · 45 min" / "Lunch". */
    detail: string
    startTime: string
    endTime: string
    category: TimeboxCategory
    /** Already on the timeline — a block with the same title exists today. */
    boxed: boolean
}

/** Where a training slot or meal lands when it's first boxed. */
const PART_START: Record<FitnessPlanEntry['part'], number> = { morning: 7 * 60, afternoon: 13 * 60, evening: 18 * 60 }
const MEAL_SLOT: Record<MealType, { start: number; len: number; label: string }> = {
    breakfast: { start: 8 * 60, len: 30, label: 'Breakfast' },
    lunch: { start: 12 * 60 + 30, len: 30, label: 'Lunch' },
    snack: { start: 15 * 60 + 30, len: 15, label: 'Snack' },
    dinner: { start: 19 * 60, len: 45, label: 'Dinner' },
}
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']
const PART_LABEL = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } as const

const norm = (s: string) => s.trim().toLowerCase()

/**
 * The day's planned training and meals, ready to drop onto the timeline.
 * Skipped sessions and away notes are left out; a meal slot with several
 * items becomes one block.
 */
export function planSuggestions(
    fitness: FitnessPlanEntry[],
    meals: MealPlanEntry[],
    boxes: Timebox[],
    /** The day's lunch break, when set: the planned lunch goes there. */
    lunch?: { start: number; end: number }
): PlanSuggestion[] {
    const titles = new Set(boxes.map((b) => norm(b.title)))
    const out: PlanSuggestion[] = []

    const training = fitness
        .filter((e) => !e.skipped && (e.workout || e.session))
        .sort((a, b) => PART_START[a.part] - PART_START[b.part] || a.order - b.order)
    // Sessions sharing a part follow on from each other.
    const cursor: Record<string, number> = {}
    for (const e of training) {
        const lib = e.workout ?? e.session!
        const len = lib.duration > 0 ? lib.duration : 60
        const start = cursor[e.part] ?? PART_START[e.part]
        cursor[e.part] = start + len
        out.push({
            key: `fit-${e._id}`,
            kind: 'training',
            title: lib.name,
            detail: `${PART_LABEL[e.part]} · ${len} min`,
            startTime: minutesToTime(start),
            endTime: minutesToTime(Math.min(start + len, 24 * 60 - 1)),
            category: 'health',
            boxed: titles.has(norm(lib.name)),
        })
    }

    for (const slot of MEAL_ORDER) {
        const inSlot = meals.filter((m) => m.slot === slot && !m.away).sort((a, b) => a.order - b.order)
        if (!inSlot.length) continue
        const { label } = MEAL_SLOT[slot]
        const { start, len } =
            slot === 'lunch' && lunch ? { start: lunch.start, len: lunch.end - lunch.start } : MEAL_SLOT[slot]
        const title = inSlot.length === 1 ? inSlot[0].name : label
        const others = inSlot.map((m) => m.name).join(', ')
        out.push({
            key: `meal-${slot}`,
            kind: 'meal',
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
export function parseTimeboxImport(text: string): { items: TimeboxImportItem[] } | { error: string } {
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
        if (typeof r.title !== 'string' || !r.title.trim()) return { error: `Block ${i + 1} has no title.` }
        if (typeof start !== 'string' || typeof end !== 'string')
            return { error: `Block ${i + 1} needs a start and end, like "09:00".` }
        items.push({
            title: r.title,
            start: pad(start),
            end: pad(end),
            ...(typeof r.notes === 'string' ? { notes: r.notes } : {}),
            ...(typeof r.category === 'string' ? { category: r.category } : {}),
            ...(typeof r.date === 'string' ? { date: r.date } : {}),
        })
    }
    return { items }
}

/** "9:00" → "09:00", so loose times still match the server's HH:MM. */
const pad = (t: string) => (/^\d:\d\d$/.test(t.trim()) ? `0${t.trim()}` : t.trim())
