import { describe, expect, it } from 'vitest'
import { eventInMealSlot } from './eventSlots'

type E = Parameters<typeof eventInMealSlot>[0][number]
const ev = (over: Partial<E>): E =>
    ({
        title: 'Trip',
        allDay: false,
        startDate: '2026-11-30',
        startPart: 'evening',
        endDate: '2026-12-03',
        endPart: 'afternoon',
        ignoreClash: false,
        ...over,
    }) as E

describe('eventInMealSlot', () => {
    const trip = [ev({})]
    it('takes the meals inside the event’s parts of the day', () => {
        expect(eventInMealSlot(trip, '2026-11-30', 'lunch')).toBeNull()
        expect(eventInMealSlot(trip, '2026-11-30', 'dinner')?.title).toBe('Trip')
        expect(eventInMealSlot(trip, '2026-12-01', 'breakfast')).not.toBeNull()
        expect(eventInMealSlot(trip, '2026-12-03', 'lunch')).not.toBeNull()
        expect(eventInMealSlot(trip, '2026-12-03', 'dinner')).toBeNull()
    })
    it('takes snacks only when every main meal is taken', () => {
        expect(eventInMealSlot(trip, '2026-12-01', 'snack')?.title).toBe('Trip')
        expect(eventInMealSlot(trip, '2026-11-30', 'snack')).toBeNull()
        expect(eventInMealSlot(trip, '2026-12-03', 'snack')).toBeNull()
        // Back to back: a morning meeting, then an afternoon-to-evening one.
        const two = [
            ev({ title: 'AM', startDate: '2026-12-08', endDate: '2026-12-08', startPart: 'morning', endPart: 'morning' }),
            ev({ title: 'PM', startDate: '2026-12-08', endDate: '2026-12-08', startPart: 'afternoon', endPart: 'evening' }),
        ]
        expect(eventInMealSlot(two, '2026-12-08', 'snack')?.title).toBe('PM')
        expect(eventInMealSlot(two.slice(0, 1), '2026-12-08', 'snack')).toBeNull()
    })
    it('all-day events take every meal; ignored and “na” events none', () => {
        const day = [ev({ allDay: true, startDate: '2026-12-05', endDate: '2026-12-05' })]
        expect(eventInMealSlot(day, '2026-12-05', 'breakfast')).not.toBeNull()
        expect(eventInMealSlot(day, '2026-12-06', 'breakfast')).toBeNull()
        expect(eventInMealSlot([ev({ ignoreClash: true })], '2026-12-01', 'lunch')).toBeNull()
        expect(eventInMealSlot([ev({ startPart: 'na', endPart: 'na' })], '2026-12-01', 'lunch')).toBeNull()
    })
})
