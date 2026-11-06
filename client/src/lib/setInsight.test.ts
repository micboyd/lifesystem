import { describe, it, expect } from 'vitest'
import { lastSetsFor, setDelta, setInsight, shortSet, type LastSets } from './setInsight'
import type { WorkoutLog } from '../types'

const last: LastSets = {
    date: '2026-10-20',
    sets: [
        { weight: 60, reps: 8 },
        { weight: 60, reps: 8 },
        { weight: 60, reps: 6 },
    ],
}

function log(id: string, date: string, name: string, sets: { weight?: number; reps?: number }[]): WorkoutLog {
    return {
        _id: id,
        date,
        createdAt: `${date}T10:00:00Z`,
        exercises: [{ name, loggedSets: sets }],
    } as unknown as WorkoutLog
}

describe('lastSetsFor', () => {
    it('takes the most recent session, skipping the one being logged', () => {
        const logs = [
            log('a', '2026-10-13', 'Bench Press', [{ weight: 55, reps: 8 }]),
            log('b', '2026-10-20', 'bench press', [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }]),
            log('c', '2026-10-23', 'Bench Press', [{ weight: 65, reps: 5 }]),
        ]
        expect(lastSetsFor(logs, 'Bench Press', 'c')).toEqual({
            date: '2026-10-20',
            sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 7 }],
        })
    })

    it('is null with no history', () => {
        expect(lastSetsFor([], 'Squat')).toBeNull()
    })
})

describe('setInsight', () => {
    it('says nothing without history', () => {
        expect(setInsight(null, [{ weight: 60, reps: 8 }], null)).toEqual({})
    })

    it('compares the set being typed with the same set last time', () => {
        const i = setInsight(last, [], { index: 0, set: { weight: 65, reps: 8 } })
        expect(i.current?.text).toBe('Set 1: 5kg heavier than last time’s 60kg × 8')
        expect(i.current?.tone).toBe('up')
        expect(i.current?.parts).toContainEqual({ v: '5kg' })
        expect(i.sets).toBeUndefined()
    })

    it('calls a heavier, fewer-rep set mixed', () => {
        const i = setInsight(last, [], { index: 1, set: { weight: 65, reps: 6 } })
        expect(i.current?.text).toBe('Set 2: 5kg heavier but 2 fewer reps than last time’s 60kg × 8')
        expect(i.current?.tone).toBe('mixed')
    })

    it('doesn’t call a set with no weight yet the same', () => {
        const i = setInsight(last, [], { index: 1, set: { reps: 8 } })
        expect(i.current?.text).toBe('Set 2: last time was 60kg × 8')
    })

    it('notes a matched set and an extra one', () => {
        expect(setInsight(last, [], { index: 2, set: { weight: 60, reps: 6 } }).current?.tone).toBe('same')
        expect(setInsight(last, [], { index: 3, set: { weight: 60, reps: 6 } }).current?.text).toBe(
            'Set 4: an extra one — last time you did 3'
        )
    })

    it('weighs volume against the same sets so far, not the whole session', () => {
        const i = setInsight(last, [{ weight: 60, reps: 10 }], null)
        expect(i.volume?.text).toBe('Total weight so far: 25% more than your first set last time')
        expect(i.sets?.text).toBe('2 more sets to match last time’s 3')
    })

    it('counts extra sets and compares with last time’s total', () => {
        const done = [
            { weight: 60, reps: 8 },
            { weight: 60, reps: 8 },
            { weight: 60, reps: 6 },
            { weight: 60, reps: 6 },
        ]
        const i = setInsight(last, done, null)
        expect(i.sets?.text).toBe('1 more set than last time')
        expect(i.volume?.text).toBe('Total weight so far: 27% more than last time')
    })

    it('counts a set with no reps yet, but leaves it out of the total', () => {
        const done = [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 6 }, { weight: 60 }]
        const i = setInsight(last, done, null)
        expect(i.sets?.text).toBe('1 more set than last time')
        expect(i.volume?.text).toBe('Total weight so far matches last time')
    })

    it('falls back to reps for bodyweight work', () => {
        const bw: LastSets = { date: '2026-10-20', sets: [{ reps: 10 }, { reps: 10 }] }
        const i = setInsight(bw, [{ reps: 9 }, { reps: 9 }], null)
        expect(i.volume?.text).toBe('Total reps so far: 10% fewer than last time')
        expect(i.volume?.tone).toBe('down')
        expect(i.sets?.text).toBe('Same number of sets as last time — 2')
    })
})

describe('setDelta', () => {
    it('weighs kg and reps against the same set last time', () => {
        expect(setDelta({ weight: 65, reps: 7 }, { weight: 60, reps: 8 })).toEqual({ weight: 5, reps: -1 })
    })

    it('waits for reps, and for a weight when last time had one', () => {
        expect(setDelta({ weight: 65 }, { weight: 60, reps: 8 })).toBeNull()
        expect(setDelta({ reps: 8 }, { weight: 60, reps: 8 })).toBeNull()
    })

    it('handles bodyweight work on reps alone', () => {
        expect(setDelta({ reps: 12 }, { reps: 10 })).toEqual({ weight: 0, reps: 2 })
    })

    it('is null with no set to compare to', () => {
        expect(setDelta({ weight: 60, reps: 8 }, undefined)).toBeNull()
    })

    it('drops float noise', () => {
        expect(setDelta({ weight: 62.6, reps: 8 }, { weight: 60.1, reps: 8 })).toEqual({ weight: 2.5, reps: 0 })
    })
})

describe('shortSet', () => {
    it('fits a set into a narrow column', () => {
        expect(shortSet({ weight: 80, reps: 8 })).toBe('80×8')
        expect(shortSet({ weight: 80 })).toBe('80kg')
        expect(shortSet({ reps: 1 })).toBe('1 rep')
    })
})
