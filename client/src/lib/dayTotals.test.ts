import { describe, expect, it } from 'vitest'
import { dayTotals, weekAverage, weekMacros, type DayTotals } from './dayTotals'
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
    entry({ _id: 'd', slot: 'dinner', macros: m(700, 55) }),
    entry({ _id: 'a', slot: 'snack', away: true }),
]

describe('dayTotals', () => {
    it('adds eaten and planned on a day ahead', () => {
        const t = dayTotals(day, '2026-11-02', '2026-11-01')
        expect(t.when).toBe('future')
        expect(t.total).toEqual(m(1800, 125))
        expect(t.planned).toEqual(m(1300, 95))
    })

    it('splits eaten from still planned today', () => {
        const t = dayTotals(day, '2026-11-02', '2026-11-02')
        expect(t.eaten).toEqual(m(500, 30))
        expect(t.planned.calories).toBe(1300)
    })

    it('counts only what was eaten on a past day', () => {
        const t = dayTotals(day, '2026-11-02', '2026-11-05')
        expect(t.total).toEqual(m(500, 30))
    })

    it('keeps the whole plan on a past day, beside what was eaten', () => {
        const t = dayTotals(day, '2026-11-02', '2026-11-05')
        expect(t.plan).toEqual(m(1800, 125))
        expect(t.eaten).toEqual(m(500, 30))
    })

    it('plans the same as the total on a day ahead', () => {
        expect(dayTotals(day, '2026-11-02', '2026-11-01').plan).toEqual(m(1800, 125))
    })
})

describe('weekAverage', () => {
    const t = (calories: number) => ({
        eaten: m(0),
        planned: m(calories),
        total: m(calories),
        plan: m(calories),
        when: 'future' as const,
    })

    it('averages the days with anything on them', () => {
        const avg = weekAverage([
            { totals: t(2000), goals: { calories: 2400 } },
            { totals: t(0), goals: { calories: 2400 } },
            { totals: t(2400), goals: { calories: 2200 } },
        ])
        expect(avg).toEqual({ calories: 2200, target: 2300 })
    })

    it('has no target when a day has none, and nothing for an empty week', () => {
        expect(weekAverage([{ totals: t(2000), goals: null }])!.target).toBeNull()
        expect(weekAverage([{ totals: t(0), goals: null }])).toBeNull()
    })
})

describe('weekMacros', () => {
    const totals = (calories: number, when: 'past' | 'today' | 'future', eaten = calories) =>
        ({
            eaten: m(eaten, eaten / 10),
            planned: m(calories - eaten, (calories - eaten) / 10),
            total: m(calories, calories / 10),
            plan: m(calories, calories / 10),
            when,
        }) as DayTotals
    const goals = { calories: 2000, protein: 180 }

    it('averages used days, adds eaten so far, and counts empty days at target', () => {
        const w = weekMacros([
            { totals: totals(1800, 'past'), goals },
            { totals: totals(2200, 'today', 1000), goals },
            { totals: totals(0, 'future'), goals },
        ])!
        expect(w.average.calories).toBe(2000)
        expect(w.averageTarget.calories).toBe(2000)
        expect(w.soFar.calories).toBe(2800)
        expect(w.onTrack.calories).toBe(6000)
        expect(w.onTrack.protein).toBe(400 + 180)
        expect(w.weekTarget).toEqual({ calories: 6000, protein: 540 })
        expect(w.usedDays).toBe(2)
        expect(w.emptyDays).toBe(1)
    })

    it('leaves out a target any day is missing, and is null with nothing in', () => {
        const w = weekMacros([
            { totals: totals(1800, 'past'), goals },
            { totals: totals(1500, 'past'), goals: { calories: 2000 } },
        ])!
        expect(w.weekTarget.protein).toBeUndefined()
        expect(w.weekTarget.calories).toBe(4000)
        expect(weekMacros([{ totals: totals(0, 'future'), goals }])).toBeNull()
    })
})
