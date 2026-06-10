import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'

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
            <div
                className="absolute inset-0 bg-neutral-900/60"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                className={`relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-2xl bg-white ${sizeClasses[size]} ${className}`}
            >
                {title ? (
                    <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-6 py-4">
                        <h2 className="text-lg font-bold tracking-tight text-neutral-900">
                            {title}
                        </h2>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <i className="fa-solid fa-xmark" aria-hidden="true" />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                )}

                <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed text-neutral-600">
                    {children}
                </div>

                {footer && (
                    <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-6 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    )
}
