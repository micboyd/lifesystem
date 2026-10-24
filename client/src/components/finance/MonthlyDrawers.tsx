import { useState, type FormEvent } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Switch from '../Switch'
import PillToggle from '../PillToggle'
import DatePicker, { type DateRange, type DatePickerValue } from '../DatePicker'
import { FIELD_LABEL } from '../fieldStyles'
import type { AddScope } from '../../services/finances'
import type { FinanceRow } from '../../types'
import type { GroupType } from './MonthlySheet'

/**
 * Every create/edit form on the Monthly sheet, each in a Drawer. A drawer stays
 * mounted so it can slide out, so each one remembers what it last showed and
 * keys its form on it to start fresh next time.
 */

function useLast<T>(value: T | null): T | null {
    const [last, setLast] = useState(value)
    if (value !== null && value !== last) setLast(value)
    return value ?? last
}

function parseAmount(s: string): number | undefined {
    const n = parseFloat(s.replace(/,/g, '').trim())
    return Number.isNaN(n) ? undefined : n
}

// ── Edit row ──────────────────────────────────────────────────────────────────

export interface RowDrawerTarget {
    row: FinanceRow
    /** The amount the field starts with: this month's for one-time, the monthly default otherwise. */
    amount: number | undefined
    canDelete: boolean
}

export function RowDrawer({
    target,
    monthLabel,
    onClose,
    onSave,
    onDelete,
    onBreakdown,
}: {
    target: RowDrawerTarget | null
    monthLabel: string
    onClose: () => void
    onSave: (row: FinanceRow, name: string, amount: string, budgeted: boolean) => void
    onDelete: (row: FinanceRow) => void
    onBreakdown: (row: FinanceRow) => void
}) {
    const shown = useLast(target)
    return (
        <Drawer open={!!target} onClose={onClose} title={shown?.row.name ?? 'Row'} badge={shown?.row.recurring === false ? 'One-time' : 'Monthly'}
            footer={shown && (
                <div className="flex w-full items-center gap-3">
                    {shown.canDelete && (
                        <Button variant="ghost" icon="fa-solid fa-trash-can" onClick={() => onDelete(shown.row)} aria-label="Delete row">
                            Delete
                        </Button>
                    )}
                    <span className="flex-1" />
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="finance-row-form">Save</Button>
                </div>
            )}
        >
            {shown && (
                <RowForm key={shown.row._id + String(!!target)} target={shown} monthLabel={monthLabel} onSave={onSave} onBreakdown={onBreakdown} />
            )}
        </Drawer>
    )
}

function RowForm({
    target,
    monthLabel,
    onSave,
    onBreakdown,
}: {
    target: RowDrawerTarget
    monthLabel: string
    onSave: (row: FinanceRow, name: string, amount: string, budgeted: boolean) => void
    onBreakdown: (row: FinanceRow) => void
}) {
    const { row } = target
    const [name, setName] = useState(row.name)
    const [amount, setAmount] = useState(target.amount !== undefined ? String(target.amount) : '')
    const [budgeted, setBudgeted] = useState(!!row.budgeted)
    const oneTime = row.recurring === false

    function submit(e: FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        onSave(row, name, amount, budgeted)
    }

    return (
        <form id="finance-row-form" onSubmit={submit} className="flex flex-col gap-5">
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
                label={oneTime ? `Amount for ${monthLabel}` : 'Monthly amount'}
                type="number"
                step="0.01"
                inputMode="decimal"
                icon="fa-solid fa-sterling-sign"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                hint={oneTime ? `Only counts in ${monthLabel}.` : 'Used every month. To change one month only, tap its amount on the sheet.'}
            />
            <div className="flex items-start justify-between gap-4 rounded-xl bg-neutral-50 px-4 py-3">
                <div>
                    <p className="text-[15px] text-neutral-900">Track in Budgets</p>
                    <p className="text-[13px] text-neutral-500">Shows on the Budgets tab and the dashboard.</p>
                </div>
                <Switch checked={budgeted} onChange={setBudgeted} />
            </div>
            <Button type="button" variant="secondary" icon="fa-solid fa-chart-pie" onClick={() => onBreakdown(row)} fullWidth>
                View breakdown
            </Button>
        </form>
    )
}

// ── Add row ───────────────────────────────────────────────────────────────────

export interface AddRowTarget {
    groupId: string
    potId?: string
    /** Where it's going, e.g. "Bills" or "Bills · Car". */
    where: string
}

export function AddRowDrawer({
    target,
    monthLabel,
    onClose,
    onSave,
}: {
    target: AddRowTarget | null
    monthLabel: string
    onClose: () => void
    onSave: (target: AddRowTarget, name: string, amount: number | undefined, recurring: boolean) => Promise<void>
}) {
    const shown = useLast(target)
    const [saving, setSaving] = useState(false)
    return (
        <Drawer open={!!target} onClose={onClose} title="Add row" badge={shown?.where}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="finance-add-row-form" disabled={saving}>{saving ? 'Adding…' : 'Add row'}</Button>
                </>
            }
        >
            {shown && (
                <AddRowForm
                    key={`${shown.groupId}-${shown.potId ?? ''}-${!!target}`}
                    monthLabel={monthLabel}
                    onSave={async (name, amount, recurring) => {
                        setSaving(true)
                        try { await onSave(shown, name, amount, recurring) } finally { setSaving(false) }
                    }}
                />
            )}
        </Drawer>
    )
}

function AddRowForm({
    monthLabel,
    onSave,
}: {
    monthLabel: string
    onSave: (name: string, amount: number | undefined, recurring: boolean) => void
}) {
    const [name, setName] = useState('')
    const [amount, setAmount] = useState('')
    const [kind, setKind] = useState<'recurring' | 'once'>('recurring')
    const recurring = kind === 'recurring'

    function submit(e: FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        onSave(name.trim(), parseAmount(amount), recurring)
    }

    return (
        <form id="finance-add-row-form" onSubmit={submit} className="flex flex-col gap-5">
            <PillToggle
                label="Row type"
                value={kind}
                onChange={setKind}
                options={[
                    { value: 'recurring', label: 'Every month' },
                    { value: 'once', label: `Just ${monthLabel}` },
                ]}
            />
            <Input label="Name" autoFocus placeholder="e.g. Rent" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
                label={recurring ? 'Monthly amount' : `Amount for ${monthLabel}`}
                type="number"
                step="0.01"
                inputMode="decimal"
                icon="fa-solid fa-sterling-sign"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                hint={recurring ? `Starts in ${monthLabel}. You can change single months on the sheet.` : `Only counts in ${monthLabel}.`}
            />
        </form>
    )
}

// ── New group ─────────────────────────────────────────────────────────────────

export interface NewGroupValues {
    name: string
    type: GroupType
    scope: AddScope
    range: DateRange
    monthly: number | undefined
}

export function NewGroupDrawer({
    open,
    month,
    monthLabel,
    onClose,
    onCreate,
}: {
    open: boolean
    month: string
    monthLabel: string
    onClose: () => void
    onCreate: (values: NewGroupValues) => Promise<boolean>
}) {
    const [saving, setSaving] = useState(false)
    return (
        <Drawer open={open} onClose={onClose} title="New group"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="finance-group-form" disabled={saving}>{saving ? 'Creating…' : 'Create group'}</Button>
                </>
            }
        >
            <NewGroupForm
                key={`${month}-${open}`}
                month={month}
                monthLabel={monthLabel}
                onCreate={async (v) => {
                    setSaving(true)
                    try { await onCreate(v) } finally { setSaving(false) }
                }}
            />
        </Drawer>
    )
}

function NewGroupForm({
    month,
    monthLabel,
    onCreate,
}: {
    month: string
    monthLabel: string
    onCreate: (values: NewGroupValues) => void
}) {
    const [name, setName] = useState('')
    const [type, setType] = useState<GroupType>('expense')
    const [scope, setScope] = useState<AddScope>('all')
    const [range, setRange] = useState<DateRange>({ start: month, end: month })
    const [monthly, setMonthly] = useState('')

    function submit(e: FormEvent) {
        e.preventDefault()
        if (!name.trim()) return
        const m = parseAmount(monthly)
        onCreate({ name: name.trim(), type, scope, range, monthly: m !== undefined && m > 0 ? m : undefined })
    }

    return (
        <form id="finance-group-form" onSubmit={submit} className="flex flex-col gap-5">
            <Input label="Name" autoFocus placeholder="e.g. Fixed expenses" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Type</span>
                <PillToggle
                    label="Group type"
                    value={type}
                    onChange={setType}
                    options={[
                        { value: 'income', label: 'Income' },
                        { value: 'expense', label: 'Expenses' },
                        { value: 'savings', label: 'Savings' },
                    ]}
                />
            </div>
            {type === 'savings' && (
                <Input
                    label="Monthly amount"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    icon="fa-solid fa-sterling-sign"
                    placeholder="Optional"
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                />
            )}
            <div className="flex flex-col gap-1.5">
                <span className={FIELD_LABEL}>Months</span>
                <PillToggle
                    label="Which months"
                    value={scope}
                    onChange={setScope}
                    options={[
                        { value: 'all', label: `From ${monthLabel} on` },
                        { value: 'month', label: `Just ${monthLabel}` },
                        { value: 'range', label: 'A range' },
                    ]}
                />
            </div>
            {scope === 'range' && (
                <DatePicker
                    mode="range"
                    precision="month"
                    clearable={false}
                    value={range}
                    onChange={(v: DatePickerValue) => {
                        if (v && typeof v === 'object' && 'start' in v) {
                            // Mid-selection the end comes back empty; treat it
                            // as a single month until the second click lands.
                            setRange({ start: v.start, end: v.end || v.start })
                        }
                    }}
                />
            )}
        </form>
    )
}

// ── Name only (rename group / pot, new pot) ───────────────────────────────────

export interface NameDrawerTarget {
    title: string
    label: string
    initial: string
    saveLabel: string
    onSave: (name: string) => Promise<void>
}

export function NameDrawer({ target, onClose }: { target: NameDrawerTarget | null; onClose: () => void }) {
    const shown = useLast(target)
    const [name, setName] = useState('')
    const [saving, setSaving] = useState(false)
    const [openedFor, setOpenedFor] = useState<NameDrawerTarget | null>(null)
    // Reset the field each time a new target opens.
    if (target && target !== openedFor) {
        setOpenedFor(target)
        setName(target.initial)
    }

    async function submit(e: FormEvent) {
        e.preventDefault()
        if (!shown || !name.trim()) return
        setSaving(true)
        try { await shown.onSave(name.trim()) } finally { setSaving(false) }
    }

    return (
        <Drawer open={!!target} onClose={onClose} title={shown?.title}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="finance-name-form" disabled={saving || !name.trim()}>{shown?.saveLabel ?? 'Save'}</Button>
                </>
            }
        >
            <form id="finance-name-form" onSubmit={submit}>
                <Input label={shown?.label ?? 'Name'} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </form>
        </Drawer>
    )
}
