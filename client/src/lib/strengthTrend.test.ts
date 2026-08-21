import { describe, it, expect } from 'vitest'
import {
    estimatedMax,
    liftFor,
    sessionBests,
    liftTrend,
    strengthSummary,
    MAX_USABLE_REPS,
    MEANINGFUL_CHANGE_PCT,
} from './strengthTrend'
import type { WorkoutLog } from '../types'

function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

const ASOF = '2026-11-01'

/** A logged session with one exercise and its sets. */
function session(
    date: string,
    name: string,
    sets: { weight?: number; reps?: number }[]
): WorkoutLog {
    return {
        _id: `${date}-${name}`,
        workout: null,
        name: 'Session',
        date,
        exercises: [{ name, loggedSets: sets }],
        createdAt: '',
        updatedAt: '',
    } as WorkoutLog
}

/**
 * `count` sessions of one lift ending at ASOF, every `every` days, with the top
 * set moving `perSession` kg each time.
 */
function progression(
    name: string,
    topSet: number,
    perSession: number,
    count: number,
    every = 7
): WorkoutLog[] {
    return Array.from({ length: count }, (_, i) => {
        const back = (count - 1 - i) * every
        return session(plus(ASOF, -back), name, [{ weight: topSet + perSession * i, reps: 5 }])
    })
}

describe('estimatedMax', () => {
    it('applies the Epley formula', () => {
        expect(estimatedMax(100, 5)).toBeCloseTo(116.667, 3)
        expect(estimatedMax(100, 1)).toBeCloseTo(103.333, 3)
    })

    it('ranks a heavier set above a lighter one at the same reps', () => {
        expect(estimatedMax(120, 5)!).toBeGreaterThan(estimatedMax(100, 5)!)
    })

    it('ranks more reps above fewer at the same weight', () => {
        expect(estimatedMax(100, 8)!).toBeGreaterThan(estimatedMax(100, 3)!)
    })

    it('refuses high-rep sets, which measure endurance rather than strength', () => {
        expect(estimatedMax(60, MAX_USABLE_REPS)).not.toBeNull()
        expect(estimatedMax(60, MAX_USABLE_REPS + 1)).toBeNull()
    })

    it('refuses bodyweight or missing loads', () => {
        expect(estimatedMax(0, 5)).toBeNull()
        expect(estimatedMax(100, 0)).toBeNull()
        expect(estimatedMax(NaN, 5)).toBeNull()
    })
})

describe('liftFor', () => {
    it('recognises the compound lifts by name', () => {
        expect(liftFor('Back Squat')).toBe('squat')
        expect(liftFor('Barbell Bench Press')).toBe('bench')
        expect(liftFor('Trap Bar Deadlift')).toBe('deadlift')
        expect(liftFor('Overhead Press')).toBe('overhead')
        expect(liftFor('Barbell Row')).toBe('row')
    })

    it('is case-insensitive', () => {
        expect(liftFor('front squat')).toBe('squat')
        expect(liftFor('SHOULDER PRESS')).toBe('overhead')
    })

    it('does not claim accessory work', () => {
        expect(liftFor('Leg Press')).toBeNull()
        expect(liftFor('Bicep Curl')).toBeNull()
        expect(liftFor('Lateral Raise')).toBeNull()
    })
})

describe('sessionBests', () => {
    it('takes the best estimated max in a session, not the last set', () => {
        const logs = [
            session('2026-10-01', 'Back Squat', [
                { weight: 100, reps: 5 },
                { weight: 140, reps: 3 },
                { weight: 90, reps: 8 },
            ]),
        ]
        const [best] = sessionBests(logs)
        expect(best.weightKg).toBe(140)
        expect(best.reps).toBe(3)
    })

    it('ignores exercises that are not key lifts', () => {
        expect(sessionBests([session('2026-10-01', 'Bicep Curl', [{ weight: 20, reps: 10 }])])).toHaveLength(0)
    })

    it('ignores sets missing weight or reps', () => {
        const logs = [session('2026-10-01', 'Back Squat', [{ weight: 100 }, { reps: 5 }])]
        expect(sessionBests(logs)).toHaveLength(0)
    })

    it('keeps one entry per lift per session, oldest first', () => {
        const logs = [
            session('2026-10-08', 'Back Squat', [{ weight: 105, reps: 5 }]),
            session('2026-10-01', 'Back Squat', [{ weight: 100, reps: 5 }]),
        ]
        const bests = sessionBests(logs)
        expect(bests).toHaveLength(2)
        expect(bests[0].date).toBe('2026-10-01')
    })

    it('handles a log with no sets recorded at all', () => {
        const bare = { _id: 'x', workout: null, name: 'S', date: '2026-10-01', exercises: [{ name: 'Back Squat' }], createdAt: '', updatedAt: '' } as WorkoutLog
        expect(sessionBests([bare])).toHaveLength(0)
    })
})

describe('liftTrend', () => {
    it('reports insufficient data with too few sessions', () => {
        const bests = sessionBests(progression('Back Squat', 100, 2.5, 2))
        const t = liftTrend(bests, 'squat', ASOF)
        expect(t.status).toBe('insufficient-data')
        expect(t.changePct).toBeNull()
    })

    it('calls a rising lift improving', () => {
        // 12 weekly sessions climbing 2.5 kg each: ~14% across the comparison.
        const bests = sessionBests(progression('Back Squat', 100, 2.5, 12))
        const t = liftTrend(bests, 'squat', ASOF)
        expect(t.status).toBe('improving')
        expect(t.changePct!).toBeGreaterThan(MEANINGFUL_CHANGE_PCT)
    })

    it('calls a falling lift declining', () => {
        const bests = sessionBests(progression('Back Squat', 130, -2.5, 12))
        const t = liftTrend(bests, 'squat', ASOF)
        expect(t.status).toBe('declining')
        expect(t.changePct!).toBeLessThan(0)
    })

    it('calls a lift holding through a deficit stable', () => {
        const bests = sessionBests(progression('Back Squat', 120, 0, 12))
        expect(liftTrend(bests, 'squat', ASOF).status).toBe('stable')
    })

    it('does not call small session-to-session noise a change', () => {
        // Alternating ±1 kg around 120: real sessions never repeat exactly.
        const logs = Array.from({ length: 12 }, (_, i) =>
            session(plus(ASOF, -(11 - i) * 7), 'Back Squat', [
                { weight: 120 + (i % 2 === 0 ? 1 : -1), reps: 5 },
            ])
        )
        expect(liftTrend(sessionBests(logs), 'squat', ASOF).status).toBe('stable')
    })

    it('records the all-time best and the latest session', () => {
        const bests = sessionBests(progression('Back Squat', 100, 2.5, 12))
        const t = liftTrend(bests, 'squat', ASOF)
        expect(t.bestKg).toBeCloseTo(estimatedMax(127.5, 5)!, 5)
        expect(t.latest?.date).toBe(ASOF)
    })

    it('ignores sessions after the date being asked about', () => {
        const bests = sessionBests(progression('Back Squat', 100, 2.5, 12))
        const t = liftTrend(bests, 'squat', plus(ASOF, -70))
        expect(t.latest!.date <= plus(ASOF, -70)).toBe(true)
    })
})

describe('strengthSummary', () => {
    it('has nothing to say without logged sessions', () => {
        const s = strengthSummary([], ASOF)
        expect(s.overall).toBe('insufficient-data')
        expect(s.judged).toBe(0)
        expect(s.lifts).toHaveLength(5)
    })

    it('calls the block improving when more lifts rise than fall', () => {
        const logs = [
            ...progression('Back Squat', 100, 2.5, 12),
            ...progression('Bench Press', 80, 1.5, 12),
        ]
        const s = strengthSummary(logs, ASOF)
        expect(s.overall).toBe('improving')
        expect(s.judged).toBe(2)
    })

    it('calls the block stable when the lifts are holding', () => {
        const logs = [
            ...progression('Back Squat', 120, 0, 12),
            ...progression('Bench Press', 90, 0, 12),
        ]
        expect(strengthSummary(logs, ASOF).overall).toBe('stable')
    })

    it('leans to declining when one lift is clearly falling', () => {
        // Caution on the way down: a single lift going backwards during a
        // deficit is the early warning, and shouldn't be averaged away.
        const logs = [
            ...progression('Back Squat', 130, -3, 12),
            ...progression('Bench Press', 90, 0, 12),
        ]
        expect(strengthSummary(logs, ASOF).overall).toBe('declining')
    })

    it('only judges the lifts that had enough sessions', () => {
        const logs = [
            ...progression('Back Squat', 100, 2.5, 12),
            ...progression('Barbell Row', 70, 2, 2),
        ]
        const s = strengthSummary(logs, ASOF)
        expect(s.judged).toBe(1)
        expect(s.lifts.find((l) => l.lift === 'row')!.status).toBe('insufficient-data')
    })
})
