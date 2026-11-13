import { describe, expect, it } from 'vitest'
import { boxMacros, sideFood } from './sideMacros'

// Chicken stroganoff as saved: 50 g dry basmati per portion inside 618 kcal.
const stroganoff = { calories: 618, protein: 76.6, carbs: 51.3, fat: 11 }

describe('sideFood', () => {
    it('knows the usual sides, specific before general', () => {
        expect(sideFood('Basmati rice (dry)')?.label).toBe('rice')
        expect(sideFood('Brown rice')?.label).toBe('brown rice')
        expect(sideFood('Sweet potatoes')?.label).toBe('sweet potato')
        expect(sideFood('Baby potatoes')?.label).toBe('potato')
        expect(sideFood('Penne')?.label).toBe('pasta')
        expect(sideFood('Chicken breast')).toBeNull()
    })
})

describe('boxMacros', () => {
    it('keeps the recipe until the side is weighed', () => {
        const r = boxMacros(stroganoff, [{ name: 'Basmati rice (dry)', recipeGrams: 50, boxGrams: null }])
        expect(Math.round(r.total.calories)).toBe(618)
        expect(r.sides[0].from).toBe('recipe')
        expect(Math.round(r.main.calories)).toBe(443) // 618 − 175 for 50 g dry rice
    })

    it('counts the rice actually in the box', () => {
        // 3 kg of cooked rice over 7 boxes → 429 g each
        const r = boxMacros(stroganoff, [{ name: 'Basmati rice (dry)', recipeGrams: 50, boxGrams: 429 }])
        expect(r.sides[0].from).toBe('weighed')
        expect(Math.round(r.sides[0].macros.calories)).toBe(558)
        expect(Math.round(r.total.calories)).toBe(1001)
        expect(Math.round(r.total.carbs)).toBe(132)
        expect(Math.round(r.total.protein)).toBe(84)
    })

    it('reads a recipe side listed cooked at cooked figures', () => {
        const portion = { calories: 600, protein: 50, carbs: 60, fat: 15 }
        // 250 g cooked rice in the recipe = 325 kcal; box gets the same 250 g → unchanged
        const r = boxMacros(portion, [{ name: 'Rice (cooked)', recipeGrams: 250, boxGrams: 250 }])
        expect(Math.round(r.total.calories)).toBe(600)
    })

    it('adds a side that is not in the recipe', () => {
        const r = boxMacros(stroganoff, [{ name: 'Pasta', recipeGrams: null, boxGrams: 200 }])
        expect(Math.round(r.total.calories)).toBe(618 + 316)
    })

    it('leaves an unknown side out and says so', () => {
        const r = boxMacros(stroganoff, [{ name: 'Naan', recipeGrams: null, boxGrams: 120 }])
        expect(r.sides[0].from).toBe('unknown')
        expect(Math.round(r.total.calories)).toBe(618)
    })
})
