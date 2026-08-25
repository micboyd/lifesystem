import { useCallback, useEffect, useRef, useState } from 'react'

/** Matches the Drawer panel's slide transition. */
const EXIT_MS = 300

/**
 * Owns which task the drawer is showing.
 *
 * The drawer animates itself out, which it can only do while it still has a
 * task to render — so closing drops the `open` flag first and lets go of the
 * task once the panel has left. Every page that opens a task drawer needs the
 * same two-step, so it lives here rather than three times over.
 */
export function useTaskDrawer() {
    const [id, setId] = useState<string | null>(null)
    const [open, setOpen] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout>>()

    useEffect(() => () => clearTimeout(timer.current), [])

    const openTask = useCallback((taskId: string) => {
        clearTimeout(timer.current)
        setId(taskId)
        setOpen(true)
    }, [])

    const close = useCallback(() => {
        setOpen(false)
        timer.current = setTimeout(() => setId(null), EXIT_MS)
    }, [])

    return { id, open, openTask, close }
}
