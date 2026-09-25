import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import Meal, { MEAL_TYPES, MealType, IMacros } from '../models/Meal'
import MealPlanEntry from '../models/MealPlanEntry'

function toNumber(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
}

function toMacros(raw: unknown): IMacros {
    const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
        calories: toNumber(m.calories),
        protein: toNumber(m.protein),
        carbs: toNumber(m.carbs),
        fat: toNumber(m.fat),
    }
}

function toTypes(raw: unknown): MealType[] {
    if (!Array.isArray(raw)) return []
    return [...new Set(raw.filter((t): t is MealType => MEAL_TYPES.includes(t as MealType)))]
}

/** A meal from a request body, or an error message. */
function readMeal(body: unknown): { name: string; types: MealType[]; macros: IMacros; notes?: string } | string {
    const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
    const name = typeof b.name === 'string' ? b.name.trim() : ''
    if (!name) return 'A meal needs a name'
    return {
        name,
        types: toTypes(b.types),
        macros: toMacros(b.macros),
        notes: typeof b.notes === 'string' ? b.notes.trim() || undefined : undefined,
    }
}

/** GET /api/meals — the whole library, in order. */
export async function listMeals(req: AuthRequest, res: Response) {
    const meals = await Meal.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: meals })
}

/** POST /api/meals */
export async function createMeal(req: AuthRequest, res: Response) {
    const fields = readMeal(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const last = await Meal.findOne({ user: req.userId }).sort({ order: -1 })
    const meal = await Meal.create({ user: req.userId, ...fields, order: (last?.order ?? -1) + 1 })
    res.status(201).json({ message: 'Created', data: meal })
}

/**
 * PUT /api/meals/:id — edits flow into days where the meal is still only
 * planned; days it was eaten keep the figures they were logged with.
 */
export async function updateMeal(req: AuthRequest, res: Response) {
    const fields = readMeal(req.body)
    if (typeof fields === 'string') {
        res.status(400).json({ message: fields })
        return
    }
    const meal = await Meal.findOneAndUpdate({ _id: req.params.id, user: req.userId }, fields, { new: true })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    await MealPlanEntry.updateMany(
        { user: req.userId, meal: meal._id, status: 'planned' },
        { name: meal.name, macros: meal.macros }
    )
    res.json({ message: 'OK', data: meal })
}

/**
 * POST /api/meals/import — [{ name, types, macros }], or { meals: [...] }.
 * Adds them to the end of the library; entries without a name are skipped.
 */
export async function importMeals(req: AuthRequest, res: Response) {
    const list = Array.isArray(req.body) ? req.body : req.body?.meals
    if (!Array.isArray(list)) {
        res.status(400).json({ message: 'Expected a list of meals' })
        return
    }
    const last = await Meal.findOne({ user: req.userId }).sort({ order: -1 })
    let order = (last?.order ?? -1) + 1
    const docs = []
    let skipped = 0
    for (const raw of list) {
        const fields = readMeal(raw)
        if (typeof fields === 'string') skipped++
        else docs.push({ user: new Types.ObjectId(req.userId), ...fields, order: order++ })
    }
    const created = await Meal.insertMany(docs)
    res.status(201).json({ message: 'Imported', data: { created: created.length, skipped } })
}

/** DELETE /api/meals/:id — past days keep their copy; planned-only days lose it. */
export async function deleteMeal(req: AuthRequest, res: Response) {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    await MealPlanEntry.deleteMany({ user: req.userId, meal: meal._id, status: 'planned' })
    res.json({ message: 'Deleted' })
}

/** DELETE /api/meals — the whole library. Eaten days keep their copies, as with one meal. */
export async function deleteAllMeals(req: AuthRequest, res: Response) {
    const { deletedCount } = await Meal.deleteMany({ user: req.userId })
    await MealPlanEntry.deleteMany({ user: req.userId, status: 'planned', meal: { $ne: null } })
    res.json({ message: 'Deleted', data: { deleted: deletedCount } })
}
