import { GOAL_STATUS_LABELS, type GoalProgress, type GoalStatus } from '../../lib/nutritionGoal'
import type { WeightTrend, TrendGap, CompositionChange, Composition } from '../../lib/nutritionTrend'
import type { Maintenance, MaintenanceGap } from '../../lib/energy'
import { fmt, kcal, kg, longDate, rate, rateBand, signedKg } from './format'

/**
 * The long view: where the goal stands, and what the scale is doing about it.
 *
 * Everything above this in the Nutrition tab is about today. This is the only
 * place the nine-month arc is visible, so it earns the space to show three rates
 * side by side — observed, intended, and what would now be required — because
 * the useful months are exactly the ones where those three stop agreeing.
 *
 * It renders decisions already made in `lib/`. No arithmetic here beyond
 * choosing a colour.
 */

const STATUS_TONE: Record<GoalStatus, string> = {
    'on-track': 'bg-emerald-50 text-emerald-700',
    reached: 'bg-emerald-50 text-emerald-700',
    'slightly-ahead': 'bg-sky-50 text-sky-700',
    ahead: 'bg-sky-50 text-sky-700',
    'slightly-behind': 'bg-amber-50 text-amber-700',
    behind: 'bg-amber-50 text-amber-700',
    'wrong-way': 'bg-red-50 text-red-700',
    'insufficient-data': 'bg-neutral-100 text-neutral-500',
}

/** One labelled figure in the grid. Missing data shows a dash, never a zero. */
function Stat({
    label,
    value,
    caption,
    tone = 'text-neutral-900',
}: {
    label: string
    value: string | null
    caption?: string
    tone?: string
}) {
    const known = value !== null
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p
                className={`mt-0.5 truncate text-lg font-bold tabular-nums tracking-tight ${
                    known ? tone : 'text-neutral-300'
                }`}
            >
                {known ? value : '—'}
            </p>
            {caption && <p className="mt-0.5 truncate text-[11px] text-neutral-400">{caption}</p>}
        </div>
    )
}

/**
 * Start → now → target as a single bar, with the target band drawn on it. The
 * band is the point: a goal expressed as one number invites treating 95.4 kg as
 * a failure, and it isn't one.
 */
function ProgressBar({ progress }: { progress: GoalProgress }) {
    const { startKg, targetKg, currentKg, goal } = progress
    if (startKg === null || targetKg === null || startKg === targetKg) return null

    // Normalise so 0% is the start and 100% is the target, whichever direction.
    const span = targetKg - startKg
    const pos = (kgValue: number) => {
        const pct = ((kgValue - startKg) / span) * 100
        return Math.max(0, Math.min(100, pct))
    }

    const band = goal.targetWeightRangeKg
    const bandFrom = band ? Math.min(pos(band.min), pos(band.max)) : null
    const bandTo = band ? Math.max(pos(band.min), pos(band.max)) : null

    return (
        <div className="mt-4">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
                {bandFrom !== null && bandTo !== null && (
                    <div
                        className="absolute inset-y-0 bg-emerald-100"
                        style={{ left: `${bandFrom}%`, width: `${bandTo - bandFrom}%` }}
                        aria-hidden="true"
                    />
                )}
                <div
                    className="absolute inset-y-0 left-0 rounded-full bg-neutral-800"
                    style={{ width: `${pos(currentKg)}%` }}
                />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-neutral-400">
                <span>{kg(startKg)} start</span>
                <span className="font-semibold text-neutral-700">{kg(currentKg)}</span>
                <span>
                    {band ? `${band.min}–${band.max} kg` : kg(targetKg)}
                </span>
            </div>
        </div>
    )
}

/**
 * Fat and lean mass, when body fat has been measured far enough apart to say
 * anything. Labelled as estimates throughout, and deliberately given the least
 * prominent corner of the card — these are the numbers most likely to be wrong
 * and most tempting to act on.
 */
function CompositionRow({
    latest,
    change,
}: {
    latest: Composition | null
    change: CompositionChange | null
}) {
    if (!latest) return null
    return (
        <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                Estimated composition
            </p>
            <div className="mt-2 grid grid-cols-3 gap-3">
                <Stat
                    label="Body fat"
                    value={`${fmt(latest.bodyFatPct)}%`}
                    caption={
                        change ? `${change.bodyFatPct > 0 ? '+' : '−'}${Math.abs(change.bodyFatPct).toFixed(1)} pts in ${change.days}d` : undefined
                    }
                />
                <Stat
                    label="Fat mass"
                    value={kg(latest.fatMassKg)}
                    caption={change ? `${signedKg(change.fatMassKg)} in ${change.days}d` : undefined}
                />
                <Stat
                    label="Lean mass"
                    value={kg(latest.leanMassKg)}
                    caption={change ? `${signedKg(change.leanMassKg)} in ${change.days}d` : undefined}
                />
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
                Estimated from your scale&rsquo;s body-fat reading, which swings with hydration.
                Worth reading over months, not weeks.
            </p>
        </div>
    )
}

export default function NutritionGoalCard({
    phaseName,
    progress,
    trend,
    maintenance,
    currentTargetKcal,
    composition,
    compositionChange,
    onReview,
}: {
    phaseName: string
    progress: GoalProgress | null
    trend: WeightTrend | TrendGap
    maintenance: Maintenance | MaintenanceGap
    currentTargetKcal?: number
    composition: Composition | null
    compositionChange: CompositionChange | null
    onReview?: () => void
}) {
    const hasTrend = typeof trend !== 'string'
    const goal = progress?.goal
    const band = goal?.acceptableWeeklyRateKg

    // The averaging window widens when a week held too few weigh-ins, so the
    // label has to say what it actually averaged rather than always claiming 7.
    const averageLabel =
        hasTrend && trend.current.days !== 7 ? `${trend.current.days}-day weight` : '7-day weight'

    const status = progress?.status ?? 'insufficient-data'

    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold tracking-tight text-neutral-900">
                        {phaseName}
                    </h3>
                    {progress?.targetDate && (
                        <p className="mt-0.5 text-[11px] text-neutral-400">
                            {goal?.targetWeightKg ? `${goal.targetWeightKg} kg` : 'Target'}
                            {goal?.targetBodyFatPct ? ` · ~${goal.targetBodyFatPct}% body fat` : ''}
                            {' by '}
                            {longDate(progress.targetDate)}
                            {progress.weeksRemaining !== null &&
                                ` · ${Math.round(progress.weeksRemaining)} weeks left`}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <span
                        className={`rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[status]}`}
                    >
                        {GOAL_STATUS_LABELS[status]}
                    </span>
                    {onReview && (
                        <button
                            type="button"
                            onClick={onReview}
                            className="rounded-full border border-neutral-200 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            Review
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                    label={averageLabel}
                    value={hasTrend ? kg(trend.current.kg) : null}
                    caption={
                        hasTrend
                            ? `${trend.current.readings} weigh-in${trend.current.readings === 1 ? '' : 's'}`
                            : 'No weigh-ins yet'
                    }
                />
                <Stat
                    label="Trend"
                    value={
                        progress?.observedRateKgPerWeek != null
                            ? rate(progress.observedRateKgPerWeek)
                            : hasTrend && trend.rateKgPerWeek !== null
                              ? rate(trend.rateKgPerWeek)
                              : null
                    }
                    caption={band ? `Target ${rateBand(band.min, band.max)}` : undefined}
                />
                <Stat
                    label="Maintenance"
                    value={typeof maintenance === 'object' ? `${kcal(maintenance.kcal)} kcal` : null}
                    caption={
                        typeof maintenance === 'object'
                            ? `Measured over ${maintenance.days} logged days`
                            : maintenance === 'not-enough-intake'
                              ? 'Needs more logged days'
                              : 'Needs more weigh-ins'
                    }
                />
                <Stat
                    label="Current target"
                    value={currentTargetKcal ? `${kcal(currentTargetKcal)} kcal` : null}
                    caption={
                        progress?.desiredRateKgPerWeek != null
                            ? `Aiming at ${rate(progress.desiredRateKgPerWeek)}`
                            : undefined
                    }
                />
            </div>

            {progress && <ProgressBar progress={progress} />}

            {progress && (
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-4">
                    <Stat
                        label="Change so far"
                        value={progress.totalChangeKg !== null ? signedKg(progress.totalChangeKg) : null}
                        caption={progress.startKg !== null ? `From ${kg(progress.startKg)}` : undefined}
                    />
                    <Stat
                        label="Left to go"
                        value={progress.remainingKg !== null ? signedKg(progress.remainingKg) : null}
                        caption={
                            progress.withinTargetBand ? 'Inside the target band' : 'To the target weight'
                        }
                    />
                    <Stat
                        label="Required from here"
                        value={
                            progress.requiredRateKgPerWeek !== null
                                ? rate(progress.requiredRateKgPerWeek)
                                : null
                        }
                        caption={
                            progress.weeksRemaining === 0 ? 'Goal date has passed' : 'To arrive on the date'
                        }
                    />
                    <Stat
                        label="Projection"
                        value={progress.projectedKg !== null ? kg(progress.projectedKg) : null}
                        caption="If the current trend holds"
                    />
                </div>
            )}

            <CompositionRow latest={composition} change={compositionChange} />

            <p className="mt-3 text-[11px] text-neutral-400">
                {summaryLine(progress, hasTrend)}
            </p>
        </div>
    )
}

/**
 * The sentence under the numbers. Calm by design — a projection is arithmetic on
 * a noisy slope, and phrasing it as a verdict would give it an authority it
 * hasn't earned.
 */
function summaryLine(progress: GoalProgress | null, hasTrend: boolean): string {
    if (!hasTrend) return 'Log a few weigh-ins and the trend, projection and maintenance figures fill in.'
    if (!progress) return 'Add a goal to this phase to track a target weight and date.'

    const { observedRateKgPerWeek, requiredRateKgPerWeek, projectedKg, targetKg, status } = progress
    if (observedRateKgPerWeek === null) {
        return 'Not enough weigh-ins yet to measure a rate. A few more readings will settle it.'
    }

    const observed = `Current trend ${rate(observedRateKgPerWeek)}`
    const required =
        requiredRateKgPerWeek !== null ? `, required from here ${rate(requiredRateKgPerWeek)}` : ''

    if (status === 'reached' && targetKg !== null) {
        return `${observed}${required}. You are inside the target band — holding here is the job now.`
    }
    if (projectedKg === null || targetKg === null) return `${observed}${required}.`

    const verdict =
        status === 'on-track'
            ? `on course for about ${kg(projectedKg)}`
            : status === 'wrong-way'
              ? `currently moving away from ${kg(targetKg)}`
              : `projecting about ${kg(projectedKg)} against a ${kg(targetKg)} target`
    return `${observed}${required} — ${verdict}. Projections follow the trend, not a promise.`
}
