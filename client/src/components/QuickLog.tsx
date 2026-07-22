import { useEffect, useMemo, useState, type FormEvent } from 'react'
import Modal from './Modal'
import Button from './Button'
import Input from './Input'
import Select from './Select'
import Spinner from './Spinner'
import { useToast } from '../context/ToastContext'
import { useInvalidate, useDataVersion } from '../context/DataSyncContext'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
    listBudgetTopUps,
    createBudgetSpend,
} from '../services/finances'
import { monthOf } from '../lib/budget'
import { recurringAmountForMonth } from '../lib/finance'
import { todayKey } from '../lib/calendar'
import { formatMoney, formatAmount } from '../lib/money'
import { useMoneyHidden } from './useMoneyHidden'
import {
    trackedRowsInMonth,
    spendSummary,
    remainingActiveDays,
    type MonthBudgetData,
} from '../lib/budgetDiscipline'
import type { FinanceGroup, FinanceRow } from '../types'

export default function QuickLog() {
    useMoneyHidden() // re-render when money is hidden/shown
    const toast = useToast()
    const invalidate = useInvalidate()
    const budgetVersion = useDataVersion('budget')

    const today = todayKey()
    const month = monthOf(today)

    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [data, setData] = useState<MonthBudgetData>({
        entries: [],
        spends: [],
        excluded: new Set(),
    })
    const [loadedKey, setLoadedKey] = useState<string | null>(null)
    const loading = loadedKey !== month

    const [open, setOpen] = useState(false)
    const [rowId, setRowId] = useState('')
    const [amount, setAmount] = useState('')
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

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
                setData({ entries: e, spends: s, excluded: new Set(x.map((d) => d.date)), topUps: t })
            })
            .finally(() => active && setLoadedKey(month))
        return () => {
            active = false
        }
    }, [month, budgetVersion])

    const summary = useMemo(
        () => spendSummary(groups, rows, data, today),
        [groups, rows, data, today]
    )
    const { safe: safeToday, spent: spentToday, allowance } = summary.today

    // Tracked budgets (weekly + daily) with amounts, for the picker.
    const loggableRows = useMemo(
        () =>
            trackedRowsInMonth(groups, rows, month).filter((r) => {
                const entry = data.entries.find((e) => e.row === r._id)
                return (entry?.amount ?? recurringAmountForMonth(r, month) ?? 0) > 0
            }),
        [groups, rows, data, month]
    )

    // Default the picker to the first loggable budget once data arrives.
    useEffect(() => {
        if (!rowId && loggableRows.length > 0) setRowId(loggableRows[0]._id)
    }, [loggableRows, rowId])

    if (loading || !summary.hasBudgets) return null

    const amountNum = parseFloat(amount)
    const validAmount = Number.isFinite(amountNum) && amountNum > 0
    const over = validAmount ? amountNum - safeToday : 0
    const isOver = over > 0.005
    const daysLeft = remainingActiveDays(today, data.excluded)
    const perDayHit = daysLeft > 0 ? over / daysLeft : over
    const overShort = safeToday < -0.005

    async function submit(e: FormEvent) {
        e.preventDefault()
        if (!validAmount || !rowId) return
        if (isOver && !note.trim()) return
        setSaving(true)
        try {
            await createBudgetSpend(rowId, today, amountNum, note.trim() || undefined)
            invalidate('budget')
            setAmount('')
            setNote('')
            setOpen(false)
            toast.show(`Logged ${formatMoney(amountNum)}`, 'success')
        } catch {
            toast.error('Couldn’t log that spend.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <>
            {/* Always-on safe-to-spend pill / quick-log trigger */}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-neutral-950 py-2.5 pl-4 pr-3 text-white shadow-lg shadow-neutral-950/20 transition-all duration-150 hover:bg-neutral-800 active:scale-[0.97]"
                title="Log a spend"
            >
                <i className="fa-solid fa-wallet text-xs text-neutral-400" aria-hidden="true" />
                <span className="flex flex-col items-start leading-none">
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-neutral-500">
                        {overShort ? 'Over today' : 'Safe today'}
                    </span>
                    <span
                        className={`text-sm font-bold tabular-nums ${
                            safeToday >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                    >
                        {formatMoney(safeToday)}
                    </span>
                </span>
                <span className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-white/10">
                    <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                </span>
            </button>

            {open && (
                <Modal
                    open
                    onClose={() => setOpen(false)}
                    size="sm"
                    title="Log a spend"
                    footer={
                        <Button variant="ghost" onClick={() => setOpen(false)}>
                            Close
                        </Button>
                    }
                >
                    {loggableRows.length === 0 ? (
                        <p className="py-4 text-sm text-neutral-400">
                            No daily budgets with amounts set yet.
                        </p>
                    ) : (
                        <form onSubmit={submit} className="flex flex-col gap-4">
                            {/* Safe-to-spend hero */}
                            <div className="rounded-2xl bg-neutral-950 px-5 py-4 text-white">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                                    {overShort ? 'Over budget today' : 'Safe to spend today'}
                                </p>
                                <p
                                    className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${
                                        safeToday >= 0 ? 'text-white' : 'text-red-400'
                                    }`}
                                >
                                    {formatMoney(safeToday)}
                                </p>
                                <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                                    £{formatAmount(spentToday)} spent of £{formatAmount(allowance)}{' '}
                                    allowance
                                </p>
                            </div>

                            {loggableRows.length > 1 && (
                                <Select
                                    label="Budget"
                                    options={loggableRows.map((r) => ({
                                        label: r.name,
                                        value: r._id,
                                    }))}
                                    value={rowId}
                                    onChange={setRowId}
                                />
                            )}

                            {/* Amount */}
                            <Input
                                label="Amount"
                                icon="fa-solid fa-sterling-sign"
                                autoFocus
                                type="number"
                                step="0.01"
                                min="0"
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="tabular-nums"
                            />

                            {/* Overspend friction */}
                            {isOver && (
                                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                                    <p className="flex items-center gap-2 text-sm font-bold text-red-600">
                                        <i
                                            className="fa-solid fa-triangle-exclamation text-xs"
                                            aria-hidden="true"
                                        />
                                        {formatMoney(over)} over today’s allowance
                                    </p>
                                    <p className="mt-1 text-xs text-red-500">
                                        {daysLeft > 0
                                            ? `Logging this trims about ${formatMoney(perDayHit)}/day from your remaining ${daysLeft} day${daysLeft !== 1 ? 's' : ''} this month.`
                                            : 'This pushes you over for the month.'}
                                    </p>
                                </div>
                            )}

                            {/* Note — required when over */}
                            <Input
                                label={isOver ? 'Reason (required)' : 'Note (optional)'}
                                type="text"
                                placeholder={isOver ? 'Why did this go over?' : 'What was it for?'}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                error={isOver ? ' ' : undefined}
                            />

                            <Button
                                type="submit"
                                fullWidth
                                disabled={saving || !validAmount || (isOver && !note.trim())}
                            >
                                {saving
                                    ? 'Logging…'
                                    : isOver
                                      ? 'Log anyway'
                                      : `Log ${validAmount ? formatMoney(amountNum) : 'spend'}`}
                            </Button>
                        </form>
                    )}

                    {loading && (
                        <div className="grid place-items-center py-6">
                            <Spinner />
                        </div>
                    )}
                </Modal>
            )}
        </>
    )
}
