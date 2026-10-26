import { describe, expect, it } from 'vitest'
import { dayTotals, weekAverage } from './dayTotals'
import type { Macros, MealPlanEntry } from '../types'

const m = (calories: number, protein = 0): Macros => ({ calories, protein, carbs: 0, fat: 0 })
const entry = (over: Partial<MealPlanEntry>): MealPlanEntry =>
    ({
        _id: 'x',
        date: '2026-11-02',
        slot: 'lunch',
        status: 'planned',
        macros: m(0),
        extra: false,
        ...over,
    }) as MealPlanEntry

const day = [
    entry({ _id: 'b', slot: 'breakfast', status: 'eaten', macros: m(500, 30) }),
    entry({ _id: 'l', slot: 'lunch', macros: m(600, 40) }),
    entry({ _id: 'd', slot: 'dinner', box: 'chilli' }),
    entry({ _id: 'a', slot: 'snack', away: true }),
]
const estimate = (e: MealPlanEntry) => (e._id === 'd' ? m(700, 55) : null)

describe('dayTotals', () => {
    it('adds eaten, planned and box estimates on a day ahead', () => {
        const t = dayTotals(day, estimate, '2026-11-02', '2026-11-01')
        expect(t.when).toBe('future')
        expect(t.total).toEqual(m(1800, 125))
        expect(t.planned).toEqual(m(1300, 95))
        expect(t.estimated).toBe(true)
    })

    it('splits eaten from still planned today', () => {
        const t = dayTotals(day, estimate, '2026-11-02', '2026-11-02')
        expect(t.eaten).toEqual(m(500, 30))
        expect(t.planned.calories).toBe(1300)
    })

    it('counts only what was eaten on a past day', () => {
        const t = dayTotals(day, estimate, '2026-11-02', '2026-11-05')
        expect(t.total).toEqual(m(500, 30))
        expect(t.estimated).toBe(false)
    })

    it('is not approximate without box notes', () => {
        expect(dayTotals(day.slice(0, 2), estimate, '2026-11-02', '2026-11-01').estimated).toBe(
            false
        )
    })
})

describe('weekAverage', () => {
    const t = (calories: number, estimated = false) => ({
        eaten: m(0),
        planned: m(calories),
        total: m(calories),
        estimated,
        when: 'future' as const,
    })

    it('averages the days with anything on them', () => {
        const avg = weekAverage([
            { totals: t(2000), goals: { calories: 2400 } },
            { totals: t(0), goals: { calories: 2400 } },
            { totals: t(2400, true), goals: { calories: 2200 } },
        ])
        expect(avg).toEqual({ calories: 2200, target: 2300, estimated: true })
    })

    it('has no target when a day has none, and nothing for an empty week', () => {
        expect(weekAverage([{ totals: t(2000), goals: null }])!.target).toBeNull()
        expect(weekAverage([{ totals: t(0), goals: null }])).toBeNull()
    })
})
