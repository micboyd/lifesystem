import type { ElementType, ReactNode } from 'react'

interface ContainerProps {
    /** Element to render as (e.g. "div", "main", "section"). Defaults to "div". */
    as?: ElementType
    children: ReactNode
    className?: string
}

/**
 * Centered, max-width page container with consistent horizontal padding.
 * Use it to wrap nav and page content so their edges line up.
 */
export default function Container({ as: Tag = 'div', children, className = '' }: ContainerProps) {
    return <Tag className={`mx-auto w-full max-w-6xl px-4 sm:px-6 ${className}`}>{children}</Tag>
}
