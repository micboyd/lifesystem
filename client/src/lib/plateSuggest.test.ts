import { describe, expect, it } from 'vitest'
import { lineMacros } from './plates'
import { fitCost, projectBoxNotes, slotBudget, suggestGrams } from './plateSuggest'
import type { Macros } from '../types'

const goals = { calories: 2000, protein: 160, carbs: 200, fat: 60 }
const m = (calories: number, protein: number, carbs: number, fat: number): Macros => ({ calories, protein, carbs, fat })

// Chicken box: lean, protein-led. Rice: carbs.
const chicken = m(150, 25, 3, 4)
const rice = m(130, 2.7, 28, 0.3)

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
        const out = slotBudget(goals, 'lunch', [{ slot: 'breakfast', macros: m(1000, 40, 100, 30) }])!
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

describe('suggestGrams', () => {
    const { budget, keys } = slotBudget(goals, 'lunch', [])!

    it('fits one food to the calories and protein as best it can', () => {
        const [g] = suggestGrams([{ per100: chicken }], budget, keys)
        expect(g % 5).toBe(0)
        expect(g).toBeGreaterThan(150)
        expect(g).toBeLessThan(450)
    })

    it('splits box and rice to land the calories with protein at least met', () => {
        const [c, r] = suggestGrams([{ per100: chicken }, { per100: rice }], budget, keys)
        const total = [lineMacros(c, chicken), lineMacros(r, rice)].reduce((a, x) => ({
            calories: a.calories + x.calories,
            protein: a.protein + x.protein,
            carbs: a.carbs + x.carbs,
            fat: a.fat + x.fat,
        }))
        expect(total.protein).toBeGreaterThan(budget.protein * 0.95)
        expect(total.calories).toBeGreaterThan(budget.calories * 0.95)
        expect(total.calories).toBeLessThan(budget.calories * 1.05)
    })

    it('keeps typed grams and fills around them', () => {
        const [c, r] = suggestGrams([{ per100: chicken, fixed: 200 }, { per100: rice }], budget, keys)
        expect(c).toBe(200)
        expect(r).toBeGreaterThan(0)
    })

    it('stays within what is left in the batch', () => {
        const [c] = suggestGrams([{ per100: chicken, max: 120 }, { per100: rice }], budget, keys)
        expect(c).toBeLessThanOrEqual(120)
    })

    it('suggests nothing once the day is full', () => {
        const full = slotBudget(goals, 'dinner', [{ slot: 'lunch', macros: m(2500, 200, 300, 90) }])!
        expect(suggestGrams([{ per100: chicken }, { per100: rice }], full.budget, full.keys)).toEqual([0, 0])
    })

    it('still hits the calories when a target is out of reach', () => {
        // Late in the day: little protein or carbs left but lots of fat, and
        // only lean foods to hand. The plate should still land on the kcal.
        const aim = m(980, 37, 60, 53)
        const box = m(110, 17, 4, 2)
        const grams = suggestGrams([{ per100: box }, { per100: rice }], aim, ['calories', 'protein', 'carbs', 'fat'])
        const kcal = lineMacros(grams[0], box).calories + lineMacros(grams[1], rice).calories
        const protein = lineMacros(grams[0], box).protein + lineMacros(grams[1], rice).protein
        expect(kcal).toBeGreaterThan(980 * 0.95)
        expect(kcal).toBeLessThan(980 * 1.05)
        expect(protein).toBeGreaterThanOrEqual(37)
    })

    it('shares the fat it can\'t reach between protein and carbs', () => {
        // Fajita box and rice for an 800 kcal breakfast: the plate used to
        // pile on the box, 93 g protein against 57.
        const aim = m(800, 57, 73, 26)
        const box = m(137, 19.8, 5.6, 4.1)
        const [b, r] = suggestGrams([{ per100: box }, { per100: rice }], aim, ['calories', 'protein', 'carbs', 'fat'])
        const t = [lineMacros(b, box), lineMacros(r, rice)]
        const protein = t[0].protein + t[1].protein
        const carbs = t[0].carbs + t[1].carbs
        expect(t[0].calories + t[1].calories).toBeGreaterThan(800 * 0.95)
        expect(protein).toBeGreaterThan(57)
        expect(protein).toBeLessThan(57 * 1.25)
        expect(carbs).toBeLessThan(73 * 1.5)
    })

    it('gives a food with nothing in it 0', () => {
        expect(suggestGrams([{ per100: m(0, 0, 0, 0) }], budget, keys)).toEqual([0])
    })
})

describe('fitCost', () => {
    const aim = m(600, 45, 60, 18)
    const keys = ['calories', 'protein', 'carbs', 'fat'] as (keyof Macros)[]

    it('is 0 for a meal that matches', () => {
        expect(fitCost(aim, aim, keys)).toBe(0)
    })

    it('ranks a close meal above a far one', () => {
        expect(fitCost(m(580, 42, 55, 15), aim, keys)).toBeLessThan(fitCost(m(900, 20, 120, 40), aim, keys))
    })

    it('prefers protein right over kcal spot on', () => {
        expect(fitCost(m(540, 45, 50, 15), aim, keys)).toBeLessThan(fitCost(m(600, 22, 85, 20), aim, keys))
    })
})

describe('projectBoxNotes', () => {
    const zero = m(0, 0, 0, 0)
    const per100 = (box: string) => (box === 'chicken' ? chicken : null)

    it('fills a box note until the first macro reaches its slot share', () => {
        const out = projectBoxNotes([{ _id: 'n', slot: 'lunch', macros: zero, box: 'chicken' }], goals, per100)
        const p = out.get('n')!
        expect(p.grams % 5).toBe(0)
        // Lunch's share is 48 g protein; chicken hits it at ~190 g, well short of 600 kcal.
        expect(p.macros.protein).toBeLessThanOrEqual(48 + 1.5)
        expect(p.macros.protein).toBeGreaterThan(44)
        expect(p.macros.calories).toBeLessThan(600)
    })

    it('lets a big breakfast shrink the dinner after it', () => {
        const alone = projectBoxNotes([{ _id: 'd', slot: 'dinner', macros: zero, box: 'chicken' }], goals, per100)
        const big = projectBoxNotes(
            [
                { _id: 'b', slot: 'breakfast', macros: m(900, 90, 90, 30) },
                { _id: 'd', slot: 'dinner', macros: zero, box: 'chicken' },
            ],
            goals,
            per100
        )
        expect(big.get('d')!.grams).toBeLessThan(alone.get('d')!.grams)
    })

    it('balances lunch and dinner from the same box', () => {
        const out = projectBoxNotes(
            [
                { _id: 'b', slot: 'breakfast', macros: m(550, 35, 35, 29) },
                { _id: 'l', slot: 'lunch', macros: zero, box: 'chicken' },
                { _id: 'd', slot: 'dinner', macros: zero, box: 'chicken' },
            ],
            goals,
            per100
        )
        expect(out.get('l')!.grams).toBe(out.get('d')!.grams)
    })

    it('splits a slot between two boxes', () => {
        const out = projectBoxNotes(
            [
                { _id: 'c', slot: 'lunch', macros: zero, box: 'chicken' },
                { _id: 'r', slot: 'lunch', macros: zero, box: 'rice' },
            ],
            goals,
            (b) => (b === 'chicken' ? chicken : b === 'rice' ? rice : null)
        )
        // Each gets half the slot: chicken stops at half the protein, rice at half the carbs.
        expect(out.get('c')!.macros.protein).toBeCloseTo(24, -0.5)
        expect(out.get('r')!.macros.carbs).toBeCloseTo(30, -0.5)
    })

    it('skips boxes with no figures and days with no targets', () => {
        const note = [{ _id: 'n', slot: 'lunch' as const, macros: zero, box: 'beef' }]
        expect(projectBoxNotes(note, goals, per100).size).toBe(0)
        expect(projectBoxNotes([{ ...note[0], box: 'chicken' }], null, per100).size).toBe(0)
    })

    // From a real week: a lean box (~106 kcal, 17 g protein per 100 g) at
    // lunch and dinner after a 550 kcal breakfast, on a ~2800 kcal day.
    const lean = m(105.8, 17.2, 3, 2.7)
    const big = { calories: 2800, protein: 150, carbs: 250, fat: 70 }
    const perLean = () => lean

    it('does not starve dinner once lunch has used up the protein', () => {
        const out = projectBoxNotes(
            [
                { _id: 'b', slot: 'breakfast', macros: m(550, 35, 35, 29) },
                { _id: 'l', slot: 'lunch', macros: zero, box: 'x' },
                { _id: 'd', slot: 'dinner', macros: zero, box: 'x' },
            ],
            big,
            perLean
        )
        // It used to come to ~105 g against ~900 g at lunch.
        expect(out.get('d')!.grams).toBe(out.get('l')!.grams)
    })

    it('counts an away slot as its usual share, not as nothing eaten', () => {
        const out = projectBoxNotes(
            [
                { _id: 'a1', slot: 'breakfast', macros: zero, away: true },
                { _id: 'a2', slot: 'lunch', macros: zero, away: true },
                { _id: 'd', slot: 'dinner', macros: zero, box: 'x' },
            ],
            big,
            perLean
        )
        // A dinner's usual share: 45 g protein — not the 340 g (2090 kcal) it used to get.
        expect(out.get('d')!.macros.protein).toBeLessThanOrEqual(45 + 1)
        expect(out.get('d')!.macros.protein).toBeGreaterThan(42)
    })
})

describe('slotBudget with notes', () => {
    it('takes an away slot off at its usual share', () => {
        const out = slotBudget(goals, 'dinner', [{ slot: 'lunch', macros: m(0, 0, 0, 0), away: true }])!
        // 2000 − 600 for lunch away, shared 3:3:1 between breakfast, dinner and snack.
        expect(out.budget.calories).toBeCloseTo((1400 * 3) / 7)
    })

    it('does not count a box note in the slot being filled', () => {
        const out = slotBudget(goals, 'lunch', [{ slot: 'lunch', macros: m(600, 50, 20, 20), box: 'x' }])!
        expect(out.budget.calories).toBeCloseTo(600)
    })
})
