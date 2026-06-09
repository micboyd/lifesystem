import { useEffect, useRef, useState } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { listGroups, listRows, listEntries, updateGroup } from '../services/finances'
import type { FinanceGroup, FinanceRow, FinanceEntry } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function fmt(n: number, decimals = 2): string {
    return n.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtCompact(n: number): string {
    if (n >= 1_000_000) return `£${fmt(n / 1_000_000, 2)}m`
    if (n >= 10_000) return `£${fmt(n / 1_000, 1)}k`
    return `£${fmt(n, 0)}`
}

// Compound interest: FV = PV(1+r)^n + PMT * ((1+r)^n - 1) / r
function projectBalance(currentBalance: number, monthlyContribution: number, annualRate: number, months: number): number {
    if (annualRate === 0 || months === 0) {
        return currentBalance + monthlyContribution * months
    }
    const r = annualRate / 100 / 12
    return currentBalance * Math.pow(1 + r, months) +
        monthlyContribution * (Math.pow(1 + r, months) - 1) / r
}

interface YearRow {
    year: number
    startBalance: number
    contributions: number
    interestEarned: number
    endBalance: number
}

function buildYearlyTable(
    currentBalance: number,
    monthlyContribution: number,
    annualRate: number,
    years: number,
): YearRow[] {
    const rows: YearRow[] = []
    let balance = currentBalance
    for (let y = 1; y <= years; y++) {
        const startBalance = balance
        const endBalance = projectBalance(startBalance, monthlyContribution, annualRate, 12)
        const contributions = monthlyContribution * 12
        const interestEarned = endBalance - startBalance - contributions
        rows.push({ year: y, startBalance, contributions, interestEarned, endBalance })
        balance = endBalance
    }
    return rows
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
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</label>
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
                    onKeyDown={(e) => { if (e.key === 'Enter') inputRef.current?.blur() }}
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                {suffix && <span className="text-sm font-semibold text-neutral-400">{suffix}</span>}
            </div>
        </div>
    )
}

// ── Milestone card ─────────────────────────────────────────────────────────

function MilestoneCard({ year, balance, label }: { year: number; balance: number; label?: string }) {
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
    useEffect(() => { setBalance(String(group.currentBalance ?? 0)) }, [group.currentBalance])
    useEffect(() => { setRate(String(group.annualInterestRate ?? 0)) }, [group.annualInterestRate])

    return (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <p className="font-bold text-neutral-900">{group.name}</p>
                    <p className="text-sm text-neutral-400">
                        £{fmt(monthlyContribution)} / month
                    </p>
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavingsForecast() {
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [horizon, setHorizon] = useState<Horizon>(10)

    const month = currentMonth()

    useEffect(() => {
        let active = true
        setLoading(true)
        Promise.all([listGroups(), listRows(), listEntries(month)])
            .then(([g, r, e]) => {
                if (!active) return
                setGroups(g); setRows(r); setEntries(e)
            })
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [month])

    async function handleUpdateGroup(id: string, fields: Partial<FinanceGroup>) {
        const updated = await updateGroup(id, fields)
        setGroups((prev) => prev.map((g) => (g._id === id ? updated : g)))
    }

    const savingsGroups = groups.filter((g) => g.type === 'savings')

    // Monthly contribution per group (entry override or recurring)
    function monthlyContribution(group: FinanceGroup): number {
        const groupRows = rows.filter((r) => r.group === group._id)
        return groupRows.reduce((sum, row) => {
            const entry = entries.find((e) => e.row === row._id)
            return sum + (entry?.amount ?? row.recurringAmount ?? 0)
        }, 0)
    }

    // Aggregate across all savings groups
    const totalCurrentBalance = savingsGroups.reduce((s, g) => s + (g.currentBalance ?? 0), 0)
    const totalMonthly = savingsGroups.reduce((s, g) => s + monthlyContribution(g), 0)

    // Blended annual rate (weighted by contribution)
    const blendedRate = totalMonthly > 0
        ? savingsGroups.reduce((s, g) => s + (g.annualInterestRate ?? 0) * monthlyContribution(g), 0) / totalMonthly
        : savingsGroups.length > 0
            ? savingsGroups.reduce((s, g) => s + (g.annualInterestRate ?? 0), 0) / savingsGroups.length
            : 0

    const yearlyTable = buildYearlyTable(totalCurrentBalance, totalMonthly, blendedRate, horizon)

    // Milestone years to highlight (spread across horizon)
    const milestoneYears = HORIZONS.filter((y) => y <= horizon).slice(-4)

    return (
        <>
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Savings Forecast</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Project how your savings grow over time based on monthly contributions and interest.
                </p>
            </header>

            {loading ? (
                <div className="grid place-items-center py-16"><Spinner /></div>
            ) : savingsGroups.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-piggy-bank"
                    title="No savings groups yet"
                    description="Add a group of type 'Savings' on the Monthly tab to start forecasting."
                />
            ) : (
                <div className="flex flex-col gap-8">

                    {/* Settings — one card per savings group */}
                    <section>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Settings</h2>
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

                    {/* Horizon selector */}
                    <section>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Forecast horizon</h2>
                        <div className="flex flex-wrap gap-2">
                            {HORIZONS.map((y) => (
                                <button
                                    key={y}
                                    type="button"
                                    onClick={() => setHorizon(y)}
                                    className={[
                                        'rounded-full px-5 py-2 text-sm font-semibold transition-colors',
                                        horizon === y
                                            ? 'bg-neutral-950 text-white'
                                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200',
                                    ].join(' ')}
                                >
                                    {y} {y === 1 ? 'year' : 'years'}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Milestone highlights */}
                    <section>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">
                            Key milestones
                            {blendedRate > 0 && (
                                <span className="ml-2 normal-case font-normal text-neutral-400">
                                    at {fmt(blendedRate, 2)}% blended annual rate
                                </span>
                            )}
                        </h2>
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
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Starting balance</p>
                            <p className="mt-1 text-xl font-bold font-mono text-neutral-900">£{fmt(totalCurrentBalance, 0)}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Total contributions</p>
                            <p className="mt-1 text-xl font-bold font-mono text-neutral-900">
                                £{fmt(totalMonthly * 12 * horizon, 0)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Interest earned</p>
                            <p className="mt-1 text-xl font-bold font-mono text-emerald-600">
                                £{fmt(yearlyTable.reduce((s, r) => s + r.interestEarned, 0), 0)}
                            </p>
                        </div>
                    </section>

                    {/* Year-by-year table */}
                    <section>
                        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-neutral-400">Year by year</h2>
                        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        <th className="py-3 pl-5 pr-3 text-left">Year</th>
                                        <th className="py-3 px-3 text-right">Contributions</th>
                                        <th className="py-3 px-3 text-right">Interest</th>
                                        <th className="py-3 pl-3 pr-5 text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {yearlyTable.map((row) => {
                                        const isMilestone = milestoneYears.includes(row.year as Horizon)
                                        return (
                                            <tr
                                                key={row.year}
                                                className={isMilestone ? 'bg-neutral-50' : ''}
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
                                                <td className={`py-3 px-3 text-right text-sm font-mono ${row.interestEarned > 0 ? 'text-emerald-600' : 'text-neutral-400'}`}>
                                                    {row.interestEarned > 0 ? '+' : ''}£{fmt(row.interestEarned, 0)}
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

                </div>
            )}
        </>
    )
}
