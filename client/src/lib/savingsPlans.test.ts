import { describe, it, expect } from 'vitest'
import {
    computePlan,
    combinedMonthly,
    nextChange,
    finishMilestones,
    sortPlans,
    planStatus,
    isIncluded,
    type PlanInputs,
} from './savingsPlans'
import type { SavingsTarget } from '../types'

const base: PlanInputs = {
    mode: 'target',
    targetAmount: 1200,
    monthlyAmount: 0,
    startingBalance: 0,
    annualInterestRate: 0,
    startMonth: '2026-11',
    endMonth: '2027-10',
}

function plan(p: Partial<SavingsTarget>): SavingsTarget {
    return {
        _id: p.name ?? 'x',
        name: 'x',
        mode: 'target',
        targetAmount: 1000,
        startingBalance: 0,
        annualInterestRate: 0,
        startMonth: '2026-11',
        targetMonth: '2027-10',
        savedMonth: '2026-11',
        onTrack: false,
        requiredMonthly: 100,
        contributionMonths: 12,
        totalContributions: 1200,
        interestEarned: 0,
        growthOnly: 0,
        createdAt: '',
        updatedAt: '',
        ...p,
    }
}

describe('computePlan — reach a target', () => {
    it('splits the target evenly with no interest', () => {
        const r = computePlan(base, '2026-11')
        expect(r.contributionMonths).toBe(12)
        expect(r.monthly).toBeCloseTo(100)
        expect(r.totalContributions).toBeCloseTo(1200)
        expect(r.interestEarned).toBeCloseTo(0)
    })

    it('counts what you already have', () => {
        const r = computePlan({ ...base, startingBalance: 600 }, '2026-11')
        expect(r.monthly).toBeCloseTo(50)
    })

    it('asks less when interest helps', () => {
        const r = computePlan({ ...base, annualInterestRate: 5 }, '2026-11')
        expect(r.monthly).toBeLessThan(100)
        expect(r.totalContributions + r.interestEarned).toBeCloseTo(1200)
    })

    it('is on track when interest alone gets there', () => {
        const r = computePlan({ ...base, startingBalance: 1190, annualInterestRate: 5 }, '2026-11')
        expect(r.onTrack).toBe(true)
        expect(r.monthly).toBe(0)
        expect(r.finalBalance).toBeGreaterThanOrEqual(1200)
    })

    it('moves a past start up to this month', () => {
        const r = computePlan({ ...base, startMonth: '2026-01' }, '2026-11')
        expect(r.firstContribMonth).toBe('2026-11')
    })

    it('flags a past end date and an empty target', () => {
        expect(computePlan({ ...base, endMonth: '2026-10' }, '2026-11').error).toBeTruthy()
        expect(computePlan({ ...base, targetAmount: 0 }, '2026-11').error).toBeTruthy()
    })

    it('flags a start after the end', () => {
        expect(computePlan({ ...base, startMonth: '2027-12' }, '2026-11').error).toBeTruthy()
    })
})

describe('computePlan — save a set amount', () => {
    it('projects the pot from a fixed monthly amount', () => {
        const r = computePlan({ ...base, mode: 'contribution', monthlyAmount: 100, startingBalance: 50 }, '2026-11')
        expect(r.finalBalance).toBeCloseTo(1250)
        expect(r.monthly).toBe(100)
    })

    it('adds interest on top', () => {
        const r = computePlan({ ...base, mode: 'contribution', monthlyAmount: 100, annualInterestRate: 5 }, '2026-11')
        expect(r.finalBalance).toBeGreaterThan(1200)
        expect(r.interestEarned).toBeCloseTo(r.finalBalance - 1200)
    })
})

describe('combined plans', () => {
    const holiday = plan({ name: 'Holiday', requiredMonthly: 200, targetMonth: '2027-03' })
    const house = plan({ name: 'House', requiredMonthly: 300, startMonth: '2027-01', targetMonth: '2028-12' })

    it('adds up what overlapping plans need each month', () => {
        expect(combinedMonthly([holiday, house], '2026-11')).toBe(200)
        expect(combinedMonthly([holiday, house], '2027-02')).toBe(500)
        expect(combinedMonthly([holiday, house], '2027-04')).toBe(300)
    })

    it('ignores plans that are already on track', () => {
        expect(combinedMonthly([plan({ onTrack: true })], '2026-11')).toBe(0)
    })

    it('finds the next change and why', () => {
        const c = nextChange([holiday, house], '2026-11')
        expect(c).toMatchObject({ month: '2027-01', from: 200, to: 500 })
        expect(c?.starting.map((p) => p.name)).toEqual(['House'])
        const later = nextChange([holiday, house], '2027-02')
        expect(later).toMatchObject({ month: '2027-04', from: 500, to: 300 })
        expect(later?.ending.map((p) => p.name)).toEqual(['Holiday'])
    })

    it('returns null when nothing changes', () => {
        expect(nextChange([], '2026-11')).toBeNull()
    })

    it('lists finishes in order with the monthly amount after each', () => {
        const m = finishMilestones([house, holiday], '2026-11')
        expect(m.map((x) => x.plan.name)).toEqual(['Holiday', 'House'])
        expect(m[0].monthlyAfter).toBe(300)
        expect(m[1].monthlyAfter).toBe(0)
    })
})

describe('sorting and status', () => {
    it('puts priority first, then soonest finish', () => {
        const a = plan({ name: 'A', targetMonth: '2028-01' })
        const b = plan({ name: 'B', targetMonth: '2027-01' })
        const c = plan({ name: 'C', targetMonth: '2029-01', priority: true })
        expect(sortPlans([a, b, c]).map((p) => p.name)).toEqual(['C', 'B', 'A'])
    })

    it('describes where a plan is in time', () => {
        expect(planStatus(plan({ startMonth: '2027-02' }), '2026-11').text).toBe('Starts in 3 months')
        expect(planStatus(plan({ targetMonth: '2027-01' }), '2026-11')).toEqual({ text: '2 months to go', tone: 'soon' })
        expect(planStatus(plan({ targetMonth: '2026-11' }), '2026-11').text).toBe('Due this month')
        expect(planStatus(plan({ targetMonth: '2026-09' }), '2026-11').tone).toBe('done')
    })

    it('treats plans without the flag as included', () => {
        expect(isIncluded({})).toBe(true)
        expect(isIncluded({ included: false })).toBe(false)
    })
})
