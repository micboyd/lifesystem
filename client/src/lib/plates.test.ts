import { describe, it, expect } from 'vitest'
import {
    batchYield,
    expectedPer100,
    gramsLeft,
    lineMacros,
    per100FromCook,
    plateName,
    plateTotal,
    rawTotal,
} from './plates'

const chicken = { calories: 120, protein: 22, carbs: 0, fat: 3 }
const oil = { calories: 900, protein: 0, carbs: 0, fat: 100 }
const rice = { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }

describe('boxes and plates', () => {
    it('totals the raw ingredients of a box', () => {
        expect(
            rawTotal([
                { grams: 1000, per100: chicken },
                { grams: 20, per100: oil },
            ])
        ).toEqual({ calories: 1380, protein: 220, carbs: 0, fat: 50 })
    })

    it('spreads the raw total over the cooked weight', () => {
        // 1,380 kcal in a box that weighs 800 g cooked → 172.5 kcal per 100 g.
        expect(per100FromCook({ calories: 1380, protein: 220, carbs: 0, fat: 50 }, 800)).toEqual({
            calories: 172.5,
            protein: 27.5,
            carbs: 0,
            fat: 6.3,
        })
    })

    it('gives nothing for a box with no cooked weight', () => {
        expect(per100FromCook(chicken, 0)).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    })

    it('scales a line by its grams', () => {
        expect(lineMacros(300, rice).calories).toBeCloseTo(390)
    })

    it('adds up a plate and rounds to one decimal', () => {
        expect(
            plateTotal([
                { grams: 200, per100: { calories: 172.5, protein: 27.5, carbs: 0, fat: 6.3 } },
                { grams: 300, per100: rice },
            ])
        ).toEqual({ calories: 735, protein: 63.1, carbs: 84, fat: 13.5 })
    })

    it('names a plate after its foods', () => {
        expect(plateName([{ name: 'Chicken box' }, { name: 'Rice' }])).toBe('Chicken box · Rice')
        expect(plateName([])).toBe('Plate')
    })

    it('never says less than nothing is left', () => {
        expect(gramsLeft(1400, 900)).toBe(500)
        expect(gramsLeft(1400, 1500)).toBe(0)
    })
})

describe('expectedPer100', () => {
    const per = (calories: number, protein: number) => ({ calories, protein, carbs: 0, fat: 0 })
    const box = {
        kind: 'box' as const,
        ingredients: [
            { grams: 1000, per100: per(100, 20) },
            { grams: 1000, per100: per(50, 2) },
        ],
        open: [] as { per100: ReturnType<typeof per> }[],
        frozen: [] as { per100: ReturnType<typeof per> }[],
        last: null as { per100: ReturnType<typeof per> } | null,
    }

    it('uses a cook when there is one', () => {
        expect(expectedPer100({ ...box, frozen: [{ per100: per(140, 15) }] })).toEqual({
            per100: per(140, 15),
            fromRecipe: false,
        })
    })

    it('falls back to the raw recipe for a box never cooked', () => {
        expect(expectedPer100(box)).toEqual({ per100: per(75, 11), fromRecipe: true })
    })

    it('has nothing for an empty recipe', () => {
        expect(expectedPer100({ ...box, ingredients: [] })).toBeNull()
    })
})

describe('batchYield', () => {
    it('is the last cook, else the raw recipe weight', () => {
        expect(batchYield({ ingredients: [{ grams: 900 }], last: { cookedGrams: 700 } })).toBe(700)
        expect(batchYield({ ingredients: [{ grams: 900 }, { grams: 100 }], last: null })).toBe(1000)
        expect(batchYield({ ingredients: [], last: null })).toBeNull()
    })
})
