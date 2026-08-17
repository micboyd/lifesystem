import { daysInMonth } from './calendar'
import type {
    Course,
    EntryStatus,
    FitnessPlanKind,
    LifePillar,
    NutritionPhase,
    SavingsTarget,
    Season,
} from '../types'

/**
 * Scoring a season after the fact.
 *
 * The plan is only worth writing if it gets checked, and everything needed to
 * check it is already recorded — workout logs, meal statuses, weigh-ins, habit
 * ticks, course hours. This turns those into one scorecard per season so the next
 * season's intent can be written with the last one's result in front of you.
 *
 * An in-flight season is scored on the days that have actually elapsed, never the
 * whole window: judging four weeks of work against twelve weeks of plan would
 * read as failure every time.
 */

/** A score row. `habits` sits alongside the pillars — it cuts across all of them. */
export type ScoreKey = LifePillar | 'habits'

export interface PillarScore {
    key: ScoreKey
    /** 0–100, or null when there was nothing to score. */
    score: number | null
    /** The number behind the score, in words. */
    headline: string
    detail?: string
}

export interface SeasonScorecard {
    startDate: string
    endDate: string
    /** Days of the season that have happened — what the scores are computed over. */
    elapsedDays: number
    totalDays: number
    /** True once the whole season is in the past. */
    complete: boolean
    scores: PillarScore[]
}

/** The first day of a YYYY-MM month. */
export function monthStartDate(month: string): string {
    return `${month}-01`
}

/** The last day of a YYYY-MM month. */
export function monthEndDate(month: string): string {
    const [year, m] = month.split('-').map(Number)
    return `${month}-${String(daysInMonth(year, m - 1)).padStart(2, '0')}`
}

/** Whole days elapsed between two dates — 28 for the 1st to the 29th. */
function daysBetween(start: string, end: string): number {
    const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)
    if (Number.isNaN(ms) || ms < 0) return 0
    return Math.round(ms / 86_400_000)
}

/**
 * Whole days from `start` to `end` inclusive — the size of a window, so a
 * single-day season counts as one day rather than none.
 */
function dayCount(start: string, end: string): number {
    return daysBetween(start, end) + 1
}

function inRange(date: string, start: string, end: string): boolean {
    return date >= start && date <= end
}

/** A percentage, clamped and rounded — never above 100 for over-delivery. */
function pct(done: number, planned: number): number {
    if (planned <= 0) return 0
    return Math.min(100, Math.round((done / planned) * 100))
}

/** The dated things a scorecard is computed from. All arrays may be empty. */
export interface ReviewInput {
    season: Season
    /** Today, so an in-flight season is only scored on elapsed days. */
    today: string
    /** Planned training placed on the planner. */
    fitnessEntries: { date: string; kind: FitnessPlanKind }[]
    workoutLogs: { date: string }[]
    conditioningLogs: { date: string }[]
    mealEntries: { date: string; status: EntryStatus }[]
    weightLogs: { date: string; weight: number }[]
    habitLogs: { date: string; completed: boolean }[]
    /** How many habits were being tracked — the denominator for consistency. */
    habitCount: number
    /** Only the records the season links; an unlinked one isn't this season's business. */
    courses: Course[]
    savingsTargets: SavingsTarget[]
    nutritionPhases: NutritionPhase[]
}

/**
 * Training: planned hard sessions against sessions actually logged.
 *
 * Mobility and recovery are left out of the denominator for the same reason
 * `overload.ts` leaves them out of a slot's load — they're what you pair a hard
 * session with, not the thing being asked of you.
 */
function scoreTraining(input: ReviewInput, start: string, end: string): PillarScore {
    const planned = input.fitnessEntries.filter(
        (e) => inRange(e.date, start, end) && (e.kind === 'workout' || e.kind === 'conditioning')
    ).length
    const done =
        input.workoutLogs.filter((l) => inRange(l.date, start, end)).length +
        input.conditioningLogs.filter((l) => inRange(l.date, start, end)).length

    if (planned === 0) {
        return {
            key: 'training',
            score: null,
            headline: done > 0 ? `${done} sessions logged, none planned` : 'Nothing planned or logged',
        }
    }
    return {
        key: 'training',
        score: pct(done, planned),
        headline: `${done} of ${planned} planned sessions done`,
    }
}

/**
 * Nutrition: how much of the plan was actually eaten, plus whether bodyweight
 * moved the way the phase asked it to.
 */
function scoreNutrition(input: ReviewInput, start: string, end: string): PillarScore {
    const entries = input.mealEntries.filter((e) => inRange(e.date, start, end))
    const eaten = entries.filter((e) => e.status === 'eaten').length

    const weights = input.weightLogs
        .filter((w) => inRange(w.date, start, end))
        .sort((a, b) => a.date.localeCompare(b.date))

    let detail: string | undefined
    if (weights.length >= 2) {
        const change = weights[weights.length - 1].weight - weights[0].weight
        const phase = input.nutritionPhases[0]
        // A rate is change over elapsed time, so this is the span between the two
        // weigh-ins, not an inclusive day count: the 1st to the 29th is four weeks.
        const weeks = daysBetween(weights[0].date, weights[weights.length - 1].date) / 7
        const expected =
            phase && typeof phase.weeklyRate === 'number' ? phase.weeklyRate * weeks : undefined
        const moved = `${change > 0 ? '+' : ''}${change.toFixed(1)} kg`
        detail =
            expected !== undefined
                ? `${moved} against a ${expected > 0 ? '+' : ''}${expected.toFixed(1)} kg target`
                : `${moved} over the season`
    }

    if (entries.length === 0) {
        return { key: 'nutrition', score: null, headline: 'No meals planned', detail }
    }
    return {
        key: 'nutrition',
        score: pct(eaten, entries.length),
        headline: `${eaten} of ${entries.length} planned meals eaten`,
        detail,
    }
}

/**
 * Money: whether the season's savings targets are keeping up.
 *
 * `onTrack` is the server's own verdict on a target, so this reports it rather
 * than recomputing a second opinion that could disagree with the Forecast screen.
 */
function scoreMoney(input: ReviewInput): PillarScore {
    const targets = input.savingsTargets
    if (targets.length === 0) {
        return { key: 'money', score: null, headline: 'No savings targets linked' }
    }
    const onTrack = targets.filter((t) => t.onTrack).length
    return {
        key: 'money',
        score: pct(onTrack, targets.length),
        headline: `${onTrack} of ${targets.length} targets on track`,
        detail: `£${Math.round(targets.reduce((sum, t) => sum + t.requiredMonthly, 0)).toLocaleString()}/mo committed`,
    }
}

/** Study: hours banked against hours required, across the season's courses. */
function scoreStudy(input: ReviewInput): PillarScore {
    const courses = input.courses
    if (courses.length === 0) {
        return { key: 'study', score: null, headline: 'No courses linked' }
    }
    const required = courses.reduce((sum, c) => sum + c.requiredHours, 0)
    const done = courses.reduce((sum, c) => sum + c.completedHours, 0)
    if (required === 0) {
        return { key: 'study', score: null, headline: `${done}h logged, no target set` }
    }
    return {
        key: 'study',
        score: pct(done, required),
        headline: `${done} of ${required} hours done`,
    }
}

/** Habits: ticks landed against ticks available over the elapsed days. */
function scoreHabits(input: ReviewInput, elapsedDays: number): PillarScore {
    if (input.habitCount === 0 || elapsedDays === 0) {
        return { key: 'habits', score: null, headline: 'No habits tracked' }
    }
    const available = input.habitCount * elapsedDays
    const done = input.habitLogs.filter((l) => l.completed).length
    return {
        key: 'habits',
        score: pct(done, available),
        headline: `${done} of ${available} habit days`,
    }
}

/**
 * Score a season across every pillar.
 *
 * Rows with nothing to measure come back with a null score rather than a zero:
 * "no meals were planned" and "no meals were eaten" are different facts, and
 * showing the first as 0% would read as a failure that never happened.
 */
export function buildScorecard(input: ReviewInput): SeasonScorecard {
    const startDate = monthStartDate(input.season.startMonth)
    const fullEnd = monthEndDate(input.season.endMonth)
    // Score only what has happened; an unfinished season is measured to today.
    const end = input.today < fullEnd ? input.today : fullEnd
    const totalDays = dayCount(startDate, fullEnd)
    const elapsedDays = input.today < startDate ? 0 : dayCount(startDate, end)

    return {
        startDate,
        endDate: fullEnd,
        elapsedDays,
        totalDays,
        complete: input.today > fullEnd,
        scores: [
            scoreTraining(input, startDate, end),
            scoreNutrition(input, startDate, end),
            scoreMoney(input),
            scoreStudy(input),
            scoreHabits(input, elapsedDays),
        ],
    }
}

/** The average of the rows that could be scored, or null when none could. */
export function overallScore(card: SeasonScorecard): number | null {
    const scored = card.scores.filter((s): s is PillarScore & { score: number } => s.score !== null)
    if (scored.length === 0) return null
    return Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)
}
