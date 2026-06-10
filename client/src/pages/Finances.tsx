import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Input from '../components/Input'
import {
    listGroups, createGroup, updateGroup, deleteGroup,
    listRows, createRow, updateRow, deleteRow,
    listEntries, setEntry,
    type AddScope,
} from '../services/finances'
import { addMonths, rowVisibleInMonth, groupVisibleInMonth, type DeleteMode } from '../lib/finance'
import DeleteScopeDialog from '../components/finance/DeleteScopeDialog'
import type { FinanceGroup, FinanceRow, FinanceEntry } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function fmt(n: number): string {
    return n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Inline amount cell ────────────────────────────────────────────────────────

interface AmountCellProps {
    value: number | undefined
    placeholder?: number
    onSave: (v: number | null) => void
}

function AmountCell({ value, placeholder, onSave }: AmountCellProps) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    function startEdit() {
        setDraft(value !== undefined ? String(value) : placeholder !== undefined ? String(placeholder) : '')
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
                className="w-full rounded-lg border border-neutral-300 bg-white px-2 py-1 text-right text-sm font-mono focus:border-neutral-950 focus:outline-none"
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
                'w-full rounded-lg px-2 py-1 text-right text-sm font-mono transition-colors hover:bg-neutral-100',
                isPlaceholder ? 'text-neutral-300' : 'text-neutral-800',
            ].join(' ')}
        >
            {display !== undefined ? fmt(display) : <span className="text-neutral-200">—</span>}
        </button>
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
            await onSave(name.trim(), n !== undefined && !Number.isNaN(n) ? n : undefined, isRecurring)
        } finally {
            setSaving(false)
        }
    }

    const monthLabel = formatMonth(month)

    return (
        <tr className="bg-neutral-50">
            <td colSpan={4} className="px-4 py-4">
                <div className="flex flex-col gap-3">
                    {/* Type toggle */}
                    <div className="flex w-fit gap-1 rounded-lg border border-neutral-200 bg-white p-1">
                        {([['recurring', 'Recurring'], ['onetime', 'One-time']] as const).map(([key, label]) => {
                            const active = (key === 'recurring') === isRecurring
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setIsRecurring(key === 'recurring')}
                                    className={[
                                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                                        active ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:text-neutral-900',
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
                            <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Finances() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [month, setMonth] = useState(() => {
        const p = searchParams.get('month')
        return p && /^\d{4}-\d{2}$/.test(p) ? p : currentMonth()
    })
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [loading, setLoading] = useState(true)

    // New group form
    const [addingGroup, setAddingGroup] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupType, setNewGroupType] = useState<'income' | 'expense' | 'savings'>('expense')
    const [newGroupScope, setNewGroupScope] = useState<AddScope>('all')
    const [savingGroup, setSavingGroup] = useState(false)

    // Delete confirmation / scope dialog
    const [pendingDelete, setPendingDelete] = useState<
        { kind: 'group' | 'row'; id: string; name: string; scoped: boolean } | null
    >(null)

    // Editing
    const [editingGroup, setEditingGroup] = useState<string | null>(null)
    const [editGroupName, setEditGroupName] = useState('')
    const [addingRowFor, setAddingRowFor] = useState<string | null>(null)
    const [editingRow, setEditingRow] = useState<string | null>(null)
    const [editRowName, setEditRowName] = useState('')
    const [editRowAmount, setEditRowAmount] = useState('')

    useEffect(() => {
        let active = true
        Promise.all([listGroups(), listRows()])
            .then(([g, r]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
            })
            .finally(() => active && setLoading(false))
        return () => { active = false }
    }, [])

    useEffect(() => {
        let active = true
        listEntries(month).then((e) => active && setEntries(e))
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

    // Rows shown in the viewed month, honouring each row's month-scope lifecycle.
    // (Group visibility is handled separately when listing the groups themselves.)
    function visibleRows(groupId: string): FinanceRow[] {
        return rows.filter((r) => r.group === groupId && rowVisibleInMonth(r, month))
    }

    function groupTotal(groupId: string): number {
        return visibleRows(groupId).reduce((sum, r) => sum + effectiveAmount(r), 0)
    }

    const totalIncome = groups
        .filter((g) => g.type === 'income')
        .reduce((sum, g) => sum + groupTotal(g._id), 0)

    const totalExpense = groups
        .filter((g) => g.type === 'expense')
        .reduce((sum, g) => sum + groupTotal(g._id), 0)

    const totalSavings = groups
        .filter((g) => g.type === 'savings')
        .reduce((sum, g) => sum + groupTotal(g._id), 0)

    const net = totalIncome - totalExpense - totalSavings

    // ── Handlers ──────────────────────────────────────────────────────────────

    async function handleAddGroup() {
        if (!newGroupName.trim()) return
        setSavingGroup(true)
        try {
            const g = await createGroup(newGroupName.trim(), newGroupType, newGroupScope, month)
            setGroups((prev) => [...prev, g])
            // Savings groups auto-create a row on the server — re-fetch so it appears
            if (g.type === 'savings') {
                const updatedRows = await listRows()
                setRows(updatedRows)
            }
            setNewGroupName('')
            setNewGroupScope('all')
            setAddingGroup(false)
        } finally {
            setSavingGroup(false)
        }
    }

    async function handleSaveGroupEdit(id: string) {
        if (!editGroupName.trim()) return
        const g = await updateGroup(id, { name: editGroupName.trim() })
        setGroups((prev) => prev.map((x) => (x._id === id ? g : x)))
        setEditingGroup(null)
    }

    async function handleDeleteGroup(id: string, mode: DeleteMode) {
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
    }

    async function handleAddRow(groupId: string, name: string, amount: number | undefined, recurring: boolean) {
        if (recurring === false) {
            // One-time rows are scoped to the viewed month; their value lives in the month entry.
            const r = await createRow(groupId, name, undefined, false, month)
            setRows((prev) => [...prev, r])
            if (amount !== undefined) {
                const entry = await setEntry(r._id, month, amount)
                setEntries((prev) => (entry ? [...prev.filter((e) => e.row !== r._id), entry] : prev))
            }
        } else {
            // Recurring rows apply from the viewed month onward (not retroactively).
            const r = await createRow(groupId, name, amount, true, undefined, month)
            setRows((prev) => [...prev, r])
        }
        setAddingRowFor(null)
    }

    async function handleSaveRowEdit(id: string) {
        const row = rows.find((x) => x._id === id)
        const trimmed = editRowAmount.trim()
        const parsed = trimmed !== '' && !Number.isNaN(parseFloat(trimmed)) ? parseFloat(trimmed) : null

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
    }

    async function handleDeleteRow(id: string, mode: DeleteMode) {
        const updated = await deleteRow(id, mode, month)
        if (updated) {
            // Soft delete — keep the row (now scoped out of the viewed month).
            setRows((prev) => prev.map((r) => (r._id === id ? updated : r)))
            return
        }
        setRows((prev) => prev.filter((r) => r._id !== id))
        setEntries((prev) => prev.filter((e) => e.row !== id))
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
        const updated = await updateRow(rowId, { budgeted })
        setRows((prev) => prev.map((r) => (r._id === rowId ? updated : r)))
    }

    async function handleSetEntry(rowId: string, amount: number | null) {
        const result = await setEntry(rowId, month, amount)
        setEntries((prev) => {
            const without = prev.filter((e) => e.row !== rowId)
            return result ? [...without, result] : without
        })
    }

    if (loading) {
        return <div className="grid place-items-center py-16"><Spinner /></div>
    }

    // Only groups active in the viewed month are shown (month-scope lifecycle).
    const monthGroups = groups.filter((g) => groupVisibleInMonth(g, month))
    const incomeGroups = monthGroups.filter((g) => g.type === 'income')
    const expenseGroups = monthGroups.filter((g) => g.type === 'expense')
    const savingsGroups = monthGroups.filter((g) => g.type === 'savings')

    return (
        <>
            {/* Header */}
            <header className="mb-8 flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Finances</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        Monthly income and expenses.
                    </p>
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
                    className="grid h-9 w-9 place-items-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
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
                <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-neutral-400">New group</h2>
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
                                const colours = t === 'income'
                                    ? selected ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-50 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600'
                                    : t === 'savings'
                                        ? selected ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-400 hover:bg-blue-100 hover:text-blue-600'
                                        : selected ? 'bg-red-100 text-red-700' : 'bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600'
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

                        {/* Month scope */}
                        <div className="flex w-fit gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1">
                            {([['all', `All months (from ${formatMonth(month)})`], ['month', `Just ${formatMonth(month)}`]] as const).map(([key, label]) => {
                                const active = newGroupScope === key
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setNewGroupScope(key)}
                                        className={[
                                            'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                                            active ? 'bg-neutral-950 text-white' : 'text-neutral-500 hover:text-neutral-900',
                                        ].join(' ')}
                                    >
                                        {label}
                                    </button>
                                )
                            })}
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={handleAddGroup} disabled={savingGroup || !newGroupName.trim()}>
                                {savingGroup ? 'Saving…' : 'Save'}
                            </Button>
                            <Button variant="ghost" onClick={() => { setAddingGroup(false); setNewGroupName(''); setNewGroupScope('all') }}>
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
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
                        const groupRows = visibleRows(group._id)
                        const total = groupTotal(group._id)
                        const isIncome = group.type === 'income'
                        const isSavings = group.type === 'savings'

                        const headerBg = isIncome ? 'bg-emerald-50' : isSavings ? 'bg-blue-50' : 'bg-red-50'
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
                            <div key={group._id} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
                                {/* Group header */}
                                <div className={`flex items-center justify-between px-4 py-3 ${headerBg}`}>
                                    {editingGroup === group._id ? (
                                        <div className="flex flex-1 items-center gap-2">
                                            <Input
                                                autoFocus
                                                className="!py-1.5 !text-xs"
                                                value={editGroupName}
                                                onChange={(e) => setEditGroupName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveGroupEdit(group._id)
                                                    if (e.key === 'Escape') setEditingGroup(null)
                                                }}
                                            />
                                            <Button size="sm" onClick={() => handleSaveGroupEdit(group._id)}>Save</Button>
                                            <Button size="sm" variant="ghost" onClick={() => setEditingGroup(null)}>Cancel</Button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center gap-2">
                                                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${badgeCls}`}>
                                                    {group.type}
                                                </span>
                                                <span className="font-bold text-neutral-900">{group.name}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className={`mr-2 text-sm font-semibold font-mono ${totalCls}`}>
                                                    {fmt(total)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingGroup(group._id); setEditGroupName(group.name) }}
                                                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-neutral-700"
                                                >
                                                    <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPendingDelete({ kind: 'group', id: group._id, name: group.name, scoped: true })}
                                                    className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-100 hover:text-red-500"
                                                >
                                                    <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Rows table */}
                                <table className="w-full table-fixed">
                                    <thead>
                                        <tr className="border-b border-neutral-100 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            <th className="py-2 pl-4 pr-2 text-left w-[40%]">Name</th>
                                            <th className="py-2 px-2 text-right w-[22%]">Recurring</th>
                                            <th className="py-2 pr-4 text-right w-[22%]">{formatMonth(month)}</th>
                                            <th className="py-2 pr-4 w-[16%]" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-100">
                                        {groupRows.map((row) => {
                                            const amt = entryAmount(row._id)
                                            return (
                                                <tr key={row._id} className="group/row">
                                                    {editingRow === row._id ? (
                                                        <>
                                                            <td className="py-1.5 pl-4 pr-2">
                                                                <Input
                                                                    autoFocus
                                                                    className="!py-1.5 !text-xs"
                                                                    value={editRowName}
                                                                    onChange={(e) => setEditRowName(e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 px-2">
                                                                <Input
                                                                    className="!py-1.5 !text-xs"
                                                                    type="number"
                                                                    step="0.01"
                                                                    placeholder={row.recurring === false ? 'Amount' : 'Monthly amount'}
                                                                    value={editRowAmount}
                                                                    onChange={(e) => setEditRowAmount(e.target.value)}
                                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveRowEdit(row._id)}
                                                                />
                                                            </td>
                                                            <td className="py-1.5 pr-4 text-right" colSpan={2}>
                                                                <div className="flex justify-end gap-1">
                                                                    <Button size="sm" onClick={() => handleSaveRowEdit(row._id)}>Save</Button>
                                                                    <Button size="sm" variant="ghost" onClick={() => setEditingRow(null)}>Cancel</Button>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="py-2 pl-4 pr-2 text-sm text-neutral-800">{row.name}</td>
                                                            <td className="py-2 px-2 text-right text-sm font-mono text-neutral-400">
                                                                {row.recurring !== false && row.recurringAmount !== undefined ? fmt(row.recurringAmount) : '—'}
                                                            </td>
                                                            <td className="py-1 pr-2 w-32">
                                                                <AmountCell
                                                                    value={amt}
                                                                    placeholder={row.recurringAmount}
                                                                    onSave={(v) => handleSetEntry(row._id, v)}
                                                                />
                                                            </td>
                                                            <td className="py-2 pr-3 text-right">
                                                                <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => navigate(`/finances/breakdown/${row._id}?month=${month}&recurring=${row.recurring !== false}`)}
                                                                        title="View breakdown"
                                                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                                    >
                                                                        <i className="fa-solid fa-chart-pie text-xs" aria-hidden="true" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleToggleBudget(row._id, !row.budgeted)}
                                                                        title={row.budgeted ? 'Remove from Budgets' : 'Add to Budgets'}
                                                                        className={[
                                                                            'grid h-7 w-7 place-items-center rounded-full transition-colors',
                                                                            row.budgeted
                                                                                ? 'text-neutral-900 hover:bg-neutral-100'
                                                                                : 'text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500',
                                                                        ].join(' ')}
                                                                    >
                                                                        <i className="fa-solid fa-bookmark text-xs" aria-hidden="true" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setEditingRow(row._id)
                                                                            setEditRowName(row.name)
                                                                            const current = row.recurring === false ? (amt ?? row.recurringAmount) : row.recurringAmount
                                                                            setEditRowAmount(current !== undefined ? String(current) : '')
                                                                        }}
                                                                        className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                                    >
                                                                        <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                                                    </button>
                                                                    {!isSavings && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setPendingDelete({ kind: 'row', id: row._id, name: row.name, scoped: row.recurring !== false })}
                                                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                                                        >
                                                                            <i className="fa-solid fa-trash-can text-xs" aria-hidden="true" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            )
                                        })}

                                        {addingRowFor === group._id && (
                                            <AddRowForm
                                                month={month}
                                                onSave={(name, amount, recurring) => handleAddRow(group._id, name, amount, recurring)}
                                                onCancel={() => setAddingRowFor(null)}
                                            />
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t border-neutral-200 bg-neutral-50">
                                            <td className="py-2 pl-4 pr-2" colSpan={2}>
                                                {!isSavings && addingRowFor !== group._id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setAddingRowFor(group._id)}
                                                        className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-700"
                                                    >
                                                        <i className="fa-solid fa-plus" aria-hidden="true" />
                                                        Add row
                                                    </button>
                                                )}
                                            </td>
                                            <td className={`py-2 pr-4 text-right text-sm font-bold font-mono ${totalCls}`}>
                                                {fmt(total)}
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )
                    })}

                    {/* Net summary */}
                    {monthGroups.length > 0 && (
                        <div className="rounded-2xl border border-neutral-200 bg-neutral-950 p-5 text-white shadow-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold uppercase tracking-wide text-neutral-400">Summary</span>
                            </div>
                            <div className={`mt-4 grid gap-4 ${savingsGroups.length > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                                <div>
                                    <p className="text-xs text-neutral-500">Total Income</p>
                                    <p className="mt-0.5 text-xl font-bold font-mono text-emerald-400">{fmt(totalIncome)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-neutral-500">Total Expenses</p>
                                    <p className="mt-0.5 text-xl font-bold font-mono text-red-400">{fmt(totalExpense)}</p>
                                </div>
                                {savingsGroups.length > 0 && (
                                    <div>
                                        <p className="text-xs text-neutral-500">Total Savings</p>
                                        <p className="mt-0.5 text-xl font-bold font-mono text-blue-400">{fmt(totalSavings)}</p>
                                    </div>
                                )}
                                <div>
                                    <p className="text-xs text-neutral-500">Net</p>
                                    <p className={[
                                        'mt-0.5 text-xl font-bold font-mono',
                                        net >= 0 ? 'text-emerald-400' : 'text-red-400',
                                    ].join(' ')}>
                                        {net >= 0 ? '+' : ''}{fmt(net)}
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
