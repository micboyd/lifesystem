import { addMonths } from './finance'
import type { SavingsTarget } from '../types'

/**
 * Savings target planner engine — pure maths, no React.
 *
 * Conventions (same as the Projection tab): interest compounds monthly from
 * `now` on the whole balance; contributions land at month-end from the first
 * saving month through the end month inclusive. All months are "YYYY-MM".
 */

export type PlanMode = 'target' | 'contribution'

export interface PlanInputs {
    mode: PlanMode
    /** Target pot (target mode). */
    targetAmount: number
    /** Fixed monthly amount (contribution mode). */
    monthlyAmount: number
    startingBalance: number
    annualInterestRate: number
    startMonth: string
    endMonth: string
}

export interface PlanResult {
    error?: string
    /** Interest on what you already have gets there with no saving. */
    onTrack: boolean
    /** Target mode: the monthly ask. Contribution mode: the fixed amount. */
    monthly: number
    /** Target mode: the target. Contribution mode: the projected pot. */
    finalBalance: number
    contributionMonths: number
    firstContribMonth: string
    /** The starting balance with interest only, no saving. */
    growthOnly: number
    totalContributions: number
    interestEarned: number
}

/** Whole months from `from` to `to`; negative when `to` is earlier. */
export function monthsUntil(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return (ty - fy) * 12 + (tm - fm)
}

export function computePlan(input: PlanInputs, now: string): PlanResult {
    const balance = Math.max(0, input.startingBalance)
    const firstContrib = input.startMonth < now ? now : input.startMonth
    const empty: PlanResult = {
        onTrack: false,
        monthly: 0,
        finalBalance: balance,
        contributionMonths: 0,
        firstContribMonth: firstContrib,
        growthOnly: balance,
        totalContributions: 0,
        interestEarned: 0,
    }
    const isTarget = input.mode === 'target'
    if (input.endMonth < now) return { ...empty, error: 'The end date is in the past.' }
    if (isTarget && input.targetAmount <= 0) return { ...empty, error: 'Set a target amount to plan towards.' }
    if (!isTarget && input.monthlyAmount <= 0) return { ...empty, error: 'Set a monthly amount to project with.' }

    const r = Math.max(0, input.annualInterestRate) / 100 / 12
    let growthOnly = balance
    let factor = 0 // what £1 a month in the window grows to by the end
    let months = 0
    for (let m = now; m <= input.endMonth; m = addMonths(m, 1)) {
        growthOnly *= 1 + r
        factor *= 1 + r
        if (m >= firstContrib) {
            factor += 1
            months++
        }
    }

    if (isTarget && growthOnly >= input.targetAmount) {
        return {
            ...empty,
            onTrack: true,
            finalBalance: growthOnly,
            growthOnly,
            interestEarned: growthOnly - balance,
        }
    }
    if (months === 0) {
        return { ...empty, growthOnly, error: 'The start is after the end, so there are no months to save in.' }
    }

    const monthly = isTarget ? (input.targetAmount - growthOnly) / factor : input.monthlyAmount
    const finalBalance = isTarget ? input.targetAmount : growthOnly + monthly * factor
    const totalContributions = monthly * months
    return {
        onTrack: false,
        monthly,
        finalBalance,
        contributionMonths: months,
        firstContribMonth: firstContrib,
        growthOnly,
        totalContributions,
        interestEarned: Math.max(0, finalBalance - balance - totalContributions),
    }
}

/** Saved plans without the flag count — the flag only exists once switched off. */
export function isIncluded(plan: Pick<SavingsTarget, 'included'>): boolean {
    return plan.included !== false
}

/** What a plan asks you to put away in a month — £0 outside its window. */
export function planMonthlyFor(plan: SavingsTarget, m: string): number {
    if (plan.onTrack) return 0
    return m >= plan.startMonth && m <= plan.targetMonth ? plan.requiredMonthly : 0
}

export function combinedMonthly(plans: SavingsTarget[], m: string): number {
    return plans.reduce((s, p) => s + planMonthlyFor(p, m), 0)
}

/** The next month (after `now`) where the combined monthly amount changes. */
export function nextChange(
    plans: SavingsTarget[],
    now: string
): { month: string; from: number; to: number; ending: SavingsTarget[]; starting: SavingsTarget[] } | null {
    const edges = new Set<string>()
    for (const p of plans) {
        if (p.onTrack || p.requiredMonthly <= 0) continue
        if (p.startMonth > now) edges.add(p.startMonth)
        if (p.targetMonth >= now) edges.add(addMonths(p.targetMonth, 1))
    }
    const from = combinedMonthly(plans, now)
    for (const m of [...edges].sort()) {
        const to = combinedMonthly(plans, m)
        if (Math.abs(to - from) < 0.005) continue
        return {
            month: m,
            from,
            to,
            ending: plans.filter((p) => !p.onTrack && addMonths(p.targetMonth, 1) === m),
            starting: plans.filter((p) => !p.onTrack && p.startMonth === m),
        }
    }
    return null
}

export interface PlanMilestone {
    plan: SavingsTarget
    month: string
    monthsAway: number
    /** Combined monthly saving the month after this plan finishes. */
    monthlyAfter: number
}

/** Plans in finishing order, with what monthly saving drops to afterwards. */
export function finishMilestones(plans: SavingsTarget[], now: string): PlanMilestone[] {
    return [...plans]
        .sort((a, b) => (a.targetMonth < b.targetMonth ? -1 : a.targetMonth > b.targetMonth ? 1 : 0))
        .map((plan) => ({
            plan,
            month: plan.targetMonth,
            monthsAway: monthsUntil(now, plan.targetMonth),
            monthlyAfter: combinedMonthly(plans, addMonths(plan.targetMonth, 1)),
        }))
}

/** Priority first, then soonest finish, then name. */
export function sortPlans(plans: SavingsTarget[]): SavingsTarget[] {
    return [...plans].sort((a, b) => {
        if (!!a.priority !== !!b.priority) return a.priority ? -1 : 1
        if (a.targetMonth !== b.targetMonth) return a.targetMonth < b.targetMonth ? -1 : 1
        return a.name.localeCompare(b.name)
    })
}

/** Where a plan is in time, for its one-line status. */
export function planStatus(plan: SavingsTarget, now: string): { text: string; tone: 'muted' | 'soon' | 'late' | 'done' } {
    const untilStart = monthsUntil(now, plan.startMonth)
    const untilEnd = monthsUntil(now, plan.targetMonth)
    const mo = (n: number) => (Math.abs(n) === 1 ? 'month' : 'months')
    if (untilEnd < 0) return { text: `Finished ${-untilEnd} ${mo(untilEnd)} ago`, tone: 'done' }
    if (untilStart > 0) return { text: `Starts in ${untilStart} ${mo(untilStart)}`, tone: 'muted' }
    if (untilEnd === 0) return { text: 'Due this month', tone: 'soon' }
    return { text: `${untilEnd} ${mo(untilEnd)} to go`, tone: untilEnd <= 3 ? 'soon' : 'muted' }
}
