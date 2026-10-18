import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'
import { OverlayBackdrop, OverlayBody, OverlayCloseButton, OverlayFooter, OverlayHeader } from './overlayParts'

type ModalSize = 'sm' | 'md' | 'lg'

interface ModalProps {
    open: boolean
    onClose: () => void
    title?: string
    children: ReactNode
    footer?: ReactNode
    size?: ModalSize
    className?: string
}

const sizeClasses: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
}

export default function Modal({
    open,
    onClose,
    title,
    children,
    footer,
    size = 'md',
    className = '',
}: ModalProps) {
    useOverlayBehavior(open, onClose)
    if (!open) return null

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <OverlayBackdrop open onClose={onClose} />
            <div
                role="dialog"
                aria-modal="true"
                className={`relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-[20px] bg-white shadow-xl ring-1 ring-neutral-900/[0.06] ${sizeClasses[size]} ${className}`}
            >
                {title ? (
                    <OverlayHeader title={title} onClose={onClose} />
                ) : (
                    <OverlayCloseButton onClose={onClose} className="absolute right-3 top-3 z-10" />
                )}
                <OverlayBody>{children}</OverlayBody>
                {footer && <OverlayFooter>{footer}</OverlayFooter>}
            </div>
        </div>,
        document.body
    )
}
