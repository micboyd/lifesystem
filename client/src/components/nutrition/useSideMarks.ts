import { useCallback, useState } from 'react'
import { lineKey, sideMarked } from '../../lib/shopping'

/**
 * Which ingredients are sides, as marked on the Thinking ahead shopping list.
 * Kept on this device; unmarked names fall back to a guess (rice, pasta…).
 */
const KEY = 'nutrition.sides'

function read(): Record<string, boolean> {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
        return v && typeof v === 'object' ? v : {}
    } catch {
        return {}
    }
}

export function useSideMarks() {
    const [marks, setMarks] = useState(read)
    const isSide = useCallback((name: string) => sideMarked(name, marks), [marks])
    const setSide = useCallback((name: string, on: boolean) => {
        setMarks((prev) => {
            const next = { ...prev, [lineKey(name)]: on }
            try {
                localStorage.setItem(KEY, JSON.stringify(next))
            } catch {
                /* private window: just not remembered */
            }
            return next
        })
    }, [])
    return { isSide, setSide }
}

export type SideMarks = ReturnType<typeof useSideMarks>
