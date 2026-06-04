import type { ReactNode } from 'react'

type BadgeVariant = 'default' | 'outline' | 'success' | 'warning' | 'danger'

interface BadgeProps {
    variant?: BadgeVariant
    children: ReactNode
    className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-neutral-950 text-white',
    outline: 'bg-transparent text-neutral-700 border border-neutral-200',
    success: 'bg-herb/15 text-herb',
    warning: 'bg-marigold/20 text-amber-700',
    danger: 'bg-red-50 text-red-600',
}

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tracking-tight ${variantClasses[variant]} ${className}`}
        >
            {children}
        </span>
    )
}
