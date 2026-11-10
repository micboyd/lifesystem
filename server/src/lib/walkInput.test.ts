import { describe, expect, it } from 'vitest'
import { Types } from 'mongoose'
import WalkLibraryItem from '../models/WalkLibraryItem'
import { MAX_STOPS, readLibraryItem, readStops, readWalk } from './walkInput'

const base = {
    date: '2026-11-09',
    time: '14:30',
    pace: 'steady',
    goal: { kind: 'steps', value: 6000 },
    start: { lat: 53.4, lng: -2.2, label: 'Home' },
}

describe('readWalk', () => {
    it('takes a plain walk, defaulting to no stops, back to the start, no route', () => {
        const out = readWalk({ ...base, name: '  Lunch loop ' })
        expect(out).toMatchObject({
            ok: true,
            value: { name: 'Lunch loop', stops: [], end: null, route: null, goal: { kind: 'steps', value: 6000 } },
        })
    })

    it('rounds a route and keeps its line', () => {
        const coords = [[-2.2, 53.4, 40], [-2.21, 53.41, 44]]
        const out = readWalk({ ...base, route: { coords, distanceM: 1234.6, ascentM: 4.4, descentM: 0.2 } })
        expect(out).toMatchObject({ ok: true, value: { route: { coords, distanceM: 1235, ascentM: 4, descentM: 0 } } })
    })

    it.each([
        ['bad date', { date: '9/11/2026' }],
        ['bad time', { time: '25:00' }],
        ['bad pace', { pace: 'sprint' }],
        ['bad target kind', { goal: { kind: 'vibes', value: 1 } }],
        ['zero target', { goal: { kind: 'time', value: 0 } }],
        ['no start', { start: null }],
        ['start off the planet', { start: { lat: 95, lng: 0 } }],
        ['bad end', { end: { lat: 'x', lng: 0 } }],
        ['route with bad points', { route: { coords: [[1, 'a'], [2, 3]], distanceM: 10 } }],
        ['route with one point', { route: { coords: [[1, 2]], distanceM: 10 } }],
    ])('refuses %s', (_name, change) => {
        expect(readWalk({ ...base, ...change }).ok).toBe(false)
    })
})

describe('readStops', () => {
    const stop = { lat: 53, lng: -2, label: 'Park' }

    it('treats absent as none', () => expect(readStops(undefined)).toEqual([]))
    it('keeps labels', () => expect(readStops([stop])).toEqual([stop]))
    it('refuses too many', () => expect(readStops(Array(MAX_STOPS + 1).fill(stop))).toBeNull())
    it('refuses a malformed one', () => expect(readStops([stop, { lat: 1 }])).toBeNull())
})

describe('readLibraryItem', () => {
    const { date: _date, time: _time, ...plan } = base
    it('takes a plan with no day or time', () => {
        const out = readLibraryItem({ ...plan, name: 'Coffee' })
        expect(out).toMatchObject({ ok: true, value: { name: 'Coffee', stops: [] } })
        expect(out.ok && 'date' in out.value).toBe(false)
        expect(out.ok && 'time' in out.value).toBe(false)
    })
    it('refuses a plan with no start', () => expect(readLibraryItem({ ...plan, start: null }).ok).toBe(false))
    it('can be read back from a stored item onto a day', () => {
        const coords = [[-2.2, 53.4, 40], [-2.21, 53.41, 44]]
        const stop = { lat: 53.41, lng: -2.21, label: 'Cafe' }
        const item = new WalkLibraryItem({ ...plan, user: new Types.ObjectId(), name: 'Coffee', stops: [stop], route: { coords, distanceM: 900 } })
        const out = readWalk({ ...item.toObject(), date: '2026-11-10', time: '08:00' })
        expect(out).toMatchObject({ ok: true, value: { date: '2026-11-10', name: 'Coffee', stops: [stop], route: { coords, distanceM: 900 } } })
    })
})
