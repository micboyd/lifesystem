import { useEffect, useMemo, useState } from 'react'
import { addMonthsToKey, todayKey } from '../../lib/calendar'
import { freeCashByMonth } from '../../lib/finance'
import { dailyIntake, measuredMaintenance } from '../../lib/energy'
import { trendSeries } from '../../lib/weightTrend'
import { computeMonthLoads, type LoadInput } from '../../lib/lifeLoad'
import { monthRange } from '../../lib/lifeTimeline'
import {
    calibrate,
    capacitiesFrom,
    monthOutcome,
    sustainedVolume,
    type Calibration,
} from '../../lib/lifeCalibration'
import { DEFAULT_CAPACITIES, type Capacities } from '../../lib/lifeLoad'
import { monthEndDate, monthStartDate } from '../../lib/seasonReview'
import { listGroups, listRows } from '../../services/finances'
import { listPlanEntries as listMealEntries } from '../../services/mealPlan'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listWeightLogs } from '../../services/weightLogs'
import { listHabits, listLogs as listHabitLogs } from '../../services/habits'
import { listMonthNotes } from '../../services/monthNotes'

/**
 * The denominators, gathered from the rest of the app.
 *
 * `lifeLoad.ts` is pure and knows nothing about where a capacity comes from,
 * which is what keeps it testable. This is the other half: the fetching that
 * turns its shipped priors into figures that are actually the user's — free cash
 * out of the finance rows, the true depth of a deficit out of measured
 * maintenance, and, once there's enough history, ceilings fitted from how their
 * own adherence has held up.
 *
 * The two halves load on different schedules on purpose. Free cash and
 * maintenance are three cheap requests and arrive with the page, because without
 * free cash the money reserve can't be scored at all. Calibration pulls seven
 * collections across eighteen months, so it waits until something asks for it.
 */

/** How far back a fit is allowed to look. */
export const HISTORY_MONTHS = 18

export interface LoadCapacities {
    /** Free cash by month, for the money reserve's denominator. */
    freeCash?: Record<string, number>
    /** Maintenance calories, so a phase's deficit is read at its true depth. */
    maintenanceKcal?: number
    /**
     * Capacity overrides, ready to pass to `computeMonthLoads`. The volume
     * baseline lands here as soon as there are logs; a fitted ceiling replaces it
     * when the history pass finds one, since adherence is the better evidence.
     */
    capacities: Partial<Capacities>
    /** The body ceiling read off logged training volume, before any fit. */
    volumeCeiling?: number
    /** Ceilings fitted from history. Empty until history has been asked for and found. */
    calibration: Calibration
    /** True once the history pass has finished, whatever it concluded. */
    calibrated: boolean
    /** Months of history the fit had to work with. */
    historyMonths: number
}

const EMPTY: LoadCapacities = {
    capacities: {},
    calibration: {},
    calibrated: false,
    historyMonths: 0,
}

/**
 * `months` is the plan's window, `history` turns on the calibration pass, and
 * `records` is everything the loads are built from — passed in rather than
 * refetched so the fit scores history exactly as the timeline scores the future.
 */
export function useLoadCapacities(
    planStart: string | undefined,
    planEnd: string | undefined,
    records: Omit<LoadInput, 'plan'> & { plan?: never },
    history: boolean
): LoadCapacities {
    const [capacities, setCapacities] = useState<LoadCapacities>(EMPTY)

    const months = useMemo(
        () => (planStart && planEnd ? monthRange(planStart, planEnd) : []),
        [planStart, planEnd]
    )
    const monthsKey = months.join(',')

    // Free cash and maintenance: cheap, and the money reserve is unscorable
    // without the first of them.
    useEffect(() => {
        if (months.length === 0) return
        let cancelled = false
        const since = monthStartDate(addMonthsToKey(months[0], -2))

        Promise.all([
            listGroups(),
            listRows(),
            listMealEntries(since, todayKey()),
            listWeightLogs(since),
            listWorkoutLogs(),
            listConditioningLogs(),
        ])
            .then(([groups, rows, mealEntries, weightLogs, workoutLogs, conditioningLogs]) => {
                if (cancelled) return
                const maintenance = measuredMaintenance(
                    dailyIntake(mealEntries),
                    trendSeries(weightLogs)
                )
                // The body ceiling you have proven, rather than the shipped guess
                // about people in general. Never below the default: erring
                // generous beats nagging someone about a week they run every week.
                const volume = sustainedVolume(
                    [...workoutLogs, ...conditioningLogs],
                    todayKey()
                )
                const ceiling =
                    volume === null
                        ? undefined
                        : Math.max(volume, DEFAULT_CAPACITIES.body ?? volume)

                setCapacities((c) => ({
                    ...c,
                    freeCash: freeCashByMonth(groups, rows, months),
                    maintenanceKcal: typeof maintenance === 'string' ? undefined : maintenance.kcal,
                    volumeCeiling: ceiling,
                    capacities:
                        ceiling === undefined
                            ? c.capacities
                            : {
                                  body: { value: ceiling, basis: 'measured' },
                                  // A fitted ceiling is better evidence, so it wins.
                                  ...c.capacities,
                              },
                }))
            })
            // A missing denominator is a reason to score nothing, not to break the
            // page — `lifeLoad` already treats an absent capacity as unscorable.
            .catch(() => undefined)

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [monthsKey])

    /**
     * A cheap signature of what would be scored.
     *
     * The fit runs against `records`, which arrive asynchronously — keying the
     * effect on the tab alone would let a fast click land it on an empty set and
     * cache the "not enough history" that followed. Changing records refit.
     */
    const recordsKey = [
        records.trainingPlans?.length ?? 0,
        records.nutritionPhases?.length ?? 0,
        records.savingsTargets?.length ?? 0,
        records.courses?.length ?? 0,
        records.goals?.length ?? 0,
    ].join(':')

    // Calibration: seven collections over eighteen months, so it waits to be asked.
    useEffect(() => {
        if (!history) return
        let cancelled = false

        const today = todayKey()
        const endMonth = today.slice(0, 7)
        const startMonth = addMonthsToKey(endMonth, -HISTORY_MONTHS)
        const start = monthStartDate(startMonth)
        const end = monthEndDate(endMonth)

        Promise.all([
            listFitnessEntries(start, end),
            listMealEntries(start, end),
            listWorkoutLogs(),
            listConditioningLogs(),
            listHabits(),
            listHabitLogs(start, end),
            listMonthNotes(startMonth, endMonth),
        ])
            .then(([fitnessEntries, mealEntries, workoutLogs, conditioningLogs, habits, habitLogs, monthNotes]) => {
                if (cancelled) return
                // History is scored through exactly the same function the future
                // is, over a window standing in for the plan's — so a ceiling
                // fitted here means the same thing when it's applied there.
                const pastLoads = computeMonthLoads({
                    ...records,
                    monthNotes,
                    plan: {
                        _id: 'history',
                        name: 'history',
                        start: startMonth,
                        end: endMonth,
                        pillars: [],
                        seasons: [],
                        order: 0,
                        createdAt: '',
                        updatedAt: '',
                    },
                })
                const outcomes = pastLoads.map((l) =>
                    monthOutcome(l.month, {
                        fitnessEntries,
                        workoutLogs,
                        conditioningLogs,
                        mealEntries,
                        habitLogs,
                        habitCount: habits.length,
                    })
                )
                const calibration = calibrate(pastLoads, outcomes)
                setCapacities((c) => ({
                    ...c,
                    calibration,
                    calibrated: true,
                    historyMonths: outcomes.filter((o) => o.adherence !== null).length,
                    capacities: { ...c.capacities, ...capacitiesFrom(calibration) },
                }))
            })
            .catch(() => {
                if (!cancelled) setCapacities((c) => ({ ...c, calibrated: true }))
            })

        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, recordsKey])

    return capacities
}
