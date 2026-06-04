import type { TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string
    error?: string
    hint?: string
}

export default function Textarea({
    label,
    error,
    hint,
    className = '',
    id,
    rows = 4,
    ...props
}: TextareaProps) {
    const textareaId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
        <div className="flex flex-col gap-1.5">
            {label && (
                <label
                    htmlFor={textareaId}
                    className="text-xs font-semibold uppercase tracking-wide text-neutral-400"
                >
                    {label}
                </label>
            )}
            <textarea
                id={textareaId}
                rows={rows}
                className={[
                    'w-full resize-y rounded-xl border bg-neutral-50 px-4 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400',
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
            {hint && !error && <p className="text-xs text-neutral-500">{hint}</p>}
            {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
    )
}
