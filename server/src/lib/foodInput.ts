import { Types } from 'mongoose'
import {
    validateRecipeImport,
    type ImportIssue,
    type RecipeDraft,
} from './recipeImport'
import { amountMacros, type Cookable, type EntryUnit, type Macros } from './recipeMath'

/**
 * Request-body handling shared by the recipe, batch and food-entry controllers.
 *
 * Forms send recipes and batches in the stored shape (`per` on each
 * ingredient); the importer sends the import shape (`per100` / `perItem`).
 * Both are checked by the one validator, so a recipe typed into the app is held
 * to exactly the rules an imported one is.
 */

/** An error whose message is meant for the caller; the app's handler passes it through. */
export function httpError(status: number, message: string, extra?: object) {
    return Object.assign(new Error(message), { status, expose: true, ...extra })
}

export function isId(v: unknown): v is string {
    return typeof v === 'string' && Types.ObjectId.isValid(v)
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Stored shape → import shape, so both go through `validateRecipeImport`. */
function toImportShape(body: Obj): Obj {
    const out: Obj = {}
    for (const k of [
        'name',
        'types',
        'servings',
        'cookedGrams',
        'estimatedCookedGrams',
        'guidePage',
        'presets',
        'method',
        'notes',
    ]) {
        if (body[k] !== undefined && body[k] !== null && body[k] !== '') out[k] = body[k]
    }
    if (body.macros) out.macrosPerPortion = body.macros
    if (body.guideEstimate) out.guideEstimatePerPortion = body.guideEstimate
    if (Array.isArray(body.ingredients)) {
        out.ingredients = body.ingredients.map((raw) => {
            if (!isObj(raw)) return raw
            const { per, ...rest } = raw
            const clean = Object.fromEntries(
                Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== '')
            )
            if (per) clean[raw.unit === 'item' ? 'perItem' : 'per100'] = per
            return clean
        })
    }
    return out
}

/**
 * Validate a recipe- or batch-shaped body. Throws a 400 carrying every issue on
 * error; returns the draft plus any warnings otherwise.
 */
export function readCookable(body: unknown): { draft: RecipeDraft; warnings: ImportIssue[] } {
    if (!isObj(body)) throw httpError(400, 'Expected an object.')
    const result = validateRecipeImport({ recipes: [toImportShape(body)] })
    const errors = result.issues.filter((i) => i.level === 'error')
    if (errors.length || !result.recipes[0]) {
        throw httpError(400, errors[0]?.message ?? 'Invalid recipe.', { issues: result.issues })
    }
    return {
        draft: result.recipes[0].draft,
        warnings: result.issues.filter((i) => i.level === 'warning'),
    }
}

/** Macros for a line of a day, or a 400 when grams are asked of something unweighed. */
export function stamp(
    source: Cookable,
    amount: number,
    unit: EntryUnit
): { macros: Macros; estimated: boolean } {
    const result = amountMacros(source, amount, unit)
    if (!result) {
        throw httpError(
            400,
            'This has no cooked weight, so it can only be logged in portions. Weigh it, or add an estimated cooked weight.'
        )
    }
    return result
}

export function toMacros(raw: unknown): Macros {
    const m = isObj(raw) ? raw : {}
    const n = (v: unknown) => {
        const x = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(x) && x > 0 ? x : 0
    }
    return { calories: n(m.calories), protein: n(m.protein), carbs: n(m.carbs), fat: n(m.fat) }
}
