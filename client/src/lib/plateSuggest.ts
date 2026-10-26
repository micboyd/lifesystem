import type { MacroGoals, Macros, MealType } from '../types'
import { MEAL_TYPES } from '../types'
import { lineMacros, plateTotal, scale, ZERO } from './plates'

/**
 * Suggested grams for a plate. The day's targets are shared out as three meals
 * and a snack; what the rest of the day already holds is taken off first, so
 * a big breakfast leaves a smaller lunch. Then the grams of each food on the
 * plate are fitted to that slot's share.
 */

/** How the day is shared out: three even meals and a snack a third the size. */
export const SLOT_SHARE: Record<MealType, number> = { breakfast: 3, lunch: 3, dinner: 3, snack: 1 }

const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

const SHARE_TOTAL = MEAL_TYPES.reduce((a, s) => a + SLOT_SHARE[s], 0)

/** An entry as the budget sees it: an away note (eating out) or a box note (no amounts yet). */
export type BudgetEntry = { slot: MealType; macros: Macros; away?: boolean; box?: string }

/**
 * What this slot should aim for: the day's targets less what's in the other
 * slots, split between this slot and the ones still empty, less what's
 * already in this slot. Null with no targets. Macros without a target are 0
 * and left out of `keys`.
 *
 * An away slot (at an event) counts as its usual share eaten, so the meals
 * left in the day aren't asked to make up for it. A box note in this slot is
 * what's being filled, so it doesn't count as already there. `size` is the
 * slot's usual share of the day — what a miss is measured against.
 */
export function slotBudget(
    goals: MacroGoals | null | undefined,
    slot: MealType,
    entries: BudgetEntry[]
): { budget: Macros; size: Macros; keys: (keyof Macros)[] } | null {
    const keys = KEYS.filter((k) => (goals?.[k] ?? 0) > 0)
    if (!goals || keys.length === 0) return null

    const size = { ...ZERO }
    for (const k of keys) size[k] = ((goals[k] ?? 0) * SLOT_SHARE[slot]) / SHARE_TOTAL
    // Away slots as their usual share; one away note per slot is enough.
    const awaySlots = new Set(entries.filter((e) => e.away).map((e) => e.slot))
    entries = [
        ...entries.filter((e) => !e.away && !(e.box && e.slot === slot)),
        ...[...awaySlots].map((s) => {
            const macros = { ...ZERO }
            for (const k of keys) macros[k] = ((goals[k] ?? 0) * SLOT_SHARE[s]) / SHARE_TOTAL
            return { slot: s, macros }
        }),
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
 * How much a miss costs, short of the target and over it. Calories are the
 * aim: the solver all but has to land on them. Protein matters most among the
 * rest, either way. Carbs and fat then pick the mix of foods, and falling
 * short on fat barely counts — lean foods can't make it up, so the calories
 * it leaves are shared between protein and carbs rather than piled on one.
 * Each miss is measured as a fraction of its target, so grams of fat and
 * hundreds of kcal weigh the same.
 *
 * (Weighing them all alike let an unreachable target — 53 g fat from rice and
 * a lean box — drag the calories down to half the aim. Letting protein go
 * over for free piled on the box: 93 g against 57.)
 */
const WEIGHT: Record<keyof Macros, { under: number; over: number }> = {
    calories: { under: 400, over: 400 },
    protein: { under: 3, over: 3 },
    carbs: { under: 1, over: 1 },
    fat: { under: 0.25, over: 1 },
}

export type SuggestLine = {
    per100: Macros
    /** Grams already typed in — kept as they are. */
    fixed?: number | null
    /** Grams left in the batch; the suggestion won't go over it. */
    max?: number | null
}

/**
 * How big a miss on each macro is, as a fraction: of what's left for the slot,
 * or of its usual share (`size`) when less is left. Measured against the
 * leftover alone, a target already met made every gram over it count as a
 * miss many times its size — 50 g of protein past a used-up target outweighed
 * 800 kcal short, and dinner shrank to a spoonful.
 */
function missScale(budget: Macros, size: Macros | undefined, k: keyof Macros): number {
    return 1 / Math.max(budget[k], size?.[k] ?? 0, k === 'calories' ? 50 : 5)
}

/**
 * Grams for each line that best hit `budget` (weighted least squares, see
 * WEIGHT; never below 0 or over what's left), rounded to 5 g. Fixed lines
 * come back as typed. A food with nothing in it gets 0. `size` is the slot's
 * usual share (from slotBudget) — see missScale.
 */
export function suggestGrams(
    lines: SuggestLine[],
    budget: Macros,
    keys: (keyof Macros)[],
    size?: Macros
): number[] {
    const free = lines.map((_, i) => i).filter((i) => lines[i].fixed == null)
    const grams = lines.map((l) => l.fixed ?? 0)
    if (free.length === 0 || keys.length === 0) return grams

    // What the free lines still have to cover, with the fixed ones counted.
    const target = { ...budget }
    for (const l of lines) {
        if (l.fixed == null) continue
        const m = lineMacros(l.fixed, l.per100)
        for (const k of keys) target[k] -= m[k]
    }

    // Scale each macro by its target so they're comparable (see missScale).
    const scale = (k: keyof Macros) => missScale(budget, size, k)
    const A = keys.map((k) => free.map((i) => (lines[i].per100[k] / 100) * scale(k)))
    const b = keys.map((k) => target[k] * scale(k))
    const w = (r: number, miss: number) => (miss < 0 ? WEIGHT[keys[r]].under : WEIGHT[keys[r]].over)
    const cost = (res: number[]) => res.reduce((a, v, r) => a + w(r, v) * v * v, 0)

    // Coordinate descent with bounds. Along one food the cost is a convex
    // piecewise quadratic, breaking where a macro crosses its target. Its best
    // grams are a breakpoint, a bound, or the minimum of one of the pieces —
    // try them all and keep the cheapest.
    const x = free.map(() => 0)
    const upper = free.map((i) => lines[i].max ?? Infinity)
    const res = b.map((v) => -v) // A·x − b, with x = 0
    for (let iter = 0; iter < 300; iter++) {
        let moved = 0
        for (let j = 0; j < free.length; j++) {
            // Residual with this food taken out.
            const rest = res.map((v, r) => v - A[r][j] * x[j])
            const along = (t: number) => rest.map((v, r) => v + A[r][j] * t)
            const rows = A.map((_, r) => r).filter((r) => A[r][j] !== 0)
            const breaks = rows.map((r) => -rest[r] / A[r][j])
            const candidates = [0, ...breaks]
            if (upper[j] !== Infinity) candidates.push(upper[j])
            // Each piece lies between two breakpoints; its weights are fixed there.
            const sorted = [-Infinity, ...breaks.slice().sort((a, b) => a - b), Infinity]
            for (let p = 0; p + 1 < sorted.length; p++) {
                const lo = sorted[p]
                const hi = sorted[p + 1]
                const mid =
                    isFinite(lo) && isFinite(hi)
                        ? (lo + hi) / 2
                        : isFinite(lo)
                          ? lo + 1
                          : isFinite(hi)
                            ? hi - 1
                            : 0
                let num = 0
                let den = 0
                for (const r of rows) {
                    const wr = w(r, rest[r] + A[r][j] * mid)
                    num -= wr * A[r][j] * rest[r]
                    den += wr * A[r][j] * A[r][j]
                }
                if (den > 0) candidates.push(Math.min(hi, Math.max(lo, num / den)))
            }

            let best = x[j]
            let bestCost = cost(along(best))
            for (const c of candidates) {
                if (!isFinite(c)) continue
                const t = Math.min(upper[j], Math.max(0, c))
                const v = cost(along(t))
                if (v < bestCost - 1e-12) {
                    best = t
                    bestCost = v
                }
            }
            moved = Math.max(moved, Math.abs(best - x[j]))
            x[j] = best
            for (let r = 0; r < res.length; r++) res[r] = rest[r] + A[r][j] * best
        }
        if (moved < 0.01) break
    }

    free.forEach((i, j) => {
        const g = Math.round(x[j] / 5) * 5
        grams[i] = Math.min(g, upper[j] === Infinity ? g : Math.floor(upper[j]))
    })
    return grams
}

/**
 * How a ready-made serving sits against `budget`, for ranking saved meals —
 * lower is closer. A meal can't be scaled, so calories don't get to overrule
 * everything as they do when fitting grams: a few kcal off with the protein
 * right beats spot-on kcal with half the protein. Same fractions as above,
 * and being short on fat still barely counts.
 */
const FIT_WEIGHT: Record<keyof Macros, { under: number; over: number }> = {
    calories: { under: 3, over: 3 },
    protein: { under: 3, over: 2 },
    carbs: { under: 1, over: 1 },
    fat: { under: 0.25, over: 1 },
}

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

/** A box note's projected plate: the grams it's estimated at, and what they come to. */
export interface BoxProjection {
    /** All of it — the box and any sides. */
    grams: number
    macros: Macros
    /** Grams of each food: the box first, then its sides. */
    lines: { food: string; grams: number }[]
}

/**
 * Projections for one day's box notes ("eating from this box", no amounts).
 * Just an estimate of a sensible portion. Every slot holding notes gets its
 * share of what the rest of the day leaves, all at once, so lunch and dinner
 * come out the same; notes in one slot split it evenly.
 *
 * A box on its own fills its share until the first macro reaches it — so a
 * lean, protein-heavy box stops at a meal's worth of protein (not 160 g of
 * it chasing the calories), and what's left is room for sides. A box planned
 * with sides is fitted with them as one plate, the way the plate builder
 * does: the box carries the protein, the rice makes up the calories.
 *
 * A food with no figures (never cooked, no recipe) is left out; a box with
 * none, or a day with no targets, gets nothing.
 */
export function projectBoxNotes(
    entries: {
        _id: string
        slot: MealType
        macros: Macros
        box?: string
        sides?: string[]
        away?: boolean
    }[],
    goals: MacroGoals | null | undefined,
    per100For: (food: string) => Macros | null
): Map<string, BoxProjection> {
    const out = new Map<string, BoxProjection>()
    // Everything but the box notes — so every noted slot is still open.
    const known: BudgetEntry[] = entries.filter((e) => !e.box)
    for (const slot of MEAL_TYPES) {
        const notes = entries.flatMap((e) => {
            if (!e.box || e.slot !== slot) return []
            const per100 = per100For(e.box)
            if (!per100) return []
            const sides = (e.sides ?? []).flatMap((food) => {
                const p = per100For(food)
                return p ? [{ food, per100: p }] : []
            })
            return [{ id: e._id, food: e.box, per100, sides }]
        })
        if (notes.length === 0) continue
        const aim = slotBudget(goals, slot, known)
        if (!aim) return out
        const part = (m: Macros) => scale(m, 1 / notes.length)
        for (const n of notes) {
            let lines: { food: string; grams: number; per100: Macros }[]
            if (n.sides.length > 0) {
                const plate = [{ food: n.food, per100: n.per100 }, ...n.sides]
                const grams = suggestGrams(plate, part(aim.budget), aim.keys, part(aim.size))
                lines = plate.map((l, i) => ({ ...l, grams: grams[i] }))
            } else {
                // The grams at which each macro reaches this note's part of the slot.
                const caps = aim.keys
                    .filter((k) => n.per100[k] > 0)
                    .map((k) => (aim.budget[k] / notes.length / n.per100[k]) * 100)
                if (caps.length === 0) continue
                lines = [
                    {
                        food: n.food,
                        per100: n.per100,
                        grams: Math.round(Math.min(...caps) / 5) * 5,
                    },
                ]
            }
            lines = lines.filter((l) => l.grams > 0)
            if (lines.length === 0) continue
            out.set(n.id, {
                grams: lines.reduce((sum, l) => sum + l.grams, 0),
                macros: plateTotal(lines),
                lines: lines.map(({ food, grams }) => ({ food, grams })),
            })
        }
    }
    return out
}
