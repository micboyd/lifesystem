import { useEffect, useState, type FormEvent } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import Drawer from '../components/Drawer'
import Button from '../components/Button'
import {
    listRows,
    listGroups,
    listEntries,
    updateRow,
    listBudgetSpends,
    createBudgetSpend,
    deleteBudgetSpend,
    listBudgetExclusions,
    listStarlingSpaces,
    syncStarlingSpace,
    getStarlingReconciliation,
    type StarlingReconciliation,
} from '../services/finances'
import { rowVisibleInMonth } from '../lib/finance'
import { computeBudgetDay, computeBudgetWeek, daysInMonth, clampedWeekRange } from '../lib/budget'
import { formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import { useInvalidate } from '../context/DataSyncContext'
import type {
    FinanceGroup,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
    StarlingSpace,
    StarlingMovementReason,
} from '../types'

// Balance/remaining differences smaller than this are rounding noise, not a real mismatch.
const RECONCILE_EPSILON = 0.005

const MOVEMENT_INFO: Record<StarlingMovementReason, { label: string; icon: string; tone: string }> = {
    transfer_in: { label: 'Transferred into space', icon: 'fa-arrow-down', tone: 'bg-emerald-50 text-emerald-600' },
    transfer_out: { label: 'Transferred out of space', icon: 'fa-arrow-up', tone: 'bg-amber-50 text-amber-600' },
    refund: { label: 'Refund received (not deducted)', icon: 'fa-rotate-left', tone: 'bg-emerald-50 text-emerald-600' },
    declined: { label: 'Card payment declined', icon: 'fa-ban', tone: 'bg-neutral-100 text-neutral-500' },
    reversed: { label: 'Payment reversed', icon: 'fa-rotate-left', tone: 'bg-neutral-100 text-neutral-500' },
}

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

// ── Monthly overview ──────────────────────────────────────────────────────────

interface MonthRowStat {
    name: string
    budget: number
    spent: number
}

interface MonthlyOverviewProps {
    rows: FinanceRow[]
    groups: FinanceGroup[]
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excludedDates: Set<string>
    month: string
}

function MonthlyOverview({ rows, groups, entries, spends, excludedDates, month }: MonthlyOverviewProps) {
    const [open, setOpen] = useState(false)

    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`

    const stats: MonthRowStat[] = rows.map((row) => {
        const entry = entries.find((e) => e.row === row._id)
        const budget = entry?.amount ?? row.recurringAmount ?? 0
        const spent = spends
            .filter((s) => s.row === row._id && s.date >= monthStart && s.date <= monthEnd && !excludedDates.has(s.date))
            .reduce((sum, s) => sum + s.amount, 0)
        const group = groups.find((g) => g._id === row.group)
        // Flip income rows — "spent" is money received, "budget" is the income target
        const isIncome = group?.type === 'income'
        return { name: row.name, budget: isIncome ? 0 : budget, spent: isIncome ? 0 : spent }
    }).filter((s) => s.budget > 0)

    const totalBudget = stats.reduce((sum, s) => sum + s.budget, 0)
    const totalSpent = stats.reduce((sum, s) => sum + s.spent, 0)
    const totalRemaining = totalBudget - totalSpent
    const overallPct = totalBudget > 0 ? Math.min(100, (totalSpent / totalBudget) * 100) : 0

    if (stats.length === 0) return null

    return (
        <div className="mb-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-neutral-50"
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-neutral-800">Monthly overview</span>
                    <span className={`text-xs font-semibold tabular-nums ${totalRemaining < 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                        £{fmt(Math.abs(totalRemaining))} {totalRemaining < 0 ? 'over' : 'remaining'}
                    </span>
                </div>
                <i className={`fa-solid fa-chevron-down text-[10px] text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>

            {open && (
                <div className="border-t border-neutral-100 px-5 py-4 flex flex-col gap-4">
                    {/* Overall progress */}
                    <div>
                        <div className="mb-1.5 flex items-baseline justify-between gap-2">
                            <span className="text-xs font-semibold text-neutral-500">Total</span>
                            <span className="text-xs tabular-nums text-neutral-400">
                                £{fmt(totalSpent)} of £{fmt(totalBudget)}
                            </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${overallPct >= 100 ? 'bg-red-400' : overallPct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                style={{ width: `${overallPct}%` }}
                            />
                        </div>
                    </div>

                    {/* Per-row breakdown */}
                    <div className="flex flex-col gap-3">
                        {stats.map((s) => {
                            const pct = s.budget > 0 ? Math.min(100, (s.spent / s.budget) * 100) : 0
                            const remaining = s.budget - s.spent
                            return (
                                <div key={s.name}>
                                    <div className="mb-1 flex items-baseline justify-between gap-2">
                                        <span className="truncate text-xs font-semibold text-neutral-700">{s.name}</span>
                                        <span className={`shrink-0 text-xs tabular-nums ${remaining < 0 ? 'text-red-500' : 'text-neutral-400'}`}>
                                            {remaining < 0 ? '-' : ''}£{fmt(Math.abs(remaining))} {remaining < 0 ? 'over' : 'left'} · £{fmt(s.budget)}
                                        </span>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${pct >= 100 ? 'bg-red-400' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── Link-a-Space modal ────────────────────────────────────────────────────────

interface LinkSpaceModalProps {
    row: FinanceRow
    spaces: StarlingSpace[]
    loading: boolean
    error: boolean
    onClose: () => void
    onChoose: (categoryUid: string | null) => Promise<void>
}

function LinkSpaceModal({ row, spaces, loading, error, onClose, onChoose }: LinkSpaceModalProps) {
    const [busy, setBusy] = useState(false)
    const current = row.starlingCategoryUid ?? null

    async function choose(uid: string | null) {
        setBusy(true)
        try {
            await onChoose(uid)
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal open onClose={onClose} title={`Link "${row.name}" to a bank space`} size="sm">
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Pick the Starling Space this budget tracks. Card spending from that space will
                    be pulled in as transactions when you sync.
                </p>

                {loading ? (
                    <div className="grid place-items-center py-8">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Couldn't reach Starling. Check the access token is set on the server.
                    </div>
                ) : spaces.length === 0 ? (
                    <div className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-500">
                        No spaces found on your Starling account.
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {spaces.map((s) => {
                            const selected = s.id === current
                            return (
                                <button
                                    key={s.id}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => choose(selected ? null : s.id)}
                                    className={[
                                        'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-50',
                                        selected
                                            ? 'border-neutral-950 bg-neutral-950 text-white'
                                            : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50',
                                    ].join(' ')}
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{s.name}</p>
                                        <p className="text-xs text-neutral-400">
                                            {s.type === 'spending' ? 'Spending space' : 'Savings goal'}{' '}
                                            · £{fmt(s.balance)}
                                        </p>
                                    </div>
                                    {selected && (
                                        <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}

                {current && (
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="fa-solid fa-link-slash"
                        disabled={busy}
                        onClick={() => choose(null)}
                        className="self-start"
                    >
                        Unlink this budget
                    </Button>
                )}
            </div>
        </Modal>
    )
}

// ── Reconciliation drawer ─────────────────────────────────────────────────────

interface ReconcileDrawerProps {
    row: FinanceRow
    monthlyRemaining: number
    fallbackBalance: number | undefined
    loading: boolean
    error: boolean
    data: StarlingReconciliation | null
    onClose: () => void
}

function ReconcileDrawer({
    row, monthlyRemaining, fallbackBalance, loading, error, data, onClose,
}: ReconcileDrawerProps) {
    const balance = data?.balance ?? fallbackBalance ?? null
    const diff = balance !== null ? balance - monthlyRemaining : null

    return (
        <Drawer open onClose={onClose} title={`"${row.name}" out of sync`} size="md">
            <div className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-neutral-50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Space balance
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">
                            {balance !== null ? `£${fmt(balance)}` : '—'}
                        </p>
                    </div>
                    <div className="rounded-xl bg-neutral-50 px-4 py-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            Budget remaining
                        </p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-neutral-900">
                            £{fmt(monthlyRemaining)}
                        </p>
                    </div>
                </div>

                {diff !== null && Math.abs(diff) > RECONCILE_EPSILON && (
                    <div
                        className={[
                            'rounded-xl px-4 py-3 text-sm font-semibold',
                            diff > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
                        ].join(' ')}
                    >
                        {diff > 0
                            ? `The space has £${fmt(diff)} more than the budget expects.`
                            : `The space has £${fmt(Math.abs(diff))} less than the budget expects.`}
                    </div>
                )}

                {loading && (
                    <div className="grid place-items-center py-8">
                        <Spinner />
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                        Couldn't load the details from Starling.
                    </div>
                )}

                {!loading && !error && data && (
                    data.movements.length === 0 ? (
                        <p className="text-sm text-neutral-500">
                            No transfers, refunds, or declined payments found this month — the
                            difference may be a balance carried over from before.
                        </p>
                    ) : (
                        <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                                What moved this month
                            </p>
                            <ul className="flex flex-col gap-1.5">
                                {data.movements.map((m, i) => {
                                    const info = MOVEMENT_INFO[m.reason]
                                    return (
                                        <li
                                            key={i}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2"
                                        >
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <span
                                                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${info.tone}`}
                                                >
                                                    <i className={`fa-solid ${info.icon}`} aria-hidden="true" />
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-neutral-800">
                                                        {info.label}
                                                    </p>
                                                    <p className="text-xs text-neutral-400">
                                                        {m.date}
                                                        {m.counterPartyName ? ` · ${m.counterPartyName}` : ''}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="shrink-0 text-sm tabular-nums text-neutral-700">
                                                {m.direction === 'IN' ? '+' : '-'}£{fmt(m.amount)}
                                            </span>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>
                    )
                )}
            </div>
        </Drawer>
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
    starlingEnabled: boolean
    linkedSpace: StarlingSpace | undefined
    syncing: boolean
    onToggleDailySpend: (row: FinanceRow) => void
    onLogSpend: (rowId: string, amount: number, date: string, note?: string) => Promise<void>
    onDeleteSpend: (id: string) => Promise<void>
    onOpenLink: (row: FinanceRow) => void
    onSync: (row: FinanceRow) => void
    onOpenReconcile: (row: FinanceRow) => void
}

function BudgetCard({
    row, group, entry, spends, excludedDates,
    weekStart, weekEnd, isCurrentWeek, isFutureWeek,
    starlingEnabled, linkedSpace, syncing,
    onToggleDailySpend, onLogSpend, onDeleteSpend, onOpenLink, onSync, onOpenReconcile,
}: BudgetCardProps) {
    const isLinked = !!row.starlingCategoryUid
    const isDailySpend = row.budgetType === 'daily'
    const isWeeklySpend = row.budgetType === 'weekly'
    const isIncome = group.type === 'income'
    const today = todayKey()

    // Monthly overview — always based on the month the week sits in.
    // computeBudgetDay gives monthlyAmount / monthlyRemaining regardless of the day param.
    const monthRef = computeBudgetDay(row, entry, spends, weekStart, excludedDates)
    const { monthlyAmount, monthlyRemaining } = monthRef

    // Space balance vs budget remaining — only meaningful once linked and budgeted.
    const canReconcile = isLinked && !!linkedSpace && monthlyAmount > 0
    const outOfSync = canReconcile && Math.abs(linkedSpace!.balance - monthlyRemaining) > RECONCILE_EPSILON

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
                    {outOfSync && (
                        <button
                            type="button"
                            onClick={() => onOpenReconcile(row)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-200"
                        >
                            <i className="fa-solid fa-triangle-exclamation text-[9px]" aria-hidden="true" />
                            Out of sync
                        </button>
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

            <div className="mt-auto flex flex-col gap-3">
                {/* Starling Space link — mirror card spending into this budget */}
                {starlingEnabled && (
                    isLinked ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => onOpenLink(row)}
                                className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100"
                                title="Change or unlink the bank space"
                            >
                                <i className="fa-solid fa-building-columns text-[10px]" aria-hidden="true" />
                                <span className="truncate">{linkedSpace?.name ?? 'Linked space'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onSync(row)}
                                disabled={syncing}
                                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200 disabled:opacity-50"
                            >
                                <i className={`fa-solid fa-arrows-rotate text-[10px] ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                                {syncing ? 'Syncing…' : 'Sync'}
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onOpenLink(row)}
                            className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
                        >
                            <i className="fa-solid fa-building-columns text-[10px]" aria-hidden="true" />
                            Link a bank space
                        </button>
                    )
                )}

                {/* Tracking toggle — cycles: off → weekly → daily → off */}
                <button
                    type="button"
                    onClick={() => onToggleDailySpend(row)}
                    className={['inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-xs font-semibold tracking-tight transition-all duration-150 active:scale-[0.97]', isWeeklySpend || isDailySpend ? 'bg-neutral-950 text-white hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'].join(' ')}
                >
                    <i className={`fa-solid fa-${isWeeklySpend || isDailySpend ? 'check' : 'toggle-off'}`} aria-hidden="true" />
                    {isWeeklySpend ? 'Weekly tracking on' : isDailySpend ? 'Daily tracking on' : 'Enable tracking'}
                </button>
            </div>
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
    // Starling Bank linking
    const [spaces, setSpaces] = useState<StarlingSpace[]>([])
    const [starlingEnabled, setStarlingEnabled] = useState(false)
    const [spacesLoading, setSpacesLoading] = useState(false)
    const [spacesError, setSpacesError] = useState(false)
    const [linkModalRow, setLinkModalRow] = useState<FinanceRow | null>(null)
    const [syncingRowId, setSyncingRowId] = useState<string | null>(null)
    const [reconcileRow, setReconcileRow] = useState<FinanceRow | null>(null)
    const [reconcileLoading, setReconcileLoading] = useState(false)
    const [reconcileError, setReconcileError] = useState(false)
    const [reconcileData, setReconcileData] = useState<StarlingReconciliation | null>(null)
    const toast = useToast()
    const invalidate = useInvalidate()

    const todayDate = todayKey()

    const { month, weekStart, weekEnd } = clampedWeekRange(weekAnchor)
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

    // Load Starling Spaces once. A 501 means the feature isn't configured on the
    // server — hide it silently. Any other failure leaves it enabled but flagged.
    useEffect(() => {
        let active = true
        setSpacesLoading(true)
        listStarlingSpaces()
            .then((s) => {
                if (!active) return
                setSpaces(s)
                setStarlingEnabled(true)
                setSpacesError(false)
            })
            .catch((err) => {
                if (!active) return
                if (err?.response?.status === 501) {
                    setStarlingEnabled(false)
                } else {
                    setStarlingEnabled(true)
                    setSpacesError(true)
                }
            })
            .finally(() => active && setSpacesLoading(false))
        return () => { active = false }
    }, [])

    async function handleChooseSpace(categoryUid: string | null) {
        if (!linkModalRow) return
        try {
            const updated = await updateRow(linkModalRow._id, { starlingCategoryUid: categoryUid })
            setRows((prev) => prev.map((r) => (r._id === updated._id ? updated : r)))
            setLinkModalRow(null)
            toast.show(categoryUid ? 'Budget linked to bank space.' : 'Budget unlinked.', 'success')
        } catch {
            toast.error("Couldn't update the bank link.")
        }
    }

    function openReconcile(row: FinanceRow) {
        setReconcileRow(row)
        setReconcileData(null)
        setReconcileError(false)
        setReconcileLoading(true)
        getStarlingReconciliation(row._id, month)
            .then((data) => setReconcileData(data))
            .catch(() => setReconcileError(true))
            .finally(() => setReconcileLoading(false))
    }

    async function handleSync(row: FinanceRow) {
        setSyncingRowId(row._id)
        try {
            const result = await syncStarlingSpace(row._id, month)
            const fresh = await listBudgetSpends({ month })
            setSpends(fresh)
            // Refresh the balance we already hold locally so the "out of sync" badge
            // reflects reality immediately, without a second Starling round trip.
            if (result.balance !== null && row.starlingCategoryUid) {
                const categoryUid = row.starlingCategoryUid
                setSpaces((prev) =>
                    prev.map((s) => (s.id === categoryUid ? { ...s, balance: result.balance! } : s))
                )
            }
            invalidate('budget')
            const parts: string[] = []
            if (result.imported > 0) parts.push(`imported ${result.imported}`)
            if (result.removed > 0) parts.push(`removed ${result.removed}`)
            toast.show(
                parts.length > 0
                    ? `Synced — ${parts.join(', ')} transaction${
                          result.imported + result.removed === 1 ? '' : 's'
                      }.`
                    : 'Up to date — no changes.',
                'success'
            )
        } catch {
            toast.error("Couldn't sync from Starling.")
        } finally {
            setSyncingRowId(null)
        }
    }

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
                        className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
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

            <MonthlyOverview
                rows={budgetedRows}
                groups={groups}
                entries={entries}
                spends={spends}
                excludedDates={excludedDates}
                month={month}
            />

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
                                starlingEnabled={starlingEnabled}
                                linkedSpace={spaces.find((s) => s.id === row.starlingCategoryUid)}
                                syncing={syncingRowId === row._id}
                                onToggleDailySpend={handleToggleDailySpend}
                                onLogSpend={handleLogSpend}
                                onDeleteSpend={handleDeleteSpend}
                                onOpenLink={setLinkModalRow}
                                onSync={handleSync}
                                onOpenReconcile={openReconcile}
                            />
                        )
                    })}
                </div>
            )}

            {linkModalRow && (
                <LinkSpaceModal
                    row={linkModalRow}
                    spaces={spaces}
                    loading={spacesLoading}
                    error={spacesError}
                    onClose={() => setLinkModalRow(null)}
                    onChoose={handleChooseSpace}
                />
            )}

            {reconcileRow && (
                <ReconcileDrawer
                    row={reconcileRow}
                    monthlyRemaining={
                        computeBudgetDay(
                            reconcileRow,
                            entries.find((e) => e.row === reconcileRow._id),
                            spends.filter((s) => s.row === reconcileRow._id),
                            weekStart,
                            excludedDates
                        ).monthlyRemaining
                    }
                    fallbackBalance={spaces.find((s) => s.id === reconcileRow.starlingCategoryUid)?.balance}
                    loading={reconcileLoading}
                    error={reconcileError}
                    data={reconcileData}
                    onClose={() => setReconcileRow(null)}
                />
            )}
        </>
    )
}
