import { describe, it, expect } from 'vitest'
import { buildMonthStatement } from './monthStatement'
import { buildMonthAhead } from './monthAhead'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, merchant: string, category: string, hhmm = '12:00'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T${hhmm}:00`, amount, merchant, category, space: 'Main account' }
}

const october = [
    tx('2026-10-01', 1200, 'Landlord', 'PAYMENTS'),
    tx('2026-10-05', 45, 'EE', 'BILLS_AND_SERVICES'),
    tx('2026-10-15', 148, 'Council', 'BILLS_AND_SERVICES'),
    tx('2026-10-08', 310, 'Tesco', 'GROCERIES'), // big shop: lumpy, not day-to-day
    ...Array.from({ length: 31 }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, 10, 'Pret', 'EATING_OUT')),
    tx('2026-10-25', 28.5, 'Uber Eats', 'EATING_OUT', '02:14'),
]

describe('buildMonthAhead on the 1st, nothing spent', () => {
    const s = buildMonthStatement('2026-11', october, october, '2026-11-01')
    const ahead = buildMonthAhead(s, october)

    it("lists last month's bills, rent included", () => {
        expect(ahead.bills.map((b) => [b.merchant, b.day, b.paid])).toEqual([
            ['Landlord', 1, false],
            ['EE', 5, false],
            ['Tesco', 8, false],
            ['Council', 15, false],
        ])
        expect(ahead.billsLeft).toBe(1703)
    })

    it('gives a day-to-day budget to match last month, and to beat it', () => {
        // £310 of Pret + £28.50 of Uber Eats day-to-day in October (the big shop is a one-off).
        expect(ahead.prevDayToDay).toBe(338.5)
        expect(ahead.matchPerDay).toBeCloseTo(11.28, 2)
        expect(ahead.trimSaving).toBe(33.85)
    })

    it("recalls last month's doh moments", () => {
        expect(ahead.lastDoh.lines.map((l) => l.id)).toContain('late-night')
    })

    it('offers no idea without the month before to compare with', () => {
        expect(ahead.tryThis).toBeNull()
    })

    it('forecasts from last month’s rate on day 1, bills due today included', () => {
        // £1,703 of bills + 29 days at a rate that's 90% October's (£10.92) on day 1.
        expect(s.forecast!.stillToCome).toBe(1703)
        expect(s.projected).toBeCloseTo(1703 + 0.9 * (338.5 / 31) * 29, 0)
    })
})
