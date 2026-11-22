import type { MacroGoals, Macros, Meal, MealType, MenuItem } from '../types'
import { MEAL_TYPES } from '../types'
import { fitCost, slotBudget, ZERO } from './mealAim'

/**
 * A nutrition plan's meal week: seven days of library meals that repeat across
 * the plan. This fills the empty slots with meals that land each day on the
 * plan's macros, with some variety, and favours finishing a tray once one is
 * started — a tray of five boxes is five lunches, not one.
 *
 * Pure: meals and targets in, a new menu out. 0 = Monday … 6 = Sunday.
 */

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const

/** The slots every day gets a meal in. A snack is only added when the day needs one. */
const MAIN_SLOTS: MealType[] = ['breakfast', 'lunch', 'dinner']

const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

/** How much each earlier use of a single meal costs, so a week isn't one dish. */
const REPEAT_COST = 0.3
/** A single meal more than this many times a week costs extra. A tray goes up to its boxes. */
const SINGLE_CAP = 3
/** Batch style: a single meal is cooked for this many portions. */
export const BATCH_PORTIONS = 4
/** Going past a meal's cap: only worth it when nothing else fits the slot. */
const OVER_CAP = 1.5
/** The pull towards finishing a tray already started. */
const TRAY_PULL = 0.2
/** How much a shuffle can move a meal's score — enough to swap near-ties, not to pick a bad fit. */
const JITTER = 0.15

function add(a: Macros, b: Macros): Macros {
    return {
        calories: a.calories + (b.calories || 0),
        protein: a.protein + (b.protein || 0),
        carbs: a.carbs + (b.carbs || 0),
        fat: a.fat + (b.fat || 0),
    }
}

/** What one day of the week adds up to. Meals no longer in the library count as nothing. */
export function dayTotal(menu: MenuItem[], day: number, byId: Map<string, Meal>): Macros {
    return menu
        .filter((m) => m.day === day)
        .reduce((acc, m) => add(acc, byId.get(m.meal)?.macros ?? ZERO), { ...ZERO })
}

/** The average day across the week, counting only days with something on them. */
export function weekAverage(menu: MenuItem[], byId: Map<string, Meal>): Macros | null {
    const days = [...new Set(menu.map((m) => m.day))]
    if (days.length === 0) return null
    const total = days.reduce((acc, d) => add(acc, dayTotal(menu, d, byId)), { ...ZERO })
    const out = { ...ZERO }
    for (const k of KEYS) out[k] = total[k] / days.length
    return out
}

/** Whether a meal suits a slot: it's tagged for it, or untagged (then any main meal). */
export function suits(meal: Meal, slot: MealType): boolean {
    return meal.types.length === 0 ? slot !== 'snack' : meal.types.includes(slot)
}

/** Uses of each meal across the menu. */
function usesOf(menu: MenuItem[]): Map<string, number> {
    const uses = new Map<string, number>()
    for (const m of menu) uses.set(m.meal, (uses.get(m.meal) ?? 0) + 1)
    return uses
}

/** A small seeded random, so the same seed fills the same way and a new one shuffles. */
function rng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export interface Ranked {
    meal: Meal
    /** 0 is spot on; variety is folded in. */
    cost: number
    /** How many times it's already in the week. */
    uses: number
}

/**
 * Library meals for one slot of one day, best fit first. Fit is against what
 * the rest of that day leaves for the slot; repeats cost a little, a started
 * tray pulls a little, past its weekly cap costs a lot (a small library still
 * fills the week), and anything already that day is left out. `ignore` is a menu item to pretend isn't there (the one being swapped).
 */
export function rankForSlot(
    menu: MenuItem[],
    day: number,
    slot: MealType,
    meals: Meal[],
    goals: MacroGoals | null,
    byId: Map<string, Meal>,
    opts: { ignore?: MenuItem; random?: () => number; anySlot?: boolean; batch?: boolean } = {}
): Ranked[] {
    const rest = opts.ignore ? menu.filter((m) => m !== opts.ignore) : menu
    const today = rest.filter((m) => m.day === day)
    const onDay = new Set(today.map((m) => m.meal))
    const uses = usesOf(rest)
    const entries = today.flatMap((m) => {
        const meal = byId.get(m.meal)
        return meal ? [{ slot: m.slot, macros: meal.macros }] : []
    })
    const aim = slotBudget(goals, slot, entries)

    const out: Ranked[] = []
    for (const meal of meals) {
        if ((!opts.anySlot && !suits(meal, slot)) || onDay.has(meal._id)) continue
        const used = uses.get(meal._id) ?? 0
        let cost = aim ? fitCost(meal.macros, aim.budget, aim.keys, aim.size) : 0
        // In batch style a single meal behaves like a tray of a few: cook once, eat it a few days.
        const tray = (meal.batchOf && meal.batchOf > 1) || opts.batch
        const cap = meal.batchOf && meal.batchOf > 1 ? meal.batchOf : opts.batch ? BATCH_PORTIONS : SINGLE_CAP
        if (used >= cap) cost += OVER_CAP
        else if (tray) cost += used > 0 ? -TRAY_PULL : 0
        else cost += REPEAT_COST * used
        if (opts.random) cost += opts.random() * JITTER
        out.push({ meal, cost, uses: used })
    }
    return out.sort((a, b) => a.cost - b.cost)
}

/**
 * Fill the empty slots of the week. Breakfast, lunch and dinner get the best
 * fit going; a snack is added only when it brings the day closer to target
 * than leaving it out. Meals already in the week stay where they are, and the
 * week is filled Monday first so a tray started on Monday runs on.
 *
 * `days` limits it to some days; `seed` shuffles near-ties so filling again
 * gives a different week. `batch` favours cooking fewer meals in bigger
 * batches: each one runs on for a few days instead of changing every day.
 */
export function fillMenu(
    menu: MenuItem[],
    meals: Meal[],
    goals: MacroGoals | null,
    opts: { days?: number[]; seed?: number; batch?: boolean } = {}
): MenuItem[] {
    const byId = new Map(meals.map((m) => [m._id, m]))
    const random = opts.seed === undefined ? undefined : rng(opts.seed)
    const days = opts.days ?? [0, 1, 2, 3, 4, 5, 6]
    let out = [...menu]

    for (const day of days) {
        for (const slot of MAIN_SLOTS) {
            if (out.some((m) => m.day === day && m.slot === slot)) continue
            const best = rankForSlot(out, day, slot, meals, goals, byId, { random, batch: opts.batch })[0]
            if (best) out = [...out, { day, slot, meal: best.meal._id }]
        }
        if (!out.some((m) => m.day === day && m.slot === 'snack') && goals) {
            const best = rankForSlot(out, day, 'snack', meals, goals, byId, { random, batch: opts.batch })[0]
            if (best && best.cost < emptyCost(out, day, goals, byId)) out = [...out, { day, slot: 'snack', meal: best.meal._id }]
        }
    }
    return sortMenu(out)
}

/** What leaving the snack slot empty costs: how far the day is from target without one. */
function emptyCost(menu: MenuItem[], day: number, goals: MacroGoals, byId: Map<string, Meal>): number {
    const entries = menu
        .filter((m) => m.day === day)
        .flatMap((m) => {
            const meal = byId.get(m.meal)
            return meal ? [{ slot: m.slot, macros: meal.macros }] : []
        })
    const aim = slotBudget(goals, 'snack', entries)
    return aim ? fitCost(ZERO, aim.budget, aim.keys, aim.size) : 0
}

/** Day, then slot of the day; items within a slot keep their order. */
export function sortMenu(menu: MenuItem[]): MenuItem[] {
    return menu
        .map((m, i) => ({ m, i }))
        .sort((a, b) => a.m.day - b.m.day || MEAL_TYPES.indexOf(a.m.slot) - MEAL_TYPES.indexOf(b.m.slot) || a.i - b.i)
        .map(({ m }) => m)
}

/** Everything on one day, copied onto each of `to`, replacing what they had. */
export function copyDay(menu: MenuItem[], from: number, to: number[]): MenuItem[] {
    const source = menu.filter((m) => m.day === from)
    const targets = new Set(to.filter((d) => d !== from))
    return sortMenu([
        ...menu.filter((m) => !targets.has(m.day)),
        ...[...targets].flatMap((day) => source.map((m) => ({ ...m, day }))),
    ])
}

/** How a day's figure sits against its target: near enough, short, or over. */
export type Gap = 'on' | 'under' | 'over' | 'none'

/** Within 7% (or a small floor) counts as on target. */
export function gapOf(value: number, target: number | undefined, key: keyof Macros): Gap {
    if (!target || target <= 0) return 'none'
    const slack = Math.max(target * 0.07, key === 'calories' ? 75 : 6)
    if (value < target - slack) return 'under'
    if (value > target + slack) return 'over'
    return 'on'
}

export interface CookLine {
    meal: Meal
    /** Portions the week eats. */
    portions: number
    /** Trays to cook for a tray meal, else null. */
    trays: number | null
    /** Boxes left over from those trays. */
    spare: number
}

/** What the week needs cooking: each meal, how many portions, and whole trays for tray meals. */
export function cookList(menu: MenuItem[], byId: Map<string, Meal>): CookLine[] {
    const lines: CookLine[] = []
    for (const [id, portions] of usesOf(menu)) {
        const meal = byId.get(id)
        if (!meal) continue
        const tray = meal.batchOf && meal.batchOf > 1 ? meal.batchOf : null
        const trays = tray ? Math.ceil(portions / tray) : null
        lines.push({ meal, portions, trays, spare: tray && trays ? trays * tray - portions : 0 })
    }
    return lines.sort((a, b) => b.portions - a.portions || a.meal.name.localeCompare(b.meal.name))
}
