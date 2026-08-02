import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Meal, { MEAL_TYPES, MealType, IIngredient, IMacros } from '../models/Meal'

/** Coerce a request value to a non-negative number, or a fallback if invalid. */
function toAmount(raw: unknown, fallback = 0): number {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Coerce a value to non-negative minutes, or undefined if absent/invalid. */
function toPrepTime(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** Coerce a value to a 0–1 fraction, or undefined if absent/invalid. */
function toOverhead(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n)) return undefined
    return Math.min(1, Math.max(0, n))
}

/** Keep only the recognised meal-type strings, de-duplicated. */
function toTypes(raw: unknown): MealType[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<MealType>()
    for (const t of raw) if (MEAL_TYPES.includes(t as MealType)) seen.add(t as MealType)
    return [...seen]
}

/** Normalise the ingredients array, dropping entries without a name. */
function toIngredients(raw: unknown): IIngredient[] {
    if (!Array.isArray(raw)) return []
    const out: IIngredient[] = []
    for (const raw_item of raw) {
        if (!raw_item || typeof raw_item !== 'object') continue
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const quantity = typeof item.quantity === 'string' ? item.quantity.trim() || undefined : undefined
        const unit = typeof item.unit === 'string' ? item.unit.trim() || undefined : undefined
        out.push({ name, quantity, unit })
    }
    return out
}

/** Normalise the method steps, dropping blank lines. */
function toMethod(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
}

/** Build the macros object from a request body value. */
function toMacros(raw: unknown): IMacros {
    const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    return {
        calories: toAmount(m.calories),
        protein: toAmount(m.protein),
        carbs: toAmount(m.carbs),
        fat: toAmount(m.fat),
    }
}

/** Meals returned per page when paginating the library. */
const PAGE_SIZE = 18

/** Escape a user string for safe use inside a RegExp. */
function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * GET /api/meals — list the user's meals in library order.
 *
 * Paginated by default (18 per page): `?page=2&type=breakfast`. A `?search=`
 * term filters by meal name (case-insensitive substring). Pass `?all=1` to get
 * the whole library in one go (the weekly planner's picker needs every meal to
 * search across). The response carries `page`, `pages` and `total` alongside
 * `data`.
 */
export async function listMeals(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    const type = req.query.type
    if (typeof type === 'string' && MEAL_TYPES.includes(type as MealType)) {
        query.types = type
    }

    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    if (search) {
        query.name = { $regex: escapeRegExp(search), $options: 'i' }
    }

    if (req.query.all) {
        const meals = await Meal.find(query).sort({ order: 1, createdAt: 1 })
        res.json({ message: 'OK', data: meals, page: 1, pages: 1, total: meals.length })
        return
    }

    const page = Math.max(1, Math.floor(Number(req.query.page)) || 1)
    const total = await Meal.countDocuments(query)
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const meals = await Meal.find(query)
        .sort({ order: 1, createdAt: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)

    res.json({ message: 'OK', data: meals, page, pages, total })
}

/** POST /api/meals — create a meal, appended to the end of the library. */
export async function createMeal(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await Meal.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const meal = await Meal.create({
        user: req.userId,
        name,
        types: toTypes(req.body.types),
        servings: Math.max(1, toAmount(req.body.servings, 1)),
        servingLabel: typeof req.body.servingLabel === 'string' ? req.body.servingLabel.trim() || undefined : undefined,
        prepTime: toPrepTime(req.body.prepTime),
        prepOverhead: toOverhead(req.body.prepOverhead),
        macros: toMacros(req.body.macros),
        ingredients: toIngredients(req.body.ingredients),
        method: toMethod(req.body.method),
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || undefined : undefined,
        link: typeof req.body.link === 'string' ? req.body.link.trim() || undefined : undefined,
        order,
    })
    res.status(201).json({ message: 'Created', data: meal })
}

/** PUT /api/meals/:id — update fields and/or reorder. */
export async function updateMeal(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    // Optional fields the caller can clear by sending an empty/absent value.
    const unset: Record<string, ''> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (Array.isArray(b.types)) fields.types = toTypes(b.types)
    if (b.servings !== undefined) fields.servings = Math.max(1, toAmount(b.servings, 1))
    if (typeof b.servingLabel === 'string') fields.servingLabel = b.servingLabel.trim() || undefined
    if ('prepTime' in b) {
        const v = toPrepTime(b.prepTime)
        if (v === undefined) unset.prepTime = ''
        else fields.prepTime = v
    }
    if ('prepOverhead' in b) {
        const v = toOverhead(b.prepOverhead)
        if (v === undefined) unset.prepOverhead = ''
        else fields.prepOverhead = v
    }
    if (b.macros !== undefined) fields.macros = toMacros(b.macros)
    if (Array.isArray(b.ingredients)) fields.ingredients = toIngredients(b.ingredients)
    if (Array.isArray(b.method)) fields.method = toMethod(b.method)
    if (typeof b.notes === 'string') fields.notes = b.notes.trim() || undefined
    if (typeof b.link === 'string') fields.link = b.link.trim() || undefined
    if (typeof b.order === 'number') fields.order = b.order

    const update: Record<string, unknown> = { $set: fields }
    if (Object.keys(unset).length) update.$unset = unset

    const meal = await Meal.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        update,
        { new: true }
    )
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    res.json({ message: 'Saved', data: meal })
}

/**
 * POST /api/meals/import — bulk-import meals from a pasted JSON document.
 *
 * Accepts either a bare array of meal objects or an object with a `meals` array
 * plus an optional `overwrite` list of names. Validation is all-or-nothing: if
 * any item is malformed the whole import is rejected with a per-item reason, so
 * a partial import never surprises the user.
 *
 * Meals whose (case-insensitive) name already exists in the library are treated
 * as duplicates. A duplicate whose name is in `overwrite` replaces the existing
 * meal in place (keeping its id and order); a duplicate not listed is skipped.
 * Everything else is appended to the end of the library in the pasted order.
 */
export async function importMeals(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const rawList = Array.isArray(body)
        ? body
        : body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).meals)
          ? ((body as Record<string, unknown>).meals as unknown[])
          : null

    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of meals, or an object with a "meals" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No meals found to import.' })
        return
    }

    // Names the caller has chosen to overwrite (case-insensitive).
    const overwriteRaw =
        body && typeof body === 'object' && !Array.isArray(body)
            ? (body as Record<string, unknown>).overwrite
            : undefined
    const overwrite = new Set<string>(
        Array.isArray(overwriteRaw)
            ? overwriteRaw.filter((n): n is string => typeof n === 'string').map((n) => n.trim().toLowerCase())
            : []
    )

    const errors: string[] = []
    const normalised = rawList.map((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Meal ${i + 1}: must be an object`)
            return null
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Meal ${i + 1}: "name" is required`)
            return null
        }
        return {
            name,
            types: toTypes(item.types),
            servings: Math.max(1, toAmount(item.servings, 1)),
            servingLabel: typeof item.servingLabel === 'string' ? item.servingLabel.trim() || undefined : undefined,
            prepTime: toPrepTime(item.prepTime),
            prepOverhead: toOverhead(item.prepOverhead),
            macros: toMacros(item.macros),
            ingredients: toIngredients(item.ingredients),
            method: toMethod(item.method),
            notes: typeof item.notes === 'string' ? item.notes.trim() || undefined : undefined,
            link: typeof item.link === 'string' ? item.link.trim() || undefined : undefined,
        }
    })

    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }
    const fields = normalised as NonNullable<(typeof normalised)[number]>[]

    // Map the user's existing library by lowercased name, so we can spot
    // duplicates and overwrite in place. A name may exist more than once; we
    // overwrite the first (lowest-order) match.
    const existing = await Meal.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    const existingByName = new Map<string, (typeof existing)[number]>()
    for (const m of existing) {
        const key = m.name.toLowerCase()
        if (!existingByName.has(key)) existingByName.set(key, m)
    }

    const last = existing[existing.length - 1]
    let order = last ? last.order + 1 : 0

    let created = 0
    let updated = 0
    let skipped = 0
    const affected: (typeof existing)[number][] = []

    for (const f of fields) {
        const key = f.name.toLowerCase()
        const match = existingByName.get(key)
        if (match) {
            if (!overwrite.has(key)) {
                skipped++
                continue
            }
            match.set(f)
            await match.save()
            updated++
            affected.push(match)
        } else {
            const doc = await Meal.create({ ...f, user: req.userId, order: order++ })
            created++
            affected.push(doc)
            // A later payload item with the same name now clashes with this one.
            existingByName.set(key, doc)
        }
    }

    const parts: string[] = []
    if (created) parts.push(`imported ${created}`)
    if (updated) parts.push(`overwrote ${updated}`)
    if (skipped) parts.push(`skipped ${skipped}`)
    const summary = parts.length ? parts.join(', ') : 'nothing to import'

    res.status(201).json({
        message: `Import complete — ${summary}.`,
        created,
        updated,
        skipped,
        data: affected,
    })
}

/** DELETE /api/meals/:id — remove a meal. */
export async function deleteMeal(req: AuthRequest, res: Response) {
    const meal = await Meal.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!meal) {
        res.status(404).json({ message: 'Meal not found' })
        return
    }
    res.json({ message: 'Deleted', data: meal })
}
