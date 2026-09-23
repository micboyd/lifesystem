import { describe, it, expect } from 'vitest'
import { weekSummary } from './nutritionWeek'
import { addDays } from './calendar'
import { batch, buffetEntry, fromBatch } from './__mealPrepFixtures'
import type { MealPlanEntry } from '../types'

const MONDAY = '2026-09-21'
const days = Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
const TODAY = '2026-09-23' // Wednesday
const goals = () => ({ calories: 2000, protein: 180 })

function adhoc(date: string, calories: number, status: MealPlanEntry['status']): MealPlanEntry {
    return {
        _id: `${date}-${calories}-${status}`,
        date,
        slot: 'dinner',
        adhoc: { name: 'x', macros: { calories, protein: calories / 20, carbs: 0, fat: 0 } },
        servings: 1,
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

describe('weekSummary', () => {
    it('splits consumed, still planned and projected, against the summed daily targets', () => {
        const b = batch({ kcalPer100: 100 })
        const entries = [
            adhoc(days[0], 1900, 'eaten'),
            buffetEntry(days[1], 'eaten', [fromBatch(b, 2000)]),
            buffetEntry(days[2], 'planned', [fromBatch(b, 600)]),
            adhoc(days[3], 2100, 'planned'),
            adhoc(days[4], 500, 'skipped'),
        ]
        const s = weekSummary(entries, days, goals, TODAY)
        expect(s.consumed.calories).toBe(3900)
        expect(s.stillPlanned.calories).toBe(2700)
        expect(s.projected.calories).toBe(6600)
        expect(s.target).toEqual({ calories: 14000, protein: 1260, carbs: 0, fat: 0, days: 7 })
    })

    it('averages consumed intake only over complete past days', () => {
        const entries = [
            adhoc(days[0], 1900, 'eaten'), // complete
            adhoc(days[1], 400, 'eaten'), // half-logged: under 50% of 2,000
            adhoc(days[2], 2100, 'eaten'), // today, complete
            adhoc(days[4], 2500, 'eaten'), // future-dated log is not a complete past day
        ]
        const s = weekSummary(entries, days, goals, TODAY)
        expect(s.completeDays).toBe(2)
        expect(s.avgConsumed!.calories).toBe(2000)
    })

    it('returns no average rather than zero when nothing is complete', () => {
        const s = weekSummary([adhoc(days[5], 2000, 'planned')], days, goals, TODAY)
        expect(s.avgConsumed).toBeNull()
        expect(s.daysWithFood).toBe(1)
        expect(s.avgProjected!.calories).toBe(2000)
    })

    it('uses a flat floor to judge completeness with no targets set', () => {
        const s = weekSummary([adhoc(days[0], 900, 'eaten'), adhoc(days[1], 700, 'eaten')], days, () => null, TODAY)
        expect(s.target).toBeNull()
        expect(s.completeDays).toBe(1)
    })
})
