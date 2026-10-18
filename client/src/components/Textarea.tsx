import type { TextareaHTMLAttributes } from 'react'
import { FIELD_BASE, FIELD_ERROR, FIELD_ERROR_TEXT, FIELD_HINT, FIELD_IDLE, FIELD_LABEL } from './fieldStyles'

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
                <label htmlFor={textareaId} className={FIELD_LABEL}>
                    {label}
                </label>
            )}
            <textarea
                id={textareaId}
                rows={rows}
                className={[
                    FIELD_BASE,
                    'resize-y px-3.5 py-2.5 leading-6',
                    error ? FIELD_ERROR : FIELD_IDLE,
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                {...props}
            />
            {hint && !error && <p className={FIELD_HINT}>{hint}</p>}
            {error && (
                <p className={FIELD_ERROR_TEXT}>
                    <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                    {error}
                </p>
            )}
        </div>
    )
}
