import { describe, expect, it } from 'vitest'
import { lineAmount, mergeLines } from './shopping'
import type { ShoppingGroup } from '../types'

const box = (name: string, count: number, ingredients: [string, number][]): ShoppingGroup => ({
    id: name,
    kind: 'box',
    name,
    count,
    ingredients: ingredients.map(([n, grams]) => ({ name: n, grams })),
})

describe('mergeLines', () => {
    it('sums an ingredient across boxes, times batches', () => {
        const lines = mergeLines([
            box('Chicken tray', 2, [['Chicken breast', 1000], ['Peppers', 400]]),
            box('Fajitas', 1, [['chicken breast ', 500]]),
        ])
        const chicken = lines.find((l) => l.key === 'chicken breast')!
        expect(chicken.grams).toBe(2500)
        expect(chicken.from).toEqual(['Chicken tray', 'Fajitas'])
        expect(lines).toHaveLength(2)
    })

    it('counts meals, foods and typed items as themselves', () => {
        const lines = mergeLines([
            { id: 'm', kind: 'meal', name: 'Overnight oats', count: 3, ingredients: [] },
            { id: 'i', kind: 'item', name: 'Milk', count: 1, ingredients: [] },
        ])
        expect(lines.map((l) => [l.name, l.qty])).toEqual([
            ['Overnight oats', 3],
            ['Milk', 1],
        ])
        expect(lines[1].item?.id).toBe('i')
    })

    it('merges a meal with ingredients into the same lines as boxes, times servings', () => {
        const lines = mergeLines([
            box('Chicken tray', 1, [['Chicken breast', 1000]]),
            {
                id: 'm',
                kind: 'meal',
                name: 'Chicken, rice & veg',
                count: 2,
                ingredients: [
                    { name: 'Chicken breast', grams: 150 },
                    { name: 'Rice', grams: 75 },
                ],
            },
        ])
        const chicken = lines.find((l) => l.key === 'chicken breast')!
        expect(chicken.grams).toBe(1300)
        expect(chicken.from).toEqual(['Chicken tray', 'Chicken, rice & veg'])
        expect(lines.find((l) => l.key === 'rice')!.grams).toBe(150)
        expect(lines.some((l) => l.key === 'chicken, rice & veg')).toBe(false)
    })

    it('buys counted ingredients by items, not grams', () => {
        const lines = mergeLines([
            {
                id: 'b',
                kind: 'box',
                name: 'Egg muffins',
                count: 2,
                ingredients: [{ name: 'Eggs', grams: 400, items: 6 }],
            },
            { id: 'm', kind: 'meal', name: 'Omelette', count: 1, ingredients: [{ name: 'eggs', grams: 0, items: 3 }] },
            { id: 'i', kind: 'item', name: 'Eggs', count: 1, ingredients: [] },
        ])
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ qty: 16, grams: 0, from: ['Egg muffins', 'Omelette'] })
        expect(lineAmount(lines[0])).toBe('×16')
    })

    it('treats a box with no ingredients as itself', () => {
        expect(mergeLines([box('Mystery', 2, [])])[0]).toMatchObject({ name: 'Mystery', qty: 2, grams: 0 })
    })
})

describe('lineAmount', () => {
    it('reads naturally', () => {
        expect(lineAmount({ key: 'a', name: 'a', grams: 1250, qty: 0, from: [] })).toBe('1.3 kg')
        expect(lineAmount({ key: 'a', name: 'a', grams: 400, qty: 0, from: [] })).toBe('400 g')
        expect(lineAmount({ key: 'a', name: 'a', grams: 0, qty: 1, from: [] })).toBe('')
        expect(lineAmount({ key: 'a', name: 'a', grams: 0, qty: 2, from: [] })).toBe('×2')
        expect(lineAmount({ key: 'a', name: 'a', grams: 400, qty: 1, from: [] })).toBe('400 g · ×1')
    })
})
