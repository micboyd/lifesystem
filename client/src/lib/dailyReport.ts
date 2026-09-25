import { addDays } from './calendar'
import { sumEatenMacros } from './nutrition'
import { effectiveTargetsFor } from './nutritionTargets'
import type {
    ConditioningLog,
    FitnessPlanEntry,
    HabitDef,
    HabitLog,
    MacroGoals,
    Macros,
    MealPlanEntry,
    MobilityLog,
    NutritionPhase,
    NutritionPhaseKind,
    RecoveryLog,
    StarlingSpendItem,
    Task,
    WeightLog,
    WorkoutLog,
} from '../types'

/**
 * The daily report: one day read back across money, training, habits, tasks,
 * food and weight, with the day's wins and misses picked out.
 *
 * Nothing is stored. A report is rebuilt from the records every time it's
 * opened, so a gym session logged at 11pm or a transaction that settles the
 * next morning is simply in it — there's no snapshot to fall out of date.
 *
 * Training reads only what was *logged*. The planner appears once, and only to
 * name a session that was planned and never logged.
 */

// ── When the dashboard banner shows ───────────────────────────────────────────

/** The banner arrives at 9pm… */
export const REPORT_START_HOUR = 21
/** …and stays until noon the next day. */
export const REPORT_END_HOUR = 12

/** A local Date → YYYY-MM-DD. */
function localKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Which day's report the dashboard banner should offer at `now`, or null
 * outside the window. From 9pm it's today's; after midnight and until noon
 * it's still yesterday's — the day being reported on is the one just lived.
 */
export function bannerReportDate(now: Date): string | null {
    const h = now.getHours()
    if (h >= REPORT_START_HOUR) return localKey(now)
    if (h < REPORT_END_HOUR) return addDays(localKey(now), -1)
    return null
}

// ── Inputs ────────────────────────────────────────────────────────────────────

export type SpendSource =
    | { status: 'ok'; items: StarlingSpendItem[]; from: string }
    | { status: 'unavailable'; message: string }

/** Everything a range of reports is built from, fetched once for the range. */
export interface ReportInputs {
    spend: SpendSource
    workouts: WorkoutLog[]
    conditioning: ConditioningLog[]
    mobility: MobilityLog[]
    recovery: RecoveryLog[]
    habits: HabitDef[]
    habitLogs: HabitLog[]
    tasks: Task[]
    meals: MealPlanEntry[]
    phases: NutritionPhase[]
    settingsGoals?: MacroGoals | null
    fitnessPlan: FitnessPlanEntry[]
    weights: WeightLog[]
}

// ── Output ────────────────────────────────────────────────────────────────────

export interface SpendCategory {
    key: string
    label: string
    icon: string
    total: number
    count: number
}

export interface ReportMoney {
    total: number
    count: number
    categories: SpendCategory[]
    /** Where the most went, by merchant. */
    topMerchants: { name: string; total: number; count: number }[]
    largest: StarlingSpendItem | null
    /** Average daily spend over the week before, when there's enough history. */
    weekAverage: number | null
    items: StarlingSpendItem[]
}

export type SessionKind = 'strength' | 'conditioning' | 'mobility' | 'recovery'

export interface ReportSession {
    id: string
    kind: SessionKind
    name: string
    minutes: number | null
    /** One line of detail — "5 exercises · 18 sets · 6,420 kg", "HIIT · RPE 8". */
    detail: string
}

export interface ReportTraining {
    sessions: ReportSession[]
    minutes: number
    /** Planned in the planner but never logged. */
    missed: string[]
}

export interface ReportHabits {
    done: HabitDef[]
    missed: HabitDef[]
}

export interface ReportTasks {
    done: Task[]
    open: Task[]
}

export interface ReportNutrition {
    eaten: Macros
    mealsEaten: number
    /** Planned and never marked either way. */
    mealsUnmarked: number
    goals: MacroGoals | null
    phaseKind: NutritionPhaseKind | null
}

export interface ReportWeight {
    kg: number
    /** Change since the previous weigh-in, and how many days back that was. */
    change: number | null
    sinceDays: number | null
}

export type NoteArea = 'money' | 'training' | 'habits' | 'tasks' | 'food' | 'weight'

export interface ReportNote {
    area: NoteArea
    text: string
}

export interface DailyReport {
    date: string
    /** Null when spending couldn't be read, with the reason alongside. */
    money: ReportMoney | null
    moneyError: string | null
    training: ReportTraining
    habits: ReportHabits
    tasks: ReportTasks
    nutrition: ReportNutrition | null
    weight: ReportWeight | null
    wins: ReportNote[]
    misses: ReportNote[]
    /** Whether anything at all was recorded — an empty day reads differently. */
    empty: boolean
}

// ── Money ─────────────────────────────────────────────────────────────────────

/** Starling's spending categories that deserve their own icon. */
const CATEGORY_ICONS: Record<string, string> = {
    GROCERIES: 'fa-basket-shopping',
    EATING_OUT: 'fa-utensils',
    TRANSPORT: 'fa-train-subway',
    TRAVEL: 'fa-plane',
    ENTERTAINMENT: 'fa-ticket',
    SHOPPING: 'fa-bag-shopping',
    BILLS_AND_SERVICES: 'fa-file-invoice',
    LIFESTYLE: 'fa-spa',
    HOME: 'fa-house',
    HOLIDAYS: 'fa-umbrella-beach',
    GIFTS: 'fa-gift',
    PETS: 'fa-paw',
    FAMILY: 'fa-people-roof',
    CHARITY: 'fa-hand-holding-heart',
    COFFEE: 'fa-mug-hot',
    GAMBLING: 'fa-dice',
    SAVING: 'fa-piggy-bank',
    PAYMENTS: 'fa-money-bill-transfer',
    INCOME: 'fa-sterling-sign',
}

/** "EATING_OUT" → "Eating out"; nothing → "Other". */
export function categoryLabel(key: string | null): string {
    if (!key || key === 'NONE' || key === 'GENERAL' || key === 'OTHER') return 'Other'
    const words = key
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\band\b/g, '&')
    return words.charAt(0).toUpperCase() + words.slice(1)
}

function categoryKey(key: string | null): string {
    return !key || key === 'NONE' || key === 'GENERAL' || key === 'OTHER' ? 'OTHER' : key
}

const round2 = (n: number) => Math.round(n * 100) / 100

function buildMoney(date: string, spend: Extract<SpendSource, { status: 'ok' }>): ReportMoney {
    const items = spend.items.filter((t) => t.date === date)
    const total = round2(items.reduce((s, t) => s + t.amount, 0))

    const byCategory = new Map<string, SpendCategory>()
    const byMerchant = new Map<string, { name: string; total: number; count: number }>()
    for (const t of items) {
        const key = categoryKey(t.category)
        const cat = byCategory.get(key) ?? {
            key,
            label: categoryLabel(t.category),
            icon: CATEGORY_ICONS[key] ?? 'fa-receipt',
            total: 0,
            count: 0,
        }
        cat.total = round2(cat.total + t.amount)
        cat.count++
        byCategory.set(key, cat)

        const name = t.merchant ?? 'Unknown'
        const m = byMerchant.get(name) ?? { name, total: 0, count: 0 }
        m.total = round2(m.total + t.amount)
        m.count++
        byMerchant.set(name, m)
    }

    // The week before, counting a day with nothing spent as £0 — but only the
    // days the fetch actually covered, so a report at the edge of the range
    // isn't compared against days that were never looked at.
    let covered = 0
    let weekTotal = 0
    for (let i = 1; i <= 7; i++) {
        const d = addDays(date, -i)
        if (d < spend.from) break
        covered++
        weekTotal += spend.items.filter((t) => t.date === d).reduce((s, t) => s + t.amount, 0)
    }

    return {
        total,
        count: items.length,
        categories: [...byCategory.values()].sort((a, b) => b.total - a.total),
        topMerchants: [...byMerchant.values()].sort((a, b) => b.total - a.total).slice(0, 3),
        largest: items.reduce<StarlingSpendItem | null>(
            (big, t) => (!big || t.amount > big.amount ? t : big),
            null
        ),
        weekAverage: covered >= 3 ? round2(weekTotal / covered) : null,
        items,
    }
}

// ── Training ──────────────────────────────────────────────────────────────────

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function strengthDetail(log: WorkoutLog): string {
    const sets = log.exercises.flatMap((e) => e.loggedSets ?? [])
    const volume = sets.reduce((s, x) => s + (x.weight ?? 0) * (x.reps ?? 0), 0)
    const parts = [plural(log.exercises.length, 'exercise')]
    if (sets.length > 0) parts.push(plural(sets.length, 'set'))
    if (volume > 0) parts.push(`${Math.round(volume).toLocaleString('en-GB')} kg lifted`)
    return parts.join(' · ')
}

function buildTraining(date: string, inputs: ReportInputs): ReportTraining {
    const on = <T extends { date: string }>(xs: T[]) => xs.filter((x) => x.date === date)

    const sessions: ReportSession[] = [
        ...on(inputs.workouts).map((l) => ({
            id: l._id,
            kind: 'strength' as const,
            name: l.name,
            minutes: l.durationMin ?? null,
            detail: strengthDetail(l),
        })),
        ...on(inputs.conditioning).map((l) => ({
            id: l._id,
            kind: 'conditioning' as const,
            name: l.name,
            minutes: l.duration || null,
            detail: [l.category, l.rpe ? `RPE ${l.rpe}` : null].filter(Boolean).join(' · '),
        })),
        ...on(inputs.mobility).map((l) => ({
            id: l._id,
            kind: 'mobility' as const,
            name: l.name,
            minutes: l.duration || null,
            detail: 'Mobility',
        })),
        ...on(inputs.recovery).map((l) => ({
            id: l._id,
            kind: 'recovery' as const,
            name: l.name,
            minutes: l.duration || null,
            detail: 'Recovery',
        })),
    ]

    // The same done-rule the planner uses: a log of that library item on that day.
    const logged = new Set<string>([
        ...on(inputs.workouts).map((l) => `workout:${l.workout}`),
        ...on(inputs.conditioning).map((l) => `conditioning:${l.session}`),
        ...on(inputs.mobility).map((l) => `mobility:${l.mobility}`),
        ...on(inputs.recovery).map((l) => `recovery:${l.recovery}`),
    ])
    const missed = on(inputs.fitnessPlan).flatMap((e) => {
        const item =
            e.kind === 'workout'
                ? e.workout
                : e.kind === 'conditioning'
                  ? e.session
                  : e.kind === 'mobility'
                    ? e.mobility
                    : e.recovery
        if (!item || logged.has(`${e.kind}:${item._id}`)) return []
        return [item.name]
    })

    return {
        sessions,
        minutes: sessions.reduce((s, x) => s + (x.minutes ?? 0), 0),
        missed,
    }
}

// ── Habits, tasks, food, weight ───────────────────────────────────────────────

function buildHabits(date: string, inputs: ReportInputs): ReportHabits {
    const doneIds = new Set(
        inputs.habitLogs.filter((l) => l.date === date && l.completed).map((l) => l.habit)
    )
    // A habit started after this day can't have been missed on it.
    const eligible = inputs.habits
        .filter((h) => h.active && h.createdAt.slice(0, 10) <= date)
        .sort((a, b) => a.order - b.order)
    return {
        done: eligible.filter((h) => doneIds.has(h._id)),
        missed: eligible.filter((h) => !doneIds.has(h._id)),
    }
}

function buildNutrition(date: string, inputs: ReportInputs): ReportNutrition | null {
    const entries = inputs.meals.filter((e) => e.date === date)
    if (entries.length === 0) return null
    const targets = effectiveTargetsFor(
        date,
        inputs.phases,
        inputs.settingsGoals,
        inputs.fitnessPlan
    )
    return {
        eaten: sumEatenMacros(entries),
        mealsEaten: entries.filter((e) => e.status === 'eaten').length,
        mealsUnmarked: entries.filter((e) => e.status === 'planned').length,
        goals: targets.goals,
        phaseKind: targets.phase?.kind ?? null,
    }
}

function daysBetween(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function buildWeight(date: string, weights: WeightLog[]): ReportWeight | null {
    const today = weights.find((w) => w.date === date)
    if (!today) return null
    const prev = weights
        .filter((w) => w.date < date)
        .reduce<WeightLog | null>((best, w) => (!best || w.date > best.date ? w : best), null)
    return {
        kg: today.weight,
        change: prev ? Math.round((today.weight - prev.weight) * 10) / 10 : null,
        sinceDays: prev ? daysBetween(prev.date, date) : null,
    }
}

// ── Wins and misses ───────────────────────────────────────────────────────────

/** How far off a calorie target still counts as on it. */
const CALORIE_TOLERANCE = 0.1
/** Protein at or above this share of target is a win… */
const PROTEIN_HIT = 0.9
/** …and below this share is worth calling out. */
const PROTEIN_SHORT = 0.8
/** A day this far above the week's average spend gets a mention. */
const SPEND_SPIKE = 1.5
/** …as long as it's above this in pounds — £4 against a £2 average isn't news. */
const SPEND_SPIKE_MIN = 15

function judge(r: Omit<DailyReport, 'wins' | 'misses' | 'empty'>) {
    const wins: ReportNote[] = []
    const misses: ReportNote[] = []
    const kg = (n: number) => `${Math.round(n)}`

    // Training
    const { sessions, missed } = r.training
    if (sessions.length > 0) {
        const mins = r.training.minutes > 0 ? ` — ${r.training.minutes} min` : ''
        wins.push({
            area: 'training',
            text:
                sessions.length === 1
                    ? `Trained: ${sessions[0].name}${mins}`
                    : `${sessions.length} sessions logged${mins}`,
        })
    }
    if (missed.length > 0) {
        misses.push({
            area: 'training',
            text: `Planned but not logged: ${missed.join(', ')}`,
        })
    }

    // Habits
    const habitTotal = r.habits.done.length + r.habits.missed.length
    if (habitTotal > 0) {
        if (r.habits.missed.length === 0) {
            wins.push({ area: 'habits', text: `Every habit done (${habitTotal}/${habitTotal})` })
        } else {
            if (r.habits.done.length > 0) {
                wins.push({
                    area: 'habits',
                    text: `${r.habits.done.length}/${habitTotal} habits done`,
                })
            }
            misses.push({
                area: 'habits',
                text: `Missed ${r.habits.missed.map((h) => h.name).join(', ')}`,
            })
        }
    }

    // Tasks
    const taskTotal = r.tasks.done.length + r.tasks.open.length
    if (taskTotal > 0) {
        if (r.tasks.open.length === 0) {
            wins.push({ area: 'tasks', text: `Cleared all ${plural(taskTotal, 'task')}` })
        } else {
            if (r.tasks.done.length > 0) {
                wins.push({ area: 'tasks', text: `${r.tasks.done.length}/${taskTotal} tasks done` })
            }
            misses.push({
                area: 'tasks',
                text: `${plural(r.tasks.open.length, 'task')} left open`,
            })
        }
    }

    // Food
    const n = r.nutrition
    if (n) {
        if (n.mealsEaten === 0) {
            misses.push({ area: 'food', text: 'No meals marked as eaten' })
        } else if (n.goals?.calories) {
            const target = n.goals.calories
            const diff = n.eaten.calories - target
            const off = Math.abs(diff) / target
            if (off <= CALORIE_TOLERANCE) {
                wins.push({
                    area: 'food',
                    text: `Calories on target (${kg(n.eaten.calories)} kcal)`,
                })
            } else if (diff > 0 && n.phaseKind !== 'gain') {
                misses.push({ area: 'food', text: `${kg(diff)} kcal over target` })
            } else if (diff < 0 && n.phaseKind === 'gain') {
                misses.push({ area: 'food', text: `${kg(-diff)} kcal short of a bulk target` })
            } else if (diff < 0) {
                wins.push({ area: 'food', text: `${kg(-diff)} kcal under target` })
            }
        }
        if (n.mealsEaten > 0 && n.goals?.protein) {
            const share = n.eaten.protein / n.goals.protein
            if (share >= PROTEIN_HIT) {
                wins.push({ area: 'food', text: `Protein hit (${kg(n.eaten.protein)} g)` })
            } else if (share < PROTEIN_SHORT) {
                misses.push({
                    area: 'food',
                    text: `Protein short by ${kg(n.goals.protein - n.eaten.protein)} g`,
                })
            }
        }
    }

    // Weight
    if (r.weight) wins.push({ area: 'weight', text: `Weighed in at ${r.weight.kg} kg` })

    // Money — the figure is shown either way; only the extremes are judged.
    const m = r.money
    if (m) {
        if (m.count === 0) {
            wins.push({ area: 'money', text: 'No-spend day' })
        } else if (
            m.weekAverage !== null &&
            m.total >= SPEND_SPIKE_MIN &&
            m.total > m.weekAverage * SPEND_SPIKE
        ) {
            misses.push({
                area: 'money',
                text: `Spending well above your recent daily average`,
            })
        }
    }

    return { wins, misses }
}

// ── Build ─────────────────────────────────────────────────────────────────────

export function buildDailyReport(date: string, inputs: ReportInputs): DailyReport {
    const tasks = inputs.tasks.filter((t) => t.date === date)
    const base = {
        date,
        money: inputs.spend.status === 'ok' ? buildMoney(date, inputs.spend) : null,
        moneyError: inputs.spend.status === 'ok' ? null : inputs.spend.message,
        training: buildTraining(date, inputs),
        habits: buildHabits(date, inputs),
        tasks: { done: tasks.filter((t) => t.completed), open: tasks.filter((t) => !t.completed) },
        nutrition: buildNutrition(date, inputs),
        weight: buildWeight(date, inputs.weights),
    }
    const { wins, misses } = judge(base)
    const empty =
        (base.money?.count ?? 0) === 0 &&
        base.training.sessions.length === 0 &&
        base.habits.done.length === 0 &&
        tasks.length === 0 &&
        (base.nutrition?.mealsEaten ?? 0) === 0 &&
        !base.weight
    return { ...base, wins, misses, empty }
}

/**
 * One line that sums the day up, for the banner and the list. Plain rather
 * than cheery: it reads the same whether the day went well or not.
 */
export function reportHeadline(r: DailyReport): string {
    if (r.empty) return 'Nothing recorded for this day yet.'
    const w = r.wins.length
    const m = r.misses.length
    if (m === 0) return 'A clean day — nothing slipped.'
    if (w >= m * 2) return 'A strong day, with a couple of loose ends.'
    if (w >= m) return 'A mixed day — some wins, some misses.'
    return 'A tougher day. Tomorrow is a reset.'
}
