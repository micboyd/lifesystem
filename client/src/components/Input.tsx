import { forwardRef, type InputHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_ERROR, FIELD_ERROR_TEXT, FIELD_HINT, FIELD_IDLE, FIELD_LABEL } from './fieldStyles'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    hint?: string
    /** Font Awesome class string for a leading icon, e.g. "fa-solid fa-envelope". */
    icon?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { label, error, hint, icon, className = '', id, ...props },
    ref
) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label htmlFor={inputId} className={FIELD_LABEL}>
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-neutral-500">
                        <i className={`${icon} text-sm`} aria-hidden="true" />
                    </span>
                )}
                <input
                    ref={ref}
                    id={inputId}
                    aria-invalid={error ? true : undefined}
                    className={[
                        FIELD_BASE,
                        'h-11 pr-3.5',
                        icon ? 'pl-10' : 'pl-3.5',
                        error ? FIELD_ERROR : FIELD_IDLE,
                        className,
                    ]
                        .filter(Boolean)
                        .join(' ')}
                    {...props}
                />
            </div>
            {hint && !error && <p className={FIELD_HINT}>{hint}</p>}
            {error && (
                <p className={FIELD_ERROR_TEXT}>
                    <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                    {error}
                </p>
            )}
        </div>
    )
})

export default Input
