import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import Input from '../components/Input'
import Spinner from '../components/Spinner'
import {
    listGroups,
    listRows,
    listEntries,
    listSubItems,
    createSubItem,
    updateSubItem,
    deleteSubItem,
} from '../services/finances'
import { formatAmount } from '../lib/money'
import { useToast } from '../context/ToastContext'
import type { FinanceGroup, FinanceRow, FinanceEntry, FinanceSubItem } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const fmt = formatAmount

// ── Inline edit row ───────────────────────────────────────────────────────────

interface SubItemRowProps {
    item: FinanceSubItem
    onSave: (id: string, name: string, amount: number) => Promise<void>
    onDelete: (id: string) => Promise<void>
}

function SubItemRow({ item, onSave, onDelete }: SubItemRowProps) {
    const [editing, setEditing] = useState(false)
    const [name, setName] = useState(item.name)
    const [amount, setAmount] = useState(String(item.amount))
    const [saving, setSaving] = useState(false)
    const nameRef = useRef<HTMLInputElement>(null)

    async function handleSave() {
        const n = parseFloat(amount)
        if (!name.trim() || Number.isNaN(n)) return
        setSaving(true)
        try {
            await onSave(item._id, name.trim(), n)
            setEditing(false)
        } finally {
            setSaving(false)
        }
    }

    if (editing) {
        return (
            <li className="flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
                <Input
                    ref={nameRef}
                    autoFocus
                    className="flex-1 !py-1.5 !text-sm"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') setEditing(false)
                    }}
                />
                <div className="flex items-center rounded-xl border border-neutral-200 bg-white px-3 py-1.5 focus-within:border-neutral-950 w-32">
                    <span className="text-sm text-neutral-400">£</span>
                    <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave()
                            if (e.key === 'Escape') setEditing(false)
                        }}
                        className="ml-1 w-full bg-transparent text-sm font-mono outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                </div>
                <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? '…' : 'Save'}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                        setEditing(false)
                        setName(item.name)
                        setAmount(String(item.amount))
                    }}
                >
                    Cancel
                </Button>
            </li>
        )
    }

    return (
        <li className="group/item flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white px-4 py-3.5 transition-all hover:border-neutral-200 hover:shadow-sm">
            <span className="flex-1 text-sm font-semibold text-neutral-800">{item.name}</span>
            <span className="font-mono tabular-nums text-sm text-neutral-700">£{fmt(item.amount)}</span>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
                <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(item._id)}
                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                    <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                </button>
            </div>
        </li>
    )
}

// ── Add item form ─────────────────────────────────────────────────────────────

interface AddItemFormProps {
    onSave: (name: string, amount: number) => Promise<void>
    onCancel: () => void
}

function AddItemForm({ onSave, onCancel }: AddItemFormProps) {
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('')
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        const n = parseFloat(amount)
        if (!name.trim() || Number.isNaN(n)) return
        setSaving(true)
        try {
            await onSave(name.trim(), n)
        } finally {
            setSaving(false)
        }
    }

    return (
        <li className="flex items-center gap-2 rounded-2xl border border-neutral-300 bg-neutral-50 px-4 py-3">
            <Input
                autoFocus
                className="flex-1 !py-1.5 !text-sm"
                placeholder="Item name (e.g. Flights)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSave()
                    if (e.key === 'Escape') onCancel()
                }}
            />
            <div className="flex items-center rounded-xl border border-neutral-200 bg-white px-3 py-1.5 focus-within:border-neutral-950 w-36">
                <span className="text-sm text-neutral-400">£</span>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') onCancel()
                    }}
                    className="ml-1 w-full bg-transparent text-sm font-mono outline-none placeholder:text-neutral-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
            </div>
            <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !name.trim() || !amount.trim()}
            >
                {saving ? '…' : 'Add'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
            </Button>
        </li>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinanceBreakdown() {
    const { rowId } = useParams<{ rowId: string }>()
    const [searchParams, setSearchParams] = useSearchParams()
    const navigate = useNavigate()
    const toast = useToast()

    const [month, setMonth] = useState(() => searchParams.get('month') ?? currentMonth())
    const [loading, setLoading] = useState(true)
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [items, setItems] = useState<FinanceSubItem[]>([])
    const [adding, setAdding] = useState(false)

    // Keep URL in sync with month — preserve other params (e.g. recurring)
    useEffect(() => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev)
                next.set('month', month)
                return next
            },
            { replace: true }
        )
    }, [month, setSearchParams])

    useEffect(() => {
        if (!rowId) return
        let active = true
        setLoading(true)
        // We need rows first to know if recurring, but for initial load use searchParam hint
        const isRowRecurring = searchParams.get('recurring') !== 'false'
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listSubItems(rowId, isRowRecurring ? month : undefined),
        ])
            .then(([g, r, e, s]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setItems(s)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [rowId, month, searchParams])

    const row = rows.find((r) => r._id === rowId)
    const group = row ? groups.find((g) => g._id === row.group) : undefined
    const entry = row ? entries.find((e) => e.row === row._id) : undefined
    const isRecurring = row?.recurring !== false // default true for existing rows

    const totalAmount = entry?.amount ?? row?.recurringAmount ?? 0
    const breakdownTotal = items.reduce((s, i) => s + i.amount, 0)
    const remaining = totalAmount - breakdownTotal
    const pct = totalAmount > 0 ? Math.min(100, (breakdownTotal / totalAmount) * 100) : 0

    const isIncome = group?.type === 'income'
    const isSavings = group?.type === 'savings'
    const accentCls = isIncome ? 'text-emerald-700' : isSavings ? 'text-blue-700' : 'text-red-700'
    const badgeCls = isIncome
        ? 'bg-emerald-100 text-emerald-700'
        : isSavings
          ? 'bg-blue-100 text-blue-700'
          : 'bg-red-100 text-red-700'

    async function handleAdd(name: string, amount: number) {
        if (!rowId) return
        try {
            const item = await createSubItem(rowId, name, amount, isRecurring ? month : undefined)
            setItems((prev) => [...prev, item])
            setAdding(false)
        } catch {
            toast.error('Couldn’t add that item.')
        }
    }

    async function handleSave(id: string, name: string, amount: number) {
        try {
            const updated = await updateSubItem(id, { name, amount })
            setItems((prev) => prev.map((i) => (i._id === id ? updated : i)))
        } catch {
            toast.error('Couldn’t save that item.')
        }
    }

    async function handleDelete(id: string) {
        try {
            await deleteSubItem(id)
            setItems((prev) => prev.filter((i) => i._id !== id))
        } catch {
            toast.error('Couldn’t delete that item.')
        }
    }

    return (
        <Container as="main" className="max-w-2xl py-10">
            {/* Back */}
            <Button
                variant="ghost"
                size="sm"
                icon="fa-solid fa-arrow-left"
                onClick={() => navigate(`/finances?month=${month}`)}
                className="mb-6"
            >
                Back to Finances
            </Button>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : !row || !group ? (
                <p className="text-sm text-neutral-400">Row not found.</p>
            ) : (
                <>
                    {/* Header */}
                    <header className="mb-8">
                        <div className="flex items-center gap-2 mb-1">
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}
                            >
                                {group.name}
                            </span>
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-neutral-950">
                            {row.name}
                        </h1>
                        <p className="mt-1 text-sm text-neutral-500">
                            {isRecurring ? `Breakdown for ${formatMonth(month)}` : 'Row breakdown'}
                        </p>
                    </header>

                    {/* Month navigator — recurring rows only */}
                    {isRecurring && (
                        <div className="mb-8 flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => setMonth((m) => addMonths(m, -1))}
                                className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <i
                                    className="fa-solid fa-chevron-left text-sm"
                                    aria-hidden="true"
                                />
                            </button>
                            <span className="min-w-[160px] text-center text-base font-semibold text-neutral-900">
                                {formatMonth(month)}
                            </span>
                            <button
                                type="button"
                                onClick={() => setMonth((m) => addMonths(m, 1))}
                                className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <i
                                    className="fa-solid fa-chevron-right text-sm"
                                    aria-hidden="true"
                                />
                            </button>
                            {month !== currentMonth() && (
                                <button
                                    type="button"
                                    onClick={() => setMonth(currentMonth())}
                                    className="ml-1 rounded-full px-3 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100"
                                >
                                    This month
                                </button>
                            )}
                        </div>
                    )}

                    {/* Total card */}
                    <div className="mb-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            {isRecurring
                                ? `Total for ${formatMonth(month)}`
                                : `Total — ${row.name}`}
                        </p>
                        <p
                            className={`mt-1 text-4xl font-bold font-mono tabular-nums ${accentCls}`}
                        >
                            £{fmt(totalAmount)}
                        </p>
                        {row.recurringAmount !== undefined && entry?.amount === undefined && (
                            <p className="mt-1 text-xs text-neutral-400">
                                Recurring amount — no override set for this month
                            </p>
                        )}

                        {/* Progress bar */}
                        {totalAmount > 0 && (
                            <div className="mt-4">
                                <div className="mb-1.5 flex items-center justify-between text-xs">
                                    <span className="font-semibold text-neutral-500">
                                        £{fmt(breakdownTotal)} accounted for
                                    </span>
                                    <span
                                        className={`font-semibold ${remaining < 0 ? 'text-red-500' : remaining === 0 ? 'text-emerald-600' : 'text-neutral-400'}`}
                                    >
                                        {remaining < 0
                                            ? `£${fmt(Math.abs(remaining))} over`
                                            : remaining === 0
                                              ? 'Fully accounted for'
                                              : `£${fmt(remaining)} unaccounted`}
                                    </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                                    <div
                                        className={`h-full rounded-full transition-all duration-300 ${remaining < 0 ? 'bg-red-400' : 'bg-neutral-950'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sub-items */}
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                            Breakdown{' '}
                            {items.length > 0 &&
                                `· ${items.length} item${items.length !== 1 ? 's' : ''}`}
                        </h2>
                        {!adding && (
                            <Button
                                size="sm"
                                variant="secondary"
                                icon="fa-solid fa-plus"
                                onClick={() => setAdding(true)}
                            >
                                Add item
                            </Button>
                        )}
                    </div>

                    <ul className="flex flex-col gap-2">
                        {items.map((item) => (
                            <SubItemRow
                                key={item._id}
                                item={item}
                                onSave={handleSave}
                                onDelete={handleDelete}
                            />
                        ))}

                        {adding && (
                            <AddItemForm onSave={handleAdd} onCancel={() => setAdding(false)} />
                        )}

                        {items.length === 0 && !adding && (
                            <li className="rounded-2xl border border-dashed border-neutral-200 p-8 text-center">
                                <p className="text-sm text-neutral-400">
                                    No breakdown items yet. Add one to start itemising this row.
                                </p>
                            </li>
                        )}
                    </ul>
                </>
            )}
        </Container>
    )
}
