import { useState } from 'react'
import type { MacroGoals } from '../../types'
import type { DayTotals } from '../../lib/dayTotals'
import { fmt, kcal } from './format'

/** Over by more than this share of the target reads as over. */
const OVER = 1.05

const MACROS = [
    { key: 'protein', label: 'Protein' },
    { key: 'carbs', label: 'Carbs' },
    { key: 'fat', label: 'Fat' },
] as const

/**
 * A day's numbers, in plain words: "2,400 of 2,850 kcal" — eaten so far (on
 * a day ahead, what's planned) against the target — and, today, "+520
 * planned" for what's still to come. One bar beneath: eaten solid, still
 * planned lighter. Protein, carbs and fat sit behind a "Macros" tap, each
 * read the same way. A
 * figure more than 5% over its target turns amber; "~" marks a plan with a
 * box note's estimate in it. Only the figures are in the number font.
 */
export function DayNumbers({
    totals,
    goals,
    compact = false,
}: {
    totals: DayTotals
    goals: MacroGoals | null
    compact?: boolean
}) {
    const [open, setOpen] = useState(false)
    const { eaten, planned, plan, planEstimated, when } = totals
    const approx = planEstimated ? '~' : ''
    const target = goals?.calories ?? 0
    const pct = (v: number) => (target > 0 ? Math.min(100, (v / target) * 100) : 0)
    const eatenPct = pct(eaten.calories)
    const plannedPct = Math.min(100 - eatenPct, pct(planned.calories))
    const over = (v: number, goal: number | undefined) => !!goal && v > goal * OVER
    // A day ahead has nothing eaten, so its headline is the plan; otherwise
    // it's what was eaten, with what's still to come beside it.
    const ahead = when === 'future'
    const lead = ahead ? plan : eaten

    if (plan.calories === 0 && eaten.calories === 0 && when !== 'today') {
        return (
            <p className="text-[13px] text-neutral-500">
                Nothing {when === 'past' ? 'logged' : 'planned'}
                {target > 0 && ` · target ${kcal(target)} kcal`}
            </p>
        )
    }

    const fig = 'tabular-nums'
    // "+520 planned": what's still to come today. Nothing on a past day — what
    // was left planned there didn't happen.
    const toCome = (v: number) =>
        when === 'today' && v > 0 ? (
            <>
                +
                <span className={fig}>
                    {approx}
                    {fmt(Math.round(v))}
                </span>{' '}
                planned
            </>
        ) : null
    // "177 of 200": eaten (or, on a day ahead, planned) against the target.
    const ofTarget = (v: number, goal: number | undefined, unit: string, strong: string) => (
        <>
            <span className={`${fig} font-semibold ${over(v, goal) ? 'text-amber-700' : strong}`}>
                {ahead ? approx : ''}
                {unit === 'kcal' ? kcal(v) : fmt(Math.round(v))}
            </span>
            {goal ? (
                <>
                    {' of '}
                    <span className={fig}>{unit === 'kcal' ? kcal(goal) : fmt(goal)}</span>
                </>
            ) : null}{' '}
            {unit}
        </>
    )

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                    <p
                        className={`min-w-0 truncate text-neutral-500 ${compact ? 'text-sm' : 'text-[15px]'}`}
                    >
                        {ofTarget(lead.calories, target || undefined, 'kcal', 'text-neutral-900')}
                    </p>
                    <span className="shrink-0 text-xs text-neutral-500">
                        {ahead ? 'planned' : (toCome(planned.calories) ?? 'eaten')}
                    </span>
                </div>
                {target > 0 && (
                    <div
                        className="flex h-1.5 overflow-hidden rounded-full bg-neutral-100"
                        role="img"
                        aria-label={`${kcal(eaten.calories)} kcal eaten, ${kcal(planned.calories)} still planned, of ${kcal(target)}`}
                    >
                        <div
                            className={`h-full transition-[width] duration-500 ${over(eaten.calories + planned.calories, target) ? 'bg-amber-500' : 'bg-neutral-900'}`}
                            style={{ width: `${eatenPct}%` }}
                        />
                        <div
                            className={`h-full transition-[width] duration-500 ${over(eaten.calories + planned.calories, target) ? 'bg-amber-300' : 'bg-neutral-400'}`}
                            style={{ width: `${plannedPct}%` }}
                        />
                    </div>
                )}
            </div>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={`inline-flex h-7 items-center gap-1.5 self-start rounded-full px-3 text-xs font-medium transition-colors ${
                    open
                        ? 'bg-neutral-900 text-white hover:bg-neutral-700'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
            >
                Macros
                <i
                    className={`fa-solid fa-chevron-down text-[9px] transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            {open && (
                <ul className="flex flex-col gap-2 rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-500">
                    {MACROS.map((m) => {
                        const goal = goals?.[m.key] || undefined
                        const more = toCome(planned[m.key])
                        return (
                            <li key={m.key} className="flex items-baseline justify-between gap-2">
                                <span className="text-neutral-700">{m.label}</span>
                                <span className="min-w-0 truncate text-right">
                                    {ofTarget(lead[m.key], goal, 'g', 'text-neutral-900')}
                                    {more && <> · {more}</>}
                                </span>
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
