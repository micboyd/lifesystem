import { monthKey, monthKeyOf, addMonthsToKey, daysInMonth, parseDateKey } from './calendar'
import type {
    CalendarColor,
    Course,
    Goal,
    LifePillar,
    LifePlan,
    MonthNote,
    NutritionPhase,
    SavingsTarget,
    Season,
    TrainingPlan,
} from '../types'

/**
 * Projecting the life plan onto a month grid.
 *
 * Every pillar reads from a different module, and each stores its dates its own
 * way — training plans in YYYY-MM-DD, savings targets in YYYY-MM, goals as a
 * single deadline. This module flattens all of them into one shape the timeline
 * can draw without knowing where anything came from, which is what lets the
 * lanes sit side by side and be compared at all.
 */

/** Which module a lane item came from — drives its drawer and its deep link. */
export type LaneSource =
    | 'trainingPlan'
    | 'nutritionPhase'
    | 'savingsTarget'
    | 'course'
    | 'monthNote'
    | 'goal'

/** Where the "edit this" link on a lane item points. */
export const LANE_SOURCE_ROUTES: Record<LaneSource, string> = {
    trainingPlan: '/fitness',
    nutritionPhase: '/life-plan',
    savingsTarget: '/finances/forecast',
    course: '/study',
    monthNote: '/calendar',
    goal: '/goals',
}

/**
 * One thing drawn on a lane. A `bar` spans months; a `marker` sits on a single
 * month (a deadline, a race day) and is drawn as a diamond.
 *
 * Bounds are a month plus an offset into it, because most of what lands here has
 * real dates: a cut that ends on 15 November ended halfway through November, and
 * a bar filling the whole column says something that isn't true. Offsets are
 * rounded to quarters of a month — enough to read "starts mid-month" at a
 * glance, coarse enough that the eye isn't asked to measure days on an 88px
 * column.
 */
export interface LaneItem {
    /** Unique within a timeline — `${source}:${recordId}`. */
    id: string
    source: LaneSource
    /** The underlying record, for deep linking out to its own module. */
    recordId: string
    pillar: LifePillar
    label: string
    /** A line of context shown under the label in the drawer. */
    detail?: string
    shape: 'bar' | 'marker'
    color: CalendarColor
    /** Inclusive YYYY-MM bounds, clipped to the timeline window. */
    startMonth: string
    endMonth: string
    /** How far into `startMonth` the item begins — 0, 0.25, 0.5 or 0.75. */
    startOffset: number
    /** How much of `endMonth` the item covers — 0.25, 0.5, 0.75 or 1. */
    endOffset: number
    /** True when the record extends past the window and the bar was cut. */
    clippedStart: boolean
    clippedEnd: boolean
}

export interface TimelineLane {
    pillar: LifePillar
    items: LaneItem[]
}

/** A season drawn as a tinted band across every lane. */
export interface SeasonBand {
    season: Season
    startMonth: string
    endMonth: string
}

export interface Timeline {
    /** Every YYYY-MM in the window, in order — the timeline's columns. */
    months: string[]
    lanes: TimelineLane[]
    /** Goal deadlines, drawn as their own marker row rather than inside a pillar. */
    goals: LaneItem[]
    bands: SeasonBand[]
}

/** The records a timeline is built from. Any of them may be empty. */
export interface TimelineInput {
    plan: LifePlan
    trainingPlans?: TrainingPlan[]
    nutritionPhases?: NutritionPhase[]
    savingsTargets?: SavingsTarget[]
    courses?: Course[]
    monthNotes?: MonthNote[]
    goals?: Goal[]
}

/** Every YYYY-MM from `start` to `end` inclusive. Empty if the range is inverted. */
export function monthRange(start: string, end: string): string[] {
    if (start > end) return []
    const out: string[] = []
    let cursor = start
    // Guard the loop: a malformed key would otherwise never reach `end`.
    while (cursor <= end && out.length < 600) {
        out.push(cursor)
        cursor = addMonthsToKey(cursor, 1)
    }
    return out
}

/** Whether an inclusive month range touches the window at all. */
export function overlapsWindow(
    startMonth: string,
    endMonth: string,
    winStart: string,
    winEnd: string
): boolean {
    return startMonth <= winEnd && endMonth >= winStart
}

/** The timeline's resolution: a quarter of a month. */
export const QUARTER = 0.25

/**
 * Positions on the month axis are a month ordinal plus a fraction of that month,
 * so any two dates can be compared and clipped as plain numbers. Ends are
 * exclusive, which is what makes "runs to the end of November" and "runs to 1
 * December" the same position rather than an off-by-one.
 */
function monthOrdinal(month: string): number {
    const [year, m] = month.split('-').map(Number)
    return year * 12 + (m - 1)
}

function monthFromOrdinal(ordinal: number): string {
    return monthKey(Math.floor(ordinal / 12), ordinal % 12)
}

/** Snap a fraction of a month to the nearest quarter. */
function toQuarter(fraction: number): number {
    return Math.round(fraction * 4) / 4
}

/**
 * Where a date sits on the month axis.
 *
 * `end` counts the whole day as covered, so something ending on the 15th reaches
 * the middle of the month rather than stopping just short of it, and something
 * ending on the last day reaches the month boundary exactly. `point` uses the
 * middle of the day, which is what a deadline diamond wants. A YYYY-MM value has
 * no day to read, so it covers its whole month.
 */
function positionOf(date: string, edge: 'start' | 'end' | 'point'): number {
    const ordinal = monthOrdinal(monthKeyOf(date))
    if (date.length <= 7) return edge === 'start' ? ordinal : ordinal + 1
    const { year, month, day } = parseDateKey(date)
    const days = daysInMonth(year, month)
    const raw =
        edge === 'start' ? (day - 1) / days : edge === 'end' ? day / days : (day - 0.5) / days
    return ordinal + toQuarter(raw)
}

/**
 * Clip a record's span to the window and split it back into month + offset,
 * recording which ends were cut so the bar can be drawn open-ended rather than
 * pretending the commitment stops there.
 */
function place(
    startPos: number,
    endPos: number,
    winStart: string,
    winEnd: string
): Pick<
    LaneItem,
    'startMonth' | 'endMonth' | 'startOffset' | 'endOffset' | 'clippedStart' | 'clippedEnd'
> {
    const lo = monthOrdinal(winStart)
    const hi = monthOrdinal(winEnd) + 1
    const clippedStart = startPos < lo
    const clippedEnd = endPos > hi
    const start = Math.min(Math.max(startPos, lo), hi)
    const end = Math.min(Math.max(endPos, start), hi)
    // A marker has no width and stays put. A bar clipped hard against the window's
    // end would otherwise have nowhere to sit; keeping its last quarter still says
    // "this was running when the window closed".
    const isPoint = endPos === startPos
    const from = isPoint ? start : Math.min(start, end - QUARTER)
    const startOrdinal = Math.min(Math.floor(from), hi - 1)
    const endOrdinal = isPoint ? startOrdinal : Math.max(Math.ceil(end) - 1, startOrdinal)
    return {
        startMonth: monthFromOrdinal(startOrdinal),
        endMonth: monthFromOrdinal(endOrdinal),
        startOffset: from - startOrdinal,
        endOffset: end - endOrdinal,
        clippedStart,
        clippedEnd,
    }
}

/**
 * Where an item sits on the grid: which month column it starts in, how many
 * columns it spans, and how far in from each edge of that span it begins and
 * ends, as a percentage of the span's width.
 */
export function placeOnGrid(
    item: LaneItem,
    months: string[]
): { startIndex: number; span: number; left: number; right: number } | null {
    const startIndex = months.indexOf(item.startMonth)
    const endIndex = months.indexOf(item.endMonth)
    if (startIndex < 0 || endIndex < 0) return null
    const span = endIndex - startIndex + 1
    return {
        startIndex,
        span,
        left: (item.startOffset / span) * 100,
        right: ((1 - item.endOffset) / span) * 100,
    }
}

/** An item's start and end as absolute positions on the month axis. */
export function itemSpan(item: LaneItem): { start: number; end: number } {
    return {
        start: monthOrdinal(item.startMonth) + item.startOffset,
        end: monthOrdinal(item.endMonth) + item.endOffset,
    }
}

const PHASE_COLORS: Record<NutritionPhase['kind'], CalendarColor> = {
    cut: 'rose',
    maintain: 'teal',
    gain: 'emerald',
}

/** kcal/protein summarised for a phase bar's detail line. */
function phaseDetail(phase: NutritionPhase): string | undefined {
    const bits: string[] = []
    if (phase.targets.calories) bits.push(`${phase.targets.calories} kcal`)
    if (phase.targets.protein) bits.push(`${phase.targets.protein}g protein`)
    if (typeof phase.weeklyRate === 'number' && phase.weeklyRate !== 0)
        bits.push(`${phase.weeklyRate > 0 ? '+' : ''}${phase.weeklyRate} kg/wk`)
    return bits.length > 0 ? bits.join(' · ') : undefined
}

/**
 * Build every lane, marker and season band for a plan's window.
 *
 * Only records overlapping the window appear, and only the pillars the plan
 * tracks get a lane — a plan that doesn't track study shouldn't show an empty
 * study row.
 */
export function buildTimeline(input: TimelineInput): Timeline {
    const { plan } = input
    const winStart = plan.start
    const winEnd = plan.end
    const months = monthRange(winStart, winEnd)

    const items: LaneItem[] = []

    /**
     * `start` and `end` are YYYY-MM-DD where the source records a real date and
     * YYYY-MM where it only knows a month; a marker reads its point from `start`.
     * Returns null when the record misses the window entirely.
     */
    const makeItem = (
        source: LaneSource,
        recordId: string,
        pillar: LifePillar,
        label: string,
        start: string,
        end: string,
        color: CalendarColor,
        shape: 'bar' | 'marker' = 'bar',
        detail?: string
    ): LaneItem | null => {
        if (!overlapsWindow(monthKeyOf(start), monthKeyOf(end), winStart, winEnd)) return null
        const startPos = positionOf(start, shape === 'marker' ? 'point' : 'start')
        // Never let rounding collapse a bar to nothing — a four-day block is still
        // a block, and the shortest thing the grid can draw is a quarter.
        const endPos =
            shape === 'marker' ? startPos : Math.max(positionOf(end, 'end'), startPos + QUARTER)
        return {
            id: `${source}:${recordId}`,
            source,
            recordId,
            pillar,
            label,
            detail,
            shape,
            color,
            ...place(startPos, endPos, winStart, winEnd),
        }
    }

    const push = (...args: Parameters<typeof makeItem>) => {
        const item = makeItem(...args)
        if (item) items.push(item)
    }

    for (const tp of input.trainingPlans ?? []) {
        push(
            'trainingPlan',
            tp._id,
            'training',
            tp.name,
            tp.planStart,
            tp.planEnd,
            'blue',
            'bar',
            tp.phases.length > 0 ? `${tp.phases.length} phases` : undefined
        )
    }

    for (const phase of input.nutritionPhases ?? []) {
        push(
            'nutritionPhase',
            phase._id,
            'nutrition',
            phase.name,
            phase.startDate,
            phase.endDate,
            PHASE_COLORS[phase.kind] ?? 'neutral',
            'bar',
            phaseDetail(phase)
        )
    }

    for (const target of input.savingsTargets ?? []) {
        push(
            'savingsTarget',
            target._id,
            'money',
            target.name,
            target.startMonth,
            target.targetMonth,
            'amber',
            'bar',
            `£${Math.round(target.requiredMonthly)}/mo`
        )
    }

    for (const course of input.courses ?? []) {
        // A course with no deadline has no position on the grid, so it's left off
        // rather than parked arbitrarily.
        if (!course.targetDate) continue
        const remaining = Math.max(0, course.requiredHours - course.completedHours)
        push(
            'course',
            course._id,
            'study',
            course.name,
            course.targetDate,
            course.targetDate,
            'indigo',
            'marker',
            remaining > 0 ? `${remaining}h remaining` : 'Complete'
        )
    }

    for (const note of input.monthNotes ?? []) {
        push('monthNote', note._id, 'life', note.label, note.startMonth, note.endMonth, note.color, 'bar', note.note)
    }

    const goals: LaneItem[] = []
    for (const goal of input.goals ?? []) {
        if (!goal.targetDate || goal.status !== 'active') continue
        const item = makeItem(
            'goal',
            goal._id,
            'life',
            goal.title,
            goal.targetDate,
            goal.targetDate,
            'purple',
            'marker',
            `${Math.round(goal.progress)}% done`
        )
        if (item) goals.push(item)
    }

    const lanes: TimelineLane[] = plan.pillars.map((pillar) => ({
        pillar,
        items: items
            .filter((i) => i.pillar === pillar)
            .sort((a, b) => itemSpan(a).start - itemSpan(b).start || a.label.localeCompare(b.label)),
    }))

    const bands: SeasonBand[] = plan.seasons
        .filter((s) => overlapsWindow(s.startMonth, s.endMonth, winStart, winEnd))
        // A season is authored in whole months, so it needs no sub-month placement —
        // only clamping to the window.
        .map((season) => ({
            season,
            startMonth: season.startMonth < winStart ? winStart : season.startMonth,
            endMonth: season.endMonth > winEnd ? winEnd : season.endMonth,
        }))
        .sort((a, b) => a.startMonth.localeCompare(b.startMonth))

    return { months, lanes, goals, bands }
}

/** The season covering a month, if any. Seasons never overlap, so at most one. */
export function seasonForMonth(plan: LifePlan, month: string): Season | undefined {
    return plan.seasons.find((s) => s.startMonth <= month && s.endMonth >= month)
}

/**
 * The plan whose window covers `month` — the one treated as active. Falls back to
 * the first plan so the page still has something to show when today sits in a gap
 * between plans.
 */
export function activePlan(plans: LifePlan[], month: string): LifePlan | undefined {
    return plans.find((p) => p.start <= month && p.end >= month) ?? plans[0]
}

/** How far through a season a month sits, as "week 4 of 11"-style month counts. */
export function seasonProgress(
    season: Season,
    month: string
): { monthIndex: number; monthCount: number } {
    const months = monthRange(season.startMonth, season.endMonth)
    const idx = months.indexOf(month)
    return { monthIndex: idx < 0 ? 0 : idx + 1, monthCount: months.length }
}

/**
 * Pack a lane's items into as few rows as possible without two of them
 * overlapping in time. A lane is one pillar, and a pillar routinely has concurrent
 * commitments — two savings targets, a cut overlapping a maintain — so the lane
 * grows downwards rather than drawing bars on top of each other.
 *
 * Greedy first-fit over items in date order, which is optimal for intervals:
 * the row count it produces equals the maximum number of items live at once.
 */
export function packLaneRows(items: LaneItem[]): LaneItem[][] {
    const ordered = [...items].sort(
        (a, b) => itemSpan(a).start - itemSpan(b).start || itemSpan(a).end - itemSpan(b).end
    )
    const rows: LaneItem[][] = []
    for (const item of ordered) {
        const { start } = itemSpan(item)
        // Ends are exclusive, so a bar ending mid-November and one starting
        // mid-November share a row and meet at the join.
        const row = rows.find((r) => itemSpan(r[r.length - 1]).end <= start)
        if (row) row.push(item)
        else rows.push([item])
    }
    return rows
}
