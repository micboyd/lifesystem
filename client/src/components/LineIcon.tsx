import type { ReactNode } from 'react'

/**
 * Thin, feather-style line icons drawn as stroked SVG paths. Shared across the
 * app's IKEA-flavoured surfaces (sidebar, Study) so the icon language stays
 * consistent. Colour comes from `currentColor`; stroke weight is tunable.
 *
 * Dots (grip, more) set their own `fill` so they read as solid marks even
 * though the wrapper defaults to `fill="none"`.
 */
const paths: Record<string, ReactNode> = {
    home: (
        <>
            <path d="M3 9.5 12 3l9 6.5" />
            <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
            <path d="M9.5 21v-6h5v6" />
        </>
    ),
    report: (
        <>
            <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
            <path d="M14 3v5h5" />
            <path d="M8.5 13h7M8.5 17h7M8.5 9h2" />
        </>
    ),
    calendar: (
        <>
            <rect x="3.5" y="5" width="17" height="16" rx="1.5" />
            <path d="M16 3v4M8 3v4M3.5 10h17" />
        </>
    ),
    finances: (
        <>
            <path d="M3 7a1 1 0 0 1 1-1h13v3" />
            <path d="M3 7v11a1 1 0 0 0 1 1h16v-4" />
            <path d="M21 10v4h-4a2 2 0 0 1 0-4z" />
        </>
    ),
    timebox: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
        </>
    ),
    habits: (
        <>
            <path d="M17 2.5 20.5 6 17 9.5" />
            <path d="M3.5 11.5V9a3 3 0 0 1 3-3h14" />
            <path d="M7 21.5 3.5 18 7 14.5" />
            <path d="M20.5 12.5V15a3 3 0 0 1-3 3h-14" />
        </>
    ),
    study: (
        <>
            <path d="M12 4 2.5 8.5 12 13l9.5-4.5z" />
            <path d="M6.5 10.5V16c0 1 2.5 2.5 5.5 2.5s5.5-1.5 5.5-2.5v-5.5" />
            <path d="M21.5 8.5V14" />
        </>
    ),
    notes: (
        <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
    ),
    weather: (
        <>
            <path d="M8 18a4.5 4.5 0 1 1 1-8.9A5 5 0 1 1 18 11" />
            <path d="M6.5 18h11a3 3 0 0 0 0-6 3.4 3.4 0 0 0-.5 0" />
        </>
    ),
    profile: (
        <>
            <circle cx="12" cy="8" r="4" />
            <path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
        </>
    ),
    'chevron-right': <path d="m9 6 6 6-6 6" />,
    clock: (
        <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3.5 2" />
        </>
    ),
    cube: (
        <>
            <path d="M21 8 12 3 3 8v8l9 5 9-5z" />
            <path d="M3 8l9 5 9-5M12 13v8" />
        </>
    ),
    check: <path d="M20 6 9 17l-5-5" />,
    flag: (
        <>
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
            <path d="M4 22v-7" />
        </>
    ),
    alert: (
        <>
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
        </>
    ),
    'trending-down': (
        <>
            <path d="M23 18 13.5 8.5 8.5 13.5 1 6" />
            <path d="M17 18h6v-6" />
        </>
    ),
    'external-link': (
        <>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6M10 14 21 3" />
        </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    pen: (
        <>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2 2 0 0 1 3 3L7 19l-4 1 1-4z" />
        </>
    ),
    trash: (
        <>
            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
            <path d="M10 11v6M14 11v6" />
        </>
    ),
    grip: (
        <g fill="currentColor" stroke="none">
            <circle cx="9" cy="6" r="1.4" />
            <circle cx="9" cy="12" r="1.4" />
            <circle cx="9" cy="18" r="1.4" />
            <circle cx="15" cy="6" r="1.4" />
            <circle cx="15" cy="12" r="1.4" />
            <circle cx="15" cy="18" r="1.4" />
        </g>
    ),
    more: (
        <g fill="currentColor" stroke="none">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
        </g>
    ),
}

export type LineIconName = keyof typeof paths

interface LineIconProps {
    name: LineIconName
    className?: string
    strokeWidth?: number
}

export default function LineIcon({ name, className = '', strokeWidth = 1.5 }: LineIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={className}
        >
            {paths[name]}
        </svg>
    )
}
