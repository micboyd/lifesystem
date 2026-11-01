import { IMacros } from '../models/Meal'

/**
 * The arithmetic behind boxes and plates. A box is cooked from raw ingredients
 * (macros per 100 g off the packet); weighing the cooked food turns the raw
 * total into macros per 100 g of what's in the box; a plate is grams of that
 * (and of plain foods like rice). Mirrored in client/src/lib/plates.ts.
 */

export const ZERO: IMacros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

/** One decimal place — enough for a gram of protein, without float noise. */
const r1 = (n: number) => Math.round(n * 10) / 10

function scale(m: IMacros, factor: number): IMacros {
    return {
        calories: m.calories * factor,
        protein: m.protein * factor,
        carbs: m.carbs * factor,
        fat: m.fat * factor,
    }
}

function add(a: IMacros, b: IMacros): IMacros {
    return {
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        carbs: a.carbs + b.carbs,
        fat: a.fat + b.fat,
    }
}

export function round(m: IMacros): IMacros {
    const out = { ...ZERO }
    for (const k of KEYS) out[k] = r1(m[k] || 0)
    return out
}

/** Macros in `grams` of something with `per100`. */
export function lineMacros(grams: number, per100: IMacros): IMacros {
    return scale(per100, Math.max(0, grams) / 100)
}

/** Everything that went into a box, raw. */
export function rawTotal(ingredients: { grams: number; per100: IMacros }[]): IMacros {
    return round(ingredients.reduce((sum, i) => add(sum, lineMacros(i.grams, i.per100)), ZERO))
}

/** Macros per 100 g of the cooked food, from the raw total and what it weighed cooked. */
export function per100FromCook(raw: IMacros, cookedGrams: number): IMacros {
    if (!(cookedGrams > 0)) return { ...ZERO }
    return round(scale(raw, 100 / cookedGrams))
}

/** A plate's total. */
export function plateTotal(lines: { grams: number; per100: IMacros }[]): IMacros {
    return round(lines.reduce((sum, l) => add(sum, lineMacros(l.grams, l.per100)), ZERO))
}

/** "Chicken box · Rice" — the name a plate entry carries. */
export function plateName(lines: { name: string }[]): string {
    return lines.map((l) => l.name).join(' · ') || 'Plate'
}

/**
 * Grams eaten, taken from batches oldest first: each gives what it has left
 * (`room`, which this uses up), and whatever's over once they're all empty
 * comes from the last. Returns the grams from each batch it touched.
 */
export function shareOut(grams: number, batches: string[], room: Map<string, number>): { batch: string; grams: number }[] {
    const takes: { batch: string; grams: number }[] = []
    let left = grams
    for (const [i, id] of batches.entries()) {
        if (left <= 0) break
        const g = i === batches.length - 1 ? left : Math.min(left, Math.max(0, room.get(id) ?? 0))
        if (g <= 0) continue
        room.set(id, (room.get(id) ?? 0) - g)
        takes.push({ batch: id, grams: g })
        left -= g
    }
    return takes
}
