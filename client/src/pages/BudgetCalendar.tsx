import type { BudgetExclusion, BudgetSpend, FinanceEntry, FinanceGroup, FinanceRow } from '../types'
import {
    listBudgetExclusions,
    listBudgetSpends,
    listEntries,
    listGroups,
    listRows,
    setBudgetExclusion,
    createBudgetSpend,
    deleteBudgetSpend,
} from '../services/finances'
import { rowVisibleInMonth } from '../lib/finance'
import { computeBudgetDay, daysInMonth, activeDaysInMonth } from '../lib/budget'
import { formatAmount } from '../lib/money'
import { useToast } from '../context/ToastContext'
import { useEffect, useState, type FormEvent } from 'react'

import Button from '../components/Button'
import Input from '../components/Input'
import Modal from '../components/Modal'
import Select from '../components/Select'
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
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
    })
}

function dateKey(ym: string, day: number): string {
    return `${ym}-${String(day).padStart(2, '0')}`
}

function startOffset(ym: string): number {
    const [y, m] = ym.split('-').map(Number)
    const dow = new Date(y, m - 1, 1).getDay()
    return (dow + 6) % 7
}

const fmt = formatAmount

// ── Week grouping ─────────────────────────────────────────────────────────────

interface WeekGroup {
    label: string // e.g. "9–15 Jun"
    days: DayData[]
    spent: number
    target: number
    remaining: number // target - spent (carry excluded — doesn't aggregate meaningfully across days)
    allFuture: boolean
    hasExcluded: boolean
}

function groupByWeek(dayData: DayData[], today: string): WeekGroup[] {
    const weeks: WeekGroup[] = []
    for (const day of dayData) {
        const d = new Date(`${day.date}T12:00:00`)
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1 // Mon=0…Sun=6
        const isMonday = dow === 0
        if (isMonday || weeks.length === 0) {
            weeks.push({ label: '', days: [], spent: 0, target: 0, remaining: 0, allFuture: true, hasExcluded: false })
        }
        const w = weeks[weeks.length - 1]
        w.days.push(day)
        w.spent += day.spent
        w.target += day.dailyRate
        if (day.date <= today) w.allFuture = false
        if (day.excluded) w.hasExcluded = true
    }
    for (const w of weeks) {
        w.remaining = w.target - w.spent
    }
    for (const w of weeks) {
        const first = w.days[0].date
        const last = w.days[w.days.length - 1].date
        const fmt = (s: string) => {
            const [y, m, d] = s.split('-').map(Number)
            return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: first.slice(0, 7) !== last.slice(0, 7) ? 'short' : undefined,
            })
        }
        const [, lm, ld] = last.split('-').map(Number)
        const lastLabel = new Date(Number(last.split('-')[0]), lm - 1, ld).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        w.label = `${fmt(first)} – ${lastLabel}`
    }
    return weeks
}

// ── Per-day data ──────────────────────────────────────────────────────────────

interface DayData {
    date: string
    excluded: boolean
    spent: number
    dailyRate: number // 0 for excluded days
    carry: number
    effectiveAllowance: number
}

function buildDayData(
    month: string,
    dailyRows: FinanceRow[],
    entries: FinanceEntry[],
    spends: BudgetSpend[],
    excludedDates: Set<string>
): DayData[] {
    const total = daysInMonth(month)
    const days: DayData[] = []

    // The pooled daily rate/carry is the sum of each row's figure from the shared
    // budget engine — so this calendar, the Budgets cards, the dashboard widget and
    // the insights strip can never drift apart.
    for (let d = 1; d <= total; d++) {
        const date = dateKey(month, d)
        const excluded = excludedDates.has(date)

        let dailyRate = 0
        let carry = 0
        for (const row of dailyRows) {
            const entry = entries.find((e) => e.row === row._id)
            const rowSpends = spends.filter((s) => s.row === row._id)
            const bd = computeBudgetDay(row, entry, rowSpends, date, excludedDates)
            dailyRate += bd.straightDailyRate
            carry += bd.carry
        }

        const spent = excluded
            ? 0
            : spends.filter((s) => s.date === date).reduce((s, x) => s + x.amount, 0)
        days.push({
            date,
            excluded,
            spent,
            dailyRate,
            carry,
            effectiveAllowance: dailyRate + carry,
        })
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

    const remainingColor = overBudget
        ? 'text-red-500'
        : overTarget
          ? 'text-amber-600'
          : 'text-emerald-600'

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
                <span
                    className={[
                        'text-sm font-bold leading-none',
                        isToday
                            ? 'text-neutral-950'
                            : isFuture
                              ? 'text-neutral-300'
                              : data.excluded
                                ? 'text-neutral-400'
                                : 'text-neutral-600',
                    ].join(' ')}
                >
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
                    <span
                        className={`text-lg font-bold font-mono tabular-nums ${isFuture ? 'text-neutral-300' : 'text-neutral-700'}`}
                    >
                        £{fmt(data.dailyRate)}
                    </span>
                    <span
                        className={`text-xs ${isFuture ? 'text-neutral-200' : 'text-neutral-400'}`}
                    >
                        /day
                    </span>
                </div>
            )}

            {/* Carry */}
            {!data.excluded && data.carry !== 0 && (
                <span
                    className={[
                        'text-xs font-semibold leading-none',
                        isFuture
                            ? 'text-neutral-300'
                            : data.carry > 0
                              ? 'text-emerald-500'
                              : 'text-red-400',
                    ].join(' ')}
                >
                    {data.carry > 0 ? '+' : '-'}£{fmt(Math.abs(data.carry))} carry
                </span>
            )}

            {/* Divider */}
            {!data.excluded && (
                <div
                    className={`border-t mt-auto ${isFuture ? 'border-neutral-100' : 'border-neutral-200'}`}
                />
            )}

            {/* Spent / left */}
            {!data.excluded && !isFuture && (
                <>
                    <div className="flex items-baseline justify-between gap-1">
                        <span className="text-xs text-neutral-400">spent</span>
                        <span
                            className={`text-sm font-semibold font-mono tabular-nums ${hasSpend ? 'text-neutral-700' : 'text-neutral-300'}`}
                        >
                            {hasSpend ? `£${fmt(data.spent)}` : '—'}
                        </span>
                    </div>
                    {hasSpend && (
                        <div className="flex items-baseline justify-between gap-1">
                            <span className="text-xs text-neutral-400">left</span>
                            <span
                                className={`text-sm font-semibold font-mono tabular-nums ${remainingColor}`}
                            >
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
            {data.excluded && <p className="mt-auto text-xs text-neutral-400">Outside budget</p>}
        </button>
    )
}

// ── Week cell ─────────────────────────────────────────────────────────────────

interface WeekCellProps {
    week: WeekGroup
    today: string
    onClick: () => void
}

function WeekCell({ week, today, onClick }: WeekCellProps) {
    const hasSpend = week.spent > 0
    const overTarget = hasSpend && week.spent > week.target
    const overBudget = hasSpend && week.remaining < 0
    const remaining = week.remaining
    const daysLogged = week.days.filter((d) => !d.excluded && d.date <= today && d.spent > 0).length
    const activeDays = week.days.filter((d) => !d.excluded && d.date <= today).length
    const excludedDays = week.days.filter((d) => d.excluded).length

    let bg = 'bg-white'
    if (!week.allFuture) {
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
                'flex flex-col gap-2 rounded-xl border p-4 text-left w-full transition-colors',
                'border-neutral-200 hover:border-neutral-400',
                bg,
            ].join(' ')}
        >
            <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-neutral-500">{week.label}</span>
                <span className="text-xs text-neutral-300">
                    {week.days.length}d{excludedDays > 0 ? ` (${excludedDays} excl.)` : ''}
                </span>
            </div>
            <div className="flex items-baseline gap-1">
                <span className={`text-xl font-bold font-mono tabular-nums ${week.allFuture ? 'text-neutral-300' : 'text-neutral-700'}`}>
                    £{fmt(week.target)}
                </span>
                <span className={`text-sm ${week.allFuture ? 'text-neutral-200' : 'text-neutral-400'}`}>/wk</span>
            </div>
            {!week.allFuture && (
                <>
                    <div className="mt-auto border-t border-neutral-200" />
                    <div className="flex items-baseline justify-between gap-1">
                        <span className="text-sm text-neutral-400">spent</span>
                        <span className={`text-base font-semibold font-mono tabular-nums ${hasSpend ? 'text-neutral-700' : 'text-neutral-300'}`}>
                            {hasSpend ? `£${fmt(week.spent)}` : '—'}
                        </span>
                    </div>
                    {hasSpend && (
                        <div className="flex items-baseline justify-between gap-1">
                            <span className="text-sm text-neutral-400">left</span>
                            <span className={`text-base font-semibold font-mono tabular-nums ${remainingColor}`}>
                                {remaining < 0 ? '-' : ''}£{fmt(Math.abs(remaining))}
                            </span>
                        </div>
                    )}
                    <span className="text-sm text-neutral-400">
                        {daysLogged}/{activeDays} days logged
                    </span>
                </>
            )}
        </button>
    )
}

// ── Week modal ────────────────────────────────────────────────────────────────

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface WeekModalProps {
    week: WeekGroup
    today: string
    dailyRows: FinanceRow[]
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excludedDates: Set<string>
    onClose: () => void
    onAddSpend: (rowId: string, date: string, amount: number, note?: string) => Promise<void>
    onDeleteSpend: (id: string) => Promise<void>
    onSetExcluded: (date: string, excluded: boolean) => Promise<void>
}

function WeekModal({
    week,
    today,
    dailyRows,
    entries,
    spends,
    excludedDates,
    onClose,
    onAddSpend,
    onDeleteSpend,
    onSetExcluded,
}: WeekModalProps) {
    const firstAvailable = week.days.find((d) => d.date <= today) ?? week.days[0]
    const [activeDate, setActiveDate] = useState(firstAvailable.date)
    const [rowId, setRowId] = useState<string>(dailyRows[0]?._id ?? '')
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)
    const [showingTx, setShowingTx] = useState(false)

    const rowIds = new Set(dailyRows.map((r) => r._id))
    const activeDay = week.days.find((d) => d.date === activeDate) ?? week.days[0]
    const isFuture = activeDate > today
    const excluded = excludedDates.has(activeDate)

    const dayTx = spends.filter((s) => s.date === activeDate && rowIds.has(s.row))
    const weekTx = spends.filter((s) => week.days.some((d) => d.date === s.date) && rowIds.has(s.row))

    const monthlyTotal = dailyRows.reduce((sum, row) => {
        const entry = entries.find((e) => e.row === row._id)
        return sum + (entry?.amount ?? row.recurringAmount ?? 0)
    }, 0)
    const activeDaysInMonth_ = activeDaysInMonth(activeDate.slice(0, 7), excludedDates)
    const dailyRate = activeDaysInMonth_ > 0 ? monthlyTotal / activeDaysInMonth_ : 0
    const spentToday = dayTx.reduce((s, t) => s + t.amount, 0)
    const overTarget = !excluded && spentToday > dailyRate

    const rowName = (id: string) => dailyRows.find((r) => r._id === id)?.name ?? '—'

    async function handleAdd(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(amount.trim())
        if (Number.isNaN(n) || n < 0 || !rowId) return
        setSaving(true)
        try {
            await onAddSpend(rowId, activeDate, n, note.trim() || undefined)
            setAmount('')
            setNote('')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open
            onClose={onClose}
            size="sm"
            title={week.label}
            footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
        >
            <div className="flex flex-col gap-4">
                {/* Weekly summary bar */}
                <div className="flex gap-2">
                    <div className="flex-1 rounded-xl bg-neutral-50 px-3 py-2.5">
                        <p className="text-xs text-neutral-400">Week target</p>
                        <p className="font-mono text-sm font-bold text-neutral-900">£{fmt(week.target)}</p>
                    </div>
                    <div className="flex-1 rounded-xl bg-neutral-50 px-3 py-2.5">
                        <p className="text-xs text-neutral-400">Spent</p>
                        <p className={`font-mono text-sm font-bold ${week.remaining < 0 ? 'text-red-600' : week.spent > week.target ? 'text-amber-700' : 'text-neutral-900'}`}>
                            £{fmt(week.spent)}
                        </p>
                    </div>
                    <div className="flex-1 rounded-xl bg-neutral-50 px-3 py-2.5">
                        <p className="text-xs text-neutral-400">Remaining</p>
                        <p className={`font-mono text-sm font-bold ${week.remaining < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                            {week.remaining < 0 ? '-' : ''}£{fmt(Math.abs(week.remaining))}
                        </p>
                    </div>
                </div>

                {/* Day selector */}
                <div className="flex gap-1 rounded-xl border border-neutral-100 bg-neutral-50 p-1">
                    {week.days.map((d) => {
                        const date = new Date(`${d.date}T12:00:00`)
                        const dow = date.getDay() === 0 ? 6 : date.getDay() - 1
                        const dayNum = Number(d.date.split('-')[2])
                        const hasTx = spends.some((s) => s.date === d.date && rowIds.has(s.row))
                        const isActive = d.date === activeDate
                        const isPast = d.date <= today
                        return (
                            <button
                                key={d.date}
                                type="button"
                                onClick={() => { setActiveDate(d.date); setShowingTx(false) }}
                                className={[
                                    'flex flex-1 flex-col items-center rounded-lg py-1.5 text-xs font-semibold transition-colors',
                                    isActive
                                        ? 'bg-white shadow-sm text-neutral-900'
                                        : 'text-neutral-400 hover:text-neutral-600',
                                ].join(' ')}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wide">
                                    {SHORT_DAYS[dow]}
                                </span>
                                <span className={isActive ? 'text-neutral-900' : ''}>{dayNum}</span>
                                {hasTx && isPast && (
                                    <span className={`mt-0.5 h-1 w-1 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Day content */}
                {isFuture ? (
                    <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400">
                        Future day — nothing to log yet.
                    </p>
                ) : showingTx ? (
                    <div className="flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => setShowingTx(false)}
                            className="flex items-center gap-1.5 self-start text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                            Back
                        </button>
                        {dayTx.length === 0 ? (
                            <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
                                No transactions for this day.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {dayTx.map((t) => (
                                    <li key={t._id} className="group/tx flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-2.5">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-neutral-800">{t.note || rowName(t.row)}</p>
                                            {t.note && dailyRows.length > 1 && (
                                                <p className="truncate text-xs text-neutral-400">{rowName(t.row)}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <span className="font-mono text-sm text-neutral-700">£{fmt(t.amount)}</span>
                                            <button
                                                type="button"
                                                onClick={() => onDeleteSpend(t._id)}
                                                aria-label="Delete transaction"
                                                className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                            >
                                                <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
                            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Day total</span>
                            <span className="font-mono text-sm font-bold text-neutral-900">£{fmt(spentToday)}</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {/* Exclude toggle */}
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
                            <input
                                type="checkbox"
                                checked={excluded}
                                onChange={(e) => onSetExcluded(activeDate, e.target.checked)}
                                className="h-4 w-4 rounded accent-neutral-950"
                            />
                            <div>
                                <p className="text-sm font-semibold text-neutral-800">Exclude from budget</p>
                                <p className="text-xs text-neutral-400">Budget redistributes across remaining days</p>
                            </div>
                        </label>

                        <div className={excluded ? 'pointer-events-none opacity-40' : ''}>
                            {/* Day target + spent */}
                            <div className="mb-3 flex gap-2">
                                <div className="flex-1 rounded-xl bg-neutral-50 px-3 py-2.5">
                                    <p className="text-xs text-neutral-400">Daily target</p>
                                    <p className="font-mono text-sm font-bold text-neutral-900">£{fmt(activeDay.dailyRate)}</p>
                                </div>
                                <div className="flex-1 rounded-xl bg-neutral-50 px-3 py-2.5">
                                    <p className="text-xs text-neutral-400">Spent</p>
                                    <p className={`font-mono text-sm font-bold ${overTarget ? 'text-amber-700' : 'text-neutral-900'}`}>
                                        £{fmt(spentToday)}
                                    </p>
                                </div>
                            </div>

                            {/* Log form */}
                            <form onSubmit={handleAdd} className="flex flex-col gap-2">
                                {dailyRows.length > 1 && (
                                    <Select
                                        options={dailyRows.map((r) => ({ label: r.name, value: r._id }))}
                                        value={rowId}
                                        onChange={setRowId}
                                    />
                                )}
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Amount"
                                        icon="fa-solid fa-sterling-sign"
                                        className="w-32"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                    />
                                    <Input
                                        placeholder="Note (optional)"
                                        className="flex-1"
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={saving || amount.trim() === ''} className="self-start">
                                    {saving ? 'Adding…' : 'Add transaction'}
                                </Button>
                            </form>
                        </div>

                        {/* View transactions */}
                        <button
                            type="button"
                            onClick={() => setShowingTx(true)}
                            className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                        >
                            <span>
                                View transactions
                                {dayTx.length > 0 && <span className="ml-1.5 text-neutral-400">({dayTx.length})</span>}
                            </span>
                            <i className="fa-solid fa-chevron-right text-xs text-neutral-400" aria-hidden="true" />
                        </button>
                    </div>
                )}

                {/* Week transaction list */}
                {weekTx.length > 0 && !showingTx && (
                    <details className="rounded-xl border border-neutral-100">
                        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-neutral-500 hover:text-neutral-900">
                            All transactions this week ({weekTx.length})
                        </summary>
                        <ul className="flex flex-col divide-y divide-neutral-100 px-4 pb-3">
                            {weekTx.map((t) => {
                                const [, , d] = t.date.split('-').map(Number)
                                const date = new Date(Number(t.date.split('-')[0]), Number(t.date.split('-')[1]) - 1, d)
                                const dayLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
                                return (
                                    <li key={t._id} className="flex items-center justify-between gap-3 py-2 text-xs">
                                        <span className="text-neutral-400">{dayLabel}</span>
                                        <span className="flex-1 truncate font-semibold text-neutral-700">{t.note || rowName(t.row)}</span>
                                        <span className="font-mono text-neutral-700">£{fmt(t.amount)}</span>
                                    </li>
                                )
                            })}
                        </ul>
                    </details>
                )}
            </div>
        </Modal>
    )
}

// ── Day edit modal ────────────────────────────────────────────────────────────

interface DayModalProps {
    date: string
    dailyRows: FinanceRow[]
    entries: FinanceEntry[]
    spends: BudgetSpend[]
    excluded: boolean
    excludedDates: Set<string>
    onClose: () => void
    onAddSpend: (rowId: string, date: string, amount: number, note?: string) => Promise<void>
    onDeleteSpend: (id: string) => Promise<void>
    onSetExcluded: (excluded: boolean) => Promise<void>
}

function DayModal({
    date,
    dailyRows,
    entries,
    spends,
    excluded,
    excludedDates,
    onClose,
    onAddSpend,
    onDeleteSpend,
    onSetExcluded,
}: DayModalProps) {
    const isFuture = date > todayKey()
    const [panel, setPanel] = useState<'log' | 'list'>('log')
    const [rowId, setRowId] = useState<string>(dailyRows[0]?._id ?? '')
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

    // Only this day's transactions, limited to the budgets currently in view.
    const rowIds = new Set(dailyRows.map((r) => r._id))
    const dayTx = spends.filter((s) => s.date === date && rowIds.has(s.row))
    const spentToday = dayTx.reduce((sum, t) => sum + t.amount, 0)

    const monthlyTotal = dailyRows.reduce((sum, row) => {
        const entry = entries.find((e) => e.row === row._id)
        return sum + (entry?.amount ?? row.recurringAmount ?? 0)
    }, 0)
    // Target uses active (non-excluded) days so it matches the calendar grid.
    const activeDays = activeDaysInMonth(date.slice(0, 7), excludedDates)
    const dailyRate = activeDays > 0 ? monthlyTotal / activeDays : 0
    const overTarget = !excluded && spentToday > dailyRate

    const rowName = (id: string) => dailyRows.find((r) => r._id === id)?.name ?? '—'

    async function handleAdd(e: FormEvent) {
        e.preventDefault()
        const n = parseFloat(amount.trim())
        if (Number.isNaN(n) || n < 0 || !rowId) return
        setSaving(true)
        try {
            await onAddSpend(rowId, date, n, note.trim() || undefined)
            setAmount('')
            setNote('')
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
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            {isFuture ? (
                <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
                    Future day — nothing to log yet.
                </p>
            ) : panel === 'list' ? (
                // ── Transactions view ──
                <div className="flex flex-col gap-4">
                    <button
                        type="button"
                        onClick={() => setPanel('log')}
                        className="flex items-center gap-1.5 self-start text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                        Back
                    </button>

                    {dayTx.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
                            No transactions logged for this day.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {dayTx.map((t) => (
                                <li
                                    key={t._id}
                                    className="group/tx flex items-center justify-between gap-3 rounded-xl border border-neutral-100 px-4 py-2.5"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-neutral-800">
                                            {t.note || rowName(t.row)}
                                        </p>
                                        {t.note && dailyRows.length > 1 && (
                                            <p className="truncate text-xs text-neutral-400">{rowName(t.row)}</p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <span className="font-mono text-sm text-neutral-700">£{fmt(t.amount)}</span>
                                        <button
                                            type="button"
                                            onClick={() => onDeleteSpend(t._id)}
                                            aria-label="Delete transaction"
                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                        >
                                            <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Total spent
                        </span>
                        <span className="font-mono text-sm font-bold text-neutral-900">£{fmt(spentToday)}</span>
                    </div>
                </div>
            ) : (
                // ── Log view ──
                <div className="flex flex-col gap-4">
                    {/* Exclude toggle */}
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 px-4 py-3 transition-colors hover:bg-neutral-50">
                        <input
                            type="checkbox"
                            checked={excluded}
                            onChange={(e) => onSetExcluded(e.target.checked)}
                            className="h-4 w-4 rounded accent-neutral-950"
                        />
                        <div>
                            <p className="text-sm font-semibold text-neutral-800">Exclude from budget</p>
                            <p className="text-xs text-neutral-400">
                                Work trip, holiday, or other exception — budget redistributes across
                                remaining days
                            </p>
                        </div>
                    </label>

                    <div className={excluded ? 'pointer-events-none opacity-40' : ''}>
                        {/* Target + spent summary */}
                        <div className="mb-3 flex items-stretch gap-3">
                            <div className="flex-1 rounded-xl bg-neutral-50 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Daily target{dailyRows.length > 1 ? ' (all)' : ''}
                                </p>
                                <p className="mt-0.5 text-lg font-bold font-mono text-neutral-900">£{fmt(dailyRate)}</p>
                            </div>
                            <div className="flex-1 rounded-xl bg-neutral-50 px-4 py-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    Spent
                                </p>
                                <p
                                    className={`mt-0.5 text-lg font-bold font-mono ${overTarget ? 'text-amber-700' : 'text-neutral-900'}`}
                                >
                                    £{fmt(spentToday)}
                                </p>
                            </div>
                        </div>

                        {/* Add a transaction */}
                        <form onSubmit={handleAdd} className="flex flex-col gap-2">
                            {dailyRows.length > 1 && (
                                <Select
                                    options={dailyRows.map((r) => ({ label: r.name, value: r._id }))}
                                    value={rowId}
                                    onChange={setRowId}
                                />
                            )}
                            <div className="flex gap-2">
                                <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="Amount"
                                    icon="fa-solid fa-sterling-sign"
                                    className="w-32"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                />
                                <Input
                                    placeholder="Note (optional)"
                                    className="flex-1"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={saving || amount.trim() === ''} className="self-start">
                                {saving ? 'Adding…' : 'Add transaction'}
                            </Button>
                        </form>

                        {/* Per-budget targets */}
                        {dailyRows.length > 1 && (
                            <div className="mt-4 flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                                {dailyRows.map((row) => {
                                    const entry = entries.find((e) => e.row === row._id)
                                    const rowSpends = spends.filter((s) => s.row === row._id)
                                    const { straightDailyRate } = computeBudgetDay(
                                        row,
                                        entry,
                                        rowSpends,
                                        date,
                                        excludedDates
                                    )
                                    const rowSpent = dayTx
                                        .filter((t) => t.row === row._id)
                                        .reduce((s, t) => s + t.amount, 0)
                                    return (
                                        <div key={row._id} className="flex items-center justify-between gap-2 text-xs">
                                            <span className="font-semibold text-neutral-600">{row.name}</span>
                                            <span className="font-mono text-neutral-400">
                                                £{fmt(rowSpent)} / £{fmt(straightDailyRate)}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {overTarget && (
                            <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700">
                                <i className="fa-solid fa-triangle-exclamation text-xs" aria-hidden="true" />
                                Over daily target by £{fmt(spentToday - dailyRate)}
                            </div>
                        )}
                    </div>

                    {/* View transactions */}
                    <button
                        type="button"
                        onClick={() => setPanel('list')}
                        className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                        <span>
                            View transactions
                            {dayTx.length > 0 && (
                                <span className="ml-1.5 text-neutral-400">({dayTx.length})</span>
                            )}
                        </span>
                        <i className="fa-solid fa-chevron-right text-xs text-neutral-400" aria-hidden="true" />
                    </button>
                </div>
            )}
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
    const [selectedWeek, setSelectedWeek] = useState<WeekGroup | null>(null)
    const [selectedRowId, setSelectedRowId] = useState<string>('all')
    const [view, setView] = useState<'daily' | 'weekly'>('daily')
    const toast = useToast()

    useEffect(() => {
        let active = true
        setLoading(true)
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
                setExclusions(x)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [month])

    async function handleAddSpend(rowId: string, date: string, amount: number, note?: string) {
        try {
            const result = await createBudgetSpend(rowId, date, amount, note)
            setSpends((prev) => [...prev, result])
        } catch {
            toast.error("Couldn’t log that transaction.")
        }
    }

    async function handleDeleteSpend(id: string) {
        try {
            await deleteBudgetSpend(id)
            setSpends((prev) => prev.filter((s) => s._id !== id))
        } catch {
            toast.error("Couldn’t delete that transaction.")
        }
    }

    async function handleSetExcluded(date: string, excluded: boolean) {
        try {
            const result = await setBudgetExclusion(date, excluded)
            setExclusions((prev) => {
                const without = prev.filter((x) => x.date !== date)
                return result ? [...without, result] : without
            })
        } catch {
            toast.error("Couldn’t update this day.")
        }
    }

    const today = todayKey()
    // Every daily-tracked budget active this month — drives the filter dropdown.
    const allDailyRows = rows.filter(
        (r) =>
            r.budgeted &&
            r.budgetType === 'daily' &&
            rowVisibleInMonth(
                r,
                month,
                groups.find((g) => g._id === r.group)
            )
    )
    // Fall back to "all" if the chosen budget isn't available this month.
    const activeRowId =
        selectedRowId !== 'all' && allDailyRows.some((r) => r._id === selectedRowId)
            ? selectedRowId
            : 'all'
    // The calendar, stats, and day modal all reflect the current selection.
    const dailyRows =
        activeRowId === 'all' ? allDailyRows : allDailyRows.filter((r) => r._id === activeRowId)
    const budgetOptions = [
        { label: 'All budgets', value: 'all' },
        ...allDailyRows.map((r) => ({ label: r.name, value: r._id })),
    ]
    const excludedDates = new Set(exclusions.map((x) => x.date))
    const dayData = buildDayData(month, dailyRows, entries, spends, excludedDates)
    const offset = startOffset(month)
    const weekGroups = groupByWeek(dayData, today)

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
                            <span
                                className={`text-sm font-bold font-mono ${totalSpent > totalTarget ? 'text-red-600' : 'text-neutral-900'}`}
                            >
                                £{fmt(totalSpent)}
                            </span>
                        </div>
                        <div className="rounded-xl bg-white border border-neutral-200 px-4 py-2">
                            <span className="text-xs text-neutral-400">Target </span>
                            <span className="text-sm font-bold font-mono text-neutral-900">
                                £{fmt(totalTarget)}
                            </span>
                        </div>
                        <div className="rounded-xl bg-white border border-neutral-200 px-4 py-2">
                            <span className="text-xs text-neutral-400">Logged </span>
                            <span className="text-sm font-bold font-mono text-neutral-900">
                                {daysLogged}/{pastDays.length}
                            </span>
                        </div>
                        {excludedCount > 0 && (
                            <div className="rounded-xl bg-neutral-100 border border-neutral-200 px-4 py-2">
                                <span className="text-xs text-neutral-400">Excluded </span>
                                <span className="text-sm font-bold font-mono text-neutral-500">
                                    {excludedCount}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {loading ? (
                <div className="grid place-items-center py-20">
                    <Spinner />
                </div>
            ) : allDailyRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-400">
                        No daily budgets set up. Enable `Daily spend` on a card in the Budgets tab.
                    </p>
                </div>
            ) : (
                <>
                    <div className="mb-4 flex items-center gap-3">
                        {allDailyRows.length > 1 && (
                            <div className="w-full sm:max-w-xs">
                                <Select
                                    icon="fa-solid fa-filter"
                                    options={budgetOptions}
                                    value={activeRowId}
                                    onChange={setSelectedRowId}
                                />
                            </div>
                        )}
                        <div className="flex rounded-full border border-neutral-200 bg-white p-1 text-sm font-semibold shrink-0">
                            {(['daily', 'weekly'] as const).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setView(v)}
                                    className={`rounded-full px-6 py-2 capitalize transition-colors ${
                                        view === v
                                            ? 'bg-neutral-900 text-white'
                                            : 'text-neutral-400 hover:text-neutral-600'
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    {view === 'daily' ? (
                        <div className="grid grid-cols-7 gap-2">
                            {WEEKDAYS.map((wd) => (
                                <div
                                    key={wd}
                                    className="pb-2 text-center text-xs font-bold uppercase tracking-wide text-neutral-400"
                                >
                                    {wd}
                                </div>
                            ))}
                            {Array.from({ length: offset }).map((_, i) => (
                                <div key={`pad-${i}`} />
                            ))}
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
                    ) : (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                            {weekGroups.map((w, i) => (
                                <WeekCell
                                    key={i}
                                    week={w}
                                    today={today}
                                    onClick={() => setSelectedWeek(w)}
                                />
                            ))}
                        </div>
                    )}

                    <div className="mt-4 flex items-center gap-5">
                        {[
                            { color: 'bg-emerald-50', label: 'Under target' },
                            { color: 'bg-amber-50', label: 'Over target' },
                            { color: 'bg-red-50', label: 'Over budget' },
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
                    excludedDates={excludedDates}
                    onClose={() => setSelectedDate(null)}
                    onAddSpend={handleAddSpend}
                    onDeleteSpend={handleDeleteSpend}
                    onSetExcluded={(ex) => handleSetExcluded(selectedDate, ex)}
                />
            )}

            {selectedWeek && (
                <WeekModal
                    week={selectedWeek}
                    today={today}
                    dailyRows={dailyRows}
                    entries={entries}
                    spends={spends}
                    excludedDates={excludedDates}
                    onClose={() => setSelectedWeek(null)}
                    onAddSpend={handleAddSpend}
                    onDeleteSpend={handleDeleteSpend}
                    onSetExcluded={handleSetExcluded}
                />
            )}
        </>
    )
}
