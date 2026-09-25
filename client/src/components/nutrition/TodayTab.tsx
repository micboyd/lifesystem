import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import Input from '../Input'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import NutritionTargetCard from './NutritionTargetCard'
import NutritionGoalCard from './NutritionGoalCard'
import NutritionReview from './NutritionReview'
import AddFoodSheet from './today/AddFoodSheet'
import LineSheet from './today/LineSheet'
import { fmt, kcal, shortDate } from './format'
import { copyFoodEntries, listBatches, listFoodEntries, listRecipes, updateFoodEntry } from '../../services/food'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { listWeightLogs } from '../../services/weightLogs'
import { listNutritionPhases, addPhaseAdjustment } from '../../services/nutritionPhases'
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listCheckIns } from '../../services/progress'
import { addDays, todayKey } from '../../lib/calendar'
import { sumEatenMacros, sumPendingMacros } from '../../lib/nutrition'
import { amountLabel } from '../../lib/recipes'
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
    Batch,
    DailyEnergy,
    FitnessPlanEntry,
    FoodEntry,
    MacroGoals,
    Macros,
    MealType,
    NutritionPhase,
    NutritionPhaseKind,
    ProgressCheckIn,
    Recipe,
    WeightLog,
    WorkoutLog,
} from '../../types'

/**
 * The day: what's been eaten, what's still planned, and how that sits against
 * the targets — built for a phone in the kitchen first.
 *
 * The top half is the log: four meals, each a short list of lines ("1 portion
 * of Tray A", "50 g rice"), with one big Add per meal. The bottom half is the
 * long view — targets in depth, protein record, the goal, the burn — which only
 * means something for today, so other days show just the log.
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
/** How far ahead lines are loaded, for planning the coming days from here. */
const PLAN_AHEAD_DAYS = 14

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

const SLOT_LABEL: Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snacks',
}

const VERDICT_TEXT: Record<Verdict, string> = {
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    bad: 'text-red-600',
    none: 'text-neutral-900',
}

const VERDICT_BAR: Record<Verdict, string> = {
    good: 'bg-emerald-500',
    warn: 'bg-amber-400',
    bad: 'bg-red-500',
    none: 'bg-neutral-800',
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

/** ‹ Today › — log yesterday's dinner, or plan tomorrow, without leaving the page. */
function DaySwitcher({ date, today, onChange }: { date: string; today: string; onChange: (d: string) => void }) {
    const label =
        date === today
            ? 'Today'
            : date === addDays(today, -1)
              ? 'Yesterday'
              : date === addDays(today, 1)
                ? 'Tomorrow'
                : shortDate(date)
    return (
        <div className="flex w-full items-center gap-1 sm:w-auto">
            <button
                type="button"
                aria-label="Previous day"
                onClick={() => onChange(addDays(date, -1))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100"
            >
                <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-base font-bold text-neutral-900 sm:min-w-[7rem]">
                {label}
            </p>
            <button
                type="button"
                aria-label="Next day"
                onClick={() => onChange(addDays(date, 1))}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100"
            >
                <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
            {date !== today && (
                <button
                    type="button"
                    onClick={() => onChange(today)}
                    className="shrink-0 rounded-full px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                >
                    Today
                </button>
            )}
        </div>
    )
}

/**
 * The glance: calories and protein, eaten against target, with what's still
 * planned drawn behind. Coloured on the projected day, never on eaten-so-far,
 * so a morning doesn't glow green as a heroic deficit.
 */
function DaySummary({
    eaten,
    pending,
    goals,
    verdicts,
}: {
    eaten: Macros
    pending: Macros
    goals: MacroGoals | null
    verdicts: Record<'calories' | 'protein' | 'carbs' | 'fat', Verdict>
}) {
    return (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] sm:p-5">
            <SummaryRow
                label="Calories"
                unit="kcal"
                eaten={eaten.calories}
                pending={pending.calories}
                target={goals?.calories}
                verdict={verdicts.calories}
                big
            />
            <div className="mt-4">
                <SummaryRow
                    label="Protein"
                    unit="g"
                    eaten={eaten.protein}
                    pending={pending.protein}
                    target={goals?.protein}
                    verdict={verdicts.protein}
                />
            </div>
            <p className="mt-3 text-xs tabular-nums text-neutral-500">
                Carbs {fmt(Math.round(eaten.carbs))}
                {goals?.carbs ? ` / ${fmt(goals.carbs)}` : ''} g · Fat {fmt(Math.round(eaten.fat))}
                {goals?.fat ? ` / ${fmt(goals.fat)}` : ''} g
                {pending.calories > 0 && (
                    <span className="text-neutral-400"> · {kcal(pending.calories)} kcal still planned</span>
                )}
            </p>
        </div>
    )
}

function SummaryRow({
    label,
    unit,
    eaten,
    pending,
    target,
    verdict,
    big = false,
}: {
    label: string
    unit: string
    eaten: number
    pending: number
    target?: number
    verdict: Verdict
    big?: boolean
}) {
    const span = Math.max(eaten + pending, target ?? 0, 1)
    const pct = (v: number) => `${Math.min(100, (v / span) * 100)}%`
    const left = target ? target - eaten - pending : null
    return (
        <div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={`font-bold tabular-nums tracking-tight ${VERDICT_TEXT[verdict]} ${big ? 'text-3xl' : 'text-xl'}`}>
                    {unit === 'kcal' ? kcal(eaten) : fmt(Math.round(eaten))}
                    <span className="ml-1 text-sm font-medium text-neutral-400">
                        {target ? `/ ${unit === 'kcal' ? kcal(target) : fmt(target)} ` : ''}
                        {unit === 'kcal' ? 'kcal' : `g ${label.toLowerCase()}`}
                    </span>
                </p>
                {left !== null && (
                    <p className="text-xs font-medium tabular-nums text-neutral-500">
                        {left >= 0
                            ? `${unit === 'kcal' ? kcal(left) : fmt(Math.round(left))}${unit === 'kcal' ? '' : ' g'} left after plan`
                            : `${unit === 'kcal' ? kcal(-left) : fmt(Math.round(-left))}${unit === 'kcal' ? '' : ' g'} over with plan`}
                    </p>
                )}
            </div>
            <div className={`relative mt-1.5 w-full overflow-hidden rounded-full bg-neutral-100 ${big ? 'h-3' : 'h-2'}`}>
                <div className={`absolute inset-y-0 left-0 rounded-full ${VERDICT_BAR[verdict]}`} style={{ width: pct(eaten) }} />
                <div className="absolute inset-y-0 bg-neutral-300" style={{ left: pct(eaten), width: pct(pending) }} />
                {target ? (
                    <div className="absolute inset-y-0 w-0.5 bg-neutral-900" style={{ left: pct(target) }} aria-hidden="true" />
                ) : null}
            </div>
        </div>
    )
}

/** One meal of the day: its lines, its total, and a big Add. */
function SlotCard({
    slot,
    lines,
    canRepeat,
    onAdd,
    onRepeat,
    onOpen,
    onToggle,
}: {
    slot: MealType
    lines: FoodEntry[]
    /** The day before had something here — offer to repeat it. */
    canRepeat: boolean
    onAdd: () => void
    onRepeat: () => void
    onOpen: (e: FoodEntry) => void
    onToggle: (e: FoodEntry) => void
}) {
    const counted = lines.filter((l) => l.status !== 'skipped')
    const total = counted.reduce(
        (acc, l) => ({ calories: acc.calories + l.macros.calories, protein: acc.protein + l.macros.protein }),
        { calories: 0, protein: 0 }
    )
    return (
        <section className="rounded-3xl bg-white p-3 ring-1 ring-black/[0.06] sm:p-4">
            <header className="flex items-baseline justify-between gap-3 px-1 pb-2">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">{SLOT_LABEL[slot]}</h3>
                {lines.length > 0 && (
                    <p className="text-xs tabular-nums text-neutral-500">
                        {kcal(total.calories)} kcal · {fmt(Math.round(total.protein))} g protein
                    </p>
                )}
            </header>
            {lines.length > 0 && (
                <ul className="mb-2 flex flex-col">
                    {lines.map((l) => (
                        <LineRow key={l._id} line={l} onOpen={() => onOpen(l)} onToggle={() => onToggle(l)} />
                    ))}
                </ul>
            )}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={onAdd}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-neutral-100 text-sm font-semibold text-neutral-800 active:bg-neutral-200"
                >
                    <i className="fa-solid fa-plus" aria-hidden="true" />
                    Add
                </button>
                {lines.length === 0 && canRepeat && (
                    <button
                        type="button"
                        onClick={onRepeat}
                        className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold text-neutral-600 ring-1 ring-neutral-200 active:bg-neutral-50"
                    >
                        <i className="fa-solid fa-rotate-left" aria-hidden="true" />
                        Same as yesterday
                    </button>
                )}
            </div>
        </section>
    )
}

function LineRow({ line, onOpen, onToggle }: { line: FoodEntry; onOpen: () => void; onToggle: () => void }) {
    const eaten = line.status === 'eaten'
    const skipped = line.status === 'skipped'
    const isQuick = !line.batch && !line.recipe
    return (
        <li className="flex items-center gap-1">
            <button
                type="button"
                aria-label={eaten ? `Mark ${line.name} as not eaten` : `Mark ${line.name} as eaten`}
                aria-pressed={eaten}
                onClick={onToggle}
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${
                    eaten ? 'text-emerald-500' : 'text-neutral-300 active:text-emerald-500'
                }`}
            >
                <i className={eaten ? 'fa-solid fa-circle-check text-xl' : 'fa-regular fa-circle text-xl'} aria-hidden="true" />
            </button>
            <button
                type="button"
                onClick={onOpen}
                className="flex min-h-[52px] min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 text-left active:bg-neutral-50"
            >
                <span className="min-w-0 flex-1">
                    <span
                        className={`block truncate text-[15px] font-semibold ${
                            skipped ? 'text-neutral-400 line-through' : eaten ? 'text-neutral-900' : 'text-neutral-600'
                        }`}
                    >
                        {line.name}
                    </span>
                    <span className="block truncate text-xs tabular-nums text-neutral-500">
                        {!isQuick && `${amountLabel(line.amount, line.unit)} · `}
                        {kcal(line.macros.calories)} kcal · {fmt(Math.round(line.macros.protein))} g P
                        {line.estimated && ' · est.'}
                        {line.status === 'planned' && <span className="text-neutral-400"> · planned</span>}
                    </span>
                </span>
                <i className="fa-solid fa-chevron-right text-[10px] text-neutral-300" aria-hidden="true" />
            </button>
        </li>
    )
}

// ── The tab ──────────────────────────────────────────────────────────────────

export default function TodayTab({
    settingsGoals,
    onOpenPhases,
}: {
    settingsGoals?: MacroGoals
    /** Jump to the Phases tab — where phases are set up. */
    onOpenPhases?: () => void
}) {
    const today = todayKey()
    const windowStart = addDays(today, -ANALYSIS_DAYS)
    const loadedEnd = addDays(today, PLAN_AHEAD_DAYS)
    const [date, setDate] = useState(today)
    const isToday = date === today

    const [entries, setEntries] = useState<FoodEntry[]>([])
    const [recipes, setRecipes] = useState<Recipe[]>([])
    const [batches, setBatches] = useState<Batch[]>([])
    const [logs, setLogs] = useState<WeightLog[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [burns, setBurns] = useState<DailyEnergy[]>([])
    const [fitness, setFitness] = useState<FitnessPlanEntry[]>([])
    const [workouts, setWorkouts] = useState<WorkoutLog[]>([])
    const [checkIns, setCheckIns] = useState<ProgressCheckIn[]>([])
    const [loading, setLoading] = useState(true)
    const [reviewOpen, setReviewOpen] = useState(false)

    const [adding, setAdding] = useState<MealType | null>(null)
    const [openLine, setOpenLine] = useState<FoodEntry | null>(null)

    const load = useCallback(() => {
        Promise.all([
            listFoodEntries(windowStart, loadedEnd),
            listWeightLogs(addDays(today, -WEIGHT_HISTORY_DAYS)),
            // The whole window, not just today: resolving what a past day was
            // measured against needs the phase that covered it.
            listNutritionPhases(windowStart, loadedEnd),
            listDailyEnergy(windowStart, today),
            // Training shifts a day's target, so the days you can plan are fetched too.
            listFitnessEntries(addDays(today, -7), loadedEnd).catch(() => [] as FitnessPlanEntry[]),
            // Supporting context for the review. Both fail soft — they colour
            // the explanation, and the calorie decision stands without them.
            listWorkoutLogs().catch(() => [] as WorkoutLog[]),
            listCheckIns(addDays(today, -180)).catch(() => [] as ProgressCheckIn[]),
            listRecipes(true),
            listBatches(true),
        ])
            .then(([e, w, p, b, f, k, c, r, bt]) => {
                setEntries(e)
                setLogs(w)
                setPhases(p)
                setBurns(b)
                setFitness(f)
                setWorkouts(k)
                setCheckIns(c)
                setRecipes(r)
                setBatches(bt)
            })
            .finally(() => setLoading(false))
    }, [windowStart, loadedEnd, today])

    useEffect(load, [load])

    // Days outside the loaded window are fetched when you step onto them.
    useEffect(() => {
        if (date >= windowStart && date <= loadedEnd) return
        listFoodEntries(date, date)
            .then((more) =>
                setEntries((prev) => [...prev.filter((e) => e.date !== date), ...more])
            )
            .catch(() => {})
    }, [date, windowStart, loadedEnd])

    const activeRecipes = useMemo(() => recipes.filter((r) => !r.archived), [recipes])
    const activeBatches = useMemo(() => batches.filter((b) => !b.archived), [batches])

    const dayEntries = useMemo(() => entries.filter((e) => e.date === date), [entries, date])
    const yesterdaySlots = useMemo(
        () => new Set(entries.filter((e) => e.date === addDays(date, -1) && e.status !== 'skipped').map((e) => e.slot)),
        [entries, date]
    )
    // The engine reads history up to today only — planned days ahead aren't intake.
    const history = useMemo(() => entries.filter((e) => e.date <= today), [entries, today])
    const loggedBurn = useMemo(() => burns.find((b) => b.date === today) ?? null, [burns, today])

    const points = useMemo(() => trendSeries(logs), [logs])
    const maintenance = useMemo(
        () => measuredMaintenance(dailyIntake(history), points, MAINTENANCE_WINDOW_DAYS, today),
        [history, points, today]
    )

    // The trend anchors on today rather than the last weigh-in, so a few days
    // away from the scale shows as thinning data instead of a frozen figure.
    const trend: WeightTrend | TrendGap = useMemo(() => weightTrend(logs, today), [logs, today])

    const targets = useMemo(
        () => effectiveTargetsFor(date, phases, settingsGoals, fitness),
        [date, phases, settingsGoals, fitness]
    )
    const { goals, source, phase, dayType, modifier } = targets
    // The phase as configuration, with application defaults filled in.
    const config = useMemo(() => resolveConfig(phase), [phase])
    const kind = phase?.kind ?? null

    const todayEntries = useMemo(() => entries.filter((e) => e.date === today), [entries, today])
    const day = useMemo(
        () => dayEnergy(todayEntries, loggedBurn, maintenance),
        [todayEntries, loggedBurn, maintenance]
    )
    const eatenMacros = useMemo(() => sumEatenMacros(dayEntries), [dayEntries])
    const pendingMacros = useMemo(() => sumPendingMacros(dayEntries), [dayEntries])

    const progress = useMemo(() => goalProgress(phase, trend, today), [phase, trend, today])

    const stats = useMemo(
        () => adherence(history, phases, settingsGoals, today),
        [history, phases, settingsGoals, today]
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
    }, [phase, trend, logs, workouts, stats, checkIns, today, config])

    const recommendation: Recommendation = useMemo(
        () =>
            reviewNutrition({
                phase,
                entries: history,
                phases,
                settingsGoals,
                trend,
                weightPoints: points,
                asOf: today,
                context,
            }),
        [phase, history, phases, settingsGoals, trend, points, today, context]
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

    const upsert = (e: FoodEntry) =>
        setEntries((prev) => (prev.some((x) => x._id === e._id) ? prev.map((x) => (x._id === e._id ? e : x)) : [...prev, e]))

    const upsertBatch = (b: Batch) =>
        setBatches((prev) => (prev.some((x) => x._id === b._id) ? prev.map((x) => (x._id === b._id ? b : x)) : [b, ...prev]))

    /** The tick: planned ↔ eaten, optimistic, rolled back if the save fails. */
    async function toggle(line: FoodEntry) {
        const next = line.status === 'eaten' ? 'planned' : 'eaten'
        upsert({ ...line, status: next })
        try {
            upsert(await updateFoodEntry(line._id, { status: next }))
        } catch {
            upsert(line)
        }
    }

    async function repeatYesterday(slot: MealType) {
        const prev = addDays(date, -1)
        const copied = await copyFoodEntries({ fromStart: prev, fromEnd: prev, toStart: date, slot })
        setEntries((all) => [...all, ...copied])
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

    const lineSource = openLine
        ? (openLine.batch && batches.find((b) => b._id === openLine.batch)) ||
          (!openLine.batch && openLine.recipe && recipes.find((r) => r._id === openLine.recipe)) ||
          null
        : null

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    return (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-start">
            {/* The log — first on a phone, the main column on a desktop. */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <DaySwitcher date={date} today={today} onChange={setDate} />
                </div>

                <div className="lg:hidden">
                    <DaySummary eaten={eatenMacros} pending={pendingMacros} goals={goals} verdicts={verdicts} />
                </div>

                {MEAL_TYPES.map((slot) => (
                    <SlotCard
                        key={slot}
                        slot={slot}
                        lines={dayEntries.filter((e) => e.slot === slot)}
                        canRepeat={yesterdaySlots.has(slot)}
                        onAdd={() => setAdding(slot)}
                        onRepeat={() => void repeatYesterday(slot)}
                        onOpen={setOpenLine}
                        onToggle={(l) => void toggle(l)}
                    />
                ))}
            </div>

            {/* The long view. Sticky beside the log on a desktop, below it on a phone. */}
            <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
                <div className="hidden lg:block">
                    <DaySummary eaten={eatenMacros} pending={pendingMacros} goals={goals} verdicts={verdicts} />
                </div>

                {/* What the day is judged against, and where that came from. */}
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
                            No phase {isToday ? 'today' : 'this day'}
                        </span>
                    )}
                    <span className="text-[11px] text-neutral-400">
                        {source === 'phase'
                            ? 'Targets from this phase'
                            : source === 'settings'
                              ? 'Targets from your standing goals'
                              : 'No targets set'}
                    </span>
                    {source !== 'phase' && onOpenPhases && (
                        <button
                            type="button"
                            onClick={onOpenPhases}
                            className="text-[11px] font-semibold text-neutral-600 underline"
                        >
                            Set up a phase
                        </button>
                    )}
                </div>

                {isToday && (
                    <>
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
                    </>
                )}
            </aside>

            <AddFoodSheet
                open={adding !== null}
                date={date}
                slot={adding ?? 'breakfast'}
                isFuture={date > today}
                recipes={activeRecipes}
                batches={activeBatches}
                onClose={() => setAdding(null)}
                onAdded={upsert}
                onBatchSaved={upsertBatch}
            />

            <LineSheet
                entry={openLine}
                source={lineSource}
                onClose={() => setOpenLine(null)}
                onSaved={upsert}
                onDeleted={(id) => setEntries((prev) => prev.filter((e) => e._id !== id))}
            />

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
