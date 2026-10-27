import type {
    ConditioningLog,
    DailyEnergy,
    FitnessPlanEntry,
    MacroGoals,
    MealPlanEntry,
    NutritionPhaseKind,
    WeightLog,
    WorkoutLog,
} from '../types'
import { addDays } from './calendar'
import { targetVerdict } from './energy'
import { sumEatenMacros } from './nutrition'
import { TARGET_BAND, WEIGH_IN_HABIT_DAYS } from './yourDay'
import { daysBetween } from './weightTrend'

/**
 * Consistency: how closely the plan is being followed, as plain numbers.
 * Training (planned sessions done), nutrition (calories on target, protein
 * hit, planned meals eaten) and body (weighed in), each a percentage, and one
 * overall score from the three.
 *
 * Built from the records, never stored. The rules follow the rest of the app:
 * - A session is done when it's logged that day, or a day either side —
 *   sessions get shuffled — and each log settles one session (as the
 *   Timeline measures it). A skipped session isn't done.
 * - Calories are judged the way the planner judges them (lib/energy.ts
 *   targetVerdict); protein is hit from 95% (lib/yourDay.ts TARGET_BAND).
 *   A day with nothing ticked eaten is "not logged" and counts as a miss.
 *   A day with an away note isn't judged on calories or protein.
 * - Weigh-ins are kept up when there's at least one a week: a day counts
 *   when there's been a weigh-in in the 7 days up to it. They're due once
 *   there's been one in the 30 days before (as on Your day).
 * - Today counts what's already done; nothing today is a miss until it's
 *   over. Calories wait for the day to end, since they can still go over.
 *
 * Pure.
 */

export type AreaKey = 'training' | 'nutrition' | 'body'

/** How much each area weighs in the overall score. A weigh-in is a quick tick; training and food are the work. */
export const AREA_WEIGHTS: Record<AreaKey, number> = { training: 0.4, nutrition: 0.4, body: 0.2 }

/** A day's weigh-in is kept up with one this many days back, the day itself included. */
export const WEIGH_IN_EVERY_DAYS = 7

/** Score bands: from `good` it's on track, from `fair` it's close. */
export const SCORE_BANDS = { good: 80, fair: 60 } as const

/** done of `of`, and the share as a whole percentage — null when there's nothing to count. */
export interface Ratio {
    done: number
    of: number
    pct: number | null
}

export type CalorieDay = 'on' | 'over' | 'under' | 'unlogged'
export type ProteinDay = 'hit' | 'short' | 'unlogged'

/** One day, read against the plan. A null check wasn't due that day. */
export interface DayRecord {
    date: string
    sessions: {
        /** Planned sessions that count: done, skipped or missed. Today's still-to-do ones don't. */
        due: number
        done: number
        skipped: number
        missed: number
        strength: { due: number; done: number }
        conditioning: { due: number; done: number }
    }
    /** Logged sessions that settled nothing on the plan. */
    extra: number
    /** Meals planned in a slot (not extras, not away notes) that count, and those ticked eaten. */
    meals: { due: number; eaten: number }
    /** "Also ate" entries — food off the plan. */
    extras: number
    calories: CalorieDay | null
    protein: ProteinDay | null
    /** What was eaten and the target, on a day judged on calories. */
    intake: { calories: number; protein: number; target: MacroGoals } | null
    /** Done: a weigh-in in the week up to this day. */
    weighIn: 'done' | 'missed' | null
    /** Eaten minus calories out, on a finished day with both. */
    balance: number | null
}

export interface ConsistencyInputs {
    /** First day counted, YYYY-MM-DD. */
    from: string
    today: string
    /** The fitness planner's entries over the range. */
    training: FitnessPlanEntry[]
    /** Logs over the range plus a day either side. */
    workoutLogs: WorkoutLog[]
    conditioningLogs: ConditioningLog[]
    /** The meal plan over the range. */
    meals: MealPlanEntry[]
    /** The day's targets and the phase kind that colours them. */
    targetsOn: (date: string) => { goals: MacroGoals | null; kind: NutritionPhaseKind | null }
    /** Weigh-ins from at least 30 days before `from`. */
    weightLogs: WeightLog[]
    energy: DailyEnergy[]
}

export interface Consistency {
    /** The weighted mean of the area scores there's anything to score; null with none. */
    overall: number | null
    training: {
        score: number | null
        sessions: Ratio
        strength: Ratio
        conditioning: Ratio
        skipped: number
        missed: number
        extra: number
    }
    nutrition: {
        score: number | null
        calories: Ratio & { over: number; under: number; unlogged: number }
        protein: Ratio & { unlogged: number }
        meals: Ratio
        extras: number
        /** The average judged day: eaten against target. */
        average: { calories: number; target: number; protein: number; proteinTarget: number | null } | null
        /** The average balance over finished days with calories out. */
        balance: { kcal: number; days: number } | null
    }
    body: {
        score: number | null
        weighIns: Ratio
    }
    /** Finished days with training or food to do where every check due was met. */
    perfectDays: Ratio
}

export function ratio(done: number, of: number): Ratio {
    return { done, of, pct: of > 0 ? Math.round((done / of) * 100) : null }
}

/** The mean of the percentages there are, rounded; null with none. */
function meanPct(values: (number | null)[]): number | null {
    const have = values.filter((v): v is number => v !== null)
    return have.length ? Math.round(have.reduce((a, b) => a + b, 0) / have.length) : null
}

/** The overall score: each area by its weight, over the areas that have a score. */
export function overallScore(scores: Record<AreaKey, number | null>): number | null {
    let sum = 0
    let weight = 0
    for (const key of Object.keys(AREA_WEIGHTS) as AreaKey[]) {
        const s = scores[key]
        if (s === null) continue
        sum += s * AREA_WEIGHTS[key]
        weight += AREA_WEIGHTS[key]
    }
    return weight > 0 ? Math.round(sum / weight) : null
}

export type ScoreBand = 'good' | 'fair' | 'low'

export function scoreBand(score: number): ScoreBand {
    return score >= SCORE_BANDS.good ? 'good' : score >= SCORE_BANDS.fair ? 'fair' : 'low'
}

function days(from: string, to: string): string[] {
    const out: string[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
    return out
}

/**
 * Which planned sessions were done: each log settles one session of the same
 * workout or conditioning session, on its day first, then the day after, then
 * the day before. Returns the settled entry ids and the logs left over.
 */
function settleSessions(
    entries: FitnessPlanEntry[],
    workoutLogs: WorkoutLog[],
    conditioningLogs: ConditioningLog[]
): { done: Set<string>; leftover: { date: string }[] } {
    const free = new Map<string, { date: string; used: boolean }[]>()
    const add = (kind: string, item: string | null, date: string) => {
        const key = `${kind}|${item ?? ''}`
        free.set(key, [...(free.get(key) ?? []), { date, used: false }])
    }
    for (const l of workoutLogs) add('workout', l.workout, l.date)
    for (const l of conditioningLogs) add('conditioning', l.session, l.date)

    const done = new Set<string>()
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
    // Same-day matches first across the whole range, so a shuffled session can't
    // take the log another session was done on.
    for (const offsets of [[0], [1, -1]]) {
        for (const e of sorted) {
            if (done.has(e._id)) continue
            const item = e.kind === 'workout' ? e.workout?._id : e.session?._id
            if (!item) continue
            const logs = free.get(`${e.kind}|${item}`)
            if (!logs) continue
            for (const off of offsets) {
                const log = logs.find((l) => !l.used && l.date === addDays(e.date, off))
                if (log) {
                    log.used = true
                    done.add(e._id)
                    break
                }
            }
        }
    }
    const leftover = [...free.values()].flat().filter((l) => !l.used)
    return { done, leftover }
}

/** Each day from `from` to `today`, read against the plan. */
export function dayRecords(inputs: ConsistencyInputs): DayRecord[] {
    const { from, today } = inputs
    const inRange = (d: string) => d >= from && d <= today
    const training = inputs.training.filter((e) => inRange(e.date))
    const { done, leftover } = settleSessions(training, inputs.workoutLogs, inputs.conditioningLogs)

    const mealsByDate = new Map<string, MealPlanEntry[]>()
    for (const m of inputs.meals) {
        if (!inRange(m.date)) continue
        mealsByDate.set(m.date, [...(mealsByDate.get(m.date) ?? []), m])
    }
    // Food is judged from the first day anything was on the meal plan: before
    // that there was no tracking to be consistent with.
    const firstMeal = [...mealsByDate.keys()].sort()[0] ?? null

    const outByDate = new Map(inputs.energy.map((e) => [e.date, e.caloriesOut]))
    const weighDates = inputs.weightLogs.map((l) => l.date)

    return days(from, today).map((date) => {
        const isToday = date === today

        // Training.
        const planned = training.filter((e) => e.date === date)
        const sessions = {
            due: 0,
            done: 0,
            skipped: 0,
            missed: 0,
            strength: { due: 0, done: 0 },
            conditioning: { due: 0, done: 0 },
        }
        for (const e of planned) {
            const isDone = done.has(e._id)
            // Today's still to do: not due yet.
            if (isToday && !isDone && !e.skipped) continue
            const kind = e.kind === 'workout' ? sessions.strength : sessions.conditioning
            sessions.due += 1
            kind.due += 1
            if (isDone) {
                sessions.done += 1
                kind.done += 1
            } else if (e.skipped) sessions.skipped += 1
            else sessions.missed += 1
        }
        const extra = leftover.filter((l) => l.date === date).length

        // Meals.
        const entries = mealsByDate.get(date) ?? []
        const inSlots = entries.filter((m) => !m.extra && !m.away)
        const eatenInSlots = inSlots.filter((m) => m.status === 'eaten').length
        const meals = { due: isToday ? eatenInSlots : inSlots.length, eaten: eatenInSlots }
        const extras = entries.filter((m) => m.extra).length

        let calories: CalorieDay | null = null
        let protein: ProteinDay | null = null
        let intake: DayRecord['intake'] = null
        let balance: number | null = null
        const tracking = firstMeal !== null && date >= firstMeal
        const away = entries.some((m) => m.away)
        const { goals, kind } = inputs.targetsOn(date)
        const eaten = sumEatenMacros(entries)
        const logged = entries.some((m) => m.status === 'eaten')
        if (tracking && !away && goals) {
            if (goals.calories && !isToday) {
                if (!logged) calories = 'unlogged'
                else {
                    const verdict = targetVerdict(eaten.calories, goals.calories, kind)
                    calories = verdict === 'good' ? 'on' : eaten.calories > goals.calories ? 'over' : 'under'
                    intake = { calories: eaten.calories, protein: eaten.protein, target: goals }
                }
            }
            if (goals.protein) {
                const hit = eaten.protein >= goals.protein * (1 - TARGET_BAND)
                if (hit) protein = 'hit'
                else if (!isToday) protein = logged ? 'short' : 'unlogged'
            }
        }
        const out = outByDate.get(date)
        if (!isToday && logged && out) balance = eaten.calories - out

        // Weigh-in: one in the week up to today keeps it up; today can still bring one.
        let weighIn: DayRecord['weighIn'] = null
        if (weighDates.some((d) => d <= date && daysBetween(d, date) < WEIGH_IN_EVERY_DAYS)) weighIn = 'done'
        else if (!isToday && weighDates.some((d) => d < date && daysBetween(d, date) <= WEIGH_IN_HABIT_DAYS))
            weighIn = 'missed'

        return { date, sessions, extra, meals, extras, calories, protein, intake, weighIn, balance }
    })
}

/** A day with training or food to do. A weigh-in kept up alone doesn't make one. */
function hasWork(d: DayRecord): boolean {
    return d.sessions.due > 0 || d.meals.due > 0 || d.calories !== null || d.protein !== null
}

/** Whether every check due on a day was met. */
function isPerfect(d: DayRecord): boolean {
    return (
        d.sessions.done === d.sessions.due &&
        d.meals.eaten === d.meals.due &&
        (d.calories === null || d.calories === 'on') &&
        (d.protein === null || d.protein === 'hit') &&
        d.weighIn !== 'missed'
    )
}

/** The scores over a run of day records. */
export function summarise(records: DayRecord[], today: string): Consistency {
    const sum = (f: (d: DayRecord) => number) => records.reduce((s, d) => s + f(d), 0)
    const count = (f: (d: DayRecord) => boolean) => records.filter(f).length

    const sessions = ratio(sum((d) => d.sessions.done), sum((d) => d.sessions.due))
    const training = {
        score: sessions.pct,
        sessions,
        strength: ratio(sum((d) => d.sessions.strength.done), sum((d) => d.sessions.strength.due)),
        conditioning: ratio(sum((d) => d.sessions.conditioning.done), sum((d) => d.sessions.conditioning.due)),
        skipped: sum((d) => d.sessions.skipped),
        missed: sum((d) => d.sessions.missed),
        extra: sum((d) => d.extra),
    }

    const calories = {
        ...ratio(count((d) => d.calories === 'on'), count((d) => d.calories !== null)),
        over: count((d) => d.calories === 'over'),
        under: count((d) => d.calories === 'under'),
        unlogged: count((d) => d.calories === 'unlogged'),
    }
    const protein = {
        ...ratio(count((d) => d.protein === 'hit'), count((d) => d.protein !== null)),
        unlogged: count((d) => d.protein === 'unlogged'),
    }
    const meals = ratio(sum((d) => d.meals.eaten), sum((d) => d.meals.due))

    const judged = records.filter((d) => d.intake)
    const proteinTargets = judged.map((d) => d.intake!.target.protein ?? 0).filter((p) => p > 0)
    const average = judged.length
        ? {
              calories: Math.round(judged.reduce((s, d) => s + d.intake!.calories, 0) / judged.length),
              target: Math.round(judged.reduce((s, d) => s + (d.intake!.target.calories ?? 0), 0) / judged.length),
              protein: Math.round(judged.reduce((s, d) => s + d.intake!.protein, 0) / judged.length),
              proteinTarget:
                  proteinTargets.length === judged.length
                      ? Math.round(proteinTargets.reduce((a, b) => a + b, 0) / proteinTargets.length)
                      : null,
          }
        : null
    const balances = records.map((d) => d.balance).filter((b): b is number => b !== null)
    const balance = balances.length
        ? { kcal: Math.round(balances.reduce((a, b) => a + b, 0) / balances.length), days: balances.length }
        : null

    const nutrition = {
        score: meanPct([calories.pct, protein.pct, meals.pct]),
        calories,
        protein,
        meals,
        extras: sum((d) => d.extras),
        average,
        balance,
    }

    const weighIns = ratio(count((d) => d.weighIn === 'done'), count((d) => d.weighIn !== null))
    const body = { score: weighIns.pct, weighIns }

    const due = records.filter((d) => d.date < today && hasWork(d))

    return {
        overall: overallScore({ training: training.score, nutrition: nutrition.score, body: body.score }),
        training,
        nutrition,
        body,
        perfectDays: ratio(due.filter(isPerfect).length, due.length),
    }
}

export interface WeekScore {
    /** Monday, YYYY-MM-DD. */
    start: string
    /** Still under way. */
    current: boolean
    overall: number | null
    training: number | null
    nutrition: number | null
    body: number | null
}

/** The Monday of the week a date falls in. */
export function mondayOf(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
    return addDays(date, dow === 0 ? -6 : 1 - dow)
}

/** The same scores a Monday-to-Sunday week at a time, newest first. */
export function weekScores(records: DayRecord[], today: string, weeks: number): WeekScore[] {
    const thisMonday = mondayOf(today)
    const out: WeekScore[] = []
    for (let i = 0; i < weeks; i++) {
        const start = addDays(thisMonday, -7 * i)
        const end = addDays(start, 6)
        const week = records.filter((d) => d.date >= start && d.date <= end)
        if (week.length === 0) break
        const s = summarise(week, today)
        out.push({
            start,
            current: i === 0,
            overall: s.overall,
            training: s.training.score,
            nutrition: s.nutrition.score,
            body: s.body.score,
        })
    }
    return out
}
