import { describe, it, expect } from 'vitest'
import {
    ingredientMacros,
    isValidCookedGrams,
    netFromGross,
    per100FromTotals,
    per100Grams,
    planStockChanges,
    portionMacros,
    portionsLeft,
    recipeTotals,
    splitAcrossBatches,
    toBasisAmount,
    recipeSummary,
    type IngredientLine,
} from './mealPrep'
import { entryMacros, sumEatenMacros, sumPendingMacros, sumMacros } from './nutrition'
import { batch, buffetEntry, fromBatch, fromRecipe } from './__mealPrepFixtures'

const M = (calories: number, protein = 0, carbs = 0, fat = 0) => ({ calories, protein, carbs, fat })

function line(name: string, quantity: number, unit: IngredientLine['unit'], per100: ReturnType<typeof M>, extra: Partial<IngredientLine['nutrition']> = {}): IngredientLine {
    return { name, quantity, unit, nutrition: { basis: 'g', per100, ...extra } }
}

describe('portion nutrition', () => {
    it('costs 200 g of a 1,960 kcal / 1,800 g batch at ~218 kcal, keeping precision', () => {
        const per100 = per100FromTotals(M(1960, 180, 90, 70), 1800)!
        const portion = portionMacros(per100, 200)
        expect(portion.calories).toBeCloseTo(217.78, 2)
        expect(Math.round(portion.calories)).toBe(218)
        expect(portion.protein).toBeCloseTo(20, 6)
        expect(portion.carbs).toBeCloseTo(10, 6)
        expect(portion.fat).toBeCloseTo(7.78, 2)
    })

    it('refuses a per-gram figure without a positive cooked weight', () => {
        expect(per100FromTotals(M(1000), 0)).toBeNull()
        expect(per100FromTotals(M(1000), -5)).toBeNull()
        expect(per100FromTotals(M(1000), Number.NaN)).toBeNull()
        expect(isValidCookedGrams(0)).toBe(false)
        expect(isValidCookedGrams(1800)).toBe(true)
    })

    it('gives zero for a non-positive portion rather than a negative one', () => {
        expect(portionMacros(M(100, 20), -50)).toEqual(M(0))
    })

    it('counts portions left: 650 g at 250 g is 2.6', () => {
        expect(portionsLeft(650, 250)).toBeCloseTo(2.6, 6)
        expect(portionsLeft(650, 0)).toBeNull()
    })
})

describe('batch totals from ingredients', () => {
    it('sums every ingredient as weighed, with water adding nothing', () => {
        const { totals, problems } = recipeTotals([
            line('Chicken breast, raw', 1000, 'g', M(106, 24, 0, 1.1)),
            line('Peppers', 400, 'g', M(26, 1, 4.6, 0.3)),
            line('Water', 200, 'ml', M(0), { basis: 'ml' }),
            line('Olive oil', 15, 'ml', M(824, 0, 0, 91.6), { density: 0.92 }),
            line('Cheese', 0.1, 'kg', M(416, 25, 0.1, 34.9)),
        ])
        expect(problems).toEqual([])
        // oil: 15 ml × 0.92 g/ml = 13.8 g → 113.7 kcal
        expect(totals.calories).toBeCloseTo(1060 + 104 + 0 + 113.712 + 416, 3)
        expect(totals.fat).toBeCloseTo(11 + 1.2 + 12.6408 + 34.9, 3)
    })

    it('costs rice from its dry weight and divides by the cooked yield', () => {
        const { totals } = recipeTotals([
            line('Basmati, dry', 500, 'g', M(350, 7.5, 78, 0.5)),
            line('Water', 1000, 'ml', M(0), { basis: 'ml' }),
        ])
        const per100 = per100FromTotals(totals, 1500)!
        // 170 g of cooked rice is 170/1500 of the pot — not 170 g of dry rice.
        expect(portionMacros(per100, 170).calories).toBeCloseTo(1750 * (170 / 1500), 6)
        expect(portionMacros(per100, 170).calories).toBeLessThan(ingredientMacros(line('dry', 170, 'g', M(350)))!.calories)
    })

    it('never assumes 1 ml = 1 g', () => {
        const oil = { basis: 'g' as const, per100: M(824) }
        expect(toBasisAmount(15, 'ml', oil)).toEqual({ ok: false, reason: expect.stringMatching(/density/) })
        expect(toBasisAmount(15, 'ml', { ...oil, density: 0.92 })).toEqual({ ok: true, amount: 15 * 0.92 })
        // A per-100 ml label reached from grams needs the density too.
        expect(toBasisAmount(100, 'g', { basis: 'ml', per100: M(50) }).ok).toBe(false)
        expect(per100Grams({ basis: 'ml', per100: M(50) })).toBeNull()
        expect(per100Grams({ basis: 'ml', per100: M(50), density: 1.04 })!.calories).toBeCloseTo(50 / 1.04, 6)
    })

    it('costs a zero-nutrition line in any unit without needing a density', () => {
        // Water in ml against the default per-100 g basis: nothing to convert.
        const { totals, problems } = recipeTotals([
            line('Basmati, dry', 500, 'g', M(350)),
            line('Water', 1000, 'ml', M(0)),
            line('Salt', 1, 'item', M(0)),
        ])
        expect(problems).toEqual([])
        expect(totals.calories).toBe(1750)
    })

    it('converts items through their weight, and reports lines it cannot cost', () => {
        expect(toBasisAmount(3, 'item', { basis: 'g', per100: M(143), unitGrams: 58 })).toEqual({ ok: true, amount: 174 })
        const { totals, problems } = recipeTotals([
            line('Chicken', 1000, 'g', M(106)),
            line('Eggs', 3, 'item', M(143)),
        ])
        expect(totals.calories).toBeCloseTo(1060, 6)
        expect(problems).toEqual([{ index: 1, name: 'Eggs', reason: expect.any(String) }])
    })

    it('estimates a recipe’s density only when it has a yield, and says which kind', () => {
        const ingredients = [line('Chicken', 1000, 'g', M(106, 24))]
        expect(recipeSummary({ ingredients }).per100).toBeNull()
        const est = recipeSummary({ ingredients, estimatedYieldGrams: 800 })
        expect(est.yield).toEqual({ grams: 800, kind: 'estimated' })
        expect(est.per100!.calories).toBeCloseTo(132.5, 6)
        // A measured yield wins over a typed estimate.
        expect(recipeSummary({ ingredients, estimatedYieldGrams: 800, lastYieldGrams: 760 }).yield!.kind).toBe('measured')
    })
})

describe('net weight from a container', () => {
    it('subtracts the container once', () => {
        expect(netFromGross(2350, 550)).toBe(1800)
    })

    it('refuses a reading that is no heavier than the container (double subtraction)', () => {
        expect(netFromGross(1800, 1800)).toBeNull()
        expect(netFromGross(1250, 1800)).toBeNull()
        expect(netFromGross(1800, -1)).toBeNull()
    })
})

describe('buffet plates in the shared totals', () => {
    const chicken = batch({ _id: 'b-chicken', kcalPer100: 108.9 })
    const rice = batch({ _id: 'b-rice', recipe: 'r-rice', name: 'Rice', category: 'side', kcalPer100: 116.7 })
    const salsa = batch({ _id: 'b-salsa', recipe: 'r-salsa', name: 'Salsa', category: 'extra', kcalPer100: 40 })

    it('sums main, side and extras', () => {
        const e = buffetEntry('2026-09-23', 'eaten', [
            fromBatch(chicken, 230),
            fromBatch(rice, 170, 'side'),
            fromBatch(salsa, 30, 'extra'),
        ])
        expect(entryMacros(e).calories).toBeCloseTo(250.47 + 198.39 + 12, 2)
    })

    it('keeps two batches of the same recipe at their own densities', () => {
        const a = batch({ _id: 'a', kcalPer100: 110 })
        const b = batch({ _id: 'b', kcalPer100: 95 })
        const e = buffetEntry('2026-09-23', 'eaten', [fromBatch(a, 200), fromBatch(b, 200)])
        expect(entryMacros(e).calories).toBeCloseTo(220 + 190, 6)
    })

    it('counts a plate as planned or eaten, never both', () => {
        const planned = buffetEntry('2026-09-23', 'planned', [fromBatch(chicken, 250)])
        const eaten = buffetEntry('2026-09-23', 'eaten', [fromBatch(chicken, 230)])
        const skipped = buffetEntry('2026-09-23', 'skipped', [fromBatch(chicken, 250)])
        const all = [planned, eaten, skipped]
        expect(sumEatenMacros(all).calories).toBeCloseTo(230 * 1.089, 6)
        expect(sumPendingMacros(all).calories).toBeCloseTo(250 * 1.089, 6)
        expect(sumMacros(all).calories).toBeCloseTo(480 * 1.089, 6)
    })

    it('costs a recipe-only planned component at its estimate', () => {
        const e = buffetEntry('2026-09-24', 'planned', [fromRecipe('r-teriyaki', 250, M(120, 20))])
        expect(entryMacros(e).calories).toBeCloseTo(300, 6)
        expect(e.buffet!.components[0].estimated).toBe(true)
    })

    it('uses the saved snapshot, so later batch or recipe edits cannot move a logged meal', () => {
        const e = buffetEntry('2026-09-23', 'eaten', [fromBatch(chicken, 200)])
        const before = entryMacros(e).calories
        chicken.per100.calories = 999 // a later change to the batch object
        expect(entryMacros(e).calories).toBe(before)
    })
})

describe('stock transitions', () => {
    const states = (over: Partial<Record<string, { remainingGrams: number; reconciledAt?: number; active?: boolean }>> = {}) => {
        const base: Record<string, { remainingGrams: number; reconciledAt?: number; active?: boolean }> = {
            A: { remainingGrams: 900 },
            B: { remainingGrams: 500 },
            ...over,
        }
        return new Map(
            Object.entries(base).map(([id, s]) => [
                id,
                { id, remainingGrams: s!.remainingGrams, reconciledAt: s!.reconciledAt ?? null, active: s!.active ?? true },
            ])
        )
    }
    const T = 1_000_000

    it('deducts a new log once: 900 g − 250 g', () => {
        const plan = planStockChanges([], [{ batchId: 'A', grams: 250 }], T, states())
        expect(plan.deltas).toEqual([{ batchId: 'A', delta: -250 }])
        expect(plan.shortfalls).toEqual([])
    })

    it('re-saving the same log moves nothing (no double deduction)', () => {
        const same = [{ batchId: 'A', grams: 250 }]
        expect(planStockChanges(same, same, T, states()).deltas).toEqual([])
    })

    it('an edit applies only the difference', () => {
        const plan = planStockChanges([{ batchId: 'A', grams: 250 }], [{ batchId: 'A', grams: 200 }], T, states())
        expect(plan.deltas).toEqual([{ batchId: 'A', delta: 50 }])
    })

    it('deleting a log restores its grams', () => {
        expect(planStockChanges([{ batchId: 'A', grams: 250 }], [], T, states()).deltas).toEqual([{ batchId: 'A', delta: 250 }])
    })

    it('changing batch restores the old one and deducts the new one', () => {
        const plan = planStockChanges([{ batchId: 'A', grams: 250 }], [{ batchId: 'B', grams: 250 }], T, states())
        expect(plan.deltas).toEqual([
            { batchId: 'A', delta: 250 },
            { batchId: 'B', delta: -250 },
        ])
    })

    it('reports a shortfall instead of going negative or clamping', () => {
        const plan = planStockChanges([], [{ batchId: 'B', grams: 650 }], T, states())
        expect(plan.shortfalls).toEqual([{ batchId: 'B', remainingGrams: 500, neededGrams: 650 }])
    })

    it('allows taking exactly what is left', () => {
        expect(planStockChanges([], [{ batchId: 'B', grams: 500 }], T, states()).shortfalls).toEqual([])
    })

    it('refuses to deduct from a finished batch but can still restore to it', () => {
        const s = states({ A: { remainingGrams: 0, active: false } })
        expect(planStockChanges([], [{ batchId: 'A', grams: 100 }], T, s).inactive).toEqual(['A'])
        expect(planStockChanges([{ batchId: 'A', grams: 100 }], [], T, s).inactive).toEqual([])
    })

    it('leaves a measured balance alone when an older meal is edited', () => {
        // Logged at T, stock weighed at T + 1: the reading already includes it.
        const s = states({ A: { remainingGrams: 400, reconciledAt: T + 1 } })
        const plan = planStockChanges([{ batchId: 'A', grams: 250 }], [{ batchId: 'A', grams: 300 }], T, s)
        expect(plan.deltas).toEqual([])
        expect(plan.sealed).toEqual(['A'])
    })

    it('still moves stock for meals logged after the measurement', () => {
        const s = states({ A: { remainingGrams: 400, reconciledAt: T - 1 } })
        const plan = planStockChanges([{ batchId: 'A', grams: 250 }], [{ batchId: 'A', grams: 300 }], T, s)
        expect(plan.deltas).toEqual([{ batchId: 'A', delta: -50 }])
    })

    it('moving an old meal to an unmeasured batch deducts from that batch only', () => {
        const s = states({ A: { remainingGrams: 400, reconciledAt: T + 1 } })
        const plan = planStockChanges([{ batchId: 'A', grams: 250 }], [{ batchId: 'B', grams: 250 }], T, s)
        expect(plan.sealed).toEqual(['A'])
        expect(plan.deltas).toEqual([{ batchId: 'B', delta: -250 }])
    })

    it('splits a portion across batches oldest-first for the shortfall recovery', () => {
        const { parts, uncovered } = splitAcrossBatches(650, [
            { id: 'old', remainingGrams: 500 },
            { id: 'new', remainingGrams: 1800 },
        ])
        expect(parts).toEqual([
            { batchId: 'old', grams: 500 },
            { batchId: 'new', grams: 150 },
        ])
        expect(uncovered).toBe(0)
        expect(splitAcrossBatches(650, [{ id: 'x', remainingGrams: 100 }]).uncovered).toBe(550)
    })
})
