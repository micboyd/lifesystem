import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../Button'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import TransformationSummary from './TransformationSummary'
import StrengthCard from './StrengthCard'
import GoalMilestones from './GoalMilestones'
import ProgressTimeline from './ProgressTimeline'
import ProgressPhotos from './ProgressPhotos'
import ProgressCheckDrawer from './ProgressCheckDrawer'
import MetricChart from './MetricChart'
import { listWeightLogs, saveWeightLog, type WeightLogPayload } from '../../services/weightLogs'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listPlanEntries } from '../../services/mealPlan'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listCheckIns, saveCheckIn, listPhotos } from '../../services/progress'
import { addDays, todayKey } from '../../lib/calendar'
import { phaseFor } from '../../lib/nutrition'
import { trendSeries } from '../../lib/weightTrend'
import {
    weightTrend,
    compositionSeries,
    compositionChange,
    usableRate,
} from '../../lib/nutritionTrend'
import { goalProgress } from '../../lib/nutritionGoal'
import { measurementTrend, readingsOf } from '../../lib/bodyMeasurements'
import { strengthSummary } from '../../lib/strengthTrend'
import { readTransformation } from '../../lib/transformation'
import { resolveConfig } from '../../lib/nutritionConfig'
import { adherence } from '../../lib/nutritionAdjustment'
import type {
    MacroGoals,
    MealPlanEntry,
    NutritionPhase,
    ProgressCheckIn,
    ProgressCheckInInput,
    ProgressPhoto,
    WeightLog,
    WorkoutLog,
} from '../../types'

/**
 * Is the recomp working?
 *
 * The Today tab answers "what should I eat"; this answers the question that
 * takes months to become visible. Everything on it is read-only apart from the
 * two log buttons, because the point is interpretation, not entry — and every
 * figure comes from `lib/`, which is where the reasoning about noise, sparse
 * data and unknown-versus-zero lives.
 *
 * All five signals degrade independently. No waist readings, no workout history,
 * no photos and no check-ins is a perfectly ordinary state for this screen, and
 * each section says so in its own words rather than drawing an empty chart.
 */

/** How far back the analysis reaches. A recomp is a nine-month story. */
const HISTORY_DAYS = 400

/** The window the adherence figures on this screen are measured over. */
const ADHERENCE_WINDOW_DAYS = 28

export default function ProgressTab({ settingsGoals }: { settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const since = addDays(today, -HISTORY_DAYS)

    const [logs, setLogs] = useState<WeightLog[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [workouts, setWorkouts] = useState<WorkoutLog[]>([])
    const [checkIns, setCheckIns] = useState<ProgressCheckIn[]>([])
    const [photos, setPhotos] = useState<ProgressPhoto[]>([])
    const [loading, setLoading] = useState(true)
    const [drawer, setDrawer] = useState<'weekly' | 'monthly' | null>(null)

    const load = useCallback(() => {
        // Each source fails soft. A screen that renders the weight trend is more
        // use than one that renders an error because the photo list was slow.
        Promise.all([
            listWeightLogs(since).catch(() => [] as WeightLog[]),
            listNutritionPhases(since, today).catch(() => [] as NutritionPhase[]),
            listPlanEntries(addDays(today, -ADHERENCE_WINDOW_DAYS), today).catch(
                () => [] as MealPlanEntry[]
            ),
            listWorkoutLogs().catch(() => [] as WorkoutLog[]),
            listCheckIns(since).catch(() => [] as ProgressCheckIn[]),
            listPhotos(since).catch(() => [] as ProgressPhoto[]),
        ])
            .then(([w, p, e, k, c, ph]) => {
                setLogs(w)
                setPhases(p)
                setEntries(e)
                setWorkouts(k)
                setCheckIns(c)
                setPhotos(ph)
            })
            .finally(() => setLoading(false))
    }, [since, today])

    useEffect(load, [load])

    const phase = useMemo(() => phaseFor(today, phases), [today, phases])
    // The phase as configuration, with application defaults filled in. Every
    // figure below reads this rather than the raw record.
    const config = useMemo(() => resolveConfig(phase), [phase])
    const trend = useMemo(() => weightTrend(logs, today), [logs, today])
    const points = useMemo(() => trendSeries(logs), [logs])
    const progress = useMemo(() => goalProgress(phase, trend, today), [phase, trend, today])

    const waist = useMemo(() => measurementTrend(logs, 'waist', today), [logs, today])
    const strength = useMemo(() => strengthSummary(workouts, today), [workouts, today])

    const composition = useMemo(() => compositionSeries(logs), [logs])
    const latestComposition = composition.length ? composition[composition.length - 1] : null
    const compChange = useMemo(() => compositionChange(composition), [composition])

    const stats = useMemo(
        () => adherence(entries, phases, settingsGoals, today, ADHERENCE_WINDOW_DAYS),
        [entries, phases, settingsGoals, today]
    )

    const read = useMemo(() => {
        if (!phase?.goal) return null
        return readTransformation({
            rateKgPerWeek: usableRate(trend),
            rate: config?.rate ?? null,
            goalMode: config?.goalMode,
            waist,
            strength,
            adherence: stats,
            checkIns,
            asOf: today,
        })
    }, [phase, trend, waist, strength, stats, checkIns, today])

    // Charts. The weight chart shows raw readings behind the smoothed line, so
    // the daily noise is visible without being the story.
    const weightPoints = useMemo(() => points.map((p) => ({ date: p.date, value: p.weight })), [points])
    const weightTrendPoints = useMemo(
        () => points.map((p) => ({ date: p.date, value: p.trend })),
        [points]
    )
    const waistPoints = useMemo(
        () => readingsOf(logs, 'waist').map((r) => ({ date: r.date, value: r.cm })),
        [logs]
    )

    async function handleSaveWeighIn(payload: WeightLogPayload) {
        const saved = await saveWeightLog(payload)
        setLogs((prev) => [...prev.filter((l) => l.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date)))
    }

    async function handleSaveCheckIn(input: ProgressCheckInInput) {
        const saved = await saveCheckIn(input)
        setCheckIns((prev) => [...prev.filter((c) => c.date !== saved.date), saved].sort((a, b) => a.date.localeCompare(b.date)))
    }

    function reloadPhotos() {
        listPhotos(since).then(setPhotos).catch(() => {})
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" icon="fa-solid fa-ruler" onClick={() => setDrawer('weekly')}>
                    Weekly check-in
                </Button>
                <Button icon="fa-solid fa-camera" onClick={() => setDrawer('monthly')}>
                    Progress check
                </Button>
            </div>

            {phase?.goal ? (
                <TransformationSummary
                    phaseName={phase.name}
                    startDate={phase.startDate}
                    progress={progress}
                    waist={waist}
                    strength={strength}
                    composition={latestComposition}
                    compositionChange={compChange}
                    read={read}
                    adherence={stats}
                />
            ) : (
                <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-chart-line"
                        title="No goal to track against"
                        description="Give the phase covering today a goal — a target weight and date — and this becomes a picture of whether it is working."
                        action={
                            <Link to="/life-plan">
                                <Button variant="secondary">Set up a phase</Button>
                            </Link>
                        }
                    />
                </div>
            )}

            <GoalMilestones
                progress={progress}
                currentBodyFatPct={latestComposition?.bodyFatPct ?? null}
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                    <h3 className="mb-2 text-sm font-bold tracking-tight text-neutral-900">
                        Bodyweight
                    </h3>
                    <MetricChart
                        points={weightPoints}
                        trend={weightTrendPoints}
                        unit="kg"
                        label="Bodyweight"
                        target={progress?.targetKg ?? undefined}
                        targetLabel={progress?.targetKg ? `Target ${progress.targetKg} kg` : undefined}
                    />
                    <p className="mt-1 text-[11px] text-neutral-400">
                        Daily readings behind the smoothed trend. The line is what to read.
                    </p>
                </div>

                <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                    <h3 className="mb-2 text-sm font-bold tracking-tight text-neutral-900">Waist</h3>
                    <MetricChart
                        points={waistPoints}
                        unit="cm"
                        label="Waist"
                        tone="stroke-sky-500"
                    />
                    <p className="mt-1 text-[11px] text-neutral-400">
                        Measured, not interpolated — gaps between readings are real gaps.
                    </p>
                </div>
            </div>

            <StrengthCard summary={strength} />

            <ProgressPhotos photos={photos} logs={logs} />

            <ProgressTimeline logs={logs} photos={photos} checkIns={checkIns} />

            <ProgressCheckDrawer
                open={drawer !== null}
                mode={drawer ?? 'weekly'}
                date={today}
                logs={logs}
                checkIns={checkIns}
                photos={photos}
                onClose={() => setDrawer(null)}
                onSaveWeighIn={handleSaveWeighIn}
                onSaveCheckIn={handleSaveCheckIn}
                onPhotosChanged={reloadPhotos}
            />
        </div>
    )
}
