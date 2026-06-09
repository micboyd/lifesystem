import { useEffect, useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { listRows, listGroups, listEntries, updateRow, listBudgetSpends, setBudgetSpend } from '../services/finances'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayKey(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonth(): string {
    return todayKey().slice(0, 7)
}

function daysInMonth(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0).getDate()
}

function dayOfMonth(): number {
    return new Date().getDate()
}

function fmt(n: number): string {
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Spend input ───────────────────────────────────────────────────────────────

interface SpendInputProps {
    value: number | undefined
    onSave: (v: number | null) => void
}

function SpendInput({ value, onSave }: SpendInputProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    function start() {
        setDraft(value !== undefined ? String(value) : '')
        setEditing(true)
        setTimeout(() => inputRef.current?.select(), 0)
    }

    function commit() {
        const t = draft.trim()
        if (t === '') { onSave(null) }
        else { const n = parseFloat(t); if (!Number.isNaN(n)) onSave(n) }
        setEditing(false)
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                autoFocus
                type="number"
                step="0.01"
                min="0"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-right text-sm font-mono focus:border-neutral-950 focus:outline-none"
            />
        )
    }

    return (
        <button
            type="button"
            onClick={start}
            className="flex w-full items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5 text-sm font-mono transition-colors hover:bg-neutral-100"
        >
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Spent today</span>
            <span className={value !== undefined ? 'text-neutral-800' : 'text-neutral-300'}>
                {value !== undefined ? `£${fmt(value)}` : 'tap to log'}
            </span>
        </button>
    )
}

// ── Budget card ───────────────────────────────────────────────────────────────

interface BudgetCardProps {
    row: FinanceRow
    group: FinanceGroup
    entry: FinanceEntry | undefined
    spends: BudgetSpend[]
    month: string
    onToggleDailySpend: (row: FinanceRow) => void
    onLogSpend: (rowId: string, amount: number | null) => void
}

function BudgetCard({ row, group, entry, spends, month, onToggleDailySpend, onLogSpend }: BudgetCardProps) {
    const monthlyAmount = entry?.amount ?? row.recurringAmount ?? 0
    const isDailySpend = row.budgetType === 'daily'
    const isIncome = group.type === 'income'
    const today = todayKey()
    const totalDays = daysInMonth(month)
    const dayNum = dayOfMonth()

    const straightDailyRate = totalDays > 0 ? monthlyAmount / totalDays : 0
    const totalSpentBefore = spends
        .filter((s) => s.date < today)
        .reduce((sum, s) => sum + s.amount, 0)
    const carry = (dayNum - 1) * straightDailyRate - totalSpentBefore
    const todaysAllowance = straightDailyRate + carry

    const todaySpend = spends.find((s) => s.date === today)
    const spentToday = todaySpend?.amount
    const remaining = spentToday !== undefined ? todaysAllowance - spentToday : undefined

    const totalSpentMonth = spends.reduce((sum, s) => sum + s.amount, 0)
    const monthlyRemaining = monthlyAmount - totalSpentMonth

    return (
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div>
                    <p className="text-base font-bold text-neutral-900">{row.name}</p>
                    <span className={[
                        'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
                        isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700',
                    ].join(' ')}>
                        {group.name}
                    </span>
                </div>
                <div className="text-right">
                    <p className="text-xs text-neutral-400">Monthly</p>
                    <p className="text-lg font-bold font-mono text-neutral-900">
                        {monthlyAmount > 0 ? `£${fmt(monthlyAmount)}` : '—'}
                    </p>
                    {monthlyAmount > 0 && (
                        <p className={[
                            'text-xs font-semibold',
                            monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400',
                        ].join(' ')}>
                            £{fmt(Math.abs(monthlyRemaining))} {monthlyRemaining < 0 ? 'over' : 'left'}
                        </p>
                    )}
                </div>
            </div>

            {/* Daily spend section */}
            {isDailySpend && (
                <>
                    {/* Rolling allowance panel */}
                    <div className="rounded-xl bg-neutral-950 px-4 py-3 text-white">
                        <div className="flex items-baseline justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Today's allowance</p>
                                <p className="mt-0.5 text-2xl font-bold font-mono">£{fmt(straightDailyRate)}</p>
                            </div>
                            {remaining !== undefined && (
                                <div className="text-right">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Remaining</p>
                                    <p className={[
                                        'mt-0.5 text-lg font-bold font-mono',
                                        remaining >= 0 ? 'text-emerald-400' : 'text-red-400',
                                    ].join(' ')}>
                                        £{fmt(Math.abs(remaining))}
                                        {remaining < 0 && <span className="ml-1 text-xs font-normal">over</span>}
                                    </p>
                                </div>
                            )}
                        </div>
                        {dayNum > 1 && (
                            <p className={[
                                'mt-2 text-xs',
                                carry >= 0 ? 'text-emerald-400' : 'text-red-400',
                            ].join(' ')}>
                                {carry >= 0
                                    ? `+£${fmt(carry)} carry → £${fmt(todaysAllowance)} today`
                                    : `-£${fmt(Math.abs(carry))} deficit → £${fmt(todaysAllowance)} today`}
                            </p>
                        )}
                    </div>

                    {/* Over daily target warning */}
                    {spentToday !== undefined && spentToday > straightDailyRate && (
                        <div className={[
                            'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold',
                            remaining !== undefined && remaining < 0
                                ? 'bg-red-50 text-red-600'
                                : 'bg-amber-50 text-amber-700',
                        ].join(' ')}>
                            <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                            {remaining !== undefined && remaining < 0
                                ? `Over budget by £${fmt(Math.abs(remaining))}`
                                : `Over daily target — using £${fmt(spentToday - straightDailyRate)} of carry`}
                        </div>
                    )}

                    {/* Spend logger */}
                    <SpendInput
                        value={spentToday}
                        onSave={(v) => onLogSpend(row._id, v)}
                    />
                </>
            )}

            {/* Daily tracking toggle */}
            <button
                type="button"
                onClick={() => onToggleDailySpend(row)}
                className={[
                    'self-start rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                    isDailySpend
                        ? 'bg-neutral-950 text-white hover:bg-neutral-800'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200',
                ].join(' ')}
            >
                <i className={`fa-solid fa-${isDailySpend ? 'check' : 'toggle-off'} mr-1.5`} aria-hidden="true" />
                {isDailySpend ? 'Daily tracking on' : 'Enable daily tracking'}
            </button>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Budgets() {
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])

    const month = currentMonth()

    useEffect(() => {
        let active = true
        Promise.all([listGroups(), listRows(), listEntries(month), listBudgetSpends({ month })])
            .then(([g, r, e, s]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
            })
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [month])

    async function handleToggleDailySpend(row: FinanceRow) {
        const newType = row.budgetType === 'daily' ? null : 'daily'
        const updated = await updateRow(row._id, { budgetType: newType })
        setRows((prev) => prev.map((r) => (r._id === row._id ? updated : r)))
    }

    async function handleLogSpend(rowId: string, amount: number | null) {
        const today = todayKey()
        const result = await setBudgetSpend(rowId, today, amount)
        setSpends((prev) => {
            const without = prev.filter((s) => !(s.row === rowId && s.date === today))
            return result ? [...without, result] : without
        })
    }

    if (loading) {
        return <div className="grid place-items-center py-16"><Spinner /></div>
    }

    const budgetedRows = rows.filter((r) => r.budgeted)

    return (
        <>
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Budgets</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Spending targets derived from your monthly figures.
                </p>
            </header>

            {budgetedRows.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-bookmark"
                    title="No budgets yet"
                    description="On the Monthly tab, hover a row and click the bookmark icon to add it here."
                />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {budgetedRows.map((row) => {
                        const group = groups.find((g) => g._id === row.group)
                        if (!group) return null
                        const entry = entries.find((e) => e.row === row._id)
                        const rowSpends = spends.filter((s) => s.row === row._id)
                        return (
                            <BudgetCard
                                key={row._id}
                                row={row}
                                group={group}
                                entry={entry}
                                spends={rowSpends}
                                month={month}
                                onToggleDailySpend={handleToggleDailySpend}
                                onLogSpend={handleLogSpend}
                            />
                        )
                    })}
                </div>
            )}
        </>
    )
}
