/**
 * Meal-prep arithmetic — the one copy.
 *
 * Batch cooking turns three numbers into every figure the buffet workflow shows:
 * what went into the tray, what came out of the oven, and what went on the
 * plate. The server snapshots nutrition with these functions and the client
 * previews with the same ones (it re-exports this file from `lib/mealPrep.ts`),
 * so a portion can never read 218 kcal in the log form and 220 in the history.
 *
 * Deliberately dependency-free and framework-free: no mongoose, no DOM. Both
 * compilers pull it in.
 *
 *   batch nutrient total = Σ ingredient contributions (as weighed — raw or dry)
 *   nutrient per gram    = batch total ÷ finished cooked weight
 *   portion nutrient     = per gram × grams on the plate
 *
 * Precision is kept end to end; rounding happens only at display.
 *
 * What this does *not* do, on purpose: no cooking-loss or nutrient-retention
 * factors. Water leaves the tray and the calories stay, which is exactly what
 * dividing the ingredient totals by the cooked weight already models. Mixed
 * trays assume the food is reasonably evenly distributed through the batch.
 */

export interface Macros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

export const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat'] as const

export const ZERO: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

/** What a label's per-100 figure is measured per: 100 g or 100 ml. */
export type Basis = 'g' | 'ml'

export const INGREDIENT_UNITS = ['g', 'kg', 'ml', 'l', 'item'] as const
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number]

/**
 * Where an ingredient's nutrition comes from: a label's per-100 figures plus the
 * conversions needed to reach them. `density` (g per ml) is required to cross
 * between weight and volume — 1 ml of oil is 0.92 g, not 1 g, so nothing here
 * ever assumes one. `unitGrams` is what one "item" weighs (an egg, a wrap).
 */
export interface NutritionSource {
    basis: Basis
    per100: Macros
    density?: number
    unitGrams?: number
}

export interface IngredientLine {
    name: string
    quantity: number
    unit: IngredientUnit
    nutrition: NutritionSource
}

// ── Basic macro arithmetic ───────────────────────────────────────────────────

export function addMacros(a: Macros, b: Macros): Macros {
    return {
        calories: a.calories + b.calories,
        protein: a.protein + b.protein,
        carbs: a.carbs + b.carbs,
        fat: a.fat + b.fat,
    }
}

export function scaleMacros(m: Macros, factor: number): Macros {
    return {
        calories: m.calories * factor,
        protein: m.protein * factor,
        carbs: m.carbs * factor,
        fat: m.fat * factor,
    }
}

export function sumMacroList(list: Macros[]): Macros {
    return list.reduce(addMacros, { ...ZERO })
}

/** Coerce anything to a finite, non-negative macro set. */
export function cleanMacros(raw: unknown): Macros {
    const m = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
    const one = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(v)
        return Number.isFinite(n) && n > 0 ? n : 0
    }
    return { calories: one(m.calories), protein: one(m.protein), carbs: one(m.carbs), fat: one(m.fat) }
}

// ── Units ────────────────────────────────────────────────────────────────────

export type Conversion = { ok: true; amount: number } | { ok: false; reason: string }

/**
 * An ingredient quantity expressed in its label's basis (grams or millilitres),
 * or the reason it can't be. A missing conversion is an error for the form to
 * show, never a silent 1 ml = 1 g.
 */
export function toBasisAmount(quantity: number, unit: IngredientUnit, src: NutritionSource): Conversion {
    if (!Number.isFinite(quantity) || quantity < 0) return { ok: false, reason: 'Enter a quantity of zero or more' }

    let grams: number | null = null
    let ml: number | null = null
    switch (unit) {
        case 'g':
            grams = quantity
            break
        case 'kg':
            grams = quantity * 1000
            break
        case 'ml':
            ml = quantity
            break
        case 'l':
            ml = quantity * 1000
            break
        case 'item':
            if (!src.unitGrams || src.unitGrams <= 0) {
                return { ok: false, reason: 'Say what one item weighs' }
            }
            grams = quantity * src.unitGrams
            break
    }

    if (src.basis === 'g') {
        if (grams !== null) return { ok: true, amount: grams }
        if (!src.density || src.density <= 0) {
            return { ok: false, reason: 'Needs a density (g per ml) to convert volume to weight' }
        }
        return { ok: true, amount: ml! * src.density }
    }

    if (ml !== null) return { ok: true, amount: ml }
    if (!src.density || src.density <= 0) {
        return { ok: false, reason: 'Needs a density (g per ml) to convert weight to volume' }
    }
    return { ok: true, amount: grams! / src.density }
}

/** The per-100 g figures for a source, converting a per-100 ml label if it can. */
export function per100Grams(src: NutritionSource): Macros | null {
    if (src.basis === 'g') return src.per100
    if (!src.density || src.density <= 0) return null
    // 100 g of it is 100/density ml.
    return scaleMacros(src.per100, 1 / src.density)
}

// ── Recipes and batches ──────────────────────────────────────────────────────

/**
 * A line with no nutrition — water, salt — contributes zero whatever its unit,
 * so it never needs a density or an item weight to be costed.
 */
function isZeroNutrition(src: NutritionSource): boolean {
    return NUTRIENTS.every((k) => !src.per100[k])
}

/** What one ingredient line contributes, as weighed. */
export function ingredientMacros(line: IngredientLine): Macros | null {
    if (isZeroNutrition(line.nutrition) && Number.isFinite(line.quantity) && line.quantity >= 0) return { ...ZERO }
    const c = toBasisAmount(line.quantity, line.unit, line.nutrition)
    if (!c.ok) return null
    return scaleMacros(line.nutrition.per100, c.amount / 100)
}

export interface RecipeTotals {
    totals: Macros
    /** Lines whose quantity couldn't be converted — they are not in `totals`. */
    problems: { index: number; name: string; reason: string }[]
}

/**
 * Batch nutrient totals: the sum of every ingredient as it was weighed. Rice
 * weighed dry is dry-rice nutrition, chicken weighed raw is raw-chicken
 * nutrition; water carries zeros; oil, cheese and sauces count in full.
 */
export function recipeTotals(lines: IngredientLine[]): RecipeTotals {
    let totals = { ...ZERO }
    const problems: RecipeTotals['problems'] = []
    lines.forEach((line, index) => {
        if (isZeroNutrition(line.nutrition) && Number.isFinite(line.quantity) && line.quantity >= 0) return
        const c = toBasisAmount(line.quantity, line.unit, line.nutrition)
        if (!c.ok) {
            problems.push({ index, name: line.name, reason: c.reason })
            return
        }
        totals = addMacros(totals, scaleMacros(line.nutrition.per100, c.amount / 100))
    })
    return { totals, problems }
}

/** The smallest and largest finished weights the forms accept, in grams. */
export const MIN_COOKED_GRAMS = 1
export const MAX_COOKED_GRAMS = 50_000

export function isValidCookedGrams(g: unknown): g is number {
    return typeof g === 'number' && Number.isFinite(g) && g >= MIN_COOKED_GRAMS && g <= MAX_COOKED_GRAMS
}

/**
 * Nutrition per 100 g of the finished food. Null without a positive cooked
 * weight — there is no honest per-gram figure for a tray nobody has weighed,
 * and raw ingredient weight is never substituted for it.
 */
export function per100FromTotals(totals: Macros, cookedGrams: number): Macros | null {
    if (!isValidCookedGrams(cookedGrams)) return null
    return scaleMacros(totals, 100 / cookedGrams)
}

/** What `grams` of a food with the given per-100 g figures contains. */
export function portionMacros(per100: Macros, grams: number): Macros {
    if (!Number.isFinite(grams) || grams <= 0) return { ...ZERO }
    return scaleMacros(per100, grams / 100)
}

/**
 * Net food weight from a gross reading. Returns null when the container would
 * weigh as much as the reading — which is almost always the container being
 * subtracted a second time.
 */
export function netFromGross(grossGrams: number, containerGrams: number): number | null {
    if (!Number.isFinite(grossGrams) || !Number.isFinite(containerGrams)) return null
    if (containerGrams < 0) return null
    const net = grossGrams - containerGrams
    return net > 0 ? net : null
}

// ── Portions ─────────────────────────────────────────────────────────────────

/** Portion sizes a gram input accepts. */
export const MIN_PORTION_GRAMS = 1
export const MAX_PORTION_GRAMS = 5000

export function isValidPortionGrams(g: unknown): g is number {
    return typeof g === 'number' && Number.isFinite(g) && g >= MIN_PORTION_GRAMS && g <= MAX_PORTION_GRAMS
}

/** How many portions `remaining` grams makes, e.g. 650 g at 250 g → 2.6. */
export function portionsLeft(remainingGrams: number, portionGrams: number): number | null {
    if (!(portionGrams > 0)) return null
    return Math.max(0, remainingGrams) / portionGrams
}

// ── Stock transitions ────────────────────────────────────────────────────────

/** One tracked portion: this many grams came out of this batch. */
export interface Consumption {
    batchId: string
    grams: number
}

export interface BatchStockState {
    id: string
    remainingGrams: number
    /** ms since epoch of the latest measured stock balance, if any. */
    reconciledAt?: number | null
    active: boolean
}

export interface StockPlan {
    /** Signed change to apply to each batch's remaining grams (negative = taken). */
    deltas: { batchId: string; delta: number }[]
    /**
     * Batches whose stock is left alone because a measurement taken after this
     * meal already reflects it (see `planStockChanges`).
     */
    sealed: string[]
    /** Deductions the batch can't cover — the save must not go ahead. */
    shortfalls: { batchId: string; remainingGrams: number; neededGrams: number }[]
    /** Deductions from batches that are finished or discarded. */
    inactive: string[]
}

/**
 * What a meal's log (or edit, or deletion) does to stock.
 *
 * `before` is what the meal had taken out, `after` what it should now have taken
 * (both empty for a meal that isn't logged). The net per batch is applied, so an
 * edit is reverse-then-reapply without a window where both or neither count, and
 * moving a portion between batches restores one and deducts the other.
 *
 * **Ordering against measurements.** `occasionAt` is when the meal was first
 * logged. If a batch's stock was measured (corrected, finished, discarded)
 * *after* that, the measurement already includes this meal — the food was on the
 * plate before the tray hit the scale. Editing the historical meal then changes
 * its nutrition only; touching the stock would push a newer, measured balance off
 * by the edit. Those batches are reported as `sealed` and get no delta.
 *
 * Nothing is clamped: a deduction the batch can't cover is a shortfall for the
 * caller to refuse and explain, never a silent zero.
 */
export function planStockChanges(
    before: Consumption[],
    after: Consumption[],
    occasionAt: number,
    batches: Map<string, BatchStockState>
): StockPlan {
    const net = new Map<string, number>()
    for (const c of before) net.set(c.batchId, (net.get(c.batchId) ?? 0) + c.grams)
    for (const c of after) net.set(c.batchId, (net.get(c.batchId) ?? 0) - c.grams)

    const plan: StockPlan = { deltas: [], sealed: [], shortfalls: [], inactive: [] }
    for (const [batchId, delta] of net) {
        if (Math.abs(delta) < 1e-9) continue
        const batch = batches.get(batchId)
        if (!batch) {
            plan.inactive.push(batchId)
            continue
        }
        if (batch.reconciledAt != null && batch.reconciledAt > occasionAt) {
            plan.sealed.push(batchId)
            continue
        }
        if (delta < 0) {
            if (!batch.active) plan.inactive.push(batchId)
            else if (batch.remainingGrams + delta < -1e-9) {
                plan.shortfalls.push({
                    batchId,
                    remainingGrams: batch.remainingGrams,
                    neededGrams: -delta,
                })
            }
        }
        plan.deltas.push({ batchId, delta })
    }
    return plan
}

/**
 * Split a portion across batches, oldest first, for the "not enough in this
 * batch" recovery: fill each batch's remaining stock in turn. Returns the parts
 * and whatever is still uncovered.
 */
export function splitAcrossBatches(
    grams: number,
    batches: { id: string; remainingGrams: number }[]
): { parts: Consumption[]; uncovered: number } {
    const parts: Consumption[] = []
    let left = grams
    for (const b of batches) {
        if (left <= 0) break
        const take = Math.min(left, Math.max(0, b.remainingGrams))
        if (take <= 0) continue
        parts.push({ batchId: b.id, grams: take })
        left -= take
    }
    return { parts, uncovered: Math.max(0, left) }
}
