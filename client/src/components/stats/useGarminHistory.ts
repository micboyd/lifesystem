import { useCallback, useEffect, useRef, useState } from 'react'
import type { WatchDay } from '../../lib/garminTrends'
import {
    garminError,
    getGarminHistory,
    getGarminHistoryState,
    getGarminStatus,
    syncGarminHistory,
    type GarminHistorySync,
    type GarminStatus,
} from '../../services/garmin'

const POLL_MS = 3000
/** While the sync runs, the days are re-read every this many polls, so the lines grow as it goes. */
const RELOAD_EVERY = 4

/**
 * The watch's stored history, shown straight away, while the server reads the
 * rest back from Garmin in the background. The first visit can take a few
 * minutes to reach the start of the data; after that only recent days are
 * refreshed.
 */
export function useGarminHistory(today: string) {
    const [days, setDays] = useState<WatchDay[] | null>(null)
    const [sync, setSync] = useState<GarminHistorySync | null>(null)
    const [status, setStatus] = useState<GarminStatus['status'] | null>(null)
    const [failed, setFailed] = useState(false)
    const [startError, setStartError] = useState<string | null>(null)
    const alive = useRef(true)
    const timer = useRef<number | undefined>(undefined)

    const reload = useCallback(async () => {
        const data = await getGarminHistory()
        if (!alive.current) return
        setDays(data.days)
        setSync(data.sync)
    }, [])

    const watch = useCallback(() => {
        let polls = 0
        const tick = async () => {
            if (!alive.current) return
            try {
                const state = await getGarminHistoryState()
                if (!alive.current) return
                setSync(state)
                polls += 1
                if (!state.running) {
                    await reload()
                    return
                }
                if (polls % RELOAD_EVERY === 0) await reload()
            } catch {
                // A dropped poll isn't worth a message; the next one tries again.
            }
            timer.current = window.setTimeout(tick, POLL_MS)
        }
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(tick, POLL_MS)
    }, [reload])

    const start = useCallback(
        async (restart = false) => {
            setStartError(null)
            try {
                const state = await syncGarminHistory(today, restart)
                if (!alive.current) return
                setSync(state)
                if (state.running) watch()
            } catch (err) {
                if (alive.current) setStartError(garminError(err).message)
            }
        },
        [today, watch]
    )

    useEffect(() => {
        alive.current = true
        reload().catch(() => alive.current && setFailed(true))
        getGarminStatus()
            .then((s) => {
                if (!alive.current) return
                setStatus(s.status)
                if (s.status === 'connected') void start()
            })
            .catch(() => undefined)
        return () => {
            alive.current = false
            window.clearTimeout(timer.current)
        }
    }, [reload, start])

    return { days, sync, status, failed, startError, restart: () => start(true) }
}
