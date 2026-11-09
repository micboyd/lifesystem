import { useCallback, useEffect, useState } from 'react'
import { listWalks, type Walk } from '../../services/walks'
import { listWeightLogs } from '../../services/weightLogs'
import { addDays, todayKey } from '../../lib/calendar'
import { sortWalks } from '../../lib/walking'

/** The weigh-in calories are worked from: the latest in the last six months. */
const WEIGHT_LOOKBACK_DAYS = 183

/** The latest weigh-in, or null if there's none or it can't be read. */
export function loadWeightKg(): Promise<number | null> {
    return listWeightLogs(addDays(todayKey(), -WEIGHT_LOOKBACK_DAYS))
        .then((logs) => logs[logs.length - 1]?.weight ?? null)
        .catch(() => null)
}

/** A day's walks, and the bodyweight their calories are estimated from. */
export function useWalks(date: string) {
    const [state, setState] = useState<{ date: string; walks: Walk[]; failed: boolean } | null>(null)
    const [weightKg, setWeightKg] = useState<number | null>(null)

    useEffect(() => {
        let active = true
        listWalks(date, date)
            .then((walks) => active && setState({ date, walks: sortWalks(walks), failed: false }))
            .catch(() => active && setState({ date, walks: [], failed: true }))
        return () => {
            active = false
        }
    }, [date])

    useEffect(() => {
        let active = true
        loadWeightKg().then((kg) => active && setWeightKg(kg))
        return () => {
            active = false
        }
    }, [])

    /** Put a saved walk in the list, or take it out if it moved to another day. */
    const upsert = useCallback((walk: Walk) => {
        setState((s) => {
            if (!s) return s
            const rest = s.walks.filter((w) => w._id !== walk._id)
            return { ...s, walks: walk.date === s.date ? sortWalks([...rest, walk]) : rest }
        })
    }, [])

    const remove = useCallback((id: string) => {
        setState((s) => (s ? { ...s, walks: s.walks.filter((w) => w._id !== id) } : s))
    }, [])

    const current = state?.date === date ? state : null
    return { walks: current?.walks ?? null, failed: current?.failed ?? false, weightKg, upsert, remove }
}
