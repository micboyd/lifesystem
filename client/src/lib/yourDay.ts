import type {
    FitnessPlanEntry,
    HabitDef,
    MacroGoals,
    Macros,
    MealPlanEntry,
    MealType,
    PerfectDaySelection,
    WeightLog,
} from '../types'
import { daysBetween } from './weightTrend'
import { countsOn, habitKey, isChosen, isSkippedMeal, mealKey } from './perfectDay'

/**
 * Your day: everything that makes today a perfect one, in the order it
 * happens. Training, meals, a weigh-in, the day's targets and habits, each
 * done or still to do, with the events around them for context — and the one
 * thing to do next.
 *
 * Built from the records, never stored: a session is done when it's logged,
 * a meal when it's ticked eaten, a habit when it's ticked. What counts, and on
 * which weekdays, is the user's choice (lib/perfectDay.ts).
 */

export type DayPart = 'morning' | 'afternoon' | 'evening'

export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening']

export type StepKind = 'weigh' | 'training' | 'rest' | 'meal' | 'plan-meals' | 'event' | 'calories' | 'protein' | 'habit'

/**
 * - todo: still to do.
 * - done: done.
 * - handled: deliberately not happening — a skipped session, away for a meal. No longer a task.
 * - over: calories past the target, the one step that can go wrong.
 * - info: context, never a task (an event, a rest day).
 */
export type StepState = 'todo' | 'done' | 'handled' | 'over' | 'info'

export interface DayStep {
    id: string
    kind: StepKind
    /** When in the day; null for what runs all day (targets, snacks, any-time habits). */
    part: DayPart | null
    title: string
    detail: string | null
    state: StepState
    /** A timed event's start, "15:00". */
    time?: string
    /** A habit's id, to tick it. */
    habitId?: string
}

export interface YourDay {
    steps: DayStep[]
    /** Tasks done, out of `total` — everything but handled and info steps. */
    done: number
    total: number
    /** The one thing to do next. Today only. */
    next: DayStep | null
    perfect: boolean
    /** Which part of the day it is now. Today only. */
    nowPart: DayPart | null
}

export interface YourDayInputs {
    date: string
    today: string
    /** Minutes since midnight, now. */
    nowMin: number
    training: FitnessPlanEntry[]
    /** `kind:libraryId` for each session logged on the date. */
    logged: Set<string>
    meals: MealPlanEntry[]
    goals: MacroGoals | null
    eaten: Macros
    habits: HabitDef[]
    /** Ids of the habits ticked on the date. */
    habitsDone: Set<string>
    weightLogs: WeightLog[]
    /** The weigh-in trend's weekly rate, kg — shown beside the weigh-in. */
    weightRate?: number | null
    events: { id: string; title: string; part: DayPart | null; time?: string }[]
    /** What counts towards a perfect day; absent, everything does. */
    selection?: PerfectDaySelection
}

/** Where each part of the day ends, in minutes since midnight. */
const PART_ENDS: Record<Exclude<DayPart, 'evening'>, number> = { morning: 12 * 60, afternoon: 17 * 60 }

/** Snacks have no part of the day — they sit with the any-time things, not as a fixed meal. */
const SLOTS: { slot: MealType; label: string; part: DayPart | null }[] = [
    { slot: 'breakfast', label: 'Breakfast', part: 'morning' },
    { slot: 'lunch', label: 'Lunch', part: 'afternoon' },
    { slot: 'snack', label: 'Snack', part: null },
    { slot: 'dinner', label: 'Dinner', part: 'evening' },
]

/** A weigh-in only becomes part of the day for someone who weighs in: one in the last month. */
export const WEIGH_IN_HABIT_DAYS = 30

/**
 * The leeway on a target, as a share of it: calories are on target within it
 * either side, protein is hit from that far under. Not an exact science.
 * Protein has no ceiling — eating more of it is never a miss.
 */
export const TARGET_BAND = 0.05

/** Within a part of the day: the weigh-in first, then training, meals, habits, events. */
const RANK: Record<StepKind, number> = {
    weigh: 0,
    training: 1,
    meal: 2,
    habit: 3,
    event: 4,
    'plan-meals': 5,
    protein: 6,
    calories: 7,
    rest: 8,
}

export function partAt(minutes: number): DayPart {
    if (minutes < PART_ENDS.morning) return 'morning'
    if (minutes < PART_ENDS.afternoon) return 'afternoon'
    return 'evening'
}

/** The done-key a session's log matches, as the planner reads it. */
export function sessionKey(kind: FitnessPlanEntry['kind'], libraryId: string): string {
    return `${kind}:${libraryId}`
}

function kcal(n: number): string {
    return Math.round(n).toLocaleString('en-GB')
}

function trainingSteps(entries: FitnessPlanEntry[], logged: Set<string>, counts: (key: string) => boolean): DayStep[] {
    if (entries.length === 0)
        return counts('rest')
            ? [{ id: 'rest', kind: 'rest', part: null, title: 'Rest day', detail: 'Recover well.', state: 'info' }]
            : []
    if (!counts('training')) return []
    return [...entries]
        .sort((a, b) => DAY_PARTS.indexOf(a.part) - DAY_PARTS.indexOf(b.part) || a.order - b.order)
        .map((e) => {
            const lib = e.kind === 'workout' ? e.workout : e.session
            const done = !!lib && logged.has(sessionKey(e.kind, lib._id))
            let detail: string | null = null
            if (e.kind === 'workout' && e.workout) {
                const n = e.workout.main.length
                detail = `Strength · ${n} ${n === 1 ? 'exercise' : 'exercises'}`
            } else if (e.session) {
                detail = [e.session.category, e.session.duration ? `${e.session.duration} min` : null]
                    .filter(Boolean)
                    .join(' · ')
            }
            if (!done && e.skipped) detail = e.skipReason ? `Skipped · ${e.skipReason}` : 'Skipped'
            return {
                id: `training-${e._id}`,
                kind: 'training' as const,
                part: e.part,
                title: lib?.name ?? 'Untitled session',
                detail,
                state: done ? 'done' : e.skipped ? 'handled' : 'todo',
            }
        })
}

/** "Chicken box + Rice" for a plate, as the planner shows it; the meal's name otherwise. */
function mealName(m: MealPlanEntry): string {
    return m.plate?.length ? m.plate.map((l) => l.name).join(' + ') : m.name
}

/**
 * A step per meal, not per slot — each one ticks off on its own in the
 * planner, so it does here too. Two things at lunch are two lunch steps.
 */
function mealSteps(
    meals: MealPlanEntry[],
    date: string,
    today: string,
    counts: (key: string) => boolean,
    selection: PerfectDaySelection | undefined
): DayStep[] {
    const steps: DayStep[] = []
    for (const { slot, label, part } of SLOTS) {
        if (!counts(mealKey(slot))) continue
        // A flat white with breakfast is food, not a task.
        for (const m of meals.filter((e) => e.slot === slot && !isSkippedMeal(selection, e))) {
            // A box note has no amounts yet, so it adds no figure.
            const amount = m.box ? 'from the box' : m.macros.calories > 0 ? `${kcal(m.macros.calories)} kcal` : null
            steps.push({
                id: `meal-${m._id}`,
                kind: 'meal',
                part,
                title: label,
                detail: m.away ? `Away · ${m.name}` : [mealName(m), amount].filter(Boolean).join(' · '),
                state: m.away ? 'handled' : m.status === 'eaten' ? 'done' : 'todo',
            })
        }
    }
    // Only when nothing at all is planned — skipped foods still mean the day's been thought about.
    if (meals.length === 0 && date >= today && counts('plan-meals'))
        steps.push({
            id: 'plan-meals',
            kind: 'plan-meals',
            part: null,
            title: 'Plan the day’s meals',
            detail: 'Nothing planned yet.',
            state: 'todo',
        })
    return steps
}

/** "−0.68 kg/wk", with a real minus sign. */
function rateText(rate: number): string {
    return `${rate < 0 ? '−' : '+'}${Math.abs(rate).toFixed(2)} kg/wk`
}

function weighStep(
    logs: WeightLog[],
    date: string,
    rate: number | null | undefined,
    counts: (key: string) => boolean,
    chosen: boolean
): DayStep[] {
    if (!counts('weigh')) return []
    const on = logs.find((l) => l.date === date)
    // Chosen days are a commitment; left alone, it only shows for someone who weighs in.
    const weighs = chosen || logs.some((l) => l.date < date && daysBetween(l.date, date) <= WEIGH_IN_HABIT_DAYS)
    if (!on && !weighs) return []
    return [
        {
            id: 'weigh',
            kind: 'weigh',
            part: 'morning',
            title: 'Weigh in',
            detail: on
                ? [`${on.weight.toFixed(1)} kg`, rate != null ? rateText(rate) : null].filter(Boolean).join(' · ')
                : 'First thing, before breakfast.',
            state: on ? 'done' : 'todo',
        },
    ]
}

function targetSteps(goals: MacroGoals | null, eaten: Macros, counts: (key: string) => boolean): DayStep[] {
    const steps: DayStep[] = []
    const protein = goals?.protein ?? 0
    if (protein > 0 && counts('protein')) {
        const left = Math.max(0, Math.round(protein - eaten.protein))
        steps.push({
            id: 'protein',
            kind: 'protein',
            part: null,
            title: `${Math.round(protein)} g protein`,
            detail: left > 0 ? `${Math.round(eaten.protein)} g so far · ${left} g to go` : `${Math.round(eaten.protein)} g · hit`,
            state: eaten.protein >= protein * (1 - TARGET_BAND) ? 'done' : 'todo',
        })
    }
    const calories = goals?.calories ?? 0
    if (calories > 0 && counts('calories')) {
        const over = eaten.calories > calories * (1 + TARGET_BAND)
        const onTarget = !over && eaten.calories >= calories * (1 - TARGET_BAND)
        steps.push({
            id: 'calories',
            kind: 'calories',
            part: null,
            title: `${kcal(calories)} kcal`,
            detail: over
                ? `${kcal(eaten.calories - calories)} kcal over`
                : onTarget
                  ? `${kcal(eaten.calories)} eaten · on target`
                  : `${kcal(eaten.calories)} eaten · ${kcal(calories - eaten.calories)} left`,
            state: over ? 'over' : onTarget ? 'done' : 'todo',
        })
    }
    return steps
}

/** The next thing to do: now, then later today, then anything missed earlier, then all day. */
function pickNext(steps: DayStep[], now: DayPart): DayStep | null {
    const todo = steps.filter((s) => s.state === 'todo' && s.kind !== 'calories')
    const at = (s: DayStep) => (s.part ? DAY_PARTS.indexOf(s.part) : -1)
    const nowIndex = DAY_PARTS.indexOf(now)
    return (
        todo.find((s) => at(s) === nowIndex) ??
        todo.find((s) => at(s) > nowIndex) ??
        todo.find((s) => s.part !== null) ??
        todo.find((s) => s.part === null) ??
        null
    )
}

export function yourDay(inputs: YourDayInputs): YourDay {
    const { date, today, selection } = inputs
    const [y, mo, dd] = date.split('-').map(Number)
    const weekday = new Date(y, mo - 1, dd).getDay()
    const counts = (key: string) => countsOn(selection, key, weekday)

    const habits: DayStep[] = inputs.habits.filter((h) => counts(habitKey(h._id))).map((h) => ({
        id: `habit-${h._id}`,
        kind: 'habit',
        part: h.part ?? null,
        title: h.name,
        detail: null,
        state: inputs.habitsDone.has(h._id) ? 'done' : 'todo',
        habitId: h._id,
    }))
    const events: DayStep[] = (counts('events') ? inputs.events : []).map((e) => ({
        id: `event-${e.id}`,
        kind: 'event',
        part: e.part,
        title: e.title,
        detail: e.time ?? null,
        state: 'info',
        time: e.time,
    }))

    const steps = [
        ...weighStep(inputs.weightLogs, date, inputs.weightRate, counts, isChosen(selection, 'weigh')),
        ...trainingSteps(inputs.training, inputs.logged, counts),
        ...mealSteps(inputs.meals, date, today, counts, selection),
        ...events,
        ...targetSteps(inputs.goals, inputs.eaten, counts),
        ...habits,
    ]
        .map((s, i) => ({ s, i }))
        .sort(
            (a, b) =>
                (a.s.part ? DAY_PARTS.indexOf(a.s.part) : DAY_PARTS.length) -
                    (b.s.part ? DAY_PARTS.indexOf(b.s.part) : DAY_PARTS.length) ||
                RANK[a.s.kind] - RANK[b.s.kind] ||
                (a.s.time ?? '').localeCompare(b.s.time ?? '') ||
                a.i - b.i
        )
        .map(({ s }) => s)

    const tasks = steps.filter((s) => s.state === 'todo' || s.state === 'done' || s.state === 'over')
    const done = tasks.filter((s) => s.state === 'done').length
    const isToday = date === today
    const nowPart = isToday ? partAt(inputs.nowMin) : null

    return {
        steps,
        done,
        total: tasks.length,
        next: nowPart ? pickNext(steps, nowPart) : null,
        perfect: tasks.length > 0 && done === tasks.length,
        nowPart,
    }
}
