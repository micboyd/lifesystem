import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../EmptyState'
import PillToggle from '../PillToggle'
import Spinner from '../Spinner'
import Tabs from '../Tabs'
import ConditioningPanel from './ConditioningPanel'
import ExerciseProgressPanel from './ExerciseProgressPanel'
import RecordsPanel from './RecordsPanel'
import TrainingConsistencyPanel from './TrainingConsistencyPanel'
import { todayKey } from '../../lib/calendar'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listExercises } from '../../services/exercises'
import { listWeightLogs } from '../../services/weightLogs'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import type { ConditioningLog, Exercise, WeightLog, WorkoutLog } from '../../types'

const SUB_TABS = ['Progression', 'Consistency', 'Records', 'Conditioning'] as const
type SubTab = (typeof SUB_TABS)[number]

/**
 * How far back the whole tab looks. One control for every panel, because the
 * alternative — a range per card — makes two numbers on one screen quietly
 * describe different stretches of time.
 */
const RANGES = [
    { label: '8 weeks', days: 56 },
    { label: '6 months', days: 182 },
    { label: '12 months', days: 365 },
    { label: 'All time', days: null },
] as const

/** Six months: long enough for a training block to have happened, short enough to still be you. */
const DEFAULT_RANGE = 182

/**
 * The stats centre: everything the fitness logs already know, read back.
 *
 * All four panels run off the same fetch. The logs are small enough to hold in
 * one page — a year of training is a few hundred records — and computing in the
 * browser means every panel can slice the same data differently without a round
 * trip or a second endpoint that would drift from the first.
 *
 * Nothing here writes. That is deliberate: a page you can only read is a page
 * you can leave open mid-session without wondering whether you've changed
 * something.
 */
export default function FitnessStats() {
    const [tab, setTab] = useState<SubTab>('Progression')
    const [rangeDays, setRangeDays] = useState<number | null>(DEFAULT_RANGE)

    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)
    const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([])
    const [conditioningLogs, setConditioningLogs] = useState<ConditioningLog[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [weightLogs, setWeightLogs] = useState<WeightLog[]>([])

    useEffect(() => {
        let active = true
        Promise.all([
            listWorkoutLogs(),
            listConditioningLogs(),
            listExercises(),
            listWeightLogs(),
        ])
            .then(([wo, co, ex, we]) => {
                if (!active) return
                setWorkoutLogs(wo)
                setConditioningLogs(co)
                setExercises(ex)
                setWeightLogs(we)
            })
            .catch(() => {
                if (active) setFailed(true)
            })
            .finally(() => {
                if (active) setLoading(false)
            })
        return () => {
            active = false
        }
    }, [])

    const today = todayKey()
    const range = RANGES.find((r) => r.days === rangeDays) ?? RANGES[1]
    const since = useMemo(
        () => (range.days ? addDaysIso(today, -(range.days - 1)) : ''),
        [range.days, today]
    )

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    if (failed) {
        return (
            <EmptyState
                icon="fa-solid fa-triangle-exclamation"
                title="Couldn’t load your stats"
                description="The training logs didn’t come back. Reload the page — nothing here writes, so there’s nothing to lose."
            />
        )
    }

    if (workoutLogs.length === 0 && conditioningLogs.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-chart-simple"
                title="Nothing to report yet"
                description="Log a strength session or a conditioning session and this fills in on its own — progression per exercise, how often you're training, records, and where the volume is going."
            />
        )
    }

    const shared = { since, today, rangeLabel: range.label }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Tabs
                    tabs={[...SUB_TABS]}
                    value={tab}
                    onChange={(t) => setTab(t as SubTab)}
                    className="self-start"
                />
                <PillToggle
                    label="Time range"
                    options={RANGES.map((r) => ({ value: r.days ?? 0, label: r.label }))}
                    value={rangeDays ?? 0}
                    onChange={(days) => setRangeDays(days === 0 ? null : days)}
                />
            </div>

            {tab === 'Progression' ? (
                <ExerciseProgressPanel logs={workoutLogs} {...shared} />
            ) : tab === 'Consistency' ? (
                <TrainingConsistencyPanel
                    logs={workoutLogs}
                    exercises={exercises}
                    rangeDays={range.days}
                    {...shared}
                />
            ) : tab === 'Records' ? (
                <RecordsPanel logs={workoutLogs} {...shared} />
            ) : (
                <ConditioningPanel
                    conditioningLogs={conditioningLogs}
                    workoutLogs={workoutLogs}
                    weightLogs={weightLogs}
                    {...shared}
                />
            )}
        </div>
    )
}

/** Add `n` days to a YYYY-MM-DD date, in UTC so no timezone can shift it. */
function addDaysIso(date: string, n: number): string {
    const ms = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000
    return new Date(ms).toISOString().slice(0, 10)
}
