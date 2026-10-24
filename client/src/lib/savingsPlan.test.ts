import { describe, it, expect } from 'vitest'
import { buildMonthStatement } from './monthStatement'
import { buildMonthAhead } from './monthAhead'
import { buildSavingsPlan, goalPresets } from './savingsPlan'
import type { Copy } from './statementInsights'
import type { StarlingSpendItem } from '../types'

let n = 0
function tx(date: string, amount: number, merchant: string, category: string, hhmm = '12:00'): StarlingSpendItem {
    n++
    return { id: `t${n}`, date, time: `${date}T${hhmm}:00`, amount, merchant, category, space: 'Main account' }
}
const plain = (c: Copy) => c.map((p) => (typeof p === 'string' ? p : `£${p.money}`)).join('')
const day = (d: number) => `2026-10-${String(d).padStart(2, '0')}`

// October: rent and a bill, groceries, a lot of eating out, some shopping, a bet, a 2am takeaway, two subscriptions.
const october = [
    tx(day(1), 1200, 'Landlord', 'PAYMENTS'),
    tx(day(5), 45, 'EE', 'BILLS_AND_SERVICES'),
    ...[2, 9, 16, 23, 30].map((d) => tx(day(d), 60, 'Tesco', 'GROCERIES')),
    ...[3, 10, 17, 24].map((d) => tx(day(d), 60, 'Dishoom', 'EATING_OUT', '20:00')),
    tx(day(12), 120, 'Zara', 'SHOPPING'),
    tx(day(14), 20, 'Bet365', 'GAMBLING'),
    tx(day(25), 28.5, 'Uber Eats', 'EATING_OUT', '02:14'),
    tx(day(3), 10.99, 'Netflix', 'ENTERTAINMENT'),
    tx(day(9), 11.99, 'Spotify', 'ENTERTAINMENT'),
]

function plan(goal: number, income: number | null = 3000) {
    const s = buildMonthStatement('2026-11', october, october, '2026-11-01')
    const a = buildMonthAhead(s, october)
    return buildSavingsPlan({
        last: a.last,
        lastDoh: a.lastDoh,
        goal,
        lastName: 'October',
        prevDayToDay: a.prevDayToDay,
        bills: a.billsTotal,
        spentDayToDay: a.spentDayToDay,
        daysLeft: a.daysLeft,
        income,
    })
}

describe('buildSavingsPlan', () => {
    it('skips the doh first, then subscriptions, then trims the biggest treats', () => {
        const kinds = plan(1000).levers.map((l) => l.kind)
        expect(kinds.indexOf('skip')).toBe(0)
        expect(kinds.lastIndexOf('skip')).toBeLessThan(kinds.indexOf('drop'))
        expect(kinds.indexOf('drop')).toBeLessThan(kinds.indexOf('trim'))
    })

    it('trims net of doh, so the 2am takeaway is not counted twice', () => {
        const eating = plan(1000).levers.find((l) => l.id === 'trim-EATING_OUT')!
        // £240 of Dishoom (the £28.50 2am order is already under doh), a quarter off.
        expect(plain(eating.title)).toBe('Eating out: £240 → £180')
        expect(eating.amount).toBe(60)
    })

    it('stops as soon as the goal is covered', () => {
        const p = plan(50)
        // Bet (£20) + 2am takeaway (£28.50) = £48.50, so one more lever is needed.
        expect(p.chosen.length).toBe(3)
        expect(p.covered).toBeGreaterThanOrEqual(50)
        expect(p.short).toBe(0)
    })

    it('says how far short a too-big goal falls', () => {
        const p = plan(5000)
        expect(p.short).toBeCloseTo(5000 - p.possible, 2)
        expect(p.chosen.length).toBe(p.levers.length)
    })

    it('turns the goal into a day-to-day budget for the month', () => {
        const p = plan(100)
        // The goal comes straight off October's day-to-day; bills stay as they are.
        expect(p.dayToDayBudget).toBeCloseTo(p.leftOver!.dayToDay - 100, 2)
        expect(p.perDay).toBeCloseTo(p.dayToDayBudget / 30, 2)
    })

    it('works out what you are left with, using income from the Monthly sheet', () => {
        const p = plan(100)
        expect(p.leftOver!.left).toBeCloseTo(3000 - p.leftOver!.bills - p.leftOver!.dayToDay, 2)
        expect(p.leftOver!.leftAfterGoal).toBeCloseTo(p.leftOver!.left + 100, 2)
        expect(plan(100, null).leftOver).toBeNull()
    })
})

describe('goalPresets', () => {
    it('offers round goals within reach', () => {
        expect(goalPresets(180)).toEqual([100, 250])
        expect(goalPresets(900)).toEqual([100, 250, 500, 1000])
    })
})
