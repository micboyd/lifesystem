import { useEffect } from 'react'

/**
 * Shared overlay behavior for Modal/Drawer: closes on Escape and locks
 * body scroll while open. No-ops when closed.
 */
export function useOverlayBehavior(open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return

        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
        }

        document.addEventListener('keydown', onKey)
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.removeEventListener('keydown', onKey)
            document.body.style.overflow = previousOverflow
        }
    }, [open, onClose])
}
