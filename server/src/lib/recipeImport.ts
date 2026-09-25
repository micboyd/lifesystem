/**
 * The recipe import format, and its validator.
 *
 * This is the contract for getting recipes out of a PDF (or anywhere else):
 * something extracts the structured ingredients into this JSON, the app shows
 * the result for review, and only then saves. Nothing is read from the guide's
 * rounded totals — `guideEstimatePerPortion` is carried only so the review can
 * flag where the app's figures and the guide's disagree.
 *
 * Shared by server and client; dependency-free.
 *
 * {
 *   "recipes": [{
 *     "name": "Greek lemon chicken",
 *     "types": ["lunch", "dinner"],
 *     "servings": 7,
 *     "estimatedCookedGrams": 3500,
 *     "guidePage": 12,
 *     "guideEstimatePerPortion": { "calories": 500, "protein": 70, "carbs": 20, "fat": 15 },
 *     "ingredients": [
 *       { "name": "Chicken breast, raw", "amount": 2000, "unit": "g",
 *         "per100": { "calories": 106, "protein": 24, "carbs": 0, "fat": 1.1 } },
 *       { "name": "Chickpeas, drained", "packs": 2, "unit": "g", "drained": true,
 *         "pack": { "size": 240, "label": "tin" }, "per100": { ... } },
 *       { "name": "Eggs, large", "amount": 2, "unit": "item", "perItem": { ... } },
 *       { "name": "Olive oil (allowance)", "amount": 10, "unit": "g", "per100": { ... } }
 *     ],
 *     "presets": [{ "label": "Small", "amount": 50, "unit": "g", "hint": "≈ 150 g cooked" }],
 *     "method": ["Preheat…", "…"],
 *     "notes": "…"
 *   }]
 * }
 *
 * `per100` is per 100 g for "g" lines and per 100 ml for "ml" lines; `perItem`
 * is for "item" lines. A recipe with no ingredient figures at all can give
 * `macrosPerPortion` instead.
 */
import {
    atwaterCalories,
    INGREDIENT_UNITS,
    portionMacros,
    type Ingredient,
    type IngredientUnit,
    type Macros,
} from './recipeMath'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const

export interface RecipePresetDraft {
    label: string
    amount: number
    unit: 'portion' | 'g'
    hint?: string
}

/** A validated recipe, in the shape the Recipe model stores. */
export interface RecipeDraft {
    name: string
    types: (typeof MEAL_TYPES)[number][]
    ingredients: Ingredient[]
    macros?: Macros
    servings: number
    cookedGrams?: number
    estimatedCookedGrams?: number
    presets: RecipePresetDraft[]
    method: string[]
    notes?: string
    guidePage?: number
    guideEstimate?: Macros
}

export interface ImportIssue {
    level: 'error' | 'warning'
    /** Index into `recipes`, or -1 for the file as a whole. */
    recipe: number
    /** Where, e.g. "ingredients[2].per100". */
    path: string
    message: string
}

export interface ImportResult {
    /** Only recipes without errors. */
    recipes: { index: number; draft: RecipeDraft }[]
    issues: ImportIssue[]
}

type Obj = Record<string, unknown>

const RECIPE_KEYS = new Set([
    'name',
    'types',
    'servings',
    'cookedGrams',
    'estimatedCookedGrams',
    'guidePage',
    'guideEstimatePerPortion',
    'macrosPerPortion',
    'ingredients',
    'presets',
    'method',
    'notes',
])
const INGREDIENT_KEYS = new Set([
    'name',
    'amount',
    'packs',
    'unit',
    'per100',
    'perItem',
    'pack',
    'drained',
])

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function validateRecipeImport(input: unknown): ImportResult {
    const issues: ImportIssue[] = []
    const out: ImportResult['recipes'] = []

    const list = isObj(input) ? input.recipes : Array.isArray(input) ? input : undefined
    if (!Array.isArray(list)) {
        issues.push({
            level: 'error',
            recipe: -1,
            path: '',
            message: 'Expected { "recipes": [ … ] }.',
        })
        return { recipes: out, issues }
    }

    const seen = new Map<string, number>()
    list.forEach((raw, index) => {
        const before = issues.length
        const draft = readRecipe(raw, index, issues)
        if (draft) {
            const key = draft.name.toLowerCase()
            if (seen.has(key)) {
                issues.push({
                    level: 'error',
                    recipe: index,
                    path: 'name',
                    message: `Same name as recipe ${seen.get(key)! + 1} — names must be unique.`,
                })
            } else {
                seen.set(key, index)
            }
        }
        const hasError = issues.slice(before).some((i) => i.level === 'error')
        if (draft && !hasError) out.push({ index, draft })
    })

    return { recipes: out, issues }
}

function readRecipe(raw: unknown, index: number, issues: ImportIssue[]): RecipeDraft | null {
    const err = (path: string, message: string) =>
        issues.push({ level: 'error', recipe: index, path, message })
    const warn = (path: string, message: string) =>
        issues.push({ level: 'warning', recipe: index, path, message })

    if (!isObj(raw)) {
        err('', 'Each recipe must be an object.')
        return null
    }
    for (const k of Object.keys(raw)) if (!RECIPE_KEYS.has(k)) warn(k, `Unknown field "${k}" — ignored.`)

    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) err('name', 'Missing a name.')

    const servings = raw.servings ?? 1
    if (!isNum(servings) || servings <= 0) err('servings', 'Portions must be a number above 0.')

    const types = Array.isArray(raw.types) ? raw.types : []
    for (const t of types) {
        if (!MEAL_TYPES.includes(t as never)) err('types', `"${String(t)}" isn't breakfast, lunch, dinner or snack.`)
    }

    const cookedGrams = optionalPositive(raw, 'cookedGrams', err)
    const estimatedCookedGrams = optionalPositive(raw, 'estimatedCookedGrams', err)
    const guidePage = optionalPositive(raw, 'guidePage', err)
    const guideEstimate = optionalMacros(raw.guideEstimatePerPortion, 'guideEstimatePerPortion', err)
    const macros = optionalMacros(raw.macrosPerPortion, 'macrosPerPortion', err)

    const ingredients: Ingredient[] = []
    if (raw.ingredients !== undefined && !Array.isArray(raw.ingredients)) {
        err('ingredients', 'Ingredients must be a list.')
    }
    const rawIngs = Array.isArray(raw.ingredients) ? raw.ingredients : []
    rawIngs.forEach((ri, i) => {
        const ing = readIngredient(ri, `ingredients[${i}]`, err, warn)
        if (ing) ingredients.push(ing)
    })

    const costed = ingredients.filter((i) => i.per)
    if (costed.length === 0 && !macros) {
        err('ingredients', 'No nutrition anywhere — give ingredients label figures, or macrosPerPortion.')
    }
    if (costed.length > 0 && macros) {
        warn('macrosPerPortion', 'Ignored — the ingredients carry label figures, and those are used.')
    }
    if (costed.length > 0) {
        ingredients.forEach((ing, i) => {
            if (!ing.per) warn(`ingredients[${i}]`, `"${ing.name}" has no label figures, so it counts as zero.`)
            else if (ing.amount == null) warn(`ingredients[${i}]`, `"${ing.name}" has no amount, so it counts as zero.`)
        })
    }

    const presets: RecipePresetDraft[] = []
    const rawPresets = Array.isArray(raw.presets) ? raw.presets : []
    rawPresets.forEach((p, i) => {
        const path = `presets[${i}]`
        if (!isObj(p) || typeof p.label !== 'string' || !isNum(p.amount) || p.amount <= 0) {
            err(path, 'A preset needs a label and an amount above 0.')
            return
        }
        const unit = p.unit ?? 'portion'
        if (unit !== 'portion' && unit !== 'g') {
            err(`${path}.unit`, 'Preset unit must be "portion" or "g".')
            return
        }
        presets.push({
            label: p.label.trim(),
            amount: p.amount,
            unit,
            hint: typeof p.hint === 'string' ? p.hint : undefined,
        })
    })
    if (presets.some((p) => p.unit === 'g') && !cookedGrams && !estimatedCookedGrams) {
        warn('presets', 'Gram presets need a cooked weight (cookedGrams) to mean anything.')
    }

    const method = Array.isArray(raw.method)
        ? raw.method.filter((s): s is string => typeof s === 'string' && s.trim() !== '')
        : typeof raw.method === 'string'
          ? raw.method.split(/\n+/).filter((s) => s.trim() !== '')
          : []

    if (!name || !isNum(servings) || servings <= 0) return null

    const draft: RecipeDraft = {
        name,
        types: types.filter((t): t is RecipeDraft['types'][number] => MEAL_TYPES.includes(t as never)),
        ingredients,
        macros: costed.length === 0 ? macros : undefined,
        servings,
        cookedGrams,
        estimatedCookedGrams,
        presets,
        method,
        notes: typeof raw.notes === 'string' ? raw.notes : undefined,
        guidePage,
        guideEstimate,
    }

    // Cross-check against the guide's own estimate: a big gap is usually a
    // missed ingredient or a per-portion figure entered as per-100.
    if (guideEstimate && (costed.length > 0 || macros)) {
        const ours = portionMacros(draft, 1)
        const gap = ours.calories - guideEstimate.calories
        if (Math.abs(gap) > Math.max(25, guideEstimate.calories * 0.1)) {
            warn(
                'guideEstimatePerPortion',
                `App works out ${ours.calories} kcal a portion; the guide says ${guideEstimate.calories}. Check the ingredients.`
            )
        }
    }

    return draft
}

function readIngredient(
    raw: unknown,
    path: string,
    err: (path: string, message: string) => void,
    warn: (path: string, message: string) => void
): Ingredient | null {
    if (!isObj(raw)) {
        err(path, 'Each ingredient must be an object.')
        return null
    }
    for (const k of Object.keys(raw)) {
        if (!INGREDIENT_KEYS.has(k)) warn(`${path}.${k}`, `Unknown field "${k}" — ignored.`)
    }

    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) err(`${path}.name`, 'Missing a name.')

    const unit = raw.unit as IngredientUnit
    if (!INGREDIENT_UNITS.includes(unit)) {
        err(`${path}.unit`, 'Unit must be "g", "ml" or "item" — g and ml are not interchangeable.')
        return null
    }

    let pack: Ingredient['pack']
    if (raw.pack !== undefined) {
        const p = raw.pack
        if (!isObj(p) || !isNum(p.size) || p.size <= 0) {
            err(`${path}.pack`, `A pack needs a size above 0, in ${unit}.`)
        } else {
            pack = { size: p.size, label: typeof p.label === 'string' ? p.label : undefined }
        }
    }

    let amount: number | undefined
    if (raw.amount !== undefined) {
        if (!isNum(raw.amount) || raw.amount < 0) err(`${path}.amount`, 'Amount must be a number ≥ 0.')
        else amount = raw.amount
    }
    if (raw.packs !== undefined) {
        if (!isNum(raw.packs) || raw.packs <= 0) {
            err(`${path}.packs`, 'Packs must be a number above 0.')
        } else if (!pack) {
            err(`${path}.packs`, 'Packs given without a pack size.')
        } else {
            const fromPacks = raw.packs * pack.size
            if (amount !== undefined && Math.abs(amount - fromPacks) > 0.5) {
                err(`${path}.amount`, `Amount ${amount} doesn't match ${raw.packs} × ${pack.size}.`)
            }
            amount = fromPacks
        }
    }
    if (amount === undefined) warn(`${path}.amount`, `"${name}" has no amount.`)

    if (unit === 'item' && raw.per100 !== undefined) {
        err(`${path}.per100`, 'Counted ("item") ingredients take perItem, not per100.')
    }
    if (unit !== 'item' && raw.perItem !== undefined) {
        err(`${path}.perItem`, `Weighed ingredients take per100 (per 100 ${unit}), not perItem.`)
    }
    const perKey = unit === 'item' ? 'perItem' : 'per100'
    const per = optionalMacros(raw[perKey], `${path}.${perKey}`, err)

    if (per) {
        // Only worth a warning when the gap moves the recipe by more than a few
        // kcal — a teaspoon of a fibrous spice disagrees on paper and nowhere else.
        const implied = atwaterCalories(per)
        const gap = Math.abs(implied - per.calories)
        const impact = amount == null ? Infinity : gap * (unit === 'item' ? amount : amount / 100)
        if (gap > Math.max(20, per.calories * 0.2) && impact > 15) {
            warn(
                `${path}.${perKey}`,
                `"${name}": ${per.calories} kcal, but its macros add up to about ${Math.round(implied)}. Check the label.`
            )
        }
        if (unit !== 'item' && per.protein + per.carbs + per.fat > 100) {
            err(`${path}.per100`, `"${name}": more than 100 g of macros per 100 ${unit}.`)
        }
    }

    if (!name) return null
    return {
        name,
        unit,
        amount,
        per,
        pack,
        drained: raw.drained === true ? true : undefined,
    }
}

function optionalPositive(
    raw: Obj,
    key: string,
    err: (path: string, message: string) => void
): number | undefined {
    const v = raw[key]
    if (v === undefined || v === null) return undefined
    if (!isNum(v) || v <= 0) {
        err(key, `${key} must be a number above 0.`)
        return undefined
    }
    return v
}

function optionalMacros(
    v: unknown,
    path: string,
    err: (path: string, message: string) => void
): Macros | undefined {
    if (v === undefined || v === null) return undefined
    if (!isObj(v)) {
        err(path, 'Macros must be { calories, protein, carbs, fat }.')
        return undefined
    }
    const m = {} as Macros
    for (const k of ['calories', 'protein', 'carbs', 'fat'] as const) {
        const n = v[k] ?? 0
        if (!isNum(n) || n < 0) {
            err(`${path}.${k}`, `${k} must be a number ≥ 0.`)
            return undefined
        }
        m[k] = n
    }
    return m
}
