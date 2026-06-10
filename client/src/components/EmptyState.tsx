import type { ReactNode } from 'react'

interface EmptyStateProps {
    /** Font Awesome class string, e.g. "fa-regular fa-folder-open". */
    icon?: string
    title: string
    description?: string
    action?: ReactNode
    className?: string
}

export default function EmptyState({
    icon = 'fa-regular fa-folder-open',
    title,
    description,
    action,
    className = '',
}: EmptyStateProps) {
    return (
        <div
            className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
        >
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-neutral-100 text-xl text-neutral-400">
                <i className={icon} aria-hidden="true" />
            </div>
            <h3 className="mt-4 text-base font-bold tracking-tight text-neutral-900">{title}</h3>
            {description && <p className="mt-1 max-w-sm text-sm text-neutral-400">{description}</p>}
            {action && <div className="mt-5">{action}</div>}
        </div>
    )
}
