import type { ReactNode } from 'react'
import { SESSION_PHASE_LABELS, type SessionPhase } from '../types'

/**
 * How each phase of a session looks, everywhere it's shown: a colour and an
 * icon of its own, so warm-up, main session and cool-down read apart at a
 * glance — on the gym floor as much as in the builder.
 */
const PHASE_META: Record<SessionPhase, { icon: string; tile: string; chip: string }> = {
    warmUp: {
        icon: 'fa-solid fa-fire-flame-curved',
        tile: 'bg-amber-100 text-amber-700',
        chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    },
    main: {
        icon: 'fa-solid fa-bolt',
        tile: 'bg-coral-100 text-coral-700',
        chip: 'bg-coral-50 text-coral-700 ring-coral-600/20',
    },
    coolDown: {
        icon: 'fa-solid fa-snowflake',
        tile: 'bg-sky-100 text-sky-700',
        chip: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    },
}

/** The minutes a phase spans, from its items' slots — "0–8 min" — or undefined. */
export function phaseSpan(items: { startMin?: number; endMin?: number }[]): string | undefined {
    const starts = items.map((i) => i.startMin).filter((n): n is number => n !== undefined)
    const ends = items.map((i) => i.endMin).filter((n): n is number => n !== undefined)
    if (!starts.length || !ends.length) return undefined
    const fmt = (n: number) => String(Math.round(n * 10) / 10)
    return `${fmt(Math.min(...starts))}–${fmt(Math.max(...ends))} min`
}

/**
 * The heading over a phase's items: its icon tile, its name, an optional note
 * (a time span, a count) and a rule running out to anything on the right, such
 * as an Add button.
 */
export default function PhaseHeading({
    phase,
    meta,
    right,
    className = '',
}: {
    phase: SessionPhase
    /** A quiet note after the name, e.g. "0–8 min" or "3 exercises". */
    meta?: ReactNode
    /** Controls at the far end, e.g. an Add button. */
    right?: ReactNode
    className?: string
}) {
    const m = PHASE_META[phase]
    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${m.tile}`}
                aria-hidden="true"
            >
                <i className={`${m.icon} text-sm`} />
            </span>
            <h3 className="shrink-0 text-base font-bold tracking-tight text-neutral-900">
                {SESSION_PHASE_LABELS[phase]}
            </h3>
            {meta && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-neutral-500">
                    {meta}
                </span>
            )}
            <span className="h-px min-w-4 flex-1 bg-neutral-200" aria-hidden="true" />
            {right}
        </div>
    )
}

/** A phase as a small inline chip — for a line in a list that mixes phases. */
export function PhaseChip({ phase }: { phase: SessionPhase }) {
    const m = PHASE_META[phase]
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${m.chip}`}
        >
            <i className={`${m.icon} text-[9px]`} aria-hidden="true" />
            {SESSION_PHASE_LABELS[phase]}
        </span>
    )
}
