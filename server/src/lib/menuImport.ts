import { MEAL_TYPES, type MealType } from '../models/Meal'
import { nameKey } from './importReconcile'

/**
 * A nutrition plan's meal week as written in an import: days, then slots, then
 * library meals by name. Shorthand rows fill several days at once and specific
 * days override them, so a week of the same breakfast takes one line:
 *
 *   "menu": {
 *     "everyDay": { "breakfast": "Overnight oats", "snack": "Rice cakes" },
 *     "weekdays": { "lunch": "Chicken stroganoff" },
 *     "sat": { "lunch": "Teriyaki & ginger", "dinner": ["Curry", "Naan"] }
 *   }
 *
 * The array form the API stores ([{ day: 0–6 | "mon", slot, meal }]) is taken
 * too. Meals are matched by name, case-insensitively, or by id. Pure, so it
 * can be tested without a database.
 */

export interface ParsedMenuItem {
    day: number
    slot: MealType
    meal: string
}

const DAY_KEYS: Record<string, number[]> = {
    mon: [0], monday: [0],
    tue: [1], tues: [1], tuesday: [1],
    wed: [2], wednesday: [2],
    thu: [3], thur: [3], thurs: [3], thursday: [3],
    fri: [4], friday: [4],
    sat: [5], saturday: [5],
    sun: [6], sunday: [6],
    everyday: [0, 1, 2, 3, 4, 5, 6], daily: [0, 1, 2, 3, 4, 5, 6], all: [0, 1, 2, 3, 4, 5, 6],
    weekdays: [0, 1, 2, 3, 4],
    weekend: [5, 6], weekends: [5, 6],
}

/** Shorthand rows go first so a named day written after them replaces their slots. */
const SPAN_KEYS = new Set(['everyday', 'daily', 'all', 'weekdays', 'weekend', 'weekends'])

const SLOT_KEYS: Record<string, MealType> = {
    breakfast: 'breakfast',
    lunch: 'lunch',
    dinner: 'dinner',
    tea: 'dinner',
    supper: 'dinner',
    snack: 'snack',
    snacks: 'snack',
}

const dayKey = (k: string) => k.toLowerCase().replace(/[\s_-]/g, '')

function readDays(v: unknown): number[] | null {
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6) return [v]
    if (typeof v === 'string') return DAY_KEYS[dayKey(v)] ?? null
    return null
}

/**
 * The menu in an import entry. `undefined` when the key is absent (leave any
 * existing week alone); otherwise the items, the names that matched nothing,
 * or an error saying what's wrong with the shape.
 */
export function parseMenu(
    raw: unknown,
    lookup: (nameOrId: string) => string | null
): { items: ParsedMenuItem[]; unknown: string[]; unknownSlots: Record<string, MealType[]> } | { error: string } | undefined {
    if (raw === undefined) return undefined
    if (raw === null) return { items: [], unknown: [], unknownSlots: {} }
    // Names that match nothing, and the slots they were written in — enough to add them as meals.
    const unknown = new Map<string, Set<MealType>>()
    const resolve = (name: unknown, slot: MealType): string | null => {
        if (typeof name !== 'string' || !name.trim()) return null
        const id = lookup(name.trim())
        if (!id) {
            const key = [...unknown.keys()].find((k) => nameKey(k) === nameKey(name)) ?? name.trim()
            unknown.set(key, (unknown.get(key) ?? new Set()).add(slot))
        }
        return id
    }
    const misses = () => ({
        unknown: [...unknown.keys()],
        unknownSlots: Object.fromEntries([...unknown].map(([n, slots]) => [n, MEAL_TYPES.filter((t) => slots.has(t))])),
    })

    if (Array.isArray(raw)) {
        const items: ParsedMenuItem[] = []
        for (const [i, row] of raw.entries()) {
            const r = (row ?? {}) as Record<string, unknown>
            const days = readDays(r.day)
            const slot = typeof r.slot === 'string' ? SLOT_KEYS[r.slot.toLowerCase()] : undefined
            if (!days || days.length !== 1 || !slot || typeof r.meal !== 'string')
                return { error: `menu item ${i + 1} needs a day (mon–sun), a slot and a meal` }
            const meal = resolve(r.meal, slot)
            if (meal) items.push({ day: days[0], slot, meal })
        }
        return { items, ...misses() }
    }

    if (typeof raw !== 'object') return { error: 'menu must be an object of days, or a list' }

    const entries = Object.entries(raw as Record<string, unknown>)
    for (const [key] of entries)
        if (!DAY_KEYS[dayKey(key)])
            return { error: `menu has an unknown day "${key}" (use mon–sun, weekdays, weekend or everyDay)` }
    // Spans first, then single days, each replacing the slots it names.
    entries.sort(([a], [b]) => Number(!SPAN_KEYS.has(dayKey(a))) - Number(!SPAN_KEYS.has(dayKey(b))))

    const grid = new Map<string, string[]>() // "day|slot" → meal ids
    for (const [key, value] of entries) {
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return { error: `menu.${key} must be an object of slots, like { "lunch": "Meal name" }` }
        for (const [slotKey, names] of Object.entries(value as Record<string, unknown>)) {
            const slot = SLOT_KEYS[slotKey.toLowerCase()]
            if (!slot) return { error: `menu.${key} has an unknown slot "${slotKey}" (use ${MEAL_TYPES.join(', ')})` }
            const list = names === null ? [] : Array.isArray(names) ? names : [names]
            if (!list.every((n) => typeof n === 'string'))
                return { error: `menu.${key}.${slotKey} must be a meal name or a list of names` }
            const ids = list.map((n) => resolve(n, slot)).filter((x): x is string => !!x)
            for (const day of DAY_KEYS[dayKey(key)]) grid.set(`${day}|${slot}`, ids)
        }
    }

    const items: ParsedMenuItem[] = []
    for (let day = 0; day < 7; day++)
        for (const slot of MEAL_TYPES) for (const meal of grid.get(`${day}|${slot}`) ?? []) items.push({ day, slot, meal })
    return { items, ...misses() }
}

/** A lookup from library meals: by id, then by name ignoring case. */
export function mealLookup(meals: { _id: unknown; name: string }[]): (nameOrId: string) => string | null {
    const byName = new Map(meals.map((m) => [nameKey(m.name), String(m._id)]))
    const ids = new Set(meals.map((m) => String(m._id)))
    return (v) => (ids.has(v) ? v : (byName.get(nameKey(v)) ?? null))
}

/**
 * `putOnPlanner` in an import: true (from today, or the plan's start), a
 * YYYY-MM-DD to start from, or absent / false for not at all.
 */
export function readPutOn(v: unknown): { from?: string } | null | { error: string } {
    if (v === undefined || v === false || v === null) return null
    if (v === true) return {}
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { from: v }
    return { error: 'putOnPlanner must be true, false or a YYYY-MM-DD date to start from' }
}

/** A meal a plan import describes itself, so it can be added to the Library with its macros. */
export interface NewMealSpec {
    name: string
    types?: MealType[]
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
}

const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat'] as const

/**
 * `meals` in an import entry: the meals its menu names that the Library may not
 * have yet, with their macros, so the "add them?" step comes pre-filled:
 *
 *   "meals": [{ "name": "Chicken sausages", "types": ["breakfast"], "calories": 220, "protein": 24 }]
 *
 * Macros may sit flat or under "macros". Nothing is created here; a meal the
 * Library already has is left alone. Absent → an empty list.
 */
export function readNewMeals(raw: unknown): NewMealSpec[] | { error: string } {
    if (raw === undefined || raw === null) return []
    if (!Array.isArray(raw)) return { error: 'meals must be a list, like [{ "name": "…", "calories": 220 }]' }
    const out: NewMealSpec[] = []
    for (const [i, row] of raw.entries()) {
        const r = (row ?? {}) as Record<string, unknown>
        if (typeof r.name !== 'string' || !r.name.trim()) return { error: `meals item ${i + 1} needs a name` }
        const spec: NewMealSpec = { name: r.name.trim() }
        const source = r.macros && typeof r.macros === 'object' ? (r.macros as Record<string, unknown>) : r
        for (const k of MACRO_KEYS) {
            const v = source[k]
            if (v === undefined || v === null) continue
            if (typeof v !== 'number' || !Number.isFinite(v) || v < 0)
                return { error: `meals item ${i + 1} ("${spec.name}"): ${k} must be a number 0 or more` }
            spec[k] = v
        }
        const typesRaw = r.types ?? r.slots
        if (typesRaw !== undefined) {
            const list = Array.isArray(typesRaw) ? typesRaw : [typesRaw]
            const types = list.map((t) => (typeof t === 'string' ? SLOT_KEYS[t.toLowerCase()] : undefined))
            if (types.some((t) => !t))
                return { error: `meals item ${i + 1} ("${spec.name}"): types are ${MEAL_TYPES.join(', ')}` }
            spec.types = MEAL_TYPES.filter((t) => types.includes(t))
        }
        out.push(spec)
    }
    return out
}
