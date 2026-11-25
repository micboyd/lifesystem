import { describe, it, expect } from 'vitest'
import { planFinanceImport, firstWeekOf, type ExistingGroup, type ExistingRow } from './financeImport'

const groups: ExistingGroup[] = [
    { _id: 'gi', name: 'Income', type: 'income', order: 0 },
    { _id: 'gb', name: 'Bills', type: 'expense', order: 1 },
    { _id: 'gs', name: 'Savings', type: 'savings', order: 2 },
]
const rows: ExistingRow[] = [
    { _id: 'r1', group: 'gi', name: 'Salary', order: 0, recurringAmount: 3181.55 },
    { _id: 'r2', group: 'gb', name: 'Rent', order: 0, recurringAmount: 650 },
    { _id: 'r3', group: 'gb', name: 'ChatGPT', order: 1, recurringAmount: 20 },
    { _id: 'r4', group: 'gb', name: 'Gym', order: 2, recurringAmount: 53.5 },
    { _id: 'r5', group: 'gs', name: 'Savings', order: 0, recurringAmount: 0 },
]
const state = { groups, rows, pots: [], entries: [] }

describe('planFinanceImport', () => {
    it('changes amounts from the month onwards, keeping earlier months', () => {
        const plan = planFinanceImport(
            { month: '2026-12', groups: [{ name: 'income', rows: [{ name: 'salary', amount: 3879.9 }] }] },
            state
        )
        expect(plan.errors).toEqual([])
        const op = plan.ops.find((o) => o.kind === 'updateRow')!
        expect(op).toMatchObject({
            id: 'r1',
            set: { recurringAmount: 3879.9, pastAmounts: [{ beforeMonth: '2026-12', amount: 3181.55 }] },
        })
        expect(plan.summary.changes[0]).toMatchObject({ action: 'change', from: 3181.55, to: 3879.9 })
    })

    it('leaves a row alone when the amount already matches', () => {
        const plan = planFinanceImport({ month: '2026-12', groups: [{ name: 'Bills', rows: [{ name: 'Rent', amount: 650 }] }] }, state)
        expect(plan.ops).toEqual([])
        expect(plan.summary.changes[0].action).toBe('same')
    })

    it('stops a row the month before', () => {
        const plan = planFinanceImport({ month: '2026-12', groups: [{ name: 'Bills', rows: [{ name: 'ChatGPT', end: true }] }] }, state)
        expect(plan.ops).toEqual([{ kind: 'updateRow', id: 'r3', set: { endMonth: '2026-11' } }])
        expect(plan.summary.totals.expense).toBe(703.5)
    })

    it('adds new rows, weekly budgets and groups', () => {
        const plan = planFinanceImport(
            {
                month: '2026-12',
                groups: [
                    { name: 'Bills', rows: [{ name: 'Vodafone', amount: 40 }] },
                    { name: 'Spending', type: 'expense', rows: [{ name: 'Groceries', weekly: 80 }, { name: 'Nights out', amount: 200, budget: 'daily' }] },
                ],
            },
            state
        )
        expect(plan.errors).toEqual([])
        expect(plan.summary.groupsCreated).toEqual(['Spending'])
        const groceries = plan.ops.find((o) => o.kind === 'createRow' && o.name === 'Groceries')
        expect(groceries).toMatchObject({ budgeted: true, budgetType: 'weekly', weeklyAmount: 80, recurringAmount: 346.67 })
        const vodafone = plan.ops.find((o) => o.kind === 'createRow' && o.name === 'Vodafone')
        expect(vodafone).toMatchObject({ startMonth: '2026-12', group: { id: 'gb' } })
    })

    it('sets the single savings row from the group amount', () => {
        const plan = planFinanceImport({ month: '2026-12', groups: [{ name: 'Savings', amount: 1163.04 }] }, state)
        expect(plan.ops[0]).toMatchObject({ kind: 'updateRow', id: 'r5', set: { recurringAmount: 1163.04 } })
    })

    it('reports untouched rows and the month totals', () => {
        const plan = planFinanceImport({ month: '2026-12', groups: [{ name: 'Savings', amount: 100 }] }, state)
        expect(plan.summary.untouched.map((u) => u.row)).toEqual(['Salary', 'Rent', 'ChatGPT', 'Gym'])
        expect(plan.summary.totals).toEqual({ income: 3181.55, expense: 723.5, savings: 100, leftOver: 2358.05 })
    })

    it('clears a manual figure for the month that would hide the plan', () => {
        const plan = planFinanceImport(
            { month: '2026-12', groups: [{ name: 'Bills', rows: [{ name: 'Rent', amount: 650 }] }] },
            { ...state, entries: [{ row: 'r2', month: '2026-12', amount: 700 }] }
        )
        expect(plan.ops).toContainEqual({ kind: 'clearEntry', row: 'r2', month: '2026-12' })
        expect(plan.summary.warnings[0]).toMatch(/manual figure/)
    })

    it('rejects bad documents without any writes', () => {
        const plan = planFinanceImport(
            { month: '2026-12', groups: [{ name: 'New', rows: [] }, { name: 'Bills', rows: [{ name: 'Rent' }] }] },
            state
        )
        expect(plan.ops).toEqual([])
        expect(plan.errors.join(' ')).toMatch(/needs a "type"/)
        expect(plan.errors.join(' ')).toMatch(/give an "amount"/)
    })

    it('starts groups on an empty sheet from the beginning, not the plan month', () => {
        const plan = planFinanceImport(
            {
                month: '2026-12',
                groups: [
                    { name: 'Income', type: 'income', rows: [{ name: 'Salary', amount: 3879.9 }] },
                    { name: 'Bills', type: 'expense', rows: [{ name: 'Heroku', amount: 30.46, pot: 'Subscriptions' }, { name: 'Adobe', end: true }] },
                    { name: 'Savings', type: 'savings', amount: 1163.04 },
                ],
            },
            { groups: [], rows: [], pots: [], entries: [] }
        )
        expect(plan.errors).toEqual([])
        const created = plan.ops.filter((o) => o.kind === 'createGroup')
        expect(created).toHaveLength(3)
        for (const g of created) expect(g).toMatchObject({ startMonth: null })
        for (const r of plan.ops.filter((o) => o.kind === 'createRow')) expect(r).toMatchObject({ startMonth: null })
        expect(plan.summary.totals).toMatchObject({ income: 3879.9, expense: 30.46, savings: 1163.04 })
    })

    it('still starts a new group at the plan month when the sheet has groups', () => {
        const plan = planFinanceImport(
            { month: '2026-12', groups: [{ name: 'Spending', type: 'expense', rows: [{ name: 'Groceries', amount: 320 }] }] },
            state
        )
        expect(plan.ops.find((o) => o.kind === 'createGroup')).toMatchObject({ startMonth: '2026-12' })
    })

    it('takes a monthly amount on a weekly budget and keeps the month exact', () => {
        const grocer: ExistingRow = { _id: 'r6', group: 'gb', name: 'Groceries', order: 3, recurringAmount: 320, budgeted: true, budgetType: 'weekly' }
        const doc = { month: '2026-12', groups: [{ name: 'Bills', rows: [{ name: 'Groceries', amount: 400, budget: 'weekly' }] }] }
        const plan = planFinanceImport(doc, { ...state, rows: [...rows, grocer] })
        expect(plan.errors).toEqual([])
        const op = plan.ops.find((o) => o.kind === 'updateRow' && o.id === 'r6')
        expect(op && 'set' in op && op.set.recurringAmount).toBe(400)
        expect(op && 'set' in op && op.set.weeklyAmount).toBe(92.31)
    })

    it('puts weekly changes on the week holding the 1st', () => {
        expect(firstWeekOf('2026-12')).toBe('2026-11-30')
    })
})
