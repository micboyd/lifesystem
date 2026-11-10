import { describe, expect, it } from 'vitest'
import {
    maskFeedUrl,
    meetingsFromIcs,
    normaliseFeedUrl,
    occurrenceFrom,
    partForHour,
    syncWindow,
} from './icalMeetings'

const LONDON_TZ = `BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`

function feed(...events: string[]): string {
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
        'X-WR-CALNAME:me@example.com',
        'X-WR-TIMEZONE:Europe/London',
        LONDON_TZ,
        ...events,
        'END:VCALENDAR',
    ].join('\r\n')
}

const ME_ACCEPTED = 'ATTENDEE;CN=me@example.com;PARTSTAT=ACCEPTED:mailto:me@example.com'
const ME_DECLINED = 'ATTENDEE;CN=me@example.com;PARTSTAT=DECLINED:mailto:me@example.com'

const WINDOW = { from: new Date('2026-10-20T00:00:00Z'), to: new Date('2027-01-20T00:00:00Z') }

describe('partForHour', () => {
    it('splits the day at 12:00 and 17:00', () => {
        expect(partForHour(0)).toBe('morning')
        expect(partForHour(11)).toBe('morning')
        expect(partForHour(12)).toBe('afternoon')
        expect(partForHour(16)).toBe('afternoon')
        expect(partForHour(17)).toBe('evening')
        expect(partForHour(23)).toBe('evening')
    })
})

describe('occurrenceFrom', () => {
    const base = { uid: 'u', title: 't', allDay: false }

    it('keeps a meeting ending on the hour inside the part it ran in', () => {
        const start = new Date('2026-11-12T09:00:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: new Date('2026-11-12T12:00:00Z'),
        })
        expect(occ).toMatchObject({ time: '09:00', startPart: 'morning', endPart: 'morning' })
    })

    it('spans parts when a meeting crosses noon', () => {
        const start = new Date('2026-11-12T11:30:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: new Date('2026-11-12T13:00:00Z'),
        })
        expect(occ).toMatchObject({
            startPart: 'morning',
            endPart: 'afternoon',
            endDate: '2026-11-12',
        })
    })

    it('converts summer UTC times to British Summer Time', () => {
        // 16:30 UTC in July is 17:30 in London — evening, not afternoon.
        const start = new Date('2026-07-01T16:30:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: new Date('2026-07-01T17:00:00Z'),
        })
        expect(occ).toMatchObject({ startDate: '2026-07-01', time: '17:30', startPart: 'evening' })
    })

    it('moves the date when BST pushes a late-UTC meeting past midnight', () => {
        const start = new Date('2026-07-01T23:30:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: new Date('2026-07-02T00:30:00Z'),
        })
        expect(occ).toMatchObject({ startDate: '2026-07-02', time: '00:30', startPart: 'morning' })
    })
})

describe('meetingsFromIcs', () => {
    it('expands a weekly series, drops EXDATEs and applies a moved instance', () => {
        const ics = feed(
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261102T093000',
                'DTEND;TZID=Europe/London:20261102T100000',
                'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=5',
                'EXDATE;TZID=Europe/London:20261109T093000',
                'UID:standup@google.com',
                'SUMMARY:Standup',
                'LOCATION:Room 4',
                ME_ACCEPTED,
                'END:VEVENT',
            ].join('\r\n'),
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261116T140000',
                'DTEND;TZID=Europe/London:20261116T150000',
                'RECURRENCE-ID;TZID=Europe/London:20261116T093000',
                'UID:standup@google.com',
                'SUMMARY:Standup (moved)',
                ME_ACCEPTED,
                'END:VEVENT',
            ].join('\r\n')
        )
        const out = meetingsFromIcs(ics, WINDOW)
        expect(out.map((o) => [o.startDate, o.time, o.startPart, o.title])).toEqual([
            ['2026-11-02', '09:30', 'morning', 'Standup'],
            ['2026-11-16', '14:00', 'afternoon', 'Standup (moved)'],
            ['2026-11-23', '09:30', 'morning', 'Standup'],
            ['2026-11-30', '09:30', 'morning', 'Standup'],
        ])
        // The moved one keeps its original date as identity, so re-syncs update it in place.
        expect(out[1]).toMatchObject({ uid: 'standup@google.com', occurrenceDate: '2026-11-16' })
        expect(out[0].location).toBe('Room 4')
        expect(new Set(out.map((o) => `${o.uid}|${o.occurrenceDate}`)).size).toBe(out.length)
    })

    it('keeps the London wall-clock time across the October clock change', () => {
        const ics = feed(
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261021T100000',
                'DTEND;TZID=Europe/London:20261021T110000',
                'RRULE:FREQ=WEEKLY;COUNT=3',
                'UID:weekly@google.com',
                'SUMMARY:1:1',
                'END:VEVENT',
            ].join('\r\n')
        )
        const out = meetingsFromIcs(ics, WINDOW)
        expect(out.map((o) => `${o.startDate} ${o.time}`)).toEqual([
            '2026-10-21 10:00',
            '2026-10-28 10:00',
            '2026-11-04 10:00',
        ])
    })

    it('skips cancelled and declined meetings, including one declined instance', () => {
        const ics = feed(
            [
                'BEGIN:VEVENT',
                'DTSTART:20261110T130000Z',
                'DTEND:20261110T140000Z',
                'UID:declined@google.com',
                'SUMMARY:Declined',
                ME_DECLINED,
                'END:VEVENT',
            ].join('\r\n'),
            [
                'BEGIN:VEVENT',
                'DTSTART:20261111T130000Z',
                'DTEND:20261111T140000Z',
                'STATUS:CANCELLED',
                'UID:cancelled@google.com',
                'SUMMARY:Cancelled',
                'END:VEVENT',
            ].join('\r\n'),
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261103T160000',
                'DTEND;TZID=Europe/London:20261103T170000',
                'RRULE:FREQ=DAILY;COUNT=3',
                'UID:series@google.com',
                'SUMMARY:Daily',
                ME_ACCEPTED,
                'END:VEVENT',
            ].join('\r\n'),
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261104T160000',
                'DTEND;TZID=Europe/London:20261104T170000',
                'RECURRENCE-ID;TZID=Europe/London:20261104T160000',
                'UID:series@google.com',
                'SUMMARY:Daily',
                ME_DECLINED,
                'END:VEVENT',
            ].join('\r\n')
        )
        const out = meetingsFromIcs(ics, WINDOW)
        expect(out.map((o) => `${o.title} ${o.startDate}`)).toEqual([
            'Daily 2026-11-03',
            'Daily 2026-11-05',
        ])
        // 16:00–17:00 stays in the afternoon.
        expect(out[0]).toMatchObject({ startPart: 'afternoon', endPart: 'afternoon' })
    })

    it('stores all-day meetings with an inclusive end date', () => {
        const ics = feed(
            [
                'BEGIN:VEVENT',
                'DTSTART;VALUE=DATE:20261120',
                'DTEND;VALUE=DATE:20261122',
                'UID:offsite@google.com',
                'SUMMARY:Offsite',
                'END:VEVENT',
            ].join('\r\n')
        )
        expect(meetingsFromIcs(ics, WINDOW)).toEqual([
            expect.objectContaining({
                allDay: true,
                startDate: '2026-11-20',
                endDate: '2026-11-21',
                startPart: 'morning',
                endPart: 'evening',
                occurrenceDate: '2026-11-20',
            }),
        ])
        expect(meetingsFromIcs(ics, WINDOW)[0].time).toBeUndefined()
    })

    it('leaves out meetings outside the window', () => {
        const ics = feed(
            [
                'BEGIN:VEVENT',
                'DTSTART:20260301T090000Z',
                'DTEND:20260301T100000Z',
                'UID:old@google.com',
                'SUMMARY:Old',
                'END:VEVENT',
            ].join('\r\n'),
            [
                'BEGIN:VEVENT',
                'DTSTART;TZID=Europe/London:20261201T090000',
                'DTEND;TZID=Europe/London:20261201T093000',
                'RRULE:FREQ=MONTHLY',
                'UID:monthly@google.com',
                'SUMMARY:Monthly',
                'END:VEVENT',
            ].join('\r\n')
        )
        const out = meetingsFromIcs(ics, WINDOW)
        expect(out.map((o) => o.startDate)).toEqual(['2026-12-01', '2027-01-01'])
    })
})

describe('syncWindow', () => {
    it('looks a week back and ninety days ahead', () => {
        const w = syncWindow(new Date('2026-11-10T12:00:00Z'))
        expect(w.from.toISOString()).toBe('2026-11-03T12:00:00.000Z')
        expect(w.to.toISOString()).toBe('2027-02-08T12:00:00.000Z')
    })
})

describe('feed address', () => {
    const url =
        'https://calendar.google.com/calendar/ical/me%40example.com/private-0123456789abcdef0123456789abcdef/basic.ics'

    it('accepts https and webcal, rejects anything else', () => {
        expect(normaliseFeedUrl(`  ${url} `)).toBe(url)
        expect(normaliseFeedUrl(url.replace('https://', 'webcal://'))).toBe(url)
        expect(normaliseFeedUrl('http://calendar.google.com/x.ics')).toBeNull()
        expect(normaliseFeedUrl('not a url')).toBeNull()
        expect(normaliseFeedUrl(42)).toBeNull()
    })

    it('masks the secret part', () => {
        const masked = maskFeedUrl(url)
        expect(masked).toBe(
            'calendar.google.com/calendar/ical/me%40example.com/private-0123••••/basic.ics'
        )
        expect(masked).not.toContain('abcdef0123456789')
    })
})
