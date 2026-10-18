import type { ReactNode } from 'react'

type AlertVariant = 'info' | 'success' | 'warning' | 'danger'

interface AlertProps {
    variant?: AlertVariant
    title?: string
    children?: ReactNode
    onClose?: () => void
    /** Font Awesome class string, e.g. "fa-solid fa-rocket". Pass null to hide. */
    icon?: string | null
    className?: string
}

// Every variant is fully opaque — an alert can float over page content (as a
// toast does), where a tinted alpha would let whatever is behind it show through.
// Flat tinted panels with no border: the tint is the edge.
const variantClasses: Record<AlertVariant, string> = {
    info: 'bg-info-bg text-info',
    success: 'bg-success-bg text-emerald-800',
    warning: 'bg-warning-bg text-amber-800',
    danger: 'bg-danger-bg text-red-700',
}

const variantIcons: Record<AlertVariant, string> = {
    info: 'fa-solid fa-circle-info',
    success: 'fa-solid fa-circle-check',
    warning: 'fa-solid fa-triangle-exclamation',
    danger: 'fa-solid fa-circle-exclamation',
}

export default function Alert({
    variant = 'info',
    title,
    children,
    onClose,
    icon,
    className = '',
}: AlertProps) {
    const iconClass = icon === undefined ? variantIcons[variant] : icon

    return (
        <div
            role="alert"
            className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 ${variantClasses[variant]} ${className}`}
        >
            {iconClass && <i className={`${iconClass} mt-0.5 text-sm`} aria-hidden="true" />}
            <div className="min-w-0 flex-1">
                {title && <p className="text-sm font-semibold">{title}</p>}
                {children && (
                    <div className={`text-[13px] leading-[19px] ${title ? 'mt-0.5' : ''}`}>{children}</div>
                )}
            </div>
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Dismiss"
                    className="-mr-1 -mt-1 rounded-full px-2 py-1 text-sm opacity-60 transition-opacity duration-150 hover:opacity-100"
                >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
            )}
        </div>
    )
}
