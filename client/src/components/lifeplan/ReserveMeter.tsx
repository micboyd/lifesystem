import {
    RESERVES,
    RESERVE_ICONS,
    RESERVE_LABELS,
    type MonthLoad,
    type Reserve,
    type ReserveLoad,
} from '../../lib/lifeLoad'
import { LEVEL_BAR, UNKNOWN_BAR, formatAgainstCapacity, formatDemand } from './loadStyles'

/**
 * A month's load as four gauges rather than one number.
 *
 * The single score this replaced could say a month was heavy but never which
 * reserve was hot, which is the only part that tells you what to do about it —
 * a month over on money and a month over on recovery need opposite responses.
 * Four bars against four capacities say both at once.
 *
 * The track is the capacity, so a full bar means "all of it" and nothing needs
 * reading off an axis. Past full, the bar keeps its width and grows a nub out of
 * the right-hand end: the overflow is the point, and letting the bar itself
 * stretch would rescale every other bar beside it.
 */

/** One reserve's bar. `ratio` is null when there's no capacity to measure against. */
function Bar({ load, height = 'h-1.5' }: { load: ReserveLoad; height?: string }) {
    const known = load.ratio !== null && load.level !== null
    const fill = known ? Math.min(load.ratio!, 1) * 100 : 0
    const over = known && load.ratio! > 1

    return (
        <div className={`relative flex-1 rounded-full bg-neutral-100 ${height}`}>
            {known ? (
                <div
                    className={`h-full rounded-full ${LEVEL_BAR[load.level!]}`}
                    style={{ width: `${fill}%` }}
                />
            ) : (
                <div className={`h-full w-full rounded-full ${UNKNOWN_BAR} opacity-40`} />
            )}
            {over && (
                <span
                    aria-hidden="true"
                    className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 rounded-[1px] bg-coral-500"
                />
            )}
        </div>
    )
}

/**
 * The compact form: four stacked bars, no words.
 *
 * Sized to sit inside a timeline column, where there's room for the shape of a
 * month and nothing else. Every column stacks its reserves in the same order, so
 * a row of them reads across as one reserve's year.
 */
export function ReserveBars({ load, title }: { load: MonthLoad; title?: string }) {
    return (
        <div className="flex w-full flex-col gap-[3px]" title={title ?? summarise(load)}>
            {RESERVES.map((reserve) => (
                <Bar key={reserve} load={load.reserves[reserve]} height="h-1" />
            ))}
        </div>
    )
}

/** "Body over · Time busy" — the one-line read of a month, worst first. */
export function summarise(load: MonthLoad): string {
    const parts = RESERVES.map((r) => load.reserves[r])
        .filter((r) => r.level === 'overloaded' || r.level === 'busy')
        .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
        .map(
            (r) =>
                `${RESERVE_LABELS[r.reserve]} ${r.level === 'overloaded' ? 'over' : 'busy'} (${formatAgainstCapacity(r.reserve, r.demand, r.capacity)})`
        )
    if (parts.length > 0) return parts.join(' · ')
    const anything = RESERVES.some((r) => load.reserves[r].demand > 0)
    return anything ? 'Comfortably inside every reserve' : 'Nothing planned'
}

/**
 * The full form: four labelled gauges with the numbers alongside.
 *
 * `onSelect` turns each gauge into a way into the month's detail; without it the
 * meter is read-only.
 */
export default function ReserveMeter({
    load,
    onSelect,
    compact = false,
}: {
    load: MonthLoad
    onSelect?: (reserve: Reserve) => void
    compact?: boolean
}) {
    return (
        <div className={compact ? 'flex flex-wrap gap-x-4 gap-y-2' : 'space-y-2.5'}>
            {RESERVES.map((reserve) => {
                const r = load.reserves[reserve]
                const body = (
                    <>
                        <i
                            className={`fa-solid ${RESERVE_ICONS[reserve]} w-3.5 shrink-0 text-center text-[10px] text-neutral-300`}
                            aria-hidden="true"
                        />
                        {!compact && (
                            <span className="w-12 shrink-0 text-[11px] font-bold text-neutral-500">
                                {RESERVE_LABELS[reserve]}
                            </span>
                        )}
                        <Bar load={r} />
                        <span
                            className={`shrink-0 text-right text-[11px] font-semibold tabular-nums ${
                                r.level === 'overloaded' ? 'text-coral-600' : 'text-neutral-400'
                            }`}
                        >
                            {r.capacity === null
                                ? r.demand > 0
                                    ? formatDemand(reserve, r.demand)
                                    : '—'
                                : `${Math.round((r.ratio ?? 0) * 100)}%`}
                        </span>
                    </>
                )

                const className = `flex items-center gap-2 ${compact ? 'min-w-[104px] flex-1' : 'w-full'}`
                const title = `${RESERVE_LABELS[reserve]} — ${formatAgainstCapacity(reserve, r.demand, r.capacity)}${
                    r.capacity === null ? ' (no capacity set)' : ''
                }`

                return onSelect ? (
                    <button
                        key={reserve}
                        type="button"
                        onClick={() => onSelect(reserve)}
                        title={title}
                        className={`${className} rounded-lg text-left transition-opacity hover:opacity-70`}
                    >
                        {body}
                    </button>
                ) : (
                    <div key={reserve} className={className} title={title}>
                        {body}
                    </div>
                )
            })}
        </div>
    )
}
