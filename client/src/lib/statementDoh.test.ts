import { describe, it, expect } from 'vitest'
import { buildDoh } from './statementDoh'
import type { Copy } from './statementInsights'
import type { StarlingSpendItem } from '../types'

let n = 0
// Times are local (no Z), so "2am" means 2am wherever the tests run.
function tx(time: string, amount: number, merchant: string, category: string): StarlingSpendItem {
    n++
    return { id: `t${n}`, date: time.slice(0, 10), time, amount, merchant, category, space: 'Main account' }
}
const plain = (c: Copy) => c.map((p) => (typeof p === 'string' ? p : `£${p.money}`)).join('')
const line = (items: StarlingSpendItem[], id: string) => buildDoh(items).lines.find((l) => l.id === id)

describe('buildDoh', () => {
    it('counts every bet, by category or by name', () => {
        const bets = line(
            [tx('2026-10-04T15:00:00', 20, 'Bet365', 'ENTERTAINMENT'), tx('2026-10-05T15:00:00', 10, 'Paddy Power', 'GAMBLING')],
            'gambling'
        )!
        expect(plain(bets.title)).toBe('2 bets, £30')
        expect(bets.saved).toBe(30)
    })

    it('counts small-hours food, but not the taxi home', () => {
        const late = line(
            [
                tx('2026-10-11T02:14:00', 28.5, 'Uber Eats', 'EATING_OUT'),
                tx('2026-10-11T02:40:00', 18, 'Uber', 'TRANSPORT'),
                tx('2026-10-11T21:00:00', 40, 'Dishoom', 'EATING_OUT'),
            ],
            'late-night'
        )!
        expect(late.items.map((t) => t.merchant)).toEqual(['Uber Eats'])
        expect(late.saved).toBe(28.5)
    })

    it('calls out a delivery the day after a big shop', () => {
        const items = [
            tx('2026-10-12T18:00:00', 62, 'Tesco', 'GROCERIES'),
            tx('2026-10-13T19:30:00', 31, 'Deliveroo', 'EATING_OUT'),
            tx('2026-10-20T19:30:00', 25, 'Deliveroo', 'EATING_OUT'),
        ]
        const after = line(items, 'after-shop')!
        expect(after.saved).toBe(31)
        // The other order only counts its mark-up.
        expect(line(items, 'delivery-premium')!.saved).toBe(7.5)
    })

    it('takes the extra one of a double charge', () => {
        const dup = line(
            [tx('2026-10-08T10:00:00', 59.99, 'Currys', 'SHOPPING'), tx('2026-10-08T10:03:00', 59.99, 'Currys', 'SHOPPING')],
            'duplicates'
        )!
        expect(plain(dup.title)).toBe('Currys charged you twice, £59.99')
    })

    it('does not count two coffees as a double charge', () => {
        expect(
            line([tx('2026-10-08T08:00:00', 3.2, 'Pret', 'EATING_OUT'), tx('2026-10-08T15:00:00', 3.2, 'Pret', 'EATING_OUT')], 'duplicates')
        ).toBeUndefined()
    })

    it('counts fees and fines', () => {
        expect(line([tx('2026-10-09T09:00:00', 35, 'Camden PCN', 'TRANSPORT')], 'fees')!.saved).toBe(35)
    })

    it('flags two music services, saving the cheaper', () => {
        const music = line(
            [tx('2026-10-01T09:00:00', 11.99, 'Spotify', 'ENTERTAINMENT'), tx('2026-10-03T09:00:00', 10.99, 'Apple Music', 'ENTERTAINMENT')],
            'music'
        )!
        expect(music.saved).toBe(10.99)
    })

    it('leaves a normal night out alone', () => {
        const doh = buildDoh([tx('2026-10-17T20:00:00', 85, 'Hawksmoor', 'EATING_OUT'), tx('2026-10-17T23:30:00', 22, 'Uber', 'TRANSPORT')])
        expect(doh.lines).toEqual([])
        expect(doh.total).toBe(0)
    })

    it('never counts one payment twice', () => {
        // A 1am bet is a bet and late; it lands under betting only.
        const doh = buildDoh([tx('2026-10-18T01:00:00', 15, 'Sky Bet', 'GAMBLING')])
        expect(doh.lines.map((l) => l.id)).toEqual(['gambling'])
        expect(doh.total).toBe(15)
    })
})
