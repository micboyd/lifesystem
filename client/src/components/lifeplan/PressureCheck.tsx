import { useMemo } from 'react'
import { formatMonthKey, monthKey } from '../../lib/calendar'
import {
    RESERVES,
    RESERVE_DESCRIPTIONS,
    RESERVE_ICONS,
    RESERVE_LABELS,
    RESERVE_UNITS,
    findPressurePoints,
    overloadedReserves,
    peakMonth,
    type LoadInput,
    type MonthLoad,
} from '../../lib/lifeLoad'
import { explain } from '../../lib/lifeCalibration'
import { describeRelief, findRelief, type Relief } from '../../lib/lifeRelief'
import { HISTORY_MONTHS, type LoadCapacities } from './useLoadCapacities'
import { seasonForMonth } from '../../lib/lifeTimeline'
import type { LifePlan } from '../../types'
import LoadPill from './LoadPill'
import ReserveMeter, { ReserveBars, summarise } from './ReserveMeter'
import { LEVEL_TEXT, formatAgainstCapacity, formatDemand } from './loadStyles'
import EmptyState from '../EmptyState'

/**
 * Where the plan is asking more of a month than the month has.
 *
 * Every commitment here fits the calendar on its own — this isn't a clash. What
 * it catches is the pile-up, and the value is entirely in catching it while the
 * months are still a plan rather than a run of missed weeks.
 *
 * Two different things get reported, deliberately apart. A **conflict** is a pair
 * that can't both go well however much room there is; an **overload** is a
 * reserve being asked for more than it holds. Only the second is a matter of
 * degree, and only the second can be fixed by moving something.
 */
export default function PressureCheck({
    plan,
    loads,
    input,
    capacities,
    onSelectMonth,
}: {
    plan: LifePlan
    loads: MonthLoad[]
    /** What the loads were built from — relief works by moving a record and rescoring. */
    input: LoadInput | null
    capacities: LoadCapacities
    onSelectMonth: (month: string) => void
}) {
    const now = new Date()
    const thisMonth = monthKey(now.getFullYear(), now.getMonth())
    const points = findPressurePoints(loads)
    const peak = peakMonth(loads)

    // Each candidate move rescores the whole window, so this is the expensive
    // part of the tab and is kept off the render path.
    const relief = useMemo(() => {
        const out = new Map<string, Relief[]>()
        if (!input) return out
        for (const point of points) out.set(point.month, findRelief(input, loads, point.month, 3))
        return out
        // `points` is derived from `loads`, so the two move together.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [input, loads])

    /** How the plan leans overall — which reserves it runs hot on, and how often. */
    const byReserve = RESERVES.map((reserve) => ({
        reserve,
        over: loads.filter((l) => l.reserves[reserve].level === 'overloaded').length,
        unscored: loads.every((l) => l.reserves[reserve].ratio === null),
    }))

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-bold tracking-tight text-neutral-950">Pressure check</h2>
                <p className="text-sm text-neutral-500">
                    Not a diary clash — every one of these fits on its own. It&apos;s what they cost
                    together, reserve by reserve.
                </p>
            </div>

            {/* The year in four rows: one reserve each, one column a month. */}
            <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-bold text-neutral-900">The window at a glance</h3>
                    <p className="text-xs text-neutral-400">
                        {points.length === 0
                            ? 'Nothing over capacity'
                            : `${points.length} month${points.length === 1 ? '' : 's'} worth a look`}
                    </p>
                </div>
                <div className="mt-4 overflow-x-auto pb-1">
                    <div className="flex min-w-full gap-1">
                        {loads.map((load) => {
                            const isNow = load.month === thisMonth
                            return (
                                <button
                                    key={load.month}
                                    type="button"
                                    onClick={() => onSelectMonth(load.month)}
                                    title={`${formatMonthKey(load.month)} — ${summarise(load)}`}
                                    className={`min-w-[36px] flex-1 rounded-lg px-1 pb-1 pt-1.5 transition-colors hover:bg-neutral-50 ${
                                        isNow ? 'bg-coral-50/60' : ''
                                    }`}
                                >
                                    <ReserveBars load={load} title="" />
                                    <p
                                        className={`mt-1.5 truncate text-[9px] font-bold uppercase ${
                                            isNow ? 'text-coral-600' : 'text-neutral-400'
                                        }`}
                                    >
                                        {formatMonthKey(load.month).slice(0, 3)}
                                    </p>
                                </button>
                            )
                        })}
                    </div>
                </div>
                <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-black/[0.05] pt-3">
                    {byReserve.map(({ reserve, over, unscored }) => (
                        <li
                            key={reserve}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500"
                            title={RESERVE_DESCRIPTIONS[reserve]}
                        >
                            <i
                                className={`fa-solid ${RESERVE_ICONS[reserve]} w-3.5 text-center text-[10px] text-neutral-300`}
                                aria-hidden="true"
                            />
                            {RESERVE_LABELS[reserve]}
                            <span
                                className={
                                    unscored
                                        ? 'text-neutral-300'
                                        : over > 0
                                          ? 'text-coral-600'
                                          : 'text-neutral-300'
                                }
                            >
                                {unscored ? 'unscored' : over > 0 ? `${over} over` : 'clear'}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {points.length === 0 ? (
                <EmptyState
                    icon="fa-circle-check"
                    title="Nothing over capacity"
                    description={
                        peak && peak.peak
                            ? `The most strained month is ${formatMonthKey(peak.month)} — ${summarise(peak).toLowerCase()}.`
                            : 'Nothing is competing for the same months yet.'
                    }
                />
            ) : (
                <div className="space-y-3">
                    {points.map((load) => {
                        const season = seasonForMonth(plan, load.month)
                        const over = overloadedReserves(load)
                        return (
                            <div
                                key={load.month}
                                className="rounded-2xl border border-red-100 bg-red-50/40 p-5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <h3 className="truncate text-base font-bold text-neutral-950">
                                            {formatMonthKey(load.month)}
                                        </h3>
                                        {season && (
                                            <p className="text-xs font-semibold text-neutral-400">
                                                {season.name}
                                            </p>
                                        )}
                                    </div>
                                    <LoadPill
                                        level={load.level}
                                        detail={load.peak ? RESERVE_LABELS[load.peak] : undefined}
                                    />
                                </div>

                                {load.conflicts.length > 0 && (
                                    <ul className="mt-3 space-y-2">
                                        {load.conflicts.map((conflict, i) => (
                                            <li
                                                key={`${conflict.kind}-${i}`}
                                                className="rounded-xl bg-white/70 p-3 ring-1 ring-inset ring-coral-200"
                                            >
                                                <p className="flex items-center gap-2 text-xs font-bold text-coral-700">
                                                    <i
                                                        className="fa-solid fa-circle-exclamation text-[10px]"
                                                        aria-hidden="true"
                                                    />
                                                    {conflict.title}
                                                </p>
                                                <p className="mt-1 text-xs text-coral-700/80">
                                                    {conflict.detail}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                {over.length > 0 && (
                                    <div className="mt-3 space-y-2">
                                        {over.map((reserve) => (
                                            <p key={reserve.reserve} className="text-sm text-neutral-700">
                                                <span className={`font-bold ${LEVEL_TEXT.overloaded}`}>
                                                    {RESERVE_LABELS[reserve.reserve]}
                                                </span>{' '}
                                                <span className="tabular-nums text-neutral-500">
                                                    {formatAgainstCapacity(
                                                        reserve.reserve,
                                                        reserve.demand,
                                                        reserve.capacity
                                                    )}
                                                </span>
                                                {' — '}
                                                {reserve.contributions
                                                    .map((c) => c.contributor.label)
                                                    .join(', ')}
                                            </p>
                                        ))}
                                    </div>
                                )}

                                <div className="mt-4 rounded-xl bg-white/70 p-3">
                                    <ReserveMeter load={load} />
                                </div>

                                {(relief.get(load.month)?.length ?? 0) > 0 && (
                                    <div className="mt-4">
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                            What would fix it
                                        </p>
                                        <ul className="mt-2 space-y-1.5">
                                            {relief.get(load.month)!.map((r) => (
                                                <li
                                                    key={`${r.contributorId}-${r.shift}`}
                                                    className="flex flex-wrap items-baseline gap-x-2 text-xs"
                                                >
                                                    <span className="font-semibold text-neutral-800">
                                                        {describeRelief(r)}
                                                    </span>
                                                    <span className="tabular-nums text-neutral-500">
                                                        {RESERVE_LABELS[r.reserve]}{' '}
                                                        {Math.round(r.before * 100)}% →{' '}
                                                        <span
                                                            className={
                                                                r.after < 1
                                                                    ? 'font-bold text-herb'
                                                                    : 'text-neutral-500'
                                                            }
                                                        >
                                                            {Math.round(r.after * 100)}%
                                                        </span>
                                                    </span>
                                                    {!r.clean && (
                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                                                            moves the problem
                                                        </span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                        <p className="mt-2 text-[11px] text-neutral-400">
                                            Nothing is moved for you — these open in the module that
                                            owns them.
                                        </p>
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={() => onSelectMonth(load.month)}
                                    className="mt-3 text-xs font-bold text-coral-600 hover:text-coral-700"
                                >
                                    Break {formatMonthKey(load.month)} down →
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Where each denominator came from. The model is only worth as much
                as its capacities, so it says which of them are actually yours. */}
            <section className="rounded-2xl border border-black/[0.06] bg-white p-5">
                <h3 className="text-sm font-bold text-neutral-900">How this is measured</h3>
                <p className="mt-1 text-xs text-neutral-500">
                    A reserve is only over capacity against some number. These are the numbers.
                </p>

                <ul className="mt-4 space-y-3">
                    {RESERVES.map((reserve) => {
                        const sample = loads[0]?.reserves[reserve]
                        const fitted = capacities.calibration[reserve]
                        return (
                            <li key={reserve} className="flex gap-3">
                                <i
                                    className={`fa-solid ${RESERVE_ICONS[reserve]} mt-0.5 w-4 shrink-0 text-center text-xs text-neutral-300`}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-neutral-800">
                                        {RESERVE_LABELS[reserve]}
                                        {sample && sample.capacity !== null ? (
                                            <span className="ml-1.5 font-semibold tabular-nums text-neutral-500">
                                                {formatDemand(reserve, sample.capacity)}{' '}
                                                {RESERVE_UNITS[reserve]}
                                            </span>
                                        ) : (
                                            <span className="ml-1.5 font-semibold text-neutral-400">
                                                not set
                                            </span>
                                        )}
                                    </p>
                                    <p className="mt-0.5 text-[11px] text-neutral-500">
                                        {fitted
                                            ? explain(fitted)
                                            : sample?.capacityBasis === 'measured'
                                              ? 'Read from your finance rows: income less ordinary outgoings, savings excluded.'
                                              : sample?.capacity === null
                                                ? 'Nothing to measure against — free cash comes from the finance rows, and none were found.'
                                                : `A shipped default, not yours. ${RESERVE_DESCRIPTIONS[reserve]}`}
                                    </p>
                                </div>
                            </li>
                        )
                    })}
                </ul>

                <p className="mt-4 border-t border-black/[0.05] pt-3 text-[11px] text-neutral-400">
                    {capacities.calibrated
                        ? Object.keys(capacities.calibration).length > 0
                            ? `Ceilings above marked with a comparison were fitted from ${capacities.historyMonths} months of your own logs.`
                            : `${capacities.historyMonths} of the last ${HISTORY_MONTHS} months carry enough logs to fit against, and none of them show a clear break yet. The defaults stand until they do.`
                        : 'Reading your history…'}
                </p>
            </section>
        </div>
    )
}
