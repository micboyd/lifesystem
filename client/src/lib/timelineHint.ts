import { addDays } from './calendar'
import { daysBetween } from './weightTrend'
import type { Milestone, Timeline, TimelineWeek } from './timeline'

/**
 * Where you are on the timeline, in a few lines: which week, how far through,
 * a nudge that fits the stage, and the next change the projection expects you
 * to notice. For the dashboard, where the full Timeline page is a tap away.
 *
 * Never a mood killer: progress so far is only mentioned when it's going the
 * plans' way, and the copy never says anything is behind.
 */

export type HintStage = 'start' | 'early' | 'building' | 'halfway' | 'late' | 'final' | 'last'

export interface TimelineHint {
    /** This week, counted from the start of the plans. */
    week: number
    total: number
    /** Whole weeks after this one. */
    weeksLeft: number
    /** 0–1: days from the start of the plans to the end. */
    progress: number
    stage: HintStage
    headline: string
    message: string
    /** The next change the projection expects you to notice. Plan changes don't count. */
    next: Milestone | null
    /** Scale change since the plans began, kg — only when it's going the plans' way. */
    soFar: number | null
    phase: TimelineWeek['phase']
}

/** Under this much, a scale change since the start isn't worth mentioning. */
const SO_FAR_MIN_KG = 0.3

/** The first weeks, when the work is real but the mirror hasn't caught up. */
const EARLY_WEEKS = 4

const COPY: Record<HintStage, { headline: string; message: string }> = {
    start: {
        headline: 'Week one',
        message: 'The first week is the hardest. Nothing shows yet, and that’s normal — just get the days done.',
    },
    early: {
        headline: 'Keep going',
        message: 'Changes are happening under the surface. You’ll start to see them soon.',
    },
    building: {
        headline: 'Building momentum',
        message: 'The middle weeks are where most people drift, and where most of the change happens. Stay with it.',
    },
    halfway: {
        headline: 'Halfway there',
        message: 'Everything from here builds on what you’ve already done.',
    },
    late: {
        headline: 'Past halfway',
        message: 'It compounds from here — the weeks ahead are the ones that show.',
    },
    final: {
        headline: 'The final stretch',
        message: 'This is where it all adds up. Finish strong.',
    },
    last: {
        headline: 'Last week',
        message: 'The finish line is in sight. Close it out the way you started.',
    },
}

/** Which way the plans want the scale to go: down for a cut goal, up for a build. */
export function planDirection(timeline: Timeline): -1 | 0 | 1 {
    const goal = timeline.goal.weightKg
    if (goal) return goal < timeline.initial.weight ? -1 : 1
    const kinds = timeline.plans.filter((p) => p.kind).map((p) => p.kind)
    if (kinds.includes('cut')) return -1
    if (kinds.includes('gain')) return 1
    return 0
}

function stageFor(timeline: Timeline, now: TimelineWeek, weeksLeft: number, progress: number): HintStage {
    if (weeksLeft === 0) return 'last'
    if (weeksLeft <= 2) return 'final'
    if (now.index === 1) return 'start'
    const midpoint = addDays(timeline.chainStart, Math.floor(daysBetween(timeline.chainStart, timeline.end) / 2))
    if (now.start <= midpoint && now.end >= midpoint) return 'halfway'
    if (progress > 0.5) return 'late'
    return now.index <= EARLY_WEEKS ? 'early' : 'building'
}

/** Where you are, read off the projection at your pace. */
export function timelineHint(timeline: Timeline, today: string): TimelineHint {
    const now = timeline.weeks[0]
    const total = timeline.past.length + timeline.weeks.length
    const weeksLeft = total - now.index
    const span = Math.max(1, daysBetween(timeline.chainStart, timeline.end))
    const progress = Math.max(0, Math.min(1, daysBetween(timeline.chainStart, today) / span))
    const stage = stageFor(timeline, now, weeksLeft, progress)

    const next =
        timeline.weeks.flatMap((w) => w.milestones).find((m) => m.date >= today && m.kind !== 'plan') ?? null

    const change = timeline.initial.weight - timeline.since.weight
    const dir = planDirection(timeline)
    const soFar = dir !== 0 && Math.sign(change) === dir && Math.abs(change) >= SO_FAR_MIN_KG ? change : null

    return { week: now.index, total, weeksLeft, progress, stage, ...COPY[stage], next, soFar, phase: now.phase }
}
