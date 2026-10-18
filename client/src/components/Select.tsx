import { useEffect, useRef, useState } from 'react'
import { FIELD_ERROR_TEXT, FIELD_HINT, FIELD_LABEL } from './fieldStyles'

export interface SelectOption {
    label: string
    value: string
    disabled?: boolean
}

interface SelectProps {
    options: SelectOption[]
    value?: string
    defaultValue?: string
    onChange?: (value: string) => void
    placeholder?: string
    label?: string
    hint?: string
    error?: string
    /** Font Awesome class string for a leading icon, e.g. "fa-solid fa-tag". */
    icon?: string
    disabled?: boolean
    className?: string
}

export default function Select({
    options,
    value,
    defaultValue,
    onChange,
    placeholder = 'Select an option',
    label,
    hint,
    error,
    icon,
    disabled = false,
    className = '',
}: SelectProps) {
    const isControlled = value !== undefined
    const [internal, setInternal] = useState(defaultValue ?? '')
    const current = isControlled ? value : internal
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find((o) => o.value === current)

    useEffect(() => {
        if (!open) return
        function handle(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    function choose(option: SelectOption) {
        if (option.disabled) return
        if (!isControlled) setInternal(option.value)
        onChange?.(option.value)
        setOpen(false)
    }

    const triggerClasses = [
        'flex h-11 w-full items-center gap-3 rounded-xl border bg-white pl-3.5 pr-3 text-[15px] outline-none focus-visible:outline-none transition-[border-color,box-shadow] duration-150',
        open
            ? 'border-neutral-900 ring-4 ring-neutral-100'
            : error
              ? 'border-red-600'
              : 'border-neutral-200 hover:border-neutral-300 focus-visible:border-neutral-900 focus-visible:ring-4 focus-visible:ring-neutral-100',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    ].join(' ')

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && (
                <label className={FIELD_LABEL}>
                    {label}
                </label>
            )}
            <div ref={containerRef} className="relative">
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setOpen((o) => !o)}
                    className={triggerClasses}
                >
                    {icon && (
                        <i
                            className={`${icon} shrink-0 text-sm text-neutral-500`}
                            aria-hidden="true"
                        />
                    )}
                    <span
                        className={`flex-1 text-left ${selectedOption ? 'text-neutral-900' : 'text-neutral-500'}`}
                    >
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <i
                        className={`fa-solid fa-chevron-down shrink-0 text-[11px] text-neutral-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                    />
                </button>

                {open && (
                    <div className="absolute left-0 top-full z-50 mt-2 max-h-60 w-full overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl ring-1 ring-neutral-900/[0.06]">
                        {options.map((option) => {
                            const isSelected = option.value === current
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    disabled={option.disabled}
                                    onClick={() => choose(option)}
                                    className={[
                                        'flex min-h-10 w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-40',
                                        isSelected
                                            ? 'bg-neutral-100 font-medium text-neutral-900'
                                            : 'text-neutral-700 hover:bg-neutral-50',
                                    ].join(' ')}
                                >
                                    {option.label}
                                    {isSelected && (
                                        <i
                                            className="fa-solid fa-check text-xs"
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
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
}
