import type { BudgetExclusion, BudgetSpend, FinanceEntry, FinanceGroup, FinanceRow } from '../types'
import {
    listBudgetExclusions,
    listBudgetSpends,
    listEntries,
    listGroups,
    listRows,
    setBudgetExclusion,
    setBudgetSpend,
} from '../services/finances'
import { rowVisibleInMonth } from '../lib/finance'
import { useEffect, useState } from 'react'

import Button from '../components/Button'
import Input from '../components/Input'
import Modal from '../components/Modal'
import Spinner from '../components/Spinner'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function todayKey(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonthLabel(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function formatDayLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

function daysInMonth(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m, 0).getDate()
}

function dateKey(ym: string, day: number): string {
    return `${ym}-${String(day).padStart(2, '0')}`
}

function startOffset(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    const dow = new Date(y, m - 1, 1).getDay()
    return (dow + 6) % 7
}

function fmt(n: number): string {
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Per-day data ──────────────────────────────────────────────────────────────

interface DayData {
    date: string
    excluded: boolean
    spent: number
    dailyRate: number      // 0 for excluded days
    carry: number
    effectiveAllowance: number
}

function buildDayData(
    month: string,
    dailyRows: FinanceRow[],
    entries: FinanceEntry[],
    spends: BudgetSpend[],
    excludedDates: Set<string>,
): DayData[] {
    const total = daysInMonth(month)
    const monthlyTotal = dailyRows.reduce((sum, row) => {
        const entry = entries.find((e) => e.row === row._id)
        return sum + (entry?.amount ?? row.recurringAmount ?? 0)
    }, 0)

    // Active days = non-excluded days in the month
    let activeDays = 0
    for (let d = 1; d <= total; d++) {
        if (!excludedDates.has(dateKey(month, d))) activeDays++
    }
    const dailyRate = activeDays > 0 ? monthlyTotal / activeDays : 0

    const days: DayData[] = []
    let cumulativeSpent = 0       // sum of spends on active days so far
    let activeDaysBefore = 0      // count of active days before current day

    for (let d = 1; d <= total; d++) {
        const date = dateKey(month, d)
        const excluded = excludedDates.has(date)
        const spent = spends.filter((s) => s.date === date).reduce((s, x) => s + x.amount, 0)

        if (excluded) {
            days.push({ date, excluded: true, spent: 0, dailyRate: 0, carry: 0, effectiveAllowance: 0 })
        } else {
            const carry = activeDaysBefore * dailyRate - cumulativeSpent
            const effectiveAllowance = dailyRate + carry
            days.push({ date, excluded: false, spent, dailyRate, carry, effectiveAllowance })
            cumulativeSpent += spent
            activeDaysBefore++
        }
    }
    return days
}

// ── Day cell ──────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface DayCellProps {
    data: DayData
    isToday: boolean
    isFuture: boolean
    onClick: () => void
}

function DayCell({ data, isToday, isFuture, onClick }: DayCellProps) {
    const dayNum = Number(data.date.split('-')[2])
    const hasSpend = data.spent > 0
    const remaining = data.effectiveAllowance - data.spent
    const overTarget = hasSpend && data.spent > data.dailyRate
    const overBudget = hasSpend && data.spent > data.effectiveAllowance
    const isPast = !isFuture && !isToday

    let bg = 'bg-white'
    if (data.excluded) bg = 'bg-neutral-50'
    else if (!isFuture) {
        if (overBudget) bg = 'bg-red-50'
        else if (overTarget) bg = 'bg-amber-50'
        else if (hasSpend) bg = 'bg-emerald-50'
    }

    const remainingColor = overBudget ? 'text-red-500' : overTarget ? 'text-amber-600' : 'text-emerald-600'

    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'flex flex-col gap-2 rounded-xl border p-3 min-h-[170px] text-left w-full transition-colors',
                isToday ? 'border-neutral-950' : 'border-neutral-200',
                bg,
                'hover:border-neutral-400',
            ].join(' ')}
        >
            {/* Day number + excluded badge */}
            <div className="flex items-center justify-between gap-1">
                <span className={[
                    'text-sm font-bold leading-none',
                    isToday ? 'text-neutral-950' : isFuture ? 'text-neutral-300' : data.excluded ? 'text-neutral-400' : 'text-neutral-600',
                ].join(' ')}>
                    {dayNum}
                </span>
                {data.excluded && (
                    <span className="rounded-full bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-neutral-500">
                        excl.
                    </span>
                )}
            </div>

            {/* Daily rate (hidden for excluded) */}
            {!data.excluded && (
                <div className="flex items-baseline gap-1">
                    <span className={`text-lg font-bold font-mono tabular-nums ${isFuture ? 'text-neutral-300' : 'text-neutral-700'}`}>
                        £{fmt(data.dailyRate)}
                    </span>
                    <span className={`text-xs ${isFuture ? 'text-neutral-200' : 'text-neutral-400'}`}>/day</span>
                </div>
            )}

            {/* Carry */}
            {!data.excluded && data.carry !== 0 && (
                <span className={[
                    'text-xs font-semibold leading-none',
                    isFuture ? 'text-neutral-300' : data.carry > 0 ? 'text-emerald-500' : 'text-red-400',
                ].join(' ')}>
                    {data.carry > 0 ? '+' : '-'}£{fmt(Math.abs(data.carry))} carry
                </span>
            )}

            {/* Divider */}
            {!data.excluded && (
                <div className={`border-t mt-auto ${isFuture ? 'border-neutral-100' : 'border-neutral-200'}`} />
            )}

            {/* Spent / left */}
            {!data.excluded && !isFuture && (
                <>
                    <div className="flex items-baseline justify-between gap-1">
                        <span className="text-xs text-neutral-400">spent</span>
                        <span className={`text-sm font-semibold font-mono tabular-nums ${hasSpend ? 'text-neutral-700' : 'text-neutral-300'}`}>
                            {hasSpend ? `£${fmt(data.spent)}` : '—'}
                        </span>
                    </div>
                    {hasSpend && (
                        <div className="flex items-baseline justify-between gap-1">
                            <span className="text-xs text-neutral-400">left</span>
                            <span className={`text-sm font-semibold font-mono tabular-nums ${remainingColor}`}>
                                {remaining < 0 ? '-' : ''}£{fmt(Math.abs(remaining))}
                            </span>
                        </div>
                    )}
                    {isPast && !hasSpend && (
                        <span className="text-xs text-neutral-300">not logged</span>
                    )}
                </>
            )}

            {/* Excluded state filler */}
            {data.excluded && (
                <p className="mt-auto text-xs text-neutral-400">Outside budget</p>
            )}
        </button>
    )
}

// ── Day edit modal ────────────────────────────────────────────────────────────

interface DayModalProps {
    date: string
    dailyRows: FinanceRow[]
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excluded: boolean
    onClose: () => void
    onSave: (date: string, updates: { rowId: string; amount: number | null }[], excluded: boolean) => Promise<void>
}

function DayModal({ date, dailyRows, entries, spends, excluded: initialExcluded, onClose, onSave }: DayModalProps) {
    const [isExcluded, setIsExcluded] = useState(initialExcluded)
    const [drafts, setDrafts] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {}
        dailyRows.forEach((row) => {
            const existing = spends.find((s) => s.row === row._id && s.date === date)
            init[row._id] = existing ? String(existing.amount) : ''
        })
        return init
    })
    const [saving, setSaving] = useState(false)

    const monthlyTotal = dailyRows.reduce((sum, row) => {
        const entry = entries.find((e) => e.row === row._id)
        return sum + (entry?.amount ?? row.recurringAmount ?? 0)
    }, 0)
    const totalDays = daysInMonth(date.slice(0, 7))
    const dailyRate = totalDays > 0 ? monthlyTotal / totalDays : 0

    const totalDraft = Object.values(drafts).reduce((sum, v) => {
        const n = parseFloat(v); return sum + (Number.isNaN(n) ? 0 : n)
    }, 0)
    const overTarget = !isExcluded && totalDraft > dailyRate

    async function handleSave() {
        setSaving(true)
        try {
            const updates = dailyRows.map((row) => {
                const v = drafts[row._id].trim()
                const n = parseFloat(v)
                return { rowId: row._id, amount: v === '' || Number.isNaN(n) ? null : n }
            })
            await onSave(date, updates, isExcluded)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title={formatDayLabel(date)}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {/* Exclude toggle */}
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
                    <input
                        type="checkbox"
                        checked={isExcluded}
                        onChange={(e) => setIsExcluded(e.target.checked)}
                        className="h-4 w-4 rounded accent-neutral-950"
                    />
                    <div>
                        <p className="text-sm font-semibold text-neutral-800">Exclude from budget</p>
                        <p className="text-xs text-neutral-400">Work trip, holiday, or other exception — budget redistributes across remaining days</p>
                    </div>
                </label>

                {/* Spend inputs (greyed when excluded) */}
                <div className={isExcluded ? 'pointer-events-none opacity-40' : ''}>
                    <div className="mb-3 rounded-xl bg-neutral-50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Daily target</p>
                        <p className="mt-0.5 text-lg font-bold font-mono text-neutral-900">£{fmt(dailyRate)}</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        {dailyRows.map((row) => (
                            <div key={row._id} className="flex flex-col gap-1">
                                <label className="text-xs font-semibold text-neutral-600">{row.name}</label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={drafts[row._id]}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [row._id]: e.target.value }))}
                                />
                            </div>
                        ))}
                    </div>

                    {dailyRows.length > 1 && (
                        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
                            <span className="text-xs font-semibold text-neutral-400">Total spend</span>
                            <span className={`text-sm font-bold font-mono ${overTarget ? 'text-amber-700' : 'text-neutral-900'}`}>
                                £{fmt(totalDraft)}
                            </span>
                        </div>
                    )}

                    {overTarget && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700">
                            <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                            Over daily target by £{fmt(totalDraft - dailyRate)}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BudgetCalendar() {
    const [month, setMonth] = useState(currentMonth)
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [exclusions, setExclusions] = useState<BudgetExclusion[]>([])
    const [selectedDate, setSelectedDate] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        setLoading(true)
        Promise.all([listGroups(), listRows(), listEntries(month), listBudgetSpends({ month }), listBudgetExclusions(month)])
            .then(([g, r, e, s, x]) => {
                if (!active) return
                setGroups(g); setRows(r); setEntries(e); setSpends(s); setExclusions(x)
            })
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [month])

    async function handleSaveDay(
        date: string,
        updates: { rowId: string; amount: number | null }[],
        excluded: boolean,
    ) {
        // Save spend updates
        const results = await Promise.all(
            updates.map(({ rowId, amount }) => setBudgetSpend(rowId, date, amount))
        )
        setSpends((prev) => {
            let next = [...prev]
            updates.forEach(({ rowId }, i) => {
                next = next.filter((s) => !(s.row === rowId && s.date === date))
                const result = results[i]
                if (result) next.push(result)
            })
            return next
        })

        // Save exclusion
        const wasExcluded = exclusions.some((x) => x.date === date)
        if (excluded !== wasExcluded) {
            const result = await setBudgetExclusion(date, excluded)
            setExclusions((prev) => {
                const without = prev.filter((x) => x.date !== date)
                return result ? [...without, result] : without
            })
        }
    }

    const today = todayKey()
    const dailyRows = rows.filter((r) =>
        r.budgeted && r.budgetType === 'daily' &&
        rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
    const excludedDates = new Set(exclusions.map((x) => x.date))
    const dayData = buildDayData(month, dailyRows, entries, spends, excludedDates)
    const offset = startOffset(month)

    const pastDays = dayData.filter((d) => d.date <= today && !d.excluded)
    const totalSpent = pastDays.reduce((s, d) => s + d.spent, 0)
    const totalTarget = pastDays.reduce((s, d) => s + d.dailyRate, 0)
    const daysLogged = pastDays.filter((d) => d.spent > 0).length
    const excludedCount = exclusions.filter((x) => x.date.startsWith(month)).length

    return (
        <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setMonth((m) => addMonths(m, -1))}
                        className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-chevron-left text-sm" aria-hidden="true" />
                    </button>
                    <span className="min-w-[180px] text-center text-lg font-bold text-neutral-900">
                        {formatMonthLabel(month)}
                    </span>
                    <button
                        type="button"
                        onClick={() => setMonth((m) => addMonths(m, 1))}
                        className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
                    </button>
                    {month !== currentMonth() && (
                        <button
                            type="button"
                            onClick={() => setMonth(currentMonth())}
                            className="rounded-full px-3 py-1.5 text-sm font-semibold text-neutral-500 transition-colors hover:bg-neutral-200"
                        >
                            This month
                        </button>
                    )}
                </div>

                {pastDays.length > 0 && !loading && (
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-white border border-neutral-200 px-4 py-2">
                            <span className="text-xs text-neutral-400">Spent </span>
                            <span className={`text-sm font-bold font-mono ${totalSpent > totalTarget ? 'text-red-600' : 'text-neutral-900'}`}>
                                £{fmt(totalSpent)}
                            </span>
                        </div>
                        <div className="rounded-xl bg-white border border-neutral-200 px-4 py-2">
                            <span className="text-xs text-neutral-400">Target </span>
                            <span className="text-sm font-bold font-mono text-neutral-900">£{fmt(totalTarget)}</span>
                        </div>
                        <div className="rounded-xl bg-white border border-neutral-200 px-4 py-2">
                            <span className="text-xs text-neutral-400">Logged </span>
                            <span className="text-sm font-bold font-mono text-neutral-900">{daysLogged}/{pastDays.length}</span>
                        </div>
                        {excludedCount > 0 && (
                            <div className="rounded-xl bg-neutral-100 border border-neutral-200 px-4 py-2">
                                <span className="text-xs text-neutral-400">Excluded </span>
                                <span className="text-sm font-bold font-mono text-neutral-500">{excludedCount}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="grid place-items-center py-20"><Spinner /></div>
            ) : dailyRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-400">
                        No daily budgets set up. Enable `Daily spend` on a card in the Budgets tab.
                    </p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-7 gap-2">
                        {WEEKDAYS.map((wd) => (
                            <div key={wd} className="pb-2 text-center text-xs font-bold uppercase tracking-wide text-neutral-400">
                                {wd}
                            </div>
                        ))}
                        {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} />)}
                        {dayData.map((data) => (
                            <DayCell
                                key={data.date}
                                data={data}
                                isToday={data.date === today}
                                isFuture={data.date > today}
                                onClick={() => setSelectedDate(data.date)}
                            />
                        ))}
                    </div>

                    <div className="mt-4 flex items-center gap-5">
                        {[
                            { color: 'bg-emerald-50', label: 'Under target' },
                            { color: 'bg-amber-50', label: 'Over target' },
                            { color: 'bg-red-50', label: 'Over budget' },
                            { color: 'bg-neutral-50 border border-neutral-200', label: 'Excluded' },
                        ].map(({ color, label }) => (
                            <div key={label} className="flex items-center gap-2">
                                <span className={`h-3.5 w-3.5 rounded ${color}`} />
                                <span className="text-xs text-neutral-400">{label}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {selectedDate && (
                <DayModal
                    date={selectedDate}
                    dailyRows={dailyRows}
                    entries={entries}
                    spends={spends}
                    excluded={excludedDates.has(selectedDate)}
                    onClose={() => setSelectedDate(null)}
                    onSave={handleSaveDay}
                />
            )}
        </>
    )
}
