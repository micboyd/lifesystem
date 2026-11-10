import { describe, expect, it } from 'vitest'
import { meetingAsEvent, partForMinutes, type MeetingBlock } from './meetingClashes'
import { eventCoversSlot } from './calendar'

const meeting = (startTime: string, endTime: string): MeetingBlock => ({
    _id: 'm1',
    date: '2026-11-12',
    title: 'Standup',
    startTime,
    endTime,
})

describe('partForMinutes', () => {
    it('splits the day at 12:00 and 17:00', () => {
        expect(partForMinutes(0)).toBe('morning')
        expect(partForMinutes(11 * 60 + 59)).toBe('morning')
        expect(partForMinutes(12 * 60)).toBe('afternoon')
        expect(partForMinutes(16 * 60 + 59)).toBe('afternoon')
        expect(partForMinutes(17 * 60)).toBe('evening')
    })
})

describe('meetingAsEvent', () => {
    it('keeps a meeting ending on the hour in the part it ran in', () => {
        const e = meetingAsEvent(meeting('09:00', '12:00'))
        expect(e).toMatchObject({ startPart: 'morning', endPart: 'morning', time: '09:00', allDay: false })
        expect(eventCoversSlot(e, '2026-11-12', 'afternoon')).toBe(false)
    })

    it('covers both parts when a meeting crosses noon', () => {
        const e = meetingAsEvent(meeting('11:30', '13:00'))
        expect(eventCoversSlot(e, '2026-11-12', 'morning')).toBe(true)
        expect(eventCoversSlot(e, '2026-11-12', 'afternoon')).toBe(true)
        expect(eventCoversSlot(e, '2026-11-12', 'evening')).toBe(false)
    })

    it('puts a 17:00 meeting in the evening, on its own day only', () => {
        const e = meetingAsEvent(meeting('17:00', '18:00'))
        expect(e).toMatchObject({ startPart: 'evening', endPart: 'evening' })
        expect(eventCoversSlot(e, '2026-11-13', 'evening')).toBe(false)
    })

    it('counts as a clash (not ignored) and is never mistaken for a saved event', () => {
        const e = meetingAsEvent(meeting('14:00', '15:00'))
        expect(e.ignoreClash).toBe(false)
        expect(e._id).toBe('meeting-m1')
    })
})
