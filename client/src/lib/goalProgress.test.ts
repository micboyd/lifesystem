import { describe, it, expect } from 'vitest'
import { buildMonthStatement } from './monthStatement'
import { goalProgress } from './goalProgress'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, category = 'EATING_OUT'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T12:00:00`, amount, merchant: 'Somewhere', category, space: 'Main account' }
}
// September: £30 a day of day-to-day (£900), plus rent that never counts.
const sept = [
    tx('2026-09-01', 1200, 'PAYMENTS'),
    ...Array.from({ length: 30 }, (_, i) => tx(`2026-09-${String(i + 1).padStart(2, '0')}`, 30)),
]
const october = (perDay: number, upTo: number) =>
    Array.from({ length: upTo }, (_, i) => tx(`2026-10-${String(i + 1).padStart(2, '0')}`, perDay))

describe('goalProgress', () => {
    it('is on track when spending less by about the goal', () => {
        // Goal £250 means a £650 month, ~£21 a day. Spending £21 a day for 15 days.
        const items = [...sept, ...october(21, 15)]
        const s = buildMonthStatement('2026-10', items, items, '2026-10-15')
        const p = goalProgress(s, items, 250)
        expect(p.budget).toBe(650)
        expect(p.spent).toBe(315)
        expect(['on-track', 'ahead']).toContain(p.status)
        expect(p.perDayToHit).toBeCloseTo((650 - 315) / 16, 2)
    })

    it('is behind when spending at last month’s rate', () => {
        const items = [...sept, ...october(30, 15)]
        const s = buildMonthStatement('2026-10', items, items, '2026-10-15')
        expect(goalProgress(s, items, 250).status).toBe('behind')
    })

    it('calls a finished month kept or missed', () => {
        const items = [...sept, ...october(20, 31)]
        const s = buildMonthStatement('2026-10', items, items, '2026-11-02')
        const p = goalProgress(s, items, 250)
        expect(p.onCourseToKeep).toBe(900 - 620)
        expect(p.status).toBe('kept')
    })
})
