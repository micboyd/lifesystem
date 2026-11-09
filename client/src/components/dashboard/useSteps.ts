import { useEffect, useState } from 'react'
import { addDays } from '../../lib/calendar'
import type { DaySteps } from '../../lib/steps'
import { getGarminStatus, listSteps, pullSteps, type GarminStatus } from '../../services/garmin'

/** Stored days to read: a year, so the streak isn't cut off at the week on show. */
const STORED_DAYS_BACK = 365
/** Days to refresh from Garmin: the most it answers in a single call. */
const REFRESH_DAYS_BACK = 27

/**
 * What's stored shows straight away, then Garmin is asked in the background
 * about the recent days. A failed refresh stays quiet and the stored figures
 * stand.
 */
export function useSteps(today: string) {
    const [days, setDays] = useState<DaySteps[] | null>(null)
    const [status, setStatus] = useState<GarminStatus['status'] | null>(null)
    const [settled, setSettled] = useState(false)

    useEffect(() => {
        let active = true
        const storedFrom = addDays(today, -STORED_DAYS_BACK)
        listSteps(storedFrom, today)
            .then((d) => active && setDays((now) => now ?? d))
            .catch(() => active && setDays((now) => now ?? []))
        getGarminStatus()
            .then(async (s) => {
                if (!active) return
                setStatus(s.status)
                if (s.status !== 'connected') return
                await pullSteps(addDays(today, -REFRESH_DAYS_BACK), today)
                const fresh = await listSteps(storedFrom, today)
                if (active) setDays(fresh)
            })
            .catch(() => undefined)
            .finally(() => active && setSettled(true))
        return () => {
            active = false
        }
    }, [today])

    return { days, status, settled }
}
