/**
 * Recipe and batch arithmetic, shared by server and client (the client
 * re-exports it from `lib/recipes.ts`). The server stamps every food entry's
 * macros with these functions and the forms preview with the same ones, so the
 * numbers can't drift.
 *
 * Dependency-free on purpose: no mongoose, no DOM.
 *
 *   batch nutrition   = Σ ingredient nutrition (as bought — raw or dry)
 *   one portion       = batch nutrition ÷ portions
 *   portion weight    = cooked weight ÷ portions
 *   X cooked grams    = batch nutrition × X ÷ cooked weight
 *
 * Water lost in cooking changes weight, not nutrition, and dividing by the
 * cooked weight already models that — there are no raw/cooked conversion
 * factors anywhere. Portions never need a weight; grams do, and are flagged as
 * estimates when the cooked weight wasn't measured.
 *
 * A recipe and a batch share one shape (`Cookable`): a batch is a dated copy of
 * a recipe's ingredients with its own portions and cooked weight.
 */

export interface Macros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

export const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'] as const

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

/**
 * g and ml are kept apart — a 500 ml carton and a 500 g jar are different
 * amounts. Label macros are per 100 g, per 100 ml, or per item.
 */
export const INGREDIENT_UNITS = ['g', 'ml', 'item'] as const
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number]

export interface Ingredient {
    name: string
    /** In `unit`: grams, millilitres or a count. Always the actual amount used. */
    amount?: number
    unit: IngredientUnit
    /** Label macros per 100 g/ml, or per item. Absent = not costed. */
    per?: Macros
    /**
     * A pack, for entering "1 × 500 g jar" instead of weighing: `size` is in
     * `unit`, and `amount` stays canonical (0.5 jars of 500 g → amount 250).
     */
    pack?: { size: number; label?: string }
    /** Amount and label figures are the drained weight (tins of beans, tuna). */
    drained?: boolean
}

/** The shape recipes and batches share. */
export interface Cookable {
    ingredients: Ingredient[]
    /** Typed per-portion macros, used only when no ingredient is costed. */
    macros?: Macros
    /** Equal portions the whole thing makes. */
    servings?: number
    /** Measured cooked weight of all the food, without trays or containers. */
    cookedGrams?: number
    /** A guess at the cooked weight, used for grams when nothing was measured. */
    estimatedCookedGrams?: number
}

export function add(a: Macros, b: Macros): Macros {
    return {
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        carbs: a.carbs + b.carbs,
        fat: a.fat + b.fat,
    }
}

export function scale(m: Macros, k: number): Macros {
    return {
        calories: m.calories * k,
        protein: m.protein * k,
        carbs: m.carbs * k,
        fat: m.fat * k,
    }
}

/** Stored figures: whole kcal, grams to one decimal. */
export function round(m: Macros): Macros {
    return {
        calories: Math.round(m.calories),
        protein: Math.round(m.protein * 10) / 10,
        carbs: Math.round(m.carbs * 10) / 10,
        fat: Math.round(m.fat * 10) / 10,
    }
}

export function sum(list: Macros[]): Macros {
    return list.reduce(add, ZERO)
}

/** What one ingredient line contributes, or null if it has no label macros. */
export function ingredientMacros(ing: Ingredient): Macros | null {
    if (!ing.per || !ing.amount) return null
    return scale(ing.per, ing.unit === 'item' ? ing.amount : ing.amount / 100)
}

/** How many packs an ingredient line is, if it has a pack size. */
export function packCount(ing: Ingredient): number | null {
    if (!ing.pack?.size || ing.amount == null) return null
    return ing.amount / ing.pack.size
}

/** True when macros come from the ingredients rather than typed per portion. */
export function isBuilt(c: Cookable): boolean {
    return c.ingredients.some((i) => !!i.per)
}

/** Ingredient names with no label macros, in a built recipe — they count as zero. */
export function uncosted(c: Cookable): string[] {
    if (!isBuilt(c)) return []
    return c.ingredients.filter((i) => !i.per).map((i) => i.name)
}

export function portions(c: Cookable): number {
    return c.servings && c.servings > 0 ? c.servings : 1
}

/** Everything that went in. */
export function totalMacros(c: Cookable): Macros {
    if (isBuilt(c)) {
        return sum(c.ingredients.map(ingredientMacros).filter((m): m is Macros => !!m))
    }
    return scale(c.macros ?? ZERO, portions(c))
}

/** The cooked weight to divide by, and whether it was measured. */
export function cookedWeight(c: Cookable): { grams: number; estimated: boolean } | null {
    if (c.cookedGrams && c.cookedGrams > 0) return { grams: c.cookedGrams, estimated: false }
    if (c.estimatedCookedGrams && c.estimatedCookedGrams > 0) {
        return { grams: c.estimatedCookedGrams, estimated: true }
    }
    return null
}

/** Macros for a number of portions (1, 1.5, 0.5…). Needs no weight. */
export function portionMacros(c: Cookable, count: number): Macros {
    return round(scale(totalMacros(c), count / portions(c)))
}

/** What one portion weighs, or null when there's no cooked weight at all. */
export function portionWeight(c: Cookable): { grams: number; estimated: boolean } | null {
    const w = cookedWeight(c)
    return w && { grams: w.grams / portions(c), estimated: w.estimated }
}

/**
 * Macros for a cooked weight in grams. Null when there's no cooked weight to
 * divide by — grams of a batch are meaningless without one.
 */
export function gramMacros(
    c: Cookable,
    grams: number
): { macros: Macros; estimated: boolean } | null {
    const w = cookedWeight(c)
    if (!w) return null
    return { macros: round(scale(totalMacros(c), grams / w.grams)), estimated: w.estimated }
}

/** How a line of a day is measured: portions, or cooked grams. */
export type EntryUnit = 'portion' | 'g'

/** Macros for an amount in either unit; null if grams were asked of something unweighed. */
export function amountMacros(
    c: Cookable,
    amount: number,
    unit: EntryUnit
): { macros: Macros; estimated: boolean } | null {
    if (unit === 'g') return gramMacros(c, amount)
    return { macros: portionMacros(c, amount), estimated: false }
}

/**
 * Kcal implied by the macros (4/4/9). Label figures that disagree with this by
 * a lot are usually a typo or a per-portion figure entered as per-100.
 */
export function atwaterCalories(m: Macros): number {
    return m.protein * 4 + m.carbs * 4 + m.fat * 9
}
