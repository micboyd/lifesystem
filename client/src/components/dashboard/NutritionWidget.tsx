import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
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

/** The three macros in the order the nutrition pages use, each with its bar colour. */
const MACROS = [
    { key: 'protein', label: 'Protein', bar: 'bg-neutral-900' },
    { key: 'carbs', label: 'Carbs', bar: 'bg-brand-500' },
    { key: 'fat', label: 'Fat', bar: 'bg-marigold' },
] as const

/** "−0.21 kg/wk", with a real minus sign. */
function rateLabel(n: number): string {
    return `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)} kg/wk`
}

/**
 * Today's meals by slot, the three macros against their goals, then one quiet
 * line on whether any of it is working.
 * Calories already lead the at-a-glance strip, so this card doesn't repeat them
 * as a headline.
 */
export default function NutritionWidget({ data }: { data: NutritionToday }) {
    const { loading, entries, eaten, goals, weightKg, ratePerWeek, waistChangeCm, phaseName, status } = data
    const bySlot = MEAL_TYPES.flatMap((slot) => entries.filter((e) => e.slot === slot))
    // All three macros, each against its goal when one is set.
    const macros = MACROS.map((m) => {
        const goal = goals?.[m.key] ?? null
        return { ...m, eaten: eaten[m.key], goal, pct: goal ? Math.min(100, (eaten[m.key] / goal) * 100) : 0 }
    })

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
                        <p className={DASH.empty}>
                            Nothing planned today.{' '}
                            <Link to="/nutrition" className={DASH.emptyLink}>
                                Plan meals
                            </Link>
                        </p>
                    ) : (
                        <ul className={DASH.list}>
                            {bySlot.map((entry) => (
                                <li key={entry._id} className={DASH.row}>
                                    <span className={DASH.rowLabel}>
                                        {SLOT_META[entry.slot].label}
                                    </span>
                                    <p
                                        className={
                                            entry.status === 'eaten'
                                                ? 'min-w-0 flex-1 truncate text-[15px] text-neutral-500 line-through'
                                                : DASH.rowText
                                        }
                                    >
                                        {entryName(entry)}
                                    </p>
                                    <span className={DASH.rowValue}>
                                        {/* A box note is planned without amounts — it has no number yet. */}
                                        {entry.away
                                            ? 'away'
                                            : entry.box
                                              ? 'from the box'
                                              : `${Math.round(entryMacros(entry).calories)} kcal`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className={`${DASH.block} grid grid-cols-3 gap-4 sm:gap-6`}>
                        {macros.map((m) => (
                            <div key={m.key} className="min-w-0">
                                <p className={DASH.subhead}>{m.label}</p>
                                <p className="mt-1 truncate text-[15px] tabular-nums text-neutral-900">
                                    {Math.round(m.eaten)}
                                    <span className="text-[13px] text-neutral-500">
                                        {m.goal ? ` / ${Math.round(m.goal)} g` : ' g'}
                                    </span>
                                </p>
                                <div className={`mt-2 ${DASH.track}`}>
                                    <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${m.pct}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>

                    {(weightKg !== null || phaseName) && (
                        <div className={`${DASH.block} flex items-end justify-between gap-4 border-t border-neutral-200 pt-6`}>
                            {weightKg !== null && (
                                <div>
                                    <p className={DASH.subhead}>Body weight</p>
                                    <p className={`mt-1 ${DASH.figureSm}`}>
                                        {weightKg.toFixed(1)}
                                        <span className="ml-1 text-sm tracking-normal text-neutral-500">kg</span>
                                    </p>
                                </div>
                            )}
                            <div className={`min-w-0 text-right ${DASH.note}`}>
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
