import { useState, type ReactNode } from 'react'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
    content: ReactNode
    children: ReactNode
    placement?: Placement
    className?: string
}

const placementClasses: Record<Placement, string> = {
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
}

export default function Tooltip({
    content,
    children,
    placement = 'top',
    className = '',
}: TooltipProps) {
    const [show, setShow] = useState(false)

    return (
        <span
            className="relative inline-flex"
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
        >
            {children}
            {show && (
                <span
                    role="tooltip"
                    className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-neutral-950 px-2.5 py-1.5 text-xs font-medium text-white shadow-md ${placementClasses[placement]} ${className}`}
                >
                    {content}
                </span>
            )}
        </span>
    )
}
