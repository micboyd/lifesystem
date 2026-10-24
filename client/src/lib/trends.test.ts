import { describe, it, expect } from 'vitest'
import { buildTrends } from './trends'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(month: string, amount: number, category: string, direction?: 'IN'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date: `${month}-10`, time: `${month}-10T12:00:00`, amount, merchant: 'X', category, space: 'Main account', direction }
}
const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']

describe('buildTrends', () => {
    // Rent flat; eating out creeping from ~£100 to ~£200; shopping easing off.
    const eating = [100, 100, 110, 180, 200, 220, 50]
    const shopping = [210, 180, 190, 60, 50, 40, 10]
    const out = months.flatMap((m, i) => [tx(m, 1200, 'PAYMENTS'), tx(m, eating[i], 'EATING_OUT'), tx(m, shopping[i], 'SHOPPING')])
    const incoming = months.map((m) => tx(m, 1600, 'INCOME', 'IN'))
    const t = buildTrends(out, incoming, months, '2026-10')

    it('averages finished months only', () => {
        expect(t.averageIn).toBe(1600)
        expect(t.months[t.months.length - 1].partial).toBe(true)
        expect(t.averageOut).toBeCloseTo(1200 + (100 + 100 + 110 + 180 + 200 + 220) / 6 + (210 + 180 + 190 + 60 + 50 + 40) / 6, 1)
    })

    it('finds the best and worst months', () => {
        expect(t.best!.month).toBe('2026-07')
        expect(t.worst!.month).toBe('2026-04')
    })

    it('spots what is creeping up and easing off, last three months against the three before', () => {
        expect(t.creepingUp.map((c) => c.label)).toEqual(['Eating out'])
        expect(t.easingOff.map((c) => c.label)).toEqual(['Shopping'])
    })

    it('counts months that came out ahead', () => {
        expect(t.monthsAhead).toBe(6)
    })
})
