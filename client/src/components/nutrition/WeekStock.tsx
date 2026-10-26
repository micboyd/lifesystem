import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import type { StockRow, StockStatus } from '../../lib/weekStock'

/** "850 g", "1.6 kg". */
function weight(g: number): string {
    return g >= 1000
        ? `${(Math.round(g / 100) / 10).toLocaleString('en-GB')} kg`
        : `${Math.round(g)} g`
}

const TONE: Record<StockStatus, string> = {
    ok: 'bg-emerald-50 text-emerald-700',
    thaw: 'bg-sky-50 text-sky-700',
    short: 'bg-amber-50 text-amber-700',
}

/** What to do about it: "Enough", "Defrost ~1.2 kg", "Cook ~2.1 kg more". */
function action(r: StockRow): string {
    if (r.status === 'ok') return 'Enough'
    if (r.status === 'thaw')
        return r.needed > r.open ? `Defrost ~${weight(r.needed - r.open)}` : 'Defrost some'
    const batches = r.batches ? ` (${r.batches} batch${r.batches === 1 ? '' : 'es'})` : ''
    return r.short > 0 ? `Cook ~${weight(r.short)} more${batches}` : `Cook some${batches}`
}

/** "Need 2.8 kg · have 1.6 kg + 1.6 kg frozen". */
function needLine(r: StockRow): string {
    const need = r.needed > 0 ? `Need ${weight(r.needed)}` : 'Need some'
    const have = r.open > 0 ? `have ${weight(r.open)}` : 'have none'
    return `${need} · ${have}${r.frozen > 0 ? ` + ${weight(r.frozen)} frozen` : ''}`
}

/**
 * The week's planned meals against what's in the pantry, from today to
 * Sunday — a small chip ("2 to cook · 1 to defrost") that opens the detail,
 * with a way through to the Pantry.
 */
export function WeekStock({ rows, onOpenPantry }: { rows: StockRow[]; onOpenPantry?: () => void }) {
    const [open, setOpen] = useState(false)
    if (rows.length === 0) return null

    const short = rows.filter((r) => r.status === 'short').length
    const thaw = rows.filter((r) => r.status === 'thaw').length
    const allOk = short === 0 && thaw === 0
    const summary = allOk
        ? 'Enough food in for the week'
        : [short > 0 && `${short} to cook`, thaw > 0 && `${thaw} to defrost`]
              .filter(Boolean)
              .join(' · ')

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={`inline-flex min-h-9 items-center gap-2 self-start rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                    short > 0
                        ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                        : thaw > 0
                          ? 'bg-sky-50 text-sky-800 hover:bg-sky-100'
                          : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
            >
                <i
                    className={`fa-solid ${allOk ? 'fa-check' : short > 0 ? 'fa-fire-burner' : 'fa-snowflake'} text-[11px]`}
                    aria-hidden="true"
                />
                {summary}
                <i
                    className="fa-solid fa-chevron-right text-[10px] opacity-60"
                    aria-hidden="true"
                />
            </button>
            <Drawer
                open={open}
                onClose={() => setOpen(false)}
                title="Food for the week"
                footer={
                    onOpenPantry && (
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-box-open"
                            onClick={() => {
                                setOpen(false)
                                onOpenPantry()
                            }}
                        >
                            Open the Pantry
                        </Button>
                    )
                }
            >
                <div className="flex flex-col gap-3">
                    <p className="text-sm text-neutral-500">
                        What’s planned from today to Sunday, against what’s in the fridge and
                        freezer.
                    </p>
                    <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                        {rows.map((r) => (
                            <li key={r.food} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-neutral-800">
                                        {r.name}
                                    </span>
                                    <span className="block truncate text-xs tabular-nums text-neutral-500">
                                        {needLine(r)}
                                    </span>
                                </span>
                                <span
                                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[r.status]}`}
                                >
                                    {action(r)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </Drawer>
        </>
    )
}
