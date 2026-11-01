import { Types } from 'mongoose'
import { IMacros } from '../models/Meal'
import PlateFood, { IIngredient, IPlateFood } from '../models/PlateFood'
import BoxCook, { IBoxCook } from '../models/BoxCook'
import MealPlanEntry, { IPlateLine } from '../models/MealPlanEntry'
import { lineMacros, per100FromCook, plateName, plateTotal, rawTotal, round, shareOut, ZERO } from './plates'

/**
 * Turning what the client sends for a plate — food + grams (+ a batch, when
 * there's a choice) — into stored lines with their per-100 g figures, and
 * keeping still-planned plates in step when a box is cooked again.
 */

/** Open batches in use (not frozen), oldest first — the order they get eaten in. */
const IN_USE = { finished: false, frozen: { $ne: true } }
const OLDEST_FIRST = { date: 1, createdAt: 1 } as const

/**
 * Grams of each batch on plates with a given status, keyed by batch id. A line
 * that spilled across batches counts each part against the batch it came from.
 */
export async function gramsByBatch(userId: string, ids: Types.ObjectId[], status: 'eaten' | 'planned') {
    if (ids.length === 0) return new Map<string, number>()
    const rows = await MealPlanEntry.aggregate<{ _id: Types.ObjectId; grams: number }>([
        {
            $match: {
                user: new Types.ObjectId(userId),
                status,
                $or: [{ 'plate.batch': { $in: ids } }, { 'plate.takes.batch': { $in: ids } }],
            },
        },
        { $unwind: '$plate' },
        {
            $project: {
                parts: {
                    $cond: [
                        { $gt: [{ $size: { $ifNull: ['$plate.takes', []] } }, 0] },
                        '$plate.takes',
                        [{ batch: '$plate.batch', grams: '$plate.grams' }],
                    ],
                },
            },
        },
        { $unwind: '$parts' },
        { $match: { 'parts.batch': { $in: ids } } },
        { $group: { _id: '$parts.batch', grams: { $sum: '$parts.grams' } } },
    ])
    return new Map(rows.map((r) => [String(r._id), r.grams]))
}

/**
 * The batch a food's next plate comes out of: the oldest open one with some
 * left, else the newest open one. Batches in the freezer never count.
 */
async function nextBatch(userId: string, foodId: Types.ObjectId | string): Promise<IBoxCook | null> {
    const open = await BoxCook.find({ user: userId, food: foodId, ...IN_USE }).sort(OLDEST_FIRST)
    if (open.length === 0) return null
    const eaten = await gramsByBatch(userId, open.map((c) => c._id as Types.ObjectId), 'eaten')
    return open.find((c) => c.cookedGrams - (eaten.get(String(c._id)) ?? 0) > 0) ?? open[open.length - 1]
}

/**
 * The batch a box's plates draw from: the next one out of the pantry, else
 * the newest at all (so a finished box still has figures).
 */
export async function currentCook(userId: string, foodId: Types.ObjectId | string): Promise<IBoxCook | null> {
    const next = await nextBatch(userId, foodId)
    if (next) return next
    return BoxCook.findOne({ user: userId, food: foodId, frozen: { $ne: true } }).sort({ date: -1, createdAt: -1 })
}

/**
 * Share every eaten plate drawn from open batches out across them the way a
 * fridge empties: oldest batch first, in the order the plates were eaten, and
 * a plate that empties one batch takes the rest from the next. Whatever's over
 * once they're all used up lands on the newest. Parts already taken from a
 * finished batch stay put. A box line's figures follow where it came from.
 * Only plates whose split changes are saved.
 */
export async function pourEaten(userId: string) {
    const open = await BoxCook.find({ user: userId, ...IN_USE }).sort(OLDEST_FIRST)
    if (open.length === 0) return
    const ids = open.map((c) => c._id as Types.ObjectId)
    const isOpen = new Set(ids.map(String))
    const byFood = new Map<string, IBoxCook[]>()
    for (const c of open) byFood.set(String(c.food), [...(byFood.get(String(c.food)) ?? []), c])
    const room = new Map(open.map((c) => [String(c._id), c.cookedGrams]))

    const entries = await MealPlanEntry.find({
        user: userId,
        status: 'eaten',
        $or: [{ 'plate.batch': { $in: ids } }, { 'plate.takes.batch': { $in: ids } }],
    }).sort({ date: 1, createdAt: 1 })
    if (entries.length === 0) return

    // Figures of every batch a line can name — finished ones included.
    const named = entries.flatMap((e) =>
        (e.plate ?? []).flatMap((l) => [l.batch, ...(l.takes ?? []).map((t) => t.batch)].filter(Boolean))
    )
    const cooks = await BoxCook.find({ user: userId, _id: { $in: named } })
    const per100Of = new Map(cooks.map((c) => [String(c._id), c.per100]))
    const plainFoods = new Set(
        (await PlateFood.find({ user: userId, kind: 'plain', _id: { $in: [...byFood.keys()] } })).map((f) =>
            String(f._id)
        )
    )

    for (const e of entries) {
        const before = JSON.stringify(e.plate)
        const plate = (e.plate ?? []).map((l): IPlateLine => {
            const line: IPlateLine = {
                food: l.food,
                name: l.name,
                grams: l.grams,
                ...(l.batch ? { batch: l.batch } : {}),
                ...(l.takes?.length ? { takes: l.takes.map((t) => ({ batch: t.batch, grams: t.grams })) } : {}),
                per100: { ...ZERO, ...JSON.parse(JSON.stringify(l.per100 ?? {})) },
            }
            const batches = byFood.get(String(l.food))
            const parts = line.takes ?? (line.batch ? [{ batch: line.batch, grams: line.grams }] : [])
            if (!batches || !parts.some((p) => isOpen.has(String(p.batch)))) return line

            const kept = parts.filter((p) => !isOpen.has(String(p.batch)))
            const grams = Math.max(0, line.grams - kept.reduce((sum, p) => sum + p.grams, 0))
            const poured = shareOut(grams, batches.map((c) => String(c._id)), room).map((t) => ({
                batch: new Types.ObjectId(t.batch),
                grams: t.grams,
            }))
            // Nothing to pour (a 0 g line) still belongs to a batch.
            const takes = [...kept, ...poured]
            if (takes.length === 0) takes.push({ batch: batches[0]._id as Types.ObjectId, grams: 0 })

            const out: IPlateLine = { food: line.food, name: line.name, grams: line.grams, batch: takes[0].batch, per100: line.per100 }
            if (takes.length > 1) out.takes = takes
            if (!plainFoods.has(String(l.food))) {
                // A box counts at each batch's own figures, weighted by the grams from it.
                const total = takes.reduce((sum, t) => sum + t.grams, 0)
                const weighted = takes.reduce(
                    (sum, t) => {
                        const p = per100Of.get(String(t.batch)) ?? line.per100
                        const w = total > 0 ? t.grams / total : 1 / takes.length
                        return {
                            calories: sum.calories + p.calories * w,
                            protein: sum.protein + p.protein * w,
                            carbs: sum.carbs + p.carbs * w,
                            fat: sum.fat + p.fat * w,
                        }
                    },
                    { ...ZERO }
                )
                out.per100 = round(weighted)
            }
            return out
        })
        Object.assign(e, plateFields(plate))
        if (JSON.stringify(e.plate) !== before) await e.save()
    }
}

/** Lines from a request body, resolved against the library — or an error message. */
export async function resolvePlate(userId: string, raw: unknown): Promise<IPlateLine[] | string> {
    if (!Array.isArray(raw) || raw.length === 0) return 'A plate needs at least one food'
    const lines: IPlateLine[] = []
    for (const item of raw) {
        const r = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
        const grams = Number(r.grams)
        if (!Types.ObjectId.isValid(String(r.food))) return 'Each line needs a food'
        if (!Number.isFinite(grams) || grams < 0) return 'Grams must be a number of 0 or more'
        const food = await PlateFood.findOne({ _id: r.food, user: userId })
        if (!food) return 'Food not found'

        if (food.kind === 'plain') {
            // A plain food counts at its own figures; a batch, when one was
            // picked, is only so the pantry knows how much is left.
            const batch =
                typeof r.batch === 'string' && Types.ObjectId.isValid(r.batch)
                    ? await BoxCook.findOne({ _id: r.batch, user: userId, food: food._id })
                    : null
            lines.push({
                food: food._id,
                name: food.name,
                grams,
                ...(batch ? { batch: batch._id } : {}),
                per100: food.per100 ?? { ...ZERO },
            })
            continue
        }
        const picked =
            typeof r.batch === 'string' && Types.ObjectId.isValid(r.batch)
                ? await BoxCook.findOne({ _id: r.batch, user: userId, food: food._id })
                : null
        const cook = picked ?? (await currentCook(userId, food._id))
        lines.push({
            food: food._id,
            name: food.name,
            grams,
            ...(cook ? { batch: cook._id } : {}),
            // Never cooked yet: it counts as nothing until a batch is logged.
            per100: cook?.per100 ?? { ...ZERO },
        })
    }
    return lines
}

/** The fields a plate entry stores, from its lines. */
export function plateFields(lines: IPlateLine[]) {
    return { plate: lines, name: plateName(lines), macros: plateTotal(lines) }
}

/**
 * Point every still-planned plate line for a food at fresh figures — a new
 * cook of a box, or a plain food's edited macros. Eaten plates keep theirs.
 * `batch` moves the lines to that batch; null takes them off any batch;
 * left out, each line keeps the one it had.
 */
export async function repricePlanned(
    userId: string,
    foodId: Types.ObjectId,
    next: { name: string; per100: IMacros; batch?: Types.ObjectId | null }
) {
    const entries = await MealPlanEntry.find({ user: userId, status: 'planned', 'plate.food': foodId })
    for (const e of entries) {
        const lines = (e.plate ?? []).map((l) => {
            if (String(l.food) !== String(foodId)) return l
            const line: IPlateLine = { food: l.food, name: next.name, grams: l.grams, per100: next.per100 }
            const batch = next.batch === undefined ? l.batch : next.batch
            if (batch) line.batch = batch
            return line
        })
        Object.assign(e, plateFields(lines))
        await e.save()
    }
}

/**
 * Move a food's still-planned plates onto whichever batch now counts, after
 * sharing eaten plates out across the batches again. A plain food's plates
 * keep its own figures and draw from its next batch in use, if any.
 */
export async function followCurrent(userId: string, foodId: Types.ObjectId | string) {
    await pourEaten(userId)
    const food = await PlateFood.findOne({ _id: foodId, user: userId })
    if (!food) return
    if (food.kind === 'plain') {
        const inUse = await nextBatch(userId, food._id)
        await repricePlanned(userId, food._id, {
            name: food.name,
            per100: food.per100 ?? { ...ZERO },
            batch: inUse?._id ?? null,
        })
        return
    }
    const cook = await currentCook(userId, food._id)
    await repricePlanned(userId, food._id, {
        name: food.name,
        per100: cook?.per100 ?? { ...ZERO },
        batch: cook?._id ?? null,
    })
}

/**
 * Log a cook of a box: the raw ingredients and the cooked weight give its
 * macros per 100 g. A plain food's batch (a box of rice) has no ingredients —
 * it counts at the food's own figures, and the batch just tracks what's left. `finishOpen` marks the box's earlier batches in use as
 * finished (never ones in the freezer). `frozen` puts the new batch straight
 * in the freezer. Plates still planned move onto whichever batch now counts.
 */
export async function logCook(
    userId: string,
    food: IPlateFood,
    cook: { date: string; ingredients: IIngredient[]; cookedGrams: number; finishOpen?: boolean; frozen?: boolean }
): Promise<IBoxCook> {
    if (cook.finishOpen) {
        await BoxCook.updateMany(
            { user: userId, food: food._id, finished: false, frozen: { $ne: true } },
            { finished: true }
        )
    }
    const plain = food.kind === 'plain'
    const per100 = food.per100 ?? { ...ZERO }
    const raw = plain ? round(lineMacros(cook.cookedGrams, per100)) : rawTotal(cook.ingredients)
    const created = await BoxCook.create({
        user: userId,
        food: food._id,
        name: food.name,
        date: cook.date,
        ingredients: plain ? [] : cook.ingredients,
        raw,
        cookedGrams: cook.cookedGrams,
        per100: plain ? per100 : per100FromCook(raw, cook.cookedGrams),
        frozen: cook.frozen === true,
    })
    await followCurrent(userId, food._id)
    return created
}
