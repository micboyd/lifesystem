import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'brand' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    fullWidth?: boolean
    /** Font Awesome class string, e.g. "fa-solid fa-arrow-right". */
    icon?: string
    iconPosition?: 'left' | 'right'
    children: ReactNode
}

const variantClasses: Record<Variant, string> = {
    primary:
        'bg-coral-500 text-white shadow-sm shadow-coral-500/25 hover:bg-coral-600 active:bg-coral-700',
    // The work workspace's accent. Same shape as `primary`, so a page can pick
    // the accent that matches the workspace it's in without restyling itself.
    brand: 'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-500 active:bg-brand-700',
    secondary:
        'bg-white text-neutral-900 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100',
    ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200',
}

const sizeClasses: Record<Size, string> = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-3.5 text-base',
}

export default function Button({
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    icon,
    iconPosition = 'left',
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    const iconEl = icon ? <i className={icon} aria-hidden="true" /> : null

    return (
        <button
            className={[
                'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
                variantClasses[variant],
                sizeClasses[size],
                fullWidth ? 'w-full' : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            disabled={disabled}
            {...props}
        >
            {iconPosition === 'left' && iconEl}
            {children}
            {iconPosition === 'right' && iconEl}
        </button>
    )
}
