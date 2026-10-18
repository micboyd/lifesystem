import type { ReactNode } from 'react'

/** The ⋯ trigger every row and card on the page opens its menu from. */
export function MoreTrigger({ label = 'Options' }: { label?: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
        >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
        </button>
    )
}

/** A multi-select pill — tap to include or leave out. */
export function ChipToggle({
    on,
    onClick,
    icon,
    children,
}: {
    on: boolean
    onClick: () => void
    icon?: string
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                on
                    ? 'bg-neutral-900 text-white'
                    : 'bg-white text-neutral-600 ring-1 ring-neutral-200 hover:ring-neutral-300'
            }`}
        >
            {icon && <i className={`${icon} text-[11px]`} aria-hidden="true" />}
            {children}
        </button>
    )
}

/** The small uppercase label above each section of the page and its forms. */
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <p className={`text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600 ${className}`}>{children}</p>
    )
}

/** "34d left", "Due today", "3d overdue". */
export function deadlineLabel(days: number): string {
    if (days < 0) return `${Math.abs(days)}d overdue`
    if (days === 0) return 'Due today'
    return `${days}d left`
}

export function deadlineTone(days: number): string {
    if (days < 0) return 'text-red-600'
    if (days <= 7) return 'text-amber-600'
    return 'text-neutral-500'
}
