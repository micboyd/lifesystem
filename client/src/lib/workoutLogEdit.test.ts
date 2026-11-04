import { describe, expect, it } from 'vitest'
import type { Exercise, Workout, WorkoutLog } from '../types'
import { seedFromLog } from './workoutLogEdit'

const ex = (id: string, name: string) => ({ _id: id, name }) as Exercise
const library = [
    ex('w', 'Band pull-apart'),
    ex('a', 'Bench press'),
    ex('b', 'Leg press'),
    ex('c', 'Hack squat'),
    ex('d', 'Cable curl'),
]
const byId = new Map(library.map((e) => [e._id, e]))

const workout = {
    _id: 'wk',
    name: 'Push',
    warmUp: [{ exercise: 'w' }],
    main: [
        { exercise: 'a', sets: 3, reps: '8' },
        { exercise: 'b', sets: 3, reps: '10' },
    ],
    coolDown: [],
} as unknown as Workout

const log = (exercises: WorkoutLog['exercises']) =>
    ({ _id: 'l1', workout: 'wk', name: 'Push', date: '2026-11-04', exercises }) as WorkoutLog

describe('seedFromLog', () => {
    it('lays logged sets back over the workout rows', () => {
        const rows = seedFromLog(
            workout,
            log([
                { name: 'Band pull-apart', phase: 'warmUp' },
                { name: 'Bench press', loggedSets: [{ weight: 60, reps: 8 }] },
                { name: 'Leg press', loggedSets: [{ weight: 100, reps: 10 }, { reps: 9 }] },
            ]),
            byId
        )!
        expect(rows).toHaveLength(3)
        expect(rows[0].sets).toEqual([{ weight: '', reps: '', done: true }])
        expect(rows[1].sets).toEqual([{ weight: '60', reps: '8', done: true }])
        expect(rows[2].sets[1]).toEqual({ weight: '', reps: '9', done: true })
    })

    it('marks rows missing from the log as skipped', () => {
        const rows = seedFromLog(
            workout,
            log([
                { name: 'Band pull-apart', phase: 'warmUp' },
                { name: 'Leg press', loggedSets: [{ weight: 100, reps: 10 }] },
            ]),
            byId
        )!
        expect(rows[1].removed).toBe(true)
        expect(rows[1].name).toBe('Bench press')
        expect(rows[2].removed).toBeUndefined()
    })

    it('keeps swaps and added exercises', () => {
        const rows = seedFromLog(
            workout,
            log([
                { name: 'Band pull-apart', phase: 'warmUp' },
                { name: 'Bench press' },
                { name: 'Hack squat', substitutedFor: 'Leg press', loggedSets: [{ weight: 80 }] },
                { name: 'Cable curl', added: true, loggedSets: [{ weight: 20, reps: 12 }] },
            ]),
            byId
        )!
        expect(rows[2]).toMatchObject({
            exerciseId: 'c',
            name: 'Hack squat',
            swappedFrom: { id: 'b', name: 'Leg press' },
        })
        expect(rows[3]).toMatchObject({ exerciseId: 'd', added: true })
        // A quick "Done" with no sets keeps the prescription's blank sets.
        expect(rows[1].sets).toHaveLength(3)
        expect(rows[1].sets.every((s) => !s.done)).toBe(true)
    })

    it('refuses a log that no longer matches the workout', () => {
        expect(
            seedFromLog(workout, log([{ name: 'Deadlift', loggedSets: [{ weight: 140 }] }]), byId)
        ).toBeNull()
    })
})
