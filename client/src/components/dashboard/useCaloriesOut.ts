import { useCallback, useEffect, useState } from 'react'
import { addDays } from '../../lib/calendar'
import { listDailyEnergy } from '../../services/dailyEnergy'
import {
    GARMIN_CALORIES_PULLED,
    getCaloriesToday,
    getGarminStatus,
    pullGarminCaloriesQuietly,
    type GarminStatus,
} from '../../services/garmin'

/** One finished day's burn. */
export interface DayBurn {
    date: string
    kcal: number
}

/** The finished days the widget shows. */
const WEEK = 7

/**
 * Whole-day calories out: the last week's finished days from what's stored
 * (DailyEnergy, which Garmin fills in), plus today's so-far figure read live
 * from Garmin. Stored days show straight away; Garmin is asked in the
 * background and a failure stays quiet.
 */
export function useCaloriesOut(today: string) {
    const [days, setDays] = useState<DayBurn[] | null>(null)
    const [todayKcal, setTodayKcal] = useState<number | null>(null)
    const [status, setStatus] = useState<GarminStatus['status'] | null>(null)
    const [settled, setSettled] = useState(false)
    const from = addDays(today, -WEEK)
    const to = addDays(today, -1)

    const load = useCallback(
        () =>
            listDailyEnergy(from, to)
                .then((rows) => setDays(rows.map((r) => ({ date: r.date, kcal: r.caloriesOut }))))
                .catch(() => setDays((now) => now ?? [])),
        [from, to]
    )

    useEffect(() => {
        let active = true
        load()
        getGarminStatus()
            .then(async (s) => {
                if (!active) return
                setStatus(s.status)
                if (s.status !== 'connected') return
                await Promise.all([
                    pullGarminCaloriesQuietly(from, to, today),
                    getCaloriesToday(today)
                        .then((k) => active && setTodayKcal(k))
                        .catch(() => undefined),
                ])
            })
            .catch(() => undefined)
            .finally(() => active && setSettled(true))
        const onPulled = () => load()
        window.addEventListener(GARMIN_CALORIES_PULLED, onPulled)
        return () => {
            active = false
            window.removeEventListener(GARMIN_CALORIES_PULLED, onPulled)
        }
    }, [today, from, to, load])

    return { days, todayKcal, status, settled }
}
