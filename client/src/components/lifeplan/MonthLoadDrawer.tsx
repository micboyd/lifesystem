import Drawer from '../Drawer'
import {
    RESERVES,
    RESERVE_DESCRIPTIONS,
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
import { ReserveTile } from './ui'

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
    const { reserve, demand, capacity, baseCapacity, adjustments, ratio, level, contributions } =
        load
    const over = capacity !== null && demand > capacity
    // The bar is scaled to whichever is larger, so an overspend shows how far
    // past the line it went rather than just pinning at full.
    const scale = Math.max(demand, capacity ?? 0) || 1

    return (
        <section className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2.5 text-[15px] font-semibold text-neutral-900">
                    <ReserveTile reserve={reserve} size="sm" />
                    {RESERVE_LABELS[reserve]}
                </h3>
                <p className="text-[13px] tabular-nums text-neutral-500">
                    <span className={`font-medium ${over ? 'text-coral-600' : 'text-neutral-900'}`}>
                        {formatDemand(reserve, demand)}
                    </span>
                    {capacity !== null && ` of ${formatDemand(reserve, capacity)} `}
                    {capacity === null ? ` ${RESERVE_UNITS[reserve]}` : RESERVE_UNITS[reserve]}
                </p>
            </div>

            {/* The stack: one segment per contributor, in the level's colour. */}
            <div className="relative mt-3 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-200">
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
                <p className="mt-2 text-[13px] font-medium text-coral-600">
                    Over by {formatDemand(reserve, demand - capacity!)} {RESERVE_UNITS[reserve]}
                </p>
            )}

            {/* Something that moved the ceiling rather than spending it. Shown as
                its own line, because "you can carry less this month" is a
                different fact from "this month contains more". */}
            {adjustments.length > 0 && baseCapacity !== null && (
                <div className="mt-3 rounded-xl bg-neutral-50 p-3">
                    <p className="text-xs font-medium text-neutral-700">
                        Ceiling {formatDemand(reserve, baseCapacity)} →{' '}
                        {formatDemand(reserve, capacity!)} {RESERVE_UNITS[reserve]}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                        {adjustments.map((a) => (
                            <li key={a.contributorId} className="text-xs text-neutral-500">
                                <span className="font-medium text-neutral-700">{a.label}</span> —{' '}
                                {a.detail} ({Math.round((1 - a.factor) * 100)}%)
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {capacity === null && demand > 0 && (
                <p className="mt-2 text-[13px] text-neutral-500">
                    No capacity to measure this against yet.
                </p>
            )}

            {contributions.length === 0 ? (
                <p className="mt-3 text-[13px] text-neutral-500">{RESERVE_DESCRIPTIONS[reserve]}</p>
            ) : (
                <ul className="mt-3 divide-y divide-neutral-100">
                    {contributions.map(({ contributor, amount }) => (
                        <li
                            key={contributor.id}
                            className="flex items-baseline justify-between gap-3 py-2 text-[13px]"
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                <span className="min-w-0">
                                    <span className="block truncate text-neutral-900">
                                        {contributor.label}
                                    </span>
                                    {reserve === 'focus' && contributor.focusNote && (
                                        <span className="block truncate text-xs text-neutral-500">
                                            {contributor.focusNote}
                                        </span>
                                    )}
                                </span>
                                {contributor.basis === 'assumed' && (
                                    <span
                                        className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-600"
                                        title="Stood in for — this record carries no figure to read"
                                    >
                                        est
                                    </span>
                                )}
                            </span>
                            <span className="shrink-0 tabular-nums text-neutral-600">
                                {formatDemand(reserve, amount)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            {ratio !== null && (
                <p className={`mt-2 text-xs font-medium ${LEVEL_TEXT[level!]}`}>
                    {Math.round(ratio * 100)}% of capacity
                    {load.capacityBasis === 'default' && (
                        <span className="font-normal text-neutral-500">
                            {' '}
                            · against the default, not yours
                        </span>
                    )}
                    {load.capacityBasis === 'calibrated' && (
                        <span className="font-normal text-neutral-500">
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
                <div>
                    <div className="rounded-2xl bg-neutral-50 p-4">
                        <LoadPill
                            level={load.level}
                            detail={load.peak ? RESERVE_LABELS[load.peak] : undefined}
                        />
                        <p className="mt-2 text-[13px] text-neutral-600">{summarise(load)}</p>
                    </div>

                    {load.conflicts.length > 0 && (
                        <div className="mt-3 space-y-2">
                            {load.conflicts.map((conflict, i) => (
                                <div
                                    key={`${conflict.kind}-${i}`}
                                    className="rounded-2xl bg-coral-50 p-4"
                                >
                                    <h3 className="flex items-center gap-2 text-sm font-semibold text-coral-700">
                                        <i
                                            className="fa-solid fa-circle-exclamation text-xs"
                                            aria-hidden="true"
                                        />
                                        {conflict.title}
                                    </h3>
                                    <p className="mt-1 text-[13px] text-coral-700/80">
                                        {conflict.detail}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="divide-y divide-neutral-100">
                        {RESERVES.map((reserve) => (
                            <ReserveSection key={reserve} load={load.reserves[reserve]} />
                        ))}
                    </div>
                </div>
            )}
        </Drawer>
    )
}
