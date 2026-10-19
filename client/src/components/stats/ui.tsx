import type { ReactNode } from 'react'

/**
 * The flat panel the fitness stats and body screens are built from: white, a
 * hairline ring, 20px corners, no shadow.
 */
export function Surface({
    children,
    className = '',
    flush = false,
}: {
    children: ReactNode
    className?: string
    /** Drop the padding for panels that run rows edge to edge. */
    flush?: boolean
}) {
    return (
        <div
            className={`rounded-[20px] bg-white ring-1 ring-neutral-900/[0.06] ${
                flush ? '' : 'p-4 sm:p-5'
            } ${className}`}
        >
            {children}
        </div>
    )
}

/** A panel's title, an optional line under it, and controls on the right. */
export function PanelHeader({
    title,
    hint,
    aside,
}: {
    title: ReactNode
    hint?: ReactNode
    aside?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-neutral-900">{title}</h3>
                {hint && <p className="mt-0.5 text-[13px] text-neutral-500">{hint}</p>}
            </div>
            {aside}
        </div>
    )
}
