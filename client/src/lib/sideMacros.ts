import type { Macros } from '../types'

/**
 * Sides (rice, pasta, potatoes) are cooked in their own pot and nobody cooks
 * exactly the recipe's amount. So a box's macros are worked out from what's
 * actually in it: the main's share of the recipe (the recipe minus its sides),
 * plus each weighed side at its cooked figures per 100 g.
 *
 * Figures are typical per-100 g values (UK/USDA tables), close enough for a
 * meal-prep box; packets differ a little.
 */

type SideFood = { label: string; dry: Macros; cooked: Macros; /** How the recipe weighs it when it doesn't say. */ usual: 'dry' | 'cooked' }

const m = (calories: number, protein: number, carbs: number, fat: number): Macros => ({ calories, protein, carbs, fat })

// Order matters: the first match wins, so the specific comes before the general.
const FOODS: { match: RegExp; food: SideFood }[] = [
    { match: /brown rice/i, food: { label: 'brown rice', dry: m(360, 7.5, 76, 2.7), cooked: m(123, 2.7, 25.6, 1), usual: 'dry' } },
    { match: /\brice\b/i, food: { label: 'rice', dry: m(350, 7.5, 78, 0.6), cooked: m(130, 2.7, 28, 0.3), usual: 'dry' } },
    { match: /sweet potato/i, food: { label: 'sweet potato', dry: m(86, 1.6, 20, 0.1), cooked: m(90, 2, 21, 0.2), usual: 'dry' } },
    { match: /\bpotato(es)?\b|\bgnocchi\b/i, food: { label: 'potato', dry: m(77, 2, 17, 0.1), cooked: m(87, 1.9, 20, 0.1), usual: 'dry' } },
    { match: /\bnoodles?\b/i, food: { label: 'noodles', dry: m(384, 14, 71, 4.4), cooked: m(138, 4.5, 25, 2.1), usual: 'dry' } },
    { match: /\bcouscous\b/i, food: { label: 'couscous', dry: m(376, 12.8, 77, 0.6), cooked: m(112, 3.8, 23, 0.2), usual: 'dry' } },
    { match: /\bquinoa\b/i, food: { label: 'quinoa', dry: m(368, 14, 64, 6), cooked: m(120, 4.4, 21, 1.9), usual: 'dry' } },
    { match: /\bbulgur\b/i, food: { label: 'bulgur', dry: m(342, 12, 76, 1.3), cooked: m(83, 3.1, 19, 0.2), usual: 'dry' } },
    {
        match: /\b(pasta|spaghetti|penne|fusilli|orzo|macaroni|linguine|tagliatelle|rigatoni)\b/i,
        food: { label: 'pasta', dry: m(355, 12.5, 71, 1.5), cooked: m(158, 5.8, 31, 0.9), usual: 'dry' },
    },
]

/** The side a name is, if it's one we know the figures for. */
export function sideFood(name: string): SideFood | null {
    return FOODS.find((f) => f.match.test(name))?.food ?? null
}

/** Whether a recipe's grams are cooked or dry/raw: from the name, else how that side's usually weighed. */
function recipeForm(name: string, food: SideFood): 'dry' | 'cooked' {
    if (/\bcooked\b|\bboiled\b|\bsteamed\b/i.test(name)) return 'cooked'
    if (/\bdry\b|\braw\b|\buncooked\b/i.test(name)) return 'dry'
    return food.usual
}

const scale = (per100: Macros, grams: number): Macros => ({
    calories: (per100.calories * grams) / 100,
    protein: (per100.protein * grams) / 100,
    carbs: (per100.carbs * grams) / 100,
    fat: (per100.fat * grams) / 100,
})

const add = (a: Macros, b: Macros, sign = 1): Macros => ({
    calories: a.calories + sign * b.calories,
    protein: a.protein + sign * b.protein,
    carbs: a.carbs + sign * b.carbs,
    fat: a.fat + sign * b.fat,
})

const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const floor0 = (x: Macros): Macros => ({
    calories: Math.max(0, x.calories),
    protein: Math.max(0, x.protein),
    carbs: Math.max(0, x.carbs),
    fat: Math.max(0, x.fat),
})

export type BoxSide = {
    name: string
    /** The recipe's grams of it in one portion; null for a side that isn't in the recipe. */
    recipeGrams: number | null
    /** Cooked grams of it going in each box; null until its pot is weighed. */
    boxGrams: number | null
}

export type BoxSideResult = {
    name: string
    macros: Macros
    /** 'weighed': from the box's grams. 'recipe': not weighed yet, the recipe's amount. 'unknown': no figures for it. */
    from: 'weighed' | 'recipe' | 'unknown'
}

export type BoxMacros = { total: Macros; main: Macros; sides: BoxSideResult[] }

/**
 * One box's macros. `portion` is the meal's saved per-portion macros (the
 * whole recipe, sides included). Each side the recipe holds is taken out at
 * its recipe amount; each weighed side goes back in at its box grams.
 */
export function boxMacros(portion: Macros, sides: BoxSide[]): BoxMacros {
    let main = { ...portion }
    const out: BoxSideResult[] = []
    for (const s of sides) {
        const food = sideFood(s.name)
        const inRecipe = food && s.recipeGrams && s.recipeGrams > 0
            ? scale(recipeForm(s.name, food) === 'cooked' ? food.cooked : food.dry, s.recipeGrams)
            : ZERO
        if (!food) {
            out.push({ name: s.name, macros: ZERO, from: 'unknown' })
            continue
        }
        main = add(main, inRecipe, -1)
        if (s.boxGrams && s.boxGrams > 0) out.push({ name: s.name, macros: scale(food.cooked, s.boxGrams), from: 'weighed' })
        else out.push({ name: s.name, macros: inRecipe, from: 'recipe' })
    }
    main = floor0(main)
    const total = out.reduce((t, s) => add(t, s.macros), main)
    return { total, main, sides: out }
}
