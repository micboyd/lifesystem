import { describe, it, expect } from 'vitest'
import { buildMonthStatement, categoryLabel, shiftMonth } from './monthStatement'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, extra: Partial<StarlingSpendItem> = {}): StarlingSpendItem {
    n++
    return {
        id: `t${n}`,
        date,
        time: `${date}T12:00:${String(n % 60).padStart(2, '0')}Z`,
        amount,
        merchant: 'Tesco',
        category: 'GROCERIES',
        space: 'Spending',
        ...extra,
    }
}

describe('shiftMonth / categoryLabel', () => {
    it('crosses year boundaries', () => {
        expect(shiftMonth('2026-01', -1)).toBe('2025-12')
        expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    })

    it('humanises Starling categories', () => {
        expect(categoryLabel('EATING_OUT')).toBe('Eating out')
        expect(categoryLabel(null)).toBe('Uncategorised')
    })
})

describe('buildMonthStatement', () => {
    const prev = [
        tx('2026-09-02', 20),
        tx('2026-09-10', 30, { merchant: 'Pret', category: 'EATING_OUT' }),
        tx('2026-09-25', 100, { merchant: 'Argos', category: 'SHOPPING' }),
    ]
    const cur = [
        tx('2026-10-01', 15),
        tx('2026-10-03', 40, { merchant: 'Pret', category: 'EATING_OUT' }),
        tx('2026-10-03', 5, { merchant: 'Pret', category: 'EATING_OUT' }),
        tx('2026-10-08', 60, { merchant: 'Trainline', category: 'TRANSPORT', space: 'Travel' }),
        // after "today" — not counted yet
        tx('2026-10-20', 999),
    ]

    const s = buildMonthStatement('2026-10', cur, prev, '2026-10-10')

    it('counts up to today only and works out the pace', () => {
        expect(s.isCurrent).toBe(true)
        expect(s.dayOfMonth).toBe(10)
        expect(s.total).toBe(120)
        expect(s.count).toBe(4)
        expect(s.dailyAverage).toBe(12)
        expect(s.projected).toBe(372) // 12 × 31
    })

    it('compares with last month at the same day', () => {
        expect(s.prev.month).toBe('2026-09')
        expect(s.prev.toSameDay).toBe(50)
        expect(s.prev.fullTotal).toBe(150)
    })

    it('ranks categories with shares and last month at the same point', () => {
        expect(s.categories.map((c) => c.label)).toEqual(['Transport', 'Eating out', 'Groceries'])
        const eating = s.categories[1]
        expect(eating.total).toBe(45)
        expect(eating.count).toBe(2)
        expect(eating.share).toBeCloseTo(45 / 120)
        expect(eating.prevTotal).toBe(30)
    })

    it('groups merchants case-insensitively and flags new ones', () => {
        const withCase = buildMonthStatement(
            '2026-10',
            [...cur, tx('2026-10-04', 1, { merchant: 'TESCO' })],
            prev,
            '2026-10-10'
        )
        expect(withCase.merchants.find((m) => m.key === 'tesco')?.count).toBe(2)
        expect(s.newMerchants).toEqual(['Trainline'])
    })

    it('builds the running total, days and highlights', () => {
        expect(s.cumulative).toHaveLength(10)
        expect(s.cumulative[0]).toBe(15)
        expect(s.cumulative[9]).toBe(120)
        expect(s.prevCumulative).toHaveLength(30)
        expect(s.days[0].date).toBe('2026-10-10')
        expect(s.noSpendDays).toBe(7)
        expect(s.biggest?.amount).toBe(60)
        expect(s.busiestDay?.date).toBe('2026-10-08')
        expect(s.spaces.map((x) => x.label)).toEqual(['Spending', 'Travel'])
    })

    it('starts clean on the 1st', () => {
        const fresh = buildMonthStatement('2026-11', [], cur, '2026-11-01')
        expect(fresh.total).toBe(0)
        expect(fresh.days).toHaveLength(1)
        expect(fresh.biggest).toBeNull()
        expect(fresh.busiestDay).toBeNull()
    })

    it('treats a past month as whole, with no projection', () => {
        const past = buildMonthStatement('2026-09', prev, [], '2026-10-10')
        expect(past.isCurrent).toBe(false)
        expect(past.dayOfMonth).toBe(30)
        expect(past.total).toBe(150)
        expect(past.projected).toBeNull()
    })

    it("forecasts without running rent and bills forward, adding bills still to come", () => {
        const prevBills = [
            tx('2026-09-01', 1200, { merchant: 'Landlord', category: 'PAYMENTS' }),
            tx('2026-09-25', 45, { merchant: 'EE', category: 'BILLS_AND_SERVICES' }),
        ]
        const now = [
            tx('2026-10-01', 1200, { merchant: 'Landlord', category: 'PAYMENTS' }),
            tx('2026-10-05', 100), // £10 a day of groceries over 10 days
        ]
        const f = buildMonthStatement('2026-10', now, prevBills, '2026-10-10')
        expect(f.forecast!.dayToDayPerDay).toBe(10)
        expect(f.forecast!.dayToDayRest).toBe(210)
        // EE came out on the 25th last month and hasn't yet.
        expect(f.forecast!.stillToCome).toBe(45)
        // Not (1300 / 10) × 31 = 4,030.
        expect(f.projected).toBe(1300 + 210 + 45)
    })
})
