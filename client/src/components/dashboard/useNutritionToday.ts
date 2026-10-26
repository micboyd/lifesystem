import { useEffect, useMemo, useState } from 'react'
import { listPlanEntries } from '../../services/mealPlan'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { addDays } from '../../lib/calendar'
import { sumEatenMacros } from '../../lib/nutrition'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { weightTrend, usableRate } from '../../lib/nutritionTrend'
import { useAuth } from '../../context/AuthContext'
import type { FitnessPlanEntry, MacroGoals, Macros, MealPlanEntry, NutritionPhase, WeightLog } from '../../types'

export interface NutritionToday {
    loading: boolean
    entries: MealPlanEntry[]
    /** What's actually been eaten, not what's planned. */
    eaten: Macros
    goals: MacroGoals | null
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

    const targets = useMemo(
        () => effectiveTargetsFor(date, phases, settingsGoals, fitness),
        [date, phases, settingsGoals, fitness]
    )
    const trend = useMemo(() => weightTrend(logs, date), [logs, date])

    return {
        loading: loadedDate !== date,
        entries,
        eaten: sumEatenMacros(entries),
        goals: targets.goals,
        ratePerWeek: usableRate(trend),
        weightLogs: logs,
    }
}
