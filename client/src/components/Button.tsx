type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
    size?: Size
    fullWidth?: boolean
    children: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
    primary: 'bg-black text-white hover:bg-neutral-800 active:bg-neutral-700',
    secondary: 'bg-white text-black border border-black hover:bg-neutral-100 active:bg-neutral-200',
    ghost: 'bg-transparent text-black hover:bg-neutral-100 active:bg-neutral-200',
}

const sizeClasses: Record<Size, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
}

export default function Button({
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    children,
    className = '',
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            className={[
                'inline-flex items-center justify-center font-semibold tracking-tight transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed',
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
            {children}
        </button>
    )
}
