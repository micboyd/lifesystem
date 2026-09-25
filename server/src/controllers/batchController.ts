import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Batch from '../models/Batch'
import Recipe from '../models/Recipe'
import FoodEntry from '../models/FoodEntry'
import { httpError, isDate, isId, readCookable } from '../lib/foodInput'
import { restampPlanned } from './recipeController'

const today = () => new Date().toISOString().slice(0, 10)

/** GET /api/batches?archived=1 — "My batches", most recently cooked first. */
export async function listBatches(req: AuthRequest, res: Response) {
    const filter: Record<string, unknown> = { user: req.userId }
    if (req.query.archived !== '1') filter.archived = false
    const batches = await Batch.find(filter).sort({ cookedOn: -1, createdAt: -1 })
    res.json({ message: 'OK', data: batches })
}

/**
 * POST /api/batches — "I cooked this".
 *
 * `{ recipe }` alone copies the recipe's ingredients, portions and estimated
 * weight, names it after the recipe and dates it today; anything else sent
 * overrides that for this cook only ("Tray A", a different jar, 8 portions, the
 * weighed total).
 */
export async function createBatch(req: AuthRequest, res: Response) {
    const body = { ...(req.body ?? {}) }
    let recipeId: unknown = undefined
    if (body.recipe !== undefined) {
        if (!isId(body.recipe)) throw httpError(400, 'Bad recipe id')
        const recipe = await Recipe.findOne({ _id: body.recipe, user: req.userId })
        if (!recipe) throw httpError(404, 'Recipe not found')
        recipeId = recipe._id
        const r = recipe.toObject()
        body.name ??= r.name
        body.ingredients ??= r.ingredients
        body.macros ??= r.macros
        body.servings ??= r.servings
        body.estimatedCookedGrams ??= r.estimatedCookedGrams
    }
    const cookedOn = body.cookedOn ?? today()
    if (!isDate(cookedOn)) throw httpError(400, 'cookedOn must be YYYY-MM-DD')

    const { draft, warnings } = readCookable(body)
    const batch = await Batch.create({
        user: req.userId,
        recipe: recipeId,
        name: draft.name,
        cookedOn,
        ingredients: draft.ingredients,
        macros: draft.macros,
        servings: draft.servings,
        cookedGrams: draft.cookedGrams,
        estimatedCookedGrams: draft.estimatedCookedGrams,
        notes: draft.notes,
    })
    res.status(201).json({ message: 'Created', data: batch, warnings })
}

/**
 * PATCH /api/batches/:id — change this cook (usually: enter the weighed total).
 * Planned lines from it follow; eaten lines keep what they were logged with
 * unless re-stamped explicitly through the entry.
 * `{ archived: true|false }` alone finishes or restores it.
 */
export async function updateBatch(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const batch = await Batch.findOne({ _id: req.params.id, user: req.userId })
    if (!batch) throw httpError(404, 'Batch not found')

    const keys = Object.keys(req.body ?? {})
    if (keys.length === 1 && keys[0] === 'archived') {
        batch.archived = req.body.archived === true
        await batch.save()
        res.json({ message: 'OK', data: batch })
        return
    }

    const merged = { ...batch.toObject(), ...req.body }
    if (!isDate(merged.cookedOn)) throw httpError(400, 'cookedOn must be YYYY-MM-DD')
    // `null` clears a weight, so a mistyped measurement can be removed.
    for (const k of ['cookedGrams', 'estimatedCookedGrams'] as const) {
        if (req.body?.[k] === null) delete merged[k]
    }
    const { draft, warnings } = readCookable(merged)
    batch.set({
        name: draft.name,
        cookedOn: merged.cookedOn,
        ingredients: draft.ingredients,
        macros: draft.macros,
        servings: draft.servings,
        cookedGrams: draft.cookedGrams,
        estimatedCookedGrams: draft.estimatedCookedGrams,
        notes: draft.notes,
    })
    if (typeof req.body?.archived === 'boolean') batch.archived = req.body.archived
    await batch.save()
    const restamped = await restampPlanned({ user: req.userId, batch: batch._id }, batch)
    res.json({ message: 'OK', data: batch, warnings, restamped })
}

/** DELETE /api/batches/:id — deletes an unused batch; archives one that's been logged. */
export async function deleteBatch(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) throw httpError(400, 'Bad id')
    const batch = await Batch.findOne({ _id: req.params.id, user: req.userId })
    if (!batch) throw httpError(404, 'Batch not found')
    if (await FoodEntry.exists({ user: req.userId, batch: batch._id })) {
        batch.archived = true
        await batch.save()
        res.json({ message: 'Archived', data: batch })
        return
    }
    await batch.deleteOne()
    res.json({ message: 'Deleted' })
}
