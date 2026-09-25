import { describe, it, expect } from 'vitest'
import {
    entryMacros,
    isCounted,
    sumMacros,
    sumEatenMacros,
    sumPendingMacros,
} from './nutrition'
import type { EntryStatus, MealPlanEntry } from '../types'

/** An entry carries its own copy of the meal's macros. */
function entry(calories: number, protein: number, status: EntryStatus = 'planned', extra = false): MealPlanEntry {
    return {
        _id: `${calories}-${status}`,
        date: '2026-08-21',
        slot: 'dinner',
        meal: 'm1',
        name: 'Chilli',
        macros: { calories, protein, carbs: 10, fat: 5 },
        status,
        extra,
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

describe('entryMacros', () => {
    it('reads the copy the entry took when it was added', () => {
        expect(entryMacros(entry(600, 45))).toEqual({ calories: 600, protein: 45, carbs: 10, fat: 5 })
    })
})

describe('counting', () => {
    it('counts planned and eaten meals on the plan', () => {
        expect(isCounted(entry(600, 45, 'eaten'))).toBe(true)
        expect(isCounted(entry(600, 45, 'planned'))).toBe(true)
    })

    it('keeps planned and eaten apart', () => {
        const entries = [entry(600, 45, 'eaten'), entry(400, 30, 'planned'), entry(250, 10, 'eaten', true)]
        expect(sumMacros(entries).calories).toBe(1250)
        expect(sumEatenMacros(entries).calories).toBe(850)
        expect(sumPendingMacros(entries).calories).toBe(400)
    })

    it('is all zeroes for an empty day, which is a real answer here', () => {
        expect(sumMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    })
})
