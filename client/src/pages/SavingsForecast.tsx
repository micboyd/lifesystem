import { useEffect, useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import DatePicker from '../components/DatePicker'
import Tabs from '../components/Tabs'
import Checkbox from '../components/Checkbox'
import { listGroups, listRows, listEntries, updateGroup, deleteGroup } from '../services/finances'
import {
    listSavingsTargets, createSavingsTarget, updateSavingsTarget, deleteSavingsTarget,
} from '../services/savingsTargets'
import { groupVisibleInMonth, rowVisibleInMonth, addMonths, recurringAmountForMonth } from '../lib/finance'
import { formatAmount, formatMoneyCompact } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import type { FinanceGroup, FinanceRow, FinanceEntry, SavingsTarget } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const fmt = formatAmount
const fmtCompact = formatMoneyCompact

/** Monthly compounding rate from an annual percentage. */
function monthlyRate(annualRate: number): number {
    return annualRate / 100 / 12
}

interface YearRow {
    year: number
    startBalance: number
    contributions: number
    interestEarned: number
    endBalance: number
}

interface MonthRow {
    month: string   // YYYY-MM
    contributions: number
    interestEarned: number
    endBalance: number
}

/** Run the same simulation but return month-by-month rows for a single year (1-indexed). */
function buildMonthlyForYear(
    groups: FinanceGroup[],
    contributionForMonth: (group: FinanceGroup, month: string) => number,
    startMonth: string,
    targetYear: number
): MonthRow[] {
    const balances = new Map(groups.map((g) => [g._id, g.currentBalance ?? 0]))
    let m = startMonth

    // Fast-forward to the start of targetYear
    for (let y = 1; y < targetYear; y++) {
        for (let i = 0; i < 12; i++) {
            for (const g of groups) {
                const bal = balances.get(g._id) ?? 0
                const interest = bal * monthlyRate(g.annualInterestRate ?? 0)
                const contrib = contributionForMonth(g, m)
                balances.set(g._id, bal + interest + contrib)
            }
            m = addMonths(m, 1)
        }
    }

    // Collect the 12 months of targetYear
    const rows: MonthRow[] = []
    for (let i = 0; i < 12; i++) {
        let contributions = 0
        let interestEarned = 0
        for (const g of groups) {
            const bal = balances.get(g._id) ?? 0
            const interest = bal * monthlyRate(g.annualInterestRate ?? 0)
            const contrib = contributionForMonth(g, m)
            balances.set(g._id, bal + interest + contrib)
            interestEarned += interest
            contributions += contrib
        }
        const endBalance = [...balances.values()].reduce((s, b) => s + b, 0)
        rows.push({ month: m, contributions, interestEarned, endBalance })
        m = addMonths(m, 1)
    }
    return rows
}

/**
 * Simulate every month across all savings groups, honouring each group's own
 * interest rate and a per-month contribution — so months a group is skipped or
 * inactive add nothing. Interest accrues on the running balance each month and
 * the month's contribution lands at month-end (it then compounds from the next
 * month on). Results are bucketed into per-year rows.
 */
function buildYearlyTable(
    groups: FinanceGroup[],
    contributionForMonth: (group: FinanceGroup, month: string) => number,
    startMonth: string,
    years: number
): YearRow[] {
    const balances = new Map(groups.map((g) => [g._id, g.currentBalance ?? 0]))
    const out: YearRow[] = []
    let m = startMonth

    for (let y = 1; y <= years; y++) {
        const startBalance = [...balances.values()].reduce((s, b) => s + b, 0)
        let contributions = 0
        let interestEarned = 0

        for (let i = 0; i < 12; i++) {
            for (const g of groups) {
                const bal = balances.get(g._id) ?? 0
                const interest = bal * monthlyRate(g.annualInterestRate ?? 0)
                const contrib = contributionForMonth(g, m)
                balances.set(g._id, bal + interest + contrib)
                interestEarned += interest
                contributions += contrib
            }
            m = addMonths(m, 1)
        }

        const endBalance = [...balances.values()].reduce((s, b) => s + b, 0)
        out.push({ year: y, startBalance, contributions, interestEarned, endBalance })
    }
    return out
}

// ── Month breakdown drawer ─────────────────────────────────────────────────

function MonthDrawer({
    yearRow,
    months,
    onClose,
}: {
    yearRow: YearRow
    months: MonthRow[]
    onClose: () => void
}) {
    function label(ym: string) {
        const [y, m] = ym.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
    }

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={onClose}
            />
            {/* Drawer */}
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-neutral-100 px-8 py-6">
                    <div>
                        <p className="text-xl font-bold tracking-tight text-neutral-900">
                            Year {yearRow.year}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-400">Month by month breakdown</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-neutral-100 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                <th className="py-4 pl-8 pr-4 text-left">Month</th>
                                <th className="px-4 py-4 text-right">Contributions</th>
                                <th className="px-4 py-4 text-right">Interest</th>
                                <th className="py-4 pl-4 pr-12 text-right">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                            {months.map((m) => (
                                <tr key={m.month} className="hover:bg-neutral-50">
                                    <td className="py-4 pl-8 pr-4 text-sm font-semibold text-neutral-900">
                                        {label(m.month)}
                                    </td>
                                    <td className="px-4 py-4 text-right text-sm tabular-nums text-neutral-600">
                                        £{fmt(m.contributions, 0)}
                                    </td>
                                    <td className={`px-4 py-4 text-right text-sm tabular-nums ${m.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-300'}`}>
                                        {m.interestEarned > 0 ? '+' : ''}£{fmt(m.interestEarned, 0)}
                                    </td>
                                    <td className="py-4 pl-4 pr-12 text-right text-sm font-bold tabular-nums text-neutral-900">
                                        £{fmt(m.endBalance, 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-neutral-100 px-8 py-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Contributions</p>
                            <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">£{fmt(yearRow.contributions, 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Interest</p>
                            <p className="mt-1 text-base font-bold tabular-nums text-emerald-600">+£{fmt(yearRow.interestEarned, 0)}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">End balance</p>
                            <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">£{fmt(yearRow.endBalance, 0)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Settings input ─────────────────────────────────────────────────────────

interface SettingFieldProps {
    label: string
    value: string
    prefix?: string
    suffix?: string
    onChange: (v: string) => void
    onCommit: (v: number) => void
}

function SettingField({ label, value, prefix, suffix, onChange, onCommit }: SettingFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null)
    function commit() {
        const n = parseFloat(value.replace(/,/g, ''))
        onCommit(Number.isNaN(n) ? 0 : n)
    }
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                {label}
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 transition-all focus-within:border-neutral-950 focus-within:ring-4 focus-within:ring-neutral-950/5">
                {prefix && <span className="text-sm font-semibold text-neutral-400">{prefix}</span>}
                <input
                    ref={inputRef}
                    type="number"
                    min="0"
                    step="any"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') inputRef.current?.blur()
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                {suffix && <span className="text-sm font-semibold text-neutral-400">{suffix}</span>}
            </div>
        </div>
    )
}

// ── Milestone card ─────────────────────────────────────────────────────────

function MilestoneCard({
    year,
    balance,
    label,
}: {
    year: number
    balance: number
    label?: string
}) {
    return (
        <div className="flex flex-col gap-1.5 rounded-3xl bg-neutral-950 px-5 py-5 text-white transition-transform duration-200 hover:-translate-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                {label ?? `Year ${year}`}
            </p>
            <p className="text-2xl font-bold tabular-nums tracking-tight">{fmtCompact(balance)}</p>
            <p className="text-xs text-neutral-500 tabular-nums">£{fmt(balance, 0)}</p>
        </div>
    )
}

// ── Savings group settings card ─────────────────────────────────────────────

interface GroupSettingsProps {
    group: FinanceGroup
    monthlyContribution: number
    activeDescription: { recurring: boolean; months: string[] }
    onUpdate: (id: string, fields: Partial<FinanceGroup>) => void
    onDelete: (id: string) => void
}

function GroupSettingsCard({ group, monthlyContribution, activeDescription, onUpdate, onDelete }: GroupSettingsProps) {
    const [balance, setBalance] = useState(String(group.currentBalance ?? 0))
    const [rate, setRate] = useState(String(group.annualInterestRate ?? 0))
    const [confirming, setConfirming] = useState(false)
    const [deleting, setDeleting] = useState(false)

    useEffect(() => { setBalance(String(group.currentBalance ?? 0)) }, [group.currentBalance])
    useEffect(() => { setRate(String(group.annualInterestRate ?? 0)) }, [group.annualInterestRate])

    function monthLabel(ym: string) {
        const [y, m] = ym.split('-').map(Number)
        return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
    }

    const { recurring, months } = activeDescription
    const monthSummary = recurring
        ? 'This is a recurring account with no end date.'
        : months.length === 0
          ? 'This account has no active months.'
          : months.length > 5
            ? `This account is used across multiple months (${months.length} total).`
            : `This account is used in ${months.map(monthLabel).join(', ')}.`

    async function handleConfirmDelete() {
        setDeleting(true)
        try {
            await onDelete(group._id)
        } finally {
            setDeleting(false)
            setConfirming(false)
        }
    }

    return (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 transition-colors duration-200 hover:border-neutral-300">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-lg font-bold tracking-tight text-neutral-900">{group.name}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-neutral-400">£{fmt(monthlyContribution)} / month</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        savings
                    </span>
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                        <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {confirming ? (
                <div className="rounded-2xl bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">Delete {group.name}?</p>
                    <p className="mt-1 text-xs text-red-500">{monthSummary} This cannot be undone.</p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                            {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3">
                    <SettingField
                        label="Current balance"
                        prefix="£"
                        value={balance}
                        onChange={setBalance}
                        onCommit={(v) => onUpdate(group._id, { currentBalance: v })}
                    />
                    <SettingField
                        label="Annual interest rate"
                        suffix="%"
                        value={rate}
                        onChange={setRate}
                        onCommit={(v) => onUpdate(group._id, { annualInterestRate: v })}
                    />
                </div>
            )}
        </div>
    )
}

// ── Horizon selector ───────────────────────────────────────────────────────

const HORIZONS = [1, 3, 5, 10, 20, 30] as const
type Horizon = (typeof HORIZONS)[number]

// ── Live savings (to date) ──────────────────────────────────────────────────

/** Inclusive list of "YYYY-MM" months from `from` to `to`. Empty if from > to. */
function monthsBetween(from: string, to: string): string[] {
    if (from > to) return []
    const out: string[] = []
    let m = from
    while (m <= to) {
        out.push(m)
        m = addMonths(m, 1)
    }
    return out
}

function MonthField({
    label,
    value,
    minDate,
    maxDate,
    onChange,
}: {
    label: string
    /** ISO date string (the 1st of the chosen month). */
    value: string
    minDate?: string
    maxDate?: string
    /** Called with the 1st of the picked month. */
    onChange: (isoFirstOfMonth: string) => void
}) {
    return (
        <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </label>
            <DatePicker
                mode="single"
                value={value}
                minDate={minDate}
                maxDate={maxDate}
                onChange={(v) => {
                    if (typeof v === 'string' && v) onChange(`${v.slice(0, 7)}-01`)
                }}
            />
        </div>
    )
}

/**
 * Backward-looking total: sums each month's planned savings contribution
 * (per-month entry override, else the row's recurring amount) across the
 * chosen range, respecting month-scoping. Reflects the live finance sheet.
 */
function LiveSavingsSection({ groups, rows }: { groups: FinanceGroup[]; rows: FinanceRow[] }) {
    const now = currentMonth()
    const [fromDate, setFromDate] = useState(`${now}-01`)
    const [toDate, setToDate] = useState(`${addMonths(now, 1)}-01`)
    const [entriesByMonth, setEntriesByMonth] = useState<Record<string, FinanceEntry[]>>({})
    const [loading, setLoading] = useState(true)

    // The metric is monthly, so reduce the picked dates to their "YYYY-MM".
    const from = fromDate.slice(0, 7)
    const to = toDate.slice(0, 7)
    const months = monthsBetween(from, to)

    useEffect(() => {
        const range = monthsBetween(from, to)
        if (range.length === 0) {
            setEntriesByMonth({})
            setLoading(false)
            return
        }
        let active = true
        setLoading(true)
        Promise.all(range.map((m) => listEntries(m).then((e) => [m, e] as const)))
            .then((pairs) => {
                if (active) setEntriesByMonth(Object.fromEntries(pairs))
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [from, to])

    const savingsGroups = groups.filter((g) => g.type === 'savings')

    function plannedForMonth(group: FinanceGroup, m: string): number {
        if (!groupVisibleInMonth(group, m)) return 0
        const es = entriesByMonth[m] ?? []
        return rows
            .filter((r) => r.group === group._id && rowVisibleInMonth(r, m, group))
            .reduce(
                (s, r) => s + (es.find((e) => e.row === r._id)?.amount ?? recurringAmountForMonth(r, m) ?? 0),
                0
            )
    }

    const perGroup = savingsGroups
        .map((g) => ({ group: g, total: months.reduce((s, m) => s + plannedForMonth(g, m), 0) }))
        .filter((x) => x.total !== 0)
    const grandTotal = perGroup.reduce((s, x) => s + x.total, 0)

    const perMonth = months.map((m) => ({
        month: m,
        total: savingsGroups.reduce((s, g) => s + plannedForMonth(g, m), 0),
    }))
    const monthCount = months.length
    const monthlyAvg = monthCount > 0 ? grandTotal / monthCount : 0
    const invalid = from > to

    return (
        <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Savings to date
            </h2>
            <div className="rounded-3xl border border-neutral-200 bg-white p-6">
                <div className="flex flex-wrap items-end gap-3">
                    <MonthField
                        label="From"
                        value={fromDate}
                        maxDate={toDate}
                        onChange={setFromDate}
                    />
                    <MonthField label="To" value={toDate} minDate={fromDate} onChange={setToDate} />
                    <p className="ml-auto max-w-xs text-xs text-neutral-400">
                        Total you planned to put away, based on the monthly savings amounts on your
                        finance sheet.
                    </p>
                </div>

                {invalid ? (
                    <p className="mt-5 text-sm text-neutral-400">
                        The “From” month must be on or before the “To” month.
                    </p>
                ) : loading ? (
                    <div className="grid place-items-center py-8">
                        <Spinner />
                    </div>
                ) : (
                    <div className="mt-5 flex flex-col gap-4">
                        <div className="rounded-2xl bg-neutral-950 px-5 py-5 text-white">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                You should have saved
                            </p>
                            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                £{fmt(grandTotal)}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                                {monthCount} {monthCount === 1 ? 'month' : 'months'} · avg £
                                {fmt(monthlyAvg)}/mo
                            </p>
                        </div>

                        {perGroup.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {perGroup.map(({ group, total }) => (
                                    <div
                                        key={group._id}
                                        className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5"
                                    >
                                        <span className="truncate text-sm font-semibold text-neutral-700">
                                            {group.name}
                                        </span>
                                        <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                                            £{fmt(total)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {perMonth.length > 1 && (
                            <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Monthly breakdown
                                </p>
                                <div className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200 overflow-hidden">
                                    {perMonth.map(({ month, total }) => (
                                        <div
                                            key={month}
                                            className="flex items-center justify-between px-4 py-2.5"
                                        >
                                            <span className="text-sm text-neutral-600">
                                                {new Date(month + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                                            </span>
                                            <span className={`text-sm font-semibold tabular-nums ${total === 0 ? 'text-neutral-400' : 'text-neutral-900'}`}>
                                                £{fmt(total)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    )
}

// ── Target planner ──────────────────────────────────────────────────────────

interface TargetPlan {
    error?: string
    onTrack: boolean
    requiredMonthly: number
    contributionMonths: number
    firstContribMonth: string
    growthOnly: number
    totalContributions: number
    interestEarned: number
}

/**
 * Solve for the flat monthly contribution needed to reach `target` by
 * `targetMonth`. Interest compounds monthly from now on the whole balance;
 * contributions land at month-end (same convention as the projection) from
 * `startMonth` through `targetMonth` inclusive. Uses the simulated growth
 * factors, so required = (target − balance·G) / F.
 */
function computeTargetPlan(
    balance: number,
    target: number,
    annualRate: number,
    startMonth: string,
    targetMonth: string,
    nowMonth: string
): TargetPlan {
    const empty = {
        onTrack: false,
        requiredMonthly: 0,
        contributionMonths: 0,
        firstContribMonth: startMonth,
        growthOnly: balance,
        totalContributions: 0,
        interestEarned: 0,
    }
    if (targetMonth < nowMonth) return { ...empty, error: 'The target date is in the past.' }
    if (target <= 0) return { ...empty, error: 'Set a target amount to plan towards.' }

    const r = monthlyRate(annualRate)
    const firstContrib = startMonth < nowMonth ? nowMonth : startMonth

    let growthOnly = balance // balance compounded with no further saving
    let factor = 0 // what £1/month in the window grows to by the target
    let contributionMonths = 0
    let m = nowMonth
    while (m <= targetMonth) {
        growthOnly *= 1 + r
        factor *= 1 + r
        if (m >= firstContrib) {
            factor += 1
            contributionMonths++
        }
        m = addMonths(m, 1)
    }

    if (growthOnly >= target) {
        return { ...empty, onTrack: true, growthOnly, firstContribMonth: firstContrib }
    }
    if (contributionMonths === 0) {
        return {
            ...empty,
            growthOnly,
            error: 'Your start date is after the target date, so there are no months to save in.',
        }
    }

    const requiredMonthly = (target - growthOnly) / factor
    const totalContributions = requiredMonthly * contributionMonths
    return {
        onTrack: false,
        requiredMonthly,
        contributionMonths,
        firstContribMonth: firstContrib,
        growthOnly,
        totalContributions,
        interestEarned: Math.max(0, target - balance - totalContributions),
    }
}

interface ContributionPlan {
    error?: string
    finalBalance: number
    contributionMonths: number
    firstContribMonth: string
    growthOnly: number
    totalContributions: number
    interestEarned: number
}

/**
 * The inverse of computeTargetPlan: fix the monthly contribution and project
 * the end balance instead. Same conventions — interest compounds monthly from
 * now on the whole balance; contributions land at month-end from `startMonth`
 * through `endMonth` inclusive.
 */
function computeContributionPlan(
    balance: number,
    monthly: number,
    annualRate: number,
    startMonth: string,
    endMonth: string,
    nowMonth: string
): ContributionPlan {
    const empty = {
        finalBalance: balance,
        contributionMonths: 0,
        firstContribMonth: startMonth,
        growthOnly: balance,
        totalContributions: 0,
        interestEarned: 0,
    }
    if (endMonth < nowMonth) return { ...empty, error: 'The end date is in the past.' }
    if (monthly <= 0) return { ...empty, error: 'Set a monthly amount to project with.' }

    const r = monthlyRate(annualRate)
    const firstContrib = startMonth < nowMonth ? nowMonth : startMonth

    let bal = balance
    let growthOnly = balance
    let contributionMonths = 0
    let m = nowMonth
    while (m <= endMonth) {
        bal *= 1 + r
        growthOnly *= 1 + r
        if (m >= firstContrib) {
            bal += monthly
            contributionMonths++
        }
        m = addMonths(m, 1)
    }

    if (contributionMonths === 0) {
        return {
            ...empty,
            growthOnly,
            error: 'Your start date is after the end date, so there are no months to save in.',
        }
    }

    const totalContributions = monthly * contributionMonths
    return {
        finalBalance: bal,
        contributionMonths,
        firstContribMonth: firstContrib,
        growthOnly,
        totalContributions,
        interestEarned: bal - balance - totalContributions,
    }
}

function monthLabelLong(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

/** Whole months from `from` to `to` (both "YYYY-MM"); negative when `to` is in the past. */
function monthsUntil(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return (ty - fy) * 12 + (tm - fm)
}

/** "month"/"months" for a count. */
function mo(n: number): string {
    return Math.abs(n) === 1 ? 'month' : 'months'
}

/** Start and finish dates side by side, each with a months-away countdown. */
function PlanDatesGrid({ target }: { target: SavingsTarget }) {
    const now = currentMonth()
    const untilStart = monthsUntil(now, target.startMonth)
    const untilFinish = monthsUntil(now, target.targetMonth)

    const startLabel =
        untilStart > 0
            ? `in ${untilStart} ${mo(untilStart)}`
            : untilStart === 0
              ? 'this month'
              : `started ${-untilStart} ${mo(untilStart)} ago`
    const finishLabel =
        untilFinish > 0
            ? `in ${untilFinish} ${mo(untilFinish)}`
            : untilFinish === 0
              ? 'due this month'
              : `${-untilFinish} ${mo(untilFinish)} overdue`
    const finishTone =
        untilFinish < 0
            ? 'text-red-500'
            : untilFinish <= 3
              ? 'text-amber-600'
              : 'text-neutral-400'

    return (
        <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Starts
                </p>
                <p className="mt-0.5 truncate text-xs font-bold text-neutral-900">
                    {monthLabelLong(target.startMonth)}
                </p>
                <p className="text-[11px] text-neutral-400">{startLabel}</p>
            </div>
            <div className="rounded-xl bg-neutral-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    Finishes
                </p>
                <p className="mt-0.5 truncate text-xs font-bold text-neutral-900">
                    {monthLabelLong(target.targetMonth)}
                </p>
                <p className={`text-[11px] font-semibold ${finishTone}`}>{finishLabel}</p>
            </div>
        </div>
    )
}

function SavedTargetCard({
    target,
    isDragging,
    isDragOver,
    selected,
    onToggleSelect,
    onUpdate,
    onDelete,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
}: {
    target: SavingsTarget
    isDragging: boolean
    isDragOver: boolean
    selected: boolean
    onToggleSelect: () => void
    onUpdate: (
        id: string,
        fields: { name?: string; notes?: string | null; priority?: boolean }
    ) => Promise<void>
    onDelete: (id: string) => Promise<void>
    onDragStart: () => void
    onDragOver: () => void
    onDrop: () => void
    onDragEnd: () => void
}) {
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(target.name)
    const [editingNotes, setEditingNotes] = useState(false)
    const [notesDraft, setNotesDraft] = useState('')
    const [confirming, setConfirming] = useState(false)
    const [busy, setBusy] = useState(false)
    // The card is only draggable once a drag is initiated from the grip handle,
    // so clicks/selection elsewhere in the card behave normally.
    const dragReady = useRef(false)

    // Disarm the handle on any plain click release. A real drag ends with
    // 'dragend' (no trailing 'mouseup'), so this only fires when no drag started.
    useEffect(() => {
        const disarm = () => (dragReady.current = false)
        window.addEventListener('mouseup', disarm)
        return () => window.removeEventListener('mouseup', disarm)
    }, [])

    async function commitRename() {
        const trimmed = name.trim()
        setEditing(false)
        if (!trimmed || trimmed === target.name) {
            setName(target.name)
            return
        }
        await onUpdate(target._id, { name: trimmed })
    }

    async function commitNotes() {
        const trimmed = notesDraft.trim()
        setEditingNotes(false)
        if (trimmed === (target.notes ?? '')) return
        await onUpdate(target._id, { notes: trimmed || null })
    }

    function openNotesEditor() {
        setNotesDraft(target.notes ?? '')
        setEditingNotes(true)
    }

    async function handleDelete() {
        setBusy(true)
        try {
            await onDelete(target._id)
        } finally {
            setBusy(false)
            setConfirming(false)
        }
    }

    return (
        <div
            draggable
            onDragStart={(e) => {
                if (!dragReady.current) {
                    e.preventDefault()
                    return
                }
                e.dataTransfer.effectAllowed = 'move'
                onDragStart()
            }}
            onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                onDragOver()
            }}
            onDrop={(e) => {
                e.preventDefault()
                onDrop()
            }}
            onDragEnd={() => {
                dragReady.current = false
                onDragEnd()
            }}
            className={[
                'rounded-3xl border bg-white p-6 transition-colors duration-200',
                target.priority
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-neutral-200 hover:border-neutral-300',
                isDragging ? 'opacity-40' : '',
                isDragOver ? 'ring-2 ring-neutral-300' : '',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    aria-label="Drag to reorder"
                    onMouseDown={() => (dragReady.current = true)}
                    onTouchStart={() => (dragReady.current = true)}
                    className="mt-1 -ml-1 grid h-8 w-5 shrink-0 cursor-grab touch-none place-items-center rounded text-neutral-300 transition-colors hover:text-neutral-500 active:cursor-grabbing"
                >
                    <i className="fa-solid fa-grip-vertical text-xs" aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1">
                    {editing ? (
                        <input
                            autoFocus
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                    setName(target.name)
                                    setEditing(false)
                                }
                            }}
                            className="w-full rounded-lg border border-neutral-200 px-2 py-1 text-lg font-bold tracking-tight text-neutral-900 outline-none focus:border-neutral-950"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                setName(target.name)
                                setEditing(true)
                            }}
                            title="Rename"
                            className="group flex items-center gap-2 text-left"
                        >
                            <span className="truncate text-lg font-bold tracking-tight text-neutral-900">
                                {target.name}
                            </span>
                            <i
                                className="fa-solid fa-pen text-[10px] text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
                                aria-hidden="true"
                            />
                        </button>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        title={target.priority ? 'Remove priority' : 'Mark as priority'}
                        onClick={() => onUpdate(target._id, { priority: !target.priority })}
                        className={[
                            'grid h-7 w-7 place-items-center rounded-full transition-colors',
                            target.priority
                                ? 'text-amber-500 hover:bg-amber-50 hover:text-amber-600'
                                : 'text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500',
                        ].join(' ')}
                    >
                        <i
                            className={`${target.priority ? 'fa-solid' : 'fa-regular'} fa-flag text-xs`}
                            aria-hidden="true"
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                        <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {confirming ? (
                <div className="mt-4 rounded-2xl bg-red-50 p-4">
                    <p className="text-sm font-semibold text-red-700">Delete {target.name}?</p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={busy}
                            className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                        >
                            {busy ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            className="rounded-full border border-neutral-200 bg-white px-4 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-50"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="mt-4 text-2xl font-bold tabular-nums tracking-tight text-neutral-900">
                        {target.mode === 'contribution' ? (
                            <>£{fmt(target.targetAmount, 0)} <span className="text-sm font-semibold text-neutral-400">projected</span></>
                        ) : target.onTrack ? (
                            <span className="text-emerald-600">On track — £0 / month</span>
                        ) : (
                            <>£{fmt(target.requiredMonthly)} <span className="text-sm font-semibold text-neutral-400">/ month</span></>
                        )}
                    </p>
                    <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                        {target.mode === 'contribution' ? (
                            <>Saving £{fmt(target.requiredMonthly)} / month ·{' '}
                            {target.contributionMonths} {mo(target.contributionMonths)} of saving</>
                        ) : (
                            <>£{fmt(target.targetAmount, 0)} target
                            {!target.onTrack && (
                                <> · {target.contributionMonths}{' '}
                                {mo(target.contributionMonths)} of saving</>
                            )}</>
                        )}
                    </p>

                    <PlanDatesGrid target={target} />
                    <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-400 tabular-nums">
                        From £{fmt(target.startingBalance, 0)} at {fmt(target.annualInterestRate, 2)}% ·
                        contributions £{fmt(target.totalContributions, 0)} · interest £
                        {fmt(target.interestEarned, 0)}
                    </p>
                    {editingNotes ? (
                        <textarea
                            autoFocus
                            value={notesDraft}
                            onChange={(e) => setNotesDraft(e.target.value)}
                            onBlur={commitNotes}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingNotes(false)
                            }}
                            rows={3}
                            placeholder="Notes…"
                            className="mt-3 w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 text-xs text-neutral-700 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
                        />
                    ) : target.notes ? (
                        <button
                            type="button"
                            onClick={openNotesEditor}
                            title="Edit notes"
                            className="group mt-3 w-full text-left"
                        >
                            <p className="whitespace-pre-wrap text-xs text-neutral-500">
                                {target.notes}
                                <i
                                    className="fa-solid fa-pen ml-2 text-[9px] text-neutral-300 opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-hidden="true"
                                />
                            </p>
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={openNotesEditor}
                            className="mt-3 text-xs font-semibold text-neutral-300 transition-colors hover:text-neutral-500"
                        >
                            <i className="fa-solid fa-plus mr-1 text-[9px]" aria-hidden="true" />
                            Add notes
                        </button>
                    )}
                    <div className="mt-4 border-t border-neutral-100 pt-3">
                        <Checkbox
                            checked={selected}
                            onChange={onToggleSelect}
                            label="Include in long-term view"
                        />
                    </div>
                </>
            )}
        </div>
    )
}

// ── Long-term outlook (combined plans) ───────────────────────────────────────

const OUTLOOK_HORIZONS = [1, 3, 5, 10] as const
type OutlookHorizon = (typeof OUTLOOK_HORIZONS)[number]

const PLAN_BAR_COLORS = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-cyan-500',
]

/** What a plan asks you to put away in a given month — £0 outside its window. */
function planMonthlyFor(plan: SavingsTarget, m: string): number {
    if (plan.onTrack) return 0
    return m >= plan.startMonth && m <= plan.targetMonth ? plan.requiredMonthly : 0
}

interface OutlookYearRow {
    index: number
    firstMonth: string
    lastMonth: string
    /** Contributions per plan id within this year. */
    perPlan: Map<string, number>
    contributions: number
    cumulative: number
    peakMonthly: number
}

/**
 * Bucket the selected plans' monthly commitments into Year 1..N from
 * `startMonth`. Overlapping plans stack; sequential plans hand over — the
 * per-year rows and the overall peak make both cases readable.
 */
function buildOutlook(plans: SavingsTarget[], startMonth: string, years: number) {
    const rows: OutlookYearRow[] = []
    let m = startMonth
    let cumulative = 0
    let peakMonthly = 0
    let peakMonth = startMonth
    for (let y = 1; y <= years; y++) {
        const firstMonth = m
        let lastMonth = m
        const perPlan = new Map<string, number>()
        let yearPeak = 0
        for (let i = 0; i < 12; i++) {
            let monthTotal = 0
            for (const p of plans) {
                const c = planMonthlyFor(p, m)
                if (c > 0) perPlan.set(p._id, (perPlan.get(p._id) ?? 0) + c)
                monthTotal += c
            }
            yearPeak = Math.max(yearPeak, monthTotal)
            if (monthTotal > peakMonthly) {
                peakMonthly = monthTotal
                peakMonth = m
            }
            lastMonth = m
            m = addMonths(m, 1)
        }
        const contributions = [...perPlan.values()].reduce((s, v) => s + v, 0)
        cumulative += contributions
        rows.push({
            index: y,
            firstMonth,
            lastMonth,
            perPlan,
            contributions,
            cumulative,
            peakMonthly: yearPeak,
        })
    }
    return { rows, peakMonthly, peakMonth }
}

function monthLabelShort(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
}

/** A moment worth marking on the outlook: a plan starting or finishing. */
interface OutlookEventBase {
    plan: SavingsTarget
    month: string
    monthsAway: number
    /** Combined monthly saving across all plans once this event happens. */
    monthlyAfter: number
}
interface StartEvent extends OutlookEventBase {
    kind: 'start'
}
interface FinishEvent extends OutlookEventBase {
    kind: 'finish'
    /** Everything put in across ALL selected plans from now through this month. */
    contributedByThen: number
    /** Combined monthly saving in this plan's final month. */
    monthlyBefore: number
}
type OutlookEvent = StartEvent | FinishEvent

function buildTimelineEvents(plans: SavingsTarget[], now: string): OutlookEvent[] {
    const byFinish = [...plans].sort((a, b) => (a.targetMonth < b.targetMonth ? -1 : 1))
    const combined = (m: string) => plans.reduce((s, q) => s + planMonthlyFor(q, m), 0)

    const events: OutlookEvent[] = []
    // Future starts only — plans already underway are covered by the Today node.
    for (const p of plans) {
        if (p.startMonth > now && !p.onTrack && p.requiredMonthly > 0) {
            events.push({
                kind: 'start',
                plan: p,
                month: p.startMonth,
                monthsAway: monthsUntil(now, p.startMonth),
                monthlyAfter: combined(p.startMonth),
            })
        }
    }
    for (const p of byFinish) {
        let contributed = 0
        for (let m = now; m <= p.targetMonth; m = addMonths(m, 1)) contributed += combined(m)
        events.push({
            kind: 'finish',
            plan: p,
            month: p.targetMonth,
            monthsAway: monthsUntil(now, p.targetMonth),
            contributedByThen: contributed,
            monthlyBefore: combined(p.targetMonth),
            monthlyAfter: combined(addMonths(p.targetMonth, 1)),
        })
    }
    // Chronological; same-month ties read finish-then-start (the natural handover).
    return events.sort((a, b) => {
        if (a.month !== b.month) return a.month < b.month ? -1 : 1
        if (a.kind === b.kind) return 0
        return a.kind === 'finish' ? -1 : 1
    })
}

function LongTermOutlook({ plans }: { plans: SavingsTarget[] }) {
    const now = currentMonth()
    const [horizon, setHorizon] = useState<OutlookHorizon>(5)
    const totalMonths = horizon * 12

    const { rows, peakMonthly, peakMonth } = buildOutlook(plans, now, horizon)
    const timelineEvents = buildTimelineEvents(plans, now)
    const colorFor = new Map(
        plans.map((p, i) => [p._id, PLAN_BAR_COLORS[i % PLAN_BAR_COLORS.length]])
    )

    const currentMonthly = plans.reduce((s, p) => s + planMonthlyFor(p, now), 0)
    const totalContributions = rows.reduce((s, r) => s + r.contributions, 0)

    // Timeline geometry: month index 0 = this month.
    const bars = plans.map((p) => {
        const rawStart = monthsUntil(now, p.startMonth)
        const rawEnd = monthsUntil(now, p.targetMonth)
        const start = Math.max(0, rawStart)
        const end = Math.min(totalMonths - 1, rawEnd)
        return {
            plan: p,
            start,
            end,
            visible: rawEnd >= 0 && rawStart <= totalMonths - 1,
            endedBeforeNow: rawEnd < 0,
        }
    })

    return (
        <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                        Long-term outlook
                    </h2>
                    <p className="mt-0.5 text-xs text-neutral-400">
                        {plans.length} {plans.length === 1 ? 'plan' : 'plans'} combined — overlapping
                        plans stack, sequential ones hand over.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {OUTLOOK_HORIZONS.map((y) => (
                        <button
                            key={y}
                            type="button"
                            onClick={() => setHorizon(y)}
                            className={[
                                'rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-all duration-150 active:scale-[0.97]',
                                horizon === y
                                    ? 'bg-neutral-950 text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                            ].join(' ')}
                        >
                            {y}
                            {y === 1 ? ' yr' : ' yrs'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Headline stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                <div className="flex flex-col gap-1.5 rounded-3xl bg-neutral-950 px-5 py-5 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Saving this month
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                        £{fmt(currentMonthly, 0)}
                    </p>
                    <p className="text-xs text-neutral-500">across selected plans</p>
                </div>
                <div className="flex flex-col gap-1.5 rounded-3xl bg-neutral-950 px-5 py-5 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Peak monthly
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                        £{fmt(peakMonthly, 0)}
                    </p>
                    <p className="text-xs text-neutral-500">
                        {peakMonthly > 0 ? monthLabelShort(peakMonth) : 'no saving in this window'}
                    </p>
                </div>
                <div className="flex flex-col gap-1.5 rounded-3xl bg-neutral-950 px-5 py-5 text-white">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        Contributed over {horizon} {horizon === 1 ? 'yr' : 'yrs'}
                    </p>
                    <p className="text-2xl font-bold tabular-nums tracking-tight">
                        {fmtCompact(totalContributions)}
                    </p>
                    <p className="text-xs text-neutral-500 tabular-nums">
                        £{fmt(totalContributions, 0)}
                    </p>
                </div>
            </div>

            {/* Timeline */}
            <div className="mt-4 rounded-3xl border border-neutral-200 bg-white p-6">
                <div className="flex flex-col gap-3">
                    {bars.map(({ plan, start, end, visible, endedBeforeNow }) => {
                        const color = colorFor.get(plan._id) ?? PLAN_BAR_COLORS[0]
                        const span = end - start + 1
                        const wideEnough = span / totalMonths >= 0.18
                        // Full plan length, start month through target month inclusive.
                        const durationMonths = monthsUntil(plan.startMonth, plan.targetMonth) + 1
                        return (
                            <div key={plan._id} className="flex items-center gap-3">
                                <div className="w-40 shrink-0">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
                                        />
                                        <span className="truncate text-xs font-semibold text-neutral-700">
                                            {plan.name}
                                        </span>
                                    </div>
                                    <p className="ml-[18px] text-[11px] text-neutral-400 tabular-nums">
                                        {plan.onTrack || plan.requiredMonthly <= 0
                                            ? 'nothing to save monthly'
                                            : `save £${fmt(plan.requiredMonthly, 0)} / month`}
                                    </p>
                                    <p className="ml-[18px] text-[11px] text-neutral-400 tabular-nums">
                                        {durationMonths} {mo(durationMonths)} start to finish
                                    </p>
                                </div>
                                <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-neutral-50">
                                    {Array.from({ length: horizon - 1 }, (_, i) => (
                                        <div
                                            key={i}
                                            className="absolute inset-y-0 w-px bg-neutral-200"
                                            style={{
                                                left: `${(((i + 1) * 12) / totalMonths) * 100}%`,
                                            }}
                                        />
                                    ))}
                                    {visible ? (
                                        <div
                                            className={`absolute inset-y-1 flex items-center justify-center rounded-md ${color}`}
                                            style={{
                                                left: `${(start / totalMonths) * 100}%`,
                                                width: `${(span / totalMonths) * 100}%`,
                                            }}
                                            title={`${monthLabelShort(plan.startMonth)} – ${monthLabelShort(plan.targetMonth)} · ${durationMonths} ${mo(durationMonths)} · £${fmt(plan.requiredMonthly)} / month`}
                                        >
                                            {wideEnough && plan.requiredMonthly > 0 && (
                                                <span className="truncate px-2 text-[10px] font-bold tabular-nums text-white">
                                                    £{fmt(plan.requiredMonthly, 0)} / month
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="absolute inset-0 grid place-items-center text-[11px] text-neutral-400">
                                            {endedBeforeNow
                                                ? `finished ${monthLabelShort(plan.targetMonth)}`
                                                : `starts ${monthLabelShort(plan.startMonth)} — beyond this horizon`}
                                        </span>
                                    )}
                                </div>
                                <div className="w-24 shrink-0 text-right">
                                    <p className="text-xs font-bold tabular-nums text-neutral-900">
                                        £{fmt(plan.targetAmount, 0)}
                                    </p>
                                    <p className="text-[10px] text-neutral-400">
                                        in this pot
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                    <div className="flex items-center gap-3">
                        <div className="w-40 shrink-0" />
                        <div className="flex flex-1">
                            {Array.from({ length: horizon }, (_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 text-center text-[10px] font-semibold uppercase tracking-wider text-neutral-400"
                                >
                                    {horizon > 5 ? `Yr ${i + 1}` : `Year ${i + 1}`}
                                </div>
                            ))}
                        </div>
                        <div className="w-24 shrink-0" />
                    </div>
                </div>
            </div>

            {/* Milestones — how much you'll have, by when */}
            <div className="mt-4 rounded-3xl border border-neutral-200 bg-white p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    How much, by when
                </p>
                <ol className="mt-5">
                    {/* Today */}
                    <li className="relative flex gap-4 pb-7">
                        {timelineEvents.length > 0 && (
                            <span className="absolute bottom-0 left-[5px] top-4 w-px bg-neutral-200" />
                        )}
                        <span className="relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2 border-neutral-950 bg-white" />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-neutral-900">Today</p>
                            <p className="mt-0.5 text-xs text-neutral-400 tabular-nums">
                                {currentMonthly > 0
                                    ? `putting away £${fmt(currentMonthly, 0)} a month across ${plans.length} ${plans.length === 1 ? 'plan' : 'plans'}`
                                    : 'nothing to put away this month'}
                            </p>
                        </div>
                    </li>

                    {timelineEvents.map((ev, i) => {
                        const reached = ev.monthsAway < 0
                        const when = reached
                            ? 'already reached'
                            : ev.monthsAway === 0
                              ? 'this month'
                              : `in ${ev.monthsAway} ${mo(ev.monthsAway)}`
                        const color = colorFor.get(ev.plan._id)
                        const line = i < timelineEvents.length - 1 && (
                            <span className="absolute bottom-0 left-[5px] top-4 w-px bg-neutral-200" />
                        )

                        if (ev.kind === 'start') {
                            return (
                                <li
                                    key={`${ev.plan._id}-start`}
                                    className="relative flex gap-4 pb-7 last:pb-0"
                                >
                                    {line}
                                    {/* Hollow dot — saving begins here, pot not finished yet. */}
                                    <span
                                        className={`relative mt-1 grid h-[11px] w-[11px] shrink-0 place-items-center rounded-full ${color}`}
                                    >
                                        <span className="h-[5px] w-[5px] rounded-full bg-white" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-neutral-900">
                                            {monthLabelLong(ev.month)}
                                            <span className="ml-2 text-xs font-semibold text-neutral-400">
                                                {when}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 truncate text-sm text-neutral-600">
                                            Start saving for{' '}
                                            <span className="font-semibold text-neutral-900">
                                                {ev.plan.name}
                                            </span>{' '}
                                            — £{fmt(ev.plan.requiredMonthly, 0)}/month
                                        </p>
                                        <p className="mt-0.5 text-xs text-neutral-400 tabular-nums">
                                            monthly saving becomes £{fmt(ev.monthlyAfter, 0)}
                                        </p>
                                    </div>
                                </li>
                            )
                        }

                        const monthlyChange =
                            ev.monthlyAfter === ev.monthlyBefore
                                ? null
                                : ev.monthlyAfter === 0
                                  ? 'nothing left to save each month'
                                  : `monthly saving becomes £${fmt(ev.monthlyAfter, 0)}`
                        return (
                            <li
                                key={`${ev.plan._id}-finish`}
                                className="relative flex gap-4 pb-7 last:pb-0"
                            >
                                {line}
                                <span
                                    className={`relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ${color} ${reached ? 'opacity-40' : ''}`}
                                />
                                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-x-6 gap-y-2">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-neutral-900">
                                            {monthLabelLong(ev.month)}
                                            <span
                                                className={`ml-2 text-xs font-semibold ${reached ? 'text-emerald-600' : 'text-neutral-400'}`}
                                            >
                                                {when}
                                            </span>
                                        </p>
                                        <p className="mt-0.5 truncate text-sm text-neutral-600">
                                            <span className="font-semibold text-neutral-900">
                                                {ev.plan.name}
                                            </span>{' '}
                                            done
                                        </p>
                                        <p className="mt-0.5 text-xs text-neutral-400 tabular-nums">
                                            £{fmt(ev.contributedByThen, 0)} put in across all plans
                                            by then
                                            {monthlyChange && <> · {monthlyChange}</>}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                            This pot
                                        </p>
                                        <p className="text-lg font-bold tabular-nums tracking-tight text-neutral-900">
                                            £{fmt(ev.plan.targetAmount, 0)}
                                        </p>
                                        <p className="text-[11px] text-neutral-400">
                                            ready to spend
                                        </p>
                                    </div>
                                </div>
                            </li>
                        )
                    })}
                </ol>
            </div>
        </section>
    )
}

function TargetPlannerSection({
    defaultBalance,
    defaultRate,
}: {
    defaultBalance: number
    defaultRate: number
}) {
    const toast = useToast()
    const now = currentMonth()
    const [mode, setMode] = useState<'target' | 'contribution'>('target')
    const [targetAmount, setTargetAmount] = useState('10000')
    const [monthlyAmount, setMonthlyAmount] = useState('250')
    const [balance, setBalance] = useState(String(Math.round(defaultBalance)))
    const [rate, setRate] = useState(String(Math.round(defaultRate * 100) / 100))
    const [startDate, setStartDate] = useState(`${now}-01`)
    const [targetDate, setTargetDate] = useState(`${addMonths(now, 12)}-01`)

    const [snapshots, setSnapshots] = useState<SavingsTarget[]>([])
    const [snapshotsLoading, setSnapshotsLoading] = useState(true)
    const [snapshotName, setSnapshotName] = useState('')
    const [snapshotNotes, setSnapshotNotes] = useState('')
    const [saving, setSaving] = useState(false)
    // Drag-to-reorder: the card being dragged and the card it's hovering over.
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [overIndex, setOverIndex] = useState<number | null>(null)
    // Plans picked for the combined long-term view.
    const [selectedIds, setSelectedIds] = useState<string[]>([])

    useEffect(() => {
        let active = true
        listSavingsTargets()
            .then((t) => active && setSnapshots(t))
            .finally(() => active && setSnapshotsLoading(false))
        return () => {
            active = false
        }
    }, [])

    const parse = (s: string) => {
        const n = parseFloat(s.replace(/,/g, ''))
        return Number.isNaN(n) ? 0 : n
    }

    const plan = computeTargetPlan(
        parse(balance),
        parse(targetAmount),
        parse(rate),
        startDate.slice(0, 7),
        targetDate.slice(0, 7),
        now
    )
    const contribPlan = computeContributionPlan(
        parse(balance),
        parse(monthlyAmount),
        parse(rate),
        startDate.slice(0, 7),
        targetDate.slice(0, 7),
        now
    )
    const activeError = mode === 'target' ? plan.error : contribPlan.error

    async function handleSave() {
        const endLabel = monthLabelLong(targetDate.slice(0, 7))
        const defaultName =
            mode === 'target'
                ? `£${parse(targetAmount).toLocaleString('en-GB')} by ${endLabel}`
                : `£${parse(monthlyAmount).toLocaleString('en-GB')}/month until ${endLabel}`
        setSaving(true)
        try {
            const created = await createSavingsTarget(
                mode === 'target'
                    ? {
                          name: snapshotName.trim() || defaultName,
                          notes: snapshotNotes.trim() || undefined,
                          mode: 'target',
                          targetAmount: parse(targetAmount),
                          startingBalance: parse(balance),
                          annualInterestRate: parse(rate),
                          startMonth: plan.firstContribMonth,
                          targetMonth: targetDate.slice(0, 7),
                          savedMonth: now,
                          onTrack: plan.onTrack,
                          requiredMonthly: plan.requiredMonthly,
                          contributionMonths: plan.contributionMonths,
                          totalContributions: plan.totalContributions,
                          interestEarned: plan.interestEarned,
                          growthOnly: plan.growthOnly,
                      }
                    : {
                          name: snapshotName.trim() || defaultName,
                          notes: snapshotNotes.trim() || undefined,
                          mode: 'contribution',
                          // In contribution mode the projected pot is the "target".
                          targetAmount: contribPlan.finalBalance,
                          startingBalance: parse(balance),
                          annualInterestRate: parse(rate),
                          startMonth: contribPlan.firstContribMonth,
                          targetMonth: targetDate.slice(0, 7),
                          savedMonth: now,
                          onTrack: false,
                          requiredMonthly: parse(monthlyAmount),
                          contributionMonths: contribPlan.contributionMonths,
                          totalContributions: contribPlan.totalContributions,
                          interestEarned: contribPlan.interestEarned,
                          growthOnly: contribPlan.growthOnly,
                      }
            )
            setSnapshots((prev) => [created, ...prev])
            setSnapshotName('')
            setSnapshotNotes('')
            toast.show('Plan saved.', 'success')
        } catch {
            toast.error("Couldn't save that plan.")
        } finally {
            setSaving(false)
        }
    }

    async function handleUpdate(
        id: string,
        fields: { name?: string; notes?: string | null; priority?: boolean }
    ) {
        try {
            const updated = await updateSavingsTarget(id, fields)
            setSnapshots((prev) => prev.map((t) => (t._id === id ? updated : t)))
        } catch {
            toast.error("Couldn't update that plan.")
        }
    }

    // Move a plan to a new position (drag and drop), then persist the sequential
    // order of every plan whose position changed.
    async function handleReorder(from: number, to: number) {
        if (from === to || from < 0 || to < 0 || from >= snapshots.length || to >= snapshots.length)
            return
        const reordered = [...snapshots]
        const [moved] = reordered.splice(from, 1)
        reordered.splice(to, 0, moved)
        const withOrder = reordered.map((t, i) => ({ ...t, order: i }))
        const prevById = new Map(snapshots.map((t) => [t._id, t.order]))
        setSnapshots(withOrder)
        const changed = withOrder.filter((t) => prevById.get(t._id) !== t.order)
        await Promise.all(
            changed.map((t) => updateSavingsTarget(t._id, { order: t.order }))
        ).catch(() => listSavingsTargets().then(setSnapshots))
    }

    async function handleDelete(id: string) {
        try {
            await deleteSavingsTarget(id)
            setSnapshots((prev) => prev.filter((t) => t._id !== id))
            setSelectedIds((prev) => prev.filter((x) => x !== id))
        } catch {
            toast.error("Couldn't delete that plan.")
        }
    }

    function toggleSelect(id: string) {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
    }

    // Keep the outlook's plan order (and colours) stable by following card order.
    const selectedPlans = snapshots.filter((t) => selectedIds.includes(t._id))

    return (
        <section>
            <div className="mb-8">
                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Saved plans
                </h2>
                {snapshotsLoading ? (
                    <div className="grid place-items-center py-8">
                        <Spinner />
                    </div>
                ) : snapshots.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                        No saved plans yet — create one below and hit “Save plan” to keep a
                        snapshot of it.
                    </p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {snapshots.map((t, i) => (
                            <SavedTargetCard
                                key={t._id}
                                target={t}
                                isDragging={dragIndex === i}
                                isDragOver={
                                    dragIndex !== null && overIndex === i && dragIndex !== i
                                }
                                selected={selectedIds.includes(t._id)}
                                onToggleSelect={() => toggleSelect(t._id)}
                                onUpdate={handleUpdate}
                                onDelete={handleDelete}
                                onDragStart={() => setDragIndex(i)}
                                onDragOver={() => setOverIndex(i)}
                                onDrop={() => {
                                    if (dragIndex !== null) handleReorder(dragIndex, i)
                                    setDragIndex(null)
                                    setOverIndex(null)
                                }}
                                onDragEnd={() => {
                                    setDragIndex(null)
                                    setOverIndex(null)
                                }}
                            />
                        ))}
                    </div>
                )}

                {selectedPlans.length > 0 && <LongTermOutlook plans={selectedPlans} />}
            </div>

            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Create a savings plan
            </h2>
            <div className="rounded-3xl border border-neutral-200 bg-white p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <Tabs
                        tabs={['Reach a target', 'Save a set amount']}
                        value={mode === 'target' ? 'Reach a target' : 'Save a set amount'}
                        onChange={(t) => setMode(t === 'Reach a target' ? 'target' : 'contribution')}
                    />
                    <p className="max-w-xs text-xs text-neutral-400">
                        {mode === 'target'
                            ? 'Work out the monthly amount needed to hit a target.'
                            : 'Fix a monthly amount and see how much you end up with.'}
                    </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {mode === 'target' ? (
                        <SettingField
                            label="Target amount"
                            prefix="£"
                            value={targetAmount}
                            onChange={setTargetAmount}
                            onCommit={(v) => setTargetAmount(String(v))}
                        />
                    ) : (
                        <SettingField
                            label="Monthly amount"
                            prefix="£"
                            value={monthlyAmount}
                            onChange={setMonthlyAmount}
                            onCommit={(v) => setMonthlyAmount(String(v))}
                        />
                    )}
                    <SettingField
                        label="Starting balance"
                        prefix="£"
                        value={balance}
                        onChange={setBalance}
                        onCommit={(v) => setBalance(String(v))}
                    />
                    <SettingField
                        label="Annual interest rate"
                        suffix="%"
                        value={rate}
                        onChange={setRate}
                        onCommit={(v) => setRate(String(v))}
                    />
                    <MonthField
                        label="Start saving from"
                        value={startDate}
                        minDate={`${now}-01`}
                        maxDate={targetDate}
                        onChange={setStartDate}
                    />
                    <MonthField
                        label={mode === 'target' ? 'Reach target by' : 'Save until'}
                        value={targetDate}
                        minDate={startDate}
                        onChange={setTargetDate}
                    />
                    <p className="self-end pb-1 text-xs text-neutral-400">
                        Balance and rate are pre-filled from your savings accounts — adjust them
                        freely; nothing here changes your sheet.
                    </p>
                </div>

                <div className="mt-6">
                    {activeError ? (
                        <p className="text-sm text-neutral-400">{activeError}</p>
                    ) : mode === 'contribution' ? (
                        <div className="flex flex-col gap-4">
                            <div className="rounded-2xl bg-neutral-950 px-5 py-5 text-white">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                    You'll have saved
                                </p>
                                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                    £{fmt(contribPlan.finalBalance, 0)}
                                </p>
                                <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                                    by {monthLabelLong(targetDate.slice(0, 7))} · £
                                    {fmt(parse(monthlyAmount))} / month ·{' '}
                                    {contribPlan.contributionMonths}{' '}
                                    {contribPlan.contributionMonths === 1 ? 'month' : 'months'} from{' '}
                                    {monthLabelLong(contribPlan.firstContribMonth)}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Total contributions
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">
                                        £{fmt(contribPlan.totalContributions, 0)}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Interest earned
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-emerald-600">
                                        +£{fmt(contribPlan.interestEarned, 0)}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Balance if you save nothing
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">
                                        £{fmt(contribPlan.growthOnly, 0)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : plan.onTrack ? (
                        <div className="rounded-2xl bg-emerald-600 px-5 py-5 text-white">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
                                Already on track
                            </p>
                            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                £0 / month
                            </p>
                            <p className="mt-1 text-xs text-emerald-100 tabular-nums">
                                Interest alone takes your balance to £{fmt(plan.growthOnly, 0)} by{' '}
                                {monthLabelLong(targetDate.slice(0, 7))} — £
                                {fmt(plan.growthOnly - parse(targetAmount), 0)} over target.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-4">
                            <div className="rounded-2xl bg-neutral-950 px-5 py-5 text-white">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                    You need to save
                                </p>
                                <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
                                    £{fmt(plan.requiredMonthly)} / month
                                </p>
                                <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                                    {plan.contributionMonths}{' '}
                                    {plan.contributionMonths === 1 ? 'month' : 'months'} ·{' '}
                                    {monthLabelLong(plan.firstContribMonth)} to{' '}
                                    {monthLabelLong(targetDate.slice(0, 7))} · ≈ £
                                    {fmt((plan.requiredMonthly * 12) / 52)} / week
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Total contributions
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">
                                        £{fmt(plan.totalContributions, 0)}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Interest earned
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-emerald-600">
                                        +£{fmt(plan.interestEarned, 0)}
                                    </p>
                                </div>
                                <div className="rounded-2xl bg-neutral-50 px-4 py-3.5">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Balance if you save nothing
                                    </p>
                                    <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">
                                        £{fmt(plan.growthOnly, 0)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {!activeError && (
                        <div className="mt-4 flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    value={snapshotName}
                                    onChange={(e) => setSnapshotName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !saving) handleSave()
                                    }}
                                    placeholder="Name this plan (e.g. House deposit)"
                                    className="min-w-0 flex-1 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-semibold text-neutral-900 outline-none transition-all placeholder:font-normal placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
                                />
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="rounded-full bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-neutral-800 active:scale-[0.97] disabled:opacity-50"
                                >
                                    {saving ? 'Saving…' : 'Save plan'}
                                </button>
                            </div>
                            <textarea
                                value={snapshotNotes}
                                onChange={(e) => setSnapshotNotes(e.target.value)}
                                rows={2}
                                placeholder="Notes (optional) — why this target, what it's for…"
                                className="w-full resize-none rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm text-neutral-700 outline-none transition-all placeholder:text-neutral-400 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/5"
                            />
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavingsForecast() {
    useMoneyHidden() // re-render this subtree when money is hidden/shown
    const toast = useToast()
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [horizon, setHorizon] = useState<Horizon>(10)
    const [view, setView] = useState<'Projection' | 'Savings to date' | 'Target planner'>('Projection')
    const [openYear, setOpenYear] = useState<number | null>(null)

    const month = currentMonth()

    useEffect(() => {
        let active = true
        setLoading(true)
        Promise.all([listGroups(), listRows(), listEntries(month)])
            .then(([g, r, e]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [month])

    async function handleUpdateGroup(id: string, fields: Partial<FinanceGroup>) {
        try {
            const updated = await updateGroup(id, fields)
            setGroups((prev) => prev.map((g) => (g._id === id ? updated : g)))
        } catch {
            toast.error("Couldn’t save that setting.")
        }
    }

    async function handleDeleteGroup(id: string) {
        try {
            await deleteGroup(id, "all")
            setGroups((prev) => prev.filter((g) => g._id !== id))
        } catch {
            toast.error("Couldn’t delete that account.")
        }
    }

    /**
     * Describe when the group is active for the delete confirmation.
     * Returns { recurring, months } where recurring=true means open-ended
     * and months is a bounded list (only populated when start and end are both known).
     */
    function groupActiveDescription(group: FinanceGroup): { recurring: boolean; months: string[] } {
        const groupRows = rows.filter((r) => r.group === group._id)

        // Non-recurring rows have a specific month set on them directly.
        const oneOffMonths = groupRows
            .filter((r) => r.recurring === false && r.month)
            .map((r) => r.month as string)

        // Recurring rows: check if any are open-ended (no endMonth on row or group).
        const recurringRows = groupRows.filter((r) => r.recurring !== false)
        const isOpenEnded = recurringRows.some(
            (r) => !r.endMonth && !group.endMonth
        )

        if (isOpenEnded) {
            return { recurring: true, months: [] }
        }

        // All rows are bounded — enumerate the months.
        const bounded: string[] = [...oneOffMonths]
        for (const row of recurringRows) {
            const start = row.startMonth ?? group.startMonth
            const end = row.endMonth ?? group.endMonth
            if (!start || !end) continue
            let m = start
            while (m <= end) {
                bounded.push(m)
                m = addMonths(m, 1)
            }
        }

        const sorted = [...new Set(bounded)].sort()
        return { recurring: false, months: sorted }
    }

    // A savings stream forecasts forward as long as it hasn't *ended* before now.
    // Months you've skipped (e.g. June/July) or a future start don't disqualify it
    // — the forecast is the ongoing, steady-state picture, not a single month.
    function liveFromNow(item: { endMonth?: string | null }): boolean {
        return !item.endMonth || item.endMonth >= month
    }

    const savingsGroups = groups.filter((g) => g.type === 'savings' && liveFromNow(g))

    // Steady monthly contribution per group: each recurring row's amount — this
    // month's override if one is set, otherwise the recurring amount. A skipped
    // current month no longer zeroes this out. Used for the per-group settings card.
    // Deliberately reads the latest recurringAmount rather than the month-resolved
    // value: this is the go-forward assumption driving the projection, so a
    // "from next month onwards" change should show here immediately.
    function monthlyContribution(group: FinanceGroup): number {
        const groupRows = rows.filter(
            (r) => r.group === group._id && r.recurring !== false && liveFromNow(r)
        )
        return groupRows.reduce((sum, row) => {
            const entry = entries.find((e) => e.row === row._id)
            return sum + (entry?.amount ?? row.recurringAmount ?? 0)
        }, 0)
    }

    // What a group actually contributes in a specific month — £0 when the group or
    // a row is skipped/inactive that month, so the forecast pauses and resumes with
    // your real schedule. Future months use the recurring amount; the current month
    // honours any per-month override you've set on the sheet.
    function contributionForMonth(group: FinanceGroup, m: string): number {
        if (!groupVisibleInMonth(group, m)) return 0
        return rows
            .filter(
                (r) =>
                    r.group === group._id && r.recurring !== false && rowVisibleInMonth(r, m, group)
            )
            .reduce((sum, row) => {
                const override =
                    m === month ? entries.find((e) => e.row === row._id)?.amount : undefined
                return sum + (override ?? recurringAmountForMonth(row, m) ?? 0)
            }, 0)
    }

    // Aggregate across all savings groups
    const totalCurrentBalance = savingsGroups.reduce((s, g) => s + (g.currentBalance ?? 0), 0)
    const totalMonthly = savingsGroups.reduce((s, g) => s + monthlyContribution(g), 0)

    // Blended annual rate (weighted by contribution)
    const blendedRate =
        totalMonthly > 0
            ? savingsGroups.reduce(
                  (s, g) => s + (g.annualInterestRate ?? 0) * monthlyContribution(g),
                  0
              ) / totalMonthly
            : savingsGroups.length > 0
              ? savingsGroups.reduce((s, g) => s + (g.annualInterestRate ?? 0), 0) /
                savingsGroups.length
              : 0

    const yearlyTable = buildYearlyTable(savingsGroups, contributionForMonth, month, horizon)
    const totalContributions = yearlyTable.reduce((s, r) => s + r.contributions, 0)

    // True when any savings stream pauses or stops within the forecast — a skipped
    // month, a start still in the future, or an end date. Drives the gaps note so
    // the "why isn't this a flat line?" question answers itself.
    const savingsGroupIds = new Set(savingsGroups.map((g) => g._id))
    const hasSchedule = (item: {
        skipMonths?: string[]
        startMonth?: string | null
        endMonth?: string | null
    }) =>
        (item.skipMonths?.length ?? 0) > 0 ||
        (!!item.startMonth && item.startMonth > month) ||
        !!item.endMonth
    const hasScheduleGaps =
        savingsGroups.some(hasSchedule) ||
        rows.some((r) => savingsGroupIds.has(r.group) && r.recurring !== false && hasSchedule(r))

    // Milestone years to highlight (spread across horizon)
    const milestoneYears = HORIZONS.filter((y) => y <= horizon).slice(-4)

    return (
        <>
            <header className="mb-8">
                <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">
                    Savings Forecast
                </h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Project how your savings grow over time based on monthly contributions and
                    interest.
                </p>
            </header>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : savingsGroups.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-piggy-bank"
                    title="No savings groups yet"
                    description="Add a group of type 'Savings' on the Monthly tab to start forecasting."
                />
            ) : (
                <div className="flex flex-col gap-8">
                    <div className="overflow-x-auto">
                        <Tabs
                            tabs={['Projection', 'Savings to date', 'Target planner']}
                            value={view}
                            onChange={(t) => setView(t as typeof view)}
                        />
                    </div>

                    {view === 'Savings to date' ? (
                        <LiveSavingsSection groups={groups} rows={rows} />
                    ) : view === 'Target planner' ? (
                        <TargetPlannerSection
                            defaultBalance={totalCurrentBalance}
                            defaultRate={blendedRate}
                        />
                    ) : (
                        <>
                            {/* Headline: milestones + horizon control */}
                            <section>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                            Projected balance
                                        </h2>
                                        {blendedRate > 0 && (
                                            <p className="mt-0.5 text-xs text-neutral-400">
                                                at {fmt(blendedRate, 2)}% blended annual rate
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {HORIZONS.map((y) => (
                                            <button
                                                key={y}
                                                type="button"
                                                onClick={() => setHorizon(y)}
                                                className={[
                                                    'rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-all duration-150 active:scale-[0.97]',
                                                    horizon === y
                                                        ? 'bg-neutral-950 text-white'
                                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                                                ].join(' ')}
                                            >
                                                {y}
                                                {y === 1 ? ' yr' : ' yrs'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                                    {milestoneYears.map((y) => {
                                        const row = yearlyTable[y - 1]
                                        return row ? (
                                            <MilestoneCard
                                                key={y}
                                                year={y}
                                                balance={row.endBalance}
                                                label={y === 1 ? '1 year' : `${y} years`}
                                            />
                                        ) : null
                                    })}
                                </div>
                            </section>

                            {/* Summary stats */}
                            <section className="grid grid-cols-2 gap-4 rounded-3xl border border-neutral-200 bg-white p-6 sm:grid-cols-3">
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Starting balance
                                    </p>
                                    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                                        £{fmt(totalCurrentBalance, 0)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Total contributions
                                    </p>
                                    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                                        £{fmt(totalContributions, 0)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                        Interest earned
                                    </p>
                                    <p className="mt-1 text-xl font-bold tabular-nums tracking-tight text-emerald-600">
                                        £
                                        {fmt(
                                            yearlyTable.reduce((s, r) => s + r.interestEarned, 0),
                                            0
                                        )}
                                    </p>
                                </div>
                            </section>

                            {/* Per-group balance & rate inputs */}
                            <section>
                                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                    Accounts &amp; assumptions
                                </h2>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {savingsGroups.map((group) => (
                                        <GroupSettingsCard
                                            key={group._id}
                                            group={group}
                                            monthlyContribution={monthlyContribution(group)}
                                            activeDescription={groupActiveDescription(group)}
                                            onUpdate={handleUpdateGroup}
                                            onDelete={handleDeleteGroup}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* Year-by-year table */}
                            <section>
                                <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                                    Year by year
                                </h2>
                                {hasScheduleGaps && (
                                    <p className="mb-3 flex items-center gap-2 text-xs text-neutral-400">
                                        <i className="fa-solid fa-circle-info" aria-hidden="true" />
                                        Months you've skipped or where a savings stream hasn't
                                        started (or has ended) contribute nothing — yearly
                                        contributions reflect your actual schedule, not a flat
                                        monthly amount.
                                    </p>
                                )}
                                <div className="overflow-x-auto overflow-hidden rounded-3xl border border-neutral-200 bg-white">
                                    <table className="w-full min-w-[380px]">
                                        <thead>
                                            <tr className="border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                <th className="py-3 pl-5 pr-3 text-left">Year</th>
                                                <th className="py-3 px-3 text-right">
                                                    Contributions
                                                </th>
                                                <th className="py-3 px-3 text-right">Interest</th>
                                                <th className="py-3 pl-3 pr-5 text-right">
                                                    Balance
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100">
                                            {yearlyTable.map((row) => {
                                                const isMilestone = milestoneYears.includes(row.year as Horizon)
                                                const isOpen = openYear === row.year
                                                return (
                                                    <tr
                                                        key={row.year}
                                                        onClick={() => setOpenYear(isOpen ? null : row.year)}
                                                        className={[
                                                            'cursor-pointer transition-colors hover:bg-neutral-50',
                                                            isMilestone ? 'bg-neutral-50 hover:bg-neutral-100' : '',
                                                            isOpen ? 'bg-neutral-100' : '',
                                                        ].join(' ')}
                                                    >
                                                        <td className="py-3 pl-5 pr-3">
                                                            <span className="text-sm font-semibold text-neutral-900">
                                                                Year {row.year}
                                                            </span>
                                                            {isMilestone && (
                                                                <span className="ml-2 rounded-full bg-neutral-200 px-1.5 py-0.5 text-[10px] font-bold text-neutral-600">
                                                                    milestone
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-3 text-right text-sm text-neutral-600">
                                                            £{fmt(row.contributions, 0)}
                                                        </td>
                                                        <td className={`py-3 px-3 text-right text-sm ${row.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>
                                                            {row.interestEarned > 0 ? '+' : ''}£{fmt(row.interestEarned, 0)}
                                                        </td>
                                                        <td className="py-3 pl-3 pr-5 text-right text-sm font-bold text-neutral-900">
                                                            £{fmt(row.endBalance, 0)}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </>
                    )}
                </div>
            )}

            {openYear !== null && (() => {
                const yearRow = yearlyTable[openYear - 1]
                if (!yearRow) return null
                const months = buildMonthlyForYear(savingsGroups, contributionForMonth, month, openYear)
                return (
                    <MonthDrawer
                        yearRow={yearRow}
                        months={months}
                        onClose={() => setOpenYear(null)}
                    />
                )
            })()}
        </>
    )
}
