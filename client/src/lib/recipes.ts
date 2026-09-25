import type { Batch, FoodEntry, Recipe } from '../types'
import { cookedWeight, portionWeight, type Cookable } from '../../../server/src/lib/recipeMath'

/**
 * Client side of the recipe maths. The formulas live in
 * `server/src/lib/recipeMath.ts` and are re-exported unchanged — the server
 * stamps every logged line with them and the forms preview with the same ones.
 * What's added here is wording.
 */
export * from '../../../server/src/lib/recipeMath'

/** Recipes and batches satisfy the shared shape as they come off the wire. */
export const cookable = (x: Recipe | Batch): Cookable => x

/** Whether grams can be logged at all — they need a cooked weight to divide by. */
export function canWeigh(x: Recipe | Batch): boolean {
    return cookedWeight(x) !== null
}

/** "1 portion", "1.5 portions", "350 g". */
export function amountLabel(amount: number, unit: FoodEntry['unit']): string {
    const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(amount < 10 ? 2 : 1).replace(/\.?0+$/, '')
    if (unit === 'g') return `${n} g`
    return `${n} portion${amount === 1 ? '' : 's'}`
}

/** "≈ 480 g a portion", marked when the cooked weight was only estimated. */
export function portionWeightLabel(x: Recipe | Batch): string | null {
    const w = portionWeight(x)
    if (!w) return null
    return `${w.estimated ? '≈ ' : ''}${Math.round(w.grams)} g a portion${w.estimated ? ' (estimated)' : ''}`
}

/**
 * How a pick starts out: things eaten straight by weight (dry rice, yoghurt —
 * one "serving" that is really a weight) open in grams; everything else in
 * portions, which never needs a scale.
 */
export function recipeUnitDefault(x: Recipe | Batch): FoodEntry['unit'] {
    return x.servings <= 1 && x.cookedGrams ? 'g' : 'portion'
}
