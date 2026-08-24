import { describe, it, expect } from 'vitest'
import { MAX_SHIFT, describeRelief, findRelief } from './lifeRelief'
import { computeMonthLoads, type LoadInput } from './lifeLoad'
import type { Course, LifePlan, NutritionPhase, SavingsTarget, TrainingPlan } from '../types'

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

/** A five-hard-session week — enough on its own to fill most of the body reserve. */
function trainingPlan(planStart: string, planEnd: string, name = 'Build'): TrainingPlan {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return {
        _id: `tp-${name}`,
        name,
        planStart,
        planEnd,
        phases: [],
        weeklyTemplate: days.map((day, i) => ({
            day,
            strength: i < 3 ? 'Upper A' : '',
            conditioning: i >= 3 && i < 5 ? 'Intervals' : 'Rest',
        })),
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

/**
 * A deep cut — deep enough to take the ceiling below a five-session week.
 * An ordinary −0.5 kg/wk cut alongside a block is not an overload and has
 * nothing for `findRelief` to say about it, which is the point of the model.
 */
function phase(startDate: string, endDate: string, name = 'Cut', weeklyRate = -1.2): NutritionPhase {
    return {
        _id: `np-${name}`,
        name,
        startDate,
        endDate,
        kind: 'cut',
        targets: {},
        weeklyRate,
        createdAt: '',
        updatedAt: '',
    }
}

function savings(
    startMonth: string,
    targetMonth: string,
    name = 'House',
    requiredMonthly = 400
): SavingsTarget {
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
        requiredMonthly,
        contributionMonths: 12,
        totalContributions: 4800,
        interestEarned: 0,
        growthOnly: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function course(targetDate: string, name = 'Exam', required = 90, completed = 0): Course {
    return {
        _id: `c-${name}`,
        name,
        kind: 'course',
        requiredHours: required,
        completedHours: completed,
        order: 0,
        targetDate,
        createdAt: '',
        updatedAt: '',
    }
}

/** Relief for one month of an input, with the baseline computed alongside. */
function reliefFor(month: string, input: Omit<LoadInput, 'plan'>, limit?: number) {
    const full: LoadInput = { plan: plan(), ...input }
    return findRelief(full, computeMonthLoads(full), month, limit)
}

describe('findRelief', () => {
    it('has nothing to say about a month that is not over anything', () => {
        expect(reliefFor('2026-05', { savingsTargets: [savings('2026-01', '2026-12')] })).toEqual([])
    })

    it('has nothing to say about an ordinary cut under an ordinary block', () => {
        expect(
            reliefFor('2026-05', {
                trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', '10K build')],
                nutritionPhases: [phase('2026-05-01', '2026-05-31', 'Autumn cut', -0.5)],
            })
        ).toEqual([])
    })

    it('has nothing to say about a month outside the window', () => {
        expect(reliefFor('2027-05', {})).toEqual([])
    })

    it('names the commitment to move and where it should go', () => {
        // A crash cut and a build block share May: five hard sessions against a
        // ceiling the deficit has pulled down to about 4.4.
        const input = {
            trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', '10K build')],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'Autumn cut')],
        }
        const relief = reliefFor('2026-05', input)
        expect(relief.length).toBeGreaterThan(0)

        const best = relief[0]
        expect(best.reserve).toBe('body')
        expect(best.before).toBeGreaterThan(1)
        expect(best.after).toBeLessThan(1)
        expect(Math.abs(best.shift)).toBe(1)
        expect(best.clean).toBe(true)
    })

    it('rescores the whole window, so a move that only relocates the problem is marked', () => {
        // June is already carrying the build; moving the cut into it would land the
        // same pile-up one month later.
        const input = {
            trainingPlans: [trainingPlan('2026-05-01', '2026-06-30', '10K build')],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'Autumn cut')],
        }
        const relief = reliefFor('2026-05', input)
        const forward = relief.find((r) => r.contributorId.startsWith('nutritionPhase') && r.shift === 1)
        // Either it isn't offered at all, or it's offered with the warning attached.
        expect(forward?.clean ?? false).toBe(false)
        // The suggestion that wins is one that leaves the window clean.
        expect(relief[0].clean).toBe(true)
    })

    it('never suggests a move that makes the month worse', () => {
        const input = {
            trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', '10K build')],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'Autumn cut')],
        }
        for (const relief of reliefFor('2026-05', input)) {
            expect(relief.after).toBeLessThan(relief.before)
        }
    })

    it('offers one move per commitment, not every move that would work', () => {
        const input = {
            trainingPlans: [trainingPlan('2026-06-01', '2026-06-30', '10K build')],
            nutritionPhases: [phase('2026-06-01', '2026-06-30', 'Autumn cut')],
        }
        const relief = reliefFor('2026-06', input)
        const ids = relief.map((r) => r.contributorId)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('relieves money by moving what is committed, when there is somewhere to move it', () => {
        const input = {
            savingsTargets: [
                savings('2026-05', '2026-05', 'Car', 600),
                savings('2026-01', '2026-12', 'House', 400),
            ],
            freeCash: { '2026-05': 700, '2026-06': 1500, '2026-07': 1500 },
        }
        const relief = reliefFor('2026-05', input)
        expect(relief[0].reserve).toBe('money')
        expect(relief[0].label).toBe('Car')
        expect(relief[0].after).toBeLessThan(1)
    })

    it('caps how far it will look', () => {
        // A course far too big for its window: no shift inside the cap fixes it,
        // because the hours only compress further as the deadline nears.
        const input = { courses: [course('2026-02-28', 'Exam', 400, 0)] }
        const relief = reliefFor('2026-01', input)
        for (const r of relief) expect(Math.abs(r.shift)).toBeLessThanOrEqual(MAX_SHIFT)
    })

    it('respects the limit it is given', () => {
        const input = {
            trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', '10K build')],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'Autumn cut')],
            courses: [course('2026-05-31')],
        }
        expect(reliefFor('2026-05', input, 1)).toHaveLength(1)
    })
})

describe('describeRelief', () => {
    it('reads as a sentence', () => {
        const base = {
            month: '2026-10',
            reserve: 'body' as const,
            source: 'course' as const,
            recordId: 'c1',
            contributorId: 'course:c1',
            label: 'Exam',
            before: 1.2,
            after: 0.9,
            clean: true,
        }
        expect(describeRelief({ ...base, shift: 1 })).toBe('Move Exam back a month')
        expect(describeRelief({ ...base, shift: -2 })).toBe('Move Exam forward 2 months')
    })
})
