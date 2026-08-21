import { GOAL_STATUS_LABELS, type GoalProgress } from '../../lib/nutritionGoal'
import { PERFORMANCE_LABELS, type StrengthSummary } from '../../lib/strengthTrend'
import type { MeasurementGap, MeasurementTrend } from '../../lib/bodyMeasurements'
import type { Composition, CompositionChange } from '../../lib/nutritionTrend'
import type { TransformationRead } from '../../lib/transformation'
import type { Adherence } from '../../lib/nutritionAdjustment'
import { kg, longDate, rate, signedKg } from './format'

/**
 * Is the recomp working — answered at a glance.
 *
 * The layout puts the four signals that actually settle the question on one row:
 * weight, waist, composition and strength. They are equals here because none of
 * them decides it alone, and a screen that made bodyweight the headline would be
 * reproducing exactly the mistake this whole layer exists to correct.
 *
 * Under them sits a sentence naming the pattern. That sentence is the product —
 * not a score, which would compress signals of very different reliability into
 * one number nobody could argue with.
 */

const PATTERN_TONE: Record<string, string> = {
    'recomp-going-well': 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    'recomp-despite-plateau': 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    'too-aggressive': 'bg-amber-50 text-amber-700 ring-amber-100',
    stalled: 'bg-amber-50 text-amber-700 ring-amber-100',
    gaining: 'bg-amber-50 text-amber-700 ring-amber-100',
    mixed: 'bg-neutral-50 text-neutral-600 ring-neutral-100',
    'insufficient-data': 'bg-neutral-50 text-neutral-500 ring-neutral-100',
}

/**
 * One signal: where it is now, and how far it has come. `from` is always shown
 * when known, because a number without its starting point says nothing about
 * whether anything is happening.
 */
function Signal({
    label,
    value,
    from,
    change,
    caption,
    estimate = false,
}: {
    label: string
    value: string | null
    from?: string | null
    change?: string | null
    caption?: string
    estimate?: boolean
}) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
                {estimate && <span className="ml-1 font-medium normal-case">· estimate</span>}
            </p>
            <p
                className={`mt-0.5 truncate text-xl font-bold tabular-nums tracking-tight ${
                    value === null ? 'text-neutral-300' : 'text-neutral-900'
                }`}
            >
                {value ?? 'No data yet'}
            </p>
            {change && (
                <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums text-neutral-500">
                    {change}
                    {from && <span className="font-medium text-neutral-400"> from {from}</span>}
                </p>
            )}
            {!change && from && (
                <p className="mt-0.5 truncate text-[11px] text-neutral-400">from {from}</p>
            )}
            {caption && <p className="mt-0.5 truncate text-[11px] text-neutral-400">{caption}</p>}
        </div>
    )
}

export default function TransformationSummary({
    phaseName,
    startDate,
    progress,
    waist,
    strength,
    composition,
    compositionChange,
    read,
    adherence,
}: {
    phaseName: string
    startDate: string
    progress: GoalProgress | null
    waist: MeasurementTrend | MeasurementGap
    strength: StrengthSummary
    composition: Composition | null
    compositionChange: CompositionChange | null
    read: TransformationRead | null
    adherence: Adherence
}) {
    const hasWaist = typeof waist !== 'string'
    const tone = PATTERN_TONE[read?.pattern ?? 'insufficient-data']

    const calorieAdherencePct =
        adherence.loggedDays > 0
            ? Math.round((adherence.daysWithinTolerance / adherence.loggedDays) * 100)
            : null
    const proteinAdherencePct =
        adherence.proteinTargetDays > 0
            ? Math.round((adherence.proteinHitDays / adherence.proteinTargetDays) * 100)
            : null

    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold tracking-tight text-neutral-900">
                        {phaseName}
                    </h3>
                    <p className="mt-0.5 text-[11px] text-neutral-400">
                        {longDate(startDate)}
                        {progress?.targetDate ? ` → ${longDate(progress.targetDate)}` : ''}
                    </p>
                </div>
                {progress && (
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-[11px] font-semibold text-neutral-600">
                        {GOAL_STATUS_LABELS[progress.status]}
                    </span>
                )}
            </div>

            {/* The four signals that settle it, as equals. */}
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Signal
                    label="Weight"
                    value={progress ? kg(progress.currentKg) : null}
                    from={progress?.startKg != null ? kg(progress.startKg) : null}
                    change={progress?.totalChangeKg != null ? signedKg(progress.totalChangeKg) : null}
                    caption={
                        progress?.observedRateKgPerWeek != null
                            ? rate(progress.observedRateKgPerWeek)
                            : '7-day average'
                    }
                />
                <Signal
                    label="Waist"
                    value={hasWaist ? `${waist.current.cm.toFixed(1)} cm` : null}
                    from={hasWaist ? `${waist.start.cm.toFixed(1)} cm` : null}
                    change={
                        hasWaist
                            ? `${waist.changeCm < 0 ? '−' : '+'}${Math.abs(waist.changeCm).toFixed(1)} cm`
                            : null
                    }
                    caption={
                        hasWaist && waist.recentChangeCm !== null
                            ? `${waist.recentChangeCm < 0 ? '−' : '+'}${Math.abs(waist.recentChangeCm).toFixed(1)} cm this month`
                            : hasWaist
                              ? `${waist.readings} readings`
                              : 'Measure weekly'
                    }
                />
                <Signal
                    label="Body fat"
                    estimate
                    value={composition ? `${composition.bodyFatPct.toFixed(1)}%` : null}
                    change={
                        compositionChange
                            ? `${compositionChange.bodyFatPct < 0 ? '−' : '+'}${Math.abs(compositionChange.bodyFatPct).toFixed(1)} pts`
                            : null
                    }
                    caption={
                        progress?.goal.targetBodyFatPct
                            ? `Target ~${progress.goal.targetBodyFatPct}%`
                            : undefined
                    }
                />
                <Signal
                    label="Strength"
                    value={
                        strength.overall === 'insufficient-data'
                            ? null
                            : PERFORMANCE_LABELS[strength.overall]
                    }
                    caption={
                        strength.judged > 0
                            ? `${strength.judged} lift${strength.judged === 1 ? '' : 's'} tracked`
                            : 'Log working weights to track'
                    }
                />
            </div>

            {/* Target, trends and adherence — the supporting row. */}
            {progress && (
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-4">
                    <Signal
                        label="Target"
                        value={progress.targetKg !== null ? kg(progress.targetKg) : null}
                        caption={
                            progress.goal.targetWeightRangeKg
                                ? `${progress.goal.targetWeightRangeKg.min}–${progress.goal.targetWeightRangeKg.max} kg`
                                : undefined
                        }
                    />
                    <Signal
                        label="Required trend"
                        value={
                            progress.requiredRateKgPerWeek !== null
                                ? rate(progress.requiredRateKgPerWeek)
                                : null
                        }
                        caption={
                            progress.weeksRemaining !== null
                                ? `${Math.round(progress.weeksRemaining)} weeks left`
                                : undefined
                        }
                    />
                    <Signal
                        label="Calorie adherence"
                        value={calorieAdherencePct !== null ? `${calorieAdherencePct}%` : null}
                        caption={`${adherence.loggedDays}/${adherence.windowDays} days logged`}
                    />
                    <Signal
                        label="Protein adherence"
                        value={proteinAdherencePct !== null ? `${proteinAdherencePct}%` : null}
                        caption={
                            adherence.avgProteinG !== null
                                ? `${Math.round(adherence.avgProteinG)} g/day average`
                                : undefined
                        }
                    />
                </div>
            )}

            {/* The reading. */}
            {read && (
                <div className={`mt-4 rounded-2xl px-4 py-3 ring-1 ${tone}`}>
                    <p className="text-sm font-bold tracking-tight">{read.headline}</p>
                    <p className="mt-1 text-[13px] leading-relaxed opacity-90">{read.detail}</p>
                </div>
            )}
        </div>
    )
}
