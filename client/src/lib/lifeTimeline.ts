import { monthKeyOf, addMonthsToKey } from './calendar'
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

/**
 * Clip a record's range to the window, recording which ends were cut so the bar
 * can be drawn open-ended rather than pretending the commitment stops there.
 */
function clip(
    startMonth: string,
    endMonth: string,
    winStart: string,
    winEnd: string
): { startMonth: string; endMonth: string; clippedStart: boolean; clippedEnd: boolean } {
    return {
        startMonth: startMonth < winStart ? winStart : startMonth,
        endMonth: endMonth > winEnd ? winEnd : endMonth,
        clippedStart: startMonth < winStart,
        clippedEnd: endMonth > winEnd,
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

    const push = (
        source: LaneSource,
        recordId: string,
        pillar: LifePillar,
        label: string,
        startMonth: string,
        endMonth: string,
        color: CalendarColor,
        shape: 'bar' | 'marker' = 'bar',
        detail?: string
    ) => {
        if (!overlapsWindow(startMonth, endMonth, winStart, winEnd)) return
        items.push({
            id: `${source}:${recordId}`,
            source,
            recordId,
            pillar,
            label,
            detail,
            shape,
            color,
            ...clip(startMonth, endMonth, winStart, winEnd),
        })
    }

    for (const tp of input.trainingPlans ?? []) {
        push(
            'trainingPlan',
            tp._id,
            'training',
            tp.name,
            monthKeyOf(tp.planStart),
            monthKeyOf(tp.planEnd),
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
            monthKeyOf(phase.startDate),
            monthKeyOf(phase.endDate),
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
        const month = monthKeyOf(course.targetDate)
        const remaining = Math.max(0, course.requiredHours - course.completedHours)
        push(
            'course',
            course._id,
            'study',
            course.name,
            month,
            month,
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
        const month = monthKeyOf(goal.targetDate)
        if (!overlapsWindow(month, month, winStart, winEnd)) continue
        goals.push({
            id: `goal:${goal._id}`,
            source: 'goal',
            recordId: goal._id,
            pillar: 'life',
            label: goal.title,
            detail: `${Math.round(goal.progress)}% done`,
            shape: 'marker',
            color: 'purple',
            ...clip(month, month, winStart, winEnd),
        })
    }

    const lanes: TimelineLane[] = plan.pillars.map((pillar) => ({
        pillar,
        items: items
            .filter((i) => i.pillar === pillar)
            .sort((a, b) => a.startMonth.localeCompare(b.startMonth) || a.label.localeCompare(b.label)),
    }))

    const bands: SeasonBand[] = plan.seasons
        .filter((s) => overlapsWindow(s.startMonth, s.endMonth, winStart, winEnd))
        .map((season) => {
            const { startMonth, endMonth } = clip(season.startMonth, season.endMonth, winStart, winEnd)
            return { season, startMonth, endMonth }
        })
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
 * Pack a lane's items into as few rows as possible without two of them sharing a
 * month. A lane is one pillar, and a pillar routinely has concurrent
 * commitments — two savings targets, a cut overlapping a maintain — so the lane
 * grows downwards rather than drawing bars on top of each other.
 *
 * Greedy first-fit over items in date order, which is optimal for intervals:
 * the row count it produces equals the maximum number of items live at once.
 */
export function packLaneRows(items: LaneItem[]): LaneItem[][] {
    const ordered = [...items].sort(
        (a, b) => a.startMonth.localeCompare(b.startMonth) || a.endMonth.localeCompare(b.endMonth)
    )
    const rows: LaneItem[][] = []
    for (const item of ordered) {
        const row = rows.find((r) => r[r.length - 1].endMonth < item.startMonth)
        if (row) row.push(item)
        else rows.push([item])
    }
    return rows
}
