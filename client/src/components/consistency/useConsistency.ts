import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listPlanEntries as listMealEntries } from '../../services/mealPlan'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listDailyEnergy } from '../../services/dailyEnergy'
import { addDays, todayKey } from '../../lib/calendar'
import { phaseFor } from '../../lib/nutrition'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { usableRate, weightTrend } from '../../lib/nutritionTrend'
import { rateStatus, type RateStatus } from '../../lib/weightTrend'
import { WEIGH_IN_HABIT_DAYS } from '../../lib/yourDay'
import { dayRecords, type DayRecord } from '../../lib/consistency'

/** The longest period the page offers, in days — everything is fetched once for it. */
export const MAX_PERIOD_DAYS = 84

export interface ConsistencyData {
    today: string
    /** Every day from MAX_PERIOD_DAYS ago to today, read against the plan. */
    records: DayRecord[]
    /** The weigh-in trend against the plan's rate — a result, not scored. */
    rate: { actual: number | null; intended: number | null; status: RateStatus }
}

/**
 * Loads twelve weeks of plans and records and reads each day against the plan.
 * The page slices the period it shows out of the same records, so switching
 * period never refetches.
 */
export function useConsistency(): { data: ConsistencyData | null; error: boolean } {
    const { user } = useAuth()
    const today = todayKey()
    const settingsGoals = user?.settings?.macroGoals
    const bodyRate = user?.settings?.bodyGoals?.weeklyRate

    const [raw, setRaw] = useState<Awaited<ReturnType<typeof load>> | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        let active = true
        load(today)
            .then((r) => active && setRaw(r))
            .catch(() => active && setError(true))
        return () => {
            active = false
        }
    }, [today])

    const data = useMemo<ConsistencyData | null>(() => {
        if (!raw) return null
        const records = dayRecords({
            from: addDays(today, -(MAX_PERIOD_DAYS - 1)),
            today,
            training: raw.training,
            workoutLogs: raw.workoutLogs,
            conditioningLogs: raw.conditioningLogs,
            meals: raw.meals,
            targetsOn: (date) => {
                const t = effectiveTargetsFor(date, raw.phases, settingsGoals, raw.training)
                return { goals: t.goals, kind: t.phase?.kind ?? null }
            },
            weightLogs: raw.weightLogs,
            energy: raw.energy,
        })
        const actual = usableRate(weightTrend(raw.weightLogs, today))
        const intended = phaseFor(today, raw.phases)?.weeklyRate ?? bodyRate ?? null
        return { today, records, rate: { actual, intended, status: rateStatus(actual, intended ?? undefined) } }
    }, [raw, today, settingsGoals, bodyRate])

    return { data, error }
}

async function load(today: string) {
    const from = addDays(today, -(MAX_PERIOD_DAYS - 1))
    // Sessions can be logged a day either side of the plan.
    const logs = { from: addDays(from, -1), to: today }
    const [training, workoutLogs, conditioningLogs, meals, phases, weightLogs, energy] = await Promise.all([
        listFitnessEntries(from, today),
        listWorkoutLogs(logs),
        listConditioningLogs(logs),
        listMealEntries(from, today),
        listNutritionPhases(from, today),
        // A weigh-in is due after one in the 30 days before.
        listWeightLogs(addDays(from, -WEIGH_IN_HABIT_DAYS)),
        listDailyEnergy(from, today),
    ])
    return { training, workoutLogs, conditioningLogs, meals, phases, weightLogs, energy }
}
