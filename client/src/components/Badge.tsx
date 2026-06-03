type BadgeVariant = 'default' | 'outline' | 'success' | 'warning' | 'danger'

interface BadgeProps {
    variant?: BadgeVariant
    children: React.ReactNode
    className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
    default: 'bg-black text-white',
    outline: 'bg-transparent text-black border border-black',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
}

export default function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
    return (
        <span
            className={`inline-flex items-center px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ${variantClasses[variant]} ${className}`}
        >
            {children}
        </span>
    )
}
