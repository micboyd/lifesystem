import { describe, expect, it } from 'vitest'
import { mealLookup, parseMenu, readNewMeals, readPutOn } from './menuImport'

const lookup = mealLookup([
    { _id: 'a1', name: 'Overnight oats' },
    { _id: 'b2', name: 'Chicken stroganoff' },
    { _id: 'c3', name: 'Rice cakes' },
    { _id: 'd4', name: 'Curry' },
])

describe('parseMenu', () => {
    it('is undefined when absent and empty when null', () => {
        expect(parseMenu(undefined, lookup)).toBeUndefined()
        expect(parseMenu(null, lookup)).toEqual({ items: [], unknown: [], unknownSlots: {} })
    })

    it('fills spans and lets a named day replace their slots', () => {
        const out = parseMenu(
            {
                sat: { breakfast: 'Curry' },
                everyDay: { breakfast: 'overnight oats' },
                weekdays: { lunch: ['Chicken stroganoff', 'Rice cakes'] },
            },
            lookup
        )
        if (!out || 'error' in out) throw new Error('expected items')
        expect(out.items.filter((i) => i.slot === 'breakfast' && i.meal === 'a1')).toHaveLength(6)
        expect(out.items.find((i) => i.day === 5 && i.slot === 'breakfast')?.meal).toBe('d4')
        expect(out.items.filter((i) => i.slot === 'lunch')).toHaveLength(10)
        expect(out.unknown).toEqual([])
    })

    it('reports names that match no meal', () => {
        const out = parseMenu({ mon: { dinner: 'Lasagne' }, tue: { lunch: 'lasagne' } }, lookup)
        expect(out).toEqual({ items: [], unknown: ['Lasagne'], unknownSlots: { Lasagne: ['lunch', 'dinner'] } })
    })

    it('accepts the stored list form with day names or numbers, and ids', () => {
        const out = parseMenu(
            [
                { day: 'Tuesday', slot: 'lunch', meal: 'Curry' },
                { day: 6, slot: 'snacks', meal: 'c3' },
            ],
            lookup
        )
        expect(out).toEqual({
            items: [
                { day: 1, slot: 'lunch', meal: 'd4' },
                { day: 6, slot: 'snack', meal: 'c3' },
            ],
            unknown: [],
            unknownSlots: {},
        })
    })

    it('rejects unknown days and slots with a clear message', () => {
        expect(parseMenu({ funday: {} }, lookup)).toMatchObject({ error: expect.stringContaining('funday') })
        expect(parseMenu({ mon: { brunch: 'Curry' } }, lookup)).toMatchObject({ error: expect.stringContaining('brunch') })
        expect(parseMenu('oats', lookup)).toMatchObject({ error: expect.any(String) })
    })
})

describe('readPutOn', () => {
    it('reads true, a date, or nothing', () => {
        expect(readPutOn(undefined)).toBeNull()
        expect(readPutOn(false)).toBeNull()
        expect(readPutOn(true)).toEqual({})
        expect(readPutOn('2026-12-01')).toEqual({ from: '2026-12-01' })
        expect(readPutOn('soon')).toMatchObject({ error: expect.any(String) })
    })
})

describe('readNewMeals', () => {
    it('is empty when absent', () => {
        expect(readNewMeals(undefined)).toEqual([])
        expect(readNewMeals(null)).toEqual([])
    })

    it('reads flat or nested macros and slot names', () => {
        expect(
            readNewMeals([
                { name: ' Chicken sausages ', types: ['Breakfast'], calories: 220, protein: 24, carbs: 4, fat: 12 },
                { name: 'Rice cakes', slots: 'snacks', macros: { calories: 70, protein: 1 } },
                { name: 'Mystery' },
            ])
        ).toEqual([
            { name: 'Chicken sausages', types: ['breakfast'], calories: 220, protein: 24, carbs: 4, fat: 12 },
            { name: 'Rice cakes', types: ['snack'], calories: 70, protein: 1 },
            { name: 'Mystery' },
        ])
    })

    it('says what is wrong', () => {
        expect(readNewMeals({})).toHaveProperty('error')
        expect(readNewMeals([{ calories: 100 }])).toEqual({ error: 'meals item 1 needs a name' })
        expect(readNewMeals([{ name: 'X', calories: -5 }])).toHaveProperty('error')
        expect(readNewMeals([{ name: 'X', calories: '200' }])).toHaveProperty('error')
        expect(readNewMeals([{ name: 'X', types: ['brunch'] }])).toHaveProperty('error')
    })
})
