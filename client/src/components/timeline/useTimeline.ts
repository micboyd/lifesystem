import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listPlans } from '../../services/plans'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listPlanEntries as listMealEntries } from '../../services/mealPlan'
import { listDailyEnergy } from '../../services/dailyEnergy'
import { GARMIN_CALORIES_PULLED, pullGarminCaloriesQuietly } from '../../services/garmin'
import { addDays, todayKey } from '../../lib/calendar'
import {
    ADHERENCE_WINDOW_DAYS,
    ENERGY_WINDOW_DAYS,
    buildTimeline,
    timelineGaps,
    type Timeline,
    type TimelineGap,
} from '../../lib/timeline'
import type {
    ConditioningLog,
    DailyEnergy,
    MealPlanEntry,
    NutritionPhase,
    TrainingPlan,
    WeightLog,
    WorkoutLog,
} from '../../types'

/** Everything the timeline is built from. */
export interface TimelineSources {
    plans: TrainingPlan[]
    phases: NutritionPhase[]
    weightLogs: WeightLog[]
    workoutLogs: WorkoutLog[]
    conditioningLogs: ConditioningLog[]
    mealEntries: MealPlanEntry[]
    /** The watch's whole-day burn for the finished days of the last four weeks. */
    energy: DailyEnergy[]
}

export interface TimelineState {
    today: string
    /** Null while loading. */
    data: TimelineSources | null
    error: boolean
    /** What's missing before a timeline can be drawn; empty once it can. */
    gaps: TimelineGap[]
    /** Null until the data, the setup and the quiz are all there. */
    timeline: Timeline | null
}

function loadEnergy(today: string): Promise<DailyEnergy[]> {
    return listDailyEnergy(addDays(today, -ENERGY_WINDOW_DAYS), addDays(today, -1))
}

/**
 * Loads the plans and records and builds the timeline from today — shared by
 * the Timeline page and the dashboard hint, so both read the same projection.
 */
export function useTimeline(): TimelineState {
    const { user } = useAuth()
    const today = todayKey()
    const quiz = user?.settings?.timelineQuiz
    const profile = user?.settings?.bodyProfile
    const bodyGoals = user?.settings?.bodyGoals

    const [data, setData] = useState<TimelineSources | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        let active = true
        Promise.all([
            listPlans({ schedule: true }),
            listNutritionPhases(),
            listWeightLogs(),
            listLogs(),
            listConditioningLogs(),
            // Measured nutrition adherence looks back four weeks (lib/timeline.ts).
            listMealEntries(addDays(today, -ADHERENCE_WINDOW_DAYS), addDays(today, -1)),
            // The timeline stands without the watch, so a failure here isn't one.
            loadEnergy(today).catch(() => [] as DailyEnergy[]),
        ])
            .then(([plans, phases, weightLogs, workoutLogs, conditioningLogs, mealEntries, energy]) => {
                if (active) setData({ plans, phases, weightLogs, workoutLogs, conditioningLogs, mealEntries, energy })
            })
            .catch(() => active && setError(true))

        // Days the watch has finished since the last visit are fetched in the
        // background (the same week Home asks for); the projection moves when they land.
        void pullGarminCaloriesQuietly(addDays(today, -7), addDays(today, -1), today)
        const onPulled = () => {
            loadEnergy(today)
                .then((energy) => active && setData((now) => (now ? { ...now, energy } : now)))
                .catch(() => undefined)
        }
        window.addEventListener(GARMIN_CALORIES_PULLED, onPulled)
        return () => {
            active = false
            window.removeEventListener(GARMIN_CALORIES_PULLED, onPulled)
        }
    }, [today])

    const gaps = useMemo(
        () => (data ? timelineGaps(today, data.plans, data.phases, profile, data.weightLogs) : []),
        [data, today, profile]
    )

    const timeline = useMemo(() => {
        if (!data || !quiz || gaps.length > 0) return null
        return buildTimeline({ today, ...data, profile, quiz, bodyGoals })
    }, [data, quiz, gaps, today, profile, bodyGoals])

    return { today, data, error, gaps, timeline }
}
