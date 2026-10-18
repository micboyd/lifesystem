/**
 * A small run of mutually exclusive pills — the compact filter that sits in a
 * card header, where the full `Tabs` bar would be too loud and a dropdown would
 * hide the options behind a tap.
 *
 * Values are generic so callers keep their own union types instead of casting
 * strings back out of it.
 */
export default function PillToggle<T extends string | number>({
    options,
    value,
    onChange,
    label,
    className = '',
}: {
    options: { value: T; label: string }[]
    value: T
    onChange: (value: T) => void
    /** Names the group for screen readers, e.g. "Chart metric". */
    label: string
    className?: string
}) {
    return (
        <div role="group" aria-label={label} className={`flex flex-wrap gap-2 ${className}`}>
            {options.map((option) => {
                const on = option.value === value
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(option.value)}
                        className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
                            on
                                ? 'bg-neutral-900 text-neutral-50'
                                : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50 active:bg-neutral-100'
                        }`}
                    >
                        {option.label}
                    </button>
                )
            })}
        </div>
    )
}
