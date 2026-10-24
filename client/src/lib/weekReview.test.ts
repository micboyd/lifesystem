import { describe, it, expect } from 'vitest'
import { buildWeekReview, mondayOf } from './weekReview'
import type { Copy } from './statementInsights'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, merchant = 'Pret', category = 'EATING_OUT', hhmm = '12:00'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T${hhmm}:00`, amount, merchant, category, space: 'Main account' }
}
const plain = (c: Copy) => c.map((p) => (typeof p === 'string' ? p : `£${p.money}`)).join('')

describe('mondayOf', () => {
    it('finds the Monday, with Sunday ending the week', () => {
        expect(mondayOf('2026-10-22')).toBe('2026-10-19') // Thursday
        expect(mondayOf('2026-10-25')).toBe('2026-10-19') // Sunday
        expect(mondayOf('2026-10-19')).toBe('2026-10-19')
    })
})

describe('buildWeekReview', () => {
    const items = [
        tx('2026-10-13', 40), // last week (Tue)
        tx('2026-10-19', 12), // Mon
        tx('2026-10-20', 1200, 'Landlord', 'PAYMENTS'), // a bill, kept apart
        tx('2026-10-21', 30, 'Dishoom'),
        tx('2026-10-22', 28.5, 'Uber Eats', 'EATING_OUT', '02:10'), // a doh
    ]

    it('counts the week so far against a weekly budget, bills apart', () => {
        const w = buildWeekReview(items, '2026-10-22', 20)
        expect([w.start, w.end, w.done, w.days]).toEqual(['2026-10-19', '2026-10-25', false, 4])
        expect(w.spent).toBe(70.5)
        expect(w.bills).toBe(1200)
        expect(w.budget).toBe(140)
        expect(w.lastWeek).toBe(40)
    })

    it('leads its tip with the doh', () => {
        expect(plain(buildWeekReview(items, '2026-10-22', 20).tip)).toBe('Next week, skip the small-hours spending and that’s £28.5 kept.')
    })

    it('reviews last week on a Monday', () => {
        const w = buildWeekReview(items, '2026-10-26', 20)
        expect([w.start, w.done, w.days]).toEqual(['2026-10-19', true, 7])
    })
})
