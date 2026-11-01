import type { WeekMacros } from '../../lib/dayTotals'
import { fmt, kcal } from './format'

/** Within this share of the target either way reads as on track. */
const NEAR = 0.05

const ROWS = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
] as const

const num = (v: number, unit: string) => (unit === 'kcal' ? kcal(v) : fmt(Math.round(v)))

/**
 * The week's macros chip — the same size as the "to cook" one beside it —
 * which opens the panel underneath.
 */
export function WeekMacrosButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="inline-flex min-h-9 items-center gap-2 self-start rounded-full bg-neutral-100 px-3.5 text-[13px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-200"
        >
            <i className="fa-solid fa-chart-simple text-[11px]" aria-hidden="true" />
            Week’s macros
            <i
                className={`fa-solid fa-chevron-down text-[10px] opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
            />
        </button>
    )
}

/**
 * The week in numbers, one row per macro: where the week is on track to land
 * against its target, over a bar, with the average day and what's been eaten
 * so far under it. Empty days count at their target (lib/dayTotals).
 */
export function WeekMacrosPanel({ week }: { week: WeekMacros | null }) {
    if (!week) {
        return (
            <p className="rounded-2xl border border-neutral-200 px-4 py-3 text-sm text-neutral-500">
                Nothing planned or eaten this week yet.
            </p>
        )
    }
    const approx = week.estimated ? '~' : ''

    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 p-4">
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
                {ROWS.map(({ key, label, unit }) => {
                    const track = week.onTrack[key]
                    const target = week.weekTarget[key]
                    const avgTarget = week.averageTarget[key]
                    const gap = target ? track - target : 0
                    const near = !target || Math.abs(gap) <= target * NEAR
                    const pct = target ? Math.min(100, (track / target) * 100) : 0
                    return (
                        <div key={key} className="flex min-w-0 flex-col gap-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium text-neutral-800">{label}</span>
                                <span className="min-w-0 truncate text-xs text-neutral-500">
                                    on track to{' '}
                                    <span
                                        className={`tabular-nums font-semibold ${gap > 0 && !near ? 'text-amber-700' : 'text-neutral-900'}`}
                                    >
                                        {approx}
                                        {num(track, unit)}
                                    </span>
                                    {target ? (
                                        <>
                                            {' / '}
                                            <span className="tabular-nums">{num(target, unit)}</span>
                                        </>
                                    ) : null}{' '}
                                    {unit}
                                </span>
                            </div>
                            {target ? (
                                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                    <div
                                        className={`h-full transition-[width] duration-500 ${gap > 0 && !near ? 'bg-amber-500' : 'bg-neutral-900'}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            ) : null}
                            <div className="flex items-baseline justify-between gap-2 text-xs text-neutral-500">
                                <span className="min-w-0 truncate">
                                    avg <span className="tabular-nums text-neutral-700">{approx}{num(week.average[key], unit)}</span>
                                    {avgTarget ? <span className="tabular-nums"> / {num(avgTarget, unit)}</span> : null} a day
                                    {' · '}
                                    <span className="tabular-nums text-neutral-700">{num(week.soFar[key], unit)}</span> eaten
                                    so far
                                </span>
                                {target ? (
                                    <span
                                        className={`shrink-0 font-medium ${near ? 'text-emerald-700' : gap > 0 ? 'text-amber-700' : 'text-neutral-600'}`}
                                    >
                                        {near ? 'On track' : `${num(Math.abs(gap), unit)} ${gap > 0 ? 'over' : 'under'}`}
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    )
                })}
            </div>
            {(week.emptyDays > 0 || week.estimated) && (
                <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                    {[
                        week.emptyDays > 0 &&
                            `${week.emptyDays} day${week.emptyDays === 1 ? '' : 's'} with nothing in, counted at target.`,
                        week.estimated && '~ includes box estimates.',
                    ]
                        .filter(Boolean)
                        .join(' ')}
                </p>
            )}
        </div>
    )
}
