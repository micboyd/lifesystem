import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import EmptyState from '../EmptyState'
import PillToggle from '../PillToggle'
import Spinner from '../Spinner'
import TrendChart from './TrendChart'
import { longDate } from './format'
import { PanelHeader, Surface } from './ui'
import { useGarminHistory } from './useGarminHistory'
import { todayKey } from '../../lib/calendar'
import {
    addDaysIso,
    bucketAverages,
    bucketFor,
    metricDays,
    summarise,
    type TrendMetric,
    type WatchDay,
} from '../../lib/garminTrends'

const RANGES = [
    { label: '1 year', days: 365 },
    { label: '2 years', days: 730 },
    { label: 'All time', days: null },
] as const

const whole = (v: number) => Math.round(v).toLocaleString('en-GB')
/** Hours as "7h 12m". */
const hoursMins = (h: number) => {
    const mins = Math.round(h * 60)
    return mins % 60 === 0 ? `${mins / 60}h` : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

interface Measure {
    key: string
    title: string
    metric: TrendMetric
    /** Stored value → the value charted (sleep is stored in minutes, read in hours). */
    scale?: number
    format: (v: number) => string
    formatTick?: (v: number) => string
    /** How a change across the range reads: "+1,240 steps". */
    formatChange: (v: number) => string
    minSpan: number
}

const signed = (v: number, text: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${text}`

const MEASURES: Record<string, Measure> = {
    kcal: {
        key: 'kcal',
        title: 'Calories burned',
        metric: 'kcal',
        format: (v) => `${whole(v)} kcal`,
        formatTick: whole,
        formatChange: (v) => signed(v, `${whole(Math.abs(v))} kcal`),
        minSpan: 300,
    },
    activeKcal: {
        key: 'activeKcal',
        title: 'Calories burned',
        metric: 'activeKcal',
        format: (v) => `${whole(v)} kcal`,
        formatTick: whole,
        formatChange: (v) => signed(v, `${whole(Math.abs(v))} kcal`),
        minSpan: 300,
    },
    steps: {
        key: 'steps',
        title: 'Steps',
        metric: 'steps',
        format: (v) => `${whole(v)} steps`,
        formatTick: whole,
        formatChange: (v) => signed(v, `${whole(Math.abs(v))} steps`),
        minSpan: 2000,
    },
    sleep: {
        key: 'sleep',
        title: 'Sleep',
        metric: 'sleepMin',
        scale: 1 / 60,
        format: hoursMins,
        formatChange: (v) => signed(v, `${Math.round(Math.abs(v) * 60)} min`),
        minSpan: 1.5,
    },
    sleepScore: {
        key: 'sleepScore',
        title: 'Sleep score',
        metric: 'sleepScore',
        format: whole,
        formatChange: (v) => signed(v, whole(Math.abs(v))),
        minSpan: 15,
    },
    restingHr: {
        key: 'restingHr',
        title: 'Resting heart rate',
        metric: 'restingHr',
        format: (v) => `${whole(v)} bpm`,
        formatTick: whole,
        formatChange: (v) => signed(v, `${whole(Math.abs(v))} bpm`),
        minSpan: 8,
    },
}

/**
 * The long view from the watch: calories burned, steps, sleep and resting heart
 * rate as far back as Garmin has them, each as one line of weekly (or, over
 * several years, monthly) averages. Read-only, like the rest of Stats.
 */
export default function GarminTrendsPanel() {
    const today = todayKey()
    const { days, sync, status, failed, startError, restart } = useGarminHistory(today)
    const [rangeDays, setRangeDays] = useState<number | null>(365)
    const [calories, setCalories] = useState<'kcal' | 'activeKcal'>('kcal')

    const earliest = days?.[0]?.date ?? null
    const from = rangeDays ? addDaysIso(today, -(rangeDays - 1)) : (earliest ?? today)
    const range = RANGES.find((r) => r.days === rangeDays) ?? RANGES[0]

    if (days === null) {
        if (failed)
            return (
                <EmptyState
                    icon="fa-solid fa-triangle-exclamation"
                    title="Couldn’t load your watch history"
                    description="The stored days didn’t come back. Reload the page to try again."
                />
            )
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    if (days.length === 0 && status !== null && status !== 'connected') {
        return (
            <EmptyState
                icon="fa-solid fa-stopwatch"
                title={status === 'expired' ? 'Reconnect Garmin to see your trends' : 'Connect Garmin to see your trends'}
                description="Once it’s connected, this reads back everything your watch has recorded — calories burned, steps, sleep and resting heart rate — and draws the long view."
                action={
                    <Link to="/profile#garmin" className="text-sm font-medium text-neutral-900 underline underline-offset-4">
                        {status === 'expired' ? 'Reconnect Garmin' : 'Connect Garmin'}
                    </Link>
                }
            />
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <SyncLine
                    earliest={earliest}
                    sync={sync}
                    status={status}
                    startError={startError}
                    onRestart={restart}
                />
                <PillToggle
                    label="Time range"
                    options={RANGES.map((r) => ({ value: r.days ?? 0, label: r.label }))}
                    value={rangeDays ?? 0}
                    onChange={(d) => setRangeDays(d === 0 ? null : d)}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TrendCard
                    measure={MEASURES[calories]}
                    days={days}
                    from={from}
                    today={today}
                    rangeLabel={range.label}
                    aside={
                        <PillToggle
                            label="Which calories"
                            options={[
                                { value: 'kcal', label: 'Total' },
                                { value: 'activeKcal', label: 'Active' },
                            ]}
                            value={calories}
                            onChange={setCalories}
                        />
                    }
                />
                <TrendCard measure={MEASURES.steps} days={days} from={from} today={today} rangeLabel={range.label} />
                <TrendCard measure={MEASURES.sleep} days={days} from={from} today={today} rangeLabel={range.label} />
                <TrendCard measure={MEASURES.sleepScore} days={days} from={from} today={today} rangeLabel={range.label} />
                <TrendCard measure={MEASURES.restingHr} days={days} from={from} today={today} rangeLabel={range.label} />
            </div>
        </div>
    )
}

/** Where the history stands: how far back it goes, and whether it's still being read. */
function SyncLine({
    earliest,
    sync,
    status,
    startError,
    onRestart,
}: {
    earliest: string | null
    sync: ReturnType<typeof useGarminHistory>['sync']
    status: ReturnType<typeof useGarminHistory>['status']
    startError: string | null
    onRestart: () => void
}) {
    const reconnect = status === 'expired' || sync?.error?.code === 'session_expired'
    const problem = startError ?? sync?.error?.message ?? null
    let text: string
    if (sync?.running)
        text = sync.from
            ? `Reading your Garmin history — back to ${longDate(sync.from)} so far`
            : 'Reading your Garmin history…'
    else if (!earliest) text = 'No watch data yet.'
    else if (sync?.complete) text = `Everything Garmin has, from ${longDate(earliest)}.`
    else text = `Back to ${longDate(earliest)} so far.`

    return (
        <div className="flex min-w-0 flex-col gap-1 text-[13px] text-neutral-500">
            <p className="flex items-center gap-2">
                {sync?.running && <Spinner size="sm" />}
                <span>{text}</span>
            </p>
            {!sync?.running && problem && (
                <p className="text-neutral-700">
                    {problem}{' '}
                    {reconnect ? (
                        <Link to="/profile#garmin" className="font-medium text-neutral-900 underline underline-offset-4">
                            Reconnect Garmin
                        </Link>
                    ) : (
                        'It carries on from here next time you open this.'
                    )}
                </p>
            )}
            {!sync?.running && !problem && !!sync?.failed.length && (
                <p className="text-neutral-700">
                    Garmin didn’t answer for {sync.failed.map(measureName).join(', ')} on part of that.{' '}
                    <button
                        type="button"
                        onClick={onRestart}
                        className="font-medium text-neutral-900 underline underline-offset-4"
                    >
                        Read it all again
                    </button>
                </p>
            )}
        </div>
    )
}

function measureName(m: string): string {
    return m === 'restingHr' ? 'resting heart rate' : m
}

function TrendCard({
    measure,
    days,
    from,
    today,
    rangeLabel,
    aside,
}: {
    measure: Measure
    days: WatchDay[]
    from: string
    today: string
    rangeLabel: string
    aside?: ReactNode
}) {
    const { points, bucket, summary } = useMemo(() => {
        const k = measure.scale ?? 1
        const values = metricDays(days, measure.metric, from, today, today).map((v) => ({
            date: v.date,
            value: v.value * k,
        }))
        const b = bucketFor(from, today)
        return { points: bucketAverages(values, b), bucket: b, summary: summarise(values, today) }
    }, [days, measure, from, today])

    return (
        <Surface className="flex flex-col gap-4">
            <PanelHeader
                title={measure.title}
                hint={`A day, averaged by ${bucket} · ${rangeLabel.toLowerCase()}`}
                aside={aside}
            />
            <dl className="grid grid-cols-3 gap-3">
                <Figure label="Average" value={summary.average !== null ? measure.format(summary.average) : '—'} />
                <Figure label="Last 4 weeks" value={summary.recent !== null ? measure.format(summary.recent) : '—'} />
                <Figure
                    label="Since the start"
                    value={summary.change !== null ? measure.formatChange(summary.change) : '—'}
                    title={
                        summary.start !== null && summary.firstDate
                            ? `First 4 weeks from ${longDate(summary.firstDate)}: ${measure.format(summary.start)}`
                            : undefined
                    }
                />
            </dl>
            <TrendChart
                points={points}
                bucket={bucket}
                from={from}
                to={today}
                label={measure.title}
                format={measure.format}
                formatTick={measure.formatTick}
                minSpan={measure.minSpan}
            />
        </Surface>
    )
}

function Figure({ label, value, title }: { label: string; value: string; title?: string }) {
    return (
        <div className="min-w-0" title={title}>
            <dt className="truncate text-[13px] text-neutral-500">{label}</dt>
            <dd className="nums truncate text-[15px] font-semibold sm:text-[17px] tracking-tight text-neutral-900">{value}</dd>
        </div>
    )
}
