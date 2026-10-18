import type { ReactNode } from 'react'

/**
 * The parts every overlay shares, so a drawer, a modal and a bottom sheet open
 * with the same header, the same padding and the same footer. Each shell only
 * decides where the panel sits and how it moves.
 */

/** The dimmed page behind any overlay. */
export function OverlayBackdrop({ open, onClose, duration = 'duration-200' }: { open: boolean; onClose: () => void; duration?: string }) {
    return (
        <div
            onClick={onClose}
            aria-hidden="true"
            className={`absolute inset-0 bg-neutral-900/40 transition-opacity ${duration} ${open ? 'opacity-100' : 'opacity-0'}`}
        />
    )
}

export function OverlayCloseButton({ onClose, className = '' }: { onClose: () => void; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900 ${className}`}
        >
            <i className="fa-solid fa-xmark text-base" aria-hidden="true" />
        </button>
    )
}

/** Title row: optional back arrow, the title, an optional count or date badge, then close. */
export function OverlayHeader({
    title,
    badge,
    onBack,
    onClose,
}: {
    title?: ReactNode
    badge?: ReactNode
    onBack?: () => void
    onClose: () => void
}) {
    return (
        <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 py-3 pl-5 pr-3 sm:pl-6">
            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    aria-label="Back"
                    className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                </button>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <h2 className="truncate text-lg font-semibold tracking-[-0.015em] text-neutral-900">{title}</h2>
                {badge && (
                    <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-neutral-100 px-2.5 text-xs font-medium text-neutral-700">
                        {badge}
                    </span>
                )}
            </div>
            <OverlayCloseButton onClose={onClose} />
        </div>
    )
}

/** Scrolling content area: one padding and one text colour for every overlay. */
export function OverlayBody({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-relaxed text-neutral-700 sm:px-6 ${className}`}>
            {children}
        </div>
    )
}

/** Pinned actions, primary last (rightmost), clear of the home indicator on phones. */
export function OverlayFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <div className={`flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-neutral-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 ${className}`}>
            {children}
        </div>
    )
}
