import mongoose, { ClientSession, Types } from 'mongoose'
import { Response } from 'express'
import FoodBatch, { IFoodBatch } from '../models/FoodBatch'
import PrepRecipe, { IPrepIngredient, INGREDIENT_UNITS } from '../models/PrepRecipe'
import Food from '../models/Food'
import StockMovement from '../models/StockMovement'
import {
    BUFFET_ROLES,
    BuffetRole,
    IBuffetComponent,
    IMealPlanEntry,
} from '../models/MealPlanEntry'
import {
    cleanMacros,
    isValidCookedGrams,
    isValidPortionGrams,
    per100FromTotals,
    per100Grams,
    planStockChanges,
    portionMacros,
    recipeTotals,
    BatchStockState,
    Consumption,
    IngredientLine,
    Macros,
} from './mealPrepMath'

/**
 * The server half of the buffet workflow: turning a submitted plate into
 * validated, snapshotted components, and moving stock for it.
 *
 * Every stock-moving write runs inside one transaction with the meal write it
 * belongs to, so the two succeed or fail together — a portion is never
 * deducted for a meal that didn't save, or saved without its deduction.
 */

// ── Errors that carry a payload ──────────────────────────────────────────────

/**
 * A refusal with a status, a message and structured detail the client can act
 * on (which batch is short, by how much). The app's error middleware only
 * forwards messages, so controllers answer these themselves via `sendError`.
 */
export class HttpError extends Error {
    constructor(
        public status: number,
        message: string,
        public detail: Record<string, unknown> = {}
    ) {
        super(message)
    }
}

/** Answer an `HttpError` with its payload; rethrow anything else. */
export function sendError(res: Response, err: unknown): void {
    if (err instanceof HttpError) {
        res.status(err.status).json({ message: err.message, ...err.detail })
        return
    }
    throw err
}

/**
 * Run `fn` in a transaction. `withTransaction` retries transient conflicts
 * (two tabs deducting from one batch at once), so `fn` must re-read everything
 * it depends on rather than close over documents fetched outside.
 */
export async function inTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await mongoose.startSession()
    try {
        let out: T | undefined
        await session.withTransaction(async () => {
            out = await fn(session)
        })
        return out as T
    } finally {
        await session.endSession()
    }
}

export function isDuplicateKey(err: unknown): boolean {
    return !!err && typeof err === 'object' && (err as { code?: number }).code === 11000
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(v: unknown): v is string {
    return typeof v === 'string' && ISO.test(v)
}

export function toId(v: unknown): Types.ObjectId | null {
    return typeof v === 'string' && Types.ObjectId.isValid(v) ? new Types.ObjectId(v) : null
}

function num(v: unknown): number | undefined {
    if (v === undefined || v === null || v === '') return undefined
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : undefined
}

/**
 * Validate a recipe's (or a batch's) ingredient lines. Returns the lines or the
 * reasons they were refused — ingredient data is what every downstream figure
 * is built from, so a malformed line is an error, not a skip.
 */
export async function parseIngredients(
    raw: unknown,
    userId: string | undefined
): Promise<{ ingredients: IPrepIngredient[] } | { error: string }> {
    if (!Array.isArray(raw)) return { ingredients: [] }
    const out: IPrepIngredient[] = []
    const foodIds: Types.ObjectId[] = []
    for (let i = 0; i < raw.length; i++) {
        const item = raw[i] as Record<string, unknown> | null
        if (!item || typeof item !== 'object') return { error: `Ingredient ${i + 1} is malformed` }
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) return { error: `Ingredient ${i + 1} needs a name` }
        const quantity = num(item.quantity)
        if (quantity === undefined || quantity < 0 || quantity > 100_000) {
            return { error: `${name}: enter a quantity between 0 and 100,000` }
        }
        const unit = INGREDIENT_UNITS.includes(item.unit as never)
            ? (item.unit as IPrepIngredient['unit'])
            : 'g'
        const n = (item.nutrition ?? {}) as Record<string, unknown>
        const basis = n.basis === 'ml' ? 'ml' : 'g'
        const density = num(n.density)
        const unitGrams = num(n.unitGrams)
        const food = toId(item.food)
        if (food) foodIds.push(food)
        out.push({
            name,
            ...(food ? { food } : {}),
            quantity,
            unit,
            nutrition: {
                basis,
                per100: cleanMacros(n.per100),
                ...(density && density > 0 ? { density } : {}),
                ...(unitGrams && unitGrams > 0 ? { unitGrams } : {}),
            },
        })
    }
    // A food reference must be the user's own; drop links to anything else.
    if (foodIds.length) {
        const owned = new Set(
            (await Food.find({ _id: { $in: foodIds }, user: userId }).select('_id')).map((f) =>
                String(f._id)
            )
        )
        for (const line of out) if (line.food && !owned.has(String(line.food))) delete line.food
    }
    const { problems } = recipeTotals(out as IngredientLine[])
    if (problems.length) return { error: `${problems[0].name}: ${problems[0].reason}` }
    return { ingredients: out }
}

// ── Components ───────────────────────────────────────────────────────────────

/** Planning allows recipe-only components; eating needs a batch or a label. */
export type ComponentMode = 'plan' | 'log'

/**
 * Validate a submitted plate and snapshot its nutrition.
 *
 * Nothing the client says about macros is trusted: densities come from the
 * batch, the food label, or the recipe and its yield, and every figure is
 * recomputed here with the shared maths.
 */
export async function resolveComponents(
    raw: unknown,
    mode: ComponentMode,
    userId: string | undefined,
    session?: ClientSession
): Promise<IBuffetComponent[]> {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new HttpError(400, 'Add at least one food to the plate')
    }
    if (raw.length > 20) throw new HttpError(400, 'That is a lot of components — 20 at most')

    const items = raw.map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {}))
    const batchIds = items.map((i) => toId(i.batch)).filter(Boolean) as Types.ObjectId[]
    const recipeIds = items.map((i) => toId(i.recipe)).filter(Boolean) as Types.ObjectId[]
    const foodIds = items.map((i) => toId(i.food)).filter(Boolean) as Types.ObjectId[]

    // Sequential, not Promise.all: operations inside one transaction must not
    // run concurrently on its session.
    const batches = await FoodBatch.find({ _id: { $in: batchIds }, user: userId }).session(session ?? null)
    const recipes = await PrepRecipe.find({ _id: { $in: recipeIds }, user: userId }).session(session ?? null)
    const foods = await Food.find({ _id: { $in: foodIds }, user: userId }).session(session ?? null)
    const batchById = new Map(batches.map((b) => [String(b._id), b]))
    const recipeById = new Map(recipes.map((r) => [String(r._id), r]))
    const foodById = new Map(foods.map((f) => [String(f._id), f]))

    const out: IBuffetComponent[] = []
    for (const item of items) {
        const role: BuffetRole = BUFFET_ROLES.includes(item.role as BuffetRole)
            ? (item.role as BuffetRole)
            : 'main'
        const plannedGrams = num(item.plannedGrams)
        const grams = num(item.grams)
        const counted = mode === 'log' ? grams : plannedGrams
        if (!isValidPortionGrams(counted)) {
            throw new HttpError(400, 'Enter a weight between 1 g and 5,000 g for every food', {
                code: 'INVALID_GRAMS',
            })
        }

        let source: IBuffetComponent['source']
        let name: string
        let per100: Macros
        let estimated = false
        const refs: Partial<Pick<IBuffetComponent, 'batch' | 'recipe' | 'food'>> = {}

        const batchId = toId(item.batch)
        const recipeId = toId(item.recipe)
        const foodId = toId(item.food)
        const label = item.label && typeof item.label === 'object' ? (item.label as Record<string, unknown>) : null

        if (batchId) {
            const batch = batchById.get(String(batchId))
            if (!batch) throw new HttpError(404, 'That batch was not found')
            if (mode === 'plan' && batch.status !== 'active') {
                throw new HttpError(409, `${batch.name} is ${batch.status}`, { code: 'BATCH_INACTIVE' })
            }
            source = 'batch'
            name = batch.name
            per100 = batch.per100
            refs.batch = batch._id as Types.ObjectId
            if (batch.recipe) refs.recipe = batch.recipe
        } else if (recipeId) {
            if (mode === 'log') {
                throw new HttpError(400, 'Choose which batch this came from, or enter it as a food', {
                    code: 'UNRESOLVED',
                })
            }
            const recipe = recipeById.get(String(recipeId))
            if (!recipe) throw new HttpError(404, 'That recipe was not found')
            // Prefer a measured yield; a planning estimate typed in now is saved
            // on the recipe so the next plan doesn't ask again.
            const typed = num(item.estimatedYieldGrams)
            if (!recipe.lastYieldGrams && isValidCookedGrams(typed)) {
                recipe.estimatedYieldGrams = typed
                await recipe.save({ session })
            }
            const yieldGrams = recipe.lastYieldGrams || recipe.estimatedYieldGrams
            const density = yieldGrams
                ? per100FromTotals(recipeTotals(recipe.ingredients as IngredientLine[]).totals, yieldGrams)
                : null
            if (!density) {
                throw new HttpError(400, `${recipe.name} has no cooked weight yet — enter an estimated yield`, {
                    code: 'NEEDS_YIELD',
                    recipe: String(recipe._id),
                })
            }
            source = 'recipe'
            name = recipe.name
            per100 = density
            estimated = true
            refs.recipe = recipe._id as Types.ObjectId
        } else if (foodId) {
            const food = foodById.get(String(foodId))
            if (!food) throw new HttpError(404, 'That food was not found')
            const p = per100Grams({
                basis: food.basis,
                per100: food.per100,
                density: food.density,
            })
            if (!p) {
                throw new HttpError(400, `${food.name} is labelled per 100 ml — add its density to weigh it`)
            }
            source = 'food'
            name = food.name
            per100 = p
            refs.food = food._id as Types.ObjectId
        } else if (label && typeof label.name === 'string' && label.name.trim()) {
            source = 'food'
            name = label.name.trim()
            per100 = cleanMacros(label.per100)
        } else {
            throw new HttpError(400, 'Every component needs a batch, a recipe or a food')
        }

        const existingId = toId(item._id)
        out.push({
            _id: existingId ?? new Types.ObjectId(),
            role,
            source,
            ...refs,
            name,
            per100: cleanMacros(per100),
            estimated,
            ...(plannedGrams !== undefined && plannedGrams > 0 ? { plannedGrams } : {}),
            ...(mode === 'log' ? { grams } : {}),
            macros: portionMacros(per100, counted),
        })
    }
    return out
}

/** Re-cost a plate as a plan: planned grams (falling back to what was eaten). */
export function asPlannedComponents(components: IBuffetComponent[]): IBuffetComponent[] {
    return components.map((c) => {
        const plannedGrams = c.grams ?? c.plannedGrams ?? 0
        const plain = typeof (c as unknown as { toObject?: () => IBuffetComponent }).toObject === 'function'
            ? (c as unknown as { toObject: () => IBuffetComponent }).toObject()
            : { ...c }
        delete (plain as Partial<IBuffetComponent>).grams
        return { ...plain, plannedGrams, macros: portionMacros(c.per100, plannedGrams) }
    })
}

/** The tracked stock a logged plate took: its batch components' grams. */
export function consumptionsOf(entry: Pick<IMealPlanEntry, 'status' | 'buffet'>): Consumption[] {
    if (entry.status !== 'eaten' || !entry.buffet) return []
    return consumptionsOfComponents(entry.buffet.components)
}

export function consumptionsOfComponents(components: IBuffetComponent[]): Consumption[] {
    return components
        .filter((c) => c.source === 'batch' && c.batch && (c.grams ?? 0) > 0)
        .map((c) => ({ batchId: String(c.batch), grams: c.grams! }))
}

// ── Moving stock ─────────────────────────────────────────────────────────────

function stockState(b: IFoodBatch): BatchStockState {
    return {
        id: String(b._id),
        remainingGrams: b.remainingGrams,
        reconciledAt: b.reconciledAt ? b.reconciledAt.getTime() : null,
        active: b.status === 'active',
    }
}

/**
 * Move stock from `before` to `after` for one meal, inside `session`.
 *
 * Refuses — throwing, so the surrounding transaction rolls back — on a shortfall
 * or a finished batch, naming the batch so the client can offer to correct the
 * stock, pick another batch or split the portion. Each applied change is a
 * conditional `$inc`, so even outside the transaction's isolation a balance
 * can't be taken below zero.
 */
export async function moveStock(opts: {
    userId: string | undefined
    entryId: Types.ObjectId
    before: Consumption[]
    after: Consumption[]
    occasionAt: number
    date: string
    session: ClientSession
}): Promise<void> {
    const { userId, entryId, before, after, occasionAt, date, session } = opts
    const ids = [...new Set([...before, ...after].map((c) => c.batchId))]
    if (ids.length === 0) return

    const batches = await FoodBatch.find({ _id: { $in: ids }, user: userId }).session(session)
    const byId = new Map(batches.map((b) => [String(b._id), b]))
    const plan = planStockChanges(before, after, occasionAt, new Map(batches.map((b) => [String(b._id), stockState(b)])))

    if (plan.shortfalls.length) {
        const s = plan.shortfalls[0]
        const b = byId.get(s.batchId)!
        throw new HttpError(
            409,
            `Only ${Math.round(s.remainingGrams)} g of ${b.name} is left, and this needs ${Math.round(s.neededGrams)} g.`,
            {
                code: 'INSUFFICIENT_STOCK',
                shortfalls: plan.shortfalls.map((x) => ({ ...x, name: byId.get(x.batchId)?.name })),
            }
        )
    }
    if (plan.inactive.length) {
        const b = byId.get(plan.inactive[0])
        throw new HttpError(409, b ? `${b.name} is marked ${b.status}` : 'That batch no longer exists', {
            code: 'BATCH_INACTIVE',
            batches: plan.inactive,
        })
    }

    const movements = []
    for (const { batchId, delta } of plan.deltas) {
        const guard = delta < 0 ? { remainingGrams: { $gte: -delta - 1e-6 } } : {}
        const updated = await FoodBatch.findOneAndUpdate(
            { _id: batchId, user: userId, ...guard },
            { $inc: { remainingGrams: delta } },
            { new: true, session }
        )
        if (!updated) {
            throw new HttpError(409, 'Stock changed while saving — try again', { code: 'CONFLICT' })
        }
        // Float dust from repeated decimals must not read as negative stock.
        if (updated.remainingGrams < 0) {
            updated.remainingGrams = 0
            await updated.save({ session })
        }
        movements.push({
            user: userId,
            batch: batchId,
            kind: delta < 0 ? 'consume' : 'restore',
            grams: delta,
            balanceAfter: updated.remainingGrams,
            entry: entryId,
            date,
        })
    }
    for (const batchId of plan.sealed) {
        const b = byId.get(batchId)!
        movements.push({
            user: userId,
            batch: batchId,
            kind: 'restore',
            grams: 0,
            sealed: true,
            balanceAfter: b.remainingGrams,
            entry: entryId,
            date,
            note: 'Meal edited after the stock was measured — the measured balance stands',
        })
    }
    if (movements.length) await StockMovement.insertMany(movements, { session })
}
