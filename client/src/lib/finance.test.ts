import { describe, it, expect } from 'vitest'
import {
    recurringAmountForMonth,
    addMonths,
    freeCashByMonth,
    visibleInMonth,
    rowVisibleInMonth,
} from './finance'
import type { FinanceRow } from '../types'
import { row, group } from './__fixtures'

describe('addMonths', () => {
    it('shifts forward, rolling over the year', () => {
        expect(addMonths('2026-01', 1)).toBe('2026-02')
        expect(addMonths('2026-12', 1)).toBe('2027-01')
    })

    it('shifts backward across the year boundary', () => {
        expect(addMonths('2026-01', -1)).toBe('2025-12')
        expect(addMonths('2026-03', -5)).toBe('2025-10')
    })

    it('handles a full-year delta', () => {
        expect(addMonths('2026-06', 12)).toBe('2027-06')
    })
})

describe('recurringAmountForMonth', () => {
    it('returns the current amount when there is no history', () => {
        expect(recurringAmountForMonth(row({ recurringAmount: 100 }), '2026-05')).toBe(100)
    })

    it('returns undefined when no amount is set', () => {
        expect(recurringAmountForMonth(row(), '2026-05')).toBeUndefined()
    })

    it('uses a superseded amount for months before its boundary', () => {
        const r = row({
            recurringAmount: 100,
            pastAmounts: [{ beforeMonth: '2026-03', amount: 80 }],
        })
        expect(recurringAmountForMonth(r, '2026-01')).toBe(80) // before boundary
        expect(recurringAmountForMonth(r, '2026-03')).toBe(100) // boundary month is current
        expect(recurringAmountForMonth(r, '2026-05')).toBe(100) // after boundary
    })

    it('picks the first boundary strictly after the month across multiple edits', () => {
        const r = row({
            recurringAmount: 100,
            pastAmounts: [
                { beforeMonth: '2026-06', amount: 90 },
                { beforeMonth: '2026-03', amount: 80 }, // deliberately unsorted
            ],
        })
        expect(recurringAmountForMonth(r, '2026-01')).toBe(80)
        expect(recurringAmountForMonth(r, '2026-04')).toBe(90)
        expect(recurringAmountForMonth(r, '2026-07')).toBe(100)
    })
})

describe('visibleInMonth', () => {
    it('is visible everywhere with no lifecycle bounds', () => {
        expect(visibleInMonth({}, '2026-08')).toBe(true)
    })

    it('honours the start bound', () => {
        expect(visibleInMonth({ startMonth: '2026-03' }, '2026-02')).toBe(false)
        expect(visibleInMonth({ startMonth: '2026-03' }, '2026-03')).toBe(true)
    })

    it('honours the end bound', () => {
        expect(visibleInMonth({ endMonth: '2026-06' }, '2026-07')).toBe(false)
        expect(visibleInMonth({ endMonth: '2026-06' }, '2026-06')).toBe(true)
    })

    it('hides explicitly skipped months', () => {
        expect(visibleInMonth({ skipMonths: ['2026-04'] }, '2026-04')).toBe(false)
        expect(visibleInMonth({ skipMonths: ['2026-04'] }, '2026-05')).toBe(true)
    })
})

describe('rowVisibleInMonth', () => {
    it('is hidden when its parent group is hidden that month', () => {
        const g = group({ startMonth: '2026-09' })
        expect(rowVisibleInMonth(row({ recurring: true }), '2026-08', g)).toBe(false)
    })

    it('pins a one-time row to its own month', () => {
        const r = row({ recurring: false, month: '2026-08' })
        expect(rowVisibleInMonth(r, '2026-08')).toBe(true)
        expect(rowVisibleInMonth(r, '2026-09')).toBe(false)
    })

    it('falls back to the created month for a one-time row without an explicit month', () => {
        const r = row({ recurring: false, month: undefined, createdAt: '2026-07-15T09:00:00.000Z' })
        expect(rowVisibleInMonth(r, '2026-07')).toBe(true)
        expect(rowVisibleInMonth(r, '2026-08')).toBe(false)
    })

    it('applies the lifecycle window to a recurring row', () => {
        const r = row({ recurring: true, startMonth: '2026-03', endMonth: '2026-10' })
        expect(rowVisibleInMonth(r, '2026-02')).toBe(false)
        expect(rowVisibleInMonth(r, '2026-05')).toBe(true)
        expect(rowVisibleInMonth(r, '2026-11')).toBe(false)
    })
})

describe('freeCashByMonth', () => {
    const groups = [
        group({ _id: 'inc', type: 'income' }),
        group({ _id: 'exp', type: 'expense' }),
        group({ _id: 'sav', type: 'savings' }),
    ]

    /** A recurring row in one of the groups above. */
    function line(
        _id: string,
        groupId: string,
        recurringAmount: number,
        over: Partial<FinanceRow> = {}
    ): FinanceRow {
        return row({ _id, group: groupId, name: _id, recurringAmount, ...over })
    }

    it('is income less ordinary outgoings', () => {
        const rows = [
            line('salary', 'inc', 3000),
            line('rent', 'exp', 1200),
            line('bills', 'exp', 300),
        ]
        expect(freeCashByMonth(groups, rows, ['2026-05'])).toEqual({ '2026-05': 1500 })
    })

    it('leaves savings out — they are the thing being measured, not a cost', () => {
        const rows = [line('salary', 'inc', 3000), line('house fund', 'sav', 900)]
        expect(freeCashByMonth(groups, rows, ['2026-05'])).toEqual({ '2026-05': 3000 })
    })

    it('follows each row through its own lifecycle', () => {
        const rows = [
            line('salary', 'inc', 3000),
            line('gym', 'exp', 50, { startMonth: '2026-06' }),
            line('loan', 'exp', 200, { endMonth: '2026-05' }),
        ]
        const free = freeCashByMonth(groups, rows, ['2026-05', '2026-06'])
        expect(free['2026-05']).toBe(2800)
        expect(free['2026-06']).toBe(2950)
    })

    it('uses the amount that was current in the month, not just the latest', () => {
        const rows = [
            line('salary', 'inc', 3400, {
                pastAmounts: [{ beforeMonth: '2026-06', amount: 3000 }],
            }),
        ]
        const free = freeCashByMonth(groups, rows, ['2026-05', '2026-06'])
        expect(free['2026-05']).toBe(3000)
        expect(free['2026-06']).toBe(3400)
    })

    it('never reports a negative figure — there is no such thing as less than nothing free', () => {
        const rows = [line('salary', 'inc', 1000), line('rent', 'exp', 1800)]
        expect(freeCashByMonth(groups, rows, ['2026-05'])).toEqual({ '2026-05': 0 })
    })

    it('hides a row whose group is hidden that month', () => {
        const scoped = [
            group({ _id: 'inc', type: 'income' }),
            group({ _id: 'exp', type: 'expense', endMonth: '2026-05' }),
        ]
        const rows = [line('salary', 'inc', 3000), line('rent', 'exp', 1200)]
        const free = freeCashByMonth(scoped, rows, ['2026-05', '2026-06'])
        expect(free['2026-05']).toBe(1800)
        expect(free['2026-06']).toBe(3000)
    })
})
