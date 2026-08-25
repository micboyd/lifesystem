import { describe, expect, it } from 'vitest'
import {
    EMPTY_LOG_FILTERS,
    filterLogs,
    formatLogDate,
    groupByDate,
    nameOptions,
    pageBounds,
    rangeStart,
    weekStartMonday,
    type LogFilterState,
} from './logFilters'

interface TestLog {
    date: string
    name: string
    notes?: string
}

const log = (date: string, name: string, notes?: string): TestLog => ({ date, name, notes })

const filters = (over: Partial<LogFilterState> = {}): LogFilterState => ({
    ...EMPTY_LOG_FILTERS,
    ...over,
})

describe('weekStartMonday', () => {
    it('returns the Monday of the containing week', () => {
        // 2026-08-25 is a Tuesday.
        expect(weekStartMonday('2026-08-25')).toBe('2026-08-24')
    })

    it('leaves a Monday where it is', () => {
        expect(weekStartMonday('2026-08-24')).toBe('2026-08-24')
    })

    it('treats Sunday as the end of the week, not the start', () => {
        // 2026-08-30 is a Sunday — its week began on the 24th.
        expect(weekStartMonday('2026-08-30')).toBe('2026-08-24')
    })

    it('crosses a month boundary', () => {
        // 2026-09-02 is a Wednesday.
        expect(weekStartMonday('2026-09-02')).toBe('2026-08-31')
    })
})

describe('rangeStart', () => {
    const today = '2026-08-25'

    it('has no lower bound for all time', () => {
        expect(rangeStart('all', today)).toBe('')
    })

    it('starts this week on Monday', () => {
        expect(rangeStart('week', today)).toBe('2026-08-24')
    })

    it('counts 30 days inclusive of today', () => {
        expect(rangeStart('30d', today)).toBe('2026-07-27')
    })

    it('counts 90 days inclusive of today', () => {
        expect(rangeStart('90d', today)).toBe('2026-05-28')
    })
})

describe('formatLogDate', () => {
    const today = '2026-08-25'

    it('names today and yesterday', () => {
        expect(formatLogDate('2026-08-25', today)).toBe('Today')
        expect(formatLogDate('2026-08-24', today)).toBe('Yesterday')
    })

    it('spells out anything older', () => {
        expect(formatLogDate('2026-08-20', today)).toBe('Thu, 20 Aug 2026')
    })
})

describe('filterLogs', () => {
    const today = '2026-08-25'
    const logs = [
        log('2026-08-25', 'Push A', 'felt strong'),
        log('2026-08-20', 'Pull B'),
        log('2026-06-01', 'Push A', 'deload'),
        log('2025-11-02', 'Legs'),
    ]

    it('returns everything when nothing is set', () => {
        expect(filterLogs(logs, filters(), today)).toHaveLength(4)
    })

    it('keeps only entries inside the range', () => {
        expect(filterLogs(logs, filters({ range: 'week' }), today).map((l) => l.name)).toEqual([
            'Push A',
        ])
        expect(filterLogs(logs, filters({ range: '30d' }), today).map((l) => l.name)).toEqual([
            'Push A',
            'Pull B',
        ])
    })

    it('matches the name filter exactly', () => {
        expect(filterLogs(logs, filters({ name: 'Push A' }), today)).toHaveLength(2)
        expect(filterLogs(logs, filters({ name: 'Push' }), today)).toHaveLength(0)
    })

    it('searches the name case-insensitively', () => {
        expect(filterLogs(logs, filters({ search: 'pull' }), today).map((l) => l.name)).toEqual([
            'Pull B',
        ])
    })

    it('searches whatever the haystack supplies', () => {
        const found = filterLogs(logs, filters({ search: 'deload' }), today, (l) => [l.notes])
        expect(found.map((l) => l.date)).toEqual(['2026-06-01'])
    })

    it('ignores undefined haystack entries', () => {
        expect(() => filterLogs(logs, filters({ search: 'x' }), today, (l) => [l.notes])).not.toThrow()
    })

    it('trims the search term', () => {
        expect(filterLogs(logs, filters({ search: '  legs  ' }), today)).toHaveLength(1)
    })

    it('applies the extra predicate', () => {
        const found = filterLogs(
            logs,
            filters(),
            today,
            () => [],
            (l) => l.name === 'Legs'
        )
        expect(found).toHaveLength(1)
    })

    it('combines every filter', () => {
        const found = filterLogs(logs, filters({ range: '90d', name: 'Push A' }), today)
        expect(found.map((l) => l.date)).toEqual(['2026-08-25', '2026-06-01'])
    })
})

describe('nameOptions', () => {
    it('lists distinct names alphabetically behind an all-entry', () => {
        const logs = [log('2026-08-25', 'Pull B'), log('2026-08-24', 'Push A'), log('2026-08-23', 'Pull B')]
        expect(nameOptions(logs, 'All workouts')).toEqual([
            { label: 'All workouts', value: '' },
            { label: 'Pull B', value: 'Pull B' },
            { label: 'Push A', value: 'Push A' },
        ])
    })

    it('offers only the all-entry for an empty log', () => {
        expect(nameOptions([], 'All')).toEqual([{ label: 'All', value: '' }])
    })
})

describe('groupByDate', () => {
    it('groups adjacent entries and preserves newest-first order', () => {
        const logs = [
            log('2026-08-25', 'Push A'),
            log('2026-08-25', 'Cardio'),
            log('2026-08-24', 'Pull B'),
        ]
        expect(groupByDate(logs).map(([date, items]) => [date, items.length])).toEqual([
            ['2026-08-25', 2],
            ['2026-08-24', 1],
        ])
    })

    it('regroups entries that share a date out of sequence', () => {
        const logs = [log('2026-08-25', 'A'), log('2026-08-24', 'B'), log('2026-08-25', 'C')]
        const [first] = groupByDate(logs)
        expect(first[1].map((l) => l.name)).toEqual(['A', 'C'])
    })

    it('returns nothing for an empty list', () => {
        expect(groupByDate([])).toEqual([])
    })
})

describe('pageBounds', () => {
    it('slices the first page', () => {
        expect(pageBounds(1, 43)).toMatchObject({ pageCount: 5, start: 0, end: 10, first: 1, last: 10 })
    })

    it('slices a middle page', () => {
        expect(pageBounds(3, 43)).toMatchObject({ start: 20, end: 30, first: 21, last: 30 })
    })

    it('stops the last page at the end of the list', () => {
        expect(pageBounds(5, 43)).toMatchObject({ start: 40, end: 43, first: 41, last: 43 })
    })

    it('clamps a page past the end back to the last one', () => {
        expect(pageBounds(99, 43)).toMatchObject({ start: 40, end: 43, last: 43 })
    })

    it('clamps a page below one', () => {
        expect(pageBounds(0, 43)).toMatchObject({ start: 0, end: 10 })
    })

    it('reports a single empty page for an empty list', () => {
        expect(pageBounds(1, 0)).toMatchObject({ pageCount: 1, start: 0, end: 0, first: 0, last: 0 })
    })

    it('honours a custom page size', () => {
        expect(pageBounds(2, 43, 20)).toMatchObject({ pageCount: 3, start: 20, end: 40 })
    })
})
