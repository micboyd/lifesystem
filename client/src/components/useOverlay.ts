import { useEffect } from 'react'

// Reference count of currently-open overlays. Stacking a Modal on top of a
// Drawer means two overlays lock scroll at once; we must only restore the
// body's original overflow once the *last* one closes, otherwise a stale
// `overflow: hidden` can be left behind and the page appears frozen.
let openOverlays = 0
let savedOverflow = ''

/**
 * Shared overlay behavior for Modal/Drawer: closes on Escape and locks
 * body scroll while open. No-ops when closed. Scroll-lock is reference
 * counted so nested/stacked overlays restore scrolling correctly.
 */
export function useOverlayBehavior(open: boolean, onClose: () => void) {
    useEffect(() => {
        if (!open) return

        function onKey(event: KeyboardEvent) {
            if (event.key === 'Escape') onClose()
        }

        document.addEventListener('keydown', onKey)
        if (openOverlays === 0) {
            savedOverflow = document.body.style.overflow
            document.body.style.overflow = 'hidden'
        }
        openOverlays++

        return () => {
            document.removeEventListener('keydown', onKey)
            openOverlays = Math.max(0, openOverlays - 1)
            if (openOverlays === 0) {
                document.body.style.overflow = savedOverflow
            }
        }
    }, [open, onClose])
}
