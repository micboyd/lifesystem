import type { ReactNode } from 'react'

export type ToastVariant = 'info' | 'success' | 'warning' | 'danger'

interface ToastProps {
    variant?: ToastVariant
    children?: ReactNode
    onClose?: () => void
    /**
     * How long the toast will stay up, in ms. Drives the draining rail along the
     * bottom edge; omit it and no rail is drawn, for a toast that waits to be
     * dismissed.
     */
    duration?: number
    /** Font Awesome class string, e.g. "fa-solid fa-rocket". Pass null to hide. */
    icon?: string | null
    className?: string
}

/**
 * How each variant is coloured. A toast is a white card rather than a tinted
 * panel: it floats over whatever the page is showing, so it has to read as a
 * layer above the content, not a block of it. The variant shows up in the icon
 * badge and the draining rail, which is enough to tell success from failure at a
 * glance without staining the whole surface.
 */
const variantClasses: Record<ToastVariant, { badge: string; rail: string }> = {
    info: { badge: 'bg-neutral-100 text-neutral-600', rail: 'bg-neutral-400' },
    success: { badge: 'bg-herb-50 text-herb', rail: 'bg-herb' },
    warning: { badge: 'bg-marigold-50 text-amber-700', rail: 'bg-marigold' },
    danger: { badge: 'bg-red-50 text-red-600', rail: 'bg-red-500' },
}

const variantIcons: Record<ToastVariant, string> = {
    info: 'fa-solid fa-circle-info',
    success: 'fa-solid fa-check',
    warning: 'fa-solid fa-triangle-exclamation',
    danger: 'fa-solid fa-xmark',
}

/**
 * A floating, self-dismissing message. Distinct from `Alert`, which is the
 * inline version that sits in the flow of a page and stays until the page moves
 * on: a toast needs elevation, an entrance, and a sense of its own countdown.
 *
 * The rounding, the ring and the shadow all sit on this one element on purpose.
 * Splitting them across a wrapper leaves the shadow tracing a square while the
 * surface is rounded, which shows up as dark corners around the box.
 */
export default function Toast({
    variant = 'info',
    children,
    onClose,
    duration,
    icon,
    className = '',
}: ToastProps) {
    const iconClass = icon === undefined ? variantIcons[variant] : icon
    const { badge, rail } = variantClasses[variant]

    return (
        <div
            role={variant === 'danger' ? 'alert' : 'status'}
            className={`toast-enter relative flex items-center gap-3 overflow-hidden rounded-2xl bg-white py-3 pl-3 pr-2.5 shadow-xl shadow-neutral-950/10 ring-1 ring-neutral-950/[0.06] ${className}`}
        >
            {iconClass && (
                <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs ${badge}`}
                >
                    <i className={iconClass} aria-hidden="true" />
                </span>
            )}

            <div className="min-w-0 flex-1 text-sm font-medium leading-snug text-neutral-800">
                {children}
            </div>

            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Dismiss"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-xmark text-sm" aria-hidden="true" />
                </button>
            )}

            {/* Drains left to right over the toast's life, so a message that is
                about to disappear on its own gives some warning first. */}
            {!!duration && (
                <span
                    aria-hidden="true"
                    className={`toast-drain absolute inset-x-0 bottom-0 h-0.5 ${rail}`}
                    style={{ animationDuration: `${duration}ms` }}
                />
            )}
        </div>
    )
}
