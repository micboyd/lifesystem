import type { ReactNode } from 'react'
import { compass, conditionTone, weatherInfo } from '../../lib/weather'

/**
 * The small vocabulary the Weather page and its drawers share: a tinted
 * condition icon, overline section labels, metric cells and a wind arrow.
 */

export function ConditionIcon({
    code,
    isDay = true,
    className = '',
}: {
    code: number
    isDay?: boolean
    className?: string
}) {
    return <i className={`${weatherInfo(code, isDay).icon} ${conditionTone(code, isDay)} ${className}`} aria-hidden="true" />
}

/** The condition icon in a soft tile, for drawer headers. */
export function ConditionTile({ code, isDay = true }: { code: number; isDay?: boolean }) {
    return (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-neutral-50 text-[32px]">
            <ConditionIcon code={code} isDay={isDay} />
        </span>
    )
}

export function Overline({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="flex min-h-6 items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">{children}</p>
            {aside}
        </div>
    )
}

export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <Overline aside={aside}>{title}</Overline>
            {children}
        </section>
    )
}

/** An arrow pointing the way the wind is blowing (bearing is where it comes from). */
export function WindArrow({ degrees, className = '' }: { degrees: number; className?: string }) {
    return (
        // The rotation sits on a wrapper: Font Awesome copies an <i>'s inline
        // style onto its nested <svg>, which would rotate the arrow twice.
        <span
            className={`inline-block leading-none ${className}`}
            style={{ transform: `rotate(${degrees + 180}deg)` }}
            role="img"
            aria-label={`From the ${compass(degrees)}`}
        >
            <i className="fa-solid fa-arrow-up" aria-hidden="true" />
        </span>
    )
}

/** One labelled reading in a metric grid. */
export function Metric({
    icon,
    label,
    value,
    sub,
}: {
    icon: string
    label: string
    value: ReactNode
    sub?: ReactNode
}) {
    return (
        <div className="rounded-2xl bg-neutral-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
                <i className={`${icon} w-3.5 text-center text-[11px]`} aria-hidden="true" />
                {label}
            </p>
            <p className="mt-1 text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
        </div>
    )
}

export function MetricGrid({ children }: { children: ReactNode }) {
    return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>
}

/** The plain-English clothing tip in a quiet callout. */
export function WearNote({ children }: { children: ReactNode }) {
    return (
        <div className="flex gap-3 rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
            <i className="fa-solid fa-shirt mt-0.5 text-neutral-400" aria-hidden="true" />
            <p className="first-letter:uppercase">{children}</p>
        </div>
    )
}

/** "2026-10-20T07:31" → "07:31". */
export function clockTime(iso?: string): string {
    return iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '—'
}
