import { describe, expect, it } from 'vitest'
import { daysLabel, isBatch, prepFor, prepMeals, prepPresets } from './prep'
import type { Meal, MealPlanEntry } from '../types'

const meal = (id: string, extra: Partial<Meal> = {}) =>
    ({ _id: id, name: id, types: ['lunch'], macros: {}, ingredients: [], ...extra }) as unknown as Meal

const entry = (date: string, mealId: string | undefined, extra: Partial<MealPlanEntry> = {}) =>
    ({ _id: `${date}-${mealId}-${Math.random()}`, date, slot: 'lunch', meal: mealId, name: mealId ?? 'x', status: 'planned', ...extra }) as MealPlanEntry

const meals = new Map([
    ['greek', meal('greek', { batchCook: true })],
    ['bagel', meal('bagel', { batchCook: false })],
    ['tray', meal('tray', { batchOf: 5 })],
])
const range = { from: '2026-11-30', to: '2026-12-02', extras: [] }

describe('isBatch', () => {
    it('follows the switch; a tray is batch unless it says not', () => {
        expect(isBatch({ batchCook: true })).toBe(true)
        expect(isBatch({ batchOf: 5 })).toBe(true)
        expect(isBatch({ batchOf: 5, batchCook: false })).toBe(false)
        expect(isBatch({})).toBe(false)
    })
})

describe('prepFor', () => {
    it('counts the days’ meals, split into batch and fresh', () => {
        const p = prepFor(
            [
                entry('2026-11-30', 'greek'),
                entry('2026-12-02', 'greek'),
                entry('2026-11-30', 'bagel'),
                entry('2026-12-01', 'tray'),
                entry('2026-12-03', 'greek'), // after the days
            ],
            meals,
            range,
            '2026-11-21'
        )
        expect(p.batch.map((r) => [r.meal._id, r.planned, r.dates])).toEqual([
            ['greek', 2, ['2026-11-30', '2026-12-02']],
            ['tray', 1, ['2026-12-01']],
        ])
        expect(p.fresh.map((r) => [r.meal._id, r.planned])).toEqual([['bagel', 1]])
    })

    it('leaves out eaten, skipped, past, away and quick adds', () => {
        const p = prepFor(
            [
                entry('2026-11-30', 'greek', { status: 'eaten' }),
                entry('2026-12-01', 'greek', { away: true }),
                entry('2026-12-01', undefined),
                entry('2026-11-30', 'bagel'),
            ],
            meals,
            range,
            '2026-12-01'
        )
        expect(p.batch).toEqual([])
        expect(p.fresh).toEqual([])
        expect(p.left).toEqual({ past: 1, done: 1, noMeal: 1 })
    })

    it('adds the extras on top', () => {
        const p = prepFor([entry('2026-11-30', 'greek')], meals, { ...range, extras: [{ meal: 'greek', count: 2 }, { meal: 'bagel', count: 1 }] }, '2026-11-21')
        expect(p.batch[0]).toMatchObject({ planned: 1, extra: 2 })
        expect(p.fresh[0]).toMatchObject({ planned: 0, extra: 1, dates: [] })
        expect(prepMeals(p)).toEqual([
            { id: 'greek', count: 3 },
            { id: 'bagel', count: 1 },
        ])
    })
})

describe('presets and labels', () => {
    it('runs the week Monday to Sunday', () => {
        expect(prepPresets('2026-11-21')).toEqual([
            { label: 'Next 3 days', from: '2026-11-21', to: '2026-11-23' },
            { label: 'Rest of this week', from: '2026-11-21', to: '2026-11-22' },
            { label: 'Next week', from: '2026-11-23', to: '2026-11-29' },
        ])
    })
    it('names the days', () => {
        expect(daysLabel(['2026-11-30', '2026-12-02'])).toBe('Mon, Wed')
        expect(daysLabel(['2026-11-30', '2026-12-08'])).toBe('Mon 30 Nov, Tue 8 Dec')
    })
})
