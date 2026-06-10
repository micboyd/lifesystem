import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useOverlayBehavior } from './useOverlay'

type DrawerSize = 'sm' | 'md' | 'lg'

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
    const hiddenTransform = side === 'right' ? 'translate-x-full' : '-translate-x-full'

    return createPortal(
        <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                aria-hidden="true"
                className={`absolute inset-0 bg-neutral-900/60 transition-opacity duration-300 ${
                    open ? 'opacity-100' : 'opacity-0'
                }`}
            />

            {/* Panel */}
            <div
                role="dialog"
                aria-modal="true"
                className={[
                    'absolute inset-y-0 flex w-full flex-col bg-white transition-transform duration-300 ease-out',
                    side === 'right' ? 'right-0' : 'left-0',
                    sizeClasses[size],
                    open ? 'translate-x-0' : hiddenTransform,
                    className,
                ].join(' ')}
            >
                <div className="flex items-center justify-between gap-4 border-b border-neutral-100 px-5 py-4">
                    <div className="flex items-center gap-2 min-w-0">
                        <h2 className="text-base font-bold tracking-tight text-neutral-900 truncate">{title}</h2>
                        {badge && (
                            <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                                {badge}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-neutral-600">
                    {children}
                </div>

                {footer && (
                    <div className="flex items-center justify-end gap-3 border-t border-neutral-100 px-5 py-4">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    )
}
