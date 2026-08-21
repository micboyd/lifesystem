import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../Button'
import Input from '../Input'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import NutritionTargetCard from './NutritionTargetCard'
import NutritionGoalCard from './NutritionGoalCard'
import NutritionReview from './NutritionReview'
import { fmt, kcal } from './format'
import { listPlanEntries, setEntryStatus } from '../../services/mealPlan'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { listWeightLogs } from '../../services/weightLogs'
import { listNutritionPhases, addPhaseAdjustment } from '../../services/nutritionPhases'
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listCheckIns } from '../../services/progress'
import { addDays, todayKey } from '../../lib/calendar'
import { entryMacros, entryName, sumEatenMacros, sumPendingMacros } from '../../lib/nutrition'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { trendSeries } from '../../lib/weightTrend'
import {
    weightTrend,
    compositionSeries,
    compositionChange,
    usableRate,
    type WeightTrend,
    type TrendGap,
} from '../../lib/nutritionTrend'
import { goalProgress } from '../../lib/nutritionGoal'
import { measurementTrend } from '../../lib/bodyMeasurements'
import { strengthSummary } from '../../lib/strengthTrend'
import { readTransformation } from '../../lib/transformation'
import { resolveConfig } from '../../lib/nutritionConfig'
import {
    adherence,
    reviewNutrition,
    REVIEW_WINDOW_DAYS,
    type Recommendation,
} from '../../lib/nutritionAdjustment'
import {
    dailyIntake,
    measuredMaintenance,
    dayEnergy,
    targetVerdict,
    MAINTENANCE_WINDOW_DAYS,
    type Verdict,
    type Maintenance,
    type MaintenanceGap,
} from '../../lib/energy'
import { MEAL_TYPES } from '../../types'
import type {
    DailyEnergy,
    EntryStatus,
    FitnessPlanEntry,
    MacroGoals,
    MealPlanEntry,
    NutritionPhase,
    NutritionPhaseKind,
    ProgressCheckIn,
    WeightLog,
    WorkoutLog,
} from '../../types'

/**
 * The day, against the plan — and the plan, against the goal.
 *
 * The weekly planner is where a week gets designed; this is where a day gets
 * lived and where the long arc is visible. It answers, in order of how much they
 * matter: what should I eat today, what have I eaten, am I hitting protein, and
 * — further down, because it moves on a scale of months — is any of this
 * actually working.
 *
 * All the arithmetic happens in `lib/`. This assembles data and renders results.
 */

// ── History window ───────────────────────────────────────────────────────────

/**
 * How far back the analysis reaches. The review looks at three weeks, the
 * maintenance estimate at four, and the weight trend wants a good deal more
 * history than either so its smoothing has something to start from.
 */
const ANALYSIS_DAYS = Math.max(MAINTENANCE_WINDOW_DAYS, REVIEW_WINDOW_DAYS)
const WEIGHT_HISTORY_DAYS = 365

const KIND_LABEL: Record<NutritionPhaseKind, string> = {
    cut: 'Cut',
    maintain: 'Maintain',
    gain: 'Bulk',
}

const KIND_CHIP: Record<NutritionPhaseKind, string> = {
    cut: 'bg-sky-50 text-sky-700',
    maintain: 'bg-neutral-100 text-neutral-600',
    gain: 'bg-marigold/20 text-amber-700',
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** The manual burn entry — one number, saved or cleared. */
function BurnEntry({
    logged,
    fallback,
    onSave,
    onClear,
}: {
    logged: DailyEnergy | null
    fallback: Maintenance | MaintenanceGap
    onSave: (kcalOut: number) => Promise<void>
    onClear: () => Promise<void>
}) {
    const [value, setValue] = useState(logged ? String(logged.caloriesOut) : '')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function submit() {
        const n = Number(value)
        if (!value.trim() || !Number.isFinite(n) || n <= 0) {
            setError('Enter a positive number')
            return
        }
        setError('')
        setBusy(true)
        try {
            await onSave(n)
        } catch {
            setError('Could not save that')
        } finally {
            setBusy(false)
        }
    }

    async function clear() {
        setBusy(true)
        try {
            await onClear()
        } finally {
            setBusy(false)
        }
    }

    const hint =
        typeof fallback === 'object'
            ? `Unset, so today falls back to your measured maintenance of ${kcal(fallback.kcal)} kcal.`
            : 'Total for the whole day — resting plus movement, as your watch reports it.'

    return (
        <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="w-36">
                    <Input
                        label="Calories out"
                        type="number"
                        inputMode="numeric"
                        placeholder="2,500"
                        value={value}
                        error={error}
                        onChange={(e) => setValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submit()
                        }}
                    />
                </div>
                <Button onClick={submit} disabled={busy}>
                    Save
                </Button>
                {logged && (
                    <Button variant="ghost" onClick={clear} disabled={busy}>
                        Clear
                    </Button>
                )}
            </div>
            {!error && (
                <p className="mt-2 text-[11px] text-neutral-400">
                    {logged ? 'Total for the whole day — resting plus movement.' : hint}
                </p>
            )}
        </div>
    )
}

/**
 * Protein over the last three weeks. It gets its own strip because it is the one
 * macro where the running record matters more than today's figure — a single
 * short day is nothing, and four in a row during a deficit is how a cut turns
 * into muscle loss.
 */
function ProteinRecord({
    avgProteinG,
    hitDays,
    targetDays,
    windowDays,
    targetG,
}: {
    avgProteinG: number | null
    hitDays: number
    targetDays: number
    windowDays: number
    targetG?: number
}) {
    if (avgProteinG === null) return null
    const pct = targetDays > 0 ? Math.round((hitDays / targetDays) * 100) : null

    return (
        <div className="rounded-2xl border border-neutral-100 bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    Protein over {windowDays} days
                </h4>
                {targetG ? (
                    <span className="text-[11px] text-neutral-400">Target {fmt(targetG)} g/day</span>
                ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p className="text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                    {fmt(avgProteinG)}
                    <span className="ml-1 text-xs font-medium text-neutral-400">g average</span>
                </p>
                {pct !== null && (
                    <p className="text-sm font-semibold tabular-nums text-neutral-600">
                        {hitDays}/{targetDays} days on target
                        <span className="ml-1.5 text-xs font-medium text-neutral-400">{pct}%</span>
                    </p>
                )}
            </div>
        </div>
    )
}

/** Today's meals, tickable — so logging the day never means leaving this tab. */
function MealList({
    entries,
    onSetStatus,
}: {
    entries: MealPlanEntry[]
    onSetStatus: (id: string, status: EntryStatus) => void
}) {
    const bySlot = MEAL_TYPES.map((slot) => ({
        slot,
        meals: entries.filter((e) => e.slot === slot),
    })).filter((g) => g.meals.length > 0)

    if (bySlot.length === 0) {
        return (
            <p className="rounded-2xl border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                Nothing planned for today.{' '}
                <Link to="/nutrition" className="font-semibold text-neutral-700 underline">
                    Plan the week
                </Link>
            </p>
        )
    }

    return (
        <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100">
            {bySlot.map(({ slot, meals }) =>
                meals.map((e) => {
                    const eaten = e.status === 'eaten'
                    const skipped = e.status === 'skipped'
                    const m = entryMacros(e)
                    const servings = e.servings ?? 1
                    return (
                        <li key={e._id} className="flex items-center gap-3 px-3 py-2.5">
                            <button
                                type="button"
                                aria-label={`${eaten ? 'Unmark' : 'Mark eaten'}: ${entryName(e)}`}
                                onClick={() => onSetStatus(e._id, eaten ? 'planned' : 'eaten')}
                                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                                    eaten
                                        ? 'text-emerald-500'
                                        : 'text-neutral-300 hover:text-emerald-500'
                                }`}
                            >
                                <i
                                    className={
                                        eaten
                                            ? 'fa-solid fa-circle-check text-sm'
                                            : 'fa-regular fa-circle text-sm'
                                    }
                                    aria-hidden="true"
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                <p
                                    className={`truncate text-[13px] font-semibold text-neutral-800 ${
                                        skipped ? 'line-through opacity-50' : ''
                                    }`}
                                >
                                    {entryName(e)}
                                    {servings !== 1 && (
                                        <span className="ml-1.5 text-[11px] font-bold text-neutral-400">
                                            ×{fmt(servings)}
                                        </span>
                                    )}
                                </p>
                                <p className="text-[11px] capitalize tabular-nums text-neutral-400">
                                    {slot} · {kcal(m.calories)} kcal · P{fmt(m.protein)} C
                                    {fmt(m.carbs)} F{fmt(m.fat)}
                                </p>
                            </div>
                        </li>
                    )
                })
            )}
        </ul>
    )
}

// ── The tab ──────────────────────────────────────────────────────────────────

export default function TodayTab({ settingsGoals }: { settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const windowStart = addDays(today, -ANALYSIS_DAYS)

    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [logs, setLogs] = useState<WeightLog[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [burns, setBurns] = useState<DailyEnergy[]>([])
    const [fitness, setFitness] = useState<FitnessPlanEntry[]>([])
    const [workouts, setWorkouts] = useState<WorkoutLog[]>([])
    const [checkIns, setCheckIns] = useState<ProgressCheckIn[]>([])
    const [loading, setLoading] = useState(true)
    const [reviewOpen, setReviewOpen] = useState(false)

    const load = useCallback(() => {
        Promise.all([
            listPlanEntries(windowStart, today),
            listWeightLogs(addDays(today, -WEIGHT_HISTORY_DAYS)),
            // The whole window, not just today: resolving what a past day was
            // measured against needs the phase that covered it.
            listNutritionPhases(windowStart, today),
            listDailyEnergy(windowStart, today),
            // Training only matters for today's target, so only today is fetched.
            listFitnessEntries(today, today).catch(() => [] as FitnessPlanEntry[]),
            // Supporting context for the review. Both fail soft — they colour
            // the explanation, and the calorie decision stands without them.
            listWorkoutLogs().catch(() => [] as WorkoutLog[]),
            listCheckIns(addDays(today, -180)).catch(() => [] as ProgressCheckIn[]),
        ])
            .then(([e, w, p, b, f, k, c]) => {
                setEntries(e)
                setLogs(w)
                setPhases(p)
                setBurns(b)
                setFitness(f)
                setWorkouts(k)
                setCheckIns(c)
            })
            .finally(() => setLoading(false))
    }, [windowStart, today])

    useEffect(load, [load])

    const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
    const loggedBurn = useMemo(() => burns.find((b) => b.date === today) ?? null, [burns, today])

    const points = useMemo(() => trendSeries(logs), [logs])
    const maintenance = useMemo(
        () => measuredMaintenance(dailyIntake(entries), points, MAINTENANCE_WINDOW_DAYS, today),
        [entries, points, today]
    )

    // The trend anchors on today rather than the last weigh-in, so a few days
    // away from the scale shows as thinning data instead of a frozen figure.
    const trend: WeightTrend | TrendGap = useMemo(() => weightTrend(logs, today), [logs, today])

    const targets = useMemo(
        () => effectiveTargetsFor(today, phases, settingsGoals, fitness),
        [today, phases, settingsGoals, fitness]
    )
    const { goals, source, phase, dayType, modifier } = targets
    // The phase as configuration, with application defaults filled in.
    const config = useMemo(() => resolveConfig(phase), [phase])
    const kind = phase?.kind ?? null

    const day = useMemo(
        () => dayEnergy(todayEntries, loggedBurn, maintenance),
        [todayEntries, loggedBurn, maintenance]
    )
    const eatenMacros = useMemo(() => sumEatenMacros(todayEntries), [todayEntries])
    const pendingMacros = useMemo(() => sumPendingMacros(todayEntries), [todayEntries])

    const progress = useMemo(
        () => goalProgress(phase, trend, today),
        [phase, trend, today]
    )

    const stats = useMemo(
        () => adherence(entries, phases, settingsGoals, today),
        [entries, phases, settingsGoals, today]
    )

    /**
     * The wider picture behind the calorie decision: waist, strength, recovery.
     *
     * It explains the recommendation, and in exactly one case changes it — a
     * flat scale with the tape still falling and the bar still going up is a
     * recomposition working, not a stall, and the reduction is withheld. The
     * traffic is one-way: these signals can stop a cut, never cause one.
     */
    const context = useMemo(() => {
        if (!phase?.goal) return null
        return readTransformation({
            rateKgPerWeek: usableRate(trend),
            rate: config?.rate ?? null,
            goalMode: config?.goalMode,
            waist: measurementTrend(logs, 'waist', today),
            strength: strengthSummary(workouts, today),
            adherence: stats,
            checkIns,
            asOf: today,
        })
    }, [phase, trend, logs, workouts, stats, checkIns, today])

    const recommendation: Recommendation = useMemo(
        () =>
            reviewNutrition({
                phase,
                entries,
                phases,
                settingsGoals,
                trend,
                weightPoints: points,
                asOf: today,
                context,
            }),
        [phase, entries, phases, settingsGoals, trend, points, today, context]
    )

    const composition = useMemo(() => compositionSeries(logs), [logs])
    const latestComposition = composition.length ? composition[composition.length - 1] : null
    const compChange = useMemo(() => compositionChange(composition), [composition])

    // Judged on the projected day: before dinner every day looks like a heroic
    // deficit, and colouring it green then would train you to trust a number
    // that hasn't happened yet.
    const projected = {
        calories: eatenMacros.calories + pendingMacros.calories,
        protein: eatenMacros.protein + pendingMacros.protein,
        carbs: eatenMacros.carbs + pendingMacros.carbs,
        fat: eatenMacros.fat + pendingMacros.fat,
    }
    const verdicts = {
        calories: targetVerdict(projected.calories, goals?.calories, kind),
        protein: macroVerdict(projected.protein, goals?.protein, 'protein', kind),
        carbs: macroVerdict(projected.carbs, goals?.carbs, 'other', kind),
        fat: macroVerdict(projected.fat, goals?.fat, 'other', kind),
    }

    async function handleSetStatus(id: string, status: EntryStatus) {
        const previous = entries.find((e) => e._id === id)?.status
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, status } : e)))
        try {
            await setEntryStatus(id, status)
        } catch {
            if (previous) {
                setEntries((prev) =>
                    prev.map((e) => (e._id === id ? { ...e, status: previous } : e))
                )
            }
        }
    }

    async function handleSaveBurn(value: number) {
        const saved = await saveDailyEnergy(today, value)
        setBurns((prev) => [...prev.filter((b) => b.date !== today), saved])
    }

    async function handleClearBurn() {
        await deleteDailyEnergy(today)
        setBurns((prev) => prev.filter((b) => b.date !== today))
    }

    /**
     * Accepting a recommendation appends a dated revision to the phase. It does
     * not touch `targets`, so every day before today keeps being measured
     * against the number that was actually live then.
     */
    async function handleAccept(rec: Recommendation) {
        if (!phase || !rec.suggestedTargets) return
        const saved = await addPhaseAdjustment(phase._id, {
            effectiveFrom: rec.effectiveFrom,
            targets: rec.suggestedTargets,
            reason: rec.reason,
            source: 'adaptive',
        })
        setPhases((prev) => prev.map((p) => (p._id === saved._id ? saved : p)))
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
            {/* What today is being judged against, and where that came from. */}
            <div className="flex flex-wrap items-center gap-2">
                {phase ? (
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${KIND_CHIP[phase.kind]}`}
                    >
                        <i className="fa-solid fa-flag text-[10px]" aria-hidden="true" />
                        {phase.name} · {KIND_LABEL[phase.kind]}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500">
                        No phase today
                    </span>
                )}
                <span className="text-[11px] text-neutral-400">
                    {source === 'phase'
                        ? 'Targets from this phase'
                        : source === 'settings'
                          ? 'Targets from your standing goals'
                          : 'No targets set'}
                </span>
                {source !== 'phase' && (
                    <Link
                        to="/life-plan"
                        className="text-[11px] font-semibold text-neutral-600 underline"
                    >
                        Set up a phase
                    </Link>
                )}
            </div>

            {goals ? (
                <NutritionTargetCard
                    eaten={eatenMacros}
                    pending={pendingMacros}
                    goals={goals}
                    verdicts={verdicts}
                    dayType={dayType}
                    modifier={modifier}
                    expenditure={loggedBurn?.caloriesOut ?? null}
                    expenditureSource={day.source}
                    projectedBalance={day.projectedBalance}
                    maintenanceKcal={typeof maintenance === 'object' ? maintenance.kcal : null}
                />
            ) : (
                <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                    <EmptyState
                        icon="fa-solid fa-bullseye"
                        title="No targets to measure against"
                        description="Set macro goals in settings, or start a nutrition phase to give this stretch its own numbers."
                    />
                </div>
            )}

            <ProteinRecord
                avgProteinG={stats.avgProteinG}
                hitDays={stats.proteinHitDays}
                targetDays={stats.proteinTargetDays}
                windowDays={stats.windowDays}
                targetG={goals?.protein}
            />

            {/* The long arc. Only worth showing once a phase has a goal on it. */}
            {phase?.goal && (
                <NutritionGoalCard
                    phaseName={phase.name}
                    progress={progress}
                    trend={trend}
                    maintenance={maintenance}
                    currentTargetKcal={targets.baseGoals?.calories}
                    composition={latestComposition}
                    compositionChange={compChange}
                    onReview={() => setReviewOpen(true)}
                />
            )}

            <BurnEntry
                key={loggedBurn?.caloriesOut ?? 'unset'}
                logged={loggedBurn}
                fallback={maintenance}
                onSave={handleSaveBurn}
                onClear={handleClearBurn}
            />

            {/* Today's food. */}
            <div>
                <h3 className="mb-2 text-sm font-bold tracking-tight text-neutral-900">
                    Today&rsquo;s meals
                </h3>
                <MealList entries={todayEntries} onSetStatus={handleSetStatus} />
            </div>

            <NutritionReview
                open={reviewOpen}
                onClose={() => setReviewOpen(false)}
                recommendation={recommendation}
                onAccept={phase ? handleAccept : undefined}
            />
        </div>
    )
}

/**
 * Protein is the one macro where hitting the floor is the whole job — on a cut
 * it's what keeps the weight coming off muscle-free — so undershooting it is a
 * miss regardless of mode, while overshooting is never a problem. The others
 * read as ordinary two-sided targets.
 */
function macroVerdict(
    value: number,
    target: number | undefined,
    role: 'protein' | 'other',
    kind: NutritionPhaseKind | null
): Verdict {
    if (!target || target <= 0) return 'none'
    if (role === 'protein') {
        if (value >= target) return 'good'
        return value >= target * 0.85 ? 'warn' : 'bad'
    }
    return targetVerdict(value, target, kind)
}
