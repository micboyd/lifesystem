import { useState } from 'react'

interface SwitchProps {
    checked?: boolean
    defaultChecked?: boolean
    onChange?: (checked: boolean) => void
    label?: string
    disabled?: boolean
    className?: string
}

export default function Switch({
    checked,
    defaultChecked,
    onChange,
    label,
    disabled = false,
    className = '',
}: SwitchProps) {
    const isControlled = checked !== undefined
    const [internal, setInternal] = useState(defaultChecked ?? false)
    const on = isControlled ? checked : internal

    function toggle() {
        if (disabled) return
        if (!isControlled) setInternal(!on)
        onChange?.(!on)
    }

    return (
        <label
            className={`inline-flex items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
        >
            <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={disabled}
                onClick={toggle}
                className={[
                    'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:cursor-not-allowed',
                    on ? 'bg-neutral-950' : 'bg-neutral-200',
                ].join(' ')}
            >
                <span
                    className={[
                        'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                        on ? 'translate-x-5' : 'translate-x-0.5',
                    ].join(' ')}
                />
            </button>
            {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
        </label>
    )
}
