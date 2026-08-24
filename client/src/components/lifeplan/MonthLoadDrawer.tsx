import Drawer from '../Drawer'
import {
    RESERVES,
    RESERVE_DESCRIPTIONS,
    RESERVE_ICONS,
    RESERVE_LABELS,
    RESERVE_UNITS,
    type MonthLoad,
    type ReserveLoad,
} from '../../lib/lifeLoad'
import { formatMonthKey } from '../../lib/calendar'
import { seasonForMonth } from '../../lib/lifeTimeline'
import type { LifePlan } from '../../types'
import { LEVEL_BAR, LEVEL_TEXT, formatDemand } from './loadStyles'
import LoadPill from './LoadPill'
import { summarise } from './ReserveMeter'

/**
 * One month, read as a budget statement.
 *
 * Every reserve gets the same three facts in the same order: what it costs, what
 * there is, and what it is being spent on. That last part is what a score could
 * never give — "October is a 7" tells you to worry, "£780 committed of £620 free,
 * and here are the four things doing it" tells you what to move.
 */

/** A reserve's demand broken into its contributors, drawn as one stacked bar. */
function ReserveSection({ load }: { load: ReserveLoad }) {
    const { reserve, demand, capacity, ratio, level, contributions } = load
    const over = capacity !== null && demand > capacity
    // The bar is scaled to whichever is larger, so an overspend shows how far
    // past the line it went rather than just pinning at full.
    const scale = Math.max(demand, capacity ?? 0) || 1

    return (
        <section className="rounded-2xl border border-black/[0.06] bg-white p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                    <i
                        className={`fa-solid ${RESERVE_ICONS[reserve]} w-4 text-center text-xs text-neutral-300`}
                        aria-hidden="true"
                    />
                    {RESERVE_LABELS[reserve]}
                </h3>
                <p className="text-xs font-semibold tabular-nums text-neutral-500">
                    <span className={over ? 'text-coral-600' : 'text-neutral-900'}>
                        {formatDemand(reserve, demand)}
                    </span>
                    {capacity !== null && ` of ${formatDemand(reserve, capacity)} `}
                    {capacity === null ? ` ${RESERVE_UNITS[reserve]}` : RESERVE_UNITS[reserve]}
                </p>
            </div>

            {/* The stack: one segment per contributor, in the level's colour. */}
            <div className="relative mt-3 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100">
                {contributions.map((c) => (
                    <div
                        key={c.contributor.id}
                        className={level ? LEVEL_BAR[level] : 'bg-neutral-300'}
                        style={{ width: `${(c.amount / scale) * 100}%` }}
                        title={`${c.contributor.label} — ${formatDemand(reserve, c.amount)}`}
                    />
                ))}
                {capacity !== null && demand > capacity && (
                    <span
                        aria-hidden="true"
                        className="absolute inset-y-0 w-0.5 bg-neutral-900/70"
                        style={{ left: `${(capacity / scale) * 100}%` }}
                    />
                )}
            </div>

            {over && (
                <p className="mt-2 text-xs font-bold text-coral-600">
                    Over by {formatDemand(reserve, demand - capacity!)} {RESERVE_UNITS[reserve]}
                </p>
            )}
            {capacity === null && demand > 0 && (
                <p className="mt-2 text-xs text-neutral-400">
                    No capacity to measure this against yet.
                </p>
            )}

            {contributions.length === 0 ? (
                <p className="mt-3 text-xs text-neutral-400">{RESERVE_DESCRIPTIONS[reserve]}</p>
            ) : (
                <ul className="mt-3 space-y-1.5">
                    {contributions.map(({ contributor, amount }) => (
                        <li
                            key={contributor.id}
                            className="flex items-baseline justify-between gap-3 text-xs"
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-semibold text-neutral-700">
                                    {contributor.label}
                                </span>
                                {contributor.basis === 'assumed' && (
                                    <span
                                        className="shrink-0 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide text-neutral-400 ring-1 ring-inset ring-neutral-200"
                                        title="Stood in for — this record carries no figure to read"
                                    >
                                        est
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-neutral-500">
                                {formatDemand(reserve, amount)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {ratio !== null && (
                <p className={`mt-3 text-[11px] font-semibold ${LEVEL_TEXT[level!]}`}>
                    {Math.round(ratio * 100)}% of capacity
                    {load.capacityBasis === 'default' && (
                        <span className="font-normal text-neutral-400">
                            {' '}
                            · against the default, not yours
                        </span>
                    )}
                    {load.capacityBasis === 'calibrated' && (
                        <span className="font-normal text-neutral-400">
                            {' '}
                            · fitted from your own history
                        </span>
                    )}
                </p>
            )}
        </section>
    )
}

export default function MonthLoadDrawer({
    plan,
    load,
    onClose,
}: {
    plan: LifePlan
    load: MonthLoad | null
    onClose: () => void
}) {
    const season = load ? seasonForMonth(plan, load.month) : undefined

    return (
        <Drawer
            open={load !== null}
            onClose={onClose}
            title={load ? formatMonthKey(load.month) : ''}
            badge={season?.name}
            size="md"
        >
            {load && (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <LoadPill level={load.level} />
                        <p className="text-xs text-neutral-500">{summarise(load)}</p>
                    </div>

                    {load.conflicts.length > 0 && (
                        <div className="space-y-2">
                            {load.conflicts.map((conflict, i) => (
                                <div
                                    key={`${conflict.kind}-${i}`}
                                    className="rounded-2xl border border-coral-200 bg-coral-50 p-4"
                                >
                                    <h3 className="flex items-center gap-2 text-sm font-bold text-coral-700">
                                        <i
                                            className="fa-solid fa-circle-exclamation text-xs"
                                            aria-hidden="true"
                                        />
                                        {conflict.title}
                                    </h3>
                                    <p className="mt-1 text-xs text-coral-700/80">
                                        {conflict.detail}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    {RESERVES.map((reserve) => (
                        <ReserveSection key={reserve} load={load.reserves[reserve]} />
                    ))}
                </div>
            )}
        </Drawer>
    )
}
