import { describe, it, expect } from 'vitest'
import { findSubscriptions } from './subscriptions'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, merchant: string, category: string): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T06:00:00`, amount, merchant, category, space: 'Main account' }
}
const months = ['2026-08', '2026-09', '2026-10']

describe('findSubscriptions', () => {
    const items = [
        ...months.map((m) => tx(`${m}-03`, 10.99, 'Netflix', 'ENTERTAINMENT')),
        tx('2026-08-09', 10.99, 'Spotify', 'ENTERTAINMENT'),
        tx('2026-09-09', 11.99, 'Spotify', 'ENTERTAINMENT'),
        tx('2026-10-09', 11.99, 'Spotify', 'ENTERTAINMENT'),
        ...months.map((m) => tx(`${m}-20`, 24.99, 'PureGym', 'FITNESS')),
        ...months.map((m) => tx(`${m}-05`, 45, 'EE', 'BILLS_AND_SERVICES')), // a bill, not a subscription
        ...months.map((m) => tx(`${m}-14`, 62, 'Tesco', 'GROCERIES')), // regular, but shopping
        tx('2026-03-01', 6.99, 'Disney Plus', 'ENTERTAINMENT'), // stopped months ago
        tx('2026-10-11', 79, 'Amazon Prime', 'SHOPPING'), // tagged, once: yearly plan
        // A favourite shop, same price now and then: not a subscription.
        tx('2026-06-03', 105, 'UNIQLO', 'SHOPPING'),
        tx('2026-08-03', 105, 'UNIQLO', 'SHOPPING'),
        tx('2026-10-03', 105, 'UNIQLO', 'SHOPPING'),
    ]
    const list = findSubscriptions(items, '2026-10-24')

    it('finds subscriptions and memberships, not bills or the weekly shop', () => {
        expect(list.subs.map((s) => s.name).sort()).toEqual(['Amazon Prime', 'Netflix', 'PureGym', 'Spotify'])
    })

    it('gives the yearly cost, a yearly plan at its own price', () => {
        expect(list.subs.find((s) => s.name === 'Netflix')!.yearly).toBeCloseTo(131.88, 2)
        const prime = list.subs.find((s) => s.name === 'Amazon Prime')!
        expect([prime.every, prime.yearly, prime.nextDue]).toEqual(['year', 79, '2027-10-11'])
    })

    it('notices a price rise', () => {
        expect(list.subs.find((s) => s.name === 'Spotify')!.priceRise).toEqual({ from: 10.99, to: 11.99 })
    })

    it('totals them by month and year', () => {
        expect(list.yearly).toBeCloseTo(10.99 * 12 + 11.99 * 12 + 24.99 * 12 + 79, 2)
    })
})
