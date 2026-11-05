import { useEffect, useMemo, useState } from 'react'
import { listDailyEnergy } from '../../services/dailyEnergy'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { listPlanEntries as listMealEntries } from '../../services/mealPlan'
import { listWeightLogs } from '../../services/weightLogs'
import { GARMIN_CALORIES_PULLED, pullGarminCaloriesQuietly } from '../../services/garmin'
import { addDays } from '../../lib/calendar'
import { FORECAST_WINDOW_DAYS } from '../../lib/burnForecast'
import { dailyIntake, MAINTENANCE_WINDOW_DAYS } from '../../lib/energy'
import { trendSeries } from '../../lib/weightTrend'
import { watchCalibration, type CalibrationGap, type WatchCalibration } from '../../lib/watchCalibration'
import type { DailyEnergy, FitnessPlanEntry, MealPlanEntry, WeightLog } from '../../types'

export interface BurnHistory {
    loading: boolean
    /** Logged calories out from four weeks before the range to its end. */
    energy: DailyEnergy[]
    /** Planned sessions over the same span, to tell how each day trained. */
    fitness: FitnessPlanEntry[]
    /** The watch's personal correction as of today, or why there isn't one yet. */
    calibration: WatchCalibration | CalibrationGap | null
}

/**
 * How far back a screen asks Garmin to fill in calories out. One Garmin call a
 * day under Heroku's 30 s cap; a longer gap fills in a week per screen open.
 */
const PULL_DAYS = 7
/** Weigh-ins reach further back than the window, so the trend is settled by its start. */
const WEIGHT_LEAD_DAYS = 30

interface Loaded {
    key: string
    energy: DailyEnergy[]
    fitness: FitnessPlanEntry[]
    meals: MealPlanEntry[]
    weights: WeightLog[]
}

/**
 * What lib/burnForecast.ts and lib/watchCalibration.ts need for each day in
 * [start, end]: the logged burns and the training behind them, reaching back
 * four weeks before the earlier of `start` and today, plus the last four weeks'
 * food log and weigh-ins for the watch's correction. Fails soft — no history
 * just means no forecast and no correction, and days keep the phase's fixed
 * target or the watch's own figure.
 *
 * Also asks Garmin, in the background, to fill in the last
 * week's finished days, and reloads when it does.
 */
export function useBurnHistory(start: string, end: string, today: string): BurnHistory {
    const [data, setData] = useState<Loaded | null>(null)
    const [pulls, setPulls] = useState(0)
    const from = addDays(start < today ? start : today, -FORECAST_WINDOW_DAYS)
    // Through today at least: the watch's correction reads the last four weeks
    // whichever week is on screen.
    const to = end > today ? end : today
    const key = `${from}|${to}|${today}`

    useEffect(() => {
        let active = true
        const calFrom = addDays(today, -MAINTENANCE_WINDOW_DAYS)
        Promise.all([
            listDailyEnergy(from, to).catch(() => [] as DailyEnergy[]),
            listFitnessEntries(from, to).catch(() => [] as FitnessPlanEntry[]),
            listMealEntries(calFrom, addDays(today, -1)).catch(() => [] as MealPlanEntry[]),
            listWeightLogs(addDays(calFrom, -WEIGHT_LEAD_DAYS)).catch(() => [] as WeightLog[]),
        ]).then(
            ([energy, fitness, meals, weights]) =>
                active && setData({ key: `${from}|${to}|${today}`, energy, fitness, meals, weights })
        )
        return () => {
            active = false
        }
    }, [from, to, today, pulls])

    useEffect(() => {
        const reload = () => setPulls((n) => n + 1)
        window.addEventListener(GARMIN_CALORIES_PULLED, reload)
        void pullGarminCaloriesQuietly(addDays(today, -PULL_DAYS), addDays(today, -1), today)
        return () => window.removeEventListener(GARMIN_CALORIES_PULLED, reload)
    }, [today])

    const calibration = useMemo(
        () =>
            data ? watchCalibration(dailyIntake(data.meals), data.energy, trendSeries(data.weights), today) : null,
        [data, today]
    )

    return {
        loading: data?.key !== key,
        energy: data?.energy ?? [],
        fitness: data?.fitness ?? [],
        calibration,
    }
}
