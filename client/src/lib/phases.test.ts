import { describe, it, expect } from 'vitest'
import {
    allInPhases,
    estimateWorkoutMinutes,
    flattenPhases,
    isMainWork,
    nonEmptyPhases,
} from './phases'
import { logVolume, logWorkingSets } from './trainingLoad'
import type { WorkoutLog } from '../types'

describe('flattenPhases', () => {
    it('reads warm-up, main, then cool-down, tagging each item', () => {
        const doc = { warmUp: ['a'], main: ['b', 'c'], coolDown: ['d'] }
        expect(flattenPhases(doc)).toEqual([
            { phase: 'warmUp', item: 'a' },
            { phase: 'main', item: 'b' },
            { phase: 'main', item: 'c' },
            { phase: 'coolDown', item: 'd' },
        ])
        expect(allInPhases(doc)).toEqual(['a', 'b', 'c', 'd'])
    })

    it('drops empty phases for export', () => {
        expect(nonEmptyPhases({ warmUp: [], main: [1], coolDown: [] })).toEqual({ main: [1] })
    })
})

describe('estimateWorkoutMinutes', () => {
    it('assumes an 8-minute warm-up when none is prescribed', () => {
        expect(estimateWorkoutMinutes({ warmUp: [], main: [{ sets: 3 }], coolDown: [] })).toBe(14)
    })

    it('counts a prescribed warm-up and cool-down instead', () => {
        const workout = { warmUp: [{ sets: 2 }, {}], main: [{ sets: 3 }], coolDown: [{}] }
        // warm-up 2×1 + 3, main 3×2, cool-down 3
        expect(estimateWorkoutMinutes(workout)).toBe(14)
    })

    it('is zero for an empty workout', () => {
        expect(estimateWorkoutMinutes({ warmUp: [], main: [], coolDown: [] })).toBe(0)
    })
})

describe('main work only', () => {
    const log: WorkoutLog = {
        _id: 'l1',
        workout: null,
        name: 'Lower A',
        date: '2026-09-27',
        exercises: [
            { name: 'Goblet Squat', phase: 'warmUp', loggedSets: [{ weight: 20, reps: 10 }] },
            { name: 'Back Squat', loggedSets: [{ weight: 100, reps: 5 }] },
            { name: 'Leg Swings', phase: 'coolDown', loggedSets: [{ weight: 0, reps: 10 }] },
        ],
        createdAt: '',
        updatedAt: '',
    }

    it('treats lines without a phase as main', () => {
        expect(isMainWork({})).toBe(true)
        expect(isMainWork({ phase: 'warmUp' })).toBe(false)
    })

    it('leaves warm-up sets out of volume and working sets', () => {
        expect(logVolume(log)).toBe(500)
        expect(logWorkingSets(log)).toBe(1)
    })
})
