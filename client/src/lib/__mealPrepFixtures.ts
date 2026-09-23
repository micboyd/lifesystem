/**
 * Factories for the meal-prep tests: recipes, batches and buffet plan entries
 * built from the few numbers each test is actually about.
 *
 * Not a test file (no `.test.ts` suffix) so vitest won't try to run it.
 */
import type { BuffetComponent, FoodBatch, Macros, MealPlanEntry, PrepRecipe } from '../types'
import { portionMacros } from './mealPrep'

const STAMP = { createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' }

export function recipe(over: Partial<PrepRecipe> = {}): PrepRecipe {
    return {
        _id: 'r-fajita',
        name: 'Fajita chicken',
        category: 'main',
        ingredients: [],
        favourite: false,
        archived: false,
        order: 0,
        ...STAMP,
        ...over,
    }
}

/** A batch whose density is `kcalPer100` (other macros scaled from it). */
export function batch(over: Partial<FoodBatch> & { kcalPer100?: number } = {}): FoodBatch {
    const { kcalPer100 = 100, ...rest } = over
    const per100: Macros = { calories: kcalPer100, protein: kcalPer100 / 5, carbs: kcalPer100 / 10, fat: kcalPer100 / 20 }
    return {
        _id: 'b1',
        recipe: 'r-fajita',
        name: 'Fajita chicken',
        category: 'main',
        cookedDate: '2026-09-20',
        ingredients: [],
        totals: per100,
        cookedGrams: 1800,
        per100,
        remainingGrams: 1800,
        storage: 'fridge',
        status: 'active',
        ...STAMP,
        ...rest,
    }
}

let seq = 0

/** One plate component drawn from a batch. */
export function fromBatch(b: FoodBatch, gramsEaten: number, role: BuffetComponent['role'] = 'main'): BuffetComponent {
    return {
        _id: `c${seq++}`,
        role,
        source: 'batch',
        batch: b._id,
        recipe: b.recipe,
        name: b.name,
        per100: b.per100,
        estimated: false,
        plannedGrams: gramsEaten,
        grams: gramsEaten,
        macros: portionMacros(b.per100, gramsEaten),
    }
}

/** A planned component from a recipe with no batch yet. */
export function fromRecipe(recipeId: string, plannedGrams: number, per100: Macros, role: BuffetComponent['role'] = 'main'): BuffetComponent {
    return {
        _id: `c${seq++}`,
        role,
        source: 'recipe',
        recipe: recipeId,
        name: recipeId,
        per100,
        estimated: true,
        plannedGrams,
        macros: portionMacros(per100, plannedGrams),
    }
}

export function buffetEntry(
    date: string,
    status: MealPlanEntry['status'],
    components: BuffetComponent[],
    over: Partial<MealPlanEntry> = {}
): MealPlanEntry {
    // A planned plate is costed at its planned grams; drop `grams` to match.
    const comps =
        status === 'eaten'
            ? components
            : components.map(({ grams: _g, ...c }) => ({ ...c, macros: portionMacros(c.per100, c.plannedGrams ?? 0) }))
    return {
        _id: `e${seq++}`,
        date,
        slot: 'lunch',
        buffet: { components: comps, rev: 0, ...(status === 'eaten' ? { loggedAt: `${date}T12:00:00.000Z` } : {}) },
        servings: 1,
        status,
        order: 0,
        ...STAMP,
        ...over,
    }
}
