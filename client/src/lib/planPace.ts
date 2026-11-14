import { DAILY_ALPHA, daysBetween, type BodyFatPoint, type TrendPoint } from './weightTrend'
import type { NutritionPhase } from '../types'

/**
 * Is the body on the Plan's own line?
 *
 * A Plan (a NutritionPhase) says where you started, where you're aiming and
 * by when — or failing a target, how fast. That draws a straight line, and the
 * honest question for the Body tab is how far today's trend sits from it.
 *
 * Deliberately a straight line from the Plan's own numbers, not the Timeline's
 * projection: that one recalibrates as you go, so judging against it would be
 * judging against a target that moves to meet you.
 *
 * Readings are compared on the day they were taken, not today — a fortnight
 * without a body-fat reading shouldn't count the fortnight against you.
 *
 * The trend is a smoothed line, so it runs days behind the scale while weight
 * is moving. Setting it against the raw line would read a cut that's exactly on
 * plan as a few hundred grams behind, every day. So the line is smoothed the
 * same way, over the same weigh-in dates, before the two are compared: the
 * question becomes "where would my trend be if I were exactly on plan".
 */

/** Within this many kg (or % points) of the line is on track. */
export const ON_LINE = 0.5
/** Past this the wording hardens from "slightly" to plain. */
export const CLEAR_OFF = 1.5
/** How far from the Plan's start a reading may be and still stand in for a missing start figure. */
const START_SEARCH_DAYS = 7
const START_SEARCH_DAYS_FAT = 21

export type PaceVerdict =
    | 'on-track'
    | 'slightly-ahead'
    | 'ahead'
    | 'slightly-behind'
    | 'behind'
    /** A hold phase off its line — there's no "ahead" when the point is to stay put. */
    | 'above'
    | 'below'

export const PACE_LABELS: Record<PaceVerdict, string> = {
    'on-track': 'On track',
    'slightly-ahead': 'Slightly ahead',
    ahead: 'Ahead of plan',
    'slightly-behind': 'Slightly behind',
    behind: 'Behind plan',
    above: 'Above plan',
    below: 'Below plan',
}

export interface PlanLine {
    startDate: string
    startValue: number
    /** The day the line stops: the goal's date, else the Plan's last day. */
    endDate: string
    /** Units per week, signed. */
    ratePerWeek: number
    /** The Plan's stated target, when it has one. */
    target: number | null
}

export interface LineCheck {
    line: PlanLine
    /** The reading the check is made on, and its date. */
    date: string
    actual: number
    /** Where the trend would sit on that date had every reading been on the line. */
    expected: number
    /** actual − expected, signed. */
    gap: number
    verdict: PaceVerdict
}

export interface PlanPace {
    phase: NutritionPhase
    weight: LineCheck | null
    bodyFat: LineCheck | null
}

/** Where the line sits on a date — held at its ends outside them. */
export function valueOn(line: PlanLine, date: string): number {
    const days = Math.min(
        Math.max(0, daysBetween(line.startDate, date)),
        Math.max(0, daysBetween(line.startDate, line.endDate))
    )
    return line.startValue + (line.ratePerWeek * days) / 7
}

/**
 * Ahead or behind, read against the direction of travel: lighter than the line
 * on a cut is ahead; the same number on a gain is behind.
 */
export function verdictOf(gap: number, ratePerWeek: number): PaceVerdict {
    const size = Math.abs(gap)
    if (size <= ON_LINE) return 'on-track'
    if (Math.abs(ratePerWeek) < 0.02) return gap > 0 ? 'above' : 'below'
    const ahead = Math.sign(gap) === Math.sign(ratePerWeek)
    if (ahead) return size <= CLEAR_OFF ? 'slightly-ahead' : 'ahead'
    return size <= CLEAR_OFF ? 'slightly-behind' : 'behind'
}

/** The trend nearest the Plan's start — the last before it, else the first after — within a window. */
function trendNear<T extends { date: string; trend: number }>(
    points: T[],
    date: string,
    window: number
): number | null {
    let best: T | null = null
    let bestGap = Infinity
    for (const p of points) {
        const gap = Math.abs(daysBetween(p.date, date))
        // Prefer a reading on or before the start on a tie: that's where you began.
        if (gap < bestGap || (gap === bestGap && p.date <= date)) {
            best = p
            bestGap = gap
        }
    }
    return best && bestGap <= window ? best.trend : null
}

/**
 * The Plan's line for one measure. A target and a date draw it start-to-target;
 * failing a target, a stated weekly rate (weight only) runs it to the Plan's end;
 * a maintain Plan with neither holds flat. Nothing else is guessed — a Plan that
 * doesn't say where it's going gets no line.
 */
export function planLine(
    phase: NutritionPhase,
    start: number | null,
    target: number | null,
    statedRate: number | null
): PlanLine | null {
    if (start === null) return null
    const endDate = phase.goal?.targetDate ?? phase.endDate
    const weeks = daysBetween(phase.startDate, endDate) / 7

    let ratePerWeek: number | null = null
    if (target !== null && weeks >= 1) ratePerWeek = (target - start) / weeks
    else if (statedRate !== null) ratePerWeek = statedRate
    else if (phase.kind === 'maintain') ratePerWeek = 0
    if (ratePerWeek === null) return null

    return { startDate: phase.startDate, startValue: start, endDate, ratePerWeek, target }
}

/**
 * The trend an on-plan body would show on the last of `dates`: the line's own
 * values on those dates, run through the same gap-aware smoothing the readings
 * get (lib/weightTrend.ts), starting level at the line's start.
 */
export function trendOnLine(line: PlanLine, dates: string[]): number {
    let trend = line.startValue
    let prev = line.startDate
    for (const date of [...dates].sort()) {
        const gap = daysBetween(prev, date)
        if (gap <= 0) continue
        trend += (1 - Math.pow(1 - DAILY_ALPHA, gap)) * (valueOn(line, date) - trend)
        prev = date
    }
    return trend
}

function check<T extends { date: string; trend: number }>(
    line: PlanLine | null,
    points: T[],
    phase: NutritionPhase
): LineCheck | null {
    if (!line) return null
    // The readings since the Plan began; before that there's nothing to judge.
    const since = points.filter((p) => p.date >= phase.startDate)
    const latest = since[since.length - 1]
    if (!latest) return null
    const expected = trendOnLine(
        line,
        since.map((p) => p.date)
    )
    const gap = latest.trend - expected
    return {
        line,
        date: latest.date,
        actual: latest.trend,
        expected,
        gap,
        verdict: verdictOf(gap, line.ratePerWeek),
    }
}

/** The Plan's verdict on weight and body fat, or null when no Plan covers today. */
export function planPace(
    phase: NutritionPhase | null,
    weights: TrendPoint[],
    fats: BodyFatPoint[]
): PlanPace | null {
    if (!phase) return null
    const goal = phase.goal ?? {}

    const startKg = goal.startWeightKg ?? trendNear(weights, phase.startDate, START_SEARCH_DAYS)
    const weightLine = planLine(
        phase,
        startKg,
        goal.targetWeightKg ?? null,
        phase.weeklyRate ?? goal.targetWeeklyRateKg ?? null
    )

    // Body fat only gets a line from a stated target — a weekly kg rate says nothing about it.
    const startFat = goal.startBodyFatPct ?? trendNear(fats, phase.startDate, START_SEARCH_DAYS_FAT)
    const fatLine =
        goal.targetBodyFatPct === undefined
            ? null
            : planLine(phase, startFat, goal.targetBodyFatPct, null)

    return {
        phase,
        weight: check(weightLine, weights, phase),
        bodyFat: check(fatLine, fats, phase),
    }
}
