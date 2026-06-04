import { useState } from 'react'

interface CheckboxProps {
    checked?: boolean
    defaultChecked?: boolean
    onChange?: (checked: boolean) => void
    label?: string
    disabled?: boolean
    className?: string
}

export default function Checkbox({
    checked,
    defaultChecked,
    onChange,
    label,
    disabled = false,
    className = '',
}: CheckboxProps) {
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
            className={`inline-flex items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={toggle}
                className={[
                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all duration-150 disabled:cursor-not-allowed',
                    on
                        ? 'border-neutral-950 bg-neutral-950 text-white'
                        : 'border-neutral-300 bg-white hover:border-neutral-400',
                ].join(' ')}
            >
                {on && <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />}
            </button>
            {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
        </label>
    )
}
