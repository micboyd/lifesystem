import { Fragment, useRef, useState, type ReactNode } from 'react'
import DropdownMenu, { type MenuEntry } from '../DropdownMenu'
import { formatAmount, formatMoney } from '../../lib/money'
import type { FinanceGroup, FinanceRow } from '../../types'

/**
 * The pieces of the Monthly sheet: one look for a group's heading, a row and a
 * pot, so rows in a pot read exactly like rows straight under a group.
 */

export type GroupType = FinanceGroup['type']

export const TYPE_DOT: Record<GroupType, string> = {
    income: 'bg-success',
    expense: 'bg-coral-500',
    savings: 'bg-brand-500',
}

export const TYPE_LABEL: Record<GroupType, string> = {
    income: 'Income',
    expense: 'Expenses',
    savings: 'Savings',
}

const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'

// ── Inline amount ─────────────────────────────────────────────────────────────

/** The row's figure for this month. Tap to override just this month. */
export function AmountCell({
    value,
    placeholder,
    muted = false,
    onSave,
}: {
    value: number | undefined
    placeholder?: number
    muted?: boolean
    onSave: (v: number | null) => void
}) {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    function startEdit() {
        const start = value ?? placeholder
        setDraft(start !== undefined ? String(start) : '')
        setEditing(true)
        setTimeout(() => inputRef.current?.select(), 0)
    }

    function commit() {
        const trimmed = draft.trim()
        if (trimmed === '') onSave(null)
        else {
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
                inputMode="decimal"
                aria-label="Amount this month"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') setEditing(false)
                }}
                className="h-9 w-full rounded-[10px] border border-neutral-900 bg-white px-2.5 text-right text-[15px] tabular-nums outline-none ring-4 ring-neutral-100"
            />
        )
    }

    const display = value ?? placeholder
    return (
        <button
            type="button"
            onClick={startEdit}
            title="Change this month's amount"
            className={[
                'h-9 w-full rounded-[10px] px-2.5 text-right text-[15px] font-medium tabular-nums transition-colors hover:bg-neutral-100',
                muted ? 'text-neutral-500' : 'text-neutral-900',
            ].join(' ')}
        >
            {display !== undefined ? `£${formatAmount(display)}` : <span className="text-neutral-300">—</span>}
        </button>
    )
}

// ── Menu trigger ──────────────────────────────────────────────────────────────

export function MoreMenu({ label, items }: { label: string; items: MenuEntry[] }) {
    return (
        <DropdownMenu
            align="right"
            items={items}
            trigger={
                <button
                    type="button"
                    aria-label={label}
                    title={label}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-ellipsis text-sm" aria-hidden="true" />
                </button>
            }
        />
    )
}

// ── Group heading ─────────────────────────────────────────────────────────────

export function GroupHeader({
    group,
    total,
    outstanding,
    showOutstanding,
    menu,
}: {
    group: FinanceGroup
    total: number
    /** What's still to pay (or still to come in, for income). */
    outstanding: number
    showOutstanding: boolean
    menu: MenuEntry[]
}) {
    const isIncome = group.type === 'income'
    return (
        <header className="flex items-center gap-3 bg-neutral-100 px-4 py-3.5 sm:px-5">
            <div className="min-w-0 flex-1">
                <p className={`flex items-center gap-1.5 ${OVERLINE}`}>
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[group.type]}`} aria-hidden="true" />
                    {TYPE_LABEL[group.type]}
                </p>
                <h2 className="mt-1 truncate text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
                    {group.name}
                </h2>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-[17px] font-semibold tabular-nums tracking-[-0.01em] text-neutral-900">
                    {formatMoney(total)}
                </p>
                {showOutstanding && (
                    <p className="text-[13px] text-neutral-500">
                        {outstanding > 0 ? (
                            <>
                                <span className="tabular-nums">{formatMoney(outstanding)}</span> {isIncome ? 'to come' : 'left'}
                            </>
                        ) : isIncome
                              ? 'All received'
                              : 'All paid'}
                    </p>
                )}
            </div>
            <MoreMenu label={`${group.name} options`} items={menu} />
        </header>
    )
}

// ── Row ───────────────────────────────────────────────────────────────────────

export function SheetRow({
    row,
    entry,
    monthlyDefault,
    paid,
    isIncome,
    onTogglePaid,
    onOpen,
    onSetEntry,
}: {
    row: FinanceRow
    /** This month's override, if any. */
    entry: number | undefined
    monthlyDefault: number | undefined
    paid: boolean
    isIncome: boolean
    onTogglePaid: () => void
    onOpen: () => void
    onSetEntry: (v: number | null) => void
}) {
    // Only say something under the name when it's worth reading.
    // Only the amount goes mono; the words stay in the body font.
    const meta: ReactNode[] = []
    if (row.recurring === false) meta.push('Just this month')
    else if (entry !== undefined && monthlyDefault !== undefined && entry !== monthlyDefault)
        meta.push(<>Usually <span className="tabular-nums">£{formatAmount(monthlyDefault)}</span></>)
    if (row.budgeted) meta.push('In Budgets')

    const paidLabel = isIncome ? (paid ? 'Mark not received' : 'Mark received') : paid ? 'Mark unpaid' : 'Mark paid'

    return (
        <li className="flex min-h-[56px] items-center gap-3 px-4 py-2 sm:px-5">
            <button
                type="button"
                role="checkbox"
                aria-checked={paid}
                aria-label={`${paidLabel}: ${row.name}`}
                title={paidLabel}
                onClick={onTogglePaid}
                className={[
                    'grid h-6 w-6 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
                    paid
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-300 text-transparent hover:border-neutral-500',
                ].join(' ')}
            >
                <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
            </button>
            <button type="button" onClick={onOpen} className="min-w-0 flex-1 py-1 text-left">
                <span
                    className={`block truncate text-[15px] ${paid ? 'text-neutral-500' : 'text-neutral-900'}`}
                >
                    {row.name}
                </span>
                {meta.length > 0 && (
                    <span className="block truncate text-[13px] text-neutral-500">
                        {meta.map((m, i) => (
                            <Fragment key={i}>
                                {i > 0 && ' · '}
                                {m}
                            </Fragment>
                        ))}
                    </span>
                )}
            </button>
            <div className="w-28 shrink-0">
                <AmountCell value={entry} placeholder={monthlyDefault} muted={paid} onSave={onSetEntry} />
            </div>
        </li>
    )
}

// ── Pot heading ───────────────────────────────────────────────────────────────

export function PotHeader({ name, total, menu }: { name: string; total: number; menu: MenuEntry[] }) {
    return (
        <div className="flex items-center gap-3 bg-neutral-50 py-1.5 pl-4 pr-4 sm:pl-5">
            <i className="fa-solid fa-layer-group w-6 text-center text-xs text-neutral-500" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-neutral-700">{name}</span>
            <span className="shrink-0 text-[13px] font-medium tabular-nums text-neutral-700">{formatMoney(total)}</span>
            <MoreMenu label={`${name} options`} items={menu} />
        </div>
    )
}
