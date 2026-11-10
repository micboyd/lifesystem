import { describe, expect, it } from 'vitest'
import { ADDED_STOP_LABEL, datesToCreate, MAX_FILL_DAYS, repeatsOn, seriesTemplate } from './walkSeries'
import { readDays, readFavourite, type WalkFields } from './walkInput'
import { trimSpurs } from './routeGeo'

const weekdays = [1, 2, 3, 4, 5]
const series = { days: weekdays, startDate: '2026-11-09', skipped: [] as string[] } // a Monday

describe('datesToCreate', () => {
    it('finds the weekdays in a range', () => {
        expect(datesToCreate(series, '2026-11-13', '2026-11-16', new Set())).toEqual(['2026-11-13', '2026-11-16'])
    })
    it('starts no earlier than the series', () => {
        expect(datesToCreate(series, '2026-11-02', '2026-11-09', new Set())).toEqual(['2026-11-09'])
    })
    it('leaves out days that exist or were deleted', () => {
        const s = { ...series, skipped: ['2026-11-10'] }
        expect(datesToCreate(s, '2026-11-09', '2026-11-11', new Set(['2026-11-09']))).toEqual(['2026-11-11'])
    })
    it('caps a wide range', () => {
        const every = { days: [0, 1, 2, 3, 4, 5, 6], startDate: '2026-01-01', skipped: [] }
        expect(datesToCreate(every, '2026-01-01', '2028-01-01', new Set())).toHaveLength(MAX_FILL_DAYS)
    })
})

describe('repeatsOn', () => {
    it('knows a Saturday is not a weekday', () => {
        expect(repeatsOn(weekdays, '2026-11-14')).toBe(false)
        expect(repeatsOn(weekdays, '2026-11-13')).toBe(true)
    })
})

describe('seriesTemplate', () => {
    it('keeps the plan, drops the route and the point added for that day', () => {
        const cafe = { lat: 53, lng: -2, label: 'Cafe' }
        const value = {
            date: '2026-11-09',
            time: '08:00',
            name: 'Coffee',
            pace: 'steady',
            goal: { kind: 'steps', value: 6000 },
            start: { lat: 53.1, lng: -2.1, label: 'Home' },
            stops: [cafe, { lat: 53.2, lng: -2.2, label: ADDED_STOP_LABEL }],
            end: null,
            route: { coords: [[1, 2], [3, 4]], distanceM: 10, ascentM: 0, descentM: 0 },
        } as WalkFields
        const t = seriesTemplate(value)
        expect(t.stops).toEqual([cafe])
        expect(t).not.toHaveProperty('route')
        expect(t).not.toHaveProperty('date')
    })
})

describe('readDays', () => {
    it('sorts and de-duplicates', () => expect(readDays([5, 1, 1])).toEqual([1, 5]))
    it('treats absent as none', () => expect(readDays(undefined)).toEqual([]))
    it.each([[[7]], [[1.5]], ['mon']])('refuses %j', (raw) => expect(readDays(raw)).toBeNull())
})

describe('readFavourite', () => {
    const start = { lat: 53, lng: -2, label: 'Home' }
    const route = { coords: [[1, 2], [3, 4]], distanceM: 100 }
    it('takes a route with a start', () => expect(readFavourite({ start, route })).toMatchObject({ start, stops: [], end: null }))
    it('needs a route', () => expect(readFavourite({ start, route: null })).toBeNull())
    it('needs a start', () => expect(readFavourite({ route })).toBeNull())
})

describe('trimSpurs', () => {
    const c = (lng: number): [number, number] => [lng / 1000, 53]
    it('cuts a street walked up and back', () => {
        expect(trimSpurs([c(0), c(1), c(2), c(3), c(2), c(1), c(4), c(5)], [])).toEqual([c(0), c(1), c(4), c(5)])
    })
    it('keeps a spur that reaches a place you asked to pass', () => {
        const line = [c(0), c(1), c(2), c(3), c(2), c(1), c(4), c(5)]
        expect(trimSpurs(line, [{ lng: c(3)[0], lat: 53 }])).toEqual(line)
    })
    it('leaves a route that is all there and back', () => {
        const line = [c(0), c(1), c(2), c(1), c(0)]
        expect(trimSpurs(line, [])).toEqual(line)
    })
    it('leaves a real loop alone', () => {
        const line: [number, number][] = [c(0), c(1), [0.001, 53.001], [0, 53.001], c(0)]
        expect(trimSpurs(line, [])).toEqual(line)
    })
})
