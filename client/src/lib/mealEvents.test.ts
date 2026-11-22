import { describe, expect, it } from 'vitest'
import { eventsInMealSlot, mealDayPill, mealSlotsTaken } from './mealEvents'
import type { Event } from '../types'

function event(over: Partial<Event>): Event {
    return {
        _id: over.title ?? 'e',
        title: 'Event',
        eventType: 'social',
        allDay: false,
        startDate: '2026-11-23',
        startPart: 'afternoon',
        endDate: '2026-11-23',
        endPart: 'afternoon',
        createdAt: '',
        updatedAt: '',
        ...over,
    }
}

const label = (s: string) => s[0].toUpperCase() + s.slice(1)
const day = '2026-11-23'

describe('eventsInMealSlot', () => {
    it('matches breakfast, lunch and dinner to morning, afternoon and evening', () => {
        const lunch = event({ title: 'Meeting' })
        expect(eventsInMealSlot([lunch], day, 'lunch')).toHaveLength(1)
        expect(eventsInMealSlot([lunch], day, 'breakfast')).toHaveLength(0)
        expect(eventsInMealSlot([lunch], day, 'dinner')).toHaveLength(0)
    })

    it('puts events over snacks only when every main meal is taken', () => {
        expect(eventsInMealSlot([event({ allDay: true })], day, 'snack')).toHaveLength(1)
        expect(eventsInMealSlot([event({ startPart: 'afternoon', endPart: 'evening' })], day, 'snack')).toHaveLength(0)
        // Back to back: morning, then afternoon to evening.
        const am = event({ startPart: 'morning', endPart: 'morning' })
        const pm = event({ startPart: 'afternoon', endPart: 'evening' })
        expect(eventsInMealSlot([am, pm], day, 'snack')).toHaveLength(2)
    })

    it('covers every meal with an all-day event', () => {
        expect(mealSlotsTaken([event({ allDay: true })], day)).toEqual(['breakfast', 'lunch', 'dinner'])
    })

    it('spans the parts an event runs across', () => {
        const e = event({ startPart: 'afternoon', endPart: 'evening' })
        expect(mealSlotsTaken([e], day)).toEqual(['lunch', 'dinner'])
    })

    it('leaves out events marked to ignore clashes, and ones with no part of the day', () => {
        expect(mealSlotsTaken([event({ ignoreClash: true })], day)).toEqual([])
        expect(mealSlotsTaken([event({ startPart: 'na', endPart: 'na' })], day)).toEqual([])
    })
})

describe('mealDayPill', () => {
    it('names the meals and the event', () => {
        expect(mealDayPill([event({ title: 'Wedding', startPart: 'afternoon', endPart: 'evening' })], day, label)).toMatchObject({
            when: 'Lunch & dinner',
            what: 'Wedding',
            full: false,
        })
    })

    it('says all meals, and counts several events', () => {
        const pill = mealDayPill([event({ title: 'A', allDay: true }), event({ title: 'B' })], day, label)
        expect(pill).toMatchObject({ when: 'All meals', what: '2 events', full: true })
    })

    it('is null when nothing lands on a meal', () => {
        expect(mealDayPill([event({ startDate: '2026-11-24', endDate: '2026-11-24' })], day, label)).toBeNull()
    })
})
