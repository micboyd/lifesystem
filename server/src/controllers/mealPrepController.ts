import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import PrepRecipe, { PREP_CATEGORIES, PrepCategory } from '../models/PrepRecipe'
import FoodBatch, { STORAGE, Storage } from '../models/FoodBatch'
import StockMovement from '../models/StockMovement'
import Food from '../models/Food'
import PrepContainer from '../models/PrepContainer'
import {
    HttpError,
    inTransaction,
    isDuplicateKey,
    isIsoDate,
    parseIngredients,
    sendError,
    toId,
} from '../lib/buffetStock'
import {
    cleanMacros,
    isValidCookedGrams,
    netFromGross,
    per100FromTotals,
    recipeTotals,
    IngredientLine,
} from '../lib/mealPrepMath'

/**
 * The Tray & Sides library, cooked batches and their stock, and the saved
 * labels and containers that feed them. Everything is scoped to `req.userId`;
 * nothing referenced by meal history is ever hard-deleted — recipes and foods
 * are archived, batches finished or discarded.
 */

function num(v: unknown): number | undefined {
    if (v === undefined || v === null || v === '') return undefined
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : undefined
}

function str(v: unknown, max = 200): string | undefined {
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined
}

function requestIdOf(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined
}

// ── Recipes ──────────────────────────────────────────────────────────────────

/** GET /api/meal-prep/recipes — the library, archived ones only on `?archived=1`. */
export async function listRecipes(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (!req.query.archived) query.archived = { $ne: true }
    const recipes = await PrepRecipe.find(query).sort({ favourite: -1, order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: recipes })
}

/** Pull the editable recipe fields out of a body; `partial` leaves absent ones alone. */
async function recipeFields(req: AuthRequest, partial: boolean) {
    const b = req.body as Record<string, unknown>
    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}

    const name = str(b.name, 120)
    if (name) set.name = name
    else if (!partial) throw new HttpError(400, 'Give the recipe a name')

    if (PREP_CATEGORIES.includes(b.category as PrepCategory)) set.category = b.category
    if (b.ingredients !== undefined || !partial) {
        const parsed = await parseIngredients(b.ingredients, req.userId)
        if ('error' in parsed) throw new HttpError(400, parsed.error)
        set.ingredients = parsed.ingredients
    }
    if ('instructions' in b) {
        const v = str(b.instructions, 10_000)
        if (v) set.instructions = v
        else unset.instructions = ''
    }
    // Optional positive numbers: a blank clears them.
    for (const key of ['prepMinutes', 'estimatedYieldGrams', 'usualPortionGrams', 'leadDays'] as const) {
        if (!(key in b)) continue
        const v = num(b[key])
        if (v === undefined || v <= 0) unset[key] = ''
        else if (key === 'estimatedYieldGrams' && !isValidCookedGrams(v)) {
            throw new HttpError(400, 'An estimated yield must be between 1 g and 50 kg')
        } else set[key] = v
    }
    if ('lowStock' in b) {
        const ls = b.lowStock as Record<string, unknown> | null
        const value = num(ls?.value)
        if (!ls || value === undefined || value < 0) unset.lowStock = ''
        else set.lowStock = { unit: ls.unit === 'grams' ? 'grams' : 'portions', value }
    }
    if (typeof b.favourite === 'boolean') set.favourite = b.favourite
    if (typeof b.archived === 'boolean') set.archived = b.archived
    return { set, unset }
}

/** POST /api/meal-prep/recipes */
export async function createRecipe(req: AuthRequest, res: Response) {
    try {
        const { set } = await recipeFields(req, false)
        const last = await PrepRecipe.findOne({ user: req.userId }).sort({ order: -1 })
        const recipe = await PrepRecipe.create({ ...set, user: req.userId, order: last ? last.order + 1 : 0 })
        res.status(201).json({ message: 'Created', data: recipe })
    } catch (err) {
        sendError(res, err)
    }
}

/**
 * PUT /api/meal-prep/recipes/:id — edit the recipe. Batches already cooked from
 * it keep their own snapshot and are not touched.
 */
export async function updateRecipe(req: AuthRequest, res: Response) {
    try {
        const { set, unset } = await recipeFields(req, true)
        const update: Record<string, unknown> = { $set: set }
        if (Object.keys(unset).length) update.$unset = unset
        const recipe = await PrepRecipe.findOneAndUpdate({ _id: req.params.id, user: req.userId }, update, {
            new: true,
        })
        if (!recipe) {
            res.status(404).json({ message: 'Recipe not found' })
            return
        }
        res.json({ message: 'Saved', data: recipe })
    } catch (err) {
        sendError(res, err)
    }
}

/** POST /api/meal-prep/recipes/:id/duplicate — a copy to vary, named "(copy)". */
export async function duplicateRecipe(req: AuthRequest, res: Response) {
    const source = await PrepRecipe.findOne({ _id: req.params.id, user: req.userId })
    if (!source) {
        res.status(404).json({ message: 'Recipe not found' })
        return
    }
    const last = await PrepRecipe.findOne({ user: req.userId }).sort({ order: -1 })
    const plain = source.toObject() as unknown as Record<string, unknown>
    delete plain._id
    delete plain.createdAt
    delete plain.updatedAt
    delete plain.lastYieldGrams
    delete plain.lastYieldDate
    const copy = await PrepRecipe.create({
        ...plain,
        name: `${source.name} (copy)`,
        favourite: false,
        archived: false,
        order: last ? last.order + 1 : 0,
    })
    res.status(201).json({ message: 'Created', data: copy })
}

/**
 * DELETE /api/meal-prep/recipes/:id — archive. Meal history and batches point
 * at recipes, so they are hidden rather than removed; PUT `archived: false`
 * brings one back.
 */
export async function archiveRecipe(req: AuthRequest, res: Response) {
    const recipe = await PrepRecipe.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { archived: true } },
        { new: true }
    )
    if (!recipe) {
        res.status(404).json({ message: 'Recipe not found' })
        return
    }
    res.json({ message: 'Archived', data: recipe })
}

// ── Batches ──────────────────────────────────────────────────────────────────

/** GET /api/meal-prep/batches — active batches, or every one on `?status=all`. */
export async function listBatches(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (req.query.status !== 'all') query.status = 'active'
    const batches = await FoodBatch.find(query).sort({ cookedDate: 1, createdAt: 1 })
    res.json({ message: 'OK', data: batches })
}

/**
 * POST /api/meal-prep/batches — cook a batch.
 *
 * Body: `recipe`, the ingredients as actually used, and either `cookedGrams`
 * (net) or `weighing: { grossGrams, containerGrams, containerName? }`. The
 * totals and density are computed here and frozen onto the batch; the recipe
 * only learns the new yield, for future planning estimates.
 *
 * `requestId` makes the save idempotent — it rides on the batch's opening
 * 'cook' movement, whose unique index catches a double tap.
 */
export async function cookBatch(req: AuthRequest, res: Response) {
    const b = req.body as Record<string, unknown>
    const requestId = requestIdOf(b.requestId)
    try {
        if (requestId) {
            const prior = await StockMovement.findOne({ user: req.userId, requestId, kind: 'cook' })
            if (prior) {
                const batch = await FoodBatch.findOne({ _id: prior.batch, user: req.userId })
                res.status(200).json({ message: 'Already saved', data: batch })
                return
            }
        }

        const recipeId = toId(b.recipe)
        const recipe = recipeId ? await PrepRecipe.findOne({ _id: recipeId, user: req.userId }) : null
        if (!recipe) throw new HttpError(404, 'Choose a recipe to cook')
        if (!isIsoDate(b.cookedDate)) throw new HttpError(400, 'Give the date it was cooked')

        const parsed = await parseIngredients(b.ingredients, req.userId)
        if ('error' in parsed) throw new HttpError(400, parsed.error)
        if (parsed.ingredients.length === 0) throw new HttpError(400, 'Add the ingredients you used')

        // Net weight: typed directly, or gross minus the container — never both,
        // so a container can't be subtracted twice.
        let cookedGrams = num(b.cookedGrams)
        let weighing: { grossGrams: number; containerGrams: number; containerName?: string } | undefined
        const w = b.weighing as Record<string, unknown> | undefined
        if (w && typeof w === 'object') {
            const gross = num(w.grossGrams)
            const container = num(w.containerGrams)
            const net = gross !== undefined && container !== undefined ? netFromGross(gross, container) : null
            if (net === null) throw new HttpError(400, 'The container weighs as much as the reading — check both')
            cookedGrams = net
            weighing = { grossGrams: gross!, containerGrams: container!, containerName: str(w.containerName, 60) }
        }
        if (!isValidCookedGrams(cookedGrams)) {
            throw new HttpError(400, 'Enter the finished cooked weight — between 1 g and 50 kg')
        }

        const { totals } = recipeTotals(parsed.ingredients as IngredientLine[])
        const per100 = per100FromTotals(totals, cookedGrams)!
        const storage: Storage = STORAGE.includes(b.storage as Storage) ? (b.storage as Storage) : 'fridge'

        const batch = await inTransaction(async (session) => {
            const [doc] = await FoodBatch.create(
                [
                    {
                        user: req.userId,
                        recipe: recipe._id,
                        name: recipe.name,
                        category: recipe.category,
                        label: str(b.label, 60),
                        cookedDate: b.cookedDate,
                        ingredients: parsed.ingredients,
                        totals,
                        cookedGrams,
                        per100,
                        remainingGrams: cookedGrams,
                        storage,
                        ...(isIsoDate(b.useBy) ? { useBy: b.useBy } : {}),
                        ...(isIsoDate(b.thawedDate) ? { thawedDate: b.thawedDate } : {}),
                        ...(weighing ? { weighing } : {}),
                    },
                ],
                { session }
            )
            await StockMovement.create(
                [
                    {
                        user: req.userId,
                        batch: doc._id,
                        kind: 'cook',
                        grams: cookedGrams,
                        balanceAfter: cookedGrams,
                        date: b.cookedDate as string,
                        ...(requestId ? { requestId } : {}),
                    },
                ],
                { session }
            )
            await PrepRecipe.updateOne(
                { _id: recipe._id, user: req.userId },
                { $set: { lastYieldGrams: cookedGrams, lastYieldDate: b.cookedDate } },
                { session }
            )
            return doc
        })
        res.status(201).json({ message: 'Created', data: batch })
    } catch (err) {
        if (requestId && isDuplicateKey(err)) {
            const prior = await StockMovement.findOne({ user: req.userId, requestId, kind: 'cook' })
            const batch = prior && (await FoodBatch.findOne({ _id: prior.batch, user: req.userId }))
            if (batch) {
                res.status(200).json({ message: 'Already saved', data: batch })
                return
            }
        }
        sendError(res, err)
    }
}

/** PATCH /api/meal-prep/batches/:id — label and dates. Stock moves via /adjust. */
export async function updateBatch(req: AuthRequest, res: Response) {
    const b = req.body as Record<string, unknown>
    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}
    if ('label' in b) {
        const v = str(b.label, 60)
        if (v) set.label = v
        else unset.label = ''
    }
    for (const key of ['useBy', 'thawedDate'] as const) {
        if (!(key in b)) continue
        if (isIsoDate(b[key])) set[key] = b[key]
        else unset[key] = ''
    }
    const update: Record<string, unknown> = { $set: set }
    if (Object.keys(unset).length) update.$unset = unset
    const batch = await FoodBatch.findOneAndUpdate({ _id: req.params.id, user: req.userId }, update, { new: true })
    if (!batch) {
        res.status(404).json({ message: 'Batch not found' })
        return
    }
    res.json({ message: 'Saved', data: batch })
}

const ADJUST_KINDS = ['others', 'discard', 'correction', 'move', 'finish'] as const
type AdjustKind = (typeof ADJUST_KINDS)[number]

/**
 * POST /api/meal-prep/batches/:id/adjust — the stock corrections that aren't
 * meals, so none of them touch your macros.
 *
 *  - `others` / `discard`, `{ grams }`: someone else ate some, or it was binned.
 *    Refused if the batch doesn't hold that much (correct the weight instead).
 *    `discard` with `all: true` empties and closes the batch.
 *  - `correction`, `{ remainingGrams }`: weighed again. The balance becomes the
 *    reading and the batch is marked measured, so older meals edited later
 *    don't disturb it. The density is untouched — it's still the same food.
 *  - `move`, `{ storage }`: fridge ↔ freezer. Out of the freezer stamps a
 *    thawed date if there isn't one.
 *  - `finish`: none left; the balance goes to zero and the batch closes.
 *
 * `requestId` (required) makes each adjustment happen once however many times
 * it's sent.
 */
export async function adjustBatch(req: AuthRequest, res: Response) {
    const b = req.body as Record<string, unknown>
    const kind = b.kind as AdjustKind
    const requestId = requestIdOf(b.requestId)
    if (!ADJUST_KINDS.includes(kind)) {
        res.status(400).json({ message: `kind must be one of: ${ADJUST_KINDS.join(', ')}` })
        return
    }
    if (!requestId) {
        res.status(400).json({ message: 'requestId is required' })
        return
    }
    if (!isIsoDate(b.date)) {
        res.status(400).json({ message: 'date (YYYY-MM-DD) is required' })
        return
    }
    const date = b.date

    const replay = async () => {
        const prior = await StockMovement.findOne({ user: req.userId, requestId })
        if (!prior) return false
        const batch = await FoodBatch.findOne({ _id: prior.batch, user: req.userId })
        res.status(200).json({ message: 'Already saved', data: batch })
        return true
    }

    try {
        if (await replay()) return
        const batch = await inTransaction(async (session) => {
            const current = await FoodBatch.findOne({ _id: req.params.id, user: req.userId }).session(session)
            if (!current) throw new HttpError(404, 'Batch not found')
            const before = current.remainingGrams
            const now = new Date()
            let grams = 0
            let note = str(b.note, 200)

            switch (kind) {
                case 'others':
                case 'discard': {
                    const all = kind === 'discard' && b.all === true
                    const amount = all ? before : num(b.grams)
                    if (!all && (amount === undefined || amount <= 0)) {
                        throw new HttpError(400, 'Enter how many grams')
                    }
                    if (amount! > before + 1e-6) {
                        throw new HttpError(
                            409,
                            `Only ${Math.round(before)} g is recorded as left. Correct the remaining weight instead.`,
                            { code: 'INSUFFICIENT_STOCK' }
                        )
                    }
                    grams = -amount!
                    current.remainingGrams = Math.max(0, before - amount!)
                    if (all) {
                        current.status = 'discarded'
                        current.reconciledAt = now
                    }
                    break
                }
                case 'correction': {
                    const measured = num(b.remainingGrams)
                    if (measured === undefined || measured < 0 || measured > 50_000) {
                        throw new HttpError(400, 'Enter the weight left, 0 g or more')
                    }
                    grams = measured - before
                    current.remainingGrams = measured
                    current.reconciledAt = now
                    if (current.status !== 'active' && measured > 0) current.status = 'active'
                    break
                }
                case 'move': {
                    const storage = b.storage as Storage
                    if (!STORAGE.includes(storage)) throw new HttpError(400, 'storage must be fridge or freezer')
                    if (storage === 'fridge' && current.storage === 'freezer' && !current.thawedDate) {
                        current.thawedDate = date
                    }
                    note = note ?? `${current.storage} → ${storage}`
                    current.storage = storage
                    break
                }
                case 'finish': {
                    grams = -before
                    current.remainingGrams = 0
                    current.status = 'finished'
                    current.reconciledAt = now
                    break
                }
            }

            await current.save({ session })
            await StockMovement.create(
                [
                    {
                        user: req.userId,
                        batch: current._id,
                        kind,
                        grams,
                        balanceAfter: current.remainingGrams,
                        date,
                        note,
                        requestId,
                    },
                ],
                { session }
            )
            return current
        })
        res.json({ message: 'Saved', data: batch })
    } catch (err) {
        if (isDuplicateKey(err) && (await replay())) return
        sendError(res, err)
    }
}

/** GET /api/meal-prep/batches/:id/movements — the batch's stock history. */
export async function listMovements(req: AuthRequest, res: Response) {
    const id = toId(req.params.id)
    if (!id) {
        res.status(400).json({ message: 'Bad id' })
        return
    }
    const movements = await StockMovement.find({ user: req.userId, batch: id }).sort({ createdAt: 1 })
    res.json({ message: 'OK', data: movements })
}

// ── Foods (saved labels) ─────────────────────────────────────────────────────

function foodFields(b: Record<string, unknown>, partial: boolean) {
    const set: Record<string, unknown> = {}
    const unset: Record<string, ''> = {}
    const name = str(b.name, 120)
    if (name) set.name = name
    else if (!partial) throw new HttpError(400, 'Give the food a name')
    if ('brand' in b) {
        const v = str(b.brand, 80)
        if (v) set.brand = v
        else unset.brand = ''
    }
    if (b.basis === 'g' || b.basis === 'ml') set.basis = b.basis
    if (b.per100 !== undefined || !partial) set.per100 = cleanMacros(b.per100)
    for (const key of ['density', 'unitGrams'] as const) {
        if (!(key in b)) continue
        const v = num(b[key])
        if (v === undefined || v <= 0) unset[key] = ''
        else set[key] = v
    }
    if (typeof b.archived === 'boolean') set.archived = b.archived
    return { set, unset }
}

export async function listFoods(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (!req.query.archived) query.archived = { $ne: true }
    const foods = await Food.find(query).sort({ name: 1 })
    res.json({ message: 'OK', data: foods })
}

export async function createFood(req: AuthRequest, res: Response) {
    try {
        const { set } = foodFields(req.body, false)
        const food = await Food.create({ ...set, user: req.userId })
        res.status(201).json({ message: 'Created', data: food })
    } catch (err) {
        sendError(res, err)
    }
}

export async function updateFood(req: AuthRequest, res: Response) {
    try {
        const { set, unset } = foodFields(req.body, true)
        const update: Record<string, unknown> = { $set: set }
        if (Object.keys(unset).length) update.$unset = unset
        const food = await Food.findOneAndUpdate({ _id: req.params.id, user: req.userId }, update, { new: true })
        if (!food) {
            res.status(404).json({ message: 'Food not found' })
            return
        }
        res.json({ message: 'Saved', data: food })
    } catch (err) {
        sendError(res, err)
    }
}

/** DELETE /api/meal-prep/foods/:id — archive; recipes keep their copied figures. */
export async function archiveFood(req: AuthRequest, res: Response) {
    const food = await Food.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { archived: true } },
        { new: true }
    )
    if (!food) {
        res.status(404).json({ message: 'Food not found' })
        return
    }
    res.json({ message: 'Archived', data: food })
}

// ── Containers ───────────────────────────────────────────────────────────────

export async function listContainers(req: AuthRequest, res: Response) {
    const containers = await PrepContainer.find({ user: req.userId }).sort({ name: 1 })
    res.json({ message: 'OK', data: containers })
}

export async function createContainer(req: AuthRequest, res: Response) {
    const name = str(req.body.name, 60)
    const grams = num(req.body.grams)
    if (!name || grams === undefined || grams <= 0 || grams > 20_000) {
        res.status(400).json({ message: 'A container needs a name and an empty weight in grams' })
        return
    }
    const container = await PrepContainer.create({ user: req.userId, name, grams })
    res.status(201).json({ message: 'Created', data: container })
}

/** Batches copy the container weight they were weighed with, so this is safe. */
export async function deleteContainer(req: AuthRequest, res: Response) {
    const id = toId(req.params.id)
    const container = id && (await PrepContainer.findOneAndDelete({ _id: id, user: req.userId }))
    if (!container) {
        res.status(404).json({ message: 'Container not found' })
        return
    }
    res.json({ message: 'Deleted', data: container })
}

