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
            className={`inline-flex items-center gap-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className}`}
        >
            <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={disabled}
                onClick={toggle}
                className={[
                    'grid h-[18px] w-[18px] shrink-0 place-items-center border transition-colors duration-150 disabled:cursor-not-allowed',
                    on
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-400 bg-white hover:border-neutral-900',
                ].join(' ')}
            >
                {on && <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />}
            </button>
            {label && <span className="text-[15px] text-neutral-900">{label}</span>}
        </label>
    )
}
