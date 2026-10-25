import type { Macros } from '../types'

/**
 * The arithmetic behind boxes and plates. A box is cooked from raw ingredients
 * (macros per 100 g off the packet); weighing the cooked food turns the raw
 * total into macros per 100 g of what's in the box; a plate is grams of that
 * (and of plain foods like rice). Mirrored from server/src/lib/plates.ts.
 */

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

/** One decimal place — enough for a gram of protein, without float noise. */
const r1 = (n: number) => Math.round(n * 10) / 10

export function scale(m: Macros, factor: number): Macros {
    return {
        calories: m.calories * factor,
        protein: m.protein * factor,
        carbs: m.carbs * factor,
        fat: m.fat * factor,
    }
}

function add(a: Macros, b: Macros): Macros {
    return {
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        carbs: a.carbs + b.carbs,
        fat: a.fat + b.fat,
    }
}

export function round(m: Macros): Macros {
    const out = { ...ZERO }
    for (const k of KEYS) out[k] = r1(m[k] || 0)
    return out
}

/** Macros in `grams` of something with `per100`. */
export function lineMacros(grams: number, per100: Macros): Macros {
    return scale(per100, Math.max(0, grams) / 100)
}

/** Everything that went into a box, raw. */
export function rawTotal(ingredients: { grams: number; per100: Macros }[]): Macros {
    return round(ingredients.reduce((sum, i) => add(sum, lineMacros(i.grams, i.per100)), ZERO))
}

/** Macros per 100 g of the cooked food, from the raw total and what it weighed cooked. */
export function per100FromCook(raw: Macros, cookedGrams: number): Macros {
    if (!(cookedGrams > 0)) return { ...ZERO }
    return round(scale(raw, 100 / cookedGrams))
}

/** A plate's total. */
export function plateTotal(lines: { grams: number; per100: Macros }[]): Macros {
    return round(lines.reduce((sum, l) => add(sum, lineMacros(l.grams, l.per100)), ZERO))
}

/** "Chicken box · Rice" — the name a plate entry carries. */
export function plateName(lines: { name: string }[]): string {
    return lines.map((l) => l.name).join(' · ') || 'Plate'
}

/** "250 g left", from a batch's cooked weight and what's been eaten — never below zero. */
export function gramsLeft(cookedGrams: number, eatenGrams = 0): number {
    return Math.max(0, Math.round(cookedGrams - eatenGrams))
}
