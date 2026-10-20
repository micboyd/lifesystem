import type { ReactNode } from 'react'
import { AREA_TONES, type AreaTone } from '../dashboard/DashSection'
import type { LifePillar } from '../../types'
import { CALENDAR_COLOR_CLASSES, LIFE_PILLAR_ICONS, type CalendarColor } from '../../types'
import { RESERVE_ICONS, type Reserve } from '../../lib/lifeLoad'

/**
 * The parts every Life Plan surface shares, so the timeline, the seasons and the
 * pressure check read as one module rather than four screens.
 *
 * Each pillar and each reserve keeps one dashboard area tone, so "body" is the
 * same colour on the overview, the heatmap and the month drawer.
 */

export const PILLAR_TONES: Record<LifePillar, AreaTone> = {
    training: 'coral',
    nutrition: 'green',
    money: 'amber',
    life: 'violet',
}

export const RESERVE_TONES: Record<Reserve, AreaTone> = {
    time: 'sky',
    body: 'coral',
    money: 'amber',
    focus: 'violet',
}

/**
 * A season or goal colour's classes. Stored colours can outlive the palette, so
 * an unknown one falls back to neutral rather than taking the page down.
 */
export function colorClasses(color: string | undefined) {
    return CALENDAR_COLOR_CLASSES[color as CalendarColor] ?? CALENDAR_COLOR_CLASSES.neutral
}

/** The flat white surface every card on the page sits on. */
export const PANEL = 'rounded-[20px] bg-white ring-1 ring-neutral-900/[0.06]'

/** The small uppercase label over a block. */
export const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'

/** A tinted icon tile in an area tone. */
export function ToneTile({
    icon,
    tone,
    size = 'md',
    title,
}: {
    icon: string
    tone: AreaTone
    size?: 'xs' | 'sm' | 'md'
    title?: string
}) {
    const box =
        size === 'xs'
            ? 'h-5 w-5 rounded-md text-[10px]'
            : size === 'sm'
              ? 'h-7 w-7 rounded-lg text-xs'
              : 'h-8 w-8 rounded-[10px] text-sm'
    return (
        <span
            className={`grid shrink-0 place-items-center ${box} ${(AREA_TONES[tone] ?? AREA_TONES.navy).tile}`}
            aria-hidden={title ? undefined : true}
            title={title}
        >
            <i className={`fa-solid ${icon}`} />
        </span>
    )
}

export function PillarTile({ pillar, size = 'sm' }: { pillar: LifePillar; size?: 'xs' | 'sm' | 'md' }) {
    return <ToneTile icon={LIFE_PILLAR_ICONS[pillar] ?? 'fa-circle'} tone={PILLAR_TONES[pillar] ?? 'navy'} size={size} />
}

export function ReserveTile({ reserve, size = 'sm' }: { reserve: Reserve; size?: 'xs' | 'sm' | 'md' }) {
    return <ToneTile icon={RESERVE_ICONS[reserve] ?? 'fa-circle'} tone={RESERVE_TONES[reserve] ?? 'navy'} size={size} />
}

/** A tab's own heading: the title, one quiet line under it, and an action on the right. */
export function TabHeading({
    title,
    meta,
    action,
}: {
    title: ReactNode
    meta?: ReactNode
    action?: ReactNode
}) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-xl font-semibold tracking-[-0.015em] text-neutral-900">{title}</h2>
                {meta && <p className="mt-0.5 text-[13px] text-neutral-500">{meta}</p>}
            </div>
            {action}
        </div>
    )
}

/** A small pill for a status: "Now", "Reviewed", "Month 2 of 3". */
export function StatusChip({
    children,
    tone = 'neutral',
}: {
    children: ReactNode
    tone?: 'neutral' | 'coral' | 'green'
}) {
    const cls =
        tone === 'coral'
            ? 'bg-coral-50 text-coral-600'
            : tone === 'green'
              ? 'bg-success-bg text-success'
              : 'bg-neutral-100 text-neutral-600'
    return (
        <span className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${cls}`}>
            {children}
        </span>
    )
}

/** The ⋯ trigger for a card's menu. */
export function MoreButton({ label = 'Options' }: { label?: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
            <i className="fa-solid fa-ellipsis" aria-hidden="true" />
        </button>
    )
}
