import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { listCalendars, updateCalendar } from '../services/calendars'
import { useAuth } from './AuthContext'
import type { Calendar } from '../types'

/**
 * The user's calendar layers, loaded once per session.
 *
 * Every calendar-aware surface reads from here rather than being handed the
 * list, which keeps chip colours consistent between the grid, the day page and
 * the dashboard without threading props through all of them.
 */
interface CalendarsValue {
    calendars: Calendar[]
    /** Lookup by id — the shape most consumers actually want. */
    byId: Map<string, Calendar>
    defaultCalendar: Calendar | null
    loading: boolean
    reload: () => Promise<void>
    /** Show or hide a layer. Optimistic; the server is the record of truth. */
    setVisible: (id: string, visible: boolean) => Promise<void>
}

const CalendarsContext = createContext<CalendarsValue | undefined>(undefined)

export function CalendarsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth()
    const [calendars, setCalendars] = useState<Calendar[]>([])
    const [loading, setLoading] = useState(true)

    const reload = useCallback(async () => {
        if (!user) {
            setCalendars([])
            setLoading(false)
            return
        }
        try {
            setCalendars(await listCalendars())
        } catch {
            setCalendars([])
        } finally {
            setLoading(false)
        }
    }, [user])

    useEffect(() => {
        void reload()
    }, [reload])

    const setVisible = useCallback(async (id: string, visible: boolean) => {
        setCalendars((prev) => prev.map((c) => (c._id === id ? { ...c, visible } : c)))
        try {
            await updateCalendar(id, { visible })
        } catch {
            // Roll back so the filter bar can't claim a state the server rejected.
            setCalendars((prev) => prev.map((c) => (c._id === id ? { ...c, visible: !visible } : c)))
        }
    }, [])

    const value = useMemo<CalendarsValue>(() => {
        const byId = new Map(calendars.map((c) => [c._id, c]))
        return {
            calendars,
            byId,
            defaultCalendar: calendars.find((c) => c.isDefault) ?? null,
            loading,
            reload,
            setVisible,
        }
    }, [calendars, loading, reload, setVisible])

    return <CalendarsContext.Provider value={value}>{children}</CalendarsContext.Provider>
}

export function useCalendars(): CalendarsValue {
    const ctx = useContext(CalendarsContext)
    if (!ctx) throw new Error('useCalendars must be used within a CalendarsProvider')
    return ctx
}
