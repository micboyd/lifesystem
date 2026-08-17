import { describe, it, expect } from 'vitest'
import {
    buildScorecard,
    monthEndDate,
    monthStartDate,
    overallScore,
    type ReviewInput,
} from './seasonReview'
import { EMPTY_SEASON_LINKS, type Course, type SavingsTarget, type Season } from '../types'

function season(startMonth = '2026-09', endMonth = '2026-11'): Season {
    return {
        _id: 's1',
        name: 'Cut & 10K',
        startMonth,
        endMonth,
        color: 'blue',
        intent: [],
        links: { ...EMPTY_SEASON_LINKS },
        order: 0,
    }
}

/** A scorecard input with everything empty, so each case adds only what it tests. */
function input(overrides: Partial<ReviewInput> = {}): ReviewInput {
    return {
        season: season(),
        today: '2026-12-01',
        fitnessEntries: [],
        workoutLogs: [],
        conditioningLogs: [],
        mealEntries: [],
        weightLogs: [],
        habitLogs: [],
        habitCount: 0,
        courses: [],
        savingsTargets: [],
        nutritionPhases: [],
        ...overrides,
    }
}

function scoreFor(key: string, over: Partial<ReviewInput> = {}) {
    const card = buildScorecard(input(over))
    const row = card.scores.find((s) => s.key === key)
    if (!row) throw new Error(`no score row for ${key}`)
    return row
}

describe('monthStartDate / monthEndDate', () => {
    it('bounds a 31-day month', () => {
        expect(monthStartDate('2026-01')).toBe('2026-01-01')
        expect(monthEndDate('2026-01')).toBe('2026-01-31')
    })

    it('bounds a 30-day month', () => {
        expect(monthEndDate('2026-09')).toBe('2026-09-30')
    })

    it('handles February in a non-leap year', () => {
        expect(monthEndDate('2026-02')).toBe('2026-02-28')
    })

    it('handles February in a leap year', () => {
        expect(monthEndDate('2028-02')).toBe('2028-02-29')
    })
})

describe('buildScorecard windowing', () => {
    it('spans the whole season and marks it complete once it is past', () => {
        const card = buildScorecard(input({ today: '2026-12-01' }))
        expect(card.startDate).toBe('2026-09-01')
        expect(card.endDate).toBe('2026-11-30')
        expect(card.totalDays).toBe(91)
        expect(card.elapsedDays).toBe(91)
        expect(card.complete).toBe(true)
    })

    it('scores an in-flight season only up to today', () => {
        const card = buildScorecard(input({ today: '2026-09-15' }))
        expect(card.elapsedDays).toBe(15)
        expect(card.totalDays).toBe(91)
        expect(card.complete).toBe(false)
    })

    it('treats a season that has not started as having no elapsed days', () => {
        const card = buildScorecard(input({ today: '2026-08-01' }))
        expect(card.elapsedDays).toBe(0)
        expect(card.complete).toBe(false)
    })
})

describe('training score', () => {
    it('counts logged sessions against planned hard sessions', () => {
        const row = scoreFor('training', {
            fitnessEntries: [
                { date: '2026-09-01', kind: 'workout' },
                { date: '2026-09-03', kind: 'conditioning' },
                { date: '2026-09-05', kind: 'workout' },
                { date: '2026-09-07', kind: 'workout' },
            ],
            workoutLogs: [{ date: '2026-09-01' }, { date: '2026-09-05' }],
            conditioningLogs: [{ date: '2026-09-03' }],
        })
        expect(row.score).toBe(75)
        expect(row.headline).toBe('3 of 4 planned sessions done')
    })

    it('leaves mobility and recovery out of the denominator', () => {
        const row = scoreFor('training', {
            fitnessEntries: [
                { date: '2026-09-01', kind: 'workout' },
                { date: '2026-09-02', kind: 'mobility' },
                { date: '2026-09-03', kind: 'recovery' },
            ],
            workoutLogs: [{ date: '2026-09-01' }],
        })
        expect(row.score).toBe(100)
    })

    it('ignores sessions outside the season window', () => {
        const row = scoreFor('training', {
            fitnessEntries: [
                { date: '2026-09-01', kind: 'workout' },
                { date: '2026-08-30', kind: 'workout' },
                { date: '2026-12-02', kind: 'workout' },
            ],
            workoutLogs: [{ date: '2026-09-01' }, { date: '2026-08-30' }],
        })
        expect(row.headline).toBe('1 of 1 planned sessions done')
    })

    it('does not exceed 100 when more was done than planned', () => {
        const row = scoreFor('training', {
            fitnessEntries: [{ date: '2026-09-01', kind: 'workout' }],
            workoutLogs: [{ date: '2026-09-01' }, { date: '2026-09-02' }, { date: '2026-09-03' }],
        })
        expect(row.score).toBe(100)
    })

    it('is unscored when nothing was planned', () => {
        expect(scoreFor('training').score).toBeNull()
        expect(scoreFor('training').headline).toBe('Nothing planned or logged')
    })

    it('says so when work was logged with no plan behind it', () => {
        const row = scoreFor('training', { workoutLogs: [{ date: '2026-09-01' }] })
        expect(row.score).toBeNull()
        expect(row.headline).toBe('1 sessions logged, none planned')
    })
})

describe('nutrition score', () => {
    it('scores meals eaten against meals planned', () => {
        const row = scoreFor('nutrition', {
            mealEntries: [
                { date: '2026-09-01', status: 'eaten' },
                { date: '2026-09-01', status: 'eaten' },
                { date: '2026-09-02', status: 'planned' },
                { date: '2026-09-02', status: 'skipped' },
            ],
        })
        expect(row.score).toBe(50)
        expect(row.headline).toBe('2 of 4 planned meals eaten')
    })

    it('is unscored when no meals were planned', () => {
        expect(scoreFor('nutrition').score).toBeNull()
        expect(scoreFor('nutrition').headline).toBe('No meals planned')
    })

    it('reports weight change against the phase target', () => {
        const row = scoreFor('nutrition', {
            weightLogs: [
                { date: '2026-09-01', weight: 90 },
                { date: '2026-09-29', weight: 88 },
            ],
            nutritionPhases: [
                {
                    _id: 'np1',
                    name: 'Cut',
                    startDate: '2026-09-01',
                    endDate: '2026-11-30',
                    kind: 'cut',
                    targets: {},
                    weeklyRate: -0.5,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        })
        // Four weeks at -0.5 kg/week is a -2.0 kg target, which is what happened.
        expect(row.detail).toBe('-2.0 kg against a -2.0 kg target')
    })

    it('reports bare weight change when the phase sets no rate', () => {
        const row = scoreFor('nutrition', {
            weightLogs: [
                { date: '2026-09-01', weight: 90 },
                { date: '2026-09-29', weight: 91.5 },
            ],
        })
        expect(row.detail).toBe('+1.5 kg over the season')
    })

    it('gives no weight detail from a single weigh-in', () => {
        const row = scoreFor('nutrition', { weightLogs: [{ date: '2026-09-01', weight: 90 }] })
        expect(row.detail).toBeUndefined()
    })
})

describe('money score', () => {
    function target(onTrack: boolean, name: string): SavingsTarget {
        return {
            _id: `st-${name}`,
            name,
            targetAmount: 5000,
            startingBalance: 0,
            annualInterestRate: 0,
            startMonth: '2026-09',
            targetMonth: '2026-12',
            savedMonth: '2026-09',
            onTrack,
            requiredMonthly: 250,
            contributionMonths: 4,
            totalContributions: 1000,
            interestEarned: 0,
            growthOnly: 0,
            createdAt: '',
            updatedAt: '',
        }
    }

    it('scores targets on track against targets linked', () => {
        const row = scoreFor('money', {
            savingsTargets: [target(true, 'a'), target(false, 'b')],
        })
        expect(row.score).toBe(50)
        expect(row.headline).toBe('1 of 2 targets on track')
        expect(row.detail).toBe('£500/mo committed')
    })

    it('is unscored with nothing linked', () => {
        expect(scoreFor('money').score).toBeNull()
    })
})

describe('study score', () => {
    function course(requiredHours: number, completedHours: number, name: string): Course {
        return {
            _id: `c-${name}`,
            name,
            kind: 'course',
            requiredHours,
            completedHours,
            order: 0,
            createdAt: '',
            updatedAt: '',
        }
    }

    it('pools hours across the season courses', () => {
        const row = scoreFor('study', {
            courses: [course(40, 30, 'a'), course(60, 20, 'b')],
        })
        expect(row.score).toBe(50)
        expect(row.headline).toBe('50 of 100 hours done')
    })

    it('is unscored when the courses set no target', () => {
        const row = scoreFor('study', { courses: [course(0, 12, 'a')] })
        expect(row.score).toBeNull()
        expect(row.headline).toBe('12h logged, no target set')
    })
})

describe('habits score', () => {
    it('scores ticks against the days available', () => {
        const row = scoreFor('habits', {
            today: '2026-09-10',
            habitCount: 2,
            habitLogs: Array.from({ length: 15 }, () => ({ date: '2026-09-01', completed: true })),
        })
        // Two habits over ten elapsed days is twenty available ticks.
        expect(row.score).toBe(75)
        expect(row.headline).toBe('15 of 20 habit days')
    })

    it('ignores unticked logs', () => {
        const row = scoreFor('habits', {
            today: '2026-09-01',
            habitCount: 1,
            habitLogs: [
                { date: '2026-09-01', completed: false },
            ],
        })
        expect(row.score).toBe(0)
    })

    it('is unscored when no habits are tracked', () => {
        expect(scoreFor('habits').score).toBeNull()
    })
})

describe('overallScore', () => {
    it('averages only the rows that could be scored', () => {
        const card = buildScorecard(
            input({
                fitnessEntries: [{ date: '2026-09-01', kind: 'workout' }],
                workoutLogs: [{ date: '2026-09-01' }],
                mealEntries: [
                    { date: '2026-09-01', status: 'eaten' },
                    { date: '2026-09-02', status: 'planned' },
                ],
            })
        )
        // Training 100, nutrition 50, everything else unscored.
        expect(overallScore(card)).toBe(75)
    })

    it('is null when nothing could be scored', () => {
        expect(overallScore(buildScorecard(input()))).toBeNull()
    })
})
