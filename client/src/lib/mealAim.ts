import type { BoxPart, MacroGoals, Macros, MealType } from '../types'
import { MEAL_TYPES } from '../types'

/**
 * What a meal should aim for. The day's targets are shared out as three meals
 * and a snack; what the rest of the day already holds is taken off first, so
 * a big breakfast leaves a smaller lunch. A batch is split into portions that
 * land closest to one meal's share.
 */

/** How the day is shared out: three even meals and a snack a third the size. */
export const SLOT_SHARE: Record<MealType, number> = { breakfast: 3, lunch: 3, dinner: 3, snack: 1 }

const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

const SHARE_TOTAL = MEAL_TYPES.reduce((a, s) => a + SLOT_SHARE[s], 0)

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

/** An entry as the budget sees it; an away note (eating out) counts as its slot's share. */
export type BudgetEntry = { slot: MealType; macros: Macros; away?: boolean }

/** A slot's usual share of the day's targets. Null with no targets. */
export function mealSize(
    goals: MacroGoals | null | undefined,
    slot: MealType
): { size: Macros; keys: (keyof Macros)[] } | null {
    const keys = KEYS.filter((k) => (goals?.[k] ?? 0) > 0)
    if (!goals || keys.length === 0) return null
    const size = { ...ZERO }
    for (const k of keys) size[k] = ((goals[k] ?? 0) * SLOT_SHARE[slot]) / SHARE_TOTAL
    return { size, keys }
}

/**
 * What this slot should aim for: the day's targets less what's in the other
 * slots, split between this slot and the ones still empty, less what's
 * already in this slot. Null with no targets. Macros without a target are 0
 * and left out of `keys`.
 *
 * An away slot (at an event) counts as its usual share eaten, so the meals
 * left in the day aren't asked to make up for it. `size` is the slot's usual
 * share of the day — what a miss is measured against.
 */
export function slotBudget(
    goals: MacroGoals | null | undefined,
    slot: MealType,
    entries: BudgetEntry[]
): { budget: Macros; size: Macros; keys: (keyof Macros)[] } | null {
    const usual = mealSize(goals, slot)
    if (!goals || !usual) return null
    const { size, keys } = usual

    // Away slots as their usual share; one away note per slot is enough.
    const awaySlots = new Set(entries.filter((e) => e.away).map((e) => e.slot))
    entries = [
        ...entries.filter((e) => !e.away),
        ...[...awaySlots].map((s) => ({ slot: s, macros: mealSize(goals, s)!.size })),
    ]

    const sum = (list: { macros: Macros }[]) =>
        list.reduce(
            (acc, e) => {
                for (const k of KEYS) acc[k] += e.macros[k] || 0
                return acc
            },
            { ...ZERO }
        )

    const elsewhere = entries.filter((e) => e.slot !== slot)
    const here = sum(entries.filter((e) => e.slot === slot))
    const filled = new Set(elsewhere.map((e) => e.slot))
    const open = MEAL_TYPES.filter((s) => s === slot || !filled.has(s))
    const share = SLOT_SHARE[slot] / open.reduce((a, s) => a + SLOT_SHARE[s], 0)

    const used = sum(elsewhere)
    const budget = { ...ZERO }
    for (const k of keys) {
        const left = Math.max(0, (goals[k] ?? 0) - used[k])
        budget[k] = Math.max(0, left * share - here[k])
    }
    return { budget, size, keys }
}

/**
 * How big a miss on each macro is, as a fraction: of what's left for the slot,
 * or of its usual share (`size`) when less is left — so a target already met
 * doesn't make every gram over it count many times its size.
 */
function missScale(budget: Macros, size: Macros | undefined, k: keyof Macros): number {
    return 1 / Math.max(budget[k], size?.[k] ?? 0, k === 'calories' ? 50 : 5)
}

/**
 * How much a miss costs, short of the target and over it. Calories and
 * protein matter most; falling short on fat barely counts, since lean meals
 * can't make it up.
 */
const FIT_WEIGHT: Record<keyof Macros, { under: number; over: number }> = {
    calories: { under: 3, over: 3 },
    protein: { under: 3, over: 2 },
    carbs: { under: 1, over: 1 },
    fat: { under: 0.25, over: 1 },
}

/** How far a meal is from the aim — 0 is spot on. */
export function fitCost(
    macros: Macros,
    budget: Macros,
    keys: (keyof Macros)[],
    size?: Macros
): number {
    return keys.reduce((a, k) => {
        const miss = ((macros[k] || 0) - budget[k]) * missScale(budget, size, k)
        return a + (miss < 0 ? FIT_WEIGHT[k].under : FIT_WEIGHT[k].over) * miss * miss
    }, 0)
}

// ─── Batches ────────────────────────────────────────────────────────────────────

/** One thing in a batch: raw grams, at its packet's figures per 100 g. */
export type BatchIngredient = { grams: number; per100: Macros }

/** Everything in the batch added up. */
export function batchTotal(ingredients: BatchIngredient[]): Macros {
    const total = { ...ZERO }
    for (const i of ingredients)
        for (const k of KEYS) total[k] += ((i.per100[k] || 0) * (i.grams || 0)) / 100
    return total
}

/** One portion of `total` split `portions` ways, to whole kcal and grams. */
export function perPortion(total: Macros, portions: number): Macros {
    const n = Math.max(1, Math.round(portions))
    const out = { ...ZERO }
    for (const k of KEYS) out[k] = Math.round(total[k] / n)
    return out
}

/** The most portions a batch is ever split into. */
export const MAX_PORTIONS = 20

/**
 * How many portions bring each one closest to a meal's share. Null with no
 * targets or an empty batch.
 */
export function suggestPortions(
    total: Macros,
    aim: { size: Macros; keys: (keyof Macros)[] } | null
): number | null {
    if (!aim || total.calories <= 0) return null
    let best = 1
    let bestCost = Infinity
    for (let n = 1; n <= MAX_PORTIONS; n++) {
        const portion = { ...ZERO }
        for (const k of KEYS) portion[k] = total[k] / n
        const cost = fitCost(portion, aim.size, aim.keys, aim.size)
        if (cost < bestCost) {
            best = n
            bestCost = cost
        }
    }
    return best
}

/**
 * Roast chicken and veg come out of the oven at about 70% of their raw
 * weight. Only used to guess a box's share of the tray until it's weighed.
 */
export const COOKED_YIELD = 0.7

const to5 = (g: number) => Math.round(g / 5) * 5

/**
 * What to weigh into each box: a share of the tray, plus each thing kept
 * apart (cooked rice) as entered. The tray's share comes from its cooked
 * weight, or — not weighed — an estimate from the raw grams.
 */
export function boxParts(
    ingredients: { name: string; grams: number; apart?: boolean }[],
    boxes: number,
    cookedGrams: number | null
): BoxPart[] {
    const n = Math.max(1, Math.round(boxes))
    const tray = ingredients.filter((i) => !i.apart).reduce((a, i) => a + i.grams, 0)
    const parts: BoxPart[] = []
    if (tray > 0)
        parts.push(
            cookedGrams && cookedGrams > 0
                ? { name: 'Tray, cooked', grams: to5(cookedGrams / n) }
                : { name: 'Tray, cooked', grams: to5((tray * COOKED_YIELD) / n), approx: true }
        )
    for (const i of ingredients)
        if (i.apart && i.grams > 0) parts.push({ name: i.name, grams: to5(i.grams / n) })
    return parts.filter((p) => p.grams > 0)
}

/** One box's share of everything cooked together, to the whole gram. */
export function potShare(cookedGrams: number, portions: number): number {
    const n = Math.max(1, Math.round(portions))
    return cookedGrams > 0 ? Math.round(cookedGrams / n) : 0
}

/** Starchy sides usually cooked in their own pot and weighed out apart from the main. */
const SIDE = /\b(rice|pasta|potato(es)?|couscous|noodles?|quinoa|bulgur|orzo|spaghetti|penne|fusilli|gnocchi)\b/i

/** True for an ingredient that's a side (rice, pasta, potatoes), not part of the main. */
export const isSide = (name: string) => SIDE.test(name)
