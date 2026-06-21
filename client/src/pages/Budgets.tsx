import { useEffect, useState, type FormEvent } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import {
    listRows,
    listGroups,
    listEntries,
    updateRow,
    listBudgetSpends,
    createBudgetSpend,
    listBudgetExclusions,
} from '../services/finances'
import { rowVisibleInMonth } from '../lib/finance'
import { computeBudgetDay, dayNumOf } from '../lib/budget'
import { formatAmount } from '../lib/money'
import { useToast } from '../context/ToastContext'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayKey(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonth(): string {
    return todayKey().slice(0, 7)
}

const fmt = formatAmount

// ── Spend input ───────────────────────────────────────────────────────────────

interface SpendInputProps {
    spentToday: number
    hasLogged: boolean
    onAdd: (amount: number) => Promise<void>
}

function SpendInput({ spentToday, hasLogged, onAdd }: SpendInputProps) {
    const [draft, setDraft] = useState('')
    const [saving, setSaving] = useState(false)

    async function submit(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(draft.trim())
        if (Number.isNaN(n) || n < 0) return
        setSaving(true)
        try {
            await onAdd(n)
            setDraft('')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Spent today
                </span>
                <span className={`text-sm font-mono ${hasLogged ? 'text-neutral-800' : 'text-neutral-300'}`}>
                    {hasLogged ? `£${fmt(spentToday)}` : '—'}
                </span>
            </div>
            <form onSubmit={submit} className="flex gap-1.5">
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Log a transaction…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm font-mono placeholder:text-neutral-300 focus:border-neutral-950 focus:outline-none"
                />
                <button
                    type="submit"
                    disabled={saving || draft.trim() === ''}
                    className="rounded-lg bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-40"
                >
                    {saving ? '…' : 'Log'}
                </button>
            </form>
        </div>
    )
}

// ── Budget card ───────────────────────────────────────────────────────────────

interface BudgetCardProps {
    row: FinanceRow
    group: FinanceGroup
    entry: FinanceEntry | undefined
    spends: BudgetSpend[]
    excludedDates: Set<string>
    onToggleDailySpend: (row: FinanceRow) => void
    onLogSpend: (rowId: string, amount: number) => Promise<void>
}

function BudgetCard({
    row,
    group,
    entry,
    spends,
    excludedDates,
    onToggleDailySpend,
    onLogSpend,
}: BudgetCardProps) {
    const isDailySpend = row.budgetType === 'daily'
    const isIncome = group.type === 'income'
    const today = todayKey()
    const dayNum = dayNumOf(today)

    // Shared budget engine — identical maths to the Daily Log, dashboard widget,
    // and insights strip, including how excluded days redistribute the allowance.
    const { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining } =
        computeBudgetDay(row, entry, spends, today, excludedDates)
    const hasLoggedToday = spends.some((s) => s.date === today)
    const todaysAllowance = straightDailyRate + carry

    return (
        <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-base font-bold text-neutral-900">{row.name}</p>
                    <span
                        className={[
                            'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide',
                            isIncome
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700',
                        ].join(' ')}
                    >
                        {group.name}
                    </span>
                </div>
                <div className="text-right">
                    <p className="text-xs text-neutral-400">Monthly</p>
                    <p className="text-lg font-bold font-mono text-neutral-900">
                        {monthlyAmount > 0 ? `£${fmt(monthlyAmount)}` : '—'}
                    </p>
                    {monthlyAmount > 0 && (
                        <p
                            className={[
                                'text-xs font-semibold',
                                monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400',
                            ].join(' ')}
                        >
                            £{fmt(Math.abs(monthlyRemaining))}{' '}
                            {monthlyRemaining < 0 ? 'over' : 'left'}
                        </p>
                    )}
                </div>
            </div>

            {/* Daily spend section */}
            {isDailySpend && (
                <>
                    {/* Rolling allowance panel */}
                    <div className="rounded-xl bg-neutral-950 px-4 py-3 text-white">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Today's allowance
                                </p>
                                <p className="mt-0.5 text-2xl font-bold font-mono">
                                    £{fmt(straightDailyRate)}
                                </p>
                            </div>
                            {hasLoggedToday && (
                                <div className="text-right">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                        Remaining
                                    </p>
                                    <p
                                        className={[
                                            'mt-0.5 text-lg font-bold font-mono',
                                            remaining >= 0 ? 'text-emerald-400' : 'text-red-400',
                                        ].join(' ')}
                                    >
                                        £{fmt(Math.abs(remaining))}
                                        {remaining < 0 && (
                                            <span className="ml-1 text-xs font-normal">over</span>
                                        )}
                                    </p>
                                </div>
                            )}
                        </div>
                        {dayNum > 1 && (
                            <p
                                className={[
                                    'mt-2 break-words text-xs',
                                    carry >= 0 ? 'text-emerald-400' : 'text-red-400',
                                ].join(' ')}
                            >
                                {carry >= 0
                                    ? `+£${fmt(carry)} carry → £${fmt(todaysAllowance)} today`
                                    : `-£${fmt(Math.abs(carry))} deficit → £${fmt(todaysAllowance)} today`}
                            </p>
                        )}
                    </div>

                    {/* Over daily target warning */}
                    {hasLoggedToday && spentToday > straightDailyRate && (
                        <div
                            className={[
                                'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold',
                                remaining < 0
                                    ? 'bg-red-50 text-red-600'
                                    : 'bg-amber-50 text-amber-700',
                            ].join(' ')}
                        >
                            <i
                                className="fa-solid fa-triangle-exclamation text-xs"
                                aria-hidden="true"
                            />
                            {remaining < 0
                                ? `Over budget by £${fmt(Math.abs(remaining))}`
                                : `Over daily target — using £${fmt(spentToday - straightDailyRate)} of carry`}
                        </div>
                    )}

                    {/* Spend logger — each entry is a transaction */}
                    <SpendInput
                        spentToday={spentToday}
                        hasLogged={hasLoggedToday}
                        onAdd={(amount) => onLogSpend(row._id, amount)}
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
                <i
                    className={`fa-solid fa-${isDailySpend ? 'check' : 'toggle-off'} mr-1.5`}
                    aria-hidden="true"
                />
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
    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set())
    const toast = useToast()

    const month = currentMonth()

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
            listBudgetExclusions(month),
        ])
            .then(([g, r, e, s, x]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
                setExcludedDates(new Set(x.map((d) => d.date)))
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [month])

    async function handleToggleDailySpend(row: FinanceRow) {
        const newType = row.budgetType === 'daily' ? null : 'daily'
        try {
            const updated = await updateRow(row._id, { budgetType: newType })
            setRows((prev) => prev.map((r) => (r._id === row._id ? updated : r)))
        } catch {
            toast.error('Couldn’t change daily tracking.')
        }
    }

    async function handleLogSpend(rowId: string, amount: number) {
        const today = todayKey()
        try {
            const result = await createBudgetSpend(rowId, today, amount)
            setSpends((prev) => [...prev, result])
        } catch {
            toast.error('Couldn’t log that spend.')
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const budgetedRows = rows.filter(
        (r) =>
            r.budgeted &&
            rowVisibleInMonth(
                r,
                month,
                groups.find((g) => g._id === r.group)
            )
    )

    return (
        <>
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">Budgets</h1>
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
                                excludedDates={excludedDates}
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
