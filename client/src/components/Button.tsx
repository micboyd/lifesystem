import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * AdminLife 3: `primary` is solid black, one per region. `secondary` is the
 * black outline, `ghost` the light outline for quiet actions, `strong` the
 * white button used on a black band, and `danger` an outline in deep rose.
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
    primary: 'bg-neutral-900 text-white hover:bg-black active:bg-neutral-800',
    secondary: 'bg-transparent text-neutral-900 border border-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
    ghost: 'bg-transparent text-neutral-900 border border-neutral-300 hover:border-neutral-900 active:bg-neutral-100',
    strong: 'bg-white text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
    danger: 'bg-transparent text-[#8e3b47] border border-neutral-300 hover:border-[#8e3b47] active:bg-red-50',
}

// Small capital labels, square corners. 44px default so every primary control
// meets the touch-target size; 40px in bars, 36px in rows.
const sizeClasses: Record<Size, string> = {
    sm: 'h-9 px-3 text-[11px] tracking-[0.12em] uppercase',
    md: 'h-11 px-5 text-[11px] tracking-[0.12em] uppercase lg:h-10',
    lg: 'h-12 px-6 text-[11px] tracking-[0.12em] uppercase',
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
    const iconEl = icon ? <i className={`${icon} text-[12px]`} aria-hidden="true" /> : null

    return (
        <button
            className={[
                'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150',
                'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-100 disabled:text-neutral-500',
                variantClasses[variant],
                sizeClasses[size],
                // Full-width buttons may shrink, so two side by side share the row
                // instead of each claiming 100% of it and pushing past the edge.
                fullWidth ? 'w-full min-w-0' : 'shrink-0',
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
