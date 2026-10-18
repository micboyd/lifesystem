import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'outline' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
    variant?: BadgeVariant
    children: ReactNode
    className?: string
}

// Status badges lead with a dot so the state never rides on colour alone.
const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-neutral-900 text-neutral-50',
    outline: 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200',
    neutral: 'bg-neutral-100 text-neutral-700',
    success: 'bg-success-bg text-success',
    warning: 'bg-warning-bg text-warning',
    danger: 'bg-danger-bg text-danger',
    info: 'bg-info-bg text-info',
}

const DOTTED: BadgeVariant[] = ['success', 'warning', 'danger', 'info']

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
    return (
        <span
            className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${variantClasses[variant]} ${className}`}
        >
            {DOTTED.includes(variant) && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
            )}
            {children}
        </span>
    )
}
