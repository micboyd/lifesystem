import { describe, it, expect } from 'vitest'
import {
    exerciseKey,
    exerciseHistory,
    exerciseRecords,
    metricSeries,
    personalBests,
    trackedExercises,
    windowChange,
} from './exerciseProgress'
import type { LoggedSet, WorkoutLog } from '../types'

/** A logged session carrying one or more exercise lines. */
function log(
    date: string,
    lines: { name: string; sets: LoggedSet[] }[]
): WorkoutLog {
    return {
        _id: `${date}-${lines.map((l) => l.name).join('-')}`,
        workout: null,
        name: 'Session',
        date,
        exercises: lines.map((l) => ({ name: l.name, loggedSets: l.sets })),
        createdAt: '',
        updatedAt: '',
    } as WorkoutLog
}

/** One session of one exercise. */
function one(date: string, name: string, sets: LoggedSet[]): WorkoutLog {
    return log(date, [{ name, sets }])
}

describe('exerciseKey', () => {
    it('folds case, punctuation and plurals into one identity', () => {
        expect(exerciseKey('Push-Ups')).toBe(exerciseKey('push up'))
        expect(exerciseKey('Bench  Press')).toBe(exerciseKey('bench press'))
    })

    it('falls back to the raw name when there is nothing to tokenise', () => {
        expect(exerciseKey('—')).toBe('—')
    })
})

describe('trackedExercises', () => {
    const logs = [
        one('2026-08-01', 'Bench Press', [{ weight: 60, reps: 8 }]),
        one('2026-08-08', 'bench press', [{ weight: 62.5, reps: 8 }]),
        one('2026-08-15', 'Bench Press', [{ weight: 65, reps: 6 }]),
        one('2026-08-02', 'Leg Press', [{ weight: 100, reps: 10 }]),
        // Logged as a quick "Done" — nothing to plot, so nothing to offer.
        one('2026-08-03', 'Plank', [{ reps: 60 }]),
    ]

    it('groups spellings together and counts distinct days', () => {
        const tracked = trackedExercises(logs)
        expect(tracked.map((t) => t.name)).toEqual(['Bench Press', 'Leg Press'])
        expect(tracked[0].sessions).toBe(3)
        expect(tracked[0].firstDate).toBe('2026-08-01')
        expect(tracked[0].lastDate).toBe('2026-08-15')
    })

    it('leaves out exercises logged without weights', () => {
        expect(trackedExercises(logs).some((t) => t.name === 'Plank')).toBe(false)
    })

    it('shows the most recent spelling', () => {
        const renamed = [
            one('2026-08-01', 'Bench Press', [{ weight: 60, reps: 8 }]),
            one('2026-08-08', 'Barbell Bench Press', [{ weight: 62.5, reps: 8 }]),
        ]
        // Different tokens, so these are two exercises — but within one identity
        // the latest wins, which the repeated-spelling case above covers.
        expect(trackedExercises(renamed)).toHaveLength(2)
    })
})

describe('exerciseHistory', () => {
    it('merges everything logged on one day into a single session', () => {
        const logs = [
            one('2026-08-01', 'Squat', [{ weight: 100, reps: 5 }]),
            one('2026-08-01', 'Squat', [{ weight: 110, reps: 3 }]),
        ]
        const history = exerciseHistory(logs, exerciseKey('Squat'))
        expect(history).toHaveLength(1)
        expect(history[0].topWeightKg).toBe(110)
        expect(history[0].volumeKg).toBe(100 * 5 + 110 * 3)
        expect(history[0].workingSets).toBe(2)
    })

    it('breaks a weight tie on reps', () => {
        const history = exerciseHistory(
            [one('2026-08-01', 'Squat', [{ weight: 100, reps: 5 }, { weight: 100, reps: 8 }])],
            exerciseKey('Squat')
        )
        expect(history[0].topSet).toEqual({ weight: 100, reps: 8 })
    })

    it('has no estimated max when every set ran past the usable rep range', () => {
        const history = exerciseHistory(
            [one('2026-08-01', 'Squat', [{ weight: 60, reps: 20 }])],
            exerciseKey('Squat')
        )
        expect(history[0].bestE1rmKg).toBeNull()
        // The volume still happened, even if it says nothing about strength.
        expect(history[0].volumeKg).toBe(1200)
    })

    it('returns sessions oldest first', () => {
        const logs = [
            one('2026-08-15', 'Squat', [{ weight: 105, reps: 5 }]),
            one('2026-08-01', 'Squat', [{ weight: 100, reps: 5 }]),
        ]
        expect(exerciseHistory(logs, exerciseKey('Squat')).map((s) => s.date)).toEqual([
            '2026-08-01',
            '2026-08-15',
        ])
    })
})

describe('metricSeries', () => {
    it('drops sessions the metric cannot describe', () => {
        const history = exerciseHistory(
            [
                one('2026-08-01', 'Squat', [{ weight: 100, reps: 5 }]),
                one('2026-08-08', 'Squat', [{ weight: 60, reps: 20 }]),
            ],
            exerciseKey('Squat')
        )
        expect(metricSeries(history, 'e1rm').map((p) => p.date)).toEqual(['2026-08-01'])
        expect(metricSeries(history, 'volume')).toHaveLength(2)
    })
})

describe('windowChange', () => {
    const asOf = '2026-09-01'
    const points = [
        // Previous window (days 42–83 back).
        { date: '2026-07-01', value: 100 },
        { date: '2026-07-08', value: 100 },
        // Recent window (last 42 days).
        { date: '2026-08-20', value: 110 },
        { date: '2026-08-28', value: 110 },
    ]

    it('calls a clear rise improving', () => {
        const change = windowChange(points, asOf, 42)
        expect(change.status).toBe('improving')
        expect(change.changePct).toBeCloseTo(10)
    })

    it('calls small movement stable', () => {
        const flat = points.map((p, i) => ({ ...p, value: i < 2 ? 100 : 101 }))
        expect(windowChange(flat, asOf, 42).status).toBe('stable')
    })

    it('calls a clear drop declining', () => {
        const down = points.map((p, i) => ({ ...p, value: i < 2 ? 100 : 90 }))
        expect(windowChange(down, asOf, 42).status).toBe('declining')
    })

    it('refuses a verdict without enough sessions either side', () => {
        const thin = [points[0], points[2], points[3]]
        const change = windowChange(thin, asOf, 42)
        expect(change.status).toBe('insufficient-data')
        expect(change.changePct).toBeNull()
    })
})

describe('exerciseRecords', () => {
    it('reports the heaviest set, best estimate and biggest session', () => {
        const history = exerciseHistory(
            [
                one('2026-08-01', 'Squat', [
                    { weight: 100, reps: 5 },
                    { weight: 100, reps: 5 },
                ]),
                one('2026-08-08', 'Squat', [{ weight: 120, reps: 1 }]),
            ],
            exerciseKey('Squat')
        )
        const records = exerciseRecords(history)
        expect(records.heaviest).toEqual({ date: '2026-08-08', weightKg: 120, reps: 1 })
        expect(records.bestVolume?.date).toBe('2026-08-01')
        // 100 × (1 + 5/30) ≈ 116.7 against 120 × (1 + 1/30) = 124.
        expect(records.bestE1rm?.date).toBe('2026-08-08')
    })
})

describe('personalBests', () => {
    it('records the first session with no previous weight to beat', () => {
        const bests = personalBests([one('2026-08-01', 'Squat', [{ weight: 100, reps: 5 }])])
        expect(bests).toHaveLength(1)
        expect(bests[0].previousKg).toBeNull()
    })

    it('posts one best per day, not one per set of a warm-up ladder', () => {
        const bests = personalBests([
            one('2026-08-01', 'Squat', [
                { weight: 60, reps: 5 },
                { weight: 80, reps: 5 },
                { weight: 100, reps: 5 },
            ]),
        ])
        expect(bests).toHaveLength(1)
        expect(bests[0].weightKg).toBe(100)
    })

    it('only counts a heavier top set, not a better estimated max', () => {
        const bests = personalBests([
            one('2026-08-01', 'Squat', [{ weight: 100, reps: 3 }]),
            // A better estimate (100 × 1.33 > 100 × 1.1) but the same weight.
            one('2026-08-08', 'Squat', [{ weight: 100, reps: 10 }]),
            one('2026-08-15', 'Squat', [{ weight: 102.5, reps: 1 }]),
        ])
        expect(bests.map((b) => b.date)).toEqual(['2026-08-01', '2026-08-15'])
        expect(bests[1].previousKg).toBe(100)
    })

    it('tracks each exercise separately and returns them oldest first', () => {
        const bests = personalBests([
            log('2026-08-01', [
                { name: 'Squat', sets: [{ weight: 100, reps: 5 }] },
                { name: 'Bench Press', sets: [{ weight: 60, reps: 5 }] },
            ]),
            one('2026-08-08', 'Bench Press', [{ weight: 62.5, reps: 5 }]),
        ])
        expect(bests.map((b) => b.date)).toEqual(['2026-08-01', '2026-08-01', '2026-08-08'])
        expect(bests[2].name).toBe('Bench Press')
    })
})
