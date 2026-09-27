import { describe, expect, it } from 'vitest'
import type { Event } from '../types'
import { placeOf, restDayNote } from './restDayMessage'

function ev(fields: Partial<Event>): Event {
    return {
        _id: Math.random().toString(36).slice(2),
        title: 'Something',
        eventType: 'general',
        allDay: false,
        startDate: '2026-10-05',
        startPart: 'evening',
        endDate: '2026-10-05',
        endPart: 'evening',
        createdAt: '',
        updatedAt: '',
        ...fields,
    }
}

describe('placeOf', () => {
    it('prefers the location, trimmed to its first part', () => {
        expect(placeOf(ev({ location: 'London, UK', title: 'Trip' }))).toBe('London')
    })

    it('falls back to a place named in the title', () => {
        expect(placeOf(ev({ title: 'Trip to Lisbon' }))).toBe('Lisbon')
        expect(placeOf(ev({ title: 'Weekend in Newcastle upon Tyne' }))).toBe(
            'Newcastle upon Tyne'
        )
        expect(placeOf(ev({ title: 'Stag do' }))).toBeUndefined()
    })
})

describe('restDayNote', () => {
    it('is null with nothing on', () => {
        expect(restDayNote([], '2026-10-05')).toBeNull()
    })

    it('says where you are on a trip, counting the days', () => {
        const trip = ev({
            eventType: 'trip',
            title: 'London trip',
            location: 'London',
            allDay: true,
            startDate: '2026-10-04',
            endDate: '2026-10-07',
        })
        expect(restDayNote([trip], '2026-10-04')?.text).toBe("You're off to London — day 1 of 4.")
        expect(restDayNote([trip], '2026-10-05')?.text).toBe("You're in London — day 2 of 4.")
        expect(restDayNote([trip], '2026-10-07')?.text).toBe('Last day in London — travelling home.')
        expect(restDayNote([trip], '2026-10-05')?.icon).toContain('plane')
    })

    it('marks a work trip, and a one-day trip', () => {
        const work = ev({ eventType: 'worktrip', title: 'Client visit', location: 'Leeds' })
        expect(restDayNote([work], '2026-10-05')?.text).toBe("You're in Leeds for work today.")
    })

    it('falls back to the title when a trip has no place', () => {
        const trip = ev({ eventType: 'trip', title: 'Stag do', allDay: true })
        expect(restDayNote([trip], '2026-10-05')?.text).toBe("You're away — Stag do.")
    })

    it('reads plans naturally, with the part of day or time', () => {
        expect(
            restDayNote([ev({ eventType: 'social', title: 'Dinner with Sam' })], '2026-10-05')
                ?.text
        ).toBe("You've got dinner with Sam in the evening.")
        expect(
            restDayNote(
                [ev({ eventType: 'hobby', title: 'Guitar lesson', time: '10:30', startPart: 'morning', endPart: 'morning' })],
                '2026-10-05'
            )?.text
        ).toBe("You're busy with Guitar lesson at 10:30.")
    })

    it('adds the location when the title does not already say it', () => {
        expect(
            restDayNote(
                [ev({ eventType: 'social', title: "Sam's birthday", location: 'The Crown, Bath' })],
                '2026-10-05'
            )?.text
        ).toBe("You've got Sam's birthday at The Crown in the evening.")
    })

    it('leads with the biggest thing and counts the rest', () => {
        const trip = ev({ eventType: 'trip', title: 'Trip to Paris', allDay: true })
        const drinks = ev({ eventType: 'social', title: 'Drinks' })
        const call = ev({ title: 'Call with Mum' })
        expect(restDayNote([drinks, trip], '2026-10-05')?.text).toBe(
            "You're in Paris today. Plus drinks."
        )
        expect(restDayNote([call, drinks, trip], '2026-10-05')?.text).toBe(
            "You're in Paris today. Plus 2 more."
        )
    })
})
