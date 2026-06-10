import { useEffect, useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import DatePicker from '../components/DatePicker'
import Tabs from '../components/Tabs'
import { listGroups, listRows, listEntries, updateGroup } from '../services/finances'
import { groupVisibleInMonth, rowVisibleInMonth, addMonths } from '../lib/finance'
import { formatAmount, formatMoneyCompact } from '../lib/money'
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
        <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </label>
            <div className="flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-2 focus-within:border-neutral-950">
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
        <div className="flex flex-col gap-1.5 rounded-2xl bg-neutral-950 px-5 py-4 text-white">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {label ?? `Year ${year}`}
            </p>
            <p className="text-2xl font-bold font-mono tabular-nums">{fmtCompact(balance)}</p>
            <p className="text-xs text-neutral-500 font-mono">£{fmt(balance, 0)}</p>
        </div>
    )
}

// ── Savings group settings card ─────────────────────────────────────────────

interface GroupSettingsProps {
    group: FinanceGroup
    monthlyContribution: number
    onUpdate: (id: string, fields: Partial<FinanceGroup>) => void
}

function GroupSettingsCard({ group, monthlyContribution, onUpdate }: GroupSettingsProps) {
    const [balance, setBalance] = useState(String(group.currentBalance ?? 0))
    const [rate, setRate] = useState(String(group.annualInterestRate ?? 0))

    // Sync if parent group changes
    useEffect(() => {
        setBalance(String(group.currentBalance ?? 0))
    }, [group.currentBalance])
    useEffect(() => {
        setRate(String(group.annualInterestRate ?? 0))
    }, [group.annualInterestRate])

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <p className="font-bold text-neutral-900">{group.name}</p>
                    <p className="text-sm text-neutral-400">£{fmt(monthlyContribution)} / month</p>
                </div>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-blue-700">
                    savings
                </span>
            </div>
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
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                Savings to date
            </h2>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
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
                        <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                                You should have saved
                            </p>
                            <p className="mt-1 text-3xl font-bold font-mono tabular-nums">
                                £{fmt(grandTotal)}
                            </p>
                            <p className="mt-1 font-mono text-xs text-neutral-500">
                                {monthCount} {monthCount === 1 ? 'month' : 'months'} · avg £
                                {fmt(monthlyAvg)}/mo
                            </p>
                        </div>

                        {perGroup.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {perGroup.map(({ group, total }) => (
                                    <div
                                        key={group._id}
                                        className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3"
                                    >
                                        <span className="truncate text-sm font-semibold text-neutral-700">
                                            {group.name}
                                        </span>
                                        <span className="shrink-0 text-sm font-bold font-mono tabular-nums text-neutral-900">
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
                                            <span className={`text-sm font-mono font-semibold tabular-nums ${total === 0 ? 'text-neutral-400' : 'text-neutral-900'}`}>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavingsForecast() {
    const toast = useToast()
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [horizon, setHorizon] = useState<Horizon>(10)
    const [view, setView] = useState<'Projection' | 'Savings to date'>('Projection')

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
            toast.error('Couldn’t save that setting.')
        }
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
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">
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
                    <Tabs
                        tabs={['Projection', 'Savings to date']}
                        value={view}
                        onChange={(t) => setView(t as typeof view)}
                        className="self-start"
                    />

                    {view === 'Savings to date' ? (
                        <LiveSavingsSection groups={groups} rows={rows} />
                    ) : (
                        <>
                            {/* Headline: milestones + horizon control */}
                            <section>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xs font-bold uppercase tracking-wide text-neutral-400">
                                            Projected balance
                                        </h2>
                                        {blendedRate > 0 && (
                                            <p className="mt-0.5 text-xs text-neutral-400">
                                                at {fmt(blendedRate, 2)}% blended annual rate
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {HORIZONS.map((y) => (
                                            <button
                                                key={y}
                                                type="button"
                                                onClick={() => setHorizon(y)}
                                                className={[
                                                    'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
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
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                            <section className="grid grid-cols-3 gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Starting balance
                                    </p>
                                    <p className="mt-1 text-xl font-bold font-mono text-neutral-900">
                                        £{fmt(totalCurrentBalance, 0)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Total contributions
                                    </p>
                                    <p className="mt-1 text-xl font-bold font-mono text-neutral-900">
                                        £{fmt(totalContributions, 0)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Interest earned
                                    </p>
                                    <p className="mt-1 text-xl font-bold font-mono text-emerald-600">
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
                                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                                    Accounts &amp; assumptions
                                </h2>
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {savingsGroups.map((group) => (
                                        <GroupSettingsCard
                                            key={group._id}
                                            group={group}
                                            monthlyContribution={monthlyContribution(group)}
                                            onUpdate={handleUpdateGroup}
                                        />
                                    ))}
                                </div>
                            </section>

                            {/* Year-by-year table */}
                            <section>
                                <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
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
                                <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                                    <table className="w-full">
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
                                                const isMilestone = milestoneYears.includes(
                                                    row.year as Horizon
                                                )
                                                return (
                                                    <tr
                                                        key={row.year}
                                                        className={
                                                            isMilestone ? 'bg-neutral-50' : ''
                                                        }
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
                                                        <td className="py-3 px-3 text-right text-sm font-mono text-neutral-600">
                                                            £{fmt(row.contributions, 0)}
                                                        </td>
                                                        <td
                                                            className={`py-3 px-3 text-right text-sm font-mono ${row.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}
                                                        >
                                                            {row.interestEarned > 0 ? '+' : ''}£
                                                            {fmt(row.interestEarned, 0)}
                                                        </td>
                                                        <td className="py-3 pl-3 pr-5 text-right text-sm font-bold font-mono text-neutral-900">
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
        </>
    )
}
