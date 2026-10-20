import { useMemo } from 'react'
import { MONTHS, formatMonthKey, monthKey } from '../../lib/calendar'
import {
    RESERVES,
    RESERVE_DESCRIPTIONS,
    RESERVE_LABELS,
    RESERVE_UNITS,
    findPressurePoints,
    overloadedReserves,
    peakMonth,
    type LoadInput,
    type LoadLevel,
    type MonthLoad,
} from '../../lib/lifeLoad'
import { explain } from '../../lib/lifeCalibration'
import { describeRelief, findRelief, type Relief } from '../../lib/lifeRelief'
import { HISTORY_MONTHS, type LoadCapacities } from './useLoadCapacities'
import { seasonForMonth } from '../../lib/lifeTimeline'
import type { LifePlan } from '../../types'
import LoadPill from './LoadPill'
import ReserveMeter, { summarise } from './ReserveMeter'
import { LEVEL_TEXT, formatAgainstCapacity, formatDemand } from './loadStyles'
import EmptyState from '../EmptyState'
import StatTile from '../StatTile'
import { OVERLINE, PANEL, ReserveTile, TabHeading } from './ui'

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
/** Heatmap cell fill per level — quiet months fade back, overloaded ones shout. */
const CELL: Record<LoadLevel, string> = {
    quiet: 'bg-neutral-100',
    steady: 'bg-herb/35',
    busy: 'bg-marigold/70',
    overloaded: 'bg-coral-500',
}

function shortMonth(month: string): string {
    return MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3)
}

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

    const hottest = [...byReserve].filter((r) => !r.unscored).sort((a, b) => b.over - a.over)[0]

    return (
        <div className="space-y-6">
            <TabHeading
                title="Pressure check"
                meta="Not a diary clash — every one of these fits on its own. It's what they cost together, reserve by reserve."
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatTile
                    label="Months over capacity"
                    value={`${points.length} / ${loads.length}`}
                    sub={points.length === 0 ? 'All clear' : 'Worth a look'}
                    tone={points.length === 0 ? 'good' : 'bad'}
                />
                <StatTile
                    label="Most strained month"
                    value={peak?.peak ? formatMonthKey(peak.month) : '—'}
                    sub={peak?.peak ? `${RESERVE_LABELS[peak.peak]} leads` : 'Nothing planned'}
                />
                <StatTile
                    label="Hottest reserve"
                    value={hottest && hottest.over > 0 ? RESERVE_LABELS[hottest.reserve] : 'None'}
                    sub={
                        hottest && hottest.over > 0
                            ? `Over in ${hottest.over} month${hottest.over === 1 ? '' : 's'}`
                            : 'Inside every ceiling'
                    }
                    tone={hottest && hottest.over > 0 ? 'warn' : 'good'}
                />
            </div>

            {/* The window as a heatmap: one row a reserve, one column a month. */}
            <section className={`${PANEL} p-5 sm:p-6`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base font-semibold tracking-[-0.01em] text-neutral-900">
                        The window at a glance
                    </h3>
                    <p className="text-[13px] text-neutral-500">Tap a month for its breakdown</p>
                </div>
                <div className="mt-5 overflow-x-auto pb-1">
                    <div
                        className="grid min-w-max items-center gap-1"
                        style={{ gridTemplateColumns: `112px repeat(${loads.length}, minmax(36px, 1fr))` }}
                    >
                        <span />
                        {loads.map((load) => {
                            const isNow = load.month === thisMonth
                            return (
                                <span
                                    key={`h-${load.month}`}
                                    className={`pb-1 text-center text-[11px] font-medium ${
                                        isNow ? 'text-coral-600' : 'text-neutral-500'
                                    }`}
                                >
                                    {shortMonth(load.month)}
                                </span>
                            )
                        })}
                        {byReserve.map(({ reserve, over, unscored }) => (
                            <div key={reserve} className="contents">
                                <div
                                    className="flex min-w-0 items-center gap-2 pr-2"
                                    title={RESERVE_DESCRIPTIONS[reserve]}
                                >
                                    <ReserveTile reserve={reserve} size="xs" />
                                    <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-700">
                                        {RESERVE_LABELS[reserve]}
                                    </span>
                                    <span
                                        className={`text-[11px] tabular-nums ${
                                            over > 0 ? 'font-medium text-coral-600' : 'text-neutral-400'
                                        }`}
                                    >
                                        {unscored ? '—' : over > 0 ? over : ''}
                                    </span>
                                </div>
                                {loads.map((load) => {
                                    const r = load.reserves[reserve]
                                    const isNow = load.month === thisMonth
                                    return (
                                        <button
                                            key={`${reserve}-${load.month}`}
                                            type="button"
                                            onClick={() => onSelectMonth(load.month)}
                                            title={`${formatMonthKey(load.month)} · ${RESERVE_LABELS[reserve]} — ${formatAgainstCapacity(reserve, r.demand, r.capacity)}${
                                                r.ratio !== null ? ` (${Math.round(r.ratio * 100)}%)` : ''
                                            }`}
                                            className={`h-8 rounded-md transition-transform hover:scale-[1.08] ${
                                                r.level ? CELL[r.level] : 'bg-neutral-50 ring-1 ring-inset ring-neutral-200'
                                            } ${isNow ? 'outline outline-2 outline-offset-1 outline-coral-300' : ''}`}
                                        />
                                    )
                                })}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-100 pt-4 text-[12px] text-neutral-500">
                    {(['quiet', 'steady', 'busy', 'overloaded'] as LoadLevel[]).map((level) => (
                        <span key={level} className="inline-flex items-center gap-1.5">
                            <span className={`h-3 w-3 rounded-[4px] ${CELL[level]}`} aria-hidden="true" />
                            {level[0].toUpperCase() + level.slice(1)}
                        </span>
                    ))}
                    <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-[4px] bg-neutral-50 ring-1 ring-inset ring-neutral-200" aria-hidden="true" />
                        Not scored
                    </span>
                </div>
            </section>

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
                <div className="space-y-4">
                    <p className={OVERLINE}>Pressure points</p>
                    {points.map((load) => {
                        const season = seasonForMonth(plan, load.month)
                        const over = overloadedReserves(load)
                        const fixes = relief.get(load.month) ?? []
                        return (
                            <article key={load.month} className={`${PANEL} overflow-hidden`}>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 sm:px-6">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-coral-50 text-sm font-semibold text-coral-600">
                                            {shortMonth(load.month)}
                                        </span>
                                        <div className="min-w-0">
                                            <h3 className="truncate text-base font-semibold text-neutral-950">
                                                {formatMonthKey(load.month)}
                                            </h3>
                                            <p className="truncate text-[13px] text-neutral-500">
                                                {season ? season.name : 'No season'}
                                            </p>
                                        </div>
                                    </div>
                                    <LoadPill
                                        level={load.level}
                                        detail={load.peak ? RESERVE_LABELS[load.peak] : undefined}
                                    />
                                </div>

                                <div className="space-y-5 px-5 py-5 sm:px-6">
                                    {load.conflicts.length > 0 && (
                                        <ul className="space-y-2">
                                            {load.conflicts.map((conflict, i) => (
                                                <li
                                                    key={`${conflict.kind}-${i}`}
                                                    className="flex gap-3 rounded-xl bg-coral-50 p-3.5"
                                                >
                                                    <i
                                                        className="fa-solid fa-circle-exclamation mt-0.5 text-sm text-coral-600"
                                                        aria-hidden="true"
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="text-[13px] font-semibold text-coral-700">
                                                            {conflict.title}
                                                        </p>
                                                        <p className="mt-0.5 text-[13px] text-coral-700/80">
                                                            {conflict.detail}
                                                        </p>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {over.length > 0 && (
                                        <ul className="divide-y divide-neutral-100 border-y border-neutral-100">
                                            {over.map((reserve) => (
                                                <li key={reserve.reserve} className="flex items-start gap-3 py-3">
                                                    <ReserveTile reserve={reserve.reserve} size="sm" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                                                            <span className={`text-[15px] font-medium ${LEVEL_TEXT.overloaded}`}>
                                                                {RESERVE_LABELS[reserve.reserve]}
                                                            </span>
                                                            <span className="text-[13px] tabular-nums text-neutral-500">
                                                                {formatAgainstCapacity(
                                                                    reserve.reserve,
                                                                    reserve.demand,
                                                                    reserve.capacity
                                                                )}
                                                            </span>
                                                        </p>
                                                        <p className="mt-0.5 text-[13px] text-neutral-600">
                                                            {reserve.contributions
                                                                .map((c) => c.contributor.label)
                                                                .join(', ')}
                                                        </p>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    <ReserveMeter load={load} />

                                    {fixes.length > 0 && (
                                        <div>
                                            <p className={OVERLINE}>What would fix it</p>
                                            <ul className="mt-2 space-y-2">
                                                {fixes.map((r) => (
                                                    <li
                                                        key={`${r.contributorId}-${r.shift}`}
                                                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl bg-neutral-50 px-3.5 py-2.5"
                                                    >
                                                        <span className="min-w-0 text-[13px] font-medium text-neutral-800">
                                                            {describeRelief(r)}
                                                        </span>
                                                        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                                                            <span className="text-neutral-500">
                                                                {RESERVE_LABELS[r.reserve]}
                                                            </span>
                                                            <span className="text-neutral-500">
                                                                {Math.round(r.before * 100)}%
                                                            </span>
                                                            <i
                                                                className="fa-solid fa-arrow-right text-[10px] text-neutral-400"
                                                                aria-hidden="true"
                                                            />
                                                            <span
                                                                className={`rounded-full px-2 py-0.5 font-medium ${
                                                                    r.after < 1
                                                                        ? 'bg-success-bg text-success'
                                                                        : 'bg-neutral-200 text-neutral-600'
                                                                }`}
                                                            >
                                                                {Math.round(r.after * 100)}%
                                                            </span>
                                                            {!r.clean && (
                                                                <span className="rounded-full bg-warning-bg px-2 py-0.5 font-medium text-amber-700">
                                                                    moves the problem
                                                                </span>
                                                            )}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="mt-2 text-xs text-neutral-500">
                                                Nothing is moved for you — these open in the module that owns them.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => onSelectMonth(load.month)}
                                    className="group flex w-full items-center justify-between border-t border-neutral-100 px-5 py-3.5 text-left text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 hover:text-neutral-950 sm:px-6"
                                >
                                    Break {formatMonthKey(load.month)} down
                                    <i
                                        className="fa-solid fa-arrow-right text-xs transition-transform group-hover:translate-x-0.5"
                                        aria-hidden="true"
                                    />
                                </button>
                            </article>
                        )
                    })}
                </div>
            )}

            {/* Where each denominator came from. The model is only worth as much
                as its capacities, so it says which of them are actually yours. */}
            <details className={`group ${PANEL}`}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6 [&::-webkit-details-marker]:hidden">
                    <div>
                        <h3 className="text-base font-semibold tracking-[-0.01em] text-neutral-900">
                            How this is measured
                        </h3>
                        <p className="text-[13px] text-neutral-500">
                            A reserve is only over capacity against some number. These are the numbers.
                        </p>
                    </div>
                    <i
                        className="fa-solid fa-chevron-down text-xs text-neutral-400 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                    />
                </summary>

                <div className="border-t border-neutral-100 px-5 pb-5 sm:px-6">
                    <ul className="divide-y divide-neutral-100">
                        {RESERVES.map((reserve) => {
                            const sample = loads[0]?.reserves[reserve]
                            const fitted = capacities.calibration[reserve]
                            return (
                                <li key={reserve} className="flex gap-3 py-3.5">
                                    <ReserveTile reserve={reserve} size="sm" />
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-medium text-neutral-900">
                                            {RESERVE_LABELS[reserve]}
                                            {sample && sample.capacity !== null ? (
                                                <span className="ml-2 text-[13px] font-normal tabular-nums text-neutral-500">
                                                    {formatDemand(reserve, sample.capacity)} {RESERVE_UNITS[reserve]}
                                                </span>
                                            ) : (
                                                <span className="ml-2 text-[13px] font-normal text-neutral-500">
                                                    not set
                                                </span>
                                            )}
                                        </p>
                                        <p className="mt-0.5 text-[13px] text-neutral-500">
                                            {fitted
                                                ? explain(fitted)
                                                : sample?.capacityBasis === 'measured'
                                                  ? reserve === 'body'
                                                      ? `The busiest week you've repeatedly managed, plus a session of headroom — read from your own logs${capacities.volumeCeiling ? ` (${capacities.volumeCeiling} hard sessions)` : ''}. A cut lowers it for the months it runs.`
                                                      : 'Read from your finance rows: income less ordinary outgoings, savings excluded.'
                                                  : sample?.capacity === null
                                                    ? 'Nothing to measure against — free cash comes from the finance rows, and none were found.'
                                                    : `A shipped default, not yours. ${RESERVE_DESCRIPTIONS[reserve]}`}
                                        </p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>

                    <p className="border-t border-neutral-100 pt-3.5 text-xs text-neutral-500">
                        {capacities.calibrated
                            ? Object.keys(capacities.calibration).length > 0
                                ? `Ceilings above marked with a comparison were fitted from ${capacities.historyMonths} months of your own logs.`
                                : `${capacities.historyMonths} of the last ${HISTORY_MONTHS} months carry enough logs to fit against, and none of them show a clear break yet. The defaults stand until they do.`
                            : 'Reading your history…'}
                    </p>
                </div>
            </details>
        </div>
    )
}
