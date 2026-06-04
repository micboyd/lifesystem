import { useState } from 'react'

export interface RadioOption {
    label: string
    value: string
    disabled?: boolean
}

interface RadioGroupProps {
    options: RadioOption[]
    value?: string
    defaultValue?: string
    onChange?: (value: string) => void
    name?: string
    orientation?: 'vertical' | 'horizontal'
    disabled?: boolean
    className?: string
}

export default function RadioGroup({
    options,
    value,
    defaultValue,
    onChange,
    name,
    orientation = 'vertical',
    disabled = false,
    className = '',
}: RadioGroupProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState(defaultValue ?? '')
    const current = isControlled ? value : internal

    function select(next: string) {
        if (disabled) return
        if (!isControlled) setInternal(next)
        onChange?.(next)
    }

    return (
        <div
            role="radiogroup"
            className={[
                'flex gap-x-6 gap-y-3',
                orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {options.map((option) => {
                const selected = current === option.value
                const isDisabled = disabled || option.disabled
                return (
                    <label
                        key={option.value}
                        className={`inline-flex items-center gap-2.5 ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                        <button
                            type="button"
                            role="radio"
                            name={name}
                            aria-checked={selected}
                            disabled={isDisabled}
                            onClick={() => select(option.value)}
                            className={[
                                'grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-150 disabled:cursor-not-allowed',
                                selected
                                    ? 'border-neutral-950'
                                    : 'border-neutral-300 hover:border-neutral-400',
                            ].join(' ')}
                        >
                            {selected && (
                                <span className="h-2.5 w-2.5 rounded-full bg-neutral-950" />
                            )}
                        </button>
                        <span className="text-sm font-medium text-neutral-700">{option.label}</span>
                    </label>
                )
            })}
        </div>
    )
}
