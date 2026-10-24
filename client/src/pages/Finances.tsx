import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import { Card } from '../components/Card'
import ConfirmModal from '../components/ConfirmModal'
import type { MenuEntry } from '../components/DropdownMenu'
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
} from '../services/finances'
import { listSavingsTargets } from '../services/savingsTargets'
import {
    addMonths,
    rowVisibleInMonth,
    groupVisibleInMonth,
    recurringAmountForMonth,
    type DeleteMode,
    type AmountScope,
} from '../lib/finance'
import { formatMoney } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { useToast } from '../context/ToastContext'
import { useInvalidate } from '../context/DataSyncContext'
import { useAuth } from '../context/AuthContext'
import DeleteScopeDialog from '../components/finance/DeleteScopeDialog'
import AmountScopeDialog from '../components/finance/AmountScopeDialog'
import { GroupHeader, PotHeader, SheetRow } from '../components/finance/MonthlySheet'
import {
    AddRowDrawer,
    NameDrawer,
    NewGroupDrawer,
    RowDrawer,
    type AddRowTarget,
    type NameDrawerTarget,
    type NewGroupValues,
    type RowDrawerTarget,
} from '../components/finance/MonthlyDrawers'
import type { FinanceGroup, FinancePot, FinanceRow, FinanceEntry, SavingsTarget } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentMonth(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMonth(ym: string): string {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

// The hero sits on ink, so its labels use the lighter stone.
const HERO_OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400'

function MonthArrow({ dir, onClick, disabled = false }: { dir: 'prev' | 'next'; onClick: () => void; disabled?: boolean }) {
    const label = dir === 'prev' ? 'Previous month' : 'Next month'
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-neutral-200 transition-colors hover:bg-white/20 hover:text-white disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9"
        >
            <i className={`fa-solid ${dir === 'prev' ? 'fa-chevron-left' : 'fa-chevron-right'} text-xs`} aria-hidden="true" />
        </button>
    )
}

function Figure({ label, dot, value }: { label: string; dot: string; value: number }) {
    return (
        <div className="min-w-0">
            <p className={`flex items-center gap-1.5 ${HERO_OVERLINE}`}>
                <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
                {label}
            </p>
            <p className="mt-1.5 truncate text-xl font-medium tabular-nums tracking-[-0.03em] text-white sm:text-2xl">
                {formatMoney(value, 0)}
            </p>
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Finances() {
    useMoneyHidden() // re-render this subtree when money is hidden/shown
    const navigate = useNavigate()
    const toast = useToast()
    const invalidate = useInvalidate()
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
    const [savingsTargets, setSavingsTargets] = useState<SavingsTarget[]>([])
    const [loading, setLoading] = useState(true)
    const [paidRows, setPaidRows] = useState<Set<string>>(new Set())

    // Drawers
    const [newGroupOpen, setNewGroupOpen] = useState(false)
    const [rowDrawer, setRowDrawer] = useState<RowDrawerTarget | null>(null)
    const [addRowTarget, setAddRowTarget] = useState<AddRowTarget | null>(null)
    const [nameDrawer, setNameDrawer] = useState<NameDrawerTarget | null>(null)
    const [potToDelete, setPotToDelete] = useState<FinancePot | null>(null)

    // Delete confirmation / scope dialog
    const [pendingDelete, setPendingDelete] = useState<{
        kind: 'group' | 'row'
        id: string
        name: string
        scoped: boolean
    } | null>(null)

    // Recurring-amount scope dialog: a pending row update waiting on the user to
    // pick "all months" vs "from this month onwards".
    const [pendingAmountEdit, setPendingAmountEdit] = useState<{
        id: string
        name: string
        fields: { name?: string; recurringAmount: number | null }
    } | null>(null)

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
        // Advisory only — the sheet still works if plans fail to load.
        listSavingsTargets()
            .then((t) => active && setSavingsTargets(t))
            .catch(() => {})
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
        return e !== undefined ? e : (recurringAmountForMonth(row, month) ?? 0)
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

    function typeTotal(type: FinanceGroup['type']): number {
        return monthGroups.filter((g) => g.type === type).reduce((sum, g) => sum + groupTotal(g), 0)
    }

    const totalIncome = typeTotal('income')
    const totalExpense = typeTotal('expense')
    const totalSavings = typeTotal('savings')
    const net = totalIncome - totalExpense - totalSavings

    // What's owed this month (expenses + savings) and how much is ticked off.
    const outgoingRows = monthGroups.filter((g) => g.type !== 'income').flatMap((g) => visibleRows(g))
    const totalOwed = outgoingRows.reduce((sum, r) => sum + Math.abs(effectiveAmount(r)), 0)
    const totalPaid = outgoingRows
        .filter((r) => paidRows.has(r._id))
        .reduce((sum, r) => sum + Math.abs(effectiveAmount(r)), 0)
    const leftToPay = totalOwed - totalPaid
    const paidPct = totalOwed > 0 ? Math.min(100, (totalPaid / totalOwed) * 100) : 0

    // Savings plans (from the Forecast target planner) that expect a
    // contribution in the viewed month. Drives the advisory line below.
    const activePlans = savingsTargets.filter(
        (t) =>
            !t.onTrack &&
            t.requiredMonthly > 0 &&
            t.startMonth <= month &&
            month <= t.targetMonth
    )
    const plannedSavings = activePlans.reduce((s, t) => s + t.requiredMonthly, 0)
    // requiredMonthly is a solved division, so it's almost always fractional.
    // Only warn when the gap survives whole-pound rounding — otherwise a 30p
    // gap shows an amber "£0 short".
    const savingsShortfall = plannedSavings - totalSavings
    const savingsShort = savingsShortfall >= 0.5

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

    async function handleAddGroup({ name, type, scope, range, monthly }: NewGroupValues): Promise<boolean> {
        try {
            const extra = type === 'savings' && monthly !== undefined ? { recurringAmount: monthly } : undefined
            const g =
                scope === 'range'
                    ? await createGroup(name, type, 'range', range.start, extra, range.end)
                    : await createGroup(name, type, scope, month, extra)
            setGroups((prev) => [...prev, g])
            if (scope === 'range' && (month < range.start || month > range.end)) {
                toast.show(`Added for ${formatMonth(range.start)} to ${formatMonth(range.end)}.`, 'success')
            }
            // Savings groups auto-create a row on the server — re-fetch so it appears
            if (g.type === 'savings') {
                const updatedRows = await listRows()
                setRows(updatedRows)
            }
            setNewGroupOpen(false)
            return true
        } catch {
            toast.error('Couldn’t add the group. Please try again.')
            return false
        }
    }

    async function handleRenameGroup(id: string, name: string) {
        try {
            const g = await updateGroup(id, { name })
            setGroups((prev) => prev.map((x) => (x._id === id ? g : x)))
            setNameDrawer(null)
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
            setNameDrawer(null)
        } catch {
            toast.error("Couldn't add the pot.")
        }
    }

    async function handleRenamePot(id: string, name: string) {
        try {
            const updated = await updatePot(id, name)
            setPots((prev) => prev.map((p) => (p._id === id ? updated : p)))
            setNameDrawer(null)
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
        target: AddRowTarget,
        name: string,
        amount: number | undefined,
        recurring: boolean
    ) {
        const { groupId, potId } = target
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
            setAddRowTarget(null)
        } catch {
            toast.error("Couldn’t add the row.")
        }
    }

    // Save a recurring row's name/amount. When the amount changed and the row has
    // earlier months, stash the update and ask for a scope (all / onward) first.
    async function saveRecurringRowEdit(row: FinanceRow, name: string, parsed: number | null) {
        const fields: Parameters<typeof updateRow>[1] = {}
        if (name.trim() && name.trim() !== row.name) fields.name = name.trim()
        const current = recurringAmountForMonth(row, month) ?? null
        if (parsed !== current) {
            fields.recurringAmount = parsed
            const hasEarlierMonths = !row.startMonth || row.startMonth < month
            if (hasEarlierMonths) {
                setPendingAmountEdit({
                    id: row._id,
                    name: row.name,
                    fields: { ...fields, recurringAmount: parsed },
                })
                return
            }
            // No months before this one — nothing to scope.
            fields.amountScope = 'all'
        }
        if (Object.keys(fields).length === 0) return
        const updated = await updateRow(row._id, fields)
        setRows((prev) => prev.map((x) => (x._id === row._id ? updated : x)))
    }

    async function handleConfirmAmountScope(scope: AmountScope) {
        const pending = pendingAmountEdit
        if (!pending) return
        setPendingAmountEdit(null)
        try {
            const updated = await updateRow(pending.id, {
                ...pending.fields,
                amountScope: scope,
                month,
            })
            setRows((prev) => prev.map((x) => (x._id === pending.id ? updated : x)))
        } catch {
            toast.error("Couldn't save the row.")
        }
    }

    async function handleSaveRow(row: FinanceRow, name: string, amountStr: string, budgeted: boolean) {
        setRowDrawer(null)
        const trimmed = amountStr.trim()
        const parsed = trimmed !== '' && !Number.isNaN(parseFloat(trimmed)) ? parseFloat(trimmed) : null
        if (budgeted !== !!row.budgeted) await handleToggleBudget(row._id, budgeted)
        try {
            if (row.recurring === false) {
                if (name.trim() && name.trim() !== row.name) {
                    const updated = await updateRow(row._id, { name: name.trim() })
                    setRows((prev) => prev.map((x) => (x._id === row._id ? updated : x)))
                }
                await handleSetEntry(row._id, parsed)
            } else {
                await saveRecurringRowEdit(row, name, parsed)
            }
        } catch {
            toast.error("Couldn't save the row.")
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
            // Let the dashboard's budget widgets/insights pick up the change.
            invalidate('budget')
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

    function openRow(row: FinanceRow, isSavings: boolean) {
        setRowDrawer({
            row,
            amount: row.recurring === false
                ? (entryAmount(row._id) ?? row.recurringAmount)
                : recurringAmountForMonth(row, month),
            canDelete: !isSavings,
        })
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const monthLabel = formatMonth(month)
    const isCurrent = month === currentMonth()
    // Income first, then what goes out, then what's put away.
    const orderedGroups = (['income', 'expense', 'savings'] as const).flatMap((t) =>
        monthGroups.filter((g) => g.type === t)
    )

    function renderRows(list: FinanceRow[], group: FinanceGroup) {
        const isSavings = group.type === 'savings'
        return (
            <ul className="divide-y divide-neutral-100">
                {list.map((row) => (
                    <SheetRow
                        key={row._id}
                        row={row}
                        entry={entryAmount(row._id)}
                        monthlyDefault={recurringAmountForMonth(row, month)}
                        paid={paidRows.has(row._id)}
                        isIncome={group.type === 'income'}
                        onTogglePaid={() => togglePaid(row._id)}
                        onOpen={() => openRow(row, isSavings)}
                        onSetEntry={(v) => handleSetEntry(row._id, v)}
                    />
                ))}
            </ul>
        )
    }

    return (
        <>
            {/* Hero — the month and where it lands, before any detail */}
            <section className="mb-4 rounded-3xl bg-neutral-900 p-5 text-neutral-50 sm:p-7">
                <div className="flex items-center gap-3">
                    <div className="flex shrink-0 items-center gap-1.5">
                        <MonthArrow
                            dir="prev"
                            onClick={() => setMonth((m) => addMonths(m, -1))}
                            disabled={!!(financeStartMonth && month <= financeStartMonth)}
                        />
                        <MonthArrow dir="next" onClick={() => setMonth((m) => addMonths(m, 1))} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-[22px]">
                            {monthLabel}
                        </h1>
                        <p className="truncate text-[13px] text-neutral-400">
                            {isCurrent ? 'This month' : (
                                <button
                                    type="button"
                                    onClick={() => setMonth(currentMonth())}
                                    className="font-medium text-white underline underline-offset-4"
                                >
                                    Back to this month
                                </button>
                            )}
                        </p>
                    </div>
                    <Button icon="fa-solid fa-plus" onClick={() => setNewGroupOpen(true)} aria-label="New group">
                        <span className="hidden sm:inline">New group</span>
                    </Button>
                </div>

                {monthGroups.length > 0 && (
                    <div className="mt-7 grid grid-cols-3 gap-x-4 gap-y-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:items-end">
                        <div className="col-span-3 lg:col-span-1">
                            <p className={HERO_OVERLINE}>Left over</p>
                            <p className="mt-2 text-[40px] font-medium leading-none tracking-[-0.04em] tabular-nums text-white">
                                {net > 0 ? '+' : ''}
                                {formatMoney(net, 0)}
                            </p>
                            <p className="mt-2 text-[13px] text-neutral-400">
                                {net < 0 ? (
                                    <span className="inline-flex rounded-full bg-coral-500/20 px-2 py-0.5 text-xs font-medium text-coral-300">
                                        More going out than coming in
                                    </span>
                                ) : (
                                    'After expenses and savings'
                                )}
                            </p>
                        </div>
                        <Figure label="In" dot="bg-emerald-400" value={totalIncome} />
                        <Figure label="Out" dot="bg-coral-400" value={totalExpense} />
                        <Figure label="Saved" dot="bg-brand-400" value={totalSavings} />
                    </div>
                )}

                {totalOwed > 0 && (
                    <div className="mt-6 border-t border-white/10 pt-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="text-[15px] text-neutral-100">
                                {leftToPay > 0 ? (
                                    <>
                                        <span className="font-medium tabular-nums text-white">{formatMoney(leftToPay)}</span> left to pay
                                    </>
                                ) : (
                                    'Everything’s paid'
                                )}
                            </p>
                            <p className="text-[13px] text-neutral-400">
                                <span className="tabular-nums">{formatMoney(totalPaid, 0)}</span> of{' '}
                                <span className="tabular-nums">{formatMoney(totalOwed, 0)}</span> paid
                            </p>
                        </div>
                        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/15">
                            <div
                                className="h-full rounded-full bg-white transition-all duration-300"
                                style={{ width: `${paidPct}%` }}
                            />
                        </div>
                    </div>
                )}
            </section>

            {/* Savings plan advisory — what your saved plans expect this month */}
            {activePlans.length > 0 && (
                <div
                    className={[
                        'mb-4 flex items-center gap-3 rounded-2xl px-4 py-3',
                        savingsShort ? 'bg-warning-bg' : 'bg-neutral-100',
                    ].join(' ')}
                >
                    <i
                        className={[
                            'fa-solid w-4 shrink-0 text-center text-sm',
                            savingsShort ? 'fa-triangle-exclamation text-warning' : 'fa-piggy-bank text-neutral-500',
                        ].join(' ')}
                        aria-hidden="true"
                    />
                    <p className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-700">
                        <span className="font-medium text-neutral-900">
                            {activePlans.length === 1 ? `${activePlans[0].name} expects` : `Your ${activePlans.length} savings plans expect`}{' '}
                            <span className="tabular-nums">{formatMoney(plannedSavings, 0)}</span> saved this month.
                        </span>{' '}
                        {savingsShort ? (
                            <>
                                This sheet is <span className="tabular-nums">{formatMoney(savingsShortfall, 0)}</span> short.
                            </>
                        ) : (
                            'This sheet covers it.'
                        )}
                    </p>
                    <Button size="sm" variant="ghost" onClick={() => navigate('/finances/forecast')}>
                        Plans
                    </Button>
                </div>
            )}

            {/* Groups */}
            {monthGroups.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-neutral-300 px-6 py-12 text-center">
                    <p className="text-[15px] text-neutral-500">
                        {groups.length === 0
                            ? 'No groups yet. Start with your income, then your bills.'
                            : `Nothing set up for ${monthLabel}.`}
                    </p>
                    <Button className="mt-4" variant="secondary" icon="fa-solid fa-plus" onClick={() => setNewGroupOpen(true)}>
                        New group
                    </Button>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {orderedGroups.map((group) => {
                        const groupRows = visibleRows(group)
                        const total = groupTotal(group)
                        const isIncome = group.type === 'income'
                        const isSavings = group.type === 'savings'
                        const groupRowIds = groupRows.map((r) => r._id)
                        const allPaid = groupRowIds.length > 0 && groupRowIds.every((id) => paidRows.has(id))
                        const somePaid = groupRowIds.some((id) => paidRows.has(id))
                        const outstanding = groupRows.reduce(
                            (sum, r) => (paidRows.has(r._id) ? sum : sum + Math.abs(effectiveAmount(r))),
                            0
                        )
                        const groupPots = pots.filter((p) => p.group === group._id)
                        const potIds = new Set(groupPots.map((p) => p._id))
                        const looseRows = groupRows.filter((r) => !r.pot || !potIds.has(r.pot))

                        const menu: MenuEntry[] = [
                            ...(!isSavings
                                ? [
                                      { label: 'Add row', icon: 'fa-solid fa-plus', onClick: () => setAddRowTarget({ groupId: group._id, where: group.name }) },
                                      {
                                          label: 'Add pot',
                                          icon: 'fa-solid fa-layer-group',
                                          onClick: () =>
                                              setNameDrawer({
                                                  title: 'New pot',
                                                  label: 'Pot name',
                                                  initial: '',
                                                  saveLabel: 'Add pot',
                                                  onSave: (name) => handleAddPot(group._id, name),
                                              }),
                                      },
                                  ]
                                : []),
                            ...(groupRowIds.length > 0
                                ? [{
                                      label: allPaid
                                          ? isIncome ? 'Mark all not received' : 'Mark all unpaid'
                                          : isIncome ? 'Mark all received' : 'Mark all paid',
                                      icon: allPaid ? 'fa-regular fa-circle' : 'fa-solid fa-circle-check',
                                      onClick: () => setGroupAllPaid(groupRowIds, !allPaid),
                                  }]
                                : []),
                            {
                                label: 'Rename',
                                icon: 'fa-solid fa-pen',
                                onClick: () =>
                                    setNameDrawer({
                                        title: 'Rename group',
                                        label: 'Group name',
                                        initial: group.name,
                                        saveLabel: 'Save',
                                        onSave: (name) => handleRenameGroup(group._id, name),
                                    }),
                            },
                            'divider',
                            {
                                label: 'Delete group',
                                icon: 'fa-solid fa-trash-can',
                                danger: true,
                                onClick: () => setPendingDelete({ kind: 'group', id: group._id, name: group.name, scoped: true }),
                            },
                        ]

                        return (
                            <Card key={group._id} as="section" flush hover={false} className="overflow-hidden">
                                <GroupHeader
                                    group={group}
                                    total={total}
                                    outstanding={outstanding}
                                    showOutstanding={somePaid}
                                    menu={menu}
                                />

                                {looseRows.length > 0 && (
                                    <div className="border-t border-neutral-100">{renderRows(looseRows, group)}</div>
                                )}

                                {groupPots.map((pot) => {
                                    const potRows = groupRows.filter((r) => r.pot === pot._id)
                                    const potTotal = potRows.reduce((s, r) => s + effectiveAmount(r), 0)
                                    return (
                                        <div key={pot._id} className="border-t border-neutral-100">
                                            <PotHeader
                                                name={pot.name}
                                                total={potTotal}
                                                menu={[
                                                    ...(!isSavings
                                                        ? [{ label: 'Add row', icon: 'fa-solid fa-plus', onClick: () => setAddRowTarget({ groupId: group._id, potId: pot._id, where: `${group.name} · ${pot.name}` }) }]
                                                        : []),
                                                    {
                                                        label: 'Rename',
                                                        icon: 'fa-solid fa-pen',
                                                        onClick: () =>
                                                            setNameDrawer({
                                                                title: 'Rename pot',
                                                                label: 'Pot name',
                                                                initial: pot.name,
                                                                saveLabel: 'Save',
                                                                onSave: (name) => handleRenamePot(pot._id, name),
                                                            }),
                                                    },
                                                    'divider',
                                                    { label: 'Delete pot', icon: 'fa-solid fa-trash-can', danger: true, onClick: () => setPotToDelete(pot) },
                                                ]}
                                            />
                                            {potRows.length > 0 ? (
                                                renderRows(potRows, group)
                                            ) : (
                                                <p className="px-4 py-3 pl-[3.25rem] text-[13px] text-neutral-500 sm:pl-14">Nothing in this pot yet.</p>
                                            )}
                                        </div>
                                    )
                                })}

                                {groupRows.length === 0 && groupPots.length === 0 && (
                                    <p className="border-t border-neutral-100 px-4 py-4 text-[13px] text-neutral-500 sm:px-5">
                                        No rows in {monthLabel}.
                                    </p>
                                )}

                                {!isSavings && (
                                    <div className="border-t border-neutral-100 px-2 py-1.5 sm:px-3">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            icon="fa-solid fa-plus"
                                            onClick={() => setAddRowTarget({ groupId: group._id, where: group.name })}
                                        >
                                            Add row
                                        </Button>
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            )}

            <NewGroupDrawer
                open={newGroupOpen}
                month={month}
                monthLabel={monthLabel}
                onClose={() => setNewGroupOpen(false)}
                onCreate={handleAddGroup}
            />

            <RowDrawer
                target={rowDrawer}
                monthLabel={monthLabel}
                onClose={() => setRowDrawer(null)}
                onSave={handleSaveRow}
                onDelete={(row) => {
                    setRowDrawer(null)
                    setPendingDelete({ kind: 'row', id: row._id, name: row.name, scoped: row.recurring !== false })
                }}
                onBreakdown={(row) =>
                    navigate(`/finances/breakdown/${row._id}?month=${month}&recurring=${row.recurring !== false}`)
                }
            />

            <AddRowDrawer
                target={addRowTarget}
                monthLabel={monthLabel}
                onClose={() => setAddRowTarget(null)}
                onSave={handleAddRow}
            />

            <NameDrawer target={nameDrawer} onClose={() => setNameDrawer(null)} />

            <ConfirmModal
                open={!!potToDelete}
                title="Delete pot?"
                message={`“${potToDelete?.name ?? ''}” goes, but its rows stay in the group.`}
                confirmLabel="Delete pot"
                danger
                onClose={() => setPotToDelete(null)}
                onConfirm={() => potToDelete && handleDeletePot(potToDelete._id)}
            />

            {pendingDelete && (
                <DeleteScopeDialog
                    kind={pendingDelete.kind}
                    name={pendingDelete.name}
                    monthLabel={monthLabel}
                    scoped={pendingDelete.scoped}
                    onClose={() => setPendingDelete(null)}
                    onConfirm={handleConfirmDelete}
                />
            )}

            {pendingAmountEdit && (
                <AmountScopeDialog
                    name={pendingAmountEdit.name}
                    monthLabel={monthLabel}
                    onClose={() => setPendingAmountEdit(null)}
                    onConfirm={handleConfirmAmountScope}
                />
            )}
        </>
    )
}
