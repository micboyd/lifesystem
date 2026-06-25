import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Input from '../components/Input'
import { Card } from '../components/Card'
import {
    listGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    listRows,
    createRow,
    updateRow,
    deleteRow,
    listEntries,
    setEntry,
    listPaid,
    setPaid,
    listPots,
    createPot,
    updatePot,
    deletePot,
    type AddScope,
} from '../services/finances'
import { addMonths, rowVisibleInMonth, groupVisibleInMonth, type DeleteMode } from '../lib/finance'
import { formatMoney, formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import DeleteScopeDialog from '../components/finance/DeleteScopeDialog'
import Tabs from '../components/Tabs'
import type { FinanceGroup, FinancePot, FinanceRow, FinanceEntry } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// ── Inline amount cell ────────────────────────────────────────────────────────

interface AmountCellProps {
    value: number | undefined
    placeholder?: number
    onSave: (v: number | null) => void
    /** Render as a large hero number (Monthly list rows) rather than a compact cell. */
    large?: boolean
}

function AmountCell({ value, placeholder, onSave, large = false }: AmountCellProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    function startEdit() {
        setDraft(
            value !== undefined
                ? String(value)
                : placeholder !== undefined
                  ? String(placeholder)
                  : ''
        )
        setEditing(true)
        setTimeout(() => inputRef.current?.select(), 0)
    }

    function commit() {
        const trimmed = draft.trim()
        if (trimmed === '') {
            onSave(null)
        } else {
            const n = parseFloat(trimmed)
            if (!Number.isNaN(n)) onSave(n)
        }
        setEditing(false)
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                autoFocus
                type="number"
                step="0.01"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') setEditing(false)
                }}
                className={[
                    'w-full rounded-lg border border-neutral-300 bg-white px-2 text-right font-mono tabular-nums focus:border-neutral-950 focus:outline-none',
                    large ? 'py-1 text-sm font-semibold' : 'py-1 text-sm',
                ].join(' ')}
            />
        )
    }

    const display = value !== undefined ? value : placeholder
    const isPlaceholder = value === undefined && placeholder !== undefined

    return (
        <button
            type="button"
            onClick={startEdit}
            className={[
                'w-full rounded-lg px-2 text-right font-mono tabular-nums transition-colors hover:bg-neutral-100',
                large ? 'py-1 text-sm font-semibold' : 'py-1 text-sm',
                isPlaceholder
                    ? large
                        ? 'text-neutral-400'
                        : 'text-neutral-300'
                    : 'text-neutral-900',
            ].join(' ')}
        >
            {display !== undefined ? (
                `£${formatAmount(display)}`
            ) : (
                <span className="text-neutral-200">—</span>
            )}
        </button>
    )
}

// ── Pot card ─────────────────────────────────────────────────────────────────

interface PotCardProps {
    pot: FinancePot
    rows: FinanceRow[]
    entries: FinanceEntry[]
    month: string
    totalCls: string
    isSavings: boolean
    isAddingRow: boolean
    onStartAddRow: () => void
    onCancelAddRow: () => void
    onSaveAddRow: (name: string, amount: number | undefined, recurring: boolean) => Promise<void>
    onSaveRow: (id: string, name: string, amountStr: string) => Promise<void>
    onSetEntry: (rowId: string, amount: number | null) => Promise<void>
    onDeleteRow: (id: string) => void
    onToggleBudget: (rowId: string, budgeted: boolean) => Promise<void>
    onNavigate: (rowId: string) => void
    effectiveAmount: (row: FinanceRow) => number
    onRename: (id: string, name: string) => Promise<void>
    onDelete: (id: string) => void
}

function PotCard({
    pot, rows, entries, month, totalCls, isSavings, isAddingRow,
    onStartAddRow, onCancelAddRow, onSaveAddRow, onSaveRow,
    onSetEntry, onDeleteRow, onToggleBudget, onNavigate,
    effectiveAmount, onRename, onDelete,
}: PotCardProps) {
    const [renamingPot, setRenamingPot] = useState(false)
    const [potNameInput, setPotNameInput] = useState(pot.name)
    const [savingPotName, setSavingPotName] = useState(false)
    const [editingRowId, setEditingRowId] = useState<string | null>(null)
    const [draftName, setDraftName] = useState('')
    const [draftAmount, setDraftAmount] = useState('')
    const [savingRow, setSavingRow] = useState(false)
    const total = rows.reduce((s, r) => s + effectiveAmount(r), 0)

    async function saveRename() {
        if (!potNameInput.trim() || potNameInput.trim() === pot.name) { setRenamingPot(false); return }
        setSavingPotName(true)
        try { await onRename(pot._id, potNameInput.trim()); setRenamingPot(false) }
        finally { setSavingPotName(false) }
    }

    function startEditRow(row: FinanceRow) {
        setEditingRowId(row._id)
        setDraftName(row.name)
        const current = row.recurring === false
            ? (entries.find((e) => e.row === row._id)?.amount ?? row.recurringAmount)
            : row.recurringAmount
        setDraftAmount(current !== undefined ? String(current) : '')
    }

    async function commitEditRow(id: string) {
        setSavingRow(true)
        try { await onSaveRow(id, draftName, draftAmount); setEditingRowId(null) }
        finally { setSavingRow(false) }
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 transition-shadow hover:shadow-sm">
            {/* Pot header */}
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 bg-white px-4 py-3">
                {renamingPot ? (
                    <div className="flex flex-1 items-center gap-2">
                        <Input
                            autoFocus
                            className="!py-1 !text-xs"
                            value={potNameInput}
                            onChange={(e) => setPotNameInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenamingPot(false) }}
                        />
                        <Button size="sm" onClick={saveRename} disabled={savingPotName}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setRenamingPot(false)}>Cancel</Button>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-2">
                            <i className="fa-solid fa-layer-group text-xs text-neutral-400" aria-hidden="true" />
                            <span className="text-sm font-semibold text-neutral-700">{pot.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className={`mr-1 text-xs font-semibold font-mono tabular-nums ${totalCls}`}>
                                {formatMoney(total)}
                            </span>
                            <button
                                type="button"
                                onClick={() => { setRenamingPot(true); setPotNameInput(pot.name) }}
                                className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                            >
                                <i className="fa-solid fa-pen text-[10px]" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(pot._id)}
                                className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-100 hover:text-red-500"
                            >
                                <i className="fa-solid fa-trash-can text-[10px]" aria-hidden="true" />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Pot rows — list presentation */}
            <div>
                <div className="flex flex-col divide-y divide-neutral-200/70">
                    {rows.map((row) => {
                        const amt = entries.find((e) => e.row === row._id)?.amount
                        const rowVal = effectiveAmount(row)
                        const pct = total !== 0 ? Math.min(100, Math.abs(rowVal / total) * 100) : 0
                        const barCls = totalCls.includes('emerald')
                            ? 'bg-emerald-400'
                            : totalCls.includes('blue')
                              ? 'bg-blue-400'
                              : 'bg-red-300'

                        if (editingRowId === row._id) {
                            return (
                                <div
                                    key={row._id}
                                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
                                >
                                    <Input
                                        autoFocus
                                        className="!py-1.5 !text-sm sm:flex-1"
                                        value={draftName}
                                        onChange={(e) => setDraftName(e.target.value)}
                                    />
                                    <Input
                                        className="!py-1.5 !text-sm sm:w-40"
                                        type="number"
                                        step="0.01"
                                        placeholder={row.recurring === false ? 'Amount' : 'Monthly amount'}
                                        value={draftAmount}
                                        onChange={(e) => setDraftAmount(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && commitEditRow(row._id)}
                                    />
                                    <div className="flex gap-1">
                                        <Button size="sm" onClick={() => commitEditRow(row._id)} disabled={savingRow}>Save</Button>
                                        <Button size="sm" variant="ghost" onClick={() => setEditingRowId(null)}>Cancel</Button>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div
                                key={row._id}
                                className="group/row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/70"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-neutral-900">{row.name}</span>
                                        {row.budgeted && (
                                            <i className="fa-solid fa-bookmark text-[10px] text-neutral-300" title="In Budgets" aria-hidden="true" />
                                        )}
                                        {row.recurring === false && (
                                            <span className="rounded-full bg-neutral-200/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                                                one-time
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1.5 flex items-center gap-2">
                                        <div className="h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-neutral-200/70">
                                            <div className={`h-full rounded-full ${barCls}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        {row.recurring !== false && row.recurringAmount !== undefined && (
                                            <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-400">
                                                £{formatAmount(row.recurringAmount)}/mo
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center justify-end">
                                <div className="w-28 text-right">
                                    <AmountCell large value={amt} placeholder={row.recurringAmount} onSave={(v) => onSetEntry(row._id, v)} />
                                </div>

                                <div className="flex items-center gap-0.5 overflow-hidden max-w-[160px] opacity-100 transition-all duration-200 sm:max-w-0 sm:opacity-0 sm:group-hover/row:max-w-[160px] sm:group-hover/row:opacity-100">
                                    <button type="button" onClick={() => onNavigate(row._id)} title="View breakdown"
                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">
                                        <i className="fa-solid fa-chart-pie text-xs" aria-hidden="true" />
                                    </button>
                                    <button type="button" onClick={() => onToggleBudget(row._id, !row.budgeted)}
                                        title={row.budgeted ? 'Remove from Budgets' : 'Add to Budgets'}
                                        className={['grid h-7 w-7 place-items-center rounded-full transition-colors',
                                            row.budgeted ? 'text-neutral-900 hover:bg-neutral-100' : 'text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500'].join(' ')}>
                                        <i className="fa-solid fa-bookmark text-xs" aria-hidden="true" />
                                    </button>
                                    <button type="button" onClick={() => startEditRow(row)}
                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700">
                                        <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                    </button>
                                    {!isSavings && (
                                        <button type="button" onClick={() => onDeleteRow(row._id)}
                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500">
                                            <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                </div>
                            </div>
                        )
                    })}
                    {isAddingRow && (
                        <AddRowForm month={month} onSave={onSaveAddRow} onCancel={onCancelAddRow} />
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
                    {!isSavings && !isAddingRow ? (
                        <Button size="sm" variant="secondary" icon="fa-solid fa-plus" onClick={onStartAddRow}>
                            Add row
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">Total</span>
                        <span className={`pr-2 font-mono text-sm font-bold tabular-nums tracking-tight ${totalCls}`}>
                            {formatMoney(total)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Add pot inline ────────────────────────────────────────────────────────────

function AddPotInline({ groupId, onAdd }: { groupId: string; onAdd: (groupId: string, name: string) => Promise<void> }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [saving, setSaving] = useState(false)

    async function submit() {
        if (!name.trim()) return
        setSaving(true)
        try { await onAdd(groupId, name.trim()); setName(''); setOpen(false) }
        finally { setSaving(false) }
    }

    if (!open) {
        return (
            <Button
                size="sm"
                variant="secondary"
                icon="fa-solid fa-layer-group"
                onClick={() => setOpen(true)}
                className="self-start"
            >
                Add pot
            </Button>
        )
    }

    return (
        <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
            <Input
                autoFocus
                className="!py-1.5 !text-xs"
                placeholder="Pot name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false) }}
            />
            <Button size="sm" onClick={submit} disabled={saving || !name.trim()}>
                {saving ? '…' : 'Add'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
    )
}

// ── Add row inline form ───────────────────────────────────────────────────────

interface AddRowFormProps {
    month: string
    onSave: (name: string, amount: number | undefined, recurring: boolean) => Promise<void>
    onCancel: () => void
}

function AddRowForm({ month, onSave, onCancel }: AddRowFormProps) {
    const [name, setName] = useState('')
    const [isRecurring, setIsRecurring] = useState(true)
    const [amount, setAmount] = useState('')
    const [saving, setSaving] = useState(false)

    async function handleSave() {
        if (!name.trim()) return
        setSaving(true)
        try {
            const n = amount.trim() !== '' ? parseFloat(amount) : undefined
            await onSave(
                name.trim(),
                n !== undefined && !Number.isNaN(n) ? n : undefined,
                isRecurring
            )
        } finally {
            setSaving(false)
        }
    }

    const monthLabel = formatMonth(month)

    return (
        <div className="flex flex-col gap-3 bg-neutral-50 px-5 py-4">
            {/* Type toggle */}
            <div className="flex w-fit gap-1 rounded-lg border border-neutral-200 bg-white p-1">
                {(
                    [
                        ['recurring', 'Recurring'],
                        ['onetime', 'One-time'],
                    ] as const
                ).map(([key, label]) => {
                    const active = (key === 'recurring') === isRecurring
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setIsRecurring(key === 'recurring')}
                            className={[
                                'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                                active
                                    ? 'bg-neutral-950 text-white'
                                    : 'text-neutral-500 hover:text-neutral-900',
                            ].join(' ')}
                        >
                            {label}
                        </button>
                    )
                })}
            </div>

            {/* Name + amount */}
            <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                    autoFocus
                    className="!py-1.5 !text-xs sm:flex-1"
                    placeholder="Row name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
                <Input
                    className="!py-1.5 !text-xs sm:w-48"
                    type="number"
                    step="0.01"
                    placeholder={isRecurring ? 'Monthly amount' : `Amount for ${monthLabel}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                />
            </div>

            <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-neutral-400">
                    {isRecurring
                        ? 'Applied every month — you can override the amount per month.'
                        : `Only counts in ${monthLabel}.`}
                </p>
                <div className="flex shrink-0 gap-1">
                    <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
                        {saving ? 'Saving…' : 'Add'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Finances() {
    useMoneyHidden() // re-render this subtree when money is hidden/shown
    const navigate = useNavigate()
    const toast = useToast()
    const { user } = useAuth()
    const financeStartMonth = user?.settings?.financeStartDate?.slice(0, 7) ?? null
    const [searchParams] = useSearchParams()
    const [month, setMonth] = useState(() => {
        const p = searchParams.get('month')
        return p && /^\d{4}-\d{2}$/.test(p) ? p : currentMonth()
    })
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [pots, setPots] = useState<FinancePot[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [paidRows, setPaidRows] = useState<Set<string>>(new Set())

    // New group form
    const [addingGroup, setAddingGroup] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupType, setNewGroupType] = useState<'income' | 'expense' | 'savings'>('expense')
    const [newGroupScope, setNewGroupScope] = useState<AddScope>('all')
    const [newGroupMonthly, setNewGroupMonthly] = useState('')
    const [savingGroup, setSavingGroup] = useState(false)

    // Delete confirmation / scope dialog
    const [pendingDelete, setPendingDelete] = useState<{
        kind: 'group' | 'row'
        id: string
        name: string
        scoped: boolean
    } | null>(null)

    // Editing
    const [editingGroup, setEditingGroup] = useState<string | null>(null)
    const [editGroupName, setEditGroupName] = useState('')
    const [addingRowFor, setAddingRowFor] = useState<{ groupId: string; potId?: string } | null>(null)
    const [editingRow, setEditingRow] = useState<string | null>(null)
    const [editRowName, setEditRowName] = useState('')
    const [editRowAmount, setEditRowAmount] = useState('')

    useEffect(() => {
        let active = true
        Promise.all([listGroups(), listRows(), listPots()])
            .then(([g, r, p]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setPots(p)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [])

    useEffect(() => {
        let active = true
        listEntries(month).then((e) => active && setEntries(e))
        return () => {
            active = false
        }
    }, [month])

    // Load paid state from server when month changes
    useEffect(() => {
        let active = true
        listPaid(month).then((ids) => active && setPaidRows(new Set(ids)))
        return () => { active = false }
    }, [month])

    // ── Derived totals ────────────────────────────────────────────────────────

    function entryAmount(rowId: string): number | undefined {
        return entries.find((e) => e.row === rowId)?.amount
    }

    function effectiveAmount(row: FinanceRow): number {
        const e = entryAmount(row._id)
        return e !== undefined ? e : (row.recurringAmount ?? 0)
    }

    // Groups active in the viewed month. Totals are derived only from these so a
    // group hidden this month never contributes to the summary or net (otherwise
    // its rows silently skew the figures while being invisible on the sheet).
    const monthGroups = groups.filter((g) => groupVisibleInMonth(g, month))

    // Rows shown in the viewed month, honouring the row's own lifecycle AND its
    // parent group's visibility (a hidden group hides its rows here too).
    function visibleRows(group: FinanceGroup): FinanceRow[] {
        return rows.filter((r) => r.group === group._id && rowVisibleInMonth(r, month, group))
    }

    function groupTotal(group: FinanceGroup): number {
        return visibleRows(group).reduce((sum, r) => sum + effectiveAmount(r), 0)
    }

    const totalIncome = monthGroups
        .filter((g) => g.type === 'income')
        .reduce((sum, g) => sum + groupTotal(g), 0)

    const totalExpense = monthGroups
        .filter((g) => g.type === 'expense')
        .reduce((sum, g) => sum + groupTotal(g), 0)

    const totalSavings = monthGroups
        .filter((g) => g.type === 'savings')
        .reduce((sum, g) => sum + groupTotal(g), 0)

    const net = totalIncome - totalExpense - totalSavings

    function togglePaid(rowId: string) {
        setPaidRows((prev) => {
            const nowPaid = !prev.has(rowId)
            const next = new Set(prev)
            if (nowPaid) next.add(rowId)
            else next.delete(rowId)
            setPaid(rowId, month, nowPaid)
            return next
        })
    }

    function setGroupAllPaid(groupRowIds: string[], paid: boolean) {
        setPaidRows((prev) => {
            const next = new Set(prev)
            for (const id of groupRowIds) {
                if (paid) next.add(id)
                else next.delete(id)
                setPaid(id, month, paid)
            }
            return next
        })
    }

    // ── Handlers ──────────────────────────────────────────────────────────────

    async function handleAddGroup() {
        if (!newGroupName.trim()) return
        setSavingGroup(true)
        try {
            const monthly = parseFloat(newGroupMonthly.replace(/,/g, ''))
            const extra = newGroupType === 'savings' && !Number.isNaN(monthly) && monthly > 0
                ? { recurringAmount: monthly }
                : undefined
            const g = await createGroup(newGroupName.trim(), newGroupType, newGroupScope, month, extra)
            setGroups((prev) => [...prev, g])
            // Savings groups auto-create a row on the server — re-fetch so it appears
            if (g.type === 'savings') {
                const updatedRows = await listRows()
                setRows(updatedRows)
            }
            setNewGroupName('')
            setNewGroupScope('all')
            setNewGroupMonthly('')
            setAddingGroup(false)
        } catch {
            toast.error('Couldn’t add the group. Please try again.')
        } finally {
            setSavingGroup(false)
        }
    }

    async function handleSaveGroupEdit(id: string) {
        if (!editGroupName.trim()) return
        try {
            const g = await updateGroup(id, { name: editGroupName.trim() })
            setGroups((prev) => prev.map((x) => (x._id === id ? g : x)))
            setEditingGroup(null)
        } catch {
            toast.error('Couldn’t rename the group.')
        }
    }

    async function handleDeleteGroup(id: string, mode: DeleteMode) {
        try {
            const updated = await deleteGroup(id, mode, month)
            if (updated) {
                // Soft delete — keep the group (now scoped out of the viewed month).
                setGroups((prev) => prev.map((g) => (g._id === id ? updated : g)))
                return
            }
            setGroups((prev) => prev.filter((g) => g._id !== id))
            setRows((prev) => prev.filter((r) => r.group !== id))
            setEntries((prev) => {
                const gone = rows.filter((r) => r.group === id).map((r) => r._id)
                return prev.filter((e) => !gone.includes(e.row))
            })
        } catch {
            toast.error('Couldn’t delete the group.')
        }
    }

    async function handleAddPot(groupId: string, name: string) {
        try {
            const pot = await createPot(groupId, name)
            setPots((prev) => [...prev, pot])
        } catch {
            toast.error("Couldn't add the pot.")
        }
    }

    async function handleRenamePot(id: string, name: string) {
        try {
            const updated = await updatePot(id, name)
            setPots((prev) => prev.map((p) => (p._id === id ? updated : p)))
        } catch {
            toast.error("Couldn't rename the pot.")
        }
    }

    async function handleDeletePot(id: string) {
        try {
            await deletePot(id)
            setPots((prev) => prev.filter((p) => p._id !== id))
            setRows((prev) => prev.map((r) => (r.pot === id ? { ...r, pot: null } : r)))
        } catch {
            toast.error("Couldn't delete the pot.")
        }
    }

    async function handleAddRow(
        groupId: string,
        name: string,
        amount: number | undefined,
        recurring: boolean,
        potId?: string
    ) {
        try {
            if (recurring === false) {
                const r = await createRow(groupId, name, undefined, false, month, undefined, potId)
                setRows((prev) => [...prev, r])
                if (amount !== undefined) {
                    const entry = await setEntry(r._id, month, amount)
                    setEntries((prev) =>
                        entry ? [...prev.filter((e) => e.row !== r._id), entry] : prev
                    )
                }
            } else {
                const r = await createRow(groupId, name, amount, true, undefined, month, potId)
                setRows((prev) => [...prev, r])
            }
            setAddingRowFor(null)
        } catch {
            toast.error("Couldn’t add the row.")
        }
    }

    async function handleSaveRowFromPot(id: string, name: string, amountStr: string) {
        const row = rows.find((x) => x._id === id)
        const trimmed = amountStr.trim()
        const parsed = trimmed !== '' && !Number.isNaN(parseFloat(trimmed)) ? parseFloat(trimmed) : null
        try {
            if (row && row.recurring === false) {
                if (name.trim() && name.trim() !== row.name) {
                    const updated = await updateRow(id, { name: name.trim() })
                    setRows((prev) => prev.map((x) => (x._id === id ? updated : x)))
                }
                await handleSetEntry(id, parsed)
            } else {
                const fields: Parameters<typeof updateRow>[1] = {}
                if (name.trim()) fields.name = name.trim()
                fields.recurringAmount = parsed
                const updated = await updateRow(id, fields)
                setRows((prev) => prev.map((x) => (x._id === id ? updated : x)))
            }
        } catch {
            toast.error("Couldn't save the row.")
        }
    }

    async function handleSaveRowEdit(id: string) {
        const row = rows.find((x) => x._id === id)
        const trimmed = editRowAmount.trim()
        const parsed =
            trimmed !== '' && !Number.isNaN(parseFloat(trimmed)) ? parseFloat(trimmed) : null

        try {
            if (row && row.recurring === false) {
                // One-time row: the amount is the month entry; the name is the only row field to update.
                if (editRowName.trim() && editRowName.trim() !== row.name) {
                    const updated = await updateRow(id, { name: editRowName.trim() })
                    setRows((prev) => prev.map((x) => (x._id === id ? updated : x)))
                }
                await handleSetEntry(id, parsed)
            } else {
                const fields: Parameters<typeof updateRow>[1] = {}
                if (editRowName.trim()) fields.name = editRowName.trim()
                fields.recurringAmount = parsed
                const updated = await updateRow(id, fields)
                setRows((prev) => prev.map((x) => (x._id === id ? updated : x)))
            }
            setEditingRow(null)
        } catch {
            toast.error('Couldn’t save the row.')
        }
    }

    async function handleDeleteRow(id: string, mode: DeleteMode) {
        try {
            const updated = await deleteRow(id, mode, month)
            if (updated) {
                // Soft delete — keep the row (now scoped out of the viewed month).
                setRows((prev) => prev.map((r) => (r._id === id ? updated : r)))
                return
            }
            setRows((prev) => prev.filter((r) => r._id !== id))
            setEntries((prev) => prev.filter((e) => e.row !== id))
        } catch {
            toast.error('Couldn’t delete the row.')
        }
    }

    // Resolve the delete dialog's choice to the right handler.
    async function handleConfirmDelete(mode: DeleteMode) {
        const target = pendingDelete
        setPendingDelete(null)
        if (!target) return
        if (target.kind === 'group') await handleDeleteGroup(target.id, mode)
        else await handleDeleteRow(target.id, mode)
    }

    async function handleToggleBudget(rowId: string, budgeted: boolean) {
        try {
            const updated = await updateRow(rowId, { budgeted })
            setRows((prev) => prev.map((r) => (r._id === rowId ? updated : r)))
        } catch {
            toast.error(budgeted ? 'Couldn’t add to Budgets.' : 'Couldn’t remove from Budgets.')
        }
    }

    async function handleSetEntry(rowId: string, amount: number | null) {
        try {
            const result = await setEntry(rowId, month, amount)
            setEntries((prev) => {
                const without = prev.filter((e) => e.row !== rowId)
                return result ? [...without, result] : without
            })
        } catch {
            toast.error('Couldn’t save that amount.')
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    // Only groups active in the viewed month are shown (month-scope lifecycle).
    const incomeGroups = monthGroups.filter((g) => g.type === 'income')
    const expenseGroups = monthGroups.filter((g) => g.type === 'expense')
    const savingsGroups = monthGroups.filter((g) => g.type === 'savings')

    return (
        <>
            {/* Header */}
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl">Finances</h1>
                    <p className="mt-1 text-sm text-neutral-500">Monthly income and expenses.</p>
                </div>
                {!addingGroup && (
                    <Button icon="fa-solid fa-plus" onClick={() => setAddingGroup(true)}>
                        New group
                    </Button>
                )}
            </header>

            {/* Month navigator */}
            <div className="mb-8 flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => setMonth((m) => addMonths(m, -1))}
                    disabled={!!(financeStartMonth && month <= financeStartMonth)}
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-30 disabled:pointer-events-none"
                >
                    <i className="fa-solid fa-chevron-left text-sm" aria-hidden="true" />
                </button>
                <span className="min-w-[160px] text-center text-base font-semibold text-neutral-900">
                    {formatMonth(month)}
                </span>
                <button
                    type="button"
                    onClick={() => setMonth((m) => addMonths(m, 1))}
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
                </button>
                {month !== currentMonth() && (
                    <button
                        type="button"
                        onClick={() => setMonth(currentMonth())}
                        className="ml-1 rounded-full px-3 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        Today
                    </button>
                )}
            </div>

            {/* Add group form */}
            {addingGroup && (
                <Card className="mb-6">
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">
                        New group
                    </h2>
                    <div className="flex flex-col gap-3">
                        <Input
                            autoFocus
                            placeholder="Group name (e.g. Fixed Expenses)"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                        />
                        <div className="flex gap-2">
                            {(['income', 'expense', 'savings'] as const).map((t) => {
                                const selected = newGroupType === t
                                const colours =
                                    t === 'income'
                                        ? selected
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-emerald-50 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600'
                                        : t === 'savings'
                                          ? selected
                                              ? 'bg-blue-100 text-blue-700'
                                              : 'bg-blue-50 text-blue-400 hover:bg-blue-100 hover:text-blue-600'
                                          : selected
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600'
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setNewGroupType(t)}
                                        className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${colours}`}
                                    >
                                        {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Monthly amount — savings only */}
                        {newGroupType === 'savings' && (
                            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 focus-within:border-neutral-950 focus-within:ring-4 focus-within:ring-neutral-950/5">
                                <span className="text-sm font-semibold text-neutral-400">£</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Monthly amount (optional)"
                                    value={newGroupMonthly}
                                    onChange={(e) => setNewGroupMonthly(e.target.value)}
                                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-neutral-900 outline-none placeholder:font-normal placeholder:text-neutral-300 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                />
                                <span className="text-sm text-neutral-400">/ mo</span>
                            </div>
                        )}

                        {/* Month scope */}
                        <Tabs
                            tabs={[`All months (from ${formatMonth(month)})`, `Just ${formatMonth(month)}`]}
                            value={newGroupScope === 'all' ? `All months (from ${formatMonth(month)})` : `Just ${formatMonth(month)}`}
                            onChange={(label) => setNewGroupScope(label.startsWith('All') ? 'all' : 'month')}
                        />

                        <div className="flex gap-2">
                            <Button
                                onClick={handleAddGroup}
                                disabled={savingGroup || !newGroupName.trim()}
                            >
                                {savingGroup ? 'Saving…' : 'Save'}
                            </Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setAddingGroup(false)
                                    setNewGroupName('')
                                    setNewGroupScope('all')
                                    setNewGroupMonthly('')
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            {/* Groups */}
            {monthGroups.length === 0 && !addingGroup ? (
                <div className="rounded-2xl border border-dashed border-neutral-200 bg-white p-12 text-center">
                    <p className="text-sm text-neutral-400">
                        {groups.length === 0
                            ? 'No groups yet. Add one to get started.'
                            : `No groups in ${formatMonth(month)}. Add one or switch months.`}
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {[...incomeGroups, ...expenseGroups, ...savingsGroups].map((group) => {
                        const groupRows = visibleRows(group)
                        const total = groupTotal(group)
                        const isIncome = group.type === 'income'
                        const isSavings = group.type === 'savings'
                        const groupRowIds = groupRows.map((r) => r._id)
                        const allPaid = groupRowIds.length > 0 && groupRowIds.every((id) => paidRows.has(id))
                        const somePaid = groupRowIds.some((id) => paidRows.has(id))
                        const leftToPay = groupRows.reduce((sum, r) => {
                            if (paidRows.has(r._id)) return sum
                            return sum + Math.abs(effectiveAmount(r))
                        }, 0)

                        const headerBg = isIncome
                            ? 'bg-emerald-50'
                            : isSavings
                              ? 'bg-blue-50'
                              : 'bg-red-50'
                        const badgeCls = isIncome
                            ? 'bg-emerald-100 text-emerald-700'
                            : isSavings
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                        const totalCls = isIncome
                            ? 'text-emerald-700'
                            : isSavings
                              ? 'text-blue-700'
                              : 'text-red-700'

                        return (
                            <div
                                key={group._id}
                                className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm transition-all duration-200 hover:shadow-md"
                            >
                                {/* Group header */}
                                <div
                                    className={`group/gh flex items-center justify-between px-5 py-4 ${headerBg}`}
                                >
                                    {editingGroup === group._id ? (
                                        <div className="flex flex-1 items-center gap-2">
                                            <Input
                                                autoFocus
                                                className="!py-1.5 !text-xs"
                                                value={editGroupName}
                                                onChange={(e) => setEditGroupName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter')
                                                        handleSaveGroupEdit(group._id)
                                                    if (e.key === 'Escape') setEditingGroup(null)
                                                }}
                                            />
                                            <Button
                                                size="sm"
                                                onClick={() => handleSaveGroupEdit(group._id)}
                                            >
                                                Save
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setEditingGroup(null)}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Left: name + total */}
                                            <div className="flex min-w-0 flex-1 items-baseline gap-3">
                                                <span className="truncate text-sm font-bold tracking-tight text-neutral-900">
                                                    {group.name}
                                                </span>
                                                <span className={`shrink-0 font-mono text-base font-bold tabular-nums tracking-tight ${totalCls}`}>
                                                    {formatMoney(total)}
                                                </span>
                                                <span className={`shrink-0 w-fit rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeCls}`}>
                                                    {group.type}
                                                </span>
                                            </div>
                                            {/* Right: hover actions + paid checkbox */}
                                            <div className="flex items-center gap-1">
                                                <div className="flex items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/gh:opacity-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditingGroup(group._id)
                                                            setEditGroupName(group.name)
                                                        }}
                                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-neutral-700"
                                                    >
                                                        <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPendingDelete({
                                                                kind: 'group',
                                                                id: group._id,
                                                                name: group.name,
                                                                scoped: true,
                                                            })
                                                        }
                                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-100 hover:text-red-500"
                                                    >
                                                        <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                                    </button>
                                                </div>
                                                {/* All paid checkbox */}
                                                <button
                                                    type="button"
                                                    title={allPaid ? 'Mark all unpaid' : 'Mark all paid'}
                                                    onClick={() => setGroupAllPaid(groupRowIds, !allPaid)}
                                                    className={[
                                                        'ml-1 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors',
                                                        allPaid
                                                            ? 'border-neutral-700 bg-neutral-700 text-white'
                                                            : somePaid
                                                              ? 'border-neutral-400 bg-neutral-200 text-neutral-400'
                                                              : 'border-neutral-300 bg-white/60 text-transparent hover:border-neutral-500',
                                                    ].join(' ')}
                                                >
                                                    <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Rows — list presentation */}
                                <div>
                                    <div className="flex flex-col divide-y divide-neutral-100 border-b border-neutral-100">
                                        {groupRows.map((row) => {
                                            const amt = entryAmount(row._id)
                                            const rowVal = effectiveAmount(row)
                                            const pct =
                                                total !== 0
                                                    ? Math.min(100, Math.abs(rowVal / total) * 100)
                                                    : 0
                                            const barCls = isIncome
                                                ? 'bg-emerald-400'
                                                : isSavings
                                                  ? 'bg-blue-400'
                                                  : 'bg-red-300'

                                            if (editingRow === row._id) {
                                                return (
                                                    <div
                                                        key={row._id}
                                                        className="flex flex-col gap-2 bg-neutral-50 px-5 py-3 sm:flex-row sm:items-center"
                                                    >
                                                        <Input
                                                            autoFocus
                                                            className="!py-1.5 !text-sm sm:flex-1"
                                                            value={editRowName}
                                                            onChange={(e) =>
                                                                setEditRowName(e.target.value)
                                                            }
                                                        />
                                                        <Input
                                                            className="!py-1.5 !text-sm sm:w-40"
                                                            type="number"
                                                            step="0.01"
                                                            placeholder={
                                                                row.recurring === false
                                                                    ? 'Amount'
                                                                    : 'Monthly amount'
                                                            }
                                                            value={editRowAmount}
                                                            onChange={(e) =>
                                                                setEditRowAmount(e.target.value)
                                                            }
                                                            onKeyDown={(e) =>
                                                                e.key === 'Enter' &&
                                                                handleSaveRowEdit(row._id)
                                                            }
                                                        />
                                                        <div className="flex gap-1">
                                                            <Button
                                                                size="sm"
                                                                onClick={() =>
                                                                    handleSaveRowEdit(row._id)
                                                                }
                                                            >
                                                                Save
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => setEditingRow(null)}
                                                            >
                                                                Cancel
                                                            </Button>
                                                        </div>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div
                                                    key={row._id}
                                                    className="group/row flex items-center gap-3 px-5 py-3 transition-colors hover:bg-neutral-50/70"
                                                >
                                                    {/* Name + meta + proportion bar */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="truncate text-sm font-semibold text-neutral-900">
                                                                {row.name}
                                                            </span>
                                                            {row.budgeted && (
                                                                <i
                                                                    className="fa-solid fa-bookmark text-[10px] text-neutral-300"
                                                                    title="In Budgets"
                                                                    aria-hidden="true"
                                                                />
                                                            )}
                                                            {row.recurring === false && (
                                                                <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                                                                    one-time
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="mt-1.5 flex items-center gap-2">
                                                            <div className="h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-neutral-100">
                                                                <div
                                                                    className={`h-full rounded-full ${barCls}`}
                                                                    style={{ width: `${pct}%` }}
                                                                />
                                                            </div>
                                                            {row.recurring !== false &&
                                                                row.recurringAmount !== undefined && (
                                                                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-400">
                                                                        £
                                                                        {formatAmount(
                                                                            row.recurringAmount
                                                                        )}
                                                                        /mo
                                                                    </span>
                                                                )}
                                                        </div>
                                                    </div>

                                                    {/* Right cluster: amount flush-right, actions slide in on hover */}
                                                    <div className="flex shrink-0 items-center justify-end">
                                                    <div className="w-28 text-right">
                                                        <AmountCell
                                                            large
                                                            value={amt}
                                                            placeholder={row.recurringAmount}
                                                            onSave={(v) =>
                                                                handleSetEntry(row._id, v)
                                                            }
                                                        />
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-0.5 overflow-hidden max-w-[160px] opacity-100 transition-all duration-200 sm:max-w-0 sm:opacity-0 sm:group-hover/row:max-w-[160px] sm:group-hover/row:opacity-100">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                navigate(
                                                                    `/finances/breakdown/${row._id}?month=${month}&recurring=${row.recurring !== false}`
                                                                )
                                                            }
                                                            title="View breakdown"
                                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                        >
                                                            <i
                                                                className="fa-solid fa-chart-pie text-xs"
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleToggleBudget(
                                                                    row._id,
                                                                    !row.budgeted
                                                                )
                                                            }
                                                            title={
                                                                row.budgeted
                                                                    ? 'Remove from Budgets'
                                                                    : 'Add to Budgets'
                                                            }
                                                            className={[
                                                                'grid h-7 w-7 place-items-center rounded-full transition-colors',
                                                                row.budgeted
                                                                    ? 'text-neutral-900 hover:bg-neutral-100'
                                                                    : 'text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500',
                                                            ].join(' ')}
                                                        >
                                                            <i
                                                                className="fa-solid fa-bookmark text-xs"
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingRow(row._id)
                                                                setEditRowName(row.name)
                                                                const current =
                                                                    row.recurring === false
                                                                        ? (amt ??
                                                                          row.recurringAmount)
                                                                        : row.recurringAmount
                                                                setEditRowAmount(
                                                                    current !== undefined
                                                                        ? String(current)
                                                                        : ''
                                                                )
                                                            }}
                                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                        >
                                                            <i
                                                                className="fa-solid fa-pen text-xs"
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                        {!isSavings && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setPendingDelete({
                                                                        kind: 'row',
                                                                        id: row._id,
                                                                        name: row.name,
                                                                        scoped:
                                                                            row.recurring !== false,
                                                                    })
                                                                }
                                                                className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                                            >
                                                                <i
                                                                    className="fa-solid fa-trash-can text-xs"
                                                                    aria-hidden="true"
                                                                />
                                                            </button>
                                                        )}
                                                    </div>
                                                    {/* Paid checkbox */}
                                                    <button
                                                        type="button"
                                                        title={paidRows.has(row._id) ? 'Mark unpaid' : 'Mark paid'}
                                                        onClick={() => togglePaid(row._id)}
                                                        className={[
                                                            'ml-2 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors',
                                                            paidRows.has(row._id)
                                                                ? 'border-neutral-700 bg-neutral-700 text-white'
                                                                : 'border-neutral-300 bg-white text-transparent hover:border-neutral-500',
                                                        ].join(' ')}
                                                    >
                                                        <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                                                    </button>
                                                    </div>
                                                </div>
                                            )
                                        })}

                                        {addingRowFor?.groupId === group._id &&
                                            !addingRowFor.potId && (
                                                <AddRowForm
                                                    month={month}
                                                    onSave={(name, amount, recurring) =>
                                                        handleAddRow(
                                                            group._id,
                                                            name,
                                                            amount,
                                                            recurring
                                                        )
                                                    }
                                                    onCancel={() => setAddingRowFor(null)}
                                                />
                                            )}
                                    </div>

                                    {/* Footer: add row / add pot + group total */}
                                    <div className="flex items-center justify-between gap-3 bg-neutral-50 px-5 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {!isSavings &&
                                                !(
                                                    addingRowFor?.groupId === group._id &&
                                                    !addingRowFor.potId
                                                ) && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        icon="fa-solid fa-plus"
                                                        onClick={() =>
                                                            setAddingRowFor({ groupId: group._id })
                                                        }
                                                    >
                                                        Add row
                                                    </Button>
                                                )}
                                            {!isSavings && (
                                                <AddPotInline
                                                    groupId={group._id}
                                                    onAdd={handleAddPot}
                                                />
                                            )}
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            {somePaid ? (
                                                <>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                                        Left to pay
                                                    </span>
                                                    <span className={`pr-2 font-mono text-sm font-bold tabular-nums tracking-tight ${totalCls}`}>
                                                        {formatMoney(leftToPay)}
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                                                        Total
                                                    </span>
                                                    <span className={`pr-2 font-mono text-sm font-bold tabular-nums tracking-tight ${totalCls}`}>
                                                        {formatMoney(total)}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Pots */}
                                {(() => {
                                    const groupPots = pots.filter((p) => p.group === group._id)
                                    if (groupPots.length === 0) return null
                                    return (
                                        <div className="flex flex-col gap-3 p-4 pt-0">
                                            {groupPots.map((pot) => (
                                                <PotCard
                                                    key={pot._id}
                                                    pot={pot}
                                                    rows={rows.filter((r) => r.pot === pot._id && rowVisibleInMonth(r, month, group))}
                                                    entries={entries}
                                                    month={month}
                                                    totalCls={totalCls}
                                                    isSavings={isSavings}
                                                    isAddingRow={addingRowFor?.potId === pot._id}
                                                    onStartAddRow={() => setAddingRowFor({ groupId: group._id, potId: pot._id })}
                                                    onCancelAddRow={() => setAddingRowFor(null)}
                                                    onSaveAddRow={(name, amount, recurring) =>
                                                        handleAddRow(group._id, name, amount, recurring, pot._id)
                                                    }
                                                    onSaveRow={handleSaveRowFromPot}
                                                    onSetEntry={handleSetEntry}
                                                    onDeleteRow={(id) => setPendingDelete({ kind: 'row', id, name: rows.find((r) => r._id === id)?.name ?? '', scoped: (rows.find((r) => r._id === id)?.recurring ?? true) !== false })}
                                                    onToggleBudget={handleToggleBudget}
                                                    onNavigate={(rowId) => navigate(`/finances/breakdown/${rowId}?month=${month}&recurring=${(rows.find((r) => r._id === rowId)?.recurring ?? true) !== false}`)}
                                                    effectiveAmount={(row) => {
                                                        const e = entries.find((en) => en.row === row._id)?.amount
                                                        return e !== undefined ? e : (row.recurringAmount ?? 0)
                                                    }}
                                                    onRename={handleRenamePot}
                                                    onDelete={handleDeletePot}
                                                />
                                            ))}
                                        </div>
                                    )
                                })()}
                            </div>
                        )
                    })}

                    {/* Net summary */}
                    {monthGroups.length > 0 && (
                        <div className="rounded-3xl border border-neutral-200 bg-neutral-950 p-6 text-white shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                                    Summary
                                </span>
                            </div>
                            <div
                                className={`mt-4 grid gap-4 ${savingsGroups.length > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
                            >
                                <div>
                                    <p className="text-[11px] font-medium text-neutral-500">Total Income</p>
                                    <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-emerald-400">
                                        {formatMoney(totalIncome)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-medium text-neutral-500">Total Expenses</p>
                                    <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-red-400">
                                        {formatMoney(totalExpense)}
                                    </p>
                                </div>
                                {savingsGroups.length > 0 && (
                                    <div>
                                        <p className="text-[11px] font-medium text-neutral-500">Total Savings</p>
                                        <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-blue-400">
                                            {formatMoney(totalSavings)}
                                        </p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-[11px] font-medium text-neutral-500">Net</p>
                                    <p
                                        className={[
                                            'mt-0.5 text-lg font-bold font-mono tabular-nums',
                                            net >= 0 ? 'text-emerald-400' : 'text-red-400',
                                        ].join(' ')}
                                    >
                                        {net >= 0 ? '+' : ''}
                                        {formatMoney(net)}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {pendingDelete && (
                <DeleteScopeDialog
                    kind={pendingDelete.kind}
                    name={pendingDelete.name}
                    monthLabel={formatMonth(month)}
                    scoped={pendingDelete.scoped}
                    onClose={() => setPendingDelete(null)}
                    onConfirm={handleConfirmDelete}
                />
            )}
        </>
    )
}
