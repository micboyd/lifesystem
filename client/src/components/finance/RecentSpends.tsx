import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listBudgetSpends, listRows } from '../../services/finances'
import { useDataVersion } from '../../context/DataSyncContext'
import { addDays, todayKey } from '../../lib/calendar'
import { monthOf } from '../../lib/budget'
import { formatMoney } from '../../lib/money'
import { useMoneyHidden } from '../useMoneyHidden'
import type { BudgetSpend, FinanceRow } from '../../types'

/** How many of the month's spends the column lists. */
const SHOW = 14

/** "Today", "Yesterday", "Mon", or "12 Nov" further back. */
function whenLabel(date: string, today: string): string {
    if (date === today) return 'Today'
    if (date === addDays(today, -1)) return 'Yesterday'
    const d = new Date(`${date}T00:00:00`)
    if (date > addDays(today, -7)) return d.toLocaleDateString('en-GB', { weekday: 'short' })
    return `${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'short' })}`
}

/**
 * The money module's right-hand column: this month's spending as it was
 * logged, newest first, with the month's total so far.
 */
export default function RecentSpends() {
    useMoneyHidden() // re-render when money is hidden/shown
    const today = todayKey()
    const month = monthOf(today)
    const version = useDataVersion('budget')
    const [state, setState] = useState<{ spends: BudgetSpend[]; rows: FinanceRow[] } | null>(null)

    useEffect(() => {
        let active = true
        Promise.all([listBudgetSpends({ month }), listRows()])
            .then(([spends, rows]) => active && setState({ spends, rows }))
            .catch(() => active && setState({ spends: [], rows: [] }))
        return () => {
            active = false
        }
    }, [month, version])

    const rowName = useMemo(() => new Map((state?.rows ?? []).map((r) => [r._id, r.name])), [state])
    const recent = useMemo(
        () => [...(state?.spends ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, SHOW),
        [state]
    )
    const total = (state?.spends ?? []).reduce((sum, s) => sum + s.amount, 0)

    return (
        <section aria-labelledby="recent-h" className="flex min-h-0 flex-col">
            <div className="flex items-baseline justify-between gap-3">
                <h2 id="recent-h" className="text-sm font-semibold text-neutral-900">
                    Recent spending
                </h2>
                <Link to="/finances/statement" className="-my-3 inline-flex min-h-10 items-center text-[12px] font-medium text-neutral-500 hover:text-neutral-900">
                    Statement
                </Link>
            </div>
            <p className="mt-1 text-[12px] text-neutral-500">
                <span className="tabular-nums text-neutral-900">{formatMoney(total)}</span> logged this month
            </p>

            {state === null ? (
                <p className="mt-4 text-[13px] text-neutral-500">Loading…</p>
            ) : recent.length === 0 ? (
                <p className="mt-4 border-t border-hairline py-4 text-[13px] text-neutral-500">Nothing logged this month yet.</p>
            ) : (
                <ul className="mt-4">
                    {recent.map((s) => (
                        <li key={s._id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 border-t border-hairline py-2.5">
                            <span className="truncate text-[13px] font-medium text-neutral-900">
                                {s.note || rowName.get(s.row) || 'Spend'}
                            </span>
                            <span className="text-right text-[13px] tabular-nums text-neutral-900">{formatMoney(s.amount)}</span>
                            <span className="truncate text-[12px] text-neutral-500">{rowName.get(s.row) ?? 'Budget'}</span>
                            <span className="nums text-right text-[12px] text-neutral-500">{whenLabel(s.date, today)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
