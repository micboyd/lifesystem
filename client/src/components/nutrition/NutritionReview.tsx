import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import type { Confidence, Recommendation } from '../../lib/nutritionAdjustment'
import { PERFORMANCE_LABELS } from '../../lib/strengthTrend'
import { RATING_LABELS } from '../../types'
import { fmt, kcal, longDate, rate, signedKcal } from './format'

/**
 * The periodic check-in: what the last three weeks actually were, and what — if
 * anything — to do about it.
 *
 * The recommendation is never applied on its own. Accepting is a click, and the
 * click is the point: a target that changed itself would be untraceable by
 * February, and the whole value of the history is being able to ask "what was I
 * eating in November, and why" and get an answer.
 *
 * Dismissing does nothing and records nothing. That's deliberate — the review is
 * recomputed from data every time, so a dismissal that "stuck" would just be a
 * way to hide a signal that hasn't gone away.
 */

const CONFIDENCE_COPY: Record<Confidence, string> = {
    high: 'High confidence — a full, well-logged window with a rate fitted to your weigh-ins.',
    medium: 'Moderate confidence — enough data to read, but not a full window.',
    low: 'Low confidence — the figures rest on sparse data. Treat them as indicative.',
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
    high: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-neutral-100 text-neutral-500',
}

/** One line of the review: a label, a figure, and a dash when it isn't known. */
function Row({ label, value, hint }: { label: string; value: string | null; hint?: string }) {
    return (
        <div className="flex items-baseline justify-between gap-4 py-2">
            <span className="text-[13px] text-neutral-500">{label}</span>
            <span className="shrink-0 text-right">
                <span
                    className={`text-sm font-bold tabular-nums ${
                        value === null ? 'text-neutral-300' : 'text-neutral-900'
                    }`}
                >
                    {value ?? '—'}
                </span>
                {hint && <span className="ml-1.5 text-[11px] text-neutral-400">{hint}</span>}
            </span>
        </div>
    )
}

/** The proposed macros, so accepting isn't a decision made blind. */
function MacroPreview({ rec }: { rec: Recommendation }) {
    const t = rec.suggestedTargets
    if (!t) return null
    return (
        <div className="mt-3 grid grid-cols-4 gap-2 rounded-xl bg-white p-3">
            {[
                ['Calories', kcal(t.calories ?? 0), 'kcal'],
                ['Protein', fmt(t.protein ?? 0), 'g'],
                ['Carbs', fmt(t.carbs ?? 0), 'g'],
                ['Fat', fmt(t.fat ?? 0), 'g'],
            ].map(([label, value, unit]) => (
                <div key={label}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        {label}
                    </p>
                    <p className="mt-0.5 text-sm font-bold tabular-nums text-neutral-900">
                        {value}
                        <span className="ml-0.5 text-[10px] font-medium text-neutral-400">{unit}</span>
                    </p>
                </div>
            ))}
        </div>
    )
}

/** Waist, strength and recovery — context for the decision, not inputs to it. */
function ContextSection({ rec }: { rec: Recommendation }) {
    const context = rec.context!
    const { waist, strength, subjective } = context.signals
    const hasWaist = typeof waist !== 'string'

    // Nothing recorded at all: say so once rather than printing three dashes.
    if (!hasWaist && strength === 'insufficient-data' && subjective.recovery === null) {
        return (
            <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Supporting signals
                </h4>
                <p className="mt-2 text-[13px] text-neutral-400">
                    No waist measurements, logged working weights or check-ins yet. The calorie
                    decision above stands on weight and adherence alone — these would tell you
                    whether what is coming off is fat.
                </p>
            </div>
        )
    }

    return (
        <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                Supporting signals
            </h4>
            <div className="mt-1 divide-y divide-neutral-100">
                <Row
                    label="Waist"
                    value={
                        hasWaist && waist.recentChangeCm !== null
                            ? `${waist.recentChangeCm < 0 ? '−' : '+'}${Math.abs(waist.recentChangeCm).toFixed(1)} cm`
                            : hasWaist
                              ? `${waist.current.cm.toFixed(1)} cm`
                              : null
                    }
                    hint={hasWaist && waist.recentChangeCm !== null ? 'last 4 weeks' : undefined}
                />
                <Row
                    label="Strength"
                    value={strength === 'insufficient-data' ? null : PERFORMANCE_LABELS[strength]}
                />
                <Row
                    label={RATING_LABELS.recovery}
                    value={subjective.recovery !== null ? `${subjective.recovery.toFixed(1)} / 5` : null}
                    hint={
                        subjective.checkIns > 0
                            ? `${subjective.checkIns} check-in${subjective.checkIns === 1 ? '' : 's'}`
                            : undefined
                    }
                />
                {subjective.clothesFit && (
                    <Row
                        label="Clothes fit"
                        value={subjective.clothesFit[0].toUpperCase() + subjective.clothesFit.slice(1)}
                    />
                )}
            </div>
        </div>
    )
}

export default function NutritionReview({
    open,
    onClose,
    recommendation,
    onAccept,
}: {
    open: boolean
    onClose: () => void
    recommendation: Recommendation | null
    onAccept?: (rec: Recommendation) => Promise<void>
}) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const rec = recommendation
    const a = rec?.adherence
    const maintenance = rec && typeof rec.maintenance === 'object' ? rec.maintenance : null
    const canAccept = Boolean(rec && rec.action !== 'hold' && onAccept)

    async function accept() {
        if (!rec || !onAccept) return
        setError('')
        setBusy(true)
        try {
            await onAccept(rec)
            onClose()
        } catch {
            setError('Could not save that change.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Nutrition review"
            badge={a ? `Last ${a.windowDays} days` : undefined}
            size="xl"
            footer={
                <div className="flex flex-col gap-2">
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                            {canAccept ? 'Dismiss' : 'Close'}
                        </Button>
                        {canAccept && (
                            <Button onClick={accept} disabled={busy}>
                                {busy ? 'Saving…' : 'Accept'}
                            </Button>
                        )}
                    </div>
                </div>
            }
        >
            {!rec ? (
                <p className="text-sm text-neutral-400">Nothing to review yet.</p>
            ) : (
                <div className="flex flex-col gap-5">
                    {/* What the window actually was. */}
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                            The last {a!.windowDays} days
                        </h4>
                        <div className="mt-1 divide-y divide-neutral-100">
                            <Row
                                label="Days with intake logged"
                                value={`${a!.loggedDays} / ${a!.windowDays}`}
                                hint={`${Math.round(a!.coverage * 100)}%`}
                            />
                            <Row
                                label="Average intake"
                                value={a!.avgIntakeKcal !== null ? `${kcal(a!.avgIntakeKcal)} kcal` : null}
                            />
                            <Row
                                label="Average target"
                                value={a!.avgTargetKcal !== null ? `${kcal(a!.avgTargetKcal)} kcal` : null}
                                hint={
                                    a!.avgDiffKcal !== null ? `${signedKcal(a!.avgDiffKcal)} kcal` : undefined
                                }
                            />
                            <Row
                                label="Days within tolerance"
                                value={`${a!.daysWithinTolerance} / ${a!.loggedDays}`}
                                hint={a!.toleranceKcal ? `±${Math.round(a!.toleranceKcal)} kcal` : undefined}
                            />
                            <Row
                                label="Average protein"
                                value={a!.avgProteinG !== null ? `${fmt(a!.avgProteinG)} g` : null}
                                hint={
                                    a!.proteinTargetDays > 0
                                        ? `${a!.proteinHitDays}/${a!.proteinTargetDays} days on target`
                                        : undefined
                                }
                            />
                        </div>
                    </div>

                    {/* What the scale did about it. */}
                    <div>
                        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                            What the scale did
                        </h4>
                        <div className="mt-1 divide-y divide-neutral-100">
                            <Row
                                label="Weight trend"
                                value={
                                    rec.observedRateKgPerWeek !== null
                                        ? rate(rec.observedRateKgPerWeek)
                                        : null
                                }
                            />
                            <Row
                                label="Desired trend"
                                value={
                                    rec.desiredRateKgPerWeek !== null
                                        ? rate(rec.desiredRateKgPerWeek)
                                        : null
                                }
                            />
                            <Row
                                label="Estimated maintenance"
                                value={maintenance ? `${kcal(maintenance.kcal)} kcal` : null}
                                hint={maintenance ? `${maintenance.days} days` : undefined}
                            />
                            <Row
                                label="Implied daily deficit"
                                value={
                                    rec.observedDeficitKcal !== null
                                        ? `${signedKcal(rec.observedDeficitKcal)} kcal`
                                        : null
                                }
                                hint={
                                    rec.desiredDeficitKcal !== null
                                        ? `aiming ${signedKcal(rec.desiredDeficitKcal)}`
                                        : undefined
                                }
                            />
                        </div>
                    </div>

                    {/*
                      The supporting evidence. Second in the hierarchy on purpose:
                      the calorie decision is made from weight, adherence and
                      maintenance, and these say whether that decision makes sense
                      in the wider picture — with one exception, where a falling
                      waist and rising strength withhold a cut the scale alone
                      would have argued for.
                    */}
                    {rec.context && <ContextSection rec={rec} />}

                    {/* And what to do about that. */}
                    <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                Recommendation
                            </h4>
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${CONFIDENCE_TONE[rec.confidence]}`}
                            >
                                {rec.confidence} confidence
                            </span>
                        </div>

                        <p className="mt-2 text-base font-bold tracking-tight text-neutral-900">
                            {rec.headline}
                        </p>
                        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
                            {rec.reason}
                        </p>

                        {rec.action !== 'hold' && (
                            <>
                                <p className="mt-3 text-xs font-semibold tabular-nums text-neutral-500">
                                    {signedKcal(rec.deltaKcal)} kcal/day · effective{' '}
                                    {longDate(rec.effectiveFrom)}
                                </p>
                                <MacroPreview rec={rec} />
                            </>
                        )}

                        <p className="mt-3 text-[11px] text-neutral-400">
                            {CONFIDENCE_COPY[rec.confidence]}
                        </p>
                    </div>

                    <p className="text-[11px] leading-relaxed text-neutral-400">
                        Nothing changes until you accept it. Accepting records the new target from{' '}
                        {longDate(rec.effectiveFrom)} onwards and leaves earlier days measured against
                        the target you were actually following at the time.
                    </p>
                </div>
            )}
        </Drawer>
    )
}
