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

const variantClasses: Record<AlertVariant, string> = {
    info: 'bg-neutral-50 border-neutral-200 text-neutral-700',
    success: 'bg-herb/10 border-herb/30 text-herb',
    warning: 'bg-marigold/10 border-marigold/40 text-amber-800',
    danger: 'bg-red-50 border-red-100 text-red-700',
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
            className={`flex items-start gap-3 rounded-xl border p-4 ${variantClasses[variant]} ${className}`}
        >
            {iconClass && <i className={`${iconClass} mt-0.5 text-sm`} aria-hidden="true" />}
            <div className="min-w-0 flex-1">
                {title && <p className="text-sm font-semibold tracking-tight">{title}</p>}
                {children && <div className={`text-sm ${title ? 'mt-0.5 opacity-80' : ''}`}>{children}</div>}
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
