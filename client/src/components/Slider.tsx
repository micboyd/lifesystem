import { useState } from 'react'

interface SliderProps {
    min?: number
    max?: number
    step?: number
    value?: number
    defaultValue?: number
    onChange?: (value: number) => void
    label?: string
    showValue?: boolean
    disabled?: boolean
    className?: string
}

export default function Slider({
    min = 0,
    max = 100,
    step = 1,
    value,
    defaultValue,
    onChange,
    label,
    showValue = false,
    disabled = false,
    className = '',
}: SliderProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState(defaultValue ?? min)
    const current = isControlled ? value : internal

    function handleChange(next: number) {
        if (!isControlled) setInternal(next)
        onChange?.(next)
    }

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {(label || showValue) && (
                <div className="flex items-center justify-between">
                    {label && (
                        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            {label}
                        </span>
                    )}
                    {showValue && (
                        <span className="text-xs font-semibold tabular-nums text-neutral-500">
                            {current}
                        </span>
                    )}
                </div>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={current}
                disabled={disabled}
                onChange={(e) => handleChange(Number(e.target.value))}
                className={`h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-neutral-950 disabled:cursor-not-allowed disabled:opacity-50`}
            />
        </div>
    )
}
