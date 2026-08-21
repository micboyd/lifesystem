import type { GoalProgress } from '../../lib/nutritionGoal'
import { kg, shortDate } from './format'

/**
 * The waypoints between here and the goal.
 *
 * Built from the goal's own trajectory rather than a hardcoded ladder, so the
 * markers mean something for this phase specifically. Weight milestones get
 * dates because a weight trend can carry a projection; body-fat milestones
 * deliberately do not, because putting "18 March" against a number a bathroom
 * scale guessed would be inventing a precision that reading simply hasn't got.
 */

interface Milestone {
    label: string
    caption: string
    /** Whether this point has already been passed. */
    done: boolean
}

/** Whole-kilogram waypoints between the start and the target, coarsest first. */
function weightMilestones(progress: GoalProgress): Milestone[] {
    const { startKg, targetKg, currentKg, observedRateKgPerWeek } = progress
    if (startKg === null || targetKg === null) return []

    const losing = targetKg < startKg
    const out: Milestone[] = []

    // Every whole kilogram between start and target, on the 2.5 kg marks that
    // people actually think in.
    const step = 2.5
    const from = losing ? Math.floor(startKg / step) * step : Math.ceil(startKg / step) * step
    for (let w = from; losing ? w > targetKg : w < targetKg; w += losing ? -step : step) {
        if (losing ? w >= startKg : w <= startKg) continue
        const done = losing ? currentKg <= w : currentKg >= w
        const away = w - currentKg
        const weeks =
            !done && observedRateKgPerWeek && Math.sign(away) === Math.sign(observedRateKgPerWeek)
                ? away / observedRateKgPerWeek
                : null
        out.push({
            label: kg(w),
            caption: done
                ? 'Passed'
                : weeks !== null
                  ? `~${shortDate(addWeeks(todayIsoish(progress), weeks))}`
                  : 'Ahead',
            done,
        })
    }
    return out
}

/** Today, as far as the projection is concerned — the trend's own anchor. */
function todayIsoish(progress: GoalProgress): string {
    // The projection is made from the goal's target date working backwards, so
    // any consistent anchor works; the trend's own "now" is the honest one.
    return progress.targetDate && progress.weeksRemaining !== null
        ? addWeeks(progress.targetDate, -progress.weeksRemaining)
        : new Date().toISOString().slice(0, 10)
}

function addWeeks(date: string, weeks: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + Math.round(weeks * 7) * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}

export default function GoalMilestones({
    progress,
    currentBodyFatPct,
}: {
    progress: GoalProgress | null
    currentBodyFatPct: number | null
}) {
    if (!progress) return null

    const milestones = weightMilestones(progress)
    const goal = progress.goal
    const bfTarget = goal.targetBodyFatPct

    if (milestones.length === 0 && !bfTarget) return null

    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <h3 className="text-sm font-bold tracking-tight text-neutral-900">Milestones</h3>

            <ol className="mt-4 flex flex-wrap gap-2">
                {progress.startKg !== null && (
                    <li className="rounded-xl bg-neutral-900 px-3 py-2 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">
                            Start
                        </p>
                        <p className="text-sm font-bold tabular-nums">{kg(progress.startKg)}</p>
                    </li>
                )}
                {milestones.map((m) => (
                    <li
                        key={m.label}
                        className={`rounded-xl px-3 py-2 ${
                            m.done ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-50 text-neutral-500'
                        }`}
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                            {m.caption}
                        </p>
                        <p className="text-sm font-bold tabular-nums">{m.label}</p>
                    </li>
                ))}
                {goal.targetWeightRangeKg && (
                    <li
                        className={`rounded-xl px-3 py-2 ${
                            progress.withinTargetBand
                                ? 'bg-emerald-500 text-white'
                                : 'bg-neutral-100 text-neutral-600'
                        }`}
                    >
                        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                            Target range
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                            {goal.targetWeightRangeKg.min}–{goal.targetWeightRangeKg.max} kg
                        </p>
                    </li>
                )}
            </ol>

            {bfTarget && (
                <div className="mt-4 border-t border-neutral-100 pt-3">
                    <p className="text-[11px] text-neutral-500">
                        Body fat{' '}
                        {currentBodyFatPct !== null ? (
                            <>
                                <span className="font-semibold tabular-nums text-neutral-700">
                                    {currentBodyFatPct.toFixed(1)}%
                                </span>{' '}
                                heading for around{' '}
                            </>
                        ) : (
                            'target '
                        )}
                        <span className="font-semibold tabular-nums text-neutral-700">
                            {goal.targetBodyFatRangePct
                                ? `${goal.targetBodyFatRangePct.min}–${goal.targetBodyFatRangePct.max}%`
                                : `${bfTarget}%`}
                        </span>
                        .
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-400">
                        No date against this one — scale body-fat readings are too noisy to put a
                        week on.
                    </p>
                </div>
            )}
        </div>
    )
}
