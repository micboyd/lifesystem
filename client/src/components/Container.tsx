import type { ElementType, ReactNode } from 'react'

interface ContainerProps {
    /** Element to render as (e.g. "div", "main", "section"). Defaults to "div". */
    as?: ElementType
    /**
     * Full-width mode: drop the max-width cap and span the viewport, keeping the
     * same horizontal padding. Use this for the two canonical page layouts —
     * constrained (default) or full — so every screen is one or the other.
     */
    fluid?: boolean
    /** A wider cap (1280px) for dashboards that lay cards side by side. */
    wide?: boolean
    children: ReactNode
    className?: string
}

/**
 * Page container with consistent horizontal padding. Two states:
 * `Container` (centered, max-width capped) and `Container fluid` (edge-to-edge).
 * Use it to wrap nav and page content so their edges line up.
 */
export default function Container({
    as: Tag = 'div',
    fluid = false,
    wide = false,
    children,
    className = '',
}: ContainerProps) {
    return (
        <Tag className={`mx-auto w-full px-4 sm:px-6 ${fluid ? '' : wide ? 'max-w-7xl' : 'max-w-6xl'} ${className}`}>
            {children}
        </Tag>
    )
}
