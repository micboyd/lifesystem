import { monthKeyOf } from './calendar'
import { monthRange, overlapsWindow, type LaneSource } from './lifeTimeline'
import type { LifePillar, NutritionPhaseKind } from '../types'
import type { TimelineInput } from './lifeTimeline'

/**
 * Pressure: how much a single month is being asked to carry.
 *
 * `overload.ts` asks the same question of one slot of one day — two hard sessions
 * in one sitting — and this is that question at month grain. Nothing here is a
 * diary clash; every commitment fits in the calendar on its own. What it catches
 * is the pile-up: a build block, an aggressive cut, an exam and a house move all
 * landing in the same six weeks, each reasonable alone and collectively not.
 *
 * The point is to catch it while it's still a plan rather than a failure, so the
 * weights are deliberately coarse — this is a prompt to look, not a measurement.
 */

/** One commitment's contribution to a month's load. */
export interface LoadContributor {
    source: LaneSource
    recordId: string
    label: string
    pillar: LifePillar
    /** How much demand this places on the month. */
    weight: number
}

export const LOAD_LEVELS = ['quiet', 'steady', 'busy', 'overloaded'] as const
export type LoadLevel = (typeof LOAD_LEVELS)[number]

export interface MonthLoad {
    month: string
    score: number
    level: LoadLevel
    /** What's live in the month, heaviest first. */
    contributors: LoadContributor[]
}

/**
 * What each kind of commitment costs a month.
 *
 * A training block and a cut weigh most because they're the two that ask
 * something of every day. A maintain phase costs nothing — it's the absence of a
 * nutrition demand, not a demand — and is still listed so the month reads
 * completely. A savings target is real but passive; a deadline (exam, goal) is a
 * spike rather than a load, so it counts once in the month it lands.
 */
export const LOAD_WEIGHTS = {
    trainingPlan: 2,
    nutritionPhase: { cut: 2, gain: 1, maintain: 0 } as Record<NutritionPhaseKind, number>,
    savingsTarget: 1,
    courseDeadline: 2,
    monthNote: 1,
    goalDeadline: 1,
} as const

/** Score at or above which a month is called overloaded. */
export const OVERLOAD_THRESHOLD = 6

/** Where a score sits on the quiet → overloaded scale. */
export function levelForScore(score: number): LoadLevel {
    if (score >= OVERLOAD_THRESHOLD) return 'overloaded'
    if (score >= 4) return 'busy'
    if (score >= 2) return 'steady'
    return 'quiet'
}

export const LOAD_LEVEL_LABELS: Record<LoadLevel, string> = {
    quiet: 'Quiet',
    steady: 'Steady',
    busy: 'Busy',
    overloaded: 'Overloaded',
}

/**
 * The load on every month of the plan's window, in order.
 *
 * Reads the same input the timeline is built from, so the two can never disagree
 * about what's live in a month.
 */
export function computeMonthLoads(input: TimelineInput): MonthLoad[] {
    const { plan } = input
    const months = monthRange(plan.start, plan.end)

    return months.map((month) => {
        const contributors: LoadContributor[] = []

        for (const tp of input.trainingPlans ?? []) {
            if (!overlapsWindow(monthKeyOf(tp.planStart), monthKeyOf(tp.planEnd), month, month))
                continue
            contributors.push({
                source: 'trainingPlan',
                recordId: tp._id,
                label: tp.name,
                pillar: 'training',
                weight: LOAD_WEIGHTS.trainingPlan,
            })
        }

        for (const phase of input.nutritionPhases ?? []) {
            if (
                !overlapsWindow(monthKeyOf(phase.startDate), monthKeyOf(phase.endDate), month, month)
            )
                continue
            contributors.push({
                source: 'nutritionPhase',
                recordId: phase._id,
                label: phase.name,
                pillar: 'nutrition',
                weight: LOAD_WEIGHTS.nutritionPhase[phase.kind] ?? 0,
            })
        }

        for (const target of input.savingsTargets ?? []) {
            if (!overlapsWindow(target.startMonth, target.targetMonth, month, month)) continue
            contributors.push({
                source: 'savingsTarget',
                recordId: target._id,
                label: target.name,
                pillar: 'money',
                weight: LOAD_WEIGHTS.savingsTarget,
            })
        }

        for (const course of input.courses ?? []) {
            if (!course.targetDate || monthKeyOf(course.targetDate) !== month) continue
            contributors.push({
                source: 'course',
                recordId: course._id,
                label: course.name,
                pillar: 'study',
                weight: LOAD_WEIGHTS.courseDeadline,
            })
        }

        for (const note of input.monthNotes ?? []) {
            if (!overlapsWindow(note.startMonth, note.endMonth, month, month)) continue
            contributors.push({
                source: 'monthNote',
                recordId: note._id,
                label: note.label,
                pillar: 'life',
                weight: LOAD_WEIGHTS.monthNote,
            })
        }

        for (const goal of input.goals ?? []) {
            if (!goal.targetDate || goal.status !== 'active') continue
            if (monthKeyOf(goal.targetDate) !== month) continue
            contributors.push({
                source: 'goal',
                recordId: goal._id,
                label: goal.title,
                pillar: 'life',
                weight: LOAD_WEIGHTS.goalDeadline,
            })
        }

        contributors.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
        const score = contributors.reduce((sum, c) => sum + c.weight, 0)
        return { month, score, level: levelForScore(score), contributors }
    })
}

/**
 * Only the months that tipped over, for the "here's what to look at" list.
 *
 * A month with a high score but a single cause isn't a pile-up, so at least two
 * weighted commitments are required — one heavy thing is a decision already made,
 * not a collision.
 */
export function findPressurePoints(loads: MonthLoad[]): MonthLoad[] {
    return loads.filter(
        (l) => l.level === 'overloaded' && l.contributors.filter((c) => c.weight > 0).length >= 2
    )
}

/** The heaviest month in the window, for the summary line. Undefined if empty. */
export function peakMonth(loads: MonthLoad[]): MonthLoad | undefined {
    return loads.reduce<MonthLoad | undefined>(
        (peak, l) => (!peak || l.score > peak.score ? l : peak),
        undefined
    )
}
