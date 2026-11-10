import { describe, expect, it } from 'vitest'
import {
    maskFeedUrl,
    meetingsFromIcs,
    normaliseFeedUrl,
    occurrenceFrom,
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

describe('occurrenceFrom', () => {
    const base = { uid: 'u', title: 't' }
    const at = (iso: string) => new Date(iso)

    it('keeps start and end as London wall-clock times', () => {
        const start = at('2026-11-12T09:00:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: at('2026-11-12T10:30:00Z'),
        })
        expect(occ).toMatchObject({ date: '2026-11-12', startTime: '09:00', endTime: '10:30' })
    })

    it('converts summer UTC times to British Summer Time', () => {
        const start = at('2026-07-01T16:30:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: at('2026-07-01T17:00:00Z'),
        })
        expect(occ).toMatchObject({ date: '2026-07-01', startTime: '17:30', endTime: '18:00' })
    })

    it('moves the date when BST pushes a late-UTC meeting past midnight', () => {
        const start = at('2026-07-01T23:30:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: at('2026-07-02T00:30:00Z'),
        })
        expect(occ).toMatchObject({ date: '2026-07-02', startTime: '00:30', endTime: '01:30' })
    })

    it('clips a meeting that runs past midnight to the end of its first day', () => {
        const start = at('2026-11-12T22:00:00Z')
        const occ = occurrenceFrom({
            ...base,
            originalStart: start,
            start,
            end: at('2026-11-13T01:00:00Z'),
        })
        expect(occ).toMatchObject({ date: '2026-11-12', startTime: '22:00', endTime: '23:59' })
    })

    it('gives a zero-length meeting fifteen minutes', () => {
        const start = at('2026-11-12T14:00:00Z')
        expect(occurrenceFrom({ ...base, originalStart: start, start, end: start })).toMatchObject({
            startTime: '14:00',
            endTime: '14:15',
        })
        const late = at('2026-11-12T23:59:00Z')
        expect(
            occurrenceFrom({ ...base, originalStart: late, start: late, end: late }).endTime
        ).toBe('23:59')
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
        expect(out.map((o) => [o.date, o.startTime, o.endTime, o.title])).toEqual([
            ['2026-11-02', '09:30', '10:00', 'Standup'],
            ['2026-11-16', '14:00', '15:00', 'Standup (moved)'],
            ['2026-11-23', '09:30', '10:00', 'Standup'],
            ['2026-11-30', '09:30', '10:00', 'Standup'],
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
        expect(out.map((o) => `${o.date} ${o.startTime}`)).toEqual([
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
        expect(out.map((o) => `${o.title} ${o.date}`)).toEqual([
            'Daily 2026-11-03',
            'Daily 2026-11-05',
        ])
        expect(out[0]).toMatchObject({ startTime: '16:00', endTime: '17:00' })
    })

    it('skips all-day meetings — Timebox only holds timed blocks', () => {
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
        expect(meetingsFromIcs(ics, WINDOW)).toEqual([])
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
        expect(out.map((o) => o.date)).toEqual(['2026-12-01', '2027-01-01'])
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
