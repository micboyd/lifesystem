import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Each area of life keeps one colour across the dashboard, shown as a small
 * tinted tile beside its heading and on its figure in the band above. Enough
 * colour to tell areas apart at a glance, never enough to compete with content.
 */
export const AREA_TONES = {
    coral: { tile: 'bg-coral-50 text-coral-600', bar: 'bg-coral-500' },
    navy: { tile: 'bg-brand-50 text-brand-500', bar: 'bg-brand-500' },
    green: { tile: 'bg-success-bg text-success', bar: 'bg-success' },
    amber: { tile: 'bg-warning-bg text-amber-600', bar: 'bg-marigold' },
    sky: { tile: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500' },
    violet: { tile: 'bg-violet-50 text-violet-600', bar: 'bg-violet-500' },
} as const

export type AreaTone = keyof typeof AREA_TONES

/** The tinted icon tile used beside headings and figures. */
export function AreaIcon({ icon, tone, size = 'md' }: { icon: string; tone: AreaTone; size?: 'sm' | 'md' }) {
    const box = size === 'sm' ? 'h-7 w-7 rounded-lg text-xs' : 'h-8 w-8 rounded-[10px] text-sm'
    return (
        <span className={`grid shrink-0 place-items-center ${box} ${AREA_TONES[tone].tile}`} aria-hidden="true">
            <i className={icon} />
        </span>
    )
}

/**
 * A dashboard section without a box: a heading, an optional quiet link to the
 * full page, and the content sitting straight on the canvas. Space and a
 * hairline do the separating that cards used to.
 */
export default function DashSection({
    title,
    meta,
    icon,
    tone = 'navy',
    to,
    action,
    children,
    className = '',
}: {
    title: ReactNode
    /** Font Awesome class for the tinted tile beside the heading. */
    icon?: string
    tone?: AreaTone
    /** One quiet line under the heading, e.g. a place or a count. */
    meta?: ReactNode
    to?: string
    action?: string
    children: ReactNode
    className?: string
}) {
    return (
        <section className={`min-w-0 ${className}`}>
            <div className="mb-5 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    {icon && <AreaIcon icon={icon} tone={tone} />}
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold tracking-[-0.015em] text-neutral-900">{title}</h2>
                        {meta && <p className="mt-0.5 truncate text-[13px] text-neutral-500">{meta}</p>}
                    </div>
                </div>
                {to && action && (
                    <Link
                        to={to}
                        className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                    >
                        {action}
                        <i
                            className="fa-solid fa-arrow-right text-[11px] transition-transform duration-150 group-hover:translate-x-0.5"
                            aria-hidden="true"
                        />
                    </Link>
                )}
            </div>
            {children}
        </section>
    )
}

/** The quiet loading line a section shows while it fetches. */
export function SectionLoading({ rows = 3 }: { rows?: number }) {
    return (
        <div className="flex flex-col gap-3" aria-label="Loading">
            {Array.from({ length: rows }, (_, i) => (
                <span key={i} className="h-5 animate-pulse rounded-md bg-neutral-200/60" style={{ width: `${90 - i * 18}%` }} />
            ))}
        </div>
    )
}
