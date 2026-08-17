import { describe, it, expect } from 'vitest'
import {
    computeMonthLoads,
    findPressurePoints,
    levelForScore,
    peakMonth,
    OVERLOAD_THRESHOLD,
} from './lifeLoad'
import type { TimelineInput } from './lifeTimeline'
import type {
    Course,
    Goal,
    LifePlan,
    MonthNote,
    NutritionPhase,
    NutritionPhaseKind,
    SavingsTarget,
    TrainingPlan,
} from '../types'

/** A one-year plan, the window every case below is scored over. */
function plan(start = '2026-01', end = '2026-12'): LifePlan {
    return {
        _id: 'plan1',
        name: '2026',
        start,
        end,
        pillars: ['training', 'nutrition', 'money', 'study', 'life'],
        seasons: [],
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function trainingPlan(planStart: string, planEnd: string, name = 'Build'): TrainingPlan {
    return {
        _id: `tp-${name}`,
        name,
        planStart,
        planEnd,
        phases: [],
        weeklyTemplate: [],
        readinessRules: [],
        items: [],
        overrides: [],
        warnings: [],
        appliedEntries: 0,
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function phase(
    startDate: string,
    endDate: string,
    kind: NutritionPhaseKind = 'cut',
    name = 'Cut'
): NutritionPhase {
    return {
        _id: `np-${name}`,
        name,
        startDate,
        endDate,
        kind,
        targets: {},
        createdAt: '',
        updatedAt: '',
    }
}

function savings(startMonth: string, targetMonth: string, name = 'House'): SavingsTarget {
    return {
        _id: `st-${name}`,
        name,
        targetAmount: 10000,
        startingBalance: 0,
        annualInterestRate: 0,
        startMonth,
        targetMonth,
        savedMonth: startMonth,
        onTrack: true,
        requiredMonthly: 400,
        contributionMonths: 12,
        totalContributions: 4800,
        interestEarned: 0,
        growthOnly: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function course(targetDate: string, name = 'Exam'): Course {
    return {
        _id: `c-${name}`,
        name,
        kind: 'course',
        requiredHours: 40,
        completedHours: 10,
        order: 0,
        targetDate,
        createdAt: '',
        updatedAt: '',
    }
}

function flag(startMonth: string, endMonth: string, label = 'Portugal'): MonthNote {
    return {
        _id: `mn-${label}`,
        startMonth,
        endMonth,
        label,
        color: 'neutral',
        createdAt: '',
        updatedAt: '',
    }
}

function goal(targetDate: string, title = 'Sub-45 10K', status: Goal['status'] = 'active'): Goal {
    return {
        _id: `g-${title}`,
        title,
        targetDate,
        progress: 20,
        status,
        milestones: [],
        progressMode: 'manual',
        linkedHabits: [],
        createdAt: '',
        updatedAt: '',
    }
}

/** The load on one month of the default window. */
function loadFor(month: string, input: Omit<TimelineInput, 'plan'>) {
    const loads = computeMonthLoads({ plan: plan(), ...input })
    const found = loads.find((l) => l.month === month)
    if (!found) throw new Error(`no load computed for ${month}`)
    return found
}

describe('levelForScore', () => {
    it('maps scores onto the quiet → overloaded scale', () => {
        expect(levelForScore(0)).toBe('quiet')
        expect(levelForScore(1)).toBe('quiet')
        expect(levelForScore(2)).toBe('steady')
        expect(levelForScore(3)).toBe('steady')
        expect(levelForScore(4)).toBe('busy')
        expect(levelForScore(5)).toBe('busy')
        expect(levelForScore(OVERLOAD_THRESHOLD)).toBe('overloaded')
        expect(levelForScore(20)).toBe('overloaded')
    })
})

describe('computeMonthLoads', () => {
    it('covers every month of the plan window, in order', () => {
        const loads = computeMonthLoads({ plan: plan('2026-03', '2026-06') })
        expect(loads.map((l) => l.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
    })

    it('scores an empty month as quiet with nothing in it', () => {
        const load = loadFor('2026-05', {})
        expect(load.score).toBe(0)
        expect(load.level).toBe('quiet')
        expect(load.contributors).toEqual([])
    })

    it('counts a training block in every month it spans, not just its first', () => {
        const input = { trainingPlans: [trainingPlan('2026-04-06', '2026-06-14')] }
        expect(loadFor('2026-04', input).score).toBe(2)
        expect(loadFor('2026-05', input).score).toBe(2)
        expect(loadFor('2026-06', input).score).toBe(2)
        expect(loadFor('2026-07', input).score).toBe(0)
    })

    it('weighs a cut heavily, a gain lightly, and a maintain not at all', () => {
        expect(loadFor('2026-05', { nutritionPhases: [phase('2026-05-01', '2026-05-31', 'cut')] }).score).toBe(2)
        expect(loadFor('2026-05', { nutritionPhases: [phase('2026-05-01', '2026-05-31', 'gain')] }).score).toBe(1)
        expect(loadFor('2026-05', { nutritionPhases: [phase('2026-05-01', '2026-05-31', 'maintain')] }).score).toBe(0)
    })

    it('still lists a maintain phase, so the month reads completely', () => {
        const load = loadFor('2026-05', {
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'maintain', 'Off-season')],
        })
        expect(load.contributors).toHaveLength(1)
        expect(load.contributors[0].label).toBe('Off-season')
        expect(load.contributors[0].weight).toBe(0)
    })

    it('counts a deadline only in the month it lands', () => {
        const input = { courses: [course('2026-09-18')] }
        expect(loadFor('2026-08', input).score).toBe(0)
        expect(loadFor('2026-09', input).score).toBe(2)
        expect(loadFor('2026-10', input).score).toBe(0)
    })

    it('ignores goals that are done or abandoned', () => {
        expect(loadFor('2026-09', { goals: [goal('2026-09-30')] }).score).toBe(1)
        expect(loadFor('2026-09', { goals: [goal('2026-09-30', 'Done', 'completed')] }).score).toBe(0)
        expect(loadFor('2026-09', { goals: [goal('2026-09-30', 'Gone', 'abandoned')] }).score).toBe(0)
    })

    it('ignores a course with no deadline — it has no month to land in', () => {
        const undated: Course = { ...course('2026-09-18'), targetDate: undefined }
        expect(loadFor('2026-09', { courses: [undated] }).score).toBe(0)
    })

    it('adds up a genuine pile-up and calls it overloaded', () => {
        // A 10K build, an aggressive cut, a savings target and a holiday, all in October.
        const load = loadFor('2026-10', {
            trainingPlans: [trainingPlan('2026-09-01', '2026-11-30', '10K build')],
            nutritionPhases: [phase('2026-09-15', '2026-11-15', 'cut', 'Autumn cut')],
            savingsTargets: [savings('2026-01', '2026-12')],
            monthNotes: [flag('2026-10', '2026-10')],
        })
        expect(load.score).toBe(6)
        expect(load.level).toBe('overloaded')
        expect(load.contributors.map((c) => c.label)).toEqual([
            '10K build',
            'Autumn cut',
            'House',
            'Portugal',
        ])
    })

    it('lists the heaviest commitment first', () => {
        const load = loadFor('2026-10', {
            monthNotes: [flag('2026-10', '2026-10')],
            trainingPlans: [trainingPlan('2026-10-01', '2026-10-31', 'Build')],
        })
        expect(load.contributors[0].weight).toBeGreaterThan(load.contributors[1].weight)
    })

    it('reads a range as inclusive at both ends', () => {
        const input = { savingsTargets: [savings('2026-04', '2026-05')] }
        expect(loadFor('2026-03', input).score).toBe(0)
        expect(loadFor('2026-04', input).score).toBe(1)
        expect(loadFor('2026-05', input).score).toBe(1)
        expect(loadFor('2026-06', input).score).toBe(0)
    })
})

describe('findPressurePoints', () => {
    it('returns only the months that tipped over', () => {
        const loads = computeMonthLoads({
            plan: plan(),
            trainingPlans: [trainingPlan('2026-09-01', '2026-11-30', '10K build')],
            nutritionPhases: [phase('2026-09-15', '2026-11-15', 'cut', 'Autumn cut')],
            savingsTargets: [savings('2026-01', '2026-12')],
            monthNotes: [flag('2026-10', '2026-10')],
        })
        expect(findPressurePoints(loads).map((l) => l.month)).toEqual(['2026-10'])
    })

    it('does not flag one heavy commitment on its own — that is a decision, not a collision', () => {
        const loads = [
            {
                month: '2026-05',
                score: 8,
                level: 'overloaded' as const,
                contributors: [
                    {
                        source: 'trainingPlan' as const,
                        recordId: 'x',
                        label: 'Camp',
                        pillar: 'training' as const,
                        weight: 8,
                    },
                ],
            },
        ]
        expect(findPressurePoints(loads)).toEqual([])
    })

    it('ignores zero-weight commitments when counting what collided', () => {
        const loads = [
            {
                month: '2026-05',
                score: 6,
                level: 'overloaded' as const,
                contributors: [
                    {
                        source: 'trainingPlan' as const,
                        recordId: 'x',
                        label: 'Camp',
                        pillar: 'training' as const,
                        weight: 6,
                    },
                    {
                        source: 'nutritionPhase' as const,
                        recordId: 'y',
                        label: 'Maintain',
                        pillar: 'nutrition' as const,
                        weight: 0,
                    },
                ],
            },
        ]
        expect(findPressurePoints(loads)).toEqual([])
    })
})

describe('peakMonth', () => {
    it('finds the heaviest month', () => {
        const loads = computeMonthLoads({
            plan: plan(),
            trainingPlans: [trainingPlan('2026-02-01', '2026-03-31')],
            nutritionPhases: [phase('2026-03-01', '2026-03-31')],
        })
        expect(peakMonth(loads)?.month).toBe('2026-03')
    })

    it('is undefined for an empty window', () => {
        expect(peakMonth([])).toBeUndefined()
    })
})
