import { describe, expect, it } from 'vitest'
import { candidatesFor, logMinutes, matchActivities, unrollSteps } from './activityMatch'
import type { ActivityBrief } from './provider'

function act(id: string, over: Partial<ActivityBrief> = {}): ActivityBrief {
    return {
        activityId: id,
        name: 'Run',
        typeKey: 'running',
        startLocal: '2026-11-04 07:00:00',
        startGMT: '2026-11-04 07:00:00',
        distanceM: 5000,
        durationS: 1800,
        movingS: 1790,
        avgHr: 150,
        workoutId: null,
        ...over,
    }
}

const entry = (id: string, date = '2026-11-04', workoutId: string | null = null) => ({ _id: id, date, workoutId })

describe('matchActivities', () => {
    it('links by the workout the entry was sent as', () => {
        const links = matchActivities([entry('e1', '2026-11-04', '42')], [act('a1'), act('a2', { workoutId: '42' })], new Set())
        expect(links).toEqual([{ entryId: 'e1', activityId: 'a2', by: 'workout' }])
    })

    it('picks the longest when the same workout was started twice', () => {
        const links = matchActivities(
            [entry('e1', '2026-11-04', '42')],
            [act('short', { workoutId: '42', movingS: 60 }), act('long', { workoutId: '42', movingS: 1800 })],
            new Set()
        )
        expect(links[0].activityId).toBe('long')
    })

    it('does not link a workout match on another day', () => {
        const links = matchActivities(
            [entry('e1', '2026-11-05', '42')],
            [act('a1', { workoutId: '42' })],
            new Set()
        )
        expect(links).toEqual([])
    })

    it('links one entry to the one run on its day', () => {
        expect(matchActivities([entry('e1')], [act('a1')], new Set())).toEqual([
            { entryId: 'e1', activityId: 'a1', by: 'day' },
        ])
    })

    it('ignores non-runs for the same-day match', () => {
        const links = matchActivities([entry('e1')], [act('a1'), act('gym', { typeKey: 'strength_training' })], new Set())
        expect(links).toEqual([{ entryId: 'e1', activityId: 'a1', by: 'day' }])
    })

    it('does not give the day’s run to a session that isn’t a run', () => {
        expect(matchActivities([{ ...entry('e1'), runLike: false }], [act('a1')], new Set())).toEqual([])
    })

    it('leaves two runs on the day for a person to pick', () => {
        expect(matchActivities([entry('e1')], [act('a1'), act('a2')], new Set())).toEqual([])
    })

    it('leaves two entries on the day for a person to pick', () => {
        expect(matchActivities([entry('e1'), entry('e2')], [act('a1')], new Set())).toEqual([])
    })

    it('never offers a taken or dismissed activity', () => {
        expect(matchActivities([entry('e1')], [act('a1')], new Set(['a1']))).toEqual([])
    })

    it('a workout match frees the day for the other entry', () => {
        const links = matchActivities(
            [entry('e1', '2026-11-04', '42'), entry('e2')],
            [act('a1', { workoutId: '42' }), act('a2', { startLocal: '2026-11-04 18:00:00' })],
            new Set()
        )
        expect(links).toEqual([
            { entryId: 'e1', activityId: 'a1', by: 'workout' },
            { entryId: 'e2', activityId: 'a2', by: 'day' },
        ])
    })

    it('reads the day from local start time', () => {
        const links = matchActivities([entry('e1', '2026-11-03')], [act('a1', { startLocal: '2026-11-03 23:30:00' })], new Set())
        expect(links).toHaveLength(1)
    })
})

describe('candidatesFor', () => {
    it('lists the day’s untaken activities, newest first', () => {
        const list = candidatesFor(
            '2026-11-04',
            [
                act('a1', { startLocal: '2026-11-04 07:00:00' }),
                act('a2', { startLocal: '2026-11-04 18:00:00' }),
                act('a3', { startLocal: '2026-11-05 07:00:00' }),
                act('a4', { startLocal: '2026-11-04 12:00:00' }),
            ],
            new Set(['a4'])
        )
        expect(list.map((a) => a.activityId)).toEqual(['a2', 'a1'])
    })
})

describe('unrollSteps', () => {
    it('unrolls repeats into one step per lap', () => {
        const steps = unrollSteps([
            { type: 'warmup', label: 'Warm-up', end: { kind: 'time', seconds: 300 } },
            {
                type: 'repeat',
                times: 2,
                steps: [
                    { type: 'run', label: 'Run', end: { kind: 'time', seconds: 60 } },
                    { type: 'walk', label: 'Walk', end: { kind: 'time', seconds: 90 } },
                ],
            },
        ])
        expect(steps.map((s) => s.label)).toEqual(['Warm-up', 'Run', 'Walk', 'Run', 'Walk'])
    })
})

describe('logMinutes', () => {
    it('prefers moving time and rounds', () => {
        expect(logMinutes({ movingS: 1789, durationS: 2000 })).toBe(30)
        expect(logMinutes({ movingS: null, durationS: 600 })).toBe(10)
        expect(logMinutes({ movingS: null, durationS: null })).toBe(0)
    })
})
