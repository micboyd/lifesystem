import { useEffect, useState } from 'react'
import { listEvents } from '../../services/events'
import type { Event } from '../../types'

/** The day's calendar events. */
export function useDayEvents(date: string) {
    const [state, setState] = useState<{ date: string; events: Event[] } | null>(null)

    useEffect(() => {
        let active = true
        listEvents(date, date)
            .then((list) => active && setState({ date, events: list }))
            .catch(() => active && setState({ date, events: [] }))
        return () => {
            active = false
        }
    }, [date])

    return { loading: state?.date !== date, events: state?.date === date ? state.events : [] }
}
