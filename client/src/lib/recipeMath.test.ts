import { describe, it, expect } from 'vitest'
import {
    amountMacros,
    cookedWeight,
    gramMacros,
    ingredientMacros,
    packCount,
    portionMacros,
    portionWeight,
    sum,
    totalMacros,
    uncosted,
    type Cookable,
} from '../../../server/src/lib/recipeMath'

/** The worked example: 3,500 kcal · 490 P · 140 C · 105 F, 3,500 g cooked, 7 portions. */
const trayA: Cookable = {
    ingredients: [
        {
            name: 'Everything',
            unit: 'g',
            amount: 100,
            per: { calories: 3500, protein: 490, carbs: 140, fat: 105 },
        },
    ],
    servings: 7,
    cookedGrams: 3500,
}

describe('batch portions', () => {
    it('one of seven portions is a seventh of the batch, weighing 500 g', () => {
        expect(portionMacros(trayA, 1)).toEqual({ calories: 500, protein: 70, carbs: 20, fat: 15 })
        expect(portionWeight(trayA)).toEqual({ grams: 500, estimated: false })
    })

    it('a 350 g serving is 350/3500 of the batch', () => {
        expect(gramMacros(trayA, 350)).toEqual({
            macros: { calories: 350, protein: 49, carbs: 14, fat: 10.5 },
            estimated: false,
        })
    })

    it('scales fractional portions', () => {
        expect(portionMacros(trayA, 1.5)).toEqual({ calories: 750, protein: 105, carbs: 30, fat: 22.5 })
    })

    it('portions need no cooked weight', () => {
        const unweighed = { ...trayA, cookedGrams: undefined }
        expect(portionMacros(unweighed, 1).calories).toBe(500)
        expect(portionWeight(unweighed)).toBeNull()
        expect(gramMacros(unweighed, 350)).toBeNull()
    })

    it('grams against an estimated weight are flagged as estimates', () => {
        const est = { ...trayA, cookedGrams: undefined, estimatedCookedGrams: 3500 }
        expect(gramMacros(est, 350)?.estimated).toBe(true)
        expect(portionWeight(est)).toEqual({ grams: 500, estimated: true })
    })

    it('a measured weight beats the estimate', () => {
        expect(cookedWeight({ ...trayA, estimatedCookedGrams: 4000 })).toEqual({
            grams: 3500,
            estimated: false,
        })
    })

    it('water loss changes per-gram density, never the batch total', () => {
        const drier = { ...trayA, cookedGrams: 2800 }
        expect(totalMacros(drier)).toEqual(totalMacros(trayA))
        expect(gramMacros(drier, 350)?.macros.calories).toBe(438) // 3500 × 350 / 2800
    })
})

describe('meals made of several lines', () => {
    const rice: Cookable = {
        // Dry basmati, eaten by the dry gram: weight = the ingredient's weight.
        ingredients: [
            { name: 'Basmati, dry', unit: 'g', amount: 100, per: { calories: 350, protein: 8, carbs: 78, fat: 1 } },
        ],
        cookedGrams: 100,
    }

    it('adding rice raises the meal total and leaves the batch untouched', () => {
        const chicken = portionMacros(trayA, 1)
        const small = gramMacros(rice, 50)!.macros
        expect(sum([chicken, small])).toEqual({ calories: 675, protein: 74, carbs: 59, fat: 15.5 })
        expect(totalMacros(trayA).calories).toBe(3500)
        expect(portionMacros(trayA, 1)).toEqual(chicken)
    })
})

describe('ingredients', () => {
    it('costs g/ml per 100 and items each', () => {
        const per = { calories: 200, protein: 10, carbs: 20, fat: 5 }
        expect(ingredientMacros({ name: 'x', unit: 'g', amount: 250, per })?.calories).toBe(500)
        expect(ingredientMacros({ name: 'x', unit: 'ml', amount: 50, per })?.calories).toBe(100)
        expect(ingredientMacros({ name: 'egg', unit: 'item', amount: 2, per })?.calories).toBe(400)
    })

    it('reads a partial jar as packs', () => {
        expect(packCount({ name: 'Sauce', unit: 'g', amount: 250, pack: { size: 500 } })).toBe(0.5)
    })

    it('lists uncosted ingredients in a built recipe', () => {
        const c: Cookable = {
            ingredients: [
                { name: 'Chicken', unit: 'g', amount: 100, per: { calories: 106, protein: 24, carbs: 0, fat: 1 } },
                { name: 'Lemon', unit: 'item', amount: 1 },
            ],
        }
        expect(uncosted(c)).toEqual(['Lemon'])
    })
})

describe('ordinary meals', () => {
    it('typed per-portion macros still work, by the portion', () => {
        const eggsOnToast: Cookable = {
            ingredients: [{ name: 'Eggs', unit: 'item', amount: 3 }],
            macros: { calories: 450, protein: 28, carbs: 30, fat: 22 },
            servings: 1,
        }
        expect(amountMacros(eggsOnToast, 1, 'portion')).toEqual({
            macros: { calories: 450, protein: 28, carbs: 30, fat: 22 },
            estimated: false,
        })
        expect(amountMacros(eggsOnToast, 2, 'portion')?.macros.calories).toBe(900)
        expect(amountMacros(eggsOnToast, 100, 'g')).toBeNull()
    })
})
