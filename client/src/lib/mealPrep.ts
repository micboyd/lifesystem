import type { BuffetComponent, FoodBatch, MealPlanEntry, PrepRecipe } from '../types'
import {
    per100FromTotals,
    recipeTotals,
    type IngredientLine,
    type Macros,
} from '../../../server/src/lib/mealPrepMath'

/**
 * Client side of the meal-prep maths.
 *
 * The formulas themselves live in `server/src/lib/mealPrepMath.ts` and are
 * re-exported here unchanged: the server snapshots every logged portion with
 * them and the forms preview with them, so the two can't drift. What's added
 * below is presentation — which yield a recipe is being costed at, and how to
 * name a batch.
 */
export {
    INGREDIENT_UNITS,
    MAX_PORTION_GRAMS,
    MIN_PORTION_GRAMS,
    ZERO,
    addMacros,
    ingredientMacros,
    isValidCookedGrams,
    isValidPortionGrams,
    netFromGross,
    per100FromTotals,
    per100Grams,
    planStockChanges,
    portionMacros,
    portionsLeft,
    recipeTotals,
    scaleMacros,
    splitAcrossBatches,
    sumMacroList,
    toBasisAmount,
} from '../../../server/src/lib/mealPrepMath'
export type { Consumption, IngredientLine, RecipeTotals } from '../../../server/src/lib/mealPrepMath'

/** Which cooked weight a recipe's per-gram figures are being worked from. */
export interface RecipeYield {
    grams: number
    /** 'measured' is the last batch actually weighed; 'estimated' a typed guess. */
    kind: 'measured' | 'estimated'
}

export function recipeYield(recipe: Pick<PrepRecipe, 'lastYieldGrams' | 'estimatedYieldGrams'>): RecipeYield | null {
    if (recipe.lastYieldGrams && recipe.lastYieldGrams > 0) return { grams: recipe.lastYieldGrams, kind: 'measured' }
    if (recipe.estimatedYieldGrams && recipe.estimatedYieldGrams > 0) {
        return { grams: recipe.estimatedYieldGrams, kind: 'estimated' }
    }
    return null
}

export interface RecipeSummary {
    totals: Macros
    /** Per 100 g at the recipe's yield — always an estimate for a recipe. */
    per100: Macros | null
    yield: RecipeYield | null
    problems: { index: number; name: string; reason: string }[]
}

/**
 * A recipe's batch totals and, where a yield is known, its estimated density.
 * A recipe is never eaten — only batches are — so its per-100 g figure is by
 * definition a planning estimate, even when the yield was measured last time.
 */
export function recipeSummary(recipe: Pick<PrepRecipe, 'ingredients' | 'lastYieldGrams' | 'estimatedYieldGrams'>): RecipeSummary {
    const { totals, problems } = recipeTotals(recipe.ingredients as IngredientLine[])
    const y = recipeYield(recipe)
    return { totals, per100: y ? per100FromTotals(totals, y.grams) : null, yield: y, problems }
}

/** "12 Sep" — how a batch is told apart from its siblings. */
export function batchDate(date: string): string {
    const [, m, d] = date.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${d} ${months[m - 1]}`
}

/** "Fajita chicken · Sunday tray" or "Fajita chicken · 12 Sep". */
export function batchTitle(batch: Pick<FoodBatch, 'name' | 'label' | 'cookedDate'>): string {
    return `${batch.name} · ${batch.label || batchDate(batch.cookedDate)}`
}

/** The grams a component counts at for its meal's status. */
export function componentGrams(c: BuffetComponent, status: MealPlanEntry['status']): number {
    return (status === 'eaten' ? c.grams : c.plannedGrams) ?? c.plannedGrams ?? 0
}

/** Round grams for display: whole grams, with a thousands separator. */
export function grams(n: number): string {
    return `${Math.round(n).toLocaleString()} g`
}
