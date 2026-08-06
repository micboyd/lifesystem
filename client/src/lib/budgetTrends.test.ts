import { describe, it, expect } from 'vitest'
import { monthTrend } from './budgetTrends'
import { group, dailyRow, weeklyRow, row, entry, spend } from './__fixtures'

describe('monthTrend', () => {
    const g = group({ _id: 'g1' })
    const daily = dailyRow(100, { _id: 'daily' })
    const weekly = weeklyRow(200, { _id: 'weekly' })
    const untracked = row({ _id: 'untracked', budgeted: false, recurringAmount: 500 })
    const rows = [daily, weekly, untracked]

    it('sums targets across tracked rows and spend on non-excluded days', () => {
        const trend = monthTrend([g], rows, {
            month: '2026-08',
            entries: [entry({ row: 'daily', amount: 120 })], // override beats recurring
            spends: [
                spend('2026-08-02', 50, { row: 'daily' }),
                spend('2026-08-03', 30, { row: 'weekly' }),
                spend('2026-08-10', 40, { row: 'daily' }), // excluded day → ignored
                spend('2026-08-04', 999, { row: 'untracked' }), // untracked row → ignored
            ],
            excludedDates: new Set(['2026-08-10']),
        })

        expect(trend.budget).toBe(320) // 120 override + 200 recurring
        expect(trend.spent).toBe(80) // 50 + 30
        expect(trend.remaining).toBe(240)
        expect(trend.over).toBe(false)
        expect(trend.label).toBe('Aug')
    })

    it('flags an over-budget month', () => {
        const trend = monthTrend([g], [daily], {
            month: '2026-08',
            entries: [],
            spends: [spend('2026-08-02', 150, { row: 'daily' })],
            excludedDates: new Set(),
        })
        expect(trend.budget).toBe(100)
        expect(trend.spent).toBe(150)
        expect(trend.remaining).toBe(-50)
        expect(trend.over).toBe(true)
    })
})
