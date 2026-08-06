import { describe, it, expect } from 'vitest'
import {
    monthOf,
    dayNumOf,
    daysInMonth,
    weekStartOf,
    weekEndOf,
    clampedWeekRange,
    activeDaysInMonth,
    activeDaysBetween,
    budgetAdjustments,
    netBudgetAdjustment,
    refillTotal,
    computeBudgetDay,
    computeBudgetWeek,
    computeExclusionPot,
} from './budget'
import { dailyRow, entry, spend, topUp, exclusionBudget } from './__fixtures'

describe('date helpers', () => {
    it('slices month and day out of a date key', () => {
        expect(monthOf('2026-08-15')).toBe('2026-08')
        expect(dayNumOf('2026-08-05')).toBe(5)
    })

    it('counts days in a month, including leap February', () => {
        expect(daysInMonth('2026-01')).toBe(31)
        expect(daysInMonth('2026-02')).toBe(28)
        expect(daysInMonth('2024-02')).toBe(29)
        expect(daysInMonth('2026-04')).toBe(30)
    })
})

describe('week boundaries', () => {
    // 2026-08-05 is a Wednesday; its ISO week runs Mon 03 → Sun 09.
    it('finds the ISO Monday and Sunday around a midweek date', () => {
        expect(weekStartOf('2026-08-05')).toBe('2026-08-03')
        expect(weekEndOf('2026-08-05')).toBe('2026-08-09')
    })

    it('keeps a Sunday in the week that is ending, not the next one', () => {
        expect(weekStartOf('2026-08-09')).toBe('2026-08-03')
        expect(weekEndOf('2026-08-09')).toBe('2026-08-09')
    })

    it('clamps a month-straddling week to the month start', () => {
        // Sat 2026-08-01 sits in the ISO week Mon 07-27 → Sun 08-02.
        expect(clampedWeekRange('2026-08-01')).toEqual({
            month: '2026-08',
            weekStart: '2026-08-01',
            weekEnd: '2026-08-02',
        })
    })

    it('reduces a month-end stub to a single day', () => {
        // Mon 2026-08-31 starts an ISO week that spills into September.
        expect(clampedWeekRange('2026-08-31')).toEqual({
            month: '2026-08',
            weekStart: '2026-08-31',
            weekEnd: '2026-08-31',
        })
    })
})

describe('active-day counting', () => {
    it('counts every day when nothing is excluded', () => {
        expect(activeDaysInMonth('2026-08', new Set())).toBe(31)
    })

    it('drops excluded days from the count', () => {
        expect(activeDaysInMonth('2026-08', new Set(['2026-08-10', '2026-08-11']))).toBe(29)
    })

    it('counts an inclusive date range minus exclusions', () => {
        expect(activeDaysBetween('2026-08-01', '2026-08-07', new Set())).toBe(7)
        expect(activeDaysBetween('2026-08-01', '2026-08-07', new Set(['2026-08-03']))).toBe(6)
    })
})

describe('budget adjustments', () => {
    const ups = [
        topUp('2026-08-05', 50, 'topup'),
        topUp('2026-08-06', 20, 'withdrawal'),
        topUp('2026-08-07', 30, 'refill'),
        topUp('2026-08-08', 10, undefined), // legacy record = topup
    ]

    it('signs withdrawals negative and excludes refills', () => {
        expect(budgetAdjustments(ups)).toEqual([
            { date: '2026-08-05', amount: 50 },
            { date: '2026-08-06', amount: -20 },
            { date: '2026-08-08', amount: 10 },
        ])
    })

    it('nets top-ups against withdrawals, ignoring refills', () => {
        expect(netBudgetAdjustment(ups)).toBe(40)
    })

    it('totals only refills separately', () => {
        expect(refillTotal(ups)).toBe(30)
    })
})

describe('computeBudgetDay', () => {
    // £310 across a 31-day August = a clean £10/day straight rate.
    const row310 = dailyRow(310)

    it('splits the monthly amount into an even daily rate', () => {
        const d = computeBudgetDay(row310, undefined, [], '2026-08-01')
        expect(d.straightDailyRate).toBe(10)
        expect(d.carry).toBe(0)
        expect(d.remaining).toBe(10)
        expect(d.monthlyRemaining).toBe(310)
    })

    it('subtracts the same-day spend from the day and the month', () => {
        const d = computeBudgetDay(row310, undefined, [spend('2026-08-01', 4)], '2026-08-01')
        expect(d.spentToday).toBe(4)
        expect(d.remaining).toBe(6)
        expect(d.monthlyRemaining).toBe(306)
    })

    it('carries yesterday underspend into today', () => {
        const d = computeBudgetDay(row310, undefined, [spend('2026-08-01', 4)], '2026-08-02')
        expect(d.carry).toBe(6) // £10 allowed − £4 spent
        expect(d.remaining).toBe(16) // today's £10 + £6 carry
    })

    it('carries the full month budget into the last day when nothing is spent', () => {
        const d = computeBudgetDay(row310, undefined, [], '2026-08-31')
        expect(d.remaining).toBe(310)
    })

    it('uses an entry override in place of the recurring amount', () => {
        const d = computeBudgetDay(row310, entry({ amount: 620 }), [], '2026-08-01')
        expect(d.monthlyAmount).toBe(620)
        expect(d.straightDailyRate).toBe(20)
    })

    it('spreads over active days only, ignoring excluded-day spend', () => {
        const excluded = new Set(['2026-08-31']) // 30 active days → £300/30 = £10
        const row300 = dailyRow(300)
        const d = computeBudgetDay(
            row300,
            undefined,
            [spend('2026-08-31', 999)],
            '2026-08-01',
            excluded
        )
        expect(d.straightDailyRate).toBe(10)
        expect(d.monthlyRemaining).toBe(300) // excluded-day spend never counts
    })

    it('gives an excluded day no allowance of its own', () => {
        const excluded = new Set(['2026-08-15'])
        const d = computeBudgetDay(row310, undefined, [], '2026-08-15', excluded)
        expect(d.straightDailyRate).toBe(0)
        expect(d.carry).toBe(0)
        expect(d.remaining).toBe(0)
    })

    it('applies a top-up only from its own date forward', () => {
        const ups = [topUp('2026-08-10', 50)]
        const before = computeBudgetDay(row310, undefined, [], '2026-08-05', new Set(), ups)
        const after = computeBudgetDay(row310, undefined, [], '2026-08-10', new Set(), ups)
        expect(before.carry).toBe(40) // 4 prior days × £10, top-up not yet in the daily carry
        expect(after.carry).toBe(140) // 9 prior days × £10 + £50 top-up
        // The month figure reflects the top-up regardless of the date being viewed.
        expect(before.monthlyRemaining).toBe(360)
    })
})

describe('computeBudgetWeek', () => {
    const row310 = dailyRow(310) // £10/day in August

    it('sizes the weekly rate by active days and carries prior weeks', () => {
        // Week Mon 03 → Sun 09, viewed on the 09th, with Aug 01–02 as the prior slice.
        const w = computeBudgetWeek(row310, undefined, [], '2026-08-03', '2026-08-09', '2026-08-09')
        expect(w.weeklyRate).toBe(70) // 7 active days × £10
        expect(w.carry).toBe(20) // Aug 01–02 unspent = 2 × £10
        expect(w.remaining).toBe(90)
        expect(w.monthlyRemaining).toBe(310)
    })

    it('subtracts in-week spend up to today', () => {
        const w = computeBudgetWeek(
            row310,
            undefined,
            [spend('2026-08-05', 5)],
            '2026-08-03',
            '2026-08-09',
            '2026-08-09'
        )
        expect(w.spentThisWeek).toBe(5)
        expect(w.remaining).toBe(85) // 70 + 20 carry − 5
    })
})

describe('computeExclusionPot', () => {
    const group = exclusionBudget({ dates: ['2026-08-10', '2026-08-11'], amount: 100 })

    it('pools spend across the pot days and ignores off-pot spend', () => {
        const pot = computeExclusionPot(group, [
            spend('2026-08-10', 30),
            spend('2026-08-11', 20),
            spend('2026-08-05', 999), // outside the pot's dates
        ])
        expect(pot.guideRate).toBe(50) // £100 / 2 days
        expect(pot.spent).toBe(50)
        expect(pot.remaining).toBe(50)
    })

    it('reports a zero guide rate when the pot has no days', () => {
        expect(computeExclusionPot(exclusionBudget({ amount: 100 }), []).guideRate).toBe(0)
    })
})
