import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * `primary` is coral and appears once per view. `secondary` is the white,
 * hairline-bordered default for everything else. `ghost` is for quiet toolbar
 * actions, `strong` is ink for a confident non-primary action (on dark cards,
 * for instance), and `danger` is the tinted destructive action.
 */
type Variant = 'primary' | 'secondary' | 'ghost' | 'strong' | 'danger'
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
    primary: 'bg-coral-500 text-white hover:bg-coral-600 active:bg-coral-700',
    secondary:
        'bg-white text-neutral-900 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100',
    ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200',
    strong: 'bg-neutral-900 text-neutral-50 hover:bg-neutral-800 active:bg-neutral-700',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-100',
}

// 44px is the default so every primary control meets the touch-target size.
const sizeClasses: Record<Size, string> = {
    sm: 'h-9 rounded-[10px] px-3.5 text-[13px]',
    md: 'h-11 rounded-xl px-[18px] text-sm',
    lg: 'h-12 rounded-xl px-6 text-[15px]',
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
    const iconEl = icon ? <i className={`${icon} text-[0.9em]`} aria-hidden="true" /> : null

    return (
        <button
            className={[
                'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-100 disabled:text-neutral-500',
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
