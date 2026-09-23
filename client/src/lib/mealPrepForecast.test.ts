import { describe, it, expect } from 'vitest'
import { forecastStock, lastPortions, recentCombos, plannedByBatch, FALLBACK_PORTION_GRAMS } from './mealPrepForecast'
import { addDays } from './calendar'
import { batch, buffetEntry, fromBatch, fromRecipe, recipe } from './__mealPrepFixtures'

// Wednesday 23 September 2026.
const TODAY = '2026-09-23'
const day = (n: number) => addDays(TODAY, n)

describe('forecastStock', () => {
    const fajita = recipe({ usualPortionGrams: 250 })

    it('reports grams and portions left: 650 g at a 250 g portion is ~2.6', () => {
        const [f] = forecastStock({ recipes: [fajita], batches: [batch({ remainingGrams: 650 })], entries: [], today: TODAY })
        expect(f.readyPortions).toBeCloseTo(2.6, 6)
        expect(f.messages[0]).toBe('Fajita chicken: 650 g left, around 2.6 portions.')
    })

    it('adds planned demand without touching stock, and names the shortfall', () => {
        const b = batch({ remainingGrams: 650 })
        const entries = [0, 1, 2, 3].map((n) => buffetEntry(day(n), 'planned', [fromBatch(b, 250)]))
        const [f] = forecastStock({ recipes: [fajita], batches: [b], entries, today: TODAY })
        expect(f.readyGrams).toBe(650) // planning deducts nothing
        expect(f.plannedGrams).toBe(1000)
        expect(f.afterPlanGrams).toBe(-350)
        expect(f.messages).toContain('Your planned meals need 1,000 g. You are 350 g short.')
        // 650 covers Wed and Thu (500), runs short Friday → cook by Thursday evening.
        expect(f.runOut).toBe(day(2))
        expect(f.prepareBy).toBe(day(1))
        expect(f.messages).toContain('Prepare another batch by tomorrow evening.')
        expect(f.severity).toBe('short')
    })

    it('respects a longer preparation lead time', () => {
        const b = batch({ remainingGrams: 650 })
        const entries = [0, 1, 2, 3].map((n) => buffetEntry(day(n), 'planned', [fromBatch(b, 250)]))
        const [f] = forecastStock({ recipes: [{ ...fajita, leadDays: 3 }], batches: [b], entries, today: TODAY })
        expect(f.prepareBy).toBe(TODAY) // would be yesterday; clamped to today
    })

    it('counts recipe-only planned meals as demand on the recipe', () => {
        const entries = [buffetEntry(day(1), 'planned', [fromRecipe('r-fajita', 300, { calories: 120, protein: 20, carbs: 5, fat: 3 })])]
        const [f] = forecastStock({ recipes: [fajita], batches: [batch({ remainingGrams: 200 })], entries, today: TODAY })
        expect(f.plannedGrams).toBe(300)
        expect(f.runOut).toBe(day(1))
    })

    it('ignores skipped and already-eaten meals as future demand', () => {
        const b = batch({ remainingGrams: 650 })
        const entries = [
            buffetEntry(TODAY, 'eaten', [fromBatch(b, 250)]),
            buffetEntry(day(1), 'skipped', [fromBatch(b, 250)]),
        ]
        const [f] = forecastStock({ recipes: [fajita], batches: [b], entries, today: TODAY })
        expect(f.plannedGrams).toBe(0)
    })

    it('uses recent pace only with enough history, and says "may run out"', () => {
        const b = batch({ remainingGrams: 600 })
        const history = [-6, -4, -2].map((n) => buffetEntry(day(n), 'eaten', [fromBatch(b, 200)]))
        const [f] = forecastStock({ recipes: [fajita], batches: [b], entries: history, today: TODAY })
        // 600 g over a 7-day window → ~85.7 g/day: 600 g lasts 7 days, out on day 7 (beyond horizon).
        expect(f.pace).toBeCloseTo(600 / 7, 6)
        const sparse = forecastStock({ recipes: [fajita], batches: [b], entries: history.slice(0, 2), today: TODAY })[0]
        expect(sparse.pace).toBeNull()
        expect(sparse.runOut).toBeNull()

        const low = forecastStock({ recipes: [fajita], batches: [batch({ remainingGrams: 250 })], entries: history, today: TODAY })[0]
        expect(low.runOutBasis).toBe('pace')
        expect(low.messages.some((m) => m.startsWith('At your recent pace, this may run out'))).toBe(true)
    })

    it('does not double count a planned day and the inferred pace', () => {
        const b = batch({ remainingGrams: 1000 })
        const history = [-6, -4, -2].map((n) => buffetEntry(day(n), 'eaten', [fromBatch(b, 700)]))
        // Pace is 300 g/day. Plan 100 g on each of the next 7 days: demand is the plan only.
        const plan = [0, 1, 2, 3, 4, 5, 6].map((n) => buffetEntry(day(n), 'planned', [fromBatch(b, 100)]))
        const [f] = forecastStock({ recipes: [fajita], batches: [b], entries: [...history, ...plan], today: TODAY })
        expect(f.pace).toBeCloseTo(300, 6)
        expect(f.runOut).toBeNull()
        expect(f.afterPlanGrams).toBe(300)
    })

    it('checks frozen stock before recommending a cook', () => {
        const fridge = batch({ _id: 'f', remainingGrams: 250 })
        const frozen = batch({ _id: 'z', remainingGrams: 900, storage: 'freezer' })
        const entries = [0, 1].map((n) => buffetEntry(day(n), 'planned', [fromBatch(fridge, 250)]))
        const [f] = forecastStock({ recipes: [fajita], batches: [fridge, frozen], entries, today: TODAY })
        expect(f.readyGrams).toBe(250)
        expect(f.frozenGrams).toBe(900)
        expect(f.thawInstead).toBe(true)
        expect(f.messages[f.messages.length - 1]).toMatch(/^Move frozen stock to the fridge/)
    })

    it('tracks mains and sides independently, with their own thresholds', () => {
        const rice = recipe({ _id: 'r-rice', name: 'Rice', category: 'side', lowStock: { unit: 'grams', value: 400 } })
        const riceBatch = batch({ _id: 'rb', recipe: 'r-rice', name: 'Rice', category: 'side', remainingGrams: 300 })
        const chickenBatch = batch({ remainingGrams: 1500 })
        const out = forecastStock({ recipes: [fajita, rice], batches: [chickenBatch, riceBatch], entries: [], today: TODAY })
        const r = out.find((f) => f.key === 'r-rice')!
        const c = out.find((f) => f.key === 'r-fajita')!
        expect(r.lowStock).toBe(true)
        expect(r.messages).toContain('Below your 300 g low-stock level.'.replace('300', '400'))
        expect(c.lowStock).toBe(false)
        expect(out[0].key).toBe('r-rice') // problems first
    })

    it('labels the fallback portion when nothing is set or logged', () => {
        const [f] = forecastStock({ recipes: [recipe()], batches: [batch({ remainingGrams: 600 })], entries: [], today: TODAY })
        expect(f.portion).toEqual({ grams: FALLBACK_PORTION_GRAMS.main, source: 'default' })
        expect(f.messages[0]).toContain('default portions')
    })

    it('learns the usual portion from recent logs', () => {
        const b = batch({ remainingGrams: 2000 })
        const entries = [220, 240, 260].map((g, i) => buffetEntry(day(-1 - i), 'eaten', [fromBatch(b, g)]))
        const [f] = forecastStock({ recipes: [recipe()], batches: [b], entries, today: TODAY })
        expect(f.portion).toEqual({ grams: 240, source: 'recent' })
    })

    it('flags an empty batch with planned demand as short', () => {
        const b = batch({ remainingGrams: 0 })
        const entries = [buffetEntry(TODAY, 'planned', [fromBatch(b, 200)])]
        const [f] = forecastStock({ recipes: [fajita], batches: [b], entries, today: TODAY })
        expect(f.severity).toBe('short')
        expect(f.prepareBy).toBe(TODAY)
        expect(f.messages).toContain('Prepare another batch today.')
    })
})

describe('reuse helpers', () => {
    const chicken = batch()
    const rice = batch({ _id: 'rb', recipe: 'r-rice', name: 'Rice', category: 'side' })

    it('remembers the last grams per food', () => {
        const entries = [
            buffetEntry(day(-2), 'eaten', [fromBatch(chicken, 200)]),
            buffetEntry(day(-1), 'eaten', [fromBatch(chicken, 230), fromBatch(rice, 170, 'side')]),
        ]
        const last = lastPortions(entries)
        expect(last.get('r-fajita')).toBe(230)
        expect(last.get('r-rice')).toBe(170)
    })

    it('ranks recent combinations by how often they were eaten', () => {
        const combo = () => [fromBatch(chicken, 230), fromBatch(rice, 170, 'side')]
        const entries = [
            buffetEntry(day(-3), 'eaten', combo()),
            buffetEntry(day(-2), 'eaten', [fromBatch(chicken, 300)]),
            buffetEntry(day(-1), 'eaten', combo()),
        ]
        const combos = recentCombos(entries)
        expect(combos[0].count).toBe(2)
        expect(combos[0].label).toBe('Fajita chicken + Rice')
        expect(combos).toHaveLength(2)
    })

    it('sums still-planned grams per batch', () => {
        const entries = [
            buffetEntry(TODAY, 'planned', [fromBatch(chicken, 250)]),
            buffetEntry(day(1), 'planned', [fromBatch(chicken, 250)]),
            buffetEntry(day(-1), 'planned', [fromBatch(chicken, 999)]),
        ]
        expect(plannedByBatch(entries, TODAY).get('b1')).toBe(500)
    })
})
