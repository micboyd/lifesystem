import type { ReactNode } from 'react'
import DatePicker from '../DatePicker'
import { FIELD_LABEL } from '../fieldStyles'
import { formatAmount } from '../../lib/money'

/**
 * The open figures the Savings forecast tabs share (Projection, Savings to
 * date, Target planner): one big number, supporting stats, money in mono, and
 * a month picker.
 */

export const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'

/** The one big number a view leads with — no box, sits straight on the page. */
export function BigFigure({
    label,
    value,
    sub,
    tone = 'default',
}: {
    label: string
    value: ReactNode
    sub?: ReactNode
    tone?: 'default' | 'good'
}) {
    return (
        <div className="min-w-0">
            <p className={OVERLINE}>{label}</p>
            <p
                className={`mt-2 text-[40px] font-medium leading-none tracking-[-0.04em] sm:text-[52px] ${
                    tone === 'good' ? 'text-emerald-600' : 'text-neutral-950'
                }`}
            >
                {value}
            </p>
            {sub && <p className="mt-3 text-[13px] text-neutral-500">{sub}</p>}
        </div>
    )
}

/** A supporting figure under the big one, with an optional colour dot. */
export function Stat({
    label,
    value,
    sub,
    dot,
    tone = 'default',
}: {
    label: string
    value: ReactNode
    sub?: ReactNode
    dot?: string
    tone?: 'default' | 'good' | 'bad'
}) {
    return (
        <div className="min-w-0">
            <p className={`flex items-center gap-1.5 ${OVERLINE}`}>
                {dot && <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />}
                {label}
            </p>
            <p
                className={`mt-1.5 truncate text-xl font-medium tracking-[-0.03em] sm:text-2xl ${
                    tone === 'good' ? 'text-emerald-600' : tone === 'bad' ? 'text-red-600' : 'text-neutral-950'
                }`}
            >
                {value}
            </p>
            {sub && <p className="mt-0.5 truncate text-xs text-neutral-500">{sub}</p>}
        </div>
    )
}

/** Money in mono, the rest of the sentence in the body font. */
export function Money({ v, d = 0, sign = false }: { v: number; d?: number; sign?: boolean }) {
    return (
        <span className="tabular-nums">
            {sign && v > 0 ? '+' : ''}£{formatAmount(v, d)}
        </span>
    )
}

export function MonthField({
    label,
    value,
    minDate,
    maxDate,
    onChange,
}: {
    label: string
    /** ISO date string (the 1st of the chosen month). */
    value: string
    minDate?: string
    maxDate?: string
    /** Called with the 1st of the picked month. */
    onChange: (isoFirstOfMonth: string) => void
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            <label className={FIELD_LABEL}>{label}</label>
            <DatePicker
                mode="single"
                value={value}
                minDate={minDate}
                maxDate={maxDate}
                onChange={(v) => {
                    if (typeof v === 'string' && v) onChange(`${v.slice(0, 7)}-01`)
                }}
            />
        </div>
    )
}

export function monthLabelLong(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

export function monthLabelShort(ym: string) {
    const [y, m] = ym.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' })
}
