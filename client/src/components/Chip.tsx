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
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border border-neutral-200 bg-white pl-3 ${onRemove ? 'pr-1.5' : 'pr-3'} text-[13px] font-medium text-neutral-700 ${className}`}
        >
            {icon && <i className={`${icon} text-xs text-neutral-500`} aria-hidden="true" />}
            {children}
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label="Remove"
                    className="grid h-5 w-5 place-items-center rounded-full text-neutral-500 transition-colors duration-150 hover:bg-neutral-200 hover:text-neutral-700"
                >
                    <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                </button>
            )}
        </span>
    )
}
