import { describe, expect, it } from 'vitest'
import { batchTotal, boxParts, fitCost, mealSize, perPortion, slotBudget, suggestPortions } from './mealAim'
import type { Macros } from '../types'

const goals = { calories: 2000, protein: 160, carbs: 200, fat: 60 }
const m = (calories: number, protein: number, carbs: number, fat: number): Macros => ({
    calories,
    protein,
    carbs,
    fat,
})

describe('slotBudget', () => {
    it('is null without targets', () => {
        expect(slotBudget(null, 'lunch', [])).toBeNull()
        expect(slotBudget({}, 'lunch', [])).toBeNull()
    })

    it('gives an empty day three tenths per meal and a tenth to the snack', () => {
        expect(slotBudget(goals, 'lunch', [])!.budget.calories).toBeCloseTo(600)
        expect(slotBudget(goals, 'snack', [])!.budget.protein).toBeCloseTo(16)
    })

    it('shares what other slots left between the empty ones', () => {
        // A 1000 kcal breakfast leaves 1000 for lunch, dinner and snack (3:3:1).
        const out = slotBudget(goals, 'lunch', [
            { slot: 'breakfast', macros: m(1000, 40, 100, 30) },
        ])!
        expect(out.budget.calories).toBeCloseTo((1000 * 3) / 7)
        expect(out.budget.protein).toBeCloseTo((120 * 3) / 7)
    })

    it('takes off what is already in this slot', () => {
        const out = slotBudget(goals, 'lunch', [{ slot: 'lunch', macros: m(200, 10, 20, 5) }])!
        expect(out.budget.calories).toBeCloseTo(400)
    })

    it('never goes below zero', () => {
        const out = slotBudget(goals, 'dinner', [{ slot: 'lunch', macros: m(2500, 200, 300, 90) }])!
        expect(out.budget).toEqual(m(0, 0, 0, 0))
    })

    it('only aims at macros with a target', () => {
        expect(slotBudget({ calories: 2000 }, 'lunch', [])!.keys).toEqual(['calories'])
    })
})

describe('fitCost', () => {
    const aim = m(600, 45, 60, 18)
    const keys = ['calories', 'protein', 'carbs', 'fat'] as (keyof Macros)[]

    it('is 0 for a meal that matches', () => {
        expect(fitCost(aim, aim, keys)).toBe(0)
    })

    it('ranks a close meal above a far one', () => {
        expect(fitCost(m(580, 42, 55, 15), aim, keys)).toBeLessThan(
            fitCost(m(900, 20, 120, 40), aim, keys)
        )
    })

    it('prefers protein right over kcal spot on', () => {
        expect(fitCost(m(540, 45, 50, 15), aim, keys)).toBeLessThan(
            fitCost(m(600, 22, 85, 20), aim, keys)
        )
    })
})

describe('slotBudget with away notes', () => {
    it('takes an away slot off at its usual share', () => {
        const out = slotBudget(goals, 'dinner', [
            { slot: 'lunch', macros: m(0, 0, 0, 0), away: true },
        ])!
        // 2000 − 600 for lunch away, shared 3:3:1 between breakfast, dinner and snack.
        expect(out.budget.calories).toBeCloseTo((1400 * 3) / 7)
    })
})

describe('batches', () => {
    // 1 kg chicken breast, 500 g dry rice, 30 g oil.
    const ingredients = [
        { grams: 1000, per100: m(106, 24, 0, 1.5) },
        { grams: 500, per100: m(350, 7, 78, 1) },
        { grams: 30, per100: m(884, 0, 0, 100) },
    ]

    it('adds the batch up from its ingredients', () => {
        const total = batchTotal(ingredients)
        expect(total.calories).toBeCloseTo(1060 + 1750 + 265.2)
        expect(total.protein).toBeCloseTo(275)
    })

    it('splits a batch into whole-number portions', () => {
        expect(perPortion(m(3000, 250, 300, 90), 4)).toEqual(m(750, 63, 75, 23))
        expect(perPortion(m(100, 10, 10, 10), 0)).toEqual(m(100, 10, 10, 10))
    })

    it('suggests the portions closest to a meal', () => {
        // ~3075 kcal against 600 kcal meals is five, but 275 g protein against
        // 48 g is nearly six — protein tips it.
        expect(suggestPortions(batchTotal(ingredients), mealSize(goals, 'lunch'))).toBe(6)
        // Lean on protein, so calories decide.
        expect(suggestPortions(m(3000, 200, 400, 80), mealSize(goals, 'lunch'))).toBe(5)
        // A tenth of the day for a snack: many more.
        expect(suggestPortions(m(1000, 80, 100, 30), mealSize(goals, 'snack'))).toBe(5)
    })

    it('has no suggestion without targets or food', () => {
        expect(suggestPortions(m(1000, 80, 100, 30), mealSize(null, 'lunch'))).toBeNull()
        expect(suggestPortions(m(0, 0, 0, 0), mealSize(goals, 'lunch'))).toBeNull()
    })
})

describe('boxParts', () => {
    const ings = [
        { name: 'Chicken breast', grams: 1000 },
        { name: 'Peppers', grams: 500 },
        { name: 'Rice (cooked)', grams: 1250, apart: true },
    ]

    it('shares out the weighed tray and each thing kept apart', () => {
        expect(boxParts(ings, 5, 1200)).toEqual([
            { name: 'Tray, cooked', grams: 240 },
            { name: 'Rice (cooked)', grams: 250 },
        ])
    })

    it('estimates the tray from raw grams when it was not weighed', () => {
        expect(boxParts(ings, 5, null)[0]).toEqual({ name: 'Tray, cooked', grams: 210, approx: true })
    })

    it('has no tray part when everything is kept apart', () => {
        expect(boxParts([{ name: 'Rice', grams: 500, apart: true }], 4, null)).toEqual([{ name: 'Rice', grams: 125 }])
    })
})
