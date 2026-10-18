import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'
import { OverlayBackdrop, OverlayBody, OverlayFooter, OverlayHeader } from './overlayParts'

/**
 * A sheet that rises from the bottom on a phone and sits centred on a desktop.
 *
 * For one-handed use — logging food in the kitchen — the controls belong
 * where the thumb is, which a centred modal or a side drawer doesn't give you.
 * The footer is pinned above the home indicator so the main action never
 * scrolls away with the content.
 */
export default function BottomSheet({
    open,
    onClose,
    title,
    onBack,
    children,
    footer,
}: {
    open: boolean
    onClose: () => void
    title?: ReactNode
    /** Shows a back arrow in place of nothing — for a second step inside the sheet. */
    onBack?: () => void
    children: ReactNode
    footer?: ReactNode
}) {
    useOverlayBehavior(open, onClose)

    return createPortal(
        <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
            <OverlayBackdrop open={open} onClose={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                aria-hidden={!open}
                className={`absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[20px] bg-white shadow-xl transition-transform duration-200 ease-out sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-[20px] sm:ring-1 sm:ring-neutral-900/[0.06] ${
                    open
                        ? 'translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2'
                        : 'translate-y-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:opacity-0'
                }`}
            >
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" aria-hidden="true" />
                <OverlayHeader title={title} onBack={onBack} onClose={onClose} />
                <OverlayBody>{children}</OverlayBody>
                {footer && <OverlayFooter className="[&>*]:w-full">{footer}</OverlayFooter>}
            </div>
        </div>,
        document.body
    )
}
