import type { MacroGoals } from '../../types'
import type { DayTotals } from '../../lib/dayTotals'
import { fmt, kcal } from './format'

const WHEN_LABEL: Record<DayTotals['when'], string> = {
    future: 'planned',
    today: 'so far + planned',
    past: 'eaten',
}

/** Over by more than this share of the target reads as over. */
const OVER = 1.05

/**
 * A day's one set of numbers: calories against the target with a bar —
 * eaten solid, still planned lighter — and protein, carbs and fat beneath,
 * each against its own target. "~" when a box note's estimate is in it.
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
    const { eaten, planned, total, estimated, when } = totals
    const approx = estimated ? '~' : ''
    const target = goals?.calories ?? 0
    const over = target > 0 && total.calories > target * OVER
    const pct = (v: number) => (target > 0 ? Math.min(100, (v / target) * 100) : 0)
    const eatenPct = pct(eaten.calories)
    const plannedPct = Math.min(100 - eatenPct, pct(planned.calories))

    if (total.calories === 0 && when !== 'today') {
        return (
            <p className="text-[13px] text-neutral-500">
                Nothing {when === 'past' ? 'logged' : 'planned'}
                {target > 0 && ` · aim ${kcal(target)} kcal`}
            </p>
        )
    }

    const macros = [
        { key: 'protein', short: 'P', value: total.protein, goal: goals?.protein },
        { key: 'carbs', short: 'C', value: total.carbs, goal: goals?.carbs },
        { key: 'fat', short: 'F', value: total.fat, goal: goals?.fat },
    ] as const

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
                <p
                    className={`min-w-0 truncate tabular-nums ${compact ? 'text-sm' : 'text-[15px]'}`}
                >
                    <span
                        className={`font-semibold ${over ? 'text-amber-700' : 'text-neutral-900'}`}
                    >
                        {approx}
                        {kcal(total.calories)}
                    </span>
                    <span className="text-neutral-500">
                        {target > 0 && ` / ${kcal(target)}`} kcal
                    </span>
                </p>
                {!compact && (
                    <span className="shrink-0 text-xs text-neutral-500">{WHEN_LABEL[when]}</span>
                )}
            </div>
            {target > 0 && (
                <div
                    className="flex h-1.5 overflow-hidden rounded-full bg-neutral-100"
                    role="img"
                    aria-label={`${kcal(eaten.calories)} kcal eaten, ${kcal(planned.calories)} planned, of ${kcal(target)}`}
                >
                    <div
                        className={`h-full transition-[width] duration-500 ${over ? 'bg-amber-500' : 'bg-neutral-900'}`}
                        style={{ width: `${eatenPct}%` }}
                    />
                    <div
                        className={`h-full transition-[width] duration-500 ${over ? 'bg-amber-300' : 'bg-neutral-400'}`}
                        style={{ width: `${plannedPct}%` }}
                    />
                </div>
            )}
            <p
                className={`grid grid-cols-3 gap-1 tabular-nums text-neutral-500 ${compact ? 'text-[11px]' : 'text-xs'}`}
            >
                {macros.map((m) => (
                    <span key={m.key} className="truncate">
                        <span className="font-semibold text-neutral-800">
                            {fmt(Math.round(m.value))}
                        </span>
                        {m.goal ? `/${fmt(m.goal)}` : ''} {m.short}
                    </span>
                ))}
            </p>
        </div>
    )
}
