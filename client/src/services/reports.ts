import axios from 'axios'
import { addDays } from '../lib/calendar'
import { buildDailyReport, type DailyReport, type SpendSource } from '../lib/dailyReport'
import { listStarlingSpend } from './finances'
import { listLogs as listWorkoutLogs } from './workoutLogs'
import { listLogs as listConditioningLogs } from './conditioningLogs'
import { listLogs as listMobilityLogs } from './mobilityLogs'
import { listLogs as listRecoveryLogs } from './recoveryLogs'
import { listHabits, listLogs as listHabitLogs } from './habits'
import { listTasks } from './tasks'
import { listPlanEntries as listMealPlan } from './mealPlan'
import { listPlanEntries as listFitnessPlan } from './fitnessPlan'
import { listNutritionPhases } from './nutritionPhases'
import { listWeightLogs } from './weightLogs'
import type { MacroGoals } from '../types'

/** Spending is compared against the week before, so fetch that week too. */
const SPEND_LOOKBACK_DAYS = 7
/** How far back to look for the weigh-in a day's weight is compared with. */
const WEIGHT_LOOKBACK_DAYS = 60

/** Spending, or why it couldn't be read — the rest of the report stands without it. */
async function loadSpend(from: string, to: string): Promise<SpendSource> {
    const start = addDays(from, -SPEND_LOOKBACK_DAYS)
    try {
        return { status: 'ok', items: await listStarlingSpend(start, to), from: start }
    } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined
        return {
            status: 'unavailable',
            message:
                status === 501
                    ? 'Starling isn’t connected, so spending can’t be read.'
                    : 'Couldn’t reach Starling for spending just now.',
        }
    }
}

/**
 * Build the report for every day in [from, to], newest first. Everything is
 * fetched once for the range and each day is cut from it.
 */
export async function loadReports(
    from: string,
    to: string,
    settingsGoals?: MacroGoals | null
): Promise<DailyReport[]> {
    const [
        spend,
        workouts,
        conditioning,
        mobility,
        recovery,
        habits,
        habitLogs,
        tasks,
        meals,
        fitnessPlan,
        phases,
        weights,
    ] = await Promise.all([
        loadSpend(from, to),
        listWorkoutLogs(),
        listConditioningLogs(),
        listMobilityLogs(),
        listRecoveryLogs(),
        listHabits(),
        listHabitLogs(from, to),
        listTasks(from, to),
        listMealPlan(from, to),
        listFitnessPlan(from, to),
        listNutritionPhases(from, to),
        listWeightLogs(addDays(from, -WEIGHT_LOOKBACK_DAYS)),
    ])

    const inputs = {
        spend,
        workouts,
        conditioning,
        mobility,
        recovery,
        habits,
        habitLogs,
        tasks,
        meals,
        fitnessPlan,
        phases,
        weights,
        settingsGoals,
    }

    const reports: DailyReport[] = []
    for (let d = to; d >= from; d = addDays(d, -1)) reports.push(buildDailyReport(d, inputs))
    return reports
}

/** One day's report. */
export async function loadReport(
    date: string,
    settingsGoals?: MacroGoals | null
): Promise<DailyReport> {
    const [report] = await loadReports(date, date, settingsGoals)
    return report
}
