import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { SectionLoading } from './DashSection'
import { listPlanEntries } from '../../services/mealPlan'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { addDays } from '../../lib/calendar'
import { MEAL_TYPES } from '../../types'
import { entryMacros, entryName, sumEatenMacros } from '../../lib/nutrition'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { weightTrend, usableRate } from '../../lib/nutritionTrend'
import { goalProgress, GOAL_STATUS_LABELS } from '../../lib/nutritionGoal'
import { measurementTrend } from '../../lib/bodyMeasurements'
import { useAuth } from '../../context/AuthContext'
import type {
    FitnessPlanEntry,
    MacroGoals,
    Macros,
    MealPlanEntry,
    MealType,
    NutritionPhase,
    WeightLog,
} from '../../types'

// ── Data ──────────────────────────────────────────────────────────────────────

export interface NutritionToday {
    loading: boolean
    entries: MealPlanEntry[]
    /** What's actually been eaten, not what's planned. */
    eaten: Macros
    goals: MacroGoals | null
    weightKg: number | null
    ratePerWeek: number | null
    /** Waist change across the last four weeks, when there is one. */
    waistChangeCm: number | null
    phaseName: string | null
    status: string | null
}

/**
 * The day's meals and the goal context around them. Loaded once on the
 * dashboard and shared by the at-a-glance strip and the meals card.
 *
 * The context fetches fail soft: the day's meals are more useful than an error
 * because the weigh-in history was unreachable.
 */
export function useNutritionToday(date: string): NutritionToday {
    const { user } = useAuth()
    const settingsGoals = user?.settings?.macroGoals
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [logs, setLogs] = useState<WeightLog[]>([])
    const [fitness, setFitness] = useState<FitnessPlanEntry[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        Promise.all([
            listPlanEntries(date, date).catch(() => [] as MealPlanEntry[]),
            listNutritionPhases(date, date).catch(() => [] as NutritionPhase[]),
            listWeightLogs(addDays(date, -120)).catch(() => [] as WeightLog[]),
            listFitnessEntries(date, date).catch(() => [] as FitnessPlanEntry[]),
        ])
            .then(([e, p, w, f]) => {
                if (!active) return
                setEntries(e)
                setPhases(p)
                setLogs(w)
                setFitness(f)
            })
            .finally(() => active && setLoadedDate(date))
        return () => {
            active = false
        }
    }, [date])

    const targets = useMemo(
        () => effectiveTargetsFor(date, phases, settingsGoals, fitness),
        [date, phases, settingsGoals, fitness]
    )
    const trend = useMemo(() => weightTrend(logs, date), [logs, date])
    const progress = useMemo(() => goalProgress(targets.phase, trend, date), [targets.phase, trend, date])
    const waist = useMemo(() => measurementTrend(logs, 'waist', date), [logs, date])

    return {
        loading: loadedDate !== date,
        entries,
        eaten: sumEatenMacros(entries),
        goals: targets.goals,
        weightKg: typeof trend === 'string' ? null : trend.current.kg,
        ratePerWeek: usableRate(trend),
        waistChangeCm: typeof waist === 'string' ? null : waist.recentChangeCm,
        phaseName: targets.phase?.name ?? null,
        status: progress ? GOAL_STATUS_LABELS[progress.status] : null,
    }
}

// ── Presentation ──────────────────────────────────────────────────────────────

const SLOT_META: Record<MealType, { label: string; dot: string }> = {
    breakfast: { label: 'Breakfast', dot: 'bg-amber-400' },
    lunch: { label: 'Lunch', dot: 'bg-emerald-400' },
    dinner: { label: 'Dinner', dot: 'bg-indigo-400' },
    snack: { label: 'Snack', dot: 'bg-rose-400' },
}

/** "−0.21 kg/wk", with a real minus sign. */
function rateLabel(n: number): string {
    return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)} kg/wk`
}

/**
 * Today's meals by slot, then one quiet line on whether any of it is working.
 * Calories already lead the at-a-glance strip, so this card doesn't repeat them
 * as a headline.
 */
export default function NutritionWidget({ data }: { data: NutritionToday }) {
    const { loading, entries, eaten, goals, weightKg, ratePerWeek, waistChangeCm, phaseName, status } = data
    const bySlot = MEAL_TYPES.flatMap((slot) => entries.filter((e) => e.slot === slot))
    const proteinGoal = goals?.protein ?? null
    const proteinPct = proteinGoal ? Math.min(100, (eaten.protein / proteinGoal) * 100) : null

    const kcalGoal = goals?.calories ?? null

    return (
        <DashSection
            title="Meals"
            icon="fa-solid fa-bowl-food"
            tone="amber"
            meta={
                loading
                    ? undefined
                    : kcalGoal
                      ? `${Math.round(eaten.calories).toLocaleString()} of ${Math.round(kcalGoal).toLocaleString()} kcal`
                      : `${Math.round(eaten.calories).toLocaleString()} kcal eaten`
            }
            to="/nutrition"
            action="Nutrition"
        >
            {loading ? (
                <SectionLoading />
            ) : (
                <>
                    {bySlot.length === 0 ? (
                        <p className="border-y border-neutral-200 py-5 text-[15px] text-neutral-500">
                            Nothing planned today.{' '}
                            <Link to="/nutrition" className="font-medium text-neutral-900 underline underline-offset-4">
                                Plan meals
                            </Link>
                        </p>
                    ) : (
                        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
                            {bySlot.map((entry) => (
                                <li key={entry._id} className="flex items-center gap-3 py-3.5">
                                    <span className="w-20 shrink-0 text-[13px] text-neutral-500">
                                        {SLOT_META[entry.slot].label}
                                    </span>
                                    <p
                                        className={`min-w-0 flex-1 truncate text-[15px] ${
                                            entry.status === 'eaten' ? 'text-neutral-500 line-through' : 'text-neutral-900'
                                        }`}
                                    >
                                        {entryName(entry)}
                                    </p>
                                    <span className="shrink-0 tabular-nums text-[13px] text-neutral-500">
                                        {Math.round(entryMacros(entry).calories)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {proteinPct !== null && (
                        <div className="mt-6">
                            <div className="mb-2 flex justify-between text-[13px]">
                                <span className="text-neutral-600">Protein</span>
                                <span className="tabular-nums text-neutral-900">
                                    {Math.round(eaten.protein)} / {Math.round(proteinGoal ?? 0)} g
                                </span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-200">
                                <div className="h-full rounded-full bg-marigold" style={{ width: `${proteinPct}%` }} />
                            </div>
                        </div>
                    )}

                    {(weightKg !== null || phaseName) && (
                        <div className="mt-6 flex items-end justify-between gap-4">
                            {weightKg !== null && (
                                <div>
                                    <p className="text-[13px] text-neutral-600">Body weight</p>
                                    <p className="mt-1 text-2xl font-medium tracking-[-0.03em] tabular-nums text-neutral-950">
                                        {weightKg.toFixed(1)}
                                        <span className="ml-1 text-sm tracking-normal text-neutral-500">kg</span>
                                    </p>
                                </div>
                            )}
                            <div className="min-w-0 text-right text-[13px] text-neutral-500">
                                {ratePerWeek !== null && <p className="tabular-nums">{rateLabel(ratePerWeek)}</p>}
                                {waistChangeCm !== null && (
                                    <p className="tabular-nums">
                                        waist {waistChangeCm < 0 ? '−' : '+'}
                                        {Math.abs(waistChangeCm).toFixed(1)} cm
                                    </p>
                                )}
                                {phaseName && (
                                    <p className="truncate">
                                        {phaseName}
                                        {status ? ` · ${status}` : ''}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </DashSection>
    )
}
