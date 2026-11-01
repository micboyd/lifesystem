import { describe, expect, it } from 'vitest'
import { regularBills } from './regularBills'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, merchant: string, source: string, extra: Partial<StarlingSpendItem> = {}): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T06:00:00`, amount, merchant, category: 'BILLS_AND_SERVICES', space: 'Main account', source, ...extra }
}

describe('regularBills', () => {
    it('lists only direct debits and standing orders', () => {
        const r = regularBills(
            [
                tx('2026-10-01', 1200, 'Landlord', 'STANDING_ORDER'),
                tx('2026-10-05', 45, 'EE', 'DIRECT_DEBIT'),
                tx('2026-10-03', 10.99, 'Netflix', 'MASTER_CARD'),
                tx('2026-10-14', 20, 'Sam', 'FASTER_PAYMENTS_OUT'),
            ],
            '2026-11',
            '2026-11-01'
        )
        expect(r.bills.map((b) => [b.name, b.kind])).toEqual([
            ['Landlord', 'Standing order'],
            ['EE', 'Direct debit'],
        ])
        expect(r.total).toBe(1245)
    })

    it('ticks a bill once it goes out this month, at this month’s amount and day', () => {
        const r = regularBills(
            [tx('2026-10-12', 92, 'Octopus Energy', 'DIRECT_DEBIT'), tx('2026-11-13', 98, 'Octopus Energy', 'DIRECT_DEBIT')],
            '2026-11',
            '2026-11-20'
        )
        expect(r.bills).toEqual([{ name: 'Octopus Energy', amount: 98, day: 13, kind: 'Direct debit', paid: true }])
        expect(r.paid).toBe(98)
    })

    it('keeps last month’s unpaid bills and adds new ones from this month', () => {
        const r = regularBills(
            [tx('2026-10-15', 148, 'Council', 'DIRECT_DEBIT'), tx('2026-11-02', 30, 'New Gym', 'DIRECT_DEBIT')],
            '2026-11',
            '2026-11-05'
        )
        expect(r.bills.map((b) => [b.name, b.paid])).toEqual([
            ['New Gym', true],
            ['Council', false],
        ])
    })

    it('ignores older months, payments after today and money in', () => {
        const r = regularBills(
            [
                tx('2026-09-15', 148, 'Council', 'DIRECT_DEBIT'),
                tx('2026-11-20', 45, 'EE', 'DIRECT_DEBIT'),
                tx('2026-10-20', 5, 'Refund', 'DIRECT_DEBIT', { direction: 'IN' }),
            ],
            '2026-11',
            '2026-11-10'
        )
        expect(r.bills).toEqual([])
    })
})
