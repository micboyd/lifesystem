import { useEffect, useMemo, useState } from 'react'
import { Card } from '../Card'
import EmptyState from '../EmptyState'
import MetricChart from '../MetricChart'
import PillToggle from '../PillToggle'
import Select from '../Select'
import StatTile from '../StatTile'
import {
    exerciseHistory,
    exerciseRecords,
    metricSeries,
    trackedExercises,
    windowChange,
    PROGRESS_METRICS,
    type ProgressMetric,
} from '../../lib/exerciseProgress'
import { PERFORMANCE_LABELS } from '../../lib/strengthTrend'
import type { WorkoutLog } from '../../types'
import { kg, longDate, plural, setLabel, shortDate, signedPct, STATUS_TONE, tonnage } from './format'

/** The window each exercise's "is this going up" verdict compares over. */
const COMPARE_DAYS = 42

/** How many sessions the table under the chart lists. */
const RECENT_SESSIONS = 8

/**
 * Progression for one exercise at a time.
 *
 * The exercise picker is ordered by how often you've logged the movement, not
 * alphabetically — what you train most should take the least scrolling. The
 * chart is clipped to the selected range, but the records underneath never are:
 * a personal best is all-time by definition, and quietly hiding March's best
 * because the range says "8 weeks" would make the board a lie.
 */
export default function ExerciseProgressPanel({
    logs,
    since,
    today,
    rangeLabel,
}: {
    logs: WorkoutLog[]
    /** Earliest date the chart plots, or '' for everything. */
    since: string
    today: string
    rangeLabel: string
}) {
    const tracked = useMemo(() => trackedExercises(logs), [logs])
    const [selected, setSelected] = useState('')
    const [metric, setMetric] = useState<ProgressMetric>('e1rm')

    // Default to the most-logged exercise, and recover if the current pick
    // disappears (its last session was deleted).
    useEffect(() => {
        if (tracked.length === 0) return
        if (!tracked.some((t) => t.key === selected)) setSelected(tracked[0].key)
    }, [tracked, selected])

    const history = useMemo(
        () => (selected ? exerciseHistory(logs, selected) : []),
        [logs, selected]
    )
    const series = useMemo(() => metricSeries(history, metric), [history, metric])
    const shown = useMemo(
        () => (since ? series.filter((p) => p.date >= since) : series),
        [series, since]
    )
    const change = useMemo(() => windowChange(series, today, COMPARE_DAYS), [series, today])
    const records = useMemo(() => exerciseRecords(history), [history])

    if (tracked.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-chart-line"
                title="No weights logged yet"
                description="Log a strength session with the weight and reps on each set, and the progression charts build themselves from there. A session logged as a quick “Done” has nothing to plot."
            />
        )
    }

    const current = tracked.find((t) => t.key === selected)
    const metricMeta = PROGRESS_METRICS.find((m) => m.value === metric)!
    const latest = series.length ? series[series.length - 1] : null
    const latestSession = history.length ? history[history.length - 1] : null
    const inRange = since ? history.filter((s) => s.date >= since) : history
    const format = metric === 'volume' ? (v: number) => Math.round(v).toLocaleString('en-GB') : undefined

    return (
        <div className="flex flex-col gap-6">
            <Select
                label="Exercise"
                icon="fa-solid fa-dumbbell"
                options={tracked.map((t) => ({
                    value: t.key,
                    label: `${t.name} · ${plural(t.sessions, 'session')}`,
                }))}
                value={selected}
                onChange={setSelected}
                className="sm:max-w-md"
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label={metricMeta.label}
                    value={
                        latest ? (metric === 'volume' ? tonnage(latest.value) : kg(latest.value)) : '—'
                    }
                    sub={
                        latestSession
                            ? `Last done ${longDate(latestSession.date)}`
                            : 'Nothing logged yet'
                    }
                />
                <StatTile
                    label={`Trend · ${COMPARE_DAYS / 7} weeks`}
                    value={change.changePct === null ? '—' : signedPct(change.changePct)}
                    sub={
                        change.changePct === null
                            ? `Needs 2 sessions in each ${COMPARE_DAYS / 7}-week window`
                            : `${PERFORMANCE_LABELS[change.status]} vs the ${COMPARE_DAYS / 7} weeks before`
                    }
                    tone={STATUS_TONE[change.status]}
                />
                <StatTile
                    label="Heaviest ever"
                    value={records.heaviest ? kg(records.heaviest.weightKg) : '—'}
                    sub={
                        records.heaviest
                            ? `× ${records.heaviest.reps} · ${longDate(records.heaviest.date)}`
                            : 'No working sets recorded'
                    }
                />
                <StatTile
                    label="Sessions"
                    value={String(inRange.length)}
                    sub={
                        current
                            ? `${rangeLabel} · ${plural(current.sessions, 'session')} all time`
                            : undefined
                    }
                />
            </div>

            <Card hover={false} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-neutral-900">
                            {current?.name ?? 'Progression'}
                        </h3>
                        <p className="text-xs text-neutral-500">{metricMeta.hint}</p>
                    </div>
                    <PillToggle
                        label="Chart metric"
                        options={PROGRESS_METRICS.map((m) => ({ value: m.value, label: m.label }))}
                        value={metric}
                        onChange={setMetric}
                    />
                </div>

                <MetricChart
                    points={shown}
                    unit="kg"
                    label={`${current?.name ?? 'Exercise'} ${metricMeta.label}`}
                    format={format}
                />

                {shown.length < series.length && (
                    <p className="text-[11px] text-neutral-400">
                        Showing {rangeLabel.toLowerCase()} — {series.length - shown.length} earlier
                        {series.length - shown.length === 1 ? ' session' : ' sessions'} not plotted.
                    </p>
                )}
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card hover={false} className="flex flex-col gap-3">
                    <h3 className="text-sm font-bold text-neutral-900">Recent sessions</h3>
                    {history.length === 0 ? (
                        <p className="text-sm text-neutral-400">Nothing logged yet.</p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <div className="grid grid-cols-[4.5rem_1fr_auto] gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                <span>Date</span>
                                <span>Top set</span>
                                <span className="text-right">Volume</span>
                            </div>
                            {[...history]
                                .reverse()
                                .slice(0, RECENT_SESSIONS)
                                .map((session) => {
                                    const top = session.topSet
                                    return (
                                        <div
                                            key={session.date}
                                            className="grid grid-cols-[4.5rem_1fr_auto] items-baseline gap-2 rounded-lg px-1 py-1 text-sm odd:bg-neutral-50/70"
                                        >
                                            <span className="tabular-nums text-neutral-400">
                                                {shortDate(session.date)}
                                            </span>
                                            <span className="font-semibold tabular-nums text-neutral-900">
                                                {top && top.weight != null && top.reps != null
                                                    ? setLabel(top.weight, top.reps)
                                                    : '—'}
                                                <span className="ml-2 font-normal text-neutral-400">
                                                    {plural(session.workingSets, 'set')}
                                                </span>
                                            </span>
                                            <span className="text-right tabular-nums text-neutral-500">
                                                {session.volumeKg > 0
                                                    ? tonnage(session.volumeKg)
                                                    : '—'}
                                            </span>
                                        </div>
                                    )
                                })}
                        </div>
                    )}
                </Card>

                <Card hover={false} className="flex flex-col gap-3">
                    <div>
                        <h3 className="text-sm font-bold text-neutral-900">Personal bests</h3>
                        <p className="text-xs text-neutral-500">
                            All-time, whatever the range above says.
                        </p>
                    </div>
                    <div className="flex flex-col gap-2">
                        <Best
                            label="Heaviest set"
                            value={
                                records.heaviest
                                    ? setLabel(records.heaviest.weightKg, records.heaviest.reps)
                                    : null
                            }
                            date={records.heaviest?.date}
                        />
                        <Best
                            label="Best est. 1RM"
                            value={records.bestE1rm ? kg(records.bestE1rm.e1rmKg) : null}
                            date={records.bestE1rm?.date}
                            note={
                                records.bestE1rm
                                    ? `from ${setLabel(records.bestE1rm.weightKg, records.bestE1rm.reps)}`
                                    : undefined
                            }
                        />
                        <Best
                            label="Biggest session"
                            value={records.bestVolume ? tonnage(records.bestVolume.volumeKg) : null}
                            date={records.bestVolume?.date}
                        />
                    </div>
                </Card>
            </div>
        </div>
    )
}

/** One record line: what it was, when, and the honest set behind an estimate. */
function Best({
    label,
    value,
    date,
    note,
}: {
    label: string
    value: string | null
    date?: string
    note?: string
}) {
    return (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </span>
            <span className="flex items-baseline gap-2">
                <span className="text-sm font-bold tabular-nums text-neutral-900">
                    {value ?? '—'}
                </span>
                {note && <span className="text-[11px] text-neutral-400">{note}</span>}
                {date && <span className="text-[11px] tabular-nums text-neutral-400">{longDate(date)}</span>}
            </span>
        </div>
    )
}
