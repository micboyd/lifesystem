import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    hint?: string
    /** Font Awesome class string for a leading icon, e.g. "fa-solid fa-envelope". */
    icon?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, error, hint, icon, className = '', id, ...props },
    ref,
) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label
                    htmlFor={inputId}
                    className="text-xs font-semibold uppercase tracking-wide text-neutral-400"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-neutral-300">
                        <i className={`${icon} text-sm`} aria-hidden="true" />
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    className={[
                        'w-full rounded-xl border bg-neutral-50 py-2.5 pr-4 text-sm text-neutral-900 placeholder:text-neutral-400',
                        icon ? 'pl-11' : 'pl-4',
                        'outline-none transition-all duration-150 focus:bg-white focus:ring-2',
                        error
                            ? 'border-red-400 focus:border-red-400 focus:ring-red-400/10'
                            : 'border-neutral-200 focus:border-neutral-400 focus:ring-neutral-200',
                        props.disabled ? 'opacity-50 cursor-not-allowed' : '',
                        className,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    {...props}
                />
            </div>
            {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    )
})

export default Input
