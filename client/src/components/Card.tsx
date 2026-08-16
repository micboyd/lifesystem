import type { ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface CardProps {
    children: ReactNode
    className?: string
}

interface CardRootProps extends CardProps {
    /** Element to render as (e.g. "div", "section", "article"). Defaults to "div". */
    as?: ElementType
    /**
     * Drop the default `p-6` padding for full-bleed, sectioned cards that supply
     * their own headers/footers/rows (e.g. a colored header bar). Pair with
     * `overflow-hidden` so the contents clip to the rounded corners.
     */
    flush?: boolean
    /**
     * Lift-and-shadow on hover. On by default; pass `false` for large or densely
     * interactive cards (e.g. a calendar grid) where hovering the contents
     * shouldn't animate the whole card.
     */
    hover?: boolean
}

export function Card({
    as: Tag = 'div',
    children,
    className = '',
    flush = false,
    hover = true,
}: CardRootProps) {
    // Tighter padding on phones: `p-6` would eat 48px of a 375px viewport.
    const base = `rounded-3xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${flush ? '' : 'p-4 sm:p-6'}`
    const hoverCls = hover
        ? 'transition-all duration-300 hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.14)] hover:-translate-y-0.5'
        : ''
    return <Tag className={`${base} ${hoverCls} ${className}`}>{children}</Tag>
}

export function CardHeader({ children, className = '' }: CardProps) {
    return <div className={`mb-4 ${className}`}>{children}</div>
}

export function CardTitle({ children, className = '' }: CardProps) {
    return (
        <h3 className={`text-lg font-bold tracking-tight text-neutral-900 ${className}`}>
            {children}
        </h3>
    )
}

interface CardActionProps extends CardProps {
    to: string
    /** Optional router state to pass through to the destination. */
    state?: unknown
}

/**
 * The standard header action for widget-style cards: a quiet label with a
 * trailing arrow that darkens on hover. Keeps every card's "go to the full
 * page" affordance identical.
 */
export function CardAction({ to, state, children, className = '' }: CardActionProps) {
    return (
        <Link
            to={to}
            state={state}
            className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900 ${className}`}
        >
            {children}
            <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
        </Link>
    )
}

export function CardBody({ children, className = '' }: CardProps) {
    return <div className={`text-sm leading-relaxed text-neutral-500 ${className}`}>{children}</div>
}

export function CardFooter({ children, className = '' }: CardProps) {
    return <div className={`mt-6 pt-4 border-t border-black/[0.06] ${className}`}>{children}</div>
}
