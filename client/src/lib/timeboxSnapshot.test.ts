import { describe, expect, it } from 'vitest'
import { buildTimeboxSnapshot, mondayOf } from './timeboxSnapshot'
import { parseTimeboxImport } from './timebox'
import type { Timebox } from '../types'

const base = { exceptions: [], createdAt: '', updatedAt: '' }
const gym: Timebox = {
    ...base,
    _id: 'g',
    date: '2026-11-25',
    title: 'Gym',
    startTime: '07:00',
    endTime: '08:00',
    category: 'health',
    recurrence: { freq: 'custom', days: [1, 3, 5] },
    seriesStart: '2026-11-02',
    exceptions: ['2026-11-27', '2026-10-30'],
    isRecurringInstance: true,
}
const read: Timebox = { ...base, _id: 'r', date: '2026-11-25', title: 'Read', startTime: '21:00', endTime: '21:30', notes: 'Ch 4' }
const meet: Timebox = { ...base, _id: 'm', date: '2026-11-25', title: 'Standup', startTime: '09:15', endTime: '09:45', source: 'ical' }

describe('timebox snapshot', () => {
    it('finds the Monday of a week', () => {
        expect(mondayOf('2026-11-25')).toBe('2026-11-23')
        expect(mondayOf('2026-11-29')).toBe('2026-11-23')
        expect(mondayOf('2026-11-23')).toBe('2026-11-23')
    })

    it('lists a repeat once, keeps meetings apart, and round-trips through the import', () => {
        const snap = buildTimeboxSnapshot(
            [
                { date: '2026-11-25', items: [read, gym, meet], meals: [] },
                { date: '2026-11-27', items: [{ ...gym, date: '2026-11-27' }], meals: [] },
            ],
            undefined,
            'week'
        )
        expect(snap.blocks.map((b) => b.title)).toEqual(['Gym', 'Read'])
        expect(snap.blocks[0]).toMatchObject({ date: '2026-11-02', repeat: ['mon', 'wed', 'fri'], skippedDays: ['2026-11-27'] })
        expect(snap.meetings).toHaveLength(1)

        const parsed = parseTimeboxImport(JSON.stringify(snap))
        if (!('items' in parsed)) throw new Error(parsed.error)
        expect(parsed.items).toEqual([
            { title: 'Gym', start: '07:00', end: '08:00', category: 'health', date: '2026-11-02', recurrence: { freq: 'custom', days: [1, 3, 5] } },
            { title: 'Read', start: '21:00', end: '21:30', notes: 'Ch 4', date: '2026-11-25' },
        ])
    })
})
