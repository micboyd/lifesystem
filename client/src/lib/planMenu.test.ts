import { describe, expect, it } from 'vitest'
import { cookList, copyDay, dayTotal, fillMenu, gapOf, rankForSlot, sortMenu, weekAverage } from './planMenu'
import type { Meal, MealType, MenuItem } from '../types'

const goals = { calories: 2000, protein: 160, carbs: 200, fat: 60 }

function meal(id: string, types: MealType[], calories: number, protein: number, batchOf: number | null = null): Meal {
    return {
        _id: id,
        name: id,
        types,
        macros: { calories, protein, carbs: Math.round((calories - protein * 4) / 8), fat: Math.round((calories - protein * 4) / 18) },
        ingredients: [],
        batchOf,
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

const oats = meal('oats', ['breakfast'], 550, 40)
const eggs = meal('eggs', ['breakfast'], 520, 42)
const tray = meal('tray', ['lunch', 'dinner'], 600, 50, 5)
const wrap = meal('wrap', ['lunch'], 580, 45)
const curry = meal('curry', ['dinner'], 620, 52)
const pasta = meal('pasta', ['dinner'], 1400, 30)
const yog = meal('yog', ['snack'], 200, 20)
const library = [oats, eggs, tray, wrap, curry, pasta, yog]
const byId = new Map(library.map((m) => [m._id, m]))

describe('fillMenu', () => {
    it('gives every day breakfast, lunch and dinner', () => {
        const menu = fillMenu([], library, goals)
        for (let d = 0; d < 7; d++)
            for (const slot of ['breakfast', 'lunch', 'dinner'] as const)
                expect(menu.some((m) => m.day === d && m.slot === slot)).toBe(true)
    })

    it('keeps what is already planned', () => {
        const kept: MenuItem = { day: 2, slot: 'dinner', meal: 'pasta' }
        const menu = fillMenu([kept], library, goals)
        expect(menu.filter((m) => m.day === 2 && m.slot === 'dinner')).toEqual([kept])
    })

    it('skips a meal far off the day’s aim', () => {
        const menu = fillMenu([], library, goals)
        expect(menu.some((m) => m.meal === 'pasta')).toBe(false)
    })

    it('spreads repeats when the library allows', () => {
        const more = [...library, meal('toast', ['breakfast'], 540, 41)]
        const menu = fillMenu([], more, goals)
        const count = (id: string) => menu.filter((m) => m.meal === id).length
        expect(count('oats')).toBeLessThanOrEqual(3)
        expect(count('eggs')).toBeLessThanOrEqual(3)
    })

    it('still fills the week from a tiny library', () => {
        const menu = fillMenu([], [oats, tray], goals)
        expect(menu.filter((m) => m.slot === 'breakfast').length).toBe(7)
    })

    it('runs a started tray on rather than leaving boxes', () => {
        const menu = fillMenu([], library, goals)
        expect(menu.filter((m) => m.meal === 'tray').length).toBeGreaterThanOrEqual(5)
    })

    it('never puts the same meal twice in a day', () => {
        const menu = fillMenu([], library, goals)
        for (let d = 0; d < 7; d++) {
            const ids = menu.filter((m) => m.day === d).map((m) => m.meal)
            expect(new Set(ids).size).toBe(ids.length)
        }
    })

    it('adds a snack only when the day is short', () => {
        const big = meal('big', ['breakfast'], 900, 70)
        const full = fillMenu([], [big, tray, wrap, curry, yog], { calories: 2000, protein: 160 }, { days: [0] })
        expect(full.some((m) => m.slot === 'snack')).toBe(false)
        const short = fillMenu([], library, goals, { days: [0] })
        expect(short.some((m) => m.slot === 'snack')).toBe(true)
    })

    it('fills only the days asked for', () => {
        const menu = fillMenu([], library, goals, { days: [4] })
        expect(new Set(menu.map((m) => m.day))).toEqual(new Set([4]))
    })

    it('still fills with no targets, by variety alone', () => {
        const menu = fillMenu([], library, null, { days: [0] })
        expect(menu.length).toBe(3)
    })

    it('cooks fewer meals in batch style', () => {
        const distinct = (menu: MenuItem[]) => new Set(menu.map((m) => m.meal)).size
        const many = [
            ...library,
            ...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => meal(id, ['lunch', 'dinner'], 600, 50)),
        ]
        expect(distinct(fillMenu([], many, goals, { batch: true }))).toBeLessThan(distinct(fillMenu([], many, goals)))
    })

    it('is the same for the same seed', () => {
        expect(fillMenu([], library, goals, { seed: 7 })).toEqual(fillMenu([], library, goals, { seed: 7 }))
    })
})

describe('rankForSlot', () => {
    it('leaves out what is already that day', () => {
        const menu: MenuItem[] = [{ day: 0, slot: 'lunch', meal: 'tray' }]
        const ranked = rankForSlot(menu, 0, 'dinner', library, goals, byId)
        expect(ranked.map((r) => r.meal._id)).not.toContain('tray')
    })

    it('ranks meals tagged for other slots when asked', () => {
        const ranked = rankForSlot([], 0, 'breakfast', library, goals, byId, { anySlot: true })
        expect(ranked.map((r) => r.meal._id)).toContain('curry')
    })

    it('can ignore the item being swapped', () => {
        const item: MenuItem = { day: 0, slot: 'dinner', meal: 'curry' }
        const ranked = rankForSlot([item], 0, 'dinner', library, goals, byId, { ignore: item })
        expect(ranked.map((r) => r.meal._id)).toContain('curry')
    })
})

describe('totals', () => {
    const menu: MenuItem[] = [
        { day: 0, slot: 'breakfast', meal: 'oats' },
        { day: 0, slot: 'lunch', meal: 'wrap' },
        { day: 1, slot: 'lunch', meal: 'gone' },
    ]
    it('adds a day up, counting deleted meals as nothing', () => {
        expect(dayTotal(menu, 0, byId).calories).toBe(1130)
        expect(dayTotal(menu, 1, byId).calories).toBe(0)
    })
    it('averages the days with something on', () => {
        expect(weekAverage(menu, byId)!.calories).toBe(565)
        expect(weekAverage([], byId)).toBeNull()
    })
})

describe('copyDay', () => {
    it('replaces the target days with the source day', () => {
        const menu: MenuItem[] = [
            { day: 0, slot: 'breakfast', meal: 'oats' },
            { day: 1, slot: 'breakfast', meal: 'eggs' },
            { day: 1, slot: 'dinner', meal: 'curry' },
        ]
        const out = copyDay(menu, 0, [1, 2])
        expect(out.filter((m) => m.day === 1)).toEqual([{ day: 1, slot: 'breakfast', meal: 'oats' }])
        expect(out.filter((m) => m.day === 2)).toEqual([{ day: 2, slot: 'breakfast', meal: 'oats' }])
    })
})

describe('sortMenu', () => {
    it('orders by day then slot', () => {
        const out = sortMenu([
            { day: 1, slot: 'breakfast', meal: 'a' },
            { day: 0, slot: 'dinner', meal: 'b' },
            { day: 0, slot: 'breakfast', meal: 'c' },
        ])
        expect(out.map((m) => m.meal)).toEqual(['c', 'b', 'a'])
    })
})

describe('gapOf', () => {
    it('reads near enough as on target', () => {
        expect(gapOf(1950, 2000, 'calories')).toBe('on')
        expect(gapOf(1800, 2000, 'calories')).toBe('under')
        expect(gapOf(2200, 2000, 'calories')).toBe('over')
        expect(gapOf(100, undefined, 'protein')).toBe('none')
    })
})

describe('cookList', () => {
    it('rounds tray meals up to whole trays and counts spare boxes', () => {
        const menu: MenuItem[] = Array.from({ length: 6 }, (_, day) => ({ day, slot: 'lunch' as const, meal: 'tray' }))
        const [line] = cookList(menu, byId)
        expect(line).toMatchObject({ portions: 6, trays: 2, spare: 4 })
    })
})
