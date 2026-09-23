import type { FoodBatch, MealPlanEntry, PrepCategory, PrepRecipe } from '../types'
import { addDays, parseDateKey, WEEKDAYS_LONG } from './calendar'
import { daysBetween } from './weightTrend'
import { grams as fmtGrams } from './mealPrep'

/**
 * How long each prepared food will last, and when to cook more.
 *
 * Deterministic on purpose: the same stock, plan and history always give the
 * same answer, and every figure can be traced to a plan entry or a logged
 * portion. Where the data is thin it says less rather than guessing — a planned
 * shortfall or a plain low-stock warning, never an invented run-out date.
 *
 * Demand comes from two places, in this order:
 *   1. still-planned buffet components, day by day;
 *   2. your recent pace, but only on days with nothing planned for that food —
 *      a planned lunch and "you usually eat this daily" are the same occasion,
 *      and counting both would forecast twice the demand.
 *
 * Nothing here judges whether food is still safe to eat; dates are shown as the
 * user entered them.
 */

/** How far ahead demand is simulated. */
export const HORIZON_DAYS = 7
/** How far back recent portions and pace are read. */
export const HISTORY_DAYS = 14
/** A pace needs at least this many logged portions, on this many distinct days. */
export const MIN_PACE_PORTIONS = 3
/** Portions below which a food is low, unless the recipe says otherwise. */
export const DEFAULT_LOW_STOCK_PORTIONS = 2
/** Days of notice before a run-out — 1 means "cook the evening before". */
export const DEFAULT_LEAD_DAYS = 1

/**
 * The portion assumed before you've set one or logged any — labelled as a
 * default wherever it's used. Deliberately round and unremarkable.
 */
export const FALLBACK_PORTION_GRAMS: Record<PrepCategory, number> = {
    main: 200,
    side: 150,
    extra: 50,
}

export type PortionSource = 'set' | 'recent' | 'default'

export interface FoodForecast {
    /** The recipe id, or `batch:<id>` for a batch whose recipe is gone. */
    key: string
    recipe: PrepRecipe | null
    name: string
    category: PrepCategory
    /** Fridge stock across every active batch of this food. */
    readyGrams: number
    /** Freezer stock — available, but not ready to eat. */
    frozenGrams: number
    batches: FoodBatch[]
    portion: { grams: number; source: PortionSource }
    readyPortions: number
    threshold: { grams: number; label: string }
    lowStock: boolean
    /** Still-planned grams over the horizon, today included. */
    plannedGrams: number
    /** Ready stock minus planned demand — negative is a shortfall. */
    afterPlanGrams: number
    /** Recent grams per day, when there's enough history to say. */
    pace: number | null
    /** The first day demand outruns ready stock. */
    runOut: string | null
    runOutBasis: 'plan' | 'pace' | null
    /** Cook (or thaw) by the evening of this day. */
    prepareBy: string | null
    /** Frozen stock would cover the first shortfall. */
    thawInstead: boolean
    severity: 'ok' | 'low' | 'short'
    messages: string[]
}

export interface ForecastInput {
    recipes: PrepRecipe[]
    /** Active batches (others are ignored). */
    batches: FoodBatch[]
    /** Plan entries spanning at least [today − HISTORY_DAYS, today + HORIZON_DAYS). */
    entries: MealPlanEntry[]
    today: string
    horizonDays?: number
}

function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b)
    const mid = Math.floor(s.length / 2)
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** "Thursday", or "today" / "tomorrow" relative to `today`. */
export function dayName(date: string, today: string): string {
    const diff = daysBetween(today, date)
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    const { year, month, day } = parseDateKey(date)
    const name = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return diff > 6 ? `${name} ${day}` : name
}

/** Which food a batch or component belongs to. */
function foodKey(recipe: string | undefined, batch: string | undefined): string | null {
    if (recipe) return recipe
    if (batch) return `batch:${batch}`
    return null
}

/**
 * The usual portion for a food: what you've set, else the median of your recent
 * portions, else the labelled default.
 */
export function usualPortion(
    recipe: PrepRecipe | null,
    category: PrepCategory,
    recent: number[]
): { grams: number; source: PortionSource } {
    if (recipe?.usualPortionGrams && recipe.usualPortionGrams > 0) {
        return { grams: recipe.usualPortionGrams, source: 'set' }
    }
    if (recent.length >= 2) return { grams: median(recent.slice(-10)), source: 'recent' }
    return { grams: FALLBACK_PORTION_GRAMS[category], source: 'default' }
}

export function forecastStock({ recipes, batches, entries, today, horizonDays = HORIZON_DAYS }: ForecastInput): FoodForecast[] {
    const recipeById = new Map(recipes.map((r) => [r._id, r]))
    const batchById = new Map(batches.map((b) => [b._id, b]))
    const historyStart = addDays(today, -HISTORY_DAYS)
    const horizonEnd = addDays(today, horizonDays - 1)

    // Gather per food: stock, planned grams by day, and recent eaten portions.
    type Acc = {
        batches: FoodBatch[]
        planned: Map<string, number>
        eaten: { date: string; grams: number }[]
        eatenToday: boolean
        name: string
        category: PrepCategory
    }
    const acc = new Map<string, Acc>()
    const get = (key: string, name: string, category: PrepCategory) => {
        let a = acc.get(key)
        if (!a) {
            a = { batches: [], planned: new Map(), eaten: [], eatenToday: false, name, category }
            acc.set(key, a)
        }
        return a
    }

    for (const b of batches) {
        if (b.status !== 'active') continue
        const key = foodKey(b.recipe, b._id)!
        const r = b.recipe ? recipeById.get(b.recipe) : undefined
        get(key, r?.name ?? b.name, r?.category ?? b.category).batches.push(b)
    }

    for (const e of entries) {
        if (!e.buffet || e.status === 'skipped') continue
        for (const c of e.buffet.components) {
            if (c.source === 'food') continue
            const recipeId = c.recipe ?? (c.batch ? batchById.get(c.batch)?.recipe : undefined)
            const key = foodKey(recipeId, c.batch)
            if (!key) continue
            const r = recipeId ? recipeById.get(recipeId) : undefined
            const a = get(key, r?.name ?? c.name, r?.category ?? c.role)
            if (e.status === 'planned' && e.date >= today && e.date <= horizonEnd) {
                a.planned.set(e.date, (a.planned.get(e.date) ?? 0) + (c.plannedGrams ?? 0))
            } else if (e.status === 'eaten' && c.grams) {
                if (e.date === today) a.eatenToday = true
                if (e.date >= historyStart && e.date <= today) a.eaten.push({ date: e.date, grams: c.grams })
            }
        }
    }

    const out: FoodForecast[] = []
    for (const [key, a] of acc) {
        const recipe = recipeById.get(key) ?? null
        const readyGrams = a.batches.filter((b) => b.storage === 'fridge').reduce((s, b) => s + b.remainingGrams, 0)
        const frozenGrams = a.batches.filter((b) => b.storage === 'freezer').reduce((s, b) => s + b.remainingGrams, 0)
        const plannedGrams = [...a.planned.values()].reduce((s, g) => s + g, 0)
        // Nothing in stock and nothing planned: not worth a line.
        if (a.batches.length === 0 && plannedGrams === 0) continue

        const portion = usualPortion(recipe, a.category, a.eaten.map((x) => x.grams))
        const readyPortions = readyGrams / portion.grams

        const ls = recipe?.lowStock ?? { unit: 'portions' as const, value: DEFAULT_LOW_STOCK_PORTIONS }
        const threshold =
            ls.unit === 'grams'
                ? { grams: ls.value, label: fmtGrams(ls.value) }
                : { grams: ls.value * portion.grams, label: `${ls.value} portion${ls.value === 1 ? '' : 's'}` }

        // Pace, from past days only (today is still happening).
        const past = a.eaten.filter((x) => x.date < today)
        const distinctDays = new Set(past.map((x) => x.date)).size
        let pace: number | null = null
        if (past.length >= MIN_PACE_PORTIONS && distinctDays >= MIN_PACE_PORTIONS) {
            const first = past.map((x) => x.date).sort()[0]
            const span = Math.max(7, daysBetween(first, today))
            pace = past.reduce((s, x) => s + x.grams, 0) / span
        }

        // Walk the horizon: planned grams on planned days, pace on the rest.
        let stock = readyGrams
        let runOut: string | null = null
        let runOutBasis: FoodForecast['runOutBasis'] = null
        for (let i = 0; i < horizonDays; i++) {
            const date = addDays(today, i)
            const planned = a.planned.get(date)
            let demand = 0
            let basis: 'plan' | 'pace' = 'plan'
            if (planned !== undefined) demand = planned
            else if (pace !== null && !(i === 0 && a.eatenToday)) {
                demand = pace
                basis = 'pace'
            }
            stock -= demand
            if (stock < -1e-6) {
                runOut = date
                runOutBasis = basis
                break
            }
        }

        const lead = recipe?.leadDays ?? DEFAULT_LEAD_DAYS
        let prepareBy: string | null = null
        let thawInstead = false
        if (runOut) {
            const by = addDays(runOut, -lead)
            prepareBy = by < today ? today : by
            // Would the freezer cover what the fridge can't by that day?
            const shortBy = -stock
            thawInstead = frozenGrams >= shortBy
        }

        const lowStock = readyGrams < threshold.grams
        const afterPlanGrams = readyGrams - plannedGrams
        const severity: FoodForecast['severity'] = afterPlanGrams < -1e-6 || runOut ? 'short' : lowStock ? 'low' : 'ok'

        const messages: string[] = []
        const approx = portion.source === 'default' ? 'default portions' : 'portions'
        messages.push(
            `${a.name}: ${fmtGrams(readyGrams)} left, around ${readyPortions.toFixed(1)} ${approx}${frozenGrams > 0 ? ` (+${fmtGrams(frozenGrams)} frozen)` : ''}.`
        )
        if (plannedGrams > 0) {
            messages.push(
                afterPlanGrams < -1e-6
                    ? `Your planned meals need ${fmtGrams(plannedGrams)}. You are ${fmtGrams(-afterPlanGrams)} short.`
                    : `Your planned meals need ${fmtGrams(plannedGrams)}, leaving about ${fmtGrams(afterPlanGrams)}.`
            )
        }
        if (runOut && runOutBasis === 'pace') {
            messages.push(`At your recent pace, this may run out ${dayName(runOut, today)}.`)
        }
        if (prepareBy) {
            const when = prepareBy === today ? 'today' : `by ${dayName(prepareBy, today)} evening`
            messages.push(
                thawInstead
                    ? `Move frozen stock to the fridge ${when} — it covers the gap.`
                    : `Prepare another batch ${when}.`
            )
        } else if (lowStock) {
            messages.push(`Below your ${threshold.label} low-stock level.`)
        }

        out.push({
            key,
            recipe,
            name: a.name,
            category: a.category,
            readyGrams,
            frozenGrams,
            batches: a.batches,
            portion,
            readyPortions,
            threshold,
            lowStock,
            plannedGrams,
            afterPlanGrams,
            pace,
            runOut,
            runOutBasis,
            prepareBy,
            thawInstead,
            severity,
            messages,
        })
    }

    const rank = { short: 0, low: 1, ok: 2 }
    return out.sort((x, y) => rank[x.severity] - rank[y.severity] || x.name.localeCompare(y.name))
}

/** Still-planned grams per batch, for the "planned demand" line on a batch card. */
export function plannedByBatch(entries: MealPlanEntry[], today: string): Map<string, number> {
    const m = new Map<string, number>()
    for (const e of entries) {
        if (!e.buffet || e.status !== 'planned' || e.date < today) continue
        for (const c of e.buffet.components) {
            if (c.batch) m.set(c.batch, (m.get(c.batch) ?? 0) + (c.plannedGrams ?? 0))
        }
    }
    return m
}

/**
 * The grams you last had of each food (by batch recipe, recipe or saved food),
 * newest first — offered as the editable default in the log form.
 */
export function lastPortions(entries: MealPlanEntry[]): Map<string, number> {
    const m = new Map<string, number>()
    const eaten = entries
        .filter((e) => e.buffet && e.status === 'eaten')
        .sort((a, b) => (b.buffet!.loggedAt ?? b.date).localeCompare(a.buffet!.loggedAt ?? a.date))
    for (const e of eaten) {
        for (const c of e.buffet!.components) {
            const key = c.recipe ?? c.food ?? c.batch
            if (key && c.grams && !m.has(key)) m.set(key, c.grams)
        }
    }
    return m
}

/** A reusable plate: the foods and grams of a recent buffet meal. */
export interface RecentCombo {
    signature: string
    label: string
    components: { role: 'main' | 'side' | 'extra'; recipe?: string; food?: string; name: string; grams: number }[]
    count: number
}

/**
 * Your recent plates, most-eaten first, de-duplicated by which foods were on
 * them (not the exact grams). Batches are generalised to their recipe so a
 * combination outlives the tray it was first eaten from.
 */
export function recentCombos(entries: MealPlanEntry[], limit = 5): RecentCombo[] {
    const combos = new Map<string, RecentCombo & { last: string }>()
    for (const e of entries) {
        if (!e.buffet || e.status !== 'eaten') continue
        const parts = e.buffet.components
            .map((c) => ({
                role: c.role,
                recipe: c.recipe,
                food: c.food,
                name: c.name,
                grams: c.grams ?? c.plannedGrams ?? 0,
            }))
            .filter((p) => p.recipe || p.food)
        if (parts.length === 0) continue
        const signature = parts
            .map((p) => `${p.role}:${p.recipe ?? p.food}`)
            .sort()
            .join('|')
        const prior = combos.get(signature)
        if (prior) {
            prior.count++
            if (e.date > prior.last) {
                prior.last = e.date
                prior.components = parts
            }
        } else {
            combos.set(signature, {
                signature,
                label: e.buffet.name || parts.map((p) => p.name).join(' + '),
                components: parts,
                count: 1,
                last: e.date,
            })
        }
    }
    return [...combos.values()]
        .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
        .slice(0, limit)
        .map((c) => ({ signature: c.signature, label: c.label, components: c.components, count: c.count }))
}
