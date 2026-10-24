import type { ReactNode } from 'react'
import { EVENT_TYPE_COLORS, EVENT_TYPE_ICONS, type Event, type EventType, type Part } from '../../types'
import { MONTHS, WEEKDAYS_LONG } from '../../lib/calendar'

/**
 * The look shared by the event drawers (editor and detail): an icon per event
 * type, overline section labels, pill choices, a segmented control and a list
 * of switch rows. The same vocabulary the Fitness and Nutrition drawers use.
 */

/** Icon per event type — the tile beside a title and the icon on a type chip. */
export const EVENT_TYPE_ICON = EVENT_TYPE_ICONS

export const PART_META: Record<Exclude<Part, 'na'>, { label: string; icon: string }> = {
    morning: { label: 'Morning', icon: 'fa-solid fa-mug-hot' },
    afternoon: { label: 'Afternoon', icon: 'fa-solid fa-sun' },
    evening: { label: 'Evening', icon: 'fa-solid fa-moon' },
}

/** The event-type icon in its tinted tile. */
export function TypeTile({ type, size = 'md' }: { type: EventType; size?: 'md' | 'lg' }) {
    const c = EVENT_TYPE_COLORS[type]
    const box = size === 'lg' ? 'h-12 w-12 rounded-2xl text-lg' : 'h-9 w-9 rounded-xl text-sm'
    return (
        <span className={`grid shrink-0 place-items-center ${box} ${c.light} ${c.text}`} aria-hidden="true">
            <i className={EVENT_TYPE_ICON[type]} />
        </span>
    )
}

/** Small uppercase section label, with an optional control on the right. */
export function Overline({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
    return (
        <div className="flex min-h-6 items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">{children}</p>
            {aside}
        </div>
    )
}

/** A titled block of the drawer. */
export function Section({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
    return (
        <section className="flex flex-col gap-3">
            <Overline aside={aside}>{title}</Overline>
            {children}
        </section>
    )
}

/** A pill choice. `tone` swaps the selected look for a tinted one (type, calendar). */
export function ChoiceChip({
    on,
    onClick,
    icon,
    dot,
    tone,
    children,
}: {
    on: boolean
    onClick: () => void
    icon?: string
    /** Colour class for a small leading dot (calendars). */
    dot?: string
    /** Selected classes, e.g. "bg-blue-50 text-blue-700". Defaults to ink. */
    tone?: string
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                on
                    ? tone
                        ? `${tone} ring-1 ring-inset ring-neutral-900/10`
                        : 'bg-neutral-900 text-neutral-50'
                    : 'bg-white text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50'
            }`}
        >
            {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}
            {icon && <i className={`${icon} text-[11px]`} aria-hidden="true" />}
            {children}
        </button>
    )
}

/** Segments in a soft track, the selected ones raised — Tabs' look, for choices in a form. */
export function Segmented({ children }: { children: ReactNode }) {
    return <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-neutral-100 p-1">{children}</div>
}

export function Segment({
    on,
    onClick,
    icon,
    children,
}: {
    on: boolean
    onClick: () => void
    icon?: string
    children: ReactNode
}) {
    return (
        <button
            type="button"
            aria-pressed={on}
            onClick={onClick}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[13px] font-medium transition-all duration-150 ${
                on
                    ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                    : 'text-neutral-600 hover:text-neutral-900'
            }`}
        >
            {icon && <i className={`${icon} text-[11px] ${on ? 'text-neutral-700' : 'text-neutral-400'}`} aria-hidden="true" />}
            {children}
        </button>
    )
}

/** A bordered list of setting rows. */
export function SettingList({ children }: { children: ReactNode }) {
    return <div className="divide-y divide-neutral-200 rounded-2xl border border-neutral-200">{children}</div>
}

/** One setting: icon, label and hint, a control on the right, and anything it reveals underneath. */
export function SettingRow({
    icon,
    label,
    hint,
    control,
    children,
}: {
    icon: string
    label: string
    hint?: string
    control: ReactNode
    children?: ReactNode
}) {
    return (
        <div className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-neutral-100 text-xs text-neutral-600" aria-hidden="true">
                    <i className={icon} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900">{label}</p>
                    {hint && <p className="text-xs leading-snug text-neutral-500">{hint}</p>}
                </div>
                {control}
            </div>
            {children}
        </div>
    )
}

// ─── Words ──────────────────────────────────────────────────────────────────────

/** "Today", "Tomorrow", "In 4 days", "3 days ago". */
export function relativeDay(date: string): string {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const [y, m, d] = date.split('-').map(Number)
    const diff = Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86_400_000)
    if (diff === 0) return 'Today'
    if (diff === 1) return 'Tomorrow'
    if (diff === -1) return 'Yesterday'
    return diff > 0 ? `In ${diff} days` : `${-diff} days ago`
}

/** "Sat 24 Oct" — or with the year when `withYear`. */
export function shortDate(date: string, withYear = false): string {
    const [y, m, d] = date.split('-').map(Number)
    const day = WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()].slice(0, 3)
    return `${day} ${d} ${MONTHS[m - 1].slice(0, 3)}${withYear ? ` ${y}` : ''}`
}

export function nightsBetween(start: string, end: string): number {
    const [y1, m1, d1] = start.split('-').map(Number)
    const [y2, m2, d2] = end.split('-').map(Number)
    return Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86_400_000)
}

/** "All day", "Anytime", "Morning", "Morning → Evening". */
export function partsLabel(startPart: Part, endPart: Part): string {
    if (startPart === 'na') return 'Anytime'
    if (startPart === 'morning' && endPart === 'evening') return 'All day'
    if (startPart === endPart || endPart === 'na') return PART_META[startPart].label
    return `${PART_META[startPart].label} → ${PART_META[endPart].label}`
}

/** One line for when an event happens: "Sat 24 Oct · Morning" or "Fri 6 – Sun 8 Nov · 2 nights". */
export function whenLine(event: Pick<Event, 'startDate' | 'endDate' | 'startPart' | 'endPart' | 'time'>): string {
    const multi = event.startDate !== event.endDate
    if (multi) {
        const n = nightsBetween(event.startDate, event.endDate)
        return `${shortDate(event.startDate)} – ${shortDate(event.endDate)} · ${n} ${n === 1 ? 'night' : 'nights'}`
    }
    const parts = partsLabel(event.startPart, event.endPart)
    return [shortDate(event.startDate), parts, event.time].filter(Boolean).join(' · ')
}
