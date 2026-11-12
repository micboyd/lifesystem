import { describe, expect, it } from 'vitest'
import { lineAmount, lineKey, mergeLines, tickedKeys } from './shopping'
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

describe('mergeLines with trays', () => {
    // A tray of 5 boxes; its ingredients are the whole tray's. Count is in boxes.
    const tray = (count: number): ShoppingGroup => ({
        id: 't',
        kind: 'meal',
        name: 'BBQ chicken',
        count,
        batchOf: 5,
        ingredients: [
            { name: 'Chicken breast', grams: 1000 },
            { name: 'Limes', grams: 0, items: 2 },
        ],
    })
    const get = (lines: ReturnType<typeof mergeLines>, key: string) => lines.find((l) => l.key === key)!

    it('buys a share of the tray by servings', () => {
        const lines = mergeLines([tray(2)], 'servings')
        expect(get(lines, 'chicken breast').grams).toBe(400)
        // 0.8 of a lime is still one lime.
        expect(get(lines, 'lime').qty).toBe(1)
    })

    it('buys whole trays by batch, enough to cover the boxes', () => {
        expect(get(mergeLines([tray(5)], 'batch'), 'chicken breast').grams).toBe(1000)
        expect(get(mergeLines([tray(7)], 'batch'), 'chicken breast').grams).toBe(2000)
        expect(get(mergeLines([tray(2)], 'batch'), 'lime').qty).toBe(2)
    })

    it('leaves single meals alone either way', () => {
        const meal: ShoppingGroup = {
            id: 'm',
            kind: 'meal',
            name: 'Eggs on toast',
            count: 2,
            ingredients: [{ name: 'Eggs', grams: 0, items: 3 }],
        }
        expect(get(mergeLines([meal], 'batch'), 'egg').qty).toBe(6)
        expect(get(mergeLines([meal], 'servings'), 'egg').qty).toBe(6)
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

describe('lineKey', () => {
    it('makes one line of a name written two ways', () => {
        expect(lineKey('Onions')).toBe('onion')
        expect(lineKey(' red  onions ')).toBe('red onion')
        expect(lineKey('Cherry tomatoes')).toBe('cherry tomato')
        expect(lineKey('Berries')).toBe('berry')
        expect(lineKey('Peaches')).toBe('peach')
        expect(lineKey('Chicken breasts')).toBe(lineKey('chicken breast'))
    })

    it('leaves words that only look plural alone', () => {
        expect(lineKey('Hummus')).toBe('hummus')
        expect(lineKey('Couscous')).toBe('couscous')
        expect(lineKey('Gas')).toBe('gas')
        expect(lineKey('Rice')).toBe('rice')
    })

    it('reads older ticks as today’s keys', () => {
        expect(tickedKeys(['chicken breasts', 'rice']).has('chicken breast')).toBe(true)
    })
})

describe('mergeLines for batch cooking', () => {
    it('adds the same ingredient across meals written differently, keeping the first name', () => {
        const lines = mergeLines([
            { id: 'a', kind: 'meal', name: 'Chilli', count: 7, ingredients: [{ name: 'Onions', grams: 100 }] },
            { id: 'b', kind: 'meal', name: 'Curry', count: 2, ingredients: [{ name: 'onion', grams: 150 }] },
        ])
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatchObject({ name: 'Onions', grams: 1000, from: ['Chilli', 'Curry'] })
    })

    it('buys trays whole by default', () => {
        const lines = mergeLines([
            { id: 't', kind: 'meal', name: 'Tray', count: 6, batchOf: 5, ingredients: [{ name: 'Mince', grams: 1000 }] },
        ])
        expect(lines[0].grams).toBe(2000)
    })
})
