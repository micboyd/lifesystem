import { useEffect, useMemo, useState } from 'react'
import { listPlanEntries } from '../../services/mealPlan'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { addDays, todayKey } from '../../lib/calendar'
import { sumEatenMacros } from '../../lib/nutrition'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { outForTarget } from '../../lib/burnForecast'
import { factorOf } from '../../lib/watchCalibration'
import { useBurnHistory } from '../nutrition/useBurnHistory'
import { weightTrend, usableRate } from '../../lib/nutritionTrend'
import { useAuth } from '../../context/AuthContext'
import type { FitnessPlanEntry, MacroGoals, Macros, MealPlanEntry, NutritionPhase, WeightLog } from '../../types'

export interface NutritionToday {
    loading: boolean
    entries: MealPlanEntry[]
    /** What's actually been eaten, not what's planned. */
    eaten: Macros
    goals: MacroGoals | null
    /**
     * The day's calories out when the calorie target was built from it: logged,
     * or expected from days like it until the real figure is in.
     */
    caloriesOut: { kcal: number; expected: boolean; adjusted: boolean } | null
    /** The weigh-in trend's weekly rate, when there's enough to read one. */
    ratePerWeek: number | null
    /** Weigh-ins over the last 120 days, oldest first as the API returns them. */
    weightLogs: WeightLog[]
}

/**
 * The day's meals and the targets they're judged against — the day's phase,
 * on a training day its training-day figures. Loaded once on the dashboard.
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

    // The day's burn: logged, else expected from recent days that trained the same way.
    const today = todayKey()
    const history = useBurnHistory(date, date, today)
    const out = useMemo(
        () => outForTarget(date, history.energy, history.fitness, today, factorOf(history.calibration)),
        [date, history.energy, history.fitness, history.calibration, today]
    )
    const targets = useMemo(
        () => effectiveTargetsFor(date, phases, settingsGoals, fitness, undefined, out?.kcal),
        [date, phases, settingsGoals, fitness, out]
    )
    const trend = useMemo(() => weightTrend(logs, date), [logs, date])

    return {
        loading: loadedDate !== date || history.loading,
        entries,
        eaten: sumEatenMacros(entries),
        goals: targets.goals,
        caloriesOut: targets.fromOut ? out : null,
        ratePerWeek: usableRate(trend),
        weightLogs: logs,
    }
}
