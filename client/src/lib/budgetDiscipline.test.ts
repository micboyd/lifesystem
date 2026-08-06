import { describe, it, expect } from 'vitest'
import {
    dayDiscipline,
    summariseDiscipline,
    rowSpendSummary,
    spendSummary,
    remainingActiveDays,
    type MonthBudgetData,
} from './budgetDiscipline'
import { group, dailyRow, spend } from './__fixtures'

const g = group({ _id: 'g1' })
// £310 across a 31-day August = £10/day.
const row310 = dailyRow(310, { _id: 'r1' })

function monthData(spends: MonthBudgetData['spends'], excluded: string[] = []): MonthBudgetData {
    return { entries: [], spends, excluded: new Set(excluded) }
}

describe('dayDiscipline', () => {
    it('marks a day under budget', () => {
        const d = dayDiscipline('2026-08-01', [g], [row310], monthData([spend('2026-08-01', 4)]), '2026-08-31')
        expect(d.target).toBe(10)
        expect(d.spent).toBe(4)
        expect(d.status).toBe('under')
    })

    it('marks a day over budget', () => {
        const d = dayDiscipline('2026-08-01', [g], [row310], monthData([spend('2026-08-01', 15)]), '2026-08-31')
        expect(d.status).toBe('over')
    })

    it('skips an excluded day', () => {
        const d = dayDiscipline('2026-08-01', [g], [row310], monthData([], ['2026-08-01']), '2026-08-31')
        expect(d.status).toBe('skip')
    })

    it('marks a day after today as future', () => {
        const d = dayDiscipline('2026-08-20', [g], [row310], monthData([]), '2026-08-05')
        expect(d.status).toBe('future')
    })
})

describe('summariseDiscipline', () => {
    it('rolls a daily-only window into streaks and a score', () => {
        const spends = [
            spend('2026-08-01', 5), // under
            spend('2026-08-02', 12), // over — breaks the run
            spend('2026-08-03', 6), // under
            spend('2026-08-04', 8), // under
            spend('2026-08-05', 3), // under (today)
        ]
        const byMonth = new Map([['2026-08', monthData(spends)]])
        const s = summariseDiscipline('2026-08-01', '2026-08-05', [g], [row310], byMonth)

        expect(s.days).toHaveLength(5)
        expect(s.currentStreak).toBe(3) // Aug 03–05, stopped by the 02 overspend
        expect(s.bestStreak).toBe(3)
        expect(s.eligibleDays).toBe(5)
        expect(s.overDays).toBe(1)
        expect(s.score).toBe(80) // 1 of 5 days over
    })

    it('scores a clean window at 100', () => {
        const byMonth = new Map([['2026-08', monthData([spend('2026-08-01', 2), spend('2026-08-02', 3)])]])
        const s = summariseDiscipline('2026-08-01', '2026-08-02', [g], [row310], byMonth)
        expect(s.score).toBe(100)
        expect(s.overDays).toBe(0)
    })
})

describe('rowSpendSummary', () => {
    it("mirrors the daily row's remaining as today's safe-to-spend", () => {
        const r = rowSpendSummary(row310, undefined, [spend('2026-08-01', 4)], [], '2026-08-01', new Set())
        expect(r.today.spent).toBe(4)
        expect(r.today.safe).toBe(6) // £10 rate − £4 spent
        expect(r.today.allowance).toBe(10)
    })
})

describe('spendSummary', () => {
    const rowA = dailyRow(310, { _id: 'a' }) // £10/day
    const rowB = dailyRow(620, { _id: 'b' }) // £20/day

    it('pools safe-to-spend and monthly remaining across tracked rows', () => {
        const s = spendSummary([g], [rowA, rowB], monthData([]), '2026-08-01')
        expect(s.hasBudgets).toBe(true)
        expect(s.today.safe).toBe(30) // £10 + £20
        expect(s.monthlyRemaining).toBe(930) // £310 + £620
        expect(s.perRow).toHaveLength(2)
    })

    it('reports no budgets when nothing is tracked', () => {
        const s = spendSummary([g], [], monthData([]), '2026-08-01')
        expect(s.hasBudgets).toBe(false)
        expect(s.today.safe).toBe(0)
    })
})

describe('remainingActiveDays', () => {
    it('counts the non-excluded days left after today', () => {
        expect(remainingActiveDays('2026-08-05', new Set())).toBe(26) // Aug 06–31
        expect(remainingActiveDays('2026-08-05', new Set(['2026-08-10']))).toBe(25)
    })
})
