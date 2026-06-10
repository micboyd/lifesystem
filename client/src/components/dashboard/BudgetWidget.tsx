import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardFooter } from '../Card'
import Spinner from '../Spinner'
import { listGroups, listRows, listEntries, listBudgetSpends, setBudgetSpend } from '../../services/finances'
import { computeBudgetDay, monthOf, dayNumOf } from '../../lib/budget'
import { rowVisibleInMonth } from '../../lib/finance'
import { useInvalidate } from '../../context/DataSyncContext'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Per-budget column ─────────────────────────────────────────────────────────

interface BudgetColProps {
    row: FinanceRow
    entry: FinanceEntry | undefined
    rowSpends: BudgetSpend[]
    date: string
    onLogSpend: (rowId: string, amount: number | null) => void
}

function BudgetCol({ row, entry, rowSpends, date, onLogSpend }: BudgetColProps) {
    const dayNum = dayNumOf(date)
    const { monthlyAmount, straightDailyRate, carry, spentToday, remaining, monthlyRemaining } =
        computeBudgetDay(row, entry, rowSpends, date)

    const [draft, setDraft] = useState('')
    const [saving, setSaving] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    async function handleLog(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(draft.trim())
        if (Number.isNaN(n)) return
        setSaving(true)
        try {
            await onLogSpend(row._id, n)
            setDraft('')
            inputRef.current?.focus()
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-1 basis-64 flex-col gap-3 rounded-2xl bg-neutral-50 p-4">
            <p className="text-sm font-bold text-neutral-800 truncate">{row.name}</p>

            {/* Dark allowance block — fixed daily rate is the target */}
            <div className="rounded-xl bg-neutral-950 px-3 py-2.5 text-white">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Daily target</p>
                <p className="mt-0.5 text-xl font-bold font-mono tabular-nums">£{fmt(straightDailyRate)}</p>
                {dayNum > 1 && (
                    <p className={`mt-1 text-[11px] font-semibold ${carry >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {carry >= 0 ? `+£${fmt(carry)} carry` : `-£${fmt(Math.abs(carry))} deficit`}
                    </p>
                )}
            </div>

            {/* Monthly remaining */}
            {monthlyAmount > 0 && (
                <p className={[
                    'text-xs font-semibold',
                    monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400',
                ].join(' ')}>
                    £{fmt(Math.abs(monthlyRemaining))} {monthlyRemaining < 0 ? 'over monthly budget' : 'left this month'}
                </p>
            )}

            {/* Spent / Remaining */}
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Spent</p>
                    <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-neutral-700">
                        £{fmt(spentToday)}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Remaining</p>
                    <p className={[
                        'mt-0.5 text-base font-bold font-mono tabular-nums',
                        remaining >= 0 ? 'text-emerald-600' : 'text-red-500',
                    ].join(' ')}>
                        £{fmt(Math.abs(remaining))}
                        {remaining < 0 && <span className="ml-0.5 text-[10px] font-normal">over</span>}
                    </p>
                </div>
            </div>

            {/* Over daily target warning */}
            {spentToday > straightDailyRate && (
                <div className={[
                    'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold',
                    remaining < 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700',
                ].join(' ')}>
                    <i className="fa-solid fa-triangle-exclamation text-[10px]" aria-hidden="true" />
                    {remaining < 0
                        ? `Over budget by £${fmt(Math.abs(remaining))}`
                        : `Over target — using £${fmt(spentToday - straightDailyRate)} carry`}
                </div>
            )}

            {/* Quick log */}
            <form onSubmit={handleLog} className="flex gap-1.5">
                <input
                    ref={inputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Log spend…"
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

// ── Main widget ───────────────────────────────────────────────────────────────

export default function BudgetWidget({ date }: { date: string }) {
    const invalidate = useInvalidate()
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    // Derive loading from which month finished loading — avoids a synchronous
    // setState inside the fetch effect (flagged as cascading renders).
    const [loadedMonth, setLoadedMonth] = useState<string | null>(null)

    const month = monthOf(date)
    const loading = loadedMonth !== month

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
        ]).then(([g, r, e, s]) => {
            if (!active) return
            setGroups(g)
            setRows(r)
            setEntries(e)
            setSpends(s)
        }).finally(() => { if (active) setLoadedMonth(month) })
        return () => { active = false }
    }, [month])

    async function handleLogSpend(rowId: string, amount: number | null) {
        const result = await setBudgetSpend(rowId, date, amount)
        setSpends((prev) => {
            const without = prev.filter((s) => !(s.row === rowId && s.date === date))
            return result ? [...without, result] : without
        })
        invalidate('budget')
    }

    // Only rows whose lifecycle (and their group's) covers this month.
    const visibleBudgeted = rows.filter((r) =>
        r.budgeted && rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
    const budgetedRows = visibleBudgeted
    const dailyRows = budgetedRows.filter((r) => r.budgetType === 'daily')
    const hasAmounts = dailyRows.some((r) => {
        const entry = entries.find((e) => e.row === r._id)
        return (entry?.amount ?? r.recurringAmount ?? 0) > 0
    })

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>Budget</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        {dailyRows.length > 0
                            ? `Daily spend across ${dailyRows.length} budget${dailyRows.length !== 1 ? 's' : ''}`
                            : 'Daily spend tracker'}
                    </p>
                </div>
                <Link
                    to="/finances/budgets"
                    className="mt-1 inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Open
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-6"><Spinner /></div>
            ) : budgetedRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    No budgets yet.{' '}
                    <Link to="/finances/budgets" className="font-semibold text-neutral-600 underline underline-offset-2">
                        Add some on the Budgets tab.
                    </Link>
                </p>
            ) : dailyRows.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    You have {budgetedRows.length} budget{budgetedRows.length !== 1 ? 's' : ''} but none have daily tracking on.{' '}
                    <Link to="/finances/budgets" className="font-semibold text-neutral-600 underline underline-offset-2">
                        Enable &quot;Daily spend&quot; on a card.
                    </Link>
                </p>
            ) : !hasAmounts ? (
                <p className="py-4 text-sm text-neutral-400">
                    No amounts set on your daily budgets yet.{' '}
                    <Link to="/finances/budgets" className="font-semibold text-neutral-600 underline underline-offset-2">
                        Set amounts on the Monthly tab.
                    </Link>
                </p>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {dailyRows.map((row) => (
                        <BudgetCol
                            key={row._id}
                            row={row}
                            entry={entries.find((e) => e.row === row._id)}
                            rowSpends={spends.filter((s) => s.row === row._id)}
                            date={date}
                            onLogSpend={handleLogSpend}
                        />
                    ))}
                </div>
            )}

            <CardFooter>
                <Link
                    to="/finances/budgets"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-piggy-bank text-xs" aria-hidden="true" />
                    View budgets
                </Link>
            </CardFooter>
        </Card>
    )
}
