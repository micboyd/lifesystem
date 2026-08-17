import { LIFE_PILLAR_ICONS, LIFE_PILLAR_LABELS } from '../../types'
import { formatMonthKey, monthKey } from '../../lib/calendar'
import {
    LOAD_LEVEL_LABELS,
    OVERLOAD_THRESHOLD,
    findPressurePoints,
    peakMonth,
    type MonthLoad,
} from '../../lib/lifeLoad'
import { seasonForMonth } from '../../lib/lifeTimeline'
import type { LifePlan } from '../../types'
import LoadPill from './LoadPill'
import EmptyState from '../EmptyState'

/**
 * Where the plan is asking too much of one month.
 *
 * Every commitment here fits the calendar on its own — this isn't a clash. What
 * it catches is the pile-up, and the value is entirely in catching it while the
 * months are still a plan rather than a run of missed weeks.
 */
export default function PressureCheck({
    plan,
    loads,
}: {
    plan: LifePlan
    loads: MonthLoad[]
}) {
    const now = new Date()
    const thisMonth = monthKey(now.getFullYear(), now.getMonth())
    const points = findPressurePoints(loads)
    const peak = peakMonth(loads)
    const maxScore = Math.max(OVERLOAD_THRESHOLD, peak?.score ?? 0)

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold tracking-tight text-neutral-950">Pressure check</h2>
                <p className="text-sm text-neutral-500">
                    How much each month is carrying. Nothing here is a diary clash — it&apos;s the load.
                </p>
            </div>

            {points.length === 0 ? (
                <EmptyState
                    icon="fa-circle-check"
                    title="No pile-ups"
                    description={
                        peak && peak.score > 0
                            ? `The heaviest month is ${formatMonthKey(peak.month)}, and it's still manageable.`
                            : 'Nothing is competing for the same months yet.'
                    }
                />
            ) : (
                <div className="space-y-3">
                    {points.map((load) => {
                        const season = seasonForMonth(plan, load.month)
                        return (
                            <div
                                key={load.month}
                                className="rounded-2xl border border-red-100 bg-red-50/40 p-5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-base font-bold text-neutral-950">
                                            {formatMonthKey(load.month)}
                                        </h3>
                                        {season && (
                                            <p className="text-xs font-semibold text-neutral-400">
                                                {season.name}
                                            </p>
                                        )}
                                    </div>
                                    <LoadPill
                                        level={load.level}
                                        label={LOAD_LEVEL_LABELS[load.level]}
                                        score={load.score}
                                    />
                                </div>
                                <p className="mt-3 text-sm text-neutral-700">
                                    {load.contributors.filter((c) => c.weight > 0).length} demanding
                                    commitments land in this month at once:
                                </p>
                                <ul className="mt-2 space-y-1.5">
                                    {load.contributors
                                        .filter((c) => c.weight > 0)
                                        .map((c) => (
                                            <li
                                                key={`${c.source}-${c.recordId}`}
                                                className="flex items-center gap-2.5 text-sm"
                                            >
                                                <i
                                                    className={`fa-solid ${LIFE_PILLAR_ICONS[c.pillar]} w-4 shrink-0 text-center text-[11px] text-neutral-400`}
                                                    aria-hidden="true"
                                                    title={LIFE_PILLAR_LABELS[c.pillar]}
                                                />
                                                <span className="min-w-0 flex-1 truncate font-semibold text-neutral-800">
                                                    {c.label}
                                                </span>
                                                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                                                    +{c.weight}
                                                </span>
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* The whole window, so a month can be read in context rather than only
                when it trips the threshold. */}
            <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Every month
                </h3>
                <div className="mt-3 space-y-1.5">
                    {loads.map((load) => {
                        const pct = maxScore > 0 ? (load.score / maxScore) * 100 : 0
                        const isNow = load.month === thisMonth
                        return (
                            <div
                                key={load.month}
                                className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-neutral-50"
                                title={
                                    load.contributors.length > 0
                                        ? load.contributors.map((c) => c.label).join(', ')
                                        : 'Nothing planned'
                                }
                            >
                                <span
                                    className={`w-24 shrink-0 truncate text-xs font-semibold ${isNow ? 'text-coral-600' : 'text-neutral-500'}`}
                                >
                                    {formatMonthKey(load.month)}
                                </span>
                                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                    <div
                                        className={[
                                            'h-full rounded-full transition-[width]',
                                            load.level === 'overloaded'
                                                ? 'bg-red-400'
                                                : load.level === 'busy'
                                                  ? 'bg-marigold'
                                                  : load.level === 'steady'
                                                    ? 'bg-herb'
                                                    : 'bg-neutral-300',
                                        ].join(' ')}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                                    {load.score}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
