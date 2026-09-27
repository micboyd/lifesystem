import { describe, it, expect } from 'vitest'
import {
    buildCalendarExport,
    calendarExportFilename,
    monthsRange,
    DEFAULT_CALENDAR_EXPORT_OPTIONS,
    type CalendarExportInput,
} from './calendarExport'
import type { Calendar, Event } from '../types'

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const NOW = new Date('2026-09-27T09:00:00.000Z')

const LIFE: Calendar = {
    _id: 'c1',
    name: 'Life',
    color: 'neutral',
    isDefault: true,
    visible: true,
    order: 0,
    ...STAMP,
}
const WORK: Calendar = {
    ...LIFE,
    _id: 'c2',
    name: 'Work',
    isDefault: false,
    visible: false,
    order: 1,
}

function event(over: Partial<Event> = {}): Event {
    return {
        _id: 'e1',
        calendar: 'c1',
        title: 'Dinner',
        eventType: 'social',
        allDay: false,
        startDate: '2026-10-03',
        startPart: 'evening',
        endDate: '2026-10-03',
        endPart: 'evening',
        ...STAMP,
        ...over,
    }
}

function input(over: Partial<CalendarExportInput> = {}): CalendarExportInput {
    return {
        startMonth: '2026-10',
        months: 1,
        events: [],
        calendars: [LIFE, WORK],
        statuses: [],
        monthNotes: [],
        reminders: [],
        birthdays: [],
        options: DEFAULT_CALENDAR_EXPORT_OPTIONS,
        now: NOW,
        ...over,
    }
}

describe('monthsRange', () => {
    it('covers whole months, across a year end', () => {
        expect(monthsRange('2026-11', 3)).toEqual({ start: '2026-11-01', end: '2027-01-31' })
        expect(monthsRange('2028-02', 1)).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    })
})

describe('buildCalendarExport', () => {
    it('lists every day of the range and marks the slots an event takes', () => {
        const p = buildCalendarExport(input({ events: [event()] }))
        expect(p.days).toHaveLength(31)
        const sat = p.days!.find((d) => d.date === '2026-10-03')!
        expect(sat.weekday).toBe('Saturday')
        expect(sat.weekend).toBe(true)
        expect(sat.events[0]).toMatchObject({
            title: 'Dinner',
            calendar: 'Life',
            when: ['evening'],
        })
        expect(sat.free).toEqual(['morning', 'afternoon'])
        expect(p.summary.fullyFreeDays).toBe(30)
    })

    it('spreads a multi-day trip across its days', () => {
        const trip = event({
            title: 'Lisbon',
            eventType: 'trip',
            startDate: '2026-10-09',
            startPart: 'afternoon',
            endDate: '2026-10-11',
            endPart: 'morning',
        })
        const p = buildCalendarExport(input({ events: [trip] }))
        const when = (d: string) => p.days!.find((x) => x.date === d)!.events[0].when
        expect(when('2026-10-09')).toEqual(['afternoon', 'evening'])
        expect(when('2026-10-10')).toBe('all day')
        expect(when('2026-10-11')).toEqual(['morning'])
        expect(p.summary.freeWeekends).not.toContain('2026-10-10')
        expect(p.summary.freeWeekends).toContain('2026-10-17')
    })

    it('folds a recurring series into one event with its occurrence dates', () => {
        const base = {
            _id: 'r1',
            title: 'Five-a-side',
            recurrence: { frequency: 'weekly' as const },
        }
        const events = ['2026-10-06', '2026-10-13'].map((d) =>
            event({ ...base, startDate: d, endDate: d })
        )
        const p = buildCalendarExport(input({ events }))
        expect(p.events).toHaveLength(1)
        expect(p.events[0].repeats).toEqual({ frequency: 'weekly' })
        expect(p.events[0].occurrences).toEqual(['2026-10-06', '2026-10-13'])
    })

    it('drops hidden calendars and empty days when asked', () => {
        const events = [event(), event({ _id: 'e2', calendar: 'c2', title: 'Standup' })]
        const p = buildCalendarExport(
            input({
                events,
                options: {
                    ...DEFAULT_CALENDAR_EXPORT_OPTIONS,
                    hiddenCalendars: false,
                    emptyDays: false,
                },
            })
        )
        expect(p.events.map((e) => e.title)).toEqual(['Dinner'])
        expect(p.days!.map((d) => d.date)).toEqual(['2026-10-03'])
    })

    it('carries leave, month flags and birthdays onto the days', () => {
        const p = buildCalendarExport(
            input({
                statuses: [
                    {
                        _id: 's1',
                        startDate: '2026-10-19',
                        endDate: '2026-10-20',
                        status: 'annual_leave_approved',
                    },
                ],
                monthNotes: [
                    {
                        _id: 'n1',
                        startMonth: '2026-09',
                        endMonth: '2026-10',
                        label: 'Cutting',
                        color: 'rose',
                        ...STAMP,
                    },
                ],
                birthdays: [{ _id: 'b1', name: 'Sam', date: '10-12', ...STAMP }],
            })
        )
        const day = (d: string) => p.days!.find((x) => x.date === d)!
        expect(day('2026-10-19').status).toBe('Annual Leave (Approved)')
        expect(day('2026-10-01').flags).toEqual(['Cutting'])
        expect(day('2026-10-12').birthdays).toEqual(['Sam'])
        expect(p.summary.leaveDays).toBe(2)
        expect(p.monthFlags).toHaveLength(1)
        expect(calendarExportFilename(p)).toBe('calendar-2026-10_to_2026-10.json')
    })
})
