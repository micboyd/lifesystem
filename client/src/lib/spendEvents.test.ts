import { describe, it, expect } from 'vitest'
import { matchSpendToEvents, upcomingPlans } from './spendEvents'
import type { Event, StarlingSpendItem } from '../types'

let n = 0
// Times are local (no Z), so the tests don't depend on the machine's timezone.
function tx(time: string, amount: number, category = 'EATING_OUT', merchant = 'Dishoom'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date: time.slice(0, 10), time, amount, merchant, category, space: 'Main account' }
}

function ev(title: string, startDate: string, extra: Partial<Event> = {}): Event {
    n++
    return {
        _id: `e${n}`,
        title,
        eventType: 'social',
        allDay: false,
        startDate,
        startPart: 'evening',
        endDate: startDate,
        endPart: 'evening',
        createdAt: '',
        updatedAt: '',
        ...extra,
    }
}

describe('matchSpendToEvents', () => {
    const dinner = ev('Dinner with Sam', '2026-10-10', { time: '19:30' })
    const london = ev('London', '2026-10-16', {
        eventType: 'trip',
        startPart: 'afternoon',
        endDate: '2026-10-18',
        endPart: 'afternoon',
    })
    const birthday = ev("Mum's birthday", '2026-10-12', { allDay: true, eventType: 'general' })

    it('matches a timed plan to spend around that time', () => {
        const m = matchSpendToEvents(
            [tx('2026-10-10T21:10:00', 46), tx('2026-10-10T23:50:00', 18, 'TRANSPORT', 'Uber'), tx('2026-10-10T12:00:00', 9)],
            [dinner]
        )
        expect(m.events[0].event.title).toBe('Dinner with Sam')
        expect(m.events[0].total).toBe(64)
        // Lunch earlier that day is nothing to do with dinner.
        expect(m.everyday).toBe(9)
    })

    it('gives a trip everything while away, groceries too, but never bills', () => {
        const m = matchSpendToEvents(
            [
                tx('2026-10-16T10:00:00', 12), // before the trip starts that afternoon
                tx('2026-10-17T13:00:00', 30, 'GROCERIES', 'Sainsburys'),
                tx('2026-10-17T20:00:00', 55),
                tx('2026-10-17T09:00:00', 45, 'BILLS_AND_SERVICES', 'EE'),
                tx('2026-10-18T19:00:00', 20), // after it ends that afternoon
            ],
            [london]
        )
        expect(m.events[0].total).toBe(85)
        expect(m.everyday).toBe(12 + 45 + 20)
    })

    it("leaves the weekly shop out of a non-trip event's day", () => {
        const m = matchSpendToEvents(
            [tx('2026-10-12T11:00:00', 80, 'GROCERIES', 'Tesco'), tx('2026-10-12T15:00:00', 25, 'GIFTS', 'Moonpig')],
            [birthday]
        )
        expect(m.events[0].total).toBe(25)
        expect(m.everyday).toBe(80)
    })

    it('counts a 1am taxi as part of the night before', () => {
        const night = ev('Gig', '2026-10-20', { time: '20:00' })
        const m = matchSpendToEvents([tx('2026-10-21T01:15:00', 22, 'TRANSPORT', 'Uber')], [night])
        expect(m.byItem.get(m.events[0].items[0].id)?.title).toBe('Gig')
    })

    it("doesn't give the morning bus to the cleaner", () => {
        const cleaner = ev('Cleaner', '2026-10-22', { eventType: 'general', startPart: 'morning', endPart: 'morning' })
        const m = matchSpendToEvents([tx('2026-10-22T08:36:00', 2, 'TRANSPORT', 'Lothian Buses')], [cleaner])
        expect(m.events).toEqual([])
    })

    it('links a payment that names the event, whatever its category', () => {
        const cleaner = ev('Cleaner', '2026-10-22', { eventType: 'general', startPart: 'morning', endPart: 'morning' })
        const m = matchSpendToEvents([tx('2026-10-22T16:00:00', 45, 'PAYMENTS', 'Sparkle Cleaning')], [cleaner])
        expect(m.events[0]?.event.title).toBe('Cleaner')
    })

    it('leaves taxis alone for social plans without a set time', () => {
        const drinks = ev('Drinks', '2026-10-23')
        const m = matchSpendToEvents([tx('2026-10-23T19:00:00', 14, 'TRANSPORT', 'Uber'), tx('2026-10-23T20:00:00', 30)], [drinks])
        expect(m.events[0].total).toBe(30)
    })

    it('gives a hobby its club bar', () => {
        const rugby = ev('Rugby training', '2026-10-21', { eventType: 'hobby' })
        const m = matchSpendToEvents([tx('2026-10-21T21:00:00', 4.47, 'EATING_OUT', 'Portobello Rug')], [rugby])
        expect(m.events[0]?.total).toBe(4.47)
    })

    it('gives a birthday the toy shop trip on the way', () => {
        const party = ev("Ella's birthday", '2026-10-24', { time: '14:00' })
        const m = matchSpendToEvents(
            [tx('2026-10-24T13:10:00', 32, 'SHOPPING', 'Smyths Toys'), tx('2026-10-24T15:30:00', 12)],
            [party]
        )
        expect(m.events[0].total).toBe(44)
    })

    it('gives an occasion a card bought a few days ahead, but not other shopping', () => {
        const party = ev("Ella's birthday", '2026-10-24', { time: '14:00' })
        const m = matchSpendToEvents(
            [tx('2026-10-21T12:00:00', 3.5, 'SHOPPING', 'Card Factory'), tx('2026-10-23T12:00:00', 105, 'SHOPPING', 'UNIQLO')],
            [party]
        )
        expect(m.events[0].items.map((t) => t.merchant)).toEqual(['Card Factory'])
    })

    it('leaves shopping after the occasion has started alone', () => {
        const party = ev("Ella's birthday", '2026-10-24', { time: '14:00' })
        expect(matchSpendToEvents([tx('2026-10-24T16:00:00', 40, 'SHOPPING', 'Zara')], [party]).events).toEqual([])
    })

    it('prefers the more specific event when two overlap', () => {
        const m = matchSpendToEvents([tx('2026-10-17T20:00:00', 40)], [london, ev('Theatre', '2026-10-17', { time: '19:00' })])
        expect(m.events[0].event.title).toBe('Theatre')
    })
})

describe('upcomingPlans', () => {
    it('estimates a plan from what that kind of plan has cost before', () => {
        const past = [ev('Drinks', '2026-10-03'), ev('Dinner', '2026-10-09')]
        const coming = ev('Leaving do', '2026-10-25')
        const m = matchSpendToEvents([tx('2026-10-03T20:00:00', 30), tx('2026-10-09T20:00:00', 50)], [...past, coming])
        const plans = upcomingPlans([...past, coming], m, '2026-10-20', '2026-10-31')
        expect(plans).toHaveLength(1)
        expect(plans[0].event.title).toBe('Leaving do')
        expect(plans[0].typical).toBe(40)
    })
})
