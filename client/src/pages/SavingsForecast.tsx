import { useEffect, useRef, useState } from 'react'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Tabs from '../components/Tabs'
import PillToggle from '../components/PillToggle'
import { listGroups, listRows, listEntries, updateGroup, deleteGroup } from '../services/finances'
import TargetPlanner from '../components/finance/TargetPlanner'
import { BigFigure, Stat, Money, MonthField, OVERLINE } from '../components/finance/savingsFigures'
import { groupVisibleInMonth, rowVisibleInMonth, addMonths, recurringAmountForMonth } from '../lib/finance'
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
                <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-5 sm:px-8 sm:py-6">
                    <div>
                        <p className="text-xl font-bold tracking-tight text-neutral-900">
                            Year {yearRow.year}
                        </p>
                        <p className="mt-0.5 text-sm text-neutral-500">Month by month breakdown</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-11 w-11 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 sm:h-9 sm:w-9"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-auto">
                    <table className="w-full sm:min-w-[26rem]">
                        <thead className="sticky top-0 bg-white">
                            <tr className="border-b border-neutral-100 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                <th className="py-4 pl-4 pr-2 text-left sm:pl-8 sm:pr-4">Month</th>
                                <th className="px-2 py-4 text-right sm:px-4">Put in</th>
                                <th className="px-2 py-4 text-right sm:px-4">Interest</th>
                                <th className="py-4 pl-4 pr-4 text-right sm:pr-12">Balance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-50">
                            {months.map((m) => (
                                <tr key={m.month} className="hover:bg-neutral-50">
                                    <td className="py-4 pl-4 pr-2 text-sm font-semibold text-neutral-900 sm:pl-8 sm:pr-4">
                                        {label(m.month)}
                                    </td>
                                    <td className="px-2 py-4 text-right text-sm tabular-nums text-neutral-600 sm:px-4">
                                        £{fmt(m.contributions, 0)}
                                    </td>
                                    <td className={`px-2 py-4 text-right text-sm tabular-nums sm:px-4 ${m.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-300'}`}>
                                        {m.interestEarned > 0 ? '+' : ''}£{fmt(m.interestEarned, 0)}
                                    </td>
                                    <td className="py-4 pl-4 pr-4 text-right text-sm font-bold tabular-nums text-neutral-900 sm:pr-12">
                                        £{fmt(m.endBalance, 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-neutral-100 px-4 py-5 sm:px-8 sm:py-6">
                    <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Contributions</p>
                            <p className="mt-1 text-base font-bold tabular-nums text-neutral-900">£{fmt(yearRow.contributions, 0)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Interest</p>
                            <p className="mt-1 text-base font-bold tabular-nums text-emerald-600">+£{fmt(yearRow.interestEarned, 0)}</p>
                        </div>
                        <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">End balance</p>
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
            <label className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                {label}
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 transition-all focus-within:border-neutral-950 focus-within:ring-4 focus-within:ring-neutral-950/5">
                {prefix && <span className="text-sm font-semibold text-neutral-500">{prefix}</span>}
                <Input
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
                    wrapperClassName="min-w-0 flex-1"
                />
                {suffix && <span className="text-sm font-semibold text-neutral-500">{suffix}</span>}
            </div>
        </div>
    )
}

/**
 * Year-end balances as stacked bars: what you put in (start balance + contributions)
 * underneath, interest on top. Milestone years get their balance labelled.
 */
function GrowthChart({
    startBalance,
    rows,
    milestones,
}: {
    startBalance: number
    rows: YearRow[]
    milestones: number[]
}) {
    const top = Math.max(1, ...rows.map((r) => r.endBalance))
    const bars = rows.map((r, i) => {
        const paidIn = startBalance + rows.slice(0, i + 1).reduce((sum, x) => sum + x.contributions, 0)
        const principal = Math.min(r.endBalance, Math.max(0, paidIn))
        return { year: r.year, principal, interest: Math.max(0, r.endBalance - principal), total: r.endBalance }
    })
    return (
        <div>
            <div
                className="flex h-44 items-end gap-[3px] sm:h-52"
                role="img"
                aria-label="Projected balance at the end of each year, split into what you put in and interest"
            >
                {bars.map((b) => {
                    const isMilestone = milestones.includes(b.year)
                    return (
                        <div key={b.year} className="relative flex h-full min-w-0 flex-1 flex-col justify-end">
                            {isMilestone && (
                                <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-neutral-700"
                                    style={{ bottom: `calc(${(b.total / top) * 100}% + 4px)` }}
                                >
                                    {fmtCompact(b.total)}
                                </span>
                            )}
                            <div
                                className="w-full rounded-t-[3px] bg-emerald-400"
                                style={{ height: `${(b.interest / top) * 100}%` }}
                            />
                            <div
                                className={`w-full bg-neutral-300 ${b.interest > 0 ? '' : 'rounded-t-[3px]'}`}
                                style={{ height: `${(b.principal / top) * 100}%` }}
                            />
                        </div>
                    )
                })}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-neutral-500">
                <span>Year 1</span>
                {rows.length > 1 && <span>Year {rows.length}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-3 rounded-sm bg-neutral-300" aria-hidden="true" />
                    You put in
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-2 w-3 rounded-sm bg-emerald-400" aria-hidden="true" />
                    Interest
                </span>
            </div>
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
        <div className="border-t border-hairline pt-5 sm:pt-6 transition-colors duration-200 hover:border-neutral-300">
            <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                    <p className="text-lg font-medium tracking-tight text-neutral-900">{group.name}</p>
                    <p className="mt-0.5 text-sm tabular-nums text-neutral-500">£{fmt(monthlyContribution)} / month</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        aria-label={`Delete ${group.name}`}
                        className="grid h-10 w-10 place-items-center rounded-[10px] sm:h-7 sm:w-7 text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-400"
                    >
                        <i className="fa-solid fa-trash-can text-[11px]" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {confirming ? (
                <div className="rounded-xl bg-red-50 p-4">
                    <p className="text-sm font-medium text-red-700">Delete {group.name}?</p>
                    <p className="mt-1 text-[11px] text-red-500">{monthSummary} This cannot be undone.</p>
                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={handleConfirmDelete}
                            disabled={deleting}
                            className="inline-flex items-center justify-center rounded-[10px] bg-red-600 px-4 h-8 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
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
            <div className="flex flex-wrap items-end gap-3">
                <MonthField label="From" value={fromDate} maxDate={toDate} onChange={setFromDate} />
                <MonthField label="To" value={toDate} minDate={fromDate} onChange={setToDate} />
                <p className="max-w-sm text-xs text-neutral-500 sm:ml-auto sm:text-right">
                    What you planned to put away, from the monthly savings amounts on your
                    finance sheet.
                </p>
            </div>

            {invalid ? (
                <p className="mt-6 text-sm text-neutral-500">
                    The “From” month must be on or before the “To” month.
                </p>
            ) : loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <div className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_1.2fr]">
                    <div className="flex flex-col gap-8">
                        <BigFigure
                            label="You should have saved"
                            value={<Money v={grandTotal} />}
                            sub={
                                <>
                                    {monthCount} {monthCount === 1 ? 'month' : 'months'} · about{' '}
                                    <Money v={monthlyAvg} /> a month
                                </>
                            }
                        />
                        {perGroup.length > 0 && (
                            <div>
                                <p className={`mb-2 ${OVERLINE}`}>By account</p>
                                <ul className="divide-y divide-neutral-100 border-t border-hairline">
                                    {perGroup.map(({ group, total }) => (
                                        <li key={group._id} className="flex items-center justify-between gap-3 py-3">
                                            <span className="truncate text-[15px] text-neutral-800">{group.name}</span>
                                            <span className="shrink-0 text-[15px] font-medium text-neutral-950">
                                                <Money v={total} />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>

                    {perMonth.length > 1 && (
                        <div>
                            <p className={`mb-2 ${OVERLINE}`}>Month by month</p>
                            <ul className="divide-y divide-neutral-100 border-t border-hairline">
                                {perMonth.map(({ month, total }) => (
                                    <li key={month} className="flex items-center justify-between gap-3 py-2.5">
                                        <span className="text-sm text-neutral-600">
                                            {new Date(month + '-02').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                                        </span>
                                        <span className={`text-sm font-medium ${total === 0 ? 'text-neutral-400' : 'text-neutral-900'}`}>
                                            <Money v={total} />
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
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

    const finalRow = yearlyTable[yearlyTable.length - 1]
    const totalInterest = yearlyTable.reduce((s, r) => s + r.interestEarned, 0)
    const accountWord = savingsGroups.length === 1 ? 'account' : 'accounts'

    return (
        <>
            {/* Header — same compact title + status line as Monthly and Statement */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
                <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-neutral-950 sm:text-[22px]">
                        Savings forecast
                    </h1>
                    <p className="truncate text-[13px] text-neutral-500">
                        {loading
                            ? 'Loading your savings…'
                            : savingsGroups.length === 0
                              ? 'No savings accounts yet'
                              : `${savingsGroups.length} savings ${accountWord}${blendedRate > 0 ? ` · ${fmt(blendedRate, 2)}% blended rate` : ''}`}
                    </p>
                </div>
            </div>

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
                <>
                    <Tabs
                        tabs={['Projection', 'Savings to date', 'Target planner']}
                        value={view}
                        onChange={(t) => setView(t as typeof view)}
                        className="mb-8"
                    />

                    {view === 'Savings to date' ? (
                        <LiveSavingsSection groups={groups} rows={rows} />
                    ) : view === 'Target planner' ? (
                        <TargetPlanner
                            accounts={savingsGroups.map((g) => ({
                                name: g.name,
                                balance: g.currentBalance ?? 0,
                                rate: g.annualInterestRate ?? 0,
                            }))}
                            defaultRate={blendedRate}
                            sheetMonthlyFor={(m) => savingsGroups.reduce((s, g) => s + contributionForMonth(g, m), 0)}
                        />
                    ) : (
                        <>
                            {/* Hero — where your savings land, then how they get there */}
                            <section className="mb-8 border-b border-hairline pb-8">
                                <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-end">
                                    <div className="flex min-w-0 flex-col gap-6">
                                        <BigFigure
                                            label={`In ${horizon} ${horizon === 1 ? 'year' : 'years'}`}
                                            value={<Money v={finalRow?.endBalance ?? totalCurrentBalance} />}
                                            sub={
                                                <>
                                                    From <Money v={totalCurrentBalance} /> today, putting in{' '}
                                                    <Money v={totalMonthly} /> a month
                                                </>
                                            }
                                        />
                                        <PillToggle
                                            label="Forecast length"
                                            options={HORIZONS.map((y) => ({ value: y, label: y === 1 ? '1 yr' : `${y} yrs` }))}
                                            value={horizon}
                                            onChange={setHorizon}
                                        />
                                    </div>
                                    <GrowthChart
                                        startBalance={totalCurrentBalance}
                                        rows={yearlyTable}
                                        milestones={milestoneYears}
                                    />
                                </div>

                                <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
                                    <Stat label="Saved today" value={<Money v={totalCurrentBalance} />} />
                                    <Stat label="Each month" value={<Money v={totalMonthly} />} />
                                    <Stat label="You put in" dot="bg-neutral-300" value={<Money v={totalContributions} />} />
                                    <Stat label="Interest" dot="bg-emerald-400" tone="good" value={<Money v={totalInterest} sign />} />
                                </div>
                            </section>

                            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.5fr_1fr]">
                                {/* Year-by-year table */}
                                <section className="min-w-0">
                                    <h2 className={`mb-3 ${OVERLINE}`}>Year by year</h2>
                                    {hasScheduleGaps && (
                                        <p className="mb-3 flex items-start gap-2 text-xs text-neutral-500">
                                            <i className="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
                                            Skipped months, and months before a savings stream starts or
                                            after it ends, add nothing — so yearly amounts follow your
                                            real schedule.
                                        </p>
                                    )}
                                    <div className="overflow-x-auto border-t border-hairline">
                                        <table className="w-full sm:min-w-[380px]">
                                            <thead>
                                                <tr className={`border-b border-neutral-100 ${OVERLINE}`}>
                                                    <th className="py-3 pr-3 text-left font-medium">Year</th>
                                                    <th className="px-2 py-3 sm:px-3 text-right font-medium">Put in</th>
                                                    <th className="px-2 py-3 sm:px-3 text-right font-medium">Interest</th>
                                                    <th className="py-3 pl-3 text-right font-medium">Balance</th>
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
                                                                isOpen ? 'bg-neutral-100' : '',
                                                            ].join(' ')}
                                                        >
                                                            <td className="py-3 pr-3">
                                                                <span className={`text-sm ${isMilestone ? 'font-semibold text-neutral-950' : 'text-neutral-700'}`}>
                                                                    Year {row.year}
                                                                </span>
                                                            </td>
                                                            <td className="px-2 py-3 sm:px-3 text-right text-sm text-neutral-600">
                                                                <Money v={row.contributions} />
                                                            </td>
                                                            <td className={`px-2 py-3 sm:px-3 text-right text-sm ${row.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                                                                <Money v={row.interestEarned} sign />
                                                            </td>
                                                            <td className={`py-3 pl-3 text-right text-sm ${isMilestone ? 'font-semibold text-neutral-950' : 'font-medium text-neutral-900'}`}>
                                                                <Money v={row.endBalance} />
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="mt-3 text-xs text-neutral-500">Tap a year to see it month by month.</p>
                                </section>

                                {/* Per-account balance & rate inputs */}
                                <section className="min-w-0">
                                    <h2 className={`mb-3 ${OVERLINE}`}>Accounts &amp; assumptions</h2>
                                    <div className="flex flex-col gap-6">
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
                            </div>
                        </>
                    )}
                </>
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
