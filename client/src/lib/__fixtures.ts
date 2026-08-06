/**
 * Test fixtures for the finance maths. Factory helpers build the minimal valid
 * shapes the pure budget/finance functions consume, so tests read as intent
 * ("a daily row of £310/month") rather than object boilerplate.
 *
 * Not a test file (no `.test.ts` suffix) so vitest won't try to run it.
 */
import type {
    FinanceGroup,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
    BudgetTopUp,
    ExclusionBudget,
} from '../types'

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

export function group(over: Partial<FinanceGroup> = {}): FinanceGroup {
    return { _id: 'g1', name: 'Group', type: 'expense', order: 0, ...STAMP, ...over }
}

export function row(over: Partial<FinanceRow> = {}): FinanceRow {
    return { _id: 'r1', group: 'g1', name: 'Row', order: 0, ...STAMP, ...over }
}

/** A daily-tracked budgeted row with a recurring monthly amount. */
export function dailyRow(recurringAmount: number, over: Partial<FinanceRow> = {}): FinanceRow {
    return row({ budgeted: true, budgetType: 'daily', recurringAmount, ...over })
}

/** A weekly-tracked budgeted row with a recurring monthly amount. */
export function weeklyRow(recurringAmount: number, over: Partial<FinanceRow> = {}): FinanceRow {
    return row({ budgeted: true, budgetType: 'weekly', recurringAmount, ...over })
}

export function entry(over: Partial<FinanceEntry> = {}): FinanceEntry {
    return { _id: 'e1', row: 'r1', month: '2026-08', amount: 0, ...over }
}

export function spend(date: string, amount: number, over: Partial<BudgetSpend> = {}): BudgetSpend {
    return { _id: `s-${date}-${amount}`, row: 'r1', date, amount, ...over }
}

export function topUp(
    date: string,
    amount: number,
    kind: BudgetTopUp['kind'] = 'topup',
    over: Partial<BudgetTopUp> = {}
): BudgetTopUp {
    return { _id: `t-${date}-${amount}`, row: 'r1', date, amount, kind, ...over }
}

export function exclusionBudget(over: Partial<ExclusionBudget> = {}): ExclusionBudget {
    return { _id: 'x1', dates: [], amount: 0, ...over }
}
