import { useEffect, useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import DatePicker from '../components/DatePicker'
import Tabs from '../components/Tabs'
import { listGroups, listRows, listEntries, updateGroup, deleteGroup } from '../services/finances'
import { groupVisibleInMonth, rowVisibleInMonth, addMonths } from '../lib/finance'
import { formatAmount, formatMoneyCompact } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import type { FinanceGroup, FinanceRow, FinanceEntry } from '../types'

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
                (s, r) => s + (es.find((e) => e.row === r._id)?.amount ?? r.recurringAmount ?? 0),
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

function monthLabelLong(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

function TargetPlannerSection({
    defaultBalance,
    defaultRate,
}: {
    defaultBalance: number
    defaultRate: number
}) {
    const now = currentMonth()
    const [targetAmount, setTargetAmount] = useState('10000')
    const [balance, setBalance] = useState(String(Math.round(defaultBalance)))
    const [rate, setRate] = useState(String(Math.round(defaultRate * 100) / 100))
    const [startDate, setStartDate] = useState(`${now}-01`)
    const [targetDate, setTargetDate] = useState(`${addMonths(now, 12)}-01`)

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

    return (
        <section>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Target planner
            </h2>
            <div className="rounded-3xl border border-neutral-200 bg-white p-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SettingField
                        label="Target amount"
                        prefix="£"
                        value={targetAmount}
                        onChange={setTargetAmount}
                        onCommit={(v) => setTargetAmount(String(v))}
                    />
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
                        label="Reach target by"
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
                    {plan.error ? (
                        <p className="text-sm text-neutral-400">{plan.error}</p>
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
                return sum + (override ?? row.recurringAmount ?? 0)
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
