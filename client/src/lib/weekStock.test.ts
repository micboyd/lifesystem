import { describe, expect, it } from 'vitest'
import { weekStock } from './weekStock'
import type { BoxCook, MealPlanEntry, PlateFood } from '../types'

const Z = { calories: 0, protein: 0, carbs: 0, fat: 0 }

const cook = (id: string, cookedGrams: number, eatenGrams = 0, frozen = false): BoxCook => ({
    _id: id,
    food: 'f',
    name: 'Box',
    date: '2026-10-20',
    ingredients: [],
    raw: Z,
    cookedGrams,
    per100: Z,
    finished: false,
    frozen,
    eatenGrams,
    createdAt: '',
})

const food = (
    id: string,
    open: BoxCook[],
    frozen: BoxCook[] = [],
    kind: PlateFood['kind'] = 'box'
): PlateFood => ({
    _id: id,
    kind,
    name: id,
    ingredients: [],
    order: 0,
    open,
    frozen,
    last: open[0] ?? frozen[0] ?? null,
})

let n = 0
const plate = (
    date: string,
    foodId: string,
    grams: number,
    status: MealPlanEntry['status'] = 'planned'
) =>
    ({
        _id: `p${n++}`,
        date,
        slot: 'lunch',
        status,
        name: foodId,
        macros: Z,
        plate: [{ food: foodId, name: foodId, grams, per100: Z }],
    }) as unknown as MealPlanEntry

const note = (id: string, date: string, box: string) =>
    ({
        _id: id,
        date,
        slot: 'dinner',
        status: 'planned',
        name: box,
        macros: Z,
        box,
    }) as unknown as MealPlanEntry

const noProjection = () => null

describe('weekStock', () => {
    it('is ok when open batches cover the planned plates', () => {
        const rows = weekStock(
            [plate('2026-10-26', 'chilli', 400)],
            [food('chilli', [cook('a', 1000, 200)])],
            noProjection,
            '2026-10-26'
        )
        expect(rows).toEqual([
            expect.objectContaining({ food: 'chilli', needed: 400, open: 800, status: 'ok' }),
        ])
    })

    it('needs the freezer when open batches fall short', () => {
        const rows = weekStock(
            [plate('2026-10-26', 'chilli', 600), plate('2026-10-27', 'chilli', 600)],
            [food('chilli', [cook('a', 800)], [cook('b', 900, 0, true)])],
            noProjection,
            '2026-10-26'
        )
        expect(rows[0]).toMatchObject({ status: 'thaw', open: 800, frozen: 900 })
    })

    it('says how much is missing', () => {
        const rows = weekStock(
            [plate('2026-10-26', 'chilli', 1500)],
            [food('chilli', [cook('a', 1000)])],
            noProjection,
            '2026-10-26'
        )
        expect(rows[0]).toMatchObject({ status: 'short', short: 500 })
    })

    it('counts box notes at their projected grams', () => {
        const rows = weekStock(
            [note('n1', '2026-10-26', 'chilli'), note('n2', '2026-10-27', 'chilli')],
            [food('chilli', [cook('a', 700)])],
            () => 400,
            '2026-10-26'
        )
        expect(rows[0]).toMatchObject({ needed: 800, status: 'short', short: 100 })
    })

    it('treats an unsized note as needing some stock', () => {
        const empty = weekStock(
            [note('n', '2026-10-26', 'chilli')],
            [food('chilli', [])],
            noProjection,
            '2026-10-26'
        )
        expect(empty[0]).toMatchObject({ unsized: 1, status: 'short' })
        const some = weekStock(
            [note('n', '2026-10-26', 'chilli')],
            [food('chilli', [cook('a', 300)])],
            noProjection,
            '2026-10-26'
        )
        expect(some[0].status).toBe('ok')
    })

    it('ignores eaten plates, days before `from`, and plain foods never kept in batches', () => {
        const rows = weekStock(
            [
                plate('2026-10-26', 'chilli', 900, 'eaten'),
                plate('2026-10-25', 'chilli', 900),
                plate('2026-10-27', 'rice', 200),
            ],
            [food('chilli', [cook('a', 100)]), food('rice', [], [], 'plain')],
            noProjection,
            '2026-10-26'
        )
        expect(rows).toEqual([])
    })

    it('puts short items first', () => {
        const rows = weekStock(
            [plate('2026-10-26', 'a', 100), plate('2026-10-26', 'b', 900)],
            [food('a', [cook('x', 500)]), food('b', [cook('y', 100)])],
            noProjection,
            '2026-10-26'
        )
        expect(rows.map((r) => r.food)).toEqual(['b', 'a'])
    })
})
