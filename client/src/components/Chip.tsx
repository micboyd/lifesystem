import type { ReactNode } from 'react'

interface ChipProps {
    children: ReactNode
    /** Font Awesome class string for a leading icon, e.g. "fa-solid fa-tag". */
    icon?: string
    /** When provided, a dismiss (×) button is shown. */
    onRemove?: () => void
    className?: string
}

export default function Chip({ children, icon, onRemove, className = '' }: ChipProps) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white py-1 pl-3 ${onRemove ? 'pr-1.5' : 'pr-3'} text-sm font-medium text-neutral-700 ${className}`}
        >
            {icon && <i className={`${icon} text-xs text-neutral-400`} aria-hidden="true" />}
            {children}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Remove"
                    className="grid h-4 w-4 place-items-center rounded-full text-neutral-400 transition-colors duration-150 hover:bg-neutral-200 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                </button>
            )}
        </span>
    )
}
