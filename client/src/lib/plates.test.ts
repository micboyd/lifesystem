import { describe, it, expect } from 'vitest'
import { gramsLeft, lineMacros, per100FromCook, plateName, plateTotal, rawTotal } from './plates'

const chicken = { calories: 120, protein: 22, carbs: 0, fat: 3 }
const oil = { calories: 900, protein: 0, carbs: 0, fat: 100 }
const rice = { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 }

describe('boxes and plates', () => {
    it('totals the raw ingredients of a box', () => {
        expect(rawTotal([
            { grams: 1000, per100: chicken },
            { grams: 20, per100: oil },
        ])).toEqual({ calories: 1380, protein: 220, carbs: 0, fat: 50 })
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
        expect(plateTotal([
            { grams: 200, per100: { calories: 172.5, protein: 27.5, carbs: 0, fat: 6.3 } },
            { grams: 300, per100: rice },
        ])).toEqual({ calories: 735, protein: 63.1, carbs: 84, fat: 13.5 })
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
