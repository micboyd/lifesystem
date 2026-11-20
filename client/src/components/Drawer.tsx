import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'
import { OverlayBackdrop, OverlayBody, OverlayFooter, OverlayHeader } from './overlayParts'

type DrawerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

interface DrawerProps {
    open: boolean
    onClose: () => void
    side?: 'left' | 'right'
    title?: string
    badge?: string
    children: ReactNode
    footer?: ReactNode
    size?: DrawerSize
    className?: string
}

const sizeClasses: Record<DrawerSize, string> = {
    sm: 'sm:max-w-xs',
    md: 'sm:max-w-sm',
    lg: 'sm:max-w-md',
    // Extended: a quarter of the viewport on wide screens, never narrower than
    // `lg` (28rem) so forms stay comfortable on smaller laptops.
    xl: 'sm:w-1/4 sm:min-w-[28rem] sm:max-w-none',
    // Large: about half the viewport, capped so it stays readable, for content-
    // heavy drawers like the workout builder (exercise list + sets/reps).
    '2xl': 'sm:w-1/2 sm:min-w-[32rem] sm:max-w-2xl',
}

export default function Drawer({
    open,
    onClose,
    side = 'right',
    title,
    badge,
    children,
    footer,
    size = 'md',
    className = '',
}: DrawerProps) {
    useOverlayBehavior(open, onClose)

    // Kept mounted so the slide transition plays on both open and close.

    // Phones: a full-screen sheet. From sm up: a full-height panel flush to the
    // edge, square, with one ink line along its inner edge.
    const hiddenTransform = side === 'right' ? 'translate-x-[calc(100%+3rem)]' : '-translate-x-[calc(100%+3rem)]'

    return createPortal(
        <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
            <OverlayBackdrop open={open} onClose={onClose} duration="duration-300" />
            <div
                role="dialog"
                aria-modal="true"
                aria-hidden={!open}
                className={[
                    'absolute inset-y-0 flex w-full flex-col overflow-hidden bg-white transition-transform duration-300 ease-out',
                    side === 'right' ? 'right-0 sm:border-l sm:border-neutral-900' : 'left-0 sm:border-r sm:border-neutral-900',
                    sizeClasses[size],
                    open ? 'translate-x-0' : hiddenTransform,
                    className,
                ].join(' ')}
            >
                <OverlayHeader title={title} badge={badge} onClose={onClose} />
                <OverlayBody>{children}</OverlayBody>
                {footer && <OverlayFooter>{footer}</OverlayFooter>}
            </div>
        </div>,
        document.body
    )
}
