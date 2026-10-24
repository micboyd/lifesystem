import { describe, it, expect } from 'vitest'
import { buildMoneyIn, incomeKind } from './moneyIn'
import type { StarlingSpendItem } from '../types'

let n = 0
function inc(date: string, amount: number, merchant: string, source: string): StarlingSpendItem {
    n++
    return { id: `i${n}`, date, time: `${date}T09:00:00`, amount, merchant, category: null, space: 'Main account', direction: 'IN', source }
}

describe('incomeKind', () => {
    it('sorts money in by where it came from', () => {
        expect(incomeKind(inc('2026-10-25', 3200, 'ACME LTD', 'DIRECT_CREDIT'))).toBe('pay')
        expect(incomeKind(inc('2026-10-25', 3200, 'Acme Payroll', 'FASTER_PAYMENTS_IN'))).toBe('pay')
        expect(incomeKind(inc('2026-10-12', 29, 'Zara', 'MASTER_CARD'))).toBe('refunds')
        expect(incomeKind(inc('2026-10-14', 20, 'Sam Jones', 'FASTER_PAYMENTS_IN'))).toBe('people')
        expect(incomeKind(inc('2026-10-14', 112, 'HMRC', 'FASTER_PAYMENTS_IN'))).toBe('government')
        expect(incomeKind(inc('2026-10-31', 1.2, 'Interest', 'INTEREST_PAYMENT'))).toBe('interest')
        // A business sending a few pounds back is a refund, not wages.
        expect(incomeKind(inc('2026-10-08', 12.5, 'Topcashback Ltd', 'FASTER_PAYMENTS_IN'))).toBe('refunds')
    })
})

describe('buildMoneyIn', () => {
    const items = [
        inc('2026-09-25', 3200, 'ACME LTD', 'DIRECT_CREDIT'),
        inc('2026-10-12', 29, 'Zara', 'MASTER_CARD'),
        inc('2026-10-14', 20, 'Sam Jones', 'FASTER_PAYMENTS_IN'),
    ]

    it('totals the month, groups it and nets it against spending', () => {
        const m = buildMoneyIn('2026-10', items, '2026-10-20', '2026-09', 900)
        expect(m.total).toBe(49)
        expect(m.groups.map((g) => g.kind)).toEqual(['refunds', 'people'])
        expect(m.net).toBe(49 - 900)
    })

    it("says when pay is due if it hasn't landed yet", () => {
        expect(buildMoneyIn('2026-10', items, '2026-10-20', '2026-09', 900).payExpected).toEqual({ day: 25, amount: 3200 })
        const paid = [...items, inc('2026-10-24', 3200, 'ACME LTD', 'DIRECT_CREDIT')]
        expect(buildMoneyIn('2026-10', paid, '2026-10-26', '2026-09', 900).payExpected).toBeNull()
    })
})
