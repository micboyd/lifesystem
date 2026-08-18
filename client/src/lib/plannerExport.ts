/**
 * Building the planner's export payload.
 *
 * This is the planner *as it stands* — the entries and flags sitting on the days
 * of a date range — not the training plan documents that may have placed them.
 * A plan is a template; this is the state it produced, plus everything added,
 * moved or removed by hand since.
 *
 * Pure functions over already-loaded data so the shaping can be tested without
 * a network or a rendered drawer.
 */
import type {
    Exercise,
    FitnessFlagColor,
    FitnessNoteScope,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanNote,
    FitnessPlanPart,
    SessionPart,
    Workout,
} from '../types'
import { FITNESS_PLAN_PARTS } from '../types'
import { addDays, formatWeekRange, WEEKDAYS_LONG, parseDateKey } from './calendar'

// ─── Options ────────────────────────────────────────────────────────────────────

export interface PlannerExportOptions {
    /** Include day and week flags (colour + label). */
    flags: boolean
    /** Mark each entry with whether a matching log exists for its day. */
    completion: boolean
    /** Expand each entry into its library item's contents (sets/reps, parts…). */
    details: boolean
    /** Keep days that hold nothing, so every date in the range appears. */
    emptyDays: boolean
}

export const DEFAULT_EXPORT_OPTIONS: PlannerExportOptions = {
    flags: true,
    completion: true,
    details: false,
    emptyDays: false,
}

/** Everything the payload is built from, all already loaded. */
export interface PlannerExportInput {
    /** Inclusive "YYYY-MM-DD" bounds. Widened to whole weeks by the builder. */
    start: string
    end: string
    entries: FitnessPlanEntry[]
    notes: FitnessPlanNote[]
    /** Completion keys, as `kind:libraryId:date` — see `logKey`. */
    doneKeys: Set<string>
    /** Library exercises by id, for naming a workout's lines when details are on. */
    exercisesById: Map<string, Exercise>
    options: PlannerExportOptions
}

// ─── Payload shape ──────────────────────────────────────────────────────────────

export interface ExportedFlag {
    color: FitnessFlagColor
    label: string
}

export interface ExportedEntry {
    kind: FitnessPlanKind
    name: string
    /** Id of the library item, so an export can be matched back to it exactly. */
    item: string
    /** Position within its slot, top to bottom. */
    order: number
    /** Id of the training plan that placed this, or null when placed by hand. */
    plan: string | null
    /** Only present when its calendar clash had been accepted. */
    ignoreClash?: true
    /** Only present when completion is included. */
    done?: boolean
    /** Only present when details are included. */
    details?: Record<string, unknown>
}

export interface ExportedDay {
    date: string
    weekday: string
    flag?: ExportedFlag
    /** Slot keys are omitted when the slot holds nothing. */
    morning?: ExportedEntry[]
    afternoon?: ExportedEntry[]
    evening?: ExportedEntry[]
}

export interface ExportedWeek {
    start: string
    end: string
    label: string
    flag?: ExportedFlag
    totals: PlannerTotals
    days: ExportedDay[]
}

export type PlannerTotals = Record<FitnessPlanKind, number>

export interface PlannerExportPayload {
    exportedAt: string
    source: 'AdminLife Planner'
    range: { start: string; end: string }
    totals: PlannerTotals
    weeks: ExportedWeek[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** The completion key for a library item logged on a day. */
export function logKey(kind: FitnessPlanKind, libId: string, date: string): string {
    return `${kind}:${libId}:${date}`
}

/** The library item id behind a planned entry, whichever category it is. */
function entryLibId(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?._id
    if (entry.kind === 'conditioning') return entry.session?._id
    if (entry.kind === 'mobility') return entry.mobility?._id
    return entry.recovery?._id
}

/** The display name of a planned item, whichever library it comes from. */
function entryName(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?.name
    if (entry.kind === 'conditioning') return entry.session?.name
    if (entry.kind === 'mobility') return entry.mobility?.name
    return entry.recovery?.name
}

/** The slot an entry sits in, defaulting legacy entries (no `part`) to morning. */
function partOf(entry: FitnessPlanEntry): FitnessPlanPart {
    return entry.part ?? 'morning'
}

/** The Monday that starts the week containing `date` — the planner's week start. */
function mondayOf(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const dow = new Date(year, month, day).getDay() // 0 Sun … 6 Sat
    return addDays(date, -((dow + 6) % 7))
}

/** Sunday of a date's week. */
function sundayOf(date: string): string {
    return addDays(mondayOf(date), 6)
}

/** Every date from `start` to `end` inclusive. */
function datesBetween(start: string, end: string): string[] {
    const out: string[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
    return out
}

function weekdayName(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return WEEKDAYS_LONG[new Date(year, month, day).getDay()]
}

function emptyTotals(): PlannerTotals {
    return { workout: 0, conditioning: 0, mobility: 0, recovery: 0 }
}

/** Strip a session/mobility part down to the fields worth exporting. */
function shapeParts(parts: SessionPart[]) {
    return parts.map((p) => ({
        name: p.name,
        ...(p.detail ? { detail: p.detail } : {}),
        ...(p.rounds ? { rounds: p.rounds } : {}),
        ...(p.rounds && p.roundLabel ? { roundLabel: p.roundLabel } : {}),
    }))
}

/** A workout's lines, with library ids resolved to exercise names. */
function shapeWorkout(workout: Workout, exercisesById: Map<string, Exercise>) {
    return {
        ...(workout.duration ? { duration: workout.duration } : {}),
        exercises: workout.exercises.map((x) => ({
            name: exercisesById.get(x.exercise)?.name ?? x.exercise,
            ...(x.sets != null ? { sets: x.sets } : {}),
            ...(x.reps ? { reps: x.reps } : {}),
            ...(x.rest ? { rest: x.rest } : {}),
            ...(x.notes ? { notes: x.notes } : {}),
        })),
    }
}

/** The library item's own contents, for the entry's `details`. */
function entryDetails(
    entry: FitnessPlanEntry,
    exercisesById: Map<string, Exercise>
): Record<string, unknown> | undefined {
    if (entry.kind === 'workout' && entry.workout) {
        return shapeWorkout(entry.workout, exercisesById)
    }
    if (entry.kind === 'conditioning' && entry.session) {
        const s = entry.session
        return {
            duration: s.duration,
            category: s.category,
            ...(s.purpose ? { purpose: s.purpose } : {}),
            parts: shapeParts(s.parts),
        }
    }
    if (entry.kind === 'mobility' && entry.mobility) {
        const m = entry.mobility
        return {
            duration: m.duration,
            ...(m.purpose ? { purpose: m.purpose } : {}),
            parts: shapeParts(m.parts),
        }
    }
    if (entry.kind === 'recovery' && entry.recovery) {
        const r = entry.recovery
        return {
            duration: r.duration,
            ...(r.purpose ? { purpose: r.purpose } : {}),
            ...(r.notes ? { notes: r.notes } : {}),
        }
    }
    return undefined
}

/**
 * One planned entry, reduced to what the export carries. Entries whose library
 * item has gone are dropped by the caller — there is nothing left to name them.
 */
function shapeEntry(
    entry: FitnessPlanEntry,
    input: Pick<PlannerExportInput, 'doneKeys' | 'exercisesById' | 'options'>
): ExportedEntry | null {
    const item = entryLibId(entry)
    const name = entryName(entry)
    if (!item || !name) return null
    const details = input.options.details ? entryDetails(entry, input.exercisesById) : undefined
    return {
        kind: entry.kind,
        name,
        item,
        order: entry.order,
        plan: entry.plan,
        ...(entry.ignoreClash === true ? { ignoreClash: true as const } : {}),
        ...(input.options.completion
            ? { done: input.doneKeys.has(logKey(entry.kind, item, entry.date)) }
            : {}),
        ...(details ? { details } : {}),
    }
}

/** The flag for one day or week, or undefined when there isn't one / flags are off. */
function flagFor(
    notes: FitnessPlanNote[],
    scope: FitnessNoteScope,
    date: string,
    include: boolean
): ExportedFlag | undefined {
    if (!include) return undefined
    const note = notes.find((n) => n.scope === scope && n.date === date)
    return note ? { color: note.color, label: note.label } : undefined
}

// ─── Builder ────────────────────────────────────────────────────────────────────

/**
 * Widen a range to whole Monday–Sunday weeks, so an export always contains
 * complete weeks however the range was picked.
 */
export function weekRangeFor(start: string, end: string): { start: string; end: string } {
    const from = start <= end ? start : end
    const to = start <= end ? end : start
    return { start: mondayOf(from), end: sundayOf(to) }
}

/** Build the planner export payload. `now` is injectable so tests can pin it. */
export function buildPlannerExport(
    input: PlannerExportInput,
    now: Date = new Date()
): PlannerExportPayload {
    const range = weekRangeFor(input.start, input.end)
    const { options, notes } = input

    // Bucket the entries by date + slot once, in the order they should read:
    // slot order first (morning → evening), then each slot's own `order`.
    const byDate = new Map<string, Record<FitnessPlanPart, ExportedEntry[]>>()
    for (const entry of input.entries) {
        if (entry.date < range.start || entry.date > range.end) continue
        const shaped = shapeEntry(entry, input)
        if (!shaped) continue
        let slots = byDate.get(entry.date)
        if (!slots) {
            slots = { morning: [], afternoon: [], evening: [] }
            byDate.set(entry.date, slots)
        }
        slots[partOf(entry)].push(shaped)
    }
    for (const slots of byDate.values()) {
        for (const part of FITNESS_PLAN_PARTS) slots[part].sort((a, b) => a.order - b.order)
    }

    const total = emptyTotals()
    const weeks: ExportedWeek[] = []

    for (let weekStart = range.start; weekStart <= range.end; weekStart = addDays(weekStart, 7)) {
        const weekEnd = addDays(weekStart, 6)
        const weekTotals = emptyTotals()
        const days: ExportedDay[] = []

        for (const date of datesBetween(weekStart, weekEnd)) {
            const slots = byDate.get(date)
            const dayFlag = flagFor(notes, 'day', date, options.flags)
            const count = slots
                ? slots.morning.length + slots.afternoon.length + slots.evening.length
                : 0
            if (count === 0 && !dayFlag && !options.emptyDays) continue

            const day: ExportedDay = { date, weekday: weekdayName(date) }
            if (dayFlag) day.flag = dayFlag
            for (const part of FITNESS_PLAN_PARTS) {
                const rows = slots?.[part] ?? []
                if (!rows.length) continue
                day[part] = rows
                for (const row of rows) {
                    weekTotals[row.kind] += 1
                    total[row.kind] += 1
                }
            }
            days.push(day)
        }

        const weekFlag = flagFor(notes, 'week', weekStart, options.flags)
        // A week with nothing on it is only carried when empty days are wanted,
        // or when its own flag says something about it.
        if (!days.length && !weekFlag && !options.emptyDays) continue

        weeks.push({
            start: weekStart,
            end: weekEnd,
            label: formatWeekRange(weekStart, weekEnd),
            ...(weekFlag ? { flag: weekFlag } : {}),
            totals: weekTotals,
            days,
        })
    }

    return {
        exportedAt: now.toISOString(),
        source: 'AdminLife Planner',
        range,
        totals: total,
        weeks,
    }
}

/** How many entries a payload carries — what the download button counts. */
export function countEntries(payload: PlannerExportPayload): number {
    return Object.values(payload.totals).reduce((sum, n) => sum + n, 0)
}

/** The filename for a payload: one week is named by its Monday, a span by both ends. */
export function exportFilename(payload: PlannerExportPayload): string {
    const { start, end } = payload.range
    const stem = payload.weeks.length === 1 || start === end ? start : `${start}_to_${end}`
    return `planner-${stem}.json`
}
