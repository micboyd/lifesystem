import type { MealIngredient } from '../types'

/** The most portions the recipe counter goes up to. */
export const MAX_PORTIONS = 40

/** How many portions a meal's saved ingredients make: a tray's box count, otherwise one. */
export function basePortions(meal: { batchOf?: number | null }): number {
    return (meal.batchOf ?? 0) > 1 ? meal.batchOf! : 1
}

/** Grams to show for a scaled amount: whole grams from 10 g up, one decimal below. */
function roundGrams(g: number): number {
    return g >= 10 ? Math.round(g) : Math.round(g * 10) / 10
}

/** Counts to show: halves are real (½ an onion), anything finer isn't. */
function roundItems(n: number): number {
    return Math.max(0.5, Math.round(n * 2) / 2)
}

/**
 * The ingredients for `portions`, from ones saved for `base` portions. Counts
 * round to the nearest half, never below one half.
 */
export function scaleIngredients(ingredients: MealIngredient[], base: number, portions: number): MealIngredient[] {
    const factor = portions / Math.max(1, base)
    return ingredients.map((i) => ({
        ...i,
        grams: i.grams > 0 ? roundGrams(i.grams * factor) : i.grams,
        ...(i.items ? { items: roundItems(i.items * factor) } : {}),
    }))
}

/** "½", "1½", "3" — counts read better as fractions. */
export function itemsLabel(n: number): string {
    const whole = Math.floor(n)
    const half = n - whole >= 0.5
    return half ? `${whole || ''}½` : String(whole)
}
