import { describe, it, expect } from 'vitest'
import { buildReviewReport } from './statementReview'
import type { StarlingSpendItem } from '../types'

const pay = (
    id: string,
    amount: number,
    date: string,
    hh: number,
    merchant: string,
    category = 'EATING_OUT'
): StarlingSpendItem => ({
    id,
    amount,
    date,
    time: new Date(`${date}T${String(hh).padStart(2, '0')}:00:00`).toISOString(),
    merchant,
    category,
    space: 'Main account',
})

// 2026-11-06 is a Friday, 2026-11-07 a Saturday, 2026-11-10 a Tuesday.
const payments = [
    pay('a', 40, '2026-11-06', 22, 'Pub'),
    pay('b', 3, '2026-11-07', 23, 'Greggs'),
    pay('c', 2.5, '2026-11-07', 10, 'Greggs'),
    pay('d', 4, '2026-11-07', 11, 'Greggs'),
    pay('e', 60, '2026-11-10', 9, 'Tesco', 'GROCERIES'),
]

describe('buildReviewReport', () => {
    it('splits good and bad money, all good by default', () => {
        const r = buildReviewReport(payments, new Set(), new Map(), (t) => t)
        expect(r.good).toEqual({ total: 109.5, count: 5 })
        expect(r.bad.count).toBe(0)
        expect(r.badShare).toBe(0)
        expect(r.patterns).toEqual([])
        expect(r.topGood[0].id).toBe('e')
    })

    it('groups the bad payments and finds patterns', () => {
        const r = buildReviewReport(payments, new Set(['a', 'b', 'c', 'd']), new Map(), (t) => t)
        expect(r.bad.total).toBe(49.5)
        expect(r.good.total).toBe(60)
        expect(r.byCategory).toHaveLength(1)
        expect(r.byMerchant.map((g) => g.label)).toEqual(['Pub', 'Greggs'])
        expect(r.byMerchant[1]).toMatchObject({ total: 9.5, count: 3 })
        const texts = r.patterns.map((p) => p.text).join(' | ')
        expect(texts).toContain('Fridays')
        expect(texts).toContain('late at night')
        expect(texts).toContain('3 small buys')
        expect(texts).toContain('Greggs came up 3 times')
    })
})
