import type { MacroGoals } from '../../types'
import type { DayTotals } from '../../lib/dayTotals'
import { kcal } from './format'

const ROWS = [
    { key: 'calories', label: 'Calories', unit: 'kcal' },
    { key: 'protein', label: 'Protein', unit: 'g' },
    { key: 'carbs', label: 'Carbs', unit: 'g' },
    { key: 'fat', label: 'Fat', unit: 'g' },
] as const

type Key = (typeof ROWS)[number]['key']

const show = (key: Key, n: number) => (key === 'calories' ? kcal(n) : Math.round(n).toLocaleString('en-GB'))

/**
 * The week's macros at a glance: each day's target added up over the seven
 * days, what one day asks for, and what's planned so far. Sits inside the
 * planner's folding "This week's macros" section.
 */
export default function WeekTargets({ weekDays }: { weekDays: { totals: DayTotals; goals: MacroGoals | null }[] }) {
    const rows = ROWS.flatMap((r) => {
        const daily = weekDays.map((d) => d.goals?.[r.key] ?? 0)
        if (daily.every((v) => v <= 0)) return []
        const week = daily.reduce((s, v) => s + v, 0)
        const set = daily.filter((v) => v > 0)
        const same = set.every((v) => v === set[0])
        const planned = weekDays.reduce((s, d) => s + d.totals.plan[r.key], 0)
        return [{ ...r, week, perDay: same ? set[0] : week / set.length, same, days: set.length, planned }]
    })
    if (rows.length === 0) return null

    return (
        <dl className="grid grid-cols-2 md:grid-cols-4">
                {rows.map((r) => (
                    <div key={r.key} className="border-b border-hairline pb-4 pr-5 pt-3">
                        <dt className="text-[13px] text-neutral-600">{r.label}</dt>
                        <dd className="mt-1">
                            <span className="text-[28px] leading-none tracking-[-0.03em] tabular-nums text-neutral-950">
                                {show(r.key, r.week)}
                            </span>
                            <span className="ml-1 text-[13px] text-neutral-500">{r.unit}</span>
                            <span className="mt-1.5 block text-[13px] text-neutral-600">
                                {r.same ? '' : 'about '}
                                <span className="tabular-nums text-neutral-900">{show(r.key, r.perDay)}</span> {r.unit} a day
                                {r.days < 7 && ` · ${r.days} days`}
                            </span>
                            {r.planned > 0 && (
                                <span className="block text-[13px] text-neutral-500">
                                    <span className="tabular-nums">{show(r.key, r.planned)}</span> planned
                                </span>
                            )}
                        </dd>
                    </div>
                ))}
        </dl>
    )
}
