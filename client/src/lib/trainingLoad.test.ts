import { describe, it, expect } from 'vitest'
import {
    conditioningSummary,
    consistency,
    holdingUp,
    logVolume,
    muscleBalance,
    setVolume,
    UNTAGGED_GROUP,
    weeklyLoad,
    weekStreaks,
    weightDirection,
} from './trainingLoad'
import type { ConditioningLog, LoggedSet, WorkoutLog } from '../types'

function log(date: string, lines: { name: string; sets: LoggedSet[] }[]): WorkoutLog {
    return {
        _id: `${date}-${lines.length}`,
        workout: null,
        name: 'Session',
        date,
        exercises: lines.map((l) => ({ name: l.name, loggedSets: l.sets })),
        createdAt: '',
        updatedAt: '',
    } as WorkoutLog
}

function one(date: string, name = 'Squat', sets: LoggedSet[] = [{ weight: 100, reps: 5 }]) {
    return log(date, [{ name, sets }])
}

function conditioning(
    date: string,
    category: ConditioningLog['category'],
    duration: number,
    rpe?: number
): ConditioningLog {
    return {
        _id: `${date}-${category}`,
        session: null,
        name: category,
        category,
        date,
        duration,
        rpe,
        createdAt: '',
        updatedAt: '',
    } as ConditioningLog
}

describe('setVolume', () => {
    it('is weight × reps, and zero when either half is missing', () => {
        expect(setVolume({ weight: 60, reps: 8 })).toBe(480)
        expect(setVolume({ weight: 60 })).toBe(0)
        expect(setVolume({ reps: 8 })).toBe(0)
        expect(setVolume({ weight: 0, reps: 8 })).toBe(0)
    })
})

describe('logVolume', () => {
    it('adds up every set of every exercise', () => {
        const session = log('2026-08-01', [
            { name: 'Squat', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] },
            { name: 'Bench Press', sets: [{ weight: 60, reps: 8 }] },
        ])
        expect(logVolume(session)).toBe(1000 + 480)
    })
})

describe('weeklyLoad', () => {
    // 2026-08-26 is a Wednesday; its week starts Monday 2026-08-24.
    const today = '2026-08-26'

    it('returns empty weeks as zeroes rather than skipping them', () => {
        const weeks = weeklyLoad([one('2026-08-24'), one('2026-08-10')], 4, today)
        expect(weeks.map((w) => w.weekStart)).toEqual([
            '2026-08-03',
            '2026-08-10',
            '2026-08-17',
            '2026-08-24',
        ])
        expect(weeks.map((w) => w.sessions)).toEqual([0, 1, 0, 1])
    })

    it('sums volume and sets into the week a session lands in', () => {
        const weeks = weeklyLoad(
            [
                log('2026-08-25', [
                    { name: 'Squat', sets: [{ weight: 100, reps: 5 }, { weight: 100, reps: 5 }] },
                ]),
            ],
            2,
            today
        )
        expect(weeks[1]).toMatchObject({ sessions: 1, volumeKg: 1000, sets: 2 })
    })

    it('ignores sessions outside the requested span', () => {
        expect(weeklyLoad([one('2026-01-05')], 4, today).every((w) => w.sessions === 0)).toBe(true)
    })
})

describe('consistency', () => {
    const today = '2026-08-26'

    it('counts sessions inside the window and averages them per week', () => {
        const result = consistency([one('2026-08-20'), one('2026-08-24'), one('2026-07-01')], today, 28)
        expect(result.sessions).toBe(2)
        expect(result.perWeek).toBeCloseTo(0.5)
    })

    it('reports the last session even when it falls outside the window', () => {
        const result = consistency([one('2026-06-01')], today, 28)
        expect(result.sessions).toBe(0)
        expect(result.lastDate).toBe('2026-06-01')
        expect(result.daysSince).toBe(86)
    })

    it('has no last session when nothing has been logged', () => {
        expect(consistency([], today, 28).lastDate).toBeNull()
    })
})

describe('weekStreaks', () => {
    it('counts consecutive trained weeks back from this one', () => {
        const logs = [one('2026-08-24'), one('2026-08-17'), one('2026-08-10')]
        expect(weekStreaks(logs, '2026-08-26')).toEqual({ current: 3, longest: 3 })
    })

    it('does not break the run just because this week is still empty', () => {
        // Monday morning: nothing logged this week, three weeks behind it.
        const logs = [one('2026-08-17'), one('2026-08-10'), one('2026-08-03')]
        expect(weekStreaks(logs, '2026-08-24').current).toBe(3)
    })

    it('breaks the run on a missed week', () => {
        const logs = [one('2026-08-24'), one('2026-08-10'), one('2026-08-03')]
        expect(weekStreaks(logs, '2026-08-26')).toEqual({ current: 1, longest: 2 })
    })

    it('is all zeroes with nothing logged', () => {
        expect(weekStreaks([], '2026-08-26')).toEqual({ current: 0, longest: 0 })
    })
})

describe('muscleBalance', () => {
    const groups: Record<string, string> = { Squat: 'Quads', 'Bench Press': 'Chest' }
    const groupOf = (name: string) => groups[name]

    const logs = [
        log('2026-08-01', [
            { name: 'Squat', sets: [{ weight: 100, reps: 5 }] },
            { name: 'Bench Press', sets: [{ weight: 60, reps: 5 }] },
        ]),
        log('2026-08-08', [
            { name: 'Squat', sets: [{ weight: 100, reps: 5 }] },
            { name: 'Mystery Machine', sets: [{ weight: 40, reps: 10 }] },
        ]),
    ]

    it('ranks groups by volume and counts distinct days', () => {
        const balance = muscleBalance(logs, groupOf)
        // Quads 1000kg, the untagged machine 400kg, chest 300kg.
        expect(balance.map((g) => g.group)).toEqual(['Quads', UNTAGGED_GROUP, 'Chest'])
        expect(balance[0]).toMatchObject({ sessions: 2, sets: 2, volumeKg: 1000 })
    })

    it('keeps unresolvable exercises visible rather than dropping them', () => {
        const untagged = muscleBalance(logs, groupOf).find((g) => g.group === UNTAGGED_GROUP)
        expect(untagged?.volumeKg).toBe(400)
    })

    it('honours the since bound', () => {
        const balance = muscleBalance(logs, groupOf, '2026-08-05')
        expect(balance.find((g) => g.group === 'Chest')).toBeUndefined()
    })

    it('ignores exercises logged without weights', () => {
        const balance = muscleBalance(
            [log('2026-08-01', [{ name: 'Squat', sets: [{ reps: 5 }] }])],
            groupOf
        )
        expect(balance).toEqual([])
    })
})

describe('conditioningSummary', () => {
    const logs = [
        conditioning('2026-08-01', 'HIIT', 25, 8),
        conditioning('2026-08-05', 'Cardio', 45, 6),
        conditioning('2026-08-09', 'HIIT', 30),
    ]

    it('totals sessions and minutes and splits by category', () => {
        const summary = conditioningSummary(logs)
        expect(summary.sessions).toBe(3)
        expect(summary.minutes).toBe(100)
        expect(summary.byCategory[0]).toEqual({ category: 'HIIT', sessions: 2, minutes: 55 })
    })

    it('averages RPE over only the sessions that recorded one', () => {
        expect(conditioningSummary(logs).avgRpe).toBe(7)
    })

    it('has no average when nothing recorded an RPE', () => {
        expect(conditioningSummary([conditioning('2026-08-01', 'HIIT', 25)]).avgRpe).toBeNull()
    })

    it('honours the date bounds', () => {
        expect(conditioningSummary(logs, '2026-08-05').sessions).toBe(2)
        expect(conditioningSummary(logs, undefined, '2026-08-04').sessions).toBe(1)
    })

    it('reports the longest session', () => {
        expect(conditioningSummary(logs).longest?.duration).toBe(45)
    })
})

describe('weightDirection', () => {
    it('treats a change under three quarters of a kilo as flat', () => {
        expect(weightDirection(0.5)).toBe('flat')
        expect(weightDirection(-0.5)).toBe('flat')
    })

    it('reads clear movement in both directions', () => {
        expect(weightDirection(-1.4)).toBe('down')
        expect(weightDirection(2)).toBe('up')
    })

    it('has no direction without a trend', () => {
        expect(weightDirection(null)).toBe('unknown')
    })
})

describe('holdingUp', () => {
    it('calls a flat scale with rising lifts a recomposition', () => {
        const read = holdingUp('improving', 'flat')
        expect(read.headline).toBe('Recomposition')
        expect(read.tone).toBe('good')
    })

    it('treats strength held through weight loss as good news, not a stall', () => {
        expect(holdingUp('stable', 'down').tone).toBe('good')
    })

    it('flags strength falling on a cut', () => {
        expect(holdingUp('declining', 'down').tone).toBe('bad')
    })

    it('separates a strength drop on a steady weight from a food problem', () => {
        expect(holdingUp('declining', 'flat').detail).toMatch(/sleep and recovery/i)
    })

    it('says so plainly when the lifts cannot be judged', () => {
        expect(holdingUp('insufficient-data', 'down').tone).toBe('neutral')
    })

    it('still reads strength when there are no weigh-ins', () => {
        const read = holdingUp('improving', 'unknown')
        expect(read.tone).toBe('good')
        expect(read.detail).toMatch(/Body tab/)
    })
})
