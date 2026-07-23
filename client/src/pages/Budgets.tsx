import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'
import Drawer from '../components/Drawer'
import Button from '../components/Button'
import DropdownMenu, { type MenuEntry } from '../components/DropdownMenu'
import { Card } from '../components/Card'
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
    listStarlingExclusions,
    recoverStarlingExclusion,
    listBudgetTopUps,
    createBudgetTopUp,
    deleteBudgetTopUp,
} from '../services/finances'
import { rowVisibleInMonth, recurringAmountForMonth } from '../lib/finance'
import { computeBudgetDay, computeBudgetWeek, daysInMonth, clampedWeekRange, netBudgetAdjustment, refillTotal } from '../lib/budget'
import { diagnoseGap, type ExplainedMovement } from '../lib/reconcile'
import { formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import { useInvalidate } from '../context/DataSyncContext'
import type {
    FinanceGroup,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
    BudgetTopUp,
    StarlingSpace,
    StarlingMovementReason,
    StarlingExclusion,
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

/** First/last calendar date of each week number in the month (Monday-starting). */
function monthWeekBounds(month: string): Map<number, { start: string; end: string }> {
    const bounds = new Map<number, { start: string; end: string }>()
    const total = daysInMonth(month)
    for (let d = 1; d <= total; d++) {
        const date = `${month}-${String(d).padStart(2, '0')}`
        const wn = weekNumberInMonth(date)
        const existing = bounds.get(wn)
        if (existing) existing.end = date
        else bounds.set(wn, { start: date, end: date })
    }
    return bounds
}

/** e.g. "1–5 Jul", or just "5 Jul" for a single-day range. */
function formatDateRange(start: string, end: string): string {
    const s = new Date(`${start}T00:00:00`)
    const startStr = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    if (start === end) return startStr
    const e = new Date(`${end}T00:00:00`)
    const endStr = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${startStr}–${endStr}`
}

/** 1st, 2nd, 3rd, 4th... */
function ordinal(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
    switch (n % 10) {
        case 1: return `${n}st`
        case 2: return `${n}nd`
        case 3: return `${n}rd`
        default: return `${n}th`
    }
}

/** e.g. "Monday 2nd of June" — a day-group header. */
function formatDayHeader(date: string): string {
    const d = new Date(`${date}T00:00:00`)
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' })
    const month = d.toLocaleDateString('en-GB', { month: 'long' })
    return `${weekday} ${ordinal(d.getDate())} of ${month}`
}

/** e.g. "Sat 19 Jul" — compact, human-readable date for list rows and captions. */
function formatShortDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

interface DayGroup {
    date: string
    items: BudgetSpend[]
}

interface WeekGroup {
    weekNum: number
    days: DayGroup[]
}

/** This month's spends for a row, bucketed by week then by day, chronologically. */
function groupSpendsByWeek(month: string, spends: BudgetSpend[]): WeekGroup[] {
    const weekBuckets = new Map<number, Map<string, BudgetSpend[]>>()
    for (const s of spends) {
        if (s.date.slice(0, 7) !== month) continue
        const wn = weekNumberInMonth(s.date)
        if (!weekBuckets.has(wn)) weekBuckets.set(wn, new Map())
        const dayBuckets = weekBuckets.get(wn)!
        if (!dayBuckets.has(s.date)) dayBuckets.set(s.date, [])
        dayBuckets.get(s.date)!.push(s)
    }
    return Array.from(weekBuckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([weekNum, dayBuckets]) => ({
            weekNum,
            days: Array.from(dayBuckets.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, items]) => ({ date, items })),
        }))
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

// ── Top up ────────────────────────────────────────────────────────────────────

type AdjustVariant = 'topup' | 'refill' | 'withdrawal'

interface AdjustFormProps {
    /** 'topup' adds spendable budget; 'refill' records money moved back into the
     * linked space (e.g. from the day-off pot) without raising the budget;
     * 'withdrawal' takes money out of the budget for something else, lowering
     * what's left (and the daily/weekly allowance) from today onward. */
    variant: AdjustVariant
    /** Prefill for the amount field — for refills, the amount still owed. */
    suggestedAmount?: number
    onAdd: (amount: number, note?: string) => Promise<void>
    onCancel: () => void
}

const ADJUST_VARIANTS: Record<AdjustVariant, { title: string; hint: string; notePlaceholder: string }> = {
    topup: {
        title: 'Top up',
        hint: 'Adds spendable budget from today onward.',
        notePlaceholder: 'Label (optional) — e.g. birthday money',
    },
    refill: {
        title: 'Refill space',
        hint: 'Puts money back into the linked space without raising the budget.',
        notePlaceholder: "Label (optional) — e.g. covering Saturday's day off",
    },
    withdrawal: {
        title: 'Withdraw',
        hint: 'Takes money out of the budget, lowering what’s left from today onward.',
        notePlaceholder: 'Label (optional) — e.g. moved to holiday fund',
    },
}

/** Inline money-adjustment form — a credit or debit, not a spend. Opened from
 * the card's actions menu; the variant only changes the copy, not the colour, so
 * the card stays monochrome. The submitted `kind` carries the meaning instead. */
function AdjustForm({ variant, suggestedAmount, onAdd, onCancel }: AdjustFormProps) {
    const [draft, setDraft] = useState(suggestedAmount && suggestedAmount > 0 ? suggestedAmount.toFixed(2) : '')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const copy = ADJUST_VARIANTS[variant]

    async function submit(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(draft.trim())
        if (Number.isNaN(n) || n <= 0) return
        setSaving(true)
        try {
            await onAdd(n, note.trim() || undefined)
            onCancel()
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={submit} className="flex w-full flex-col gap-2 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-700">{copy.title}</span>
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label="Cancel"
                    className="grid h-6 w-6 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                </button>
            </div>
            <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-neutral-400">£</span>
                    <input
                        autoFocus
                        type="number"
                        step="0.01"
                        min="0.01"
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
                    {saving ? '…' : 'Add'}
                </button>
            </div>
            <input
                type="text"
                placeholder={copy.notePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                className="w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm placeholder:text-neutral-300 transition-colors focus:border-neutral-950 focus:outline-none focus:ring-4 focus:ring-neutral-950/5"
            />
            <p className="text-[11px] text-neutral-400">{copy.hint}</p>
        </form>
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
    topUps: BudgetTopUp[]
    excludedDates: Set<string>
    month: string
}

function MonthlyOverview({ rows, groups, entries, spends, topUps, excludedDates, month }: MonthlyOverviewProps) {
    const [open, setOpen] = useState(false)

    const monthStart = `${month}-01`
    const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`

    const stats: MonthRowStat[] = rows.map((row) => {
        const entry = entries.find((e) => e.row === row._id)
        // Top-ups add and withdrawals subtract; refills square the bank space, not
        // the budget, so they're left out here.
        const topUpTotal = netBudgetAdjustment(
            topUps.filter((t) => t.row === row._id && t.date >= monthStart && t.date <= monthEnd)
        )
        const budget = (entry?.amount ?? recurringAmountForMonth(row, month) ?? 0) + topUpTotal
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
    /** This row's Starling-imported spends dated on excluded (day-off) days —
     * they left the space but count toward the day-off pot, so they explain part
     * of any mismatch. Manual day-off logs are left out: they may not have been
     * paid from the space at all. */
    excludedDaySpends: BudgetSpend[]
    /** The row's base budget for the month — used to recognise the funding transfer. */
    monthlyAmount: number
    /** Every top-up and refill recorded for this row this month. */
    topUps: BudgetTopUp[]
    fallbackBalance: number | undefined
    loading: boolean
    error: boolean
    data: StarlingReconciliation | null
    /** Record an unaccounted movement straight from the diagnosis list — a credit
     * as a top-up/refill, or an outbound transfer as a withdrawal. */
    onRecordCredit: (amount: number, kind: 'topup' | 'refill' | 'withdrawal', note?: string) => Promise<void>
    onClose: () => void
}

function ReconcileDrawer({
    row, monthlyRemaining, excludedDaySpends, monthlyAmount, topUps, fallbackBalance,
    loading, error, data, onRecordCredit, onClose,
}: ReconcileDrawerProps) {
    const [recordingKey, setRecordingKey] = useState<string | null>(null)
    const refills = topUps.filter((t) => t.kind === 'refill')
    const balance = data?.balance ?? fallbackBalance ?? null
    const diff = balance !== null ? balance - monthlyRemaining : null
    const excludedTotal = excludedDaySpends.reduce((sum, s) => sum + s.amount, 0)
    const refilledTotal = refills.reduce((sum, t) => sum + t.amount, 0)
    // Day-off spends lower the balance without touching the budget, and refills
    // raise it back without touching the budget either — net both off to see
    // what's left over once those known differences are accounted for.
    const unexplained = diff !== null ? diff + excludedTotal - refilledTotal : null
    const refillOwed = Math.max(0, excludedTotal - refilledTotal)

    // Hunt for the movements behind a real gap: match bank movements against the
    // ledger (funding, top-ups, refills), then search the unrecorded remainder
    // for the combination that adds up to the gap exactly.
    const diagnosis =
        unexplained !== null && Math.abs(unexplained) > RECONCILE_EPSILON && data
            ? diagnoseGap(unexplained, data.movements, monthlyAmount, topUps)
            : null

    async function record(key: string, amount: number, kind: 'topup' | 'refill' | 'withdrawal', note: string) {
        setRecordingKey(key)
        try {
            await onRecordCredit(amount, kind, note)
        } finally {
            setRecordingKey(null)
        }
    }

    /** One unrecorded movement with its fix actions: credits can be recorded as
     * a refill (cash back into the space) or a top-up (extra budget); an outbound
     * transfer can be recorded as a withdrawal (money taken out of the budget for
     * something else), which lowers the budget to match the space. */
    function renderUnrecorded(e: ExplainedMovement, key: string) {
        const m = e.movement
        const info = MOVEMENT_INFO[m.reason]
        const note = `${info.label}${m.counterPartyName ? ` — ${m.counterPartyName}` : ''} · ${formatShortDate(m.date)}`
        // A refund restores money the budget already counted as spent, so
        // top-up (budget + cash) is the natural fix; a plain transfer in is
        // usually day-off cover, so refill (cash only) comes first.
        const actions: { kind: 'topup' | 'refill'; label: string }[] =
            m.reason === 'refund'
                ? [{ kind: 'topup', label: 'Record as top-up' }, { kind: 'refill', label: 'Record as refill' }]
                : [{ kind: 'refill', label: 'Record as refill' }, { kind: 'topup', label: 'Record as top-up' }]
        return (
            <li key={key} className="flex flex-col gap-2 rounded-xl border border-neutral-100 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${info.tone}`}>
                            <i className={`fa-solid ${info.icon}`} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-neutral-800">{info.label}</p>
                            <p className="text-xs text-neutral-400">
                                {formatShortDate(m.date)}
                                {m.counterPartyName ? ` · ${m.counterPartyName}` : ''}
                            </p>
                        </div>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-neutral-700">
                        {e.effect > 0 ? '+' : '-'}£{fmt(Math.abs(e.effect))}
                    </span>
                </div>
                {e.effect > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pl-9">
                        {actions.map((a) => (
                            <button
                                key={a.kind}
                                type="button"
                                disabled={recordingKey !== null}
                                onClick={() => record(key, e.effect, a.kind, note)}
                                className={[
                                    'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40',
                                    a.kind === 'refill'
                                        ? 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
                                ].join(' ')}
                            >
                                {recordingKey === key ? '…' : a.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-1.5 pl-9">
                        <button
                            type="button"
                            disabled={recordingKey !== null}
                            onClick={() => record(key, Math.abs(e.effect), 'withdrawal', note)}
                            className="self-start rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                        >
                            {recordingKey === key ? '…' : 'Record as withdrawal'}
                        </button>
                        <p className="text-xs text-neutral-400">
                            Records money you took out of this budget for something else, lowering
                            what's left to match the space. Or move it back in at the bank, or delete
                            a matching top-up if one exists.
                        </p>
                    </div>
                )}
            </li>
        )
    }

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

                {diff !== null &&
                    unexplained !== null &&
                    (Math.abs(diff) > RECONCILE_EPSILON || Math.abs(unexplained) > RECONCILE_EPSILON) && (
                        <div
                            className={[
                                'rounded-xl px-4 py-3 text-sm font-semibold',
                                unexplained >= -RECONCILE_EPSILON
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-red-50 text-red-600',
                            ].join(' ')}
                        >
                            {Math.abs(unexplained) <= RECONCILE_EPSILON
                                ? `The space is £${fmt(Math.abs(diff))} ${diff < 0 ? 'below' : 'above'} the budget figure, but all of that is day-off spending that left the space${refilledTotal > RECONCILE_EPSILON ? ' (less what you’ve refilled)' : ''} — nothing is actually adrift.`
                                : unexplained > 0
                                    ? `The space has £${fmt(unexplained)} more than the budget expects${excludedTotal > RECONCILE_EPSILON ? ` (after allowing for £${fmt(excludedTotal)} of day-off spending that left the space${refilledTotal > RECONCILE_EPSILON ? ` and £${fmt(refilledTotal)} refilled` : ''})` : ''}.`
                                    : `The space has £${fmt(Math.abs(unexplained))} less than the budget expects${excludedTotal > RECONCILE_EPSILON ? ` (after allowing for £${fmt(excludedTotal)} of day-off spending that left the space${refilledTotal > RECONCILE_EPSILON ? ` and £${fmt(refilledTotal)} refilled` : ''})` : ''}.`}
                        </div>
                    )}

                {/* Automatic diagnosis — pin the gap on specific movements */}
                {diagnosis && (
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                            Where the difference comes from
                        </p>

                        {/* Recorded top-ups/withdrawals with no matching bank transfer */}
                        {diagnosis.ghostRecords.map((t) => {
                            const kindLabel =
                                t.kind === 'refill' ? 'refill' : t.kind === 'withdrawal' ? 'withdrawal' : 'top-up'
                            return (
                                <div key={t._id} className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                    You recorded a £{fmt(t.amount)} {kindLabel} on {formatShortDate(t.date)}
                                    {t.note ? ` (“${t.note}”)` : ''} but no matching transfer{' '}
                                    {t.kind === 'withdrawal' ? 'left' : 'reached'} the space — make the transfer,
                                    or delete the record from the budget card.
                                </div>
                            )
                        })}

                        {diagnosis.culprits ? (
                            <>
                                <p className="text-sm text-neutral-500">
                                    {diagnosis.culprits.length === 1
                                        ? `This movement isn't recorded in the budget and accounts for the £${fmt(Math.abs(unexplained!))} difference exactly:`
                                        : `These ${diagnosis.culprits.length} movements aren't recorded in the budget and add up to the £${fmt(Math.abs(unexplained!))} difference exactly:`}
                                </p>
                                <ul className="flex flex-col gap-1.5">
                                    {diagnosis.culprits.map((e, i) => renderUnrecorded(e, `culprit-${i}`))}
                                </ul>
                            </>
                        ) : diagnosis.unaccounted.length > 0 ? (
                            <>
                                <p className="text-sm text-neutral-500">
                                    No combination of movements matches the gap exactly, but these
                                    aren't recorded in the budget and are the likely cause:
                                </p>
                                <ul className="flex flex-col gap-1.5">
                                    {diagnosis.unaccounted.map((e, i) => renderUnrecorded(e, `unaccounted-${i}`))}
                                </ul>
                                {Math.abs(diagnosis.residualAfterAll) > RECONCILE_EPSILON && (
                                    <p className="text-xs text-neutral-400">
                                        Even counting all of these, £{fmt(Math.abs(diagnosis.residualAfterAll))}{' '}
                                        remains unexplained — most likely money that was already in the
                                        space before this month, or a transaction that was edited or
                                        deleted after import.
                                    </p>
                                )}
                            </>
                        ) : diagnosis.ghostRecords.length === 0 ? (
                            <p className="text-sm text-neutral-500">
                                Every movement this month is already reflected in the budget, so the
                                difference predates this month — most likely money that was already in
                                the space on the 1st, or a transaction edited or deleted after import.
                            </p>
                        ) : null}
                    </div>
                )}

                {/* Day-off spending — left the space, but counts toward the pot */}
                {excludedDaySpends.length > 0 && (
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                            Day-off spending
                        </p>
                        <p className="mb-2 text-sm text-neutral-500">
                            These were paid from the space on excluded days, so they count toward
                            your day-off pot instead of this budget.
                        </p>
                        <ul className="flex flex-col gap-1.5">
                            {excludedDaySpends.map((s) => (
                                <li
                                    key={s._id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-neutral-800">
                                            {s.note || row.name}
                                        </p>
                                        <p className="text-xs text-neutral-400">{formatShortDate(s.date)}</p>
                                    </div>
                                    <span className="shrink-0 text-sm tabular-nums text-neutral-700">
                                        -£{fmt(s.amount)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Refills — money put back into the space, doesn't raise the budget */}
                {refills.length > 0 && (
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                            Refilled from day-off pot
                        </p>
                        <ul className="flex flex-col gap-1.5">
                            {refills.map((t) => (
                                <li
                                    key={t._id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-sky-800">
                                            {t.note || 'Refill'}
                                        </p>
                                        <p className="text-xs text-sky-600/70">{formatShortDate(t.date)}</p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold tabular-nums text-sky-700">
                                        +£{fmt(t.amount)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Suggested refill — square the space without touching the budget */}
                {refillOwed > RECONCILE_EPSILON && (
                    <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
                        £{fmt(refillOwed)} of day-off spending hasn't been refilled yet. Move
                        £{fmt(refillOwed)} from your day-off pot into the space, then record it
                        with "Refill space" on the budget card — it squares the balance without
                        raising the budget.
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
                                                        {formatShortDate(m.date)}
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

// ── Removed transactions drawer ───────────────────────────────────────────────

interface RemovedTransactionsDrawerProps {
    open: boolean
    exclusions: StarlingExclusion[]
    recoveringId: string | null
    onClose: () => void
    onRecover: (id: string) => void
}

function RemovedTransactionsDrawer({
    open, exclusions, recoveringId, onClose, onRecover,
}: RemovedTransactionsDrawerProps) {
    return (
        <Drawer open={open} onClose={onClose} title="Removed transactions" size="md">
            {exclusions.length === 0 ? (
                <p className="text-sm text-neutral-500">
                    Nothing here — deleted or moved Starling transactions show up in this list so
                    you can bring them back.
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {exclusions.map((x) => (
                        <li
                            key={x._id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-3"
                        >
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-neutral-800">
                                    {x.note || 'Transaction'}
                                </p>
                                <p className="text-xs text-neutral-400">
                                    {formatShortDate(x.date)} · £{fmt(x.amount)}
                                </p>
                                <p className="mt-0.5 text-xs text-neutral-400">
                                    {x.reason === 'deleted'
                                        ? `Deleted from ${x.originalRowName}`
                                        : `Moved from ${x.originalRowName} to ${x.movedToRowName}`}
                                </p>
                            </div>
                            <Button
                                variant="secondary"
                                size="sm"
                                icon="fa-solid fa-arrow-rotate-left"
                                disabled={recoveringId === x._id}
                                onClick={() => onRecover(x._id)}
                                className="shrink-0"
                            >
                                {recoveringId === x._id ? '…' : 'Recover'}
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Drawer>
    )
}

// ── All transactions drawer ───────────────────────────────────────────────────

interface AllTransactionsDrawerProps {
    row: FinanceRow
    month: string
    spends: BudgetSpend[]
    topUps: BudgetTopUp[]
    onClose: () => void
    onDelete: (id: string) => Promise<void>
    onDeleteTopUp: (id: string) => Promise<void>
}

function AllTransactionsDrawer({ row, month, spends, topUps, onClose, onDelete, onDeleteTopUp }: AllTransactionsDrawerProps) {
    const weeks = groupSpendsByWeek(month, spends)
    const bounds = monthWeekBounds(month)
    const monthTotal = weeks.reduce(
        (sum, w) => sum + w.days.reduce((s, d) => s + d.items.reduce((s2, t) => s2 + t.amount, 0), 0),
        0
    )
    // Adjustments (top-ups, withdrawals, refills) moved off the card face into
    // here — they're history, not a live action. Newest first.
    const adjustments = [...topUps].sort((a, b) => b.date.localeCompare(a.date))

    return (
        <Drawer open onClose={onClose} title={row.name} badge={`£${fmt(monthTotal)}`} size="md">
            {adjustments.length > 0 && (
                <div className="mb-6">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                        Adjustments
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {adjustments.map((t) => {
                            const isRefill = t.kind === 'refill'
                            const isWithdrawal = t.kind === 'withdrawal'
                            const title = t.note
                                ? t.note
                                : isRefill
                                    ? 'Refill from day-off pot'
                                    : isWithdrawal
                                        ? 'Withdrawn for something else'
                                        : 'Top up'
                            return (
                                <LedgerRow
                                    key={t._id}
                                    title={title}
                                    date={t.date}
                                    caption={isRefill ? 'into space, not budget' : isWithdrawal ? 'out of budget' : 'added to budget'}
                                    amount={t.amount}
                                    sign={isWithdrawal ? '−' : '+'}
                                    onDelete={() => onDeleteTopUp(t._id)}
                                    deleteLabel={isRefill ? 'Remove refill' : isWithdrawal ? 'Remove withdrawal' : 'Remove top-up'}
                                />
                            )
                        })}
                    </ul>
                </div>
            )}
            {weeks.length === 0 ? (
                <p className="text-sm text-neutral-500">No transactions logged this month.</p>
            ) : (
                <div className="flex flex-col gap-6">
                    {weeks.map(({ weekNum, days }) => {
                        const range = bounds.get(weekNum)
                        const weekTotal = days.reduce(
                            (s, d) => s + d.items.reduce((s2, t) => s2 + t.amount, 0),
                            0
                        )
                        return (
                            <div key={weekNum}>
                                <div className="mb-3 flex items-baseline justify-between gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                                        Week {weekNum}
                                        {range ? ` · ${formatDateRange(range.start, range.end)}` : ''}
                                    </span>
                                    <span className="text-xs font-semibold tabular-nums text-neutral-500">
                                        £{fmt(weekTotal)}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-4">
                                    {days.map(({ date, items }) => (
                                        <div key={date}>
                                            <p className="mb-1.5 text-sm font-semibold text-neutral-700">
                                                {formatDayHeader(date)}
                                            </p>
                                            <ul className="flex flex-col gap-1.5">
                                                {items.map((t) => (
                                                    <li
                                                        key={t._id}
                                                        className="flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3.5 py-2.5"
                                                    >
                                                        <p className="min-w-0 truncate text-sm font-semibold text-neutral-800">
                                                            {t.note || row.name}
                                                        </p>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <span className="text-sm tabular-nums text-neutral-700">
                                                                £{fmt(t.amount)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => onDelete(t._id)}
                                                                aria-label="Delete transaction"
                                                                className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                                            >
                                                                <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                                            </button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </Drawer>
    )
}

// ── Budget card ───────────────────────────────────────────────────────────────

interface BudgetCardProps {
    row: FinanceRow
    group: FinanceGroup
    entry: FinanceEntry | undefined
    spends: BudgetSpend[]
    topUps: BudgetTopUp[]
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
    onOpenTransactions: (row: FinanceRow) => void
    onTopUp: (rowId: string, amount: number, kind: 'topup' | 'refill' | 'withdrawal', note?: string) => Promise<void>
}

// ── Allowance hero ────────────────────────────────────────────────────────────

interface AllowanceHeroProps {
    /** e.g. "This week". */
    periodLabel: string
    /** Formatted date range, e.g. "Sat 19 – Fri 25 Jul". */
    rangeLabel: string
    allowance: number
    remaining: number
    spent: number
    /** Optional footnote under the bar — carry line, daily rate, etc. */
    subline?: ReactNode
}

/**
 * The dark "what's left to spend" panel shared by weekly and daily budgets.
 * Leads with the remaining figure — the number the user actually acts on — and
 * relegates the allowance and spend-to-date to a progress bar beneath it.
 */
function AllowanceHero({ periodLabel, rangeLabel, allowance, remaining, spent, subline }: AllowanceHeroProps) {
    const over = remaining < -RECONCILE_EPSILON
    const pct = Math.min(100, (spent / (allowance || 1)) * 100)
    return (
        <div className="rounded-2xl bg-neutral-950 p-5 text-white">
            <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    {periodLabel}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-neutral-400">{rangeLabel}</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
                <p className={['text-4xl font-bold tabular-nums tracking-tight', over ? 'text-red-400' : 'text-white'].join(' ')}>
                    £{fmt(Math.abs(remaining))}
                </p>
                <span className="text-sm font-medium text-neutral-400">{over ? 'over budget' : 'left to spend'}</span>
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                    className={['h-full rounded-full transition-all duration-500', over ? 'bg-red-400' : 'bg-emerald-400'].join(' ')}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="mt-2 flex justify-between text-[11px] tabular-nums text-neutral-400">
                <span>£{fmt(spent)} spent</span>
                <span>of £{fmt(allowance)}</span>
            </div>

            {subline && <div className="mt-3 text-xs font-medium">{subline}</div>}
        </div>
    )
}

/** A credit/planned-spend list row with a formatted date and optional delete. */
interface LedgerRowProps {
    title: string
    date: string
    /** Extra caption after the date, e.g. "into space, not budget". */
    caption?: string
    amount: number
    /** '+' for credits, '−' for debits, '' for plain amounts. */
    sign?: '+' | '−' | ''
    tone?: 'emerald' | 'sky' | 'neutral' | 'amber'
    onDelete?: () => void
    deleteLabel?: string
}

function LedgerRow({ title, date, caption, amount, sign = '', tone = 'neutral', onDelete, deleteLabel }: LedgerRowProps) {
    const toneMap = {
        emerald: { border: 'border-emerald-100 bg-emerald-50/60', title: 'text-emerald-800', sub: 'text-emerald-600/70', amt: 'text-emerald-700', del: 'text-emerald-400 hover:bg-emerald-100 hover:text-emerald-700' },
        sky: { border: 'border-sky-100 bg-sky-50/60', title: 'text-sky-800', sub: 'text-sky-600/70', amt: 'text-sky-700', del: 'text-sky-400 hover:bg-sky-100 hover:text-sky-700' },
        amber: { border: 'border-amber-100 bg-amber-50/60', title: 'text-amber-800', sub: 'text-amber-600/70', amt: 'text-amber-700', del: 'text-amber-400 hover:bg-amber-100 hover:text-amber-700' },
        neutral: { border: 'border-neutral-100', title: 'text-neutral-800', sub: 'text-neutral-400', amt: 'text-neutral-700', del: 'text-neutral-400 hover:bg-red-50 hover:text-red-500' },
    }[tone]
    return (
        <li className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${toneMap.border}`}>
            <div className="min-w-0">
                <p className={`truncate text-sm font-semibold ${toneMap.title}`}>{title}</p>
                <p className={`text-xs ${toneMap.sub}`}>
                    {formatShortDate(date)}
                    {caption ? ` · ${caption}` : ''}
                </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-semibold tabular-nums ${toneMap.amt}`}>
                    {sign}£{fmt(amount)}
                </span>
                {onDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={deleteLabel ?? 'Remove'}
                        className={`grid h-7 w-7 place-items-center rounded-full transition-colors ${toneMap.del}`}
                    >
                        <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                    </button>
                )}
            </div>
        </li>
    )
}

function BudgetCard({
    row, group, entry, spends, topUps, excludedDates,
    weekStart, weekEnd, isCurrentWeek, isFutureWeek,
    starlingEnabled, linkedSpace, syncing,
    onToggleDailySpend, onLogSpend, onDeleteSpend, onOpenLink, onSync, onOpenReconcile, onOpenTransactions,
    onTopUp,
}: BudgetCardProps) {
    const isLinked = !!row.starlingCategoryUid
    const isDailySpend = row.budgetType === 'daily'
    const isWeeklySpend = row.budgetType === 'weekly'
    const isIncome = group.type === 'income'
    const today = todayKey()
    const [dayOffInfoOpen, setDayOffInfoOpen] = useState(false)
    // Which money-adjustment form is open, if any — chosen from the actions menu.
    const [menuAction, setMenuAction] = useState<AdjustVariant | null>(null)

    // Monthly overview — always based on the month the week sits in.
    // computeBudgetDay gives monthlyAmount / monthlyRemaining regardless of the day param.
    const monthRef = computeBudgetDay(row, entry, spends, weekStart, excludedDates, topUps)
    const { monthlyAmount, monthlyRemaining } = monthRef

    // This row's net budget adjustments so far this month (already scoped to the
    // row by the caller): top-ups raise the monthly amount, withdrawals lower it.
    // Refills go back into the bank space, not the budget, so they're excluded.
    const rowTopUpTotal = netBudgetAdjustment(topUps)
    const rowRefillTotal = refillTotal(topUps)
    const effectiveMonthlyAmount = monthlyAmount + rowTopUpTotal

    // Spending logged on excluded (day-off) days counts toward the day-off pot,
    // not this budget. Only Starling-imported spends (they carry a feed item id)
    // verifiably left the linked space — a manual log may have been paid in cash
    // or from another account, so it can't explain a balance gap.
    const excludedDaySpends = spends.filter((s) => excludedDates.has(s.date))
    const excludedDaySpendTotal = excludedDaySpends.reduce((sum, s) => sum + s.amount, 0)
    const excludedFromSpaceTotal = excludedDaySpends
        .filter((s) => s.starlingFeedItemUid)
        .reduce((sum, s) => sum + s.amount, 0)
    // Day-off spending that left the space and hasn't been refilled yet — the
    // suggested refill amount.
    const refillOwed = Math.max(0, excludedFromSpaceTotal - rowRefillTotal)

    // Space balance vs budget remaining — only meaningful once linked and funded
    // (a monthly amount or a top-up), and only for the current month (a past
    // month's remaining says nothing about what the space holds today). Day-off
    // spends that left the space are a known, explained difference, so they don't
    // count as drift; refills put that money back without raising the budget.
    const canReconcile =
        isLinked &&
        !!linkedSpace &&
        effectiveMonthlyAmount > 0 &&
        today.slice(0, 7) === weekStart.slice(0, 7)
    const expectedBalance = monthlyRemaining - excludedFromSpaceTotal + rowRefillTotal
    const outOfSync =
        canReconcile &&
        Math.abs(linkedSpace!.balance - expectedBalance) > RECONCILE_EPSILON

    // ── Weekly row maths ────────────────────────────────────────────────────
    const weeklyBudget = isWeeklySpend
        ? computeBudgetWeek(row, entry, spends, weekStart, weekEnd, today, excludedDates, topUps)
        : null
    // remaining + spent = the total allowance for the week, including any top-up added this week.
    const weeklyAllowance = weeklyBudget ? weeklyBudget.remaining + weeklyBudget.spentThisWeek : 0

    // ── Daily row maths for the week slice ──────────────────────────────────
    const dailyRate = monthRef.straightDailyRate
    // Count active days in this week slice
    let activeDaysInWeek = 0
    let d = weekStart
    while (d <= weekEnd) {
        if (!excludedDates.has(d)) activeDaysInWeek++
        d = addDays(d, 1)
    }
    const topUpsThisWeek = netBudgetAdjustment(
        topUps.filter((t) => t.date >= weekStart && t.date <= weekEnd)
    )
    const weekTargetDaily = dailyRate * activeDaysInWeek + topUpsThisWeek
    const weekSpentDaily = spends
        .filter((s) => s.date >= weekStart && s.date <= weekEnd && !excludedDates.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)
    const weekRemainingDaily = weekTargetDaily - weekSpentDaily

    // For the SpendInput (current week only)
    const spentToday = spends
        .filter((s) => s.date === today && !excludedDates.has(s.date))
        .reduce((sum, s) => sum + s.amount, 0)

    // Week date range label e.g. "Sat 19 – Fri 25 Jul" (weekday-prefixed, readable).
    const rangeLabel = (() => {
        const s = new Date(`${weekStart}T00:00:00`)
        const e = new Date(`${weekEnd}T00:00:00`)
        const sameMonth = weekStart.slice(0, 7) === weekEnd.slice(0, 7)
        const startStr = s.toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: sameMonth ? undefined : 'short',
        })
        const endStr = e.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
        return `${startStr} – ${endStr}`
    })()

    // Unified tracking view — weekly and daily now feed one hero, removing the
    // near-identical dark blocks. null when tracking is off.
    const trackingView: { allowance: number; remaining: number; spent: number; subline?: ReactNode } | null =
        isWeeklySpend && weeklyBudget
            ? {
                  allowance: weeklyAllowance,
                  remaining: weeklyBudget.remaining,
                  spent: weeklyBudget.spentThisWeek,
                  subline:
                      weeklyBudget.carry !== 0 ? (
                          <span className={weeklyBudget.carry >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {weeklyBudget.carry >= 0
                                  ? `+£${fmt(weeklyBudget.carry)} carried from earlier weeks`
                                  : `−£${fmt(Math.abs(weeklyBudget.carry))} deficit from earlier weeks`}
                          </span>
                      ) : undefined,
              }
            : isDailySpend
              ? {
                    allowance: weekTargetDaily,
                    remaining: weekRemainingDaily,
                    spent: weekSpentDaily,
                    subline: (
                        <span className="text-neutral-500">
                            £{fmt(dailyRate)}/day · {activeDaysInWeek} active day{activeDaysInWeek !== 1 ? 's' : ''}
                        </span>
                    ),
                }
              : null

    const plannedSpends = isFutureWeek
        ? spends.filter((s) => s.date >= weekStart && s.date <= weekEnd)
        : []
    const isTracking = isWeeklySpend || isDailySpend
    const canAdjust = monthlyAmount > 0 && !isIncome
    const trackingLabel = isWeeklySpend ? 'Tracking: weekly' : isDailySpend ? 'Tracking: daily' : 'Tracking: off'

    // One menu for every occasional action, so the card face carries only the
    // hero, the log input, and two quiet footer links. Sections are joined by
    // dividers only when both sides are present.
    const menuItems: MenuEntry[] = []
    if (canAdjust) {
        menuItems.push({ label: 'Top up', icon: 'fa-solid fa-plus', onClick: () => setMenuAction('topup') })
        menuItems.push({ label: 'Withdraw', icon: 'fa-solid fa-arrow-up-from-bracket', onClick: () => setMenuAction('withdrawal') })
        if (isLinked) menuItems.push({ label: 'Refill space', icon: 'fa-solid fa-rotate-left', onClick: () => setMenuAction('refill') })
    }
    if (starlingEnabled) {
        if (menuItems.length) menuItems.push('divider')
        menuItems.push({
            label: isLinked ? 'Change bank space' : 'Link a bank space',
            icon: 'fa-solid fa-building-columns',
            onClick: () => onOpenLink(row),
        })
    }
    if (menuItems.length) menuItems.push('divider')
    menuItems.push({ label: trackingLabel, icon: 'fa-solid fa-repeat', onClick: () => onToggleDailySpend(row) })

    return (
        <Card as="article" hover={false} className="flex h-full flex-col gap-5">
            {/* Header — category, name, and the monthly figure with its status */}
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">{group.name}</p>
                    <p className="mt-1 truncate text-lg font-bold tracking-tight text-neutral-900">{row.name}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Monthly budget</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                        {effectiveMonthlyAmount > 0 ? `£${fmt(effectiveMonthlyAmount)}` : '—'}
                    </p>
                    {effectiveMonthlyAmount > 0 && (
                        canReconcile ? (
                            // Linked budgets defer to the bank: the space balance is the
                            // money that's actually left, the ledger is just the plan.
                            <p className="mt-0.5 text-xs font-semibold tabular-nums text-neutral-400">
                                £{fmt(linkedSpace!.balance)} in space
                            </p>
                        ) : (
                            <p className={['mt-0.5 text-xs font-semibold tabular-nums', monthlyRemaining < 0 ? 'text-red-500' : 'text-neutral-400'].join(' ')}>
                                £{fmt(Math.abs(monthlyRemaining))} {monthlyRemaining < 0 ? 'over' : 'left'}
                            </p>
                        )
                    )}
                    {outOfSync && (
                        <button
                            type="button"
                            onClick={() => onOpenReconcile(row)}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700"
                        >
                            <i className="fa-solid fa-triangle-exclamation text-[9px]" aria-hidden="true" />
                            Out of sync
                        </button>
                    )}
                </div>
            </div>

            {/* Allowance hero + spend logging — the primary action area */}
            {trackingView && (
                <div className="flex flex-col gap-3">
                    <AllowanceHero
                        periodLabel="This week"
                        rangeLabel={rangeLabel}
                        allowance={trackingView.allowance}
                        remaining={trackingView.remaining}
                        spent={trackingView.spent}
                        subline={trackingView.subline}
                    />

                    {plannedSpends.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                                Planned this week
                            </p>
                            <ul className="flex flex-col gap-1.5">
                                {plannedSpends.map((t) => (
                                    <LedgerRow
                                        key={t._id}
                                        title={t.note || row.name}
                                        date={t.date}
                                        amount={t.amount}
                                        onDelete={() => onDeleteSpend(t._id)}
                                        deleteLabel="Delete planned transaction"
                                    />
                                ))}
                            </ul>
                        </div>
                    )}

                    {(isCurrentWeek || isFutureWeek) && (
                        <SpendInput
                            spentToday={isFutureWeek ? 0 : spentToday}
                            hasLogged={false}
                            label={isFutureWeek ? 'Plan a spend' : undefined}
                            onAdd={(a, n) => onLogSpend(row._id, a, isFutureWeek ? weekStart : today, n)}
                        />
                    )}
                </div>
            )}

            {/* Money-adjustment form — opened from the actions menu, one at a time */}
            {menuAction && (
                <AdjustForm
                    variant={menuAction}
                    suggestedAmount={menuAction === 'refill' && refillOwed > RECONCILE_EPSILON ? refillOwed : undefined}
                    onAdd={(amount, note) => onTopUp(row._id, amount, menuAction, note)}
                    onCancel={() => setMenuAction(null)}
                />
            )}

            {/* Footer — a quiet status line, two links, and the actions menu. All the
                colour and button clutter that used to live here now sits behind the
                menu or inside the Transactions drawer. */}
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-neutral-100 pt-4 text-xs">
                <button
                    type="button"
                    onClick={() => onOpenTransactions(row)}
                    className="inline-flex items-center gap-1.5 font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
                >
                    <i className="fa-solid fa-receipt text-[10px]" aria-hidden="true" />
                    Transactions
                </button>

                {starlingEnabled && isLinked && (
                    <button
                        type="button"
                        onClick={() => onSync(row)}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 font-semibold text-neutral-500 transition-colors hover:text-neutral-900 disabled:opacity-50"
                    >
                        <i className={`fa-solid fa-arrows-rotate text-[10px] ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                        {syncing ? 'Syncing…' : 'Sync'}
                    </button>
                )}

                {excludedDaySpendTotal > RECONCILE_EPSILON && (
                    <button
                        type="button"
                        onClick={() => setDayOffInfoOpen((v) => !v)}
                        aria-expanded={dayOffInfoOpen}
                        className="inline-flex items-center gap-1 font-semibold tabular-nums text-neutral-400 transition-colors hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-umbrella-beach text-[10px]" aria-hidden="true" />
                        £{fmt(excludedDaySpendTotal)} day-off
                    </button>
                )}

                <div className="ml-auto flex items-center gap-2">
                    {isTracking && (
                        <span className="inline-flex items-center gap-1 text-neutral-400">
                            <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />
                            {isWeeklySpend ? 'Weekly' : 'Daily'}
                        </span>
                    )}
                    <DropdownMenu
                        align="right"
                        items={menuItems}
                        trigger={
                            <button
                                type="button"
                                aria-label="More actions"
                                aria-haspopup="menu"
                                className="grid h-7 w-7 place-items-center rounded-lg border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <i className="fa-solid fa-ellipsis text-xs" aria-hidden="true" />
                            </button>
                        }
                    />
                </div>
            </div>

            {/* Day-off explanation — expands beneath the footer on demand */}
            {excludedDaySpendTotal > RECONCILE_EPSILON && dayOffInfoOpen && (
                <div className="rounded-2xl bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                    £{fmt(excludedDaySpendTotal)} was spent on day-off days this month. It counts
                    toward your day-off pot, not this budget
                    {isLinked && excludedFromSpaceTotal > RECONCILE_EPSILON
                        ? excludedFromSpaceTotal >= excludedDaySpendTotal - RECONCILE_EPSILON
                            ? ' — the money still left the linked space, which is expected'
                            : ` — £${fmt(excludedFromSpaceTotal)} of it left the linked space, which is expected`
                        : ''}.
                    {isLinked && excludedFromSpaceTotal > RECONCILE_EPSILON && (
                        refillOwed > RECONCILE_EPSILON
                            ? ` £${fmt(refillOwed)} still needs refilling from the day-off pot to square the space.`
                            : rowRefillTotal > RECONCILE_EPSILON
                                ? ' The space has been fully refilled from the day-off pot.'
                                : ''
                    )}
                </div>
            )}
        </Card>
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
    const [topUps, setTopUps] = useState<BudgetTopUp[]>([])
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
    const [txRow, setTxRow] = useState<FinanceRow | null>(null)
    const [exclusions, setExclusions] = useState<StarlingExclusion[]>([])
    const [exclusionsOpen, setExclusionsOpen] = useState(false)
    const [recoveringId, setRecoveringId] = useState<string | null>(null)
    // Tracks which month has already been auto-synced this session, so navigating
    // back and forth within the same month doesn't re-trigger it.
    const autoSyncedMonthRef = useRef<string | null>(null)
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
            listBudgetTopUps(month),
        ])
            .then(([g, r, e, s, x, t]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
                setExcludedDates(new Set(x.map((dx) => dx.date)))
                setTopUps(t)
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

    // Load removed (deleted/moved) Starling transactions once, for the recovery drawer.
    useEffect(() => {
        let active = true
        listStarlingExclusions()
            .then((x) => active && setExclusions(x))
            .catch(() => {})
        return () => { active = false }
    }, [])

    // Silently sync every Starling-linked budget once per month view, so figures are
    // fresh on open without a click. Runs once per month (tracked via the ref, not
    // re-triggered by unrelated row updates) and stays quiet on failure — the manual
    // Sync button on each card is still there as a fallback.
    useEffect(() => {
        if (loading || !starlingEnabled) return
        if (autoSyncedMonthRef.current === month) return
        autoSyncedMonthRef.current = month

        const linkedRows = rows.filter((r) => r.budgeted && r.starlingCategoryUid)
        if (linkedRows.length === 0) return

        let active = true
        ;(async () => {
            for (const row of linkedRows) {
                if (!active) return
                try {
                    await runSync(row)
                } catch {
                    // Silent — one budget failing to sync shouldn't block the rest.
                }
            }
            if (!active) return
            try {
                const fresh = await listBudgetSpends({ month })
                if (active) {
                    setSpends(fresh)
                    invalidate('budget')
                }
            } catch {
                // Silent — spends just reflect pre-sync state until the next load.
            }
        })()

        return () => { active = false }
    }, [month, starlingEnabled, loading, rows])

    async function handleRecover(id: string) {
        setRecoveringId(id)
        try {
            const spend = await recoverStarlingExclusion(id)
            setExclusions((prev) => prev.filter((x) => x._id !== id))
            if (spend.date.slice(0, 7) === month) {
                setSpends((prev) => [...prev.filter((s) => s._id !== spend._id), spend])
            }
            invalidate('budget')
            toast.show('Transaction recovered.', 'success')
        } catch (err: any) {
            toast.error(err?.response?.data?.message ?? "Couldn't recover that transaction.")
        } finally {
            setRecoveringId(null)
        }
    }

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

    /**
     * The actual Starling sync call for one row, plus the local balance refresh so
     * the "out of sync" badge is accurate straight after. Shared by the manual Sync
     * button and the silent auto-sync on page/month load — callers handle their own
     * loading state, spends refresh, and feedback.
     */
    async function runSync(row: FinanceRow) {
        const result = await syncStarlingSpace(row._id, month)
        if (result.balance !== null && row.starlingCategoryUid) {
            const categoryUid = row.starlingCategoryUid
            setSpaces((prev) =>
                prev.map((s) => (s.id === categoryUid ? { ...s, balance: result.balance! } : s))
            )
        }
        return result
    }

    async function handleSync(row: FinanceRow) {
        setSyncingRowId(row._id)
        try {
            const result = await runSync(row)
            const fresh = await listBudgetSpends({ month })
            setSpends(fresh)
            invalidate('budget')
            const plural = (n: number, label: string) => `${label} ${n} transaction${n === 1 ? '' : 's'}`
            const parts: string[] = []
            if (result.imported > 0) parts.push(plural(result.imported, 'imported'))
            if (result.removed > 0) parts.push(plural(result.removed, 'removed'))
            if (result.skipped > 0) parts.push(plural(result.skipped, 'skipped previously-removed'))
            toast.show(
                parts.length > 0 ? `Synced — ${parts.join(', ')}.` : 'Up to date — no changes.',
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

    async function handleTopUp(
        rowId: string,
        amount: number,
        kind: 'topup' | 'refill' | 'withdrawal',
        note?: string
    ) {
        try {
            const result = await createBudgetTopUp(rowId, todayDate, amount, kind, note)
            setTopUps((prev) => [...prev, result])
            invalidate('budget')
            toast.show(
                kind === 'refill'
                    ? `Recorded £${formatAmount(amount)} refilled into the space.`
                    : kind === 'withdrawal'
                        ? `Withdrew £${formatAmount(amount)} from this budget.`
                        : `Added £${formatAmount(amount)} to this budget.`,
                'success'
            )
        } catch {
            toast.error(
                kind === 'refill'
                    ? "Couldn't record that refill."
                    : kind === 'withdrawal'
                        ? "Couldn't record that withdrawal."
                        : "Couldn't add that top-up."
            )
        }
    }

    async function handleDeleteTopUp(id: string) {
        try {
            await deleteBudgetTopUp(id)
            setTopUps((prev) => prev.filter((t) => t._id !== id))
            invalidate('budget')
        } catch {
            toast.error("Couldn't remove that top-up.")
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
                    {starlingEnabled && (
                        <button
                            type="button"
                            onClick={() => setExclusionsOpen(true)}
                            aria-label="Removed transactions"
                            title="Removed transactions"
                            className="relative grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-clock-rotate-left text-xs" aria-hidden="true" />
                            {exclusions.length > 0 && (
                                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                                    {exclusions.length > 9 ? '9+' : exclusions.length}
                                </span>
                            )}
                        </button>
                    )}

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
                topUps={topUps}
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
                        const rowTopUps = topUps.filter((t) => t.row === row._id)
                        return (
                            <BudgetCard
                                key={row._id}
                                row={row}
                                group={group}
                                entry={entry}
                                spends={rowSpends}
                                topUps={rowTopUps}
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
                                onOpenTransactions={setTxRow}
                                onTopUp={handleTopUp}
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

            {reconcileRow && (() => {
                const rowTopUps = topUps.filter((t) => t.row === reconcileRow._id)
                const day = computeBudgetDay(
                    reconcileRow,
                    entries.find((e) => e.row === reconcileRow._id),
                    spends.filter((s) => s.row === reconcileRow._id),
                    weekStart,
                    excludedDates,
                    rowTopUps
                )
                return (
                    <ReconcileDrawer
                        row={reconcileRow}
                        monthlyRemaining={day.monthlyRemaining}
                        monthlyAmount={day.monthlyAmount}
                        topUps={rowTopUps}
                        excludedDaySpends={spends.filter(
                            (s) =>
                                s.row === reconcileRow._id &&
                                excludedDates.has(s.date) &&
                                !!s.starlingFeedItemUid
                        )}
                        fallbackBalance={spaces.find((s) => s.id === reconcileRow.starlingCategoryUid)?.balance}
                        loading={reconcileLoading}
                        error={reconcileError}
                        data={reconcileData}
                        onRecordCredit={(amount, kind, note) => handleTopUp(reconcileRow._id, amount, kind, note)}
                        onClose={() => setReconcileRow(null)}
                    />
                )
            })()}

            {txRow && (
                <AllTransactionsDrawer
                    row={txRow}
                    month={month}
                    spends={spends.filter((s) => s.row === txRow._id)}
                    topUps={topUps.filter((t) => t.row === txRow._id)}
                    onClose={() => setTxRow(null)}
                    onDelete={handleDeleteSpend}
                    onDeleteTopUp={handleDeleteTopUp}
                />
            )}

            <RemovedTransactionsDrawer
                open={exclusionsOpen}
                exclusions={exclusions}
                recoveringId={recoveringId}
                onClose={() => setExclusionsOpen(false)}
                onRecover={handleRecover}
            />
        </>
    )
}
