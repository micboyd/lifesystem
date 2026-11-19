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
    // Modules run the full width of the screen now; both props stay for callers.
    void fluid
    void wide
    return (
        <Tag className={`w-full px-5 sm:px-8 lg:px-10 ${className}`}>
            {children}
        </Tag>
    )
}
