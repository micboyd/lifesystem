import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { listPlans } from '../../services/plans'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listWeightLogs } from '../../services/weightLogs'
import { listLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listPlanEntries as listMealEntries } from '../../services/mealPlan'
import { addDays, todayKey } from '../../lib/calendar'
import { ADHERENCE_WINDOW_DAYS, buildTimeline, timelineGaps, type Timeline, type TimelineGap } from '../../lib/timeline'
import type { ConditioningLog, MealPlanEntry, NutritionPhase, TrainingPlan, WeightLog, WorkoutLog } from '../../types'

/** Everything the timeline is built from. */
export interface TimelineSources {
    plans: TrainingPlan[]
    phases: NutritionPhase[]
    weightLogs: WeightLog[]
    workoutLogs: WorkoutLog[]
    conditioningLogs: ConditioningLog[]
    mealEntries: MealPlanEntry[]
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
        ])
            .then(([plans, phases, weightLogs, workoutLogs, conditioningLogs, mealEntries]) => {
                if (active) setData({ plans, phases, weightLogs, workoutLogs, conditioningLogs, mealEntries })
            })
            .catch(() => active && setError(true))
        return () => {
            active = false
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
