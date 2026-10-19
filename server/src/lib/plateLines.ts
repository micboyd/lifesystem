import { Types } from 'mongoose'
import { IMacros } from '../models/Meal'
import PlateFood from '../models/PlateFood'
import BoxCook, { IBoxCook } from '../models/BoxCook'
import MealPlanEntry, { IPlateLine } from '../models/MealPlanEntry'
import { plateName, plateTotal, ZERO } from './plates'

/**
 * Turning what the client sends for a plate — food + grams (+ a batch, when
 * there's a choice) — into stored lines with their per-100 g figures, and
 * keeping still-planned plates in step when a box is cooked again.
 */

/** The batch a box's plates draw from: the newest still open, else the newest at all. */
export async function currentCook(userId: string, foodId: Types.ObjectId | string): Promise<IBoxCook | null> {
    const open = await BoxCook.findOne({ user: userId, food: foodId, finished: false }).sort({
        date: -1,
        createdAt: -1,
    })
    if (open) return open
    return BoxCook.findOne({ user: userId, food: foodId }).sort({ date: -1, createdAt: -1 })
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
            lines.push({ food: food._id, name: food.name, grams, per100: food.per100 ?? { ...ZERO } })
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
            if (next.batch) line.batch = next.batch
            return line
        })
        Object.assign(e, plateFields(lines))
        await e.save()
    }
}
