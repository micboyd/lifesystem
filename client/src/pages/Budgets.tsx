import { useEffect, useState, type FormEvent } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../context/AuthContext'
import {
    listRows,
    listGroups,
    listEntries,
    updateRow,
    listBudgetSpends,
    createBudgetSpend,
    deleteBudgetSpend,
    listBudgetExclusions,
} from '../services/finances'
import { rowVisibleInMonth } from '../lib/finance'
import { computeBudgetDay, computeBudgetWeek, daysInMonth, weekStartOf, weekEndOf } from '../lib/budget'
import { formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import { useInvalidate } from '../context/DataSyncContext'
import type { FinanceGroup, FinanceRow, FinanceEntry, BudgetSpend } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayKey(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Week start/end clamped to the anchor's month, matching BudgetCalendar's week grouping. */
function weekRangeFor(anchor: string): { month: string; weekStart: string; weekEnd: string } {
    const month = anchor.slice(0, 7)
    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    const rawStart = weekStartOf(anchor)
    const rawEnd = weekEndOf(anchor)
    return {
        month,
        weekStart: rawStart < monthStart ? monthStart : rawStart,
        weekEnd: rawEnd > monthEnd ? monthEnd : rawEnd,
    }
}

/** 1-indexed week number within the month, same grouping logic as BudgetCalendar. */
function weekNumberInMonth(anchor: string): number {
    const month = anchor.slice(0, 7)
    let weekNum = 1
    let d = `${month}-01`
    while (d < anchor) {
        const next = addDays(d, 1)
        // A new week starts on Monday
        if (new Date(`${next}T00:00:00`).getDay() === 1 && next <= anchor) weekNum++
        d = next
    }
    return weekNum
}

/** Total weeks in a month (same grouping logic). */
function weeksInMonth(month: string): number {
    const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
    return weekNumberInMonth(lastDay)
}

const fmt = formatAmount

// ── Spend input ───────────────────────────────────────────────────────────────

interface SpendInputProps {
    spentToday: number
    hasLogged: boolean
    label?: string
    onAdd: (amount: number, note?: string) => Promise<void>
}

function SpendInput({ spentToday, hasLogged, label, onAdd }: SpendInputProps) {
    const [draft, setDraft] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

    async function submit(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(draft.trim())
        if (Number.isNaN(n) || n < 0) return
        setSaving(true)
        try {
            await onAdd(n, note.trim() || undefined)
            setDraft('')
            setNote('')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                    {label ?? 'Spent today'}
                </span>
                <span className={`text-sm tabular-nums ${hasLogged ? 'text-neutral-900' : 'text-neutral-300'}`}>
                    {hasLogged ? `£${fmt(spentToday)}` : '—'}
                </span>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-2">
                <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">£</span>
                        <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-7 pr-3 text-sm tabular-nums placeholder:font-sans placeholder:text-neutral-300 transition-colors focus:border-neutral-950 focus:outline-none focus:ring-4 focus:ring-neutral-950/5"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={saving || draft.trim() === ''}
                        className="shrink-0 rounded-xl bg-neutral-950 px-5 py-2.5 text-xs font-semibold tracking-tight text-white transition-all duration-150 hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
                    >
                        {saving ? '…' : 'Log'}
                    </button>
                </div>
                <input
                    type="text"
                    placeholder="Label (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={200}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-300 transition-colors focus:border-neutral-950 focus:outline-none focus:ring-4 focus:ring-neutral-950/5"
                />
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
    weekStart: string
    weekEnd: string
    isCurrentWeek: boolean
    isFutureWeek: boolean
    onToggleDailySpend: (row: FinanceRow) => void
    onLogSpend: (rowId: string, amount: number, date: string, note?: string) => Promise<void>
    onDeleteSpend: (id: string) => Promise<void>
}

function BudgetCard({
    row, group, entry, spends, excludedDates,
    weekStart, weekEnd, isCurrentWeek, isFutureWeek,
    onToggleDailySpend, onLogSpend, onDeleteSpend,
}: BudgetCardProps) {
    const isDailySpend = row.budgetType === 'daily'
    const isWeeklySpend = row.budgetType === 'weekly'
    const isIncome = group.type === 'income'
    const today = todayKey()

    // Monthly overview — always based on the month the week sits in.
    // computeBudgetDay gives monthlyAmount / monthlyRemaining regardless of the day param.
    const monthRef = computeBudgetDay(row, entry, spends, weekStart, excludedDates)
    const { monthlyAmount, monthlyRemaining } = monthRef

    // ── Weekly row maths ────────────────────────────────────────────────────
    const weeklyBudget = isWeeklySpend
        ? computeBudgetWeek(row, entry, spends, weekStart, weekEnd, today, excludedDates)
        : null

    // ── Daily row maths for the week slice ──────────────────────────────────
    const dailyRate = monthRef.straightDailyRate
    // Count active days in this week slice
    let activeDaysInWeek = 0
    let d = weekStart
    while (d <= weekEnd) {
        if (!excludedDates.has(d)) activeDaysInWeek++
        d = addDays(d, 1)
    }
    const weekTargetDaily = dailyRate * activeDaysInWeek
    const weekSpentDaily = spends
        .filter((s) => s.date >= weekStart && s.date <= weekEnd && !excludedDates.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const weekRemainingDaily = weekTargetDaily - weekSpentDaily

    // For the SpendInput (current week only)
    const spentToday = spends
        .filter((s) => s.date === today && !excludedDates.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)


    // Week date range label e.g. "1–5 Jul"
    const rangeLabel = (() => {
        const s = new Date(`${weekStart}T00:00:00`)
        const e = new Date(`${weekEnd}T00:00:00`)
        const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7)
        const startStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: sameMonth ? undefined : 'short' })
        const endStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        return `${startStr}–${endStr}`
    })()

    return (
        <div className="group flex flex-col gap-6 rounded-3xl border border-neutral-200 bg-white p-6 transition-colors duration-200 hover:border-neutral-300">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <span className={['inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', isIncome ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'].join(' ')}>
                        {group.name}
                    </span>
                    <p className="mt-2 truncate text-lg font-bold tracking-tight text-neutral-900">{row.name}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Monthly</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                        {monthlyAmount > 0 ? `£${fmt(monthlyAmount)}` : '—'}
                    </p>
                    {monthlyAmount > 0 && (
                        <p className={['mt-0.5 text-xs font-semibold tabular-nums', monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'].join(' ')}>
                            £{fmt(Math.abs(monthlyRemaining))} {monthlyRemaining < 0 ? 'over' : 'left'}
                        </p>
                    )}
                </div>
            </div>

            {/* Weekly tracking — week slice */}
            {isWeeklySpend && weeklyBudget && (
                <>
                    <div className="rounded-2xl bg-neutral-950 p-5 text-white">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    Week allowance
                                </p>
                                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                    £{fmt(weeklyBudget.weeklyRate + weeklyBudget.carry)}
                                </p>
                                <p className="mt-0.5 text-[10px] text-neutral-500">{rangeLabel}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                    Remaining
                                </p>
                                <p className={['mt-1 text-xl font-bold tabular-nums', weeklyBudget.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'].join(' ')}>
                                    £{fmt(Math.abs(weeklyBudget.remaining))}
                                    {weeklyBudget.remaining < 0 && <span className="ml-1 text-xs font-normal">over</span>}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                    className={['h-full rounded-full transition-all duration-300', weeklyBudget.remaining >= 0 ? 'bg-emerald-400' : 'bg-red-400'].join(' ')}
                                    style={{ width: `${Math.min(100, (weeklyBudget.spentThisWeek / ((weeklyBudget.weeklyRate + weeklyBudget.carry) || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-neutral-400">
                                <span>£{fmt(weeklyBudget.spentThisWeek)} spent</span>
                                <span>£{fmt(weeklyBudget.weeklyRate + weeklyBudget.carry)}</span>
                            </div>
                        </div>

                        {weeklyBudget.carry !== 0 && (
                            <p className={['mt-3 text-xs font-medium', weeklyBudget.carry >= 0 ? 'text-emerald-400' : 'text-red-400'].join(' ')}>
                                {weeklyBudget.carry >= 0
                                    ? `+£${fmt(weeklyBudget.carry)} carry from previous weeks`
                                    : `-£${fmt(Math.abs(weeklyBudget.carry))} deficit from previous weeks`}
                            </p>
                        )}
                    </div>

                    {weeklyBudget.remaining < -0.005 && (
                        <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                            <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                            Over weekly budget by £{fmt(Math.abs(weeklyBudget.remaining))}
                        </div>
                    )}

                    {isFutureWeek && spends.filter((s) => s.date >= weekStart && s.date <= weekEnd).length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                            {spends.filter((s) => s.date >= weekStart && s.date <= weekEnd).map((t) => (
                                <li key={t._id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-neutral-800">{t.note || row.name}</p>
                                        <p className="text-xs text-neutral-400">{t.date}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-sm tabular-nums text-neutral-700">£{fmt(t.amount)}</span>
                                        <button
                                            type="button"
                                            onClick={() => onDeleteSpend(t._id)}
                                            aria-label="Delete planned transaction"
                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                        >
                                            <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {(isCurrentWeek || isFutureWeek) && (
                        <SpendInput
                            spentToday={isFutureWeek ? 0 : spentToday}
                            hasLogged={false}
                            label={isFutureWeek ? 'Plan a spend' : undefined}
                            onAdd={(a, n) => onLogSpend(row._id, a, isFutureWeek ? weekStart : today, n)}
                        />
                    )}
                </>
            )}

            {/* Daily tracking — week slice */}
            {isDailySpend && (
                <>
                    <div className="rounded-2xl bg-neutral-950 p-5 text-white">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    Week allowance
                                </p>
                                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                    £{fmt(weekTargetDaily)}
                                </p>
                                <p className="mt-0.5 text-[10px] text-neutral-500">{rangeLabel}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                    Remaining
                                </p>
                                <p className={['mt-1 text-xl font-bold tabular-nums', weekRemainingDaily >= 0 ? 'text-emerald-400' : 'text-red-400'].join(' ')}>
                                    £{fmt(Math.abs(weekRemainingDaily))}
                                    {weekRemainingDaily < 0 && <span className="ml-1 text-xs font-normal">over</span>}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4">
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                                <div
                                    className={['h-full rounded-full transition-all duration-300', weekRemainingDaily >= 0 ? 'bg-emerald-400' : 'bg-red-400'].join(' ')}
                                    style={{ width: `${Math.min(100, (weekSpentDaily / (weekTargetDaily || 1)) * 100)}%` }}
                                />
                            </div>
                            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-neutral-400">
                                <span>£{fmt(weekSpentDaily)} spent</span>
                                <span>£{fmt(weekTargetDaily)}</span>
                            </div>
                        </div>

                        <p className="mt-2 text-[10px] text-neutral-500">
                            £{fmt(dailyRate)}/day · {activeDaysInWeek} active day{activeDaysInWeek !== 1 ? 's' : ''}
                        </p>
                    </div>

                    {weekRemainingDaily < -0.005 && (
                        <div className="flex items-center gap-2.5 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                            <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                            Over week budget by £{fmt(Math.abs(weekRemainingDaily))}
                        </div>
                    )}

                    {isFutureWeek && spends.filter((s) => s.date >= weekStart && s.date <= weekEnd).length > 0 && (
                        <ul className="flex flex-col gap-1.5">
                            {spends.filter((s) => s.date >= weekStart && s.date <= weekEnd).map((t) => (
                                <li key={t._id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-neutral-800">{t.note || row.name}</p>
                                        <p className="text-xs text-neutral-400">{t.date}</p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="text-sm tabular-nums text-neutral-700">£{fmt(t.amount)}</span>
                                        <button
                                            type="button"
                                            onClick={() => onDeleteSpend(t._id)}
                                            aria-label="Delete planned transaction"
                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                        >
                                            <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {(isCurrentWeek || isFutureWeek) && (
                        <SpendInput
                            spentToday={isFutureWeek ? 0 : spentToday}
                            hasLogged={false}
                            label={isFutureWeek ? 'Plan a spend' : undefined}
                            onAdd={(a, n) => onLogSpend(row._id, a, isFutureWeek ? weekStart : today, n)}
                        />
                    )}
                </>
            )}

            {/* Tracking toggle — cycles: off → weekly → daily → off */}
            <button
                type="button"
                onClick={() => onToggleDailySpend(row)}
                className={['mt-auto inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-semibold tracking-tight transition-all duration-150 active:scale-[0.97]', isWeeklySpend || isDailySpend ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'].join(' ')}
            >
                <i className={`fa-solid fa-${isWeeklySpend || isDailySpend ? 'check' : 'toggle-off'}`} aria-hidden="true" />
                {isWeeklySpend ? 'Weekly tracking on' : isDailySpend ? 'Daily tracking on' : 'Enable tracking'}
            </button>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Budgets() {
    useMoneyHidden() // re-render this subtree when money is hidden/shown
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set())
    // Navigate by week — anchor is any date in the desired week
    const [weekAnchor, setWeekAnchor] = useState(todayKey())
    const toast = useToast()
    const invalidate = useInvalidate()
    const { user } = useAuth()

    const financeStartMonth = user?.settings?.financeStartDate?.slice(0, 7) ?? null
    const todayDate = todayKey()

    const { month, weekStart, weekEnd } = weekRangeFor(weekAnchor)
    const weekNum = weekNumberInMonth(weekAnchor)
    const totalWeeks = weeksInMonth(month)
    const isCurrentWeek = weekStart <= todayDate && todayDate <= weekEnd

    const monthLabel = new Date(`${month}-02T00:00:00`).toLocaleString('default', { month: 'long', year: 'numeric' })

    function goToPrevWeek() {
        const newAnchor = addDays(weekStart, -1)
        if (newAnchor.slice(0, 7) !== month) setLoading(true)
        setWeekAnchor(newAnchor)
    }

    function goToNextWeek() {
        const newAnchor = addDays(weekEnd, 1)
        if (newAnchor.slice(0, 7) !== month) setLoading(true)
        setWeekAnchor(newAnchor)
    }

    const atStart = !!(financeStartMonth && month <= financeStartMonth && weekNum === 1)

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
                setExcludedDates(new Set(x.map((dx) => dx.date)))
            })
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [month])

    async function handleToggleDailySpend(row: FinanceRow) {
        const newType: 'weekly' | 'daily' | null =
            row.budgetType == null ? 'weekly' : row.budgetType === 'weekly' ? 'daily' : null
        try {
            const updated = await updateRow(row._id, { budgetType: newType })
            setRows((prev) => prev.map((r) => (r._id === row._id ? updated : r)))
            invalidate('budget')
        } catch {
            toast.error("Couldn't change tracking.")
        }
    }

    async function handleLogSpend(rowId: string, amount: number, date: string, note?: string) {
        try {
            const result = await createBudgetSpend(rowId, date, amount, note)
            setSpends((prev) => [...prev, result])
            invalidate('budget')
        } catch {
            toast.error("Couldn't log that spend.")
        }
    }

    async function handleDeleteSpend(id: string) {
        try {
            await deleteBudgetSpend(id)
            setSpends((prev) => prev.filter((s) => s._id !== id))
            invalidate('budget')
        } catch {
            toast.error("Couldn't delete that transaction.")
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
        (r) => r.budgeted && rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )

    return (
        <>
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">Budgets</h1>
                    <p className="mt-1 text-sm text-neutral-500">Spending targets derived from your monthly figures.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={goToPrevWeek}
                        disabled={atStart}
                        className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none"
                    >
                        <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                    </button>

                    <div className="text-center">
                        <p className="text-sm font-bold text-neutral-900">{monthLabel} — Week {weekNum}</p>
                        <p className="text-[11px] text-neutral-400">
                            of {totalWeeks} · {new Date(`${weekStart}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–{new Date(`${weekEnd}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={goToNextWeek}
                        className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-chevron-right text-xs" aria-hidden="true" />
                    </button>

                    {!isCurrentWeek && (
                        <button
                            type="button"
                            onClick={() => { if (todayDate.slice(0, 7) !== month) setLoading(true); setWeekAnchor(todayDate) }}
                            className="ml-1 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                        >
                            Today
                        </button>
                    )}
                </div>
            </header>

            {budgetedRows.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-bookmark"
                    title="No budgets yet"
                    description="On the Monthly tab, hover a row and click the bookmark icon to add it here."
                />
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                                weekStart={weekStart}
                                weekEnd={weekEnd}
                                isCurrentWeek={isCurrentWeek}
                                isFutureWeek={weekStart > todayDate}
                                onToggleDailySpend={handleToggleDailySpend}
                                onLogSpend={handleLogSpend}
                                onDeleteSpend={handleDeleteSpend}
                            />
                        )
                    })}
                </div>
            )}
        </>
    )
}
