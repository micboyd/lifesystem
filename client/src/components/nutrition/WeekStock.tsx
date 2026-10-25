import { useState } from 'react'
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
    return r.short > 0 ? `Cook ~${weight(r.short)} more` : 'Cook some'
}

/** "Need 2.8 kg · have 1.6 kg + 1.6 kg frozen". */
function needLine(r: StockRow): string {
    const need = r.needed > 0 ? `Need ${weight(r.needed)}` : 'Need some'
    const have = r.open > 0 ? `have ${weight(r.open)}` : 'have none'
    return `${need} · ${have}${r.frozen > 0 ? ` + ${weight(r.frozen)} frozen` : ''}`
}

/**
 * The week's planned plates and box notes, against what's in the pantry — a
 * small check from today to Sunday. All covered, it folds to one line.
 */
export function WeekStock({ rows }: { rows: StockRow[] }) {
    const [open, setOpen] = useState(false)
    if (rows.length === 0) return null

    const short = rows.filter((r) => r.status === 'short').length
    const thaw = rows.filter((r) => r.status === 'thaw').length
    const allOk = short === 0 && thaw === 0
    const summary = allOk
        ? 'You have enough'
        : [short > 0 && `${short} to cook`, thaw > 0 && `${thaw} to defrost`]
              .filter(Boolean)
              .join(' · ')
    const expanded = open || !allOk

    return (
        <section className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={expanded}
                disabled={!allOk}
                className="flex min-h-9 w-full items-center gap-3 text-left"
            >
                <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
                        short > 0
                            ? 'bg-amber-50 text-amber-600'
                            : thaw > 0
                              ? 'bg-sky-50 text-sky-600'
                              : 'bg-emerald-50 text-emerald-600'
                    }`}
                    aria-hidden="true"
                >
                    <i
                        className={`fa-solid ${allOk ? 'fa-check' : short > 0 ? 'fa-triangle-exclamation' : 'fa-snowflake'} text-[11px]`}
                    />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        Food for the rest of the week
                    </span>
                    <span className="block truncate text-sm font-medium text-neutral-900">
                        {summary}
                    </span>
                </span>
                {allOk && (
                    <i
                        className={`fa-solid fa-chevron-down shrink-0 text-[11px] text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                )}
            </button>
            {expanded && (
                <ul className="mt-2 divide-y divide-neutral-100 border-t border-neutral-100">
                    {rows.map((r) => (
                        <li key={r.food} className="flex items-center gap-3 py-2">
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-neutral-800">
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
            )}
        </section>
    )
}
