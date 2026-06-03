interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string
    error?: string
    hint?: string
}

export default function Input({ label, error, hint, className = '', id, ...props }: InputProps) {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label
                    htmlFor={inputId}
                    className="text-sm font-semibold tracking-tight text-black"
                >
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={[
                    'w-full bg-white border px-4 py-3 text-sm text-black placeholder:text-neutral-400',
                    'outline-none transition-colors duration-150',
                    error
                        ? 'border-red-500 focus:border-red-500'
                        : 'border-neutral-300 focus:border-black',
                    props.disabled ? 'opacity-50 cursor-not-allowed bg-neutral-50' : '',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...props}
            />
            {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    )
}
