import { describe, expect, it } from 'vitest'
import { basePortions, itemsLabel, scaleIngredients } from './recipe'

describe('basePortions', () => {
    it('is one for a single meal and the box count for a tray', () => {
        expect(basePortions({})).toBe(1)
        expect(basePortions({ batchOf: null })).toBe(1)
        expect(basePortions({ batchOf: 4 })).toBe(4)
    })
})

describe('scaleIngredients', () => {
    const ings = [
        { name: 'Chicken', grams: 180 },
        { name: 'Oil', grams: 5 },
        { name: 'Eggs', grams: 0, items: 3 },
    ]

    it('leaves amounts alone at the base portions', () => {
        expect(scaleIngredients(ings, 1, 1)).toEqual(ings)
    })

    it('multiplies up for more portions', () => {
        const out = scaleIngredients(ings, 1, 3)
        expect(out.map((i) => i.grams)).toEqual([540, 15, 0])
        expect(out[2].items).toBe(9)
    })

    it('divides a tray down to one box, rounding grams and counts', () => {
        const out = scaleIngredients([{ name: 'Mince', grams: 1000 }, { name: 'Onion', grams: 0, items: 2 }, { name: 'Salt', grams: 6 }], 4, 1)
        expect(out[0].grams).toBe(250)
        expect(out[1].items).toBe(0.5)
        expect(out[2].grams).toBe(1.5)
    })

    it('never drops a count below a half', () => {
        expect(scaleIngredients([{ name: 'Egg', grams: 0, items: 1 }], 6, 1)[0].items).toBe(0.5)
    })
})

describe('itemsLabel', () => {
    it('shows halves as fractions', () => {
        expect(itemsLabel(0.5)).toBe('½')
        expect(itemsLabel(1.5)).toBe('1½')
        expect(itemsLabel(3)).toBe('3')
    })
})
