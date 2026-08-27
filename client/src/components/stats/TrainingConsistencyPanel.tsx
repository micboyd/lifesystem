import { useMemo } from 'react'
import BarList from './BarList'
import { Card } from '../Card'
import EmptyState from '../EmptyState'
import StatTile from '../StatTile'
import { exerciseKey } from '../../lib/exerciseProgress'
import { inferMuscleGroup, resolveTags } from '../../lib/exerciseSwap'
import {
    consistency,
    muscleBalance,
    weeklyLoad,
    weekStreaks,
    UNTAGGED_GROUP,
    type WeekLoad,
} from '../../lib/trainingLoad'
import type { Exercise, WorkoutLog } from '../../types'
import { longDate, plural, shortDate, tonnage } from './format'

/** The window the headline "are you turning up" figures are measured over. */
const RECENT_DAYS = 28

/** Weeks charted when the range is "all time" — a season's worth. */
const DEFAULT_WEEKS = 26

/**
 * Turning up, and where the work is landing.
 *
 * Two questions, in the order they matter. Whether you trained at all comes
 * first, because a stalled lift after a month of one session a week is not a
 * programming problem. Then which muscle groups got the volume — the split
 * nobody plans to skew and almost everybody does, because the exercises you
 * enjoy are the ones that end up in the workout.
 */
export default function TrainingConsistencyPanel({
    logs,
    exercises,
    since,
    today,
    rangeDays,
    rangeLabel,
}: {
    logs: WorkoutLog[]
    /** The exercise library — the source of explicit muscle-group tags. */
    exercises: Exercise[]
    since: string
    today: string
    /** Days the selected range covers, or null for all time. */
    rangeDays: number | null
    rangeLabel: string
}) {
    const recent = useMemo(() => consistency(logs, today, RECENT_DAYS), [logs, today])
    const ranged = useMemo(
        () => consistency(logs, today, rangeDays ?? 3650),
        [logs, today, rangeDays]
    )
    const streaks = useMemo(() => weekStreaks(logs, today), [logs, today])

    const weeks = useMemo(() => {
        const count = rangeDays ? Math.min(52, Math.max(4, Math.round(rangeDays / 7))) : DEFAULT_WEEKS
        return weeklyLoad(logs, count, today)
    }, [logs, rangeDays, today])

    /**
     * Name → muscle group. The library's explicit tag wins; anything logged
     * under a name the library no longer has is read from the name itself, the
     * same way the swap picker reads an untagged exercise.
     */
    const groupOf = useMemo(() => {
        const byKey = new Map<string, string>()
        for (const exercise of exercises) {
            const tags = resolveTags(exercise)
            if (tags.muscleGroup) byKey.set(exerciseKey(exercise.name), tags.muscleGroup)
        }
        return (name: string) =>
            byKey.get(exerciseKey(name)) ?? inferMuscleGroup({ name, description: '' })
    }, [exercises])

    const balance = useMemo(
        () => muscleBalance(logs, groupOf, since || undefined),
        [logs, groupOf, since]
    )

    if (logs.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-calendar-check"
                title="No strength sessions logged"
                description="Log a workout from the planner or the Strength tab and the consistency picture starts here — sessions a week, tonnage, and which muscle groups are actually getting the work."
            />
        )
    }

    const trainedWeeks = weeks.filter((w) => w.sessions > 0).length
    const balanceTotal = balance.reduce((sum, g) => sum + g.volumeKg, 0)

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label={`Last ${RECENT_DAYS} days`}
                    value={plural(recent.sessions, 'session')}
                    sub={`${recent.perWeek.toFixed(1)} a week`}
                    tone={recent.sessions === 0 ? 'warn' : 'neutral'}
                />
                <StatTile
                    label="Current streak"
                    value={plural(streaks.current, 'week')}
                    sub={
                        streaks.longest > streaks.current
                            ? `Best run ${plural(streaks.longest, 'week')}`
                            : 'Your best run yet'
                    }
                    tone={streaks.current >= 4 ? 'good' : 'neutral'}
                />
                <StatTile
                    label={`Volume · ${rangeLabel.toLowerCase()}`}
                    value={tonnage(ranged.volumeKg)}
                    sub={`${plural(ranged.sets, 'working set')} across ${plural(ranged.sessions, 'session')}`}
                />
                <StatTile
                    label="Last session"
                    value={
                        recent.daysSince === null
                            ? '—'
                            : recent.daysSince === 0
                              ? 'Today'
                              : plural(recent.daysSince, 'day')
                    }
                    sub={recent.lastDate ? longDate(recent.lastDate) : 'Nothing logged yet'}
                    tone={recent.daysSince !== null && recent.daysSince > 10 ? 'warn' : 'neutral'}
                />
            </div>

            <Card hover={false} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-neutral-900">Weekly volume</h3>
                        <p className="text-xs text-neutral-500">
                            Total kilograms moved each week. Empty weeks are drawn as empty.
                        </p>
                    </div>
                    <p className="text-xs tabular-nums text-neutral-400">
                        {trainedWeeks} of {weeks.length} weeks trained
                    </p>
                </div>
                <WeekBars weeks={weeks} />
            </Card>

            <Card hover={false} className="flex flex-col gap-4">
                <div>
                    <h3 className="text-sm font-bold text-neutral-900">Where the work went</h3>
                    <p className="text-xs text-neutral-500">
                        Volume by muscle group, {rangeLabel.toLowerCase()}. Groups you never train
                        simply aren&rsquo;t here — which is its own answer.
                    </p>
                </div>
                {balance.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                        No sets with a weight and reps on them in this range.
                    </p>
                ) : (
                    <BarList
                        items={balance.map((group) => ({
                            key: group.group,
                            label: group.group,
                            value: group.volumeKg,
                            valueLabel: `${tonnage(group.volumeKg)} · ${
                                balanceTotal > 0
                                    ? Math.round((group.volumeKg / balanceTotal) * 100)
                                    : 0
                            }% · ${plural(group.sessions, 'day')}`,
                            muted: group.group === UNTAGGED_GROUP,
                        }))}
                    />
                )}
            </Card>
        </div>
    )
}

/**
 * Weekly tonnage as bars, with the mean drawn across them.
 *
 * The mean line is the point of the chart: a single week's number says nothing,
 * and what you want to see is whether the last month sits above or below the way
 * you normally train. Empty weeks keep a hairline stub so a run of nothing reads
 * as a gap in a rhythm rather than as the chart ending.
 */
function WeekBars({ weeks }: { weeks: WeekLoad[] }) {
    const max = Math.max(...weeks.map((w) => w.volumeKg), 1)
    const trained = weeks.filter((w) => w.volumeKg > 0)
    const mean = trained.length
        ? trained.reduce((sum, w) => sum + w.volumeKg, 0) / trained.length
        : 0

    return (
        <div className="flex flex-col gap-2">
            <div className="relative flex h-40 items-end gap-[3px]">
                {mean > 0 && (
                    <div
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-neutral-300"
                        style={{ bottom: `${(mean / max) * 100}%` }}
                    >
                        <span className="absolute -top-4 right-0 text-[10px] font-semibold tabular-nums text-neutral-400">
                            avg {tonnage(mean)}
                        </span>
                    </div>
                )}
                {weeks.map((week) => (
                    <div
                        key={week.weekStart}
                        title={`Week of ${longDate(week.weekStart)} · ${
                            week.sessions === 0
                                ? 'no sessions'
                                : `${plural(week.sessions, 'session')} · ${tonnage(week.volumeKg)}`
                        }`}
                        className="flex h-full flex-1 items-end"
                    >
                        <div
                            className={`w-full rounded-t-sm ${
                                week.volumeKg > 0 ? 'bg-coral-500' : 'bg-neutral-200'
                            }`}
                            style={{
                                height:
                                    week.volumeKg > 0
                                        ? `${Math.max(2, (week.volumeKg / max) * 100)}%`
                                        : '2px',
                            }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-between text-[11px] tabular-nums text-neutral-400">
                <span>{shortDate(weeks[0].weekStart)}</span>
                <span>{shortDate(weeks[weeks.length - 1].weekStart)}</span>
            </div>
        </div>
    )
}
