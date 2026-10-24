import { describe, it, expect } from 'vitest'
import { refineCategory, tagAll, tagOne, tagText } from './spendTags'
import type { StarlingSpendItem } from '../types'

let n = 0
// Local times (no Z), so time-of-day tags don't depend on the machine.
function tx(time: string, amount: number, merchant: string, category: string): StarlingSpendItem {
    n++
    return { id: `t${n}`, date: time.slice(0, 10), time, amount, merchant, category, space: 'Main account' }
}

describe('tagOne', () => {
    it('reads a pub from its name', () => {
        expect(tagOne(tx('2026-10-03T20:00:00', 11, 'The Kings Head', 'EATING_OUT')).slice(0, 2)).toEqual(['pub', 'drinks'])
        expect(tagOne(tx('2026-10-03T20:00:00', 11, 'Red Lion', 'EATING_OUT'))[0]).toBe('pub')
        expect(tagOne(tx('2026-10-03T19:41:00', 5.7, "Robertson's 37 Bar", 'EATING_OUT'))[0]).toBe('bar')
    })

    it('tells a cab from a delivery', () => {
        expect(tagOne(tx('2026-10-03T14:41:00', 13.98, 'Uber', 'TRANSPORT'))[0]).toBe('taxi')
        expect(tagOne(tx('2026-10-03T19:00:00', 24, 'Uber Eats', 'EATING_OUT'))[0]).toBe('delivery')
    })

    it('knows the bus, coffee, a corner shop and clothes', () => {
        expect(tagOne(tx('2026-10-03T18:13:00', 5.5, 'Lothian Buses', 'TRANSPORT'))[0]).toBe('bus')
        expect(tagOne(tx('2026-10-03T14:20:00', 4, 'Origin Coffee', 'EATING_OUT'))[0]).toBe('coffee')
        expect(tagOne(tx('2026-10-03T20:27:00', 1.69, 'Premier', 'GROCERIES'))[0]).toBe('convenience')
        expect(tagOne(tx('2026-10-03T11:05:00', 105, 'UNIQLO', 'SHOPPING'))[0]).toBe('clothes')
    })

    it("doesn't let a word in the wrong place mislead it", () => {
        // A restaurant, not a corner shop; a chicken shop, not a train.
        expect(tagOne(tx('2026-10-03T19:00:00', 40, 'Pizza Express', 'EATING_OUT'))).not.toContain('convenience')
        expect(tagOne(tx('2026-10-03T19:00:00', 9, 'Southern Fried Chicken', 'EATING_OUT'))).not.toContain('train')
    })

    it('adds context from the time of day', () => {
        expect(tagOne(tx('2026-10-03T08:10:00', 3.2, 'Somewhere Nice', 'EATING_OUT'))).toContain('coffee')
        expect(tagOne(tx('2026-10-03T12:45:00', 7.5, 'Somewhere Nice', 'EATING_OUT'))).toContain('lunch')
        expect(tagOne(tx('2026-10-03T21:00:00', 30, "Dougal's", 'EATING_OUT'))).toContain('evening-out')
        expect(tagOne(tx('2026-10-04T01:47:00', 2.4, 'Lothian Buses', 'TRANSPORT'))).toContain('late-night')
    })

    it('always has something, falling back to the category', () => {
        expect(tagOne(tx('2026-10-03T15:00:00', 20, 'Xyzzy Ltd', 'SHOPPING'))[0]).toBe('shopping')
        expect(tagOne(tx('2026-10-03T15:00:00', 20, 'J Bloggs', 'PAYMENTS'))[0]).toBe('transfers')
    })
})

describe('tagAll', () => {
    it('reads rounds at one place as drinks, even when the name is cut short', () => {
        // Starling truncates the rugby club to "Portobello Rug".
        const rounds = ['15:01', '16:07', '16:54', '17:27', '17:57'].map((at) =>
            tx(`2026-10-03T${at}:00`, 4.5, 'Portobello Rug', 'EATING_OUT')
        )
        const tags = tagAll(rounds)
        for (const t of rounds) expect(tags.get(t.id)![0]).toBe('drinks')
    })

    it('leaves a single café visit alone', () => {
        const one = tx('2026-10-03T10:00:00', 3, 'Portobello Rug', 'EATING_OUT')
        expect(tagAll([one]).get(one.id)![0]).not.toBe('drinks')
    })

    it('gives search words for every tag', () => {
        const t = tx('2026-10-03T20:00:00', 11, 'The Kings Head', 'EATING_OUT')
        expect(tagText(tagOne(t))).toContain('pub')
        expect(tagText(tagOne(t))).toContain('drinks')
    })
})

describe('drinks are not eating out', () => {
    it('drops the eating-out tag from pubs, bars and rounds', () => {
        expect(tagOne(tx('2026-10-03T20:00:00', 11, 'The Kings Head', 'EATING_OUT'))).not.toContain('eating-out')
        expect(tagOne(tx('2026-10-03T19:41:00', 5.7, "Robertson's 37 Bar", 'EATING_OUT'))).not.toContain('eating-out')
        const rounds = ['15:01', '16:07', '17:27'].map((at) => tx(`2026-10-03T${at}:00`, 4.5, 'Portobello Rug', 'EATING_OUT'))
        for (const tags of tagAll(rounds).values()) expect(tags).not.toContain('eating-out')
    })

    it('keeps food as eating out', () => {
        expect(tagOne(tx('2026-10-03T19:00:00', 40, 'Dishoom', 'EATING_OUT'))).toContain('eating-out')
    })

    it('moves drinks into their own category', () => {
        const pint = tx('2026-10-03T20:00:00', 6, 'Red Lion', 'EATING_OUT')
        const dinner = tx('2026-10-03T19:00:00', 40, 'Dishoom', 'EATING_OUT')
        expect(refineCategory(pint, tagOne(pint)).category).toBe('DRINKS')
        expect(refineCategory(dinner, tagOne(dinner)).category).toBe('EATING_OUT')
    })
})
