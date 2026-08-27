import { useMemo } from 'react'
import BarList from './BarList'
import { Card } from '../Card'
import EmptyState from '../EmptyState'
import StatTile from '../StatTile'
import { strengthSummary, PERFORMANCE_LABELS } from '../../lib/strengthTrend'
import { conditioningSummary, holdingUp, weightDirection } from '../../lib/trainingLoad'
import { trendSeries } from '../../lib/weightTrend'
import type { ConditioningLog, WeightLog, WorkoutLog } from '../../types'
import { longDate, plural } from './format'

/**
 * Conditioning, and the one cross-reference worth putting next to it.
 *
 * The conditioning half is bookkeeping — minutes, sessions, what kind. The body
 * half is the question those minutes are usually in service of: is the lifting
 * holding up while the scale moves. Both signals are shown as figures next to
 * the reading, because a verdict you can't check is one you can't argue with.
 */
export default function ConditioningPanel({
    conditioningLogs,
    workoutLogs,
    weightLogs,
    since,
    today,
    rangeLabel,
}: {
    conditioningLogs: ConditioningLog[]
    /** Strength logs — the other half of the "is it holding up" read. */
    workoutLogs: WorkoutLog[]
    weightLogs: WeightLog[]
    since: string
    today: string
    rangeLabel: string
}) {
    const summary = useMemo(
        () => conditioningSummary(conditioningLogs, since || undefined, today),
        [conditioningLogs, since, today]
    )

    const strength = useMemo(() => strengthSummary(workoutLogs, today), [workoutLogs, today])

    /**
     * The change in the *smoothed* weight over the range, not the gap between two
     * scale readings — a single dehydrated morning at either end would otherwise
     * decide the verdict.
     */
    const weightDeltaKg = useMemo(() => {
        const trend = trendSeries(weightLogs).filter((p) => p.date <= today)
        const inRange = since ? trend.filter((p) => p.date >= since) : trend
        if (inRange.length < 2) return null
        return inRange[inRange.length - 1].trend - inRange[0].trend
    }, [weightLogs, since, today])

    const direction = weightDirection(weightDeltaKg)
    const read = holdingUp(strength.overall, direction)

    return (
        <div className="flex flex-col gap-6">
            <Card hover={false} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-neutral-900">{read.headline}</h3>
                    <p className="text-xs text-neutral-400">{rangeLabel}</p>
                </div>
                <p className="max-w-2xl text-sm text-neutral-500">{read.detail}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                    <StatTile
                        label="Bodyweight trend"
                        value={
                            weightDeltaKg === null
                                ? '—'
                                : `${weightDeltaKg > 0 ? '+' : ''}${weightDeltaKg.toFixed(1)} kg`
                        }
                        sub={
                            weightDeltaKg === null
                                ? 'Needs two weigh-ins in this range'
                                : `Smoothed change · ${rangeLabel.toLowerCase()}`
                        }
                    />
                    <StatTile
                        label="Strength"
                        value={PERFORMANCE_LABELS[strength.overall]}
                        sub={
                            strength.judged === 0
                                ? 'No key lift has enough sessions yet'
                                : `Across ${plural(strength.judged, 'key lift')}`
                        }
                        tone={read.tone}
                    />
                </div>
                <p className="text-[11px] text-neutral-400">
                    The fuller read — waist, intake and intended rate together — lives on Nutrition
                    → Progress.
                </p>
            </Card>

            {conditioningLogs.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-heart-pulse"
                    title="No conditioning logged"
                    description="Log a run, a bike session or a circuit from the Conditioning tab and the minutes, category mix and RPE build up here."
                />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatTile
                            label={`Sessions · ${rangeLabel.toLowerCase()}`}
                            value={String(summary.sessions)}
                            sub={summary.sessions === 0 ? 'Nothing in this range' : undefined}
                        />
                        <StatTile
                            label="Minutes"
                            value={summary.minutes.toLocaleString('en-GB')}
                            sub={
                                summary.sessions > 0
                                    ? `${Math.round(summary.minutes / summary.sessions)} min a session`
                                    : undefined
                            }
                        />
                        <StatTile
                            label="Average RPE"
                            value={summary.avgRpe === null ? '—' : summary.avgRpe.toFixed(1)}
                            sub={
                                summary.avgRpe === null
                                    ? 'No session recorded one'
                                    : 'Out of 10, where 10 is everything you had'
                            }
                        />
                        <StatTile
                            label="Longest"
                            value={summary.longest ? `${summary.longest.duration} min` : '—'}
                            sub={
                                summary.longest
                                    ? `${summary.longest.name} · ${longDate(summary.longest.date)}`
                                    : undefined
                            }
                        />
                    </div>

                    <Card hover={false} className="flex flex-col gap-4">
                        <div>
                            <h3 className="text-sm font-bold text-neutral-900">Category mix</h3>
                            <p className="text-xs text-neutral-500">
                                Minutes by kind of session, {rangeLabel.toLowerCase()}.
                            </p>
                        </div>
                        {summary.byCategory.length === 0 ? (
                            <p className="text-sm text-neutral-400">
                                No conditioning logged in this range.
                            </p>
                        ) : (
                            <BarList
                                items={summary.byCategory.map((entry) => ({
                                    key: entry.category,
                                    label: entry.category,
                                    value: entry.minutes,
                                    valueLabel: `${entry.minutes} min · ${plural(entry.sessions, 'session')}`,
                                }))}
                            />
                        )}
                    </Card>
                </>
            )}
        </div>
    )
}
