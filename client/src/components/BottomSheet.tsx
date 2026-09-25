import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'

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
            <div
                onClick={onClose}
                aria-hidden="true"
                className={`absolute inset-0 bg-neutral-900/60 transition-opacity duration-200 ${
                    open ? 'opacity-100' : 'opacity-0'
                }`}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-hidden={!open}
                className={`absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-3xl bg-white shadow-xl transition-transform duration-200 ease-out sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-2xl ${
                    open
                        ? 'translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2'
                        : 'translate-y-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:opacity-0'
                }`}
            >
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-neutral-200 sm:hidden" aria-hidden="true" />
                <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-2 sm:px-5 sm:pt-4">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            aria-label="Back"
                            className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100"
                        >
                            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                        </button>
                    )}
                    <h2 className="min-w-0 flex-1 truncate text-base font-bold tracking-tight text-neutral-900">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100"
                    >
                        <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
                    </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-5">
                    {children}
                </div>
                {footer && (
                    <div className="shrink-0 border-t border-neutral-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
