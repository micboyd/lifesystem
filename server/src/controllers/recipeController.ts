import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Recipe from '../models/Recipe'
import Batch from '../models/Batch'
import FoodEntry from '../models/FoodEntry'
import { httpError, isId, readCookable, stamp } from '../lib/foodInput'
import { validateRecipeImport, type RecipeDraft } from '../lib/recipeImport'
import type { Cookable, Ingredient } from '../lib/recipeMath'

/**
 * Re-stamp the *planned* lines that come straight from a recipe (not via a
 * batch) after it changes. Eaten and skipped lines keep what they were logged
 * with. A planned line in grams that can no longer be weighed keeps its old
 * figures rather than failing the edit.
 */
export async function restampPlanned(
    filter: Record<string, unknown>,
    source: Cookable
): Promise<number> {
    const planned = await FoodEntry.find({ ...filter, status: 'planned' })
    let n = 0
    for (const e of planned) {
        try {
            const { macros, estimated } = stamp(source, e.amount, e.unit)
            e.macros = macros
            e.estimated = estimated || undefined
            await e.save()
            n++
        } catch {
            // Unweighable in grams now — leave as it was.
        }
    }
    return n
}

function fieldsOf(d: RecipeDraft) {
    return {
        name: d.name,
        types: d.types,
        ingredients: d.ingredients,
        macros: d.macros,
        servings: d.servings,
        cookedGrams: d.cookedGrams,
        estimatedCookedGrams: d.estimatedCookedGrams,
        presets: d.presets,
        method: d.method,
        notes: d.notes,
        guidePage: d.guidePage,
        guideEstimate: d.guideEstimate,
    }
}

/** Fields the form sends that the validator doesn't cover. */
function extrasOf(body: Record<string, unknown>) {
    const out: Record<string, unknown> = {}
    for (const k of ['link', 'guideUrl'] as const) {
        if (typeof body[k] === 'string') out[k] = (body[k] as string).trim() || undefined
    }
    if (typeof body.archived === 'boolean') out.archived = body.archived
    return out
}

/** GET /api/recipes?archived=1 — the library, in its saved order. */
export async function listRecipes(req: AuthRequest, res: Response) {
    const filter: Record<string, unknown> = { user: req.userId }
    if (req.query.archived !== '1') filter.archived = false
    const recipes = await Recipe.find(filter).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: recipes })
}

/** POST /api/recipes */
export async function createRecipe(req: AuthRequest, res: Response) {
    const { draft, warnings } = readCookable(req.body)
    const last = await Recipe.findOne({ user: req.userId }).sort({ order: -1 })
    const recipe = await Recipe.create({
        user: req.userId,
        ...fieldsOf(draft),
        ...extrasOf(req.body),
        order: (last?.order ?? -1) + 1,
    })
    res.status(201).json({ message: 'Created', data: recipe, warnings })
}

/**
 * PUT /api/recipes/:id — replace a recipe. Planned lines from it follow the
 * change; batches already cooked from it don't (they have their own copy).
 * `{ archived: true|false }` alone just hides or restores it.
 */
export async function updateRecipe(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const recipe = await Recipe.findOne({ _id: req.params.id, user: req.userId })
    if (!recipe) throw httpError(404, 'Recipe not found')

    const keys = Object.keys(req.body ?? {})
    if (keys.length === 1 && keys[0] === 'archived') {
        recipe.archived = req.body.archived === true
        await recipe.save()
        res.json({ message: 'OK', data: recipe })
        return
    }

    const { draft, warnings } = readCookable(req.body)
    recipe.set({ ...fieldsOf(draft), ...extrasOf(req.body) })
    await recipe.save()
    const restamped = await restampPlanned(
        { user: req.userId, recipe: recipe._id, batch: { $exists: false } },
        recipe
    )
    res.json({ message: 'OK', data: recipe, warnings, restamped })
}

/**
 * DELETE /api/recipes/:id — deletes a recipe nothing points at; otherwise
 * archives it, so past days and batches still resolve its name.
 */
export async function deleteRecipe(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const recipe = await Recipe.findOne({ _id: req.params.id, user: req.userId })
    if (!recipe) throw httpError(404, 'Recipe not found')
    const used =
        (await FoodEntry.exists({ user: req.userId, recipe: recipe._id })) ||
        (await Batch.exists({ user: req.userId, recipe: recipe._id }))
    if (used) {
        recipe.archived = true
        await recipe.save()
        res.json({ message: 'Archived', data: recipe })
        return
    }
    await recipe.deleteOne()
    res.json({ message: 'Deleted' })
}

/**
 * POST /api/recipes/import { recipes: [...], apply?: boolean }
 *
 * Without `apply`: validates and reports, per recipe, whether it would be new
 * or would update the recipe of the same name — nothing is saved. With
 * `apply: true`: saves the valid ones. Recipes with errors are never saved.
 * Updating a recipe never reaches its batches or eaten lines.
 */
export async function importRecipes(req: AuthRequest, res: Response) {
    const result = validateRecipeImport(req.body)
    const existing = await Recipe.find({ user: req.userId })
    const byName = new Map(existing.map((r) => [r.name.toLowerCase(), r]))

    const plan = result.recipes.map(({ index, draft }) => ({
        index,
        draft,
        action: byName.has(draft.name.toLowerCase()) ? ('update' as const) : ('create' as const),
    }))

    if (req.body?.apply !== true) {
        res.json({ message: 'Preview', data: { plan, issues: result.issues } })
        return
    }

    let order = existing.reduce((m, r) => Math.max(m, r.order), -1) + 1
    let created = 0
    let updated = 0
    for (const { draft, action } of plan) {
        if (action === 'update') {
            const recipe = byName.get(draft.name.toLowerCase())!
            recipe.set({ ...fieldsOf(draft), archived: false })
            await recipe.save()
            await restampPlanned(
                { user: req.userId, recipe: recipe._id, batch: { $exists: false } },
                recipe
            )
            updated++
        } else {
            await Recipe.create({ user: req.userId, ...fieldsOf(draft), order: order++ })
            created++
        }
    }
    res.json({ message: 'Imported', data: { created, updated, issues: result.issues } })
}

/**
 * GET /api/recipes/ingredients — every ingredient you've used, newest figures
 * first, for autofilling a recipe or batch form. There's no separate food
 * library to maintain: an ingredient exists because a recipe used it.
 */
export async function listIngredients(req: AuthRequest, res: Response) {
    const [recipes, batches] = await Promise.all([
        Recipe.find({ user: req.userId }, { ingredients: 1, updatedAt: 1 }).lean(),
        Batch.find({ user: req.userId }, { ingredients: 1, updatedAt: 1 }).lean(),
    ])
    const sources = [...recipes, ...batches].sort(
        (a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)
    )
    const seen = new Map<string, Ingredient>()
    for (const s of sources) {
        for (const ing of s.ingredients as Ingredient[]) {
            const key = `${ing.name.toLowerCase()}|${ing.unit}`
            if (!seen.has(key) && ing.per) {
                const { amount: _amount, ...rest } = ing // eslint-disable-line @typescript-eslint/no-unused-vars
                seen.set(key, rest)
            }
        }
    }
    const data = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
    res.json({ message: 'OK', data })
}
