import { describe, it, expect } from 'vitest'
import {
    entryMacros,
    isCounted,
    sumMacros,
    sumEatenMacros,
    sumPendingMacros,
    mealFit,
    proteinDensity,
} from './nutrition'
import type { EntryStatus, Macros, Meal, MealPlanEntry } from '../types'

/** A library entry whose macros are stated per serving. */
function libraryEntry(
    calories: number,
    protein: number,
    status: EntryStatus = 'planned',
    servings?: number
): MealPlanEntry {
    return {
        _id: `${calories}-${status}-${servings}`,
        date: '2026-08-21',
        slot: 'dinner',
        meal: {
            _id: 'm1',
            name: 'Chilli',
            macros: { calories, protein, carbs: 10, fat: 5 },
        } as Meal,
        ...(servings === undefined ? {} : { servings }),
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as MealPlanEntry
}

function adhocEntry(calories: number, status: EntryStatus = 'planned'): MealPlanEntry {
    return {
        _id: `adhoc-${calories}-${status}`,
        date: '2026-08-21',
        slot: 'snack',
        adhoc: { name: 'Pint', macros: { calories, protein: 2, carbs: 15, fat: 0 } },
        servings: 1,
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as MealPlanEntry
}

describe('entryMacros', () => {
    it('reads the recipe’s per-serving macros', () => {
        expect(entryMacros(libraryEntry(600, 45))).toEqual({
            calories: 600,
            protein: 45,
            carbs: 10,
            fat: 5,
        })
    })

    it('scales by servings', () => {
        const m = entryMacros(libraryEntry(600, 45, 'planned', 2))
        expect(m.calories).toBe(1200)
        expect(m.protein).toBe(90)
    })

    it('handles fractional portions', () => {
        expect(entryMacros(libraryEntry(600, 45, 'planned', 0.5)).calories).toBe(300)
    })

    it('treats an entry written before servings existed as one serving', () => {
        expect(entryMacros(libraryEntry(600, 45)).calories).toBe(600)
    })

    it('uses an ad-hoc entry’s own macros', () => {
        expect(entryMacros(adhocEntry(250)).calories).toBe(250)
    })

    it('is zero for an entry with neither', () => {
        const bare = { _id: 'x', date: '2026-08-21', slot: 'snack', servings: 1, status: 'planned', order: 0 } as MealPlanEntry
        expect(entryMacros(bare).calories).toBe(0)
    })
})

describe('counting', () => {
    it('excludes skipped food from the tally', () => {
        expect(isCounted(libraryEntry(600, 45, 'skipped'))).toBe(false)
        expect(isCounted(libraryEntry(600, 45, 'eaten'))).toBe(true)
        expect(isCounted(libraryEntry(600, 45, 'planned'))).toBe(true)
    })

    it('keeps planned and eaten apart', () => {
        const entries = [
            libraryEntry(600, 45, 'eaten'),
            libraryEntry(400, 30, 'planned'),
            libraryEntry(900, 60, 'skipped'),
        ]
        expect(sumMacros(entries).calories).toBe(1000)
        expect(sumEatenMacros(entries).calories).toBe(600)
        expect(sumPendingMacros(entries).calories).toBe(400)
    })

    it('scales servings inside every tally', () => {
        const entries = [libraryEntry(600, 45, 'eaten', 2), adhocEntry(250, 'planned')]
        expect(sumEatenMacros(entries).protein).toBe(90)
        expect(sumPendingMacros(entries).calories).toBe(250)
        expect(sumMacros(entries).calories).toBe(1450)
    })

    it('is all zeroes for an empty day, which is a real answer here', () => {
        expect(sumMacros([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 })
    })
})

describe('proteinDensity', () => {
    it('measures protein per 100 kcal', () => {
        expect(proteinDensity({ calories: 400, protein: 40, carbs: 0, fat: 0 })).toBe(10)
    })

    it('ranks a lean small meal above a big one with more protein', () => {
        const big = proteinDensity({ calories: 900, protein: 40, carbs: 0, fat: 0 })!
        const lean = proteinDensity({ calories: 350, protein: 30, carbs: 0, fat: 0 })!
        expect(lean).toBeGreaterThan(big)
    })

    it('is null without calories to divide by', () => {
        expect(proteinDensity({ calories: 0, protein: 10, carbs: 0, fat: 0 })).toBeNull()
    })
})

describe('mealFit', () => {
    const dense: Macros = { calories: 400, protein: 45, carbs: 20, fat: 8 }
    const heavy: Macros = { calories: 900, protein: 30, carbs: 100, fat: 30 }
    const small: Macros = { calories: 180, protein: 20, carbs: 5, fat: 4 }

    it('flags a protein-dense meal', () => {
        expect(mealFit(dense, null)).toContain('high-protein')
        expect(mealFit(heavy, null)).not.toContain('high-protein')
    })

    it('says a meal fits what is left', () => {
        expect(mealFit(dense, { calories: 800 })).toContain('fits')
    })

    it('says a meal is large when it overruns what is left', () => {
        expect(mealFit(heavy, { calories: 600 })).toContain('large')
        expect(mealFit(heavy, { calories: 600 })).not.toContain('fits')
    })

    it('does not call a meal a fit when it uses up every last calorie', () => {
        expect(mealFit(heavy, { calories: 920 })).not.toContain('fits')
    })

    it('flags a light meal', () => {
        expect(mealFit(small, null)).toContain('light')
        expect(mealFit(dense, null)).not.toContain('light')
    })

    it('drops the fit labels when there is no target to fit into', () => {
        const labels = mealFit(heavy, null)
        expect(labels).not.toContain('fits')
        expect(labels).not.toContain('large')
    })

    it('drops the fit labels when the day is already over target', () => {
        expect(mealFit(dense, { calories: -200 })).not.toContain('large')
        expect(mealFit(dense, { calories: -200 })).not.toContain('fits')
    })
})
