import { Fragment } from 'react'
import { CALENDAR_COLOR_CLASSES, LIFE_PILLAR_ICONS } from '../../types'
import type { LifePillar } from '../../types'
import { MONTHS, monthKey } from '../../lib/calendar'
import {
    packLaneRows,
    placeOnGrid,
    TIMELINE_LANE_LABELS,
    type LaneItem,
    type Timeline,
} from '../../lib/lifeTimeline'
import {
    RESERVES,
    RESERVE_ICONS,
    RESERVE_LABELS,
    type MonthLoad,
    type Reserve,
} from '../../lib/lifeLoad'
import { LEVEL_BAR, formatDemand } from './loadStyles'
import { summarise } from './ReserveMeter'
import EmptyState from '../EmptyState'

/**
 * The month grid: pillars as lanes, commitments as bars, deadlines as diamonds,
 * seasons as a tinted band across the top.
 *
 * Reading a column tells you what one month is carrying; reading a row tells you
 * how one pillar runs across the year. Neither is visible anywhere else in the
 * app, which is the whole reason the screen exists.
 */

/** Column width at which twelve months still stay readable. */
const MONTH_WIDTH = 88
const LABEL_WIDTH = 148
/** Height of a single packed row, so lanes read as bands rather than hairlines. */
const ROW_HEIGHT = 64
/** Height of one reserve's strip in the ribbon below the lanes. */
const RIBBON_HEIGHT = 30

/**
 * Where a reserve's capacity sits inside its strip, as a fraction of the height.
 *
 * Not at the top: leaving a third of the strip above the line is what lets an
 * overspend be drawn *as* an overspend rather than a bar that has run out of
 * room. Anything past `RIBBON_CEILING` of capacity is clamped, since by then the
 * exact height has stopped telling you anything the colour hasn't.
 */
const CAPACITY_LINE = 0.62
const RIBBON_CEILING = 1.6

/** "Jan" for a YYYY-MM key. */
function shortMonth(month: string): string {
    return MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3)
}

function isJanuary(month: string): boolean {
    return month.endsWith('-01')
}

/** The current month, so today's column can be marked. */
function currentMonthKey(): string {
    const now = new Date()
    return monthKey(now.getFullYear(), now.getMonth())
}

/**
 * A bar or diamond, positioned across the month columns it covers.
 *
 * The grid gives it whole columns; the inset percentages then pull each end in to
 * the quarter of the month the record actually starts and finishes on, so a phase
 * ending on the 15th visibly stops halfway through its last column.
 */
function LaneBar({
    item,
    months,
    row,
    onSelect,
}: {
    item: LaneItem
    months: string[]
    row: number
    onSelect: (item: LaneItem) => void
}) {
    const placement = placeOnGrid(item, months)
    if (!placement) return null
    const { startIndex, span, left, right } = placement
    const colors = CALENDAR_COLOR_CLASSES[item.color]
    const style = { gridColumn: `${startIndex + 2} / span ${span}`, gridRow: row }

    if (item.shape === 'marker') {
        return (
            <div style={style} className="relative">
                <button
                    type="button"
                    onClick={() => onSelect(item)}
                    title={item.label}
                    // Anchored on the diamond, which is the part that carries the
                    // date; the label reads off to its right.
                    style={{ left: `${left}%` }}
                    className="group absolute top-1/2 flex max-w-[160px] -translate-y-1/2 -translate-x-[7px] items-center gap-1.5"
                >
                    <span
                        className={`h-3 w-3 shrink-0 rotate-45 rounded-[2px] ${colors.dot}`}
                        aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-xs font-semibold text-neutral-600 group-hover:text-neutral-900">
                        {item.label}
                    </span>
                </button>
            </div>
        )
    }

    return (
        <div style={style} className="relative">
            <button
                type="button"
                onClick={() => onSelect(item)}
                title={item.detail ? `${item.label} — ${item.detail}` : item.label}
                style={{ left: `calc(${left}% + 2px)`, right: `calc(${right}% + 2px)` }}
                className={[
                    'absolute inset-y-1.5 flex items-center gap-1.5 truncate px-2.5 text-left text-xs font-semibold transition-colors',
                    colors.bg,
                    colors.hover,
                    colors.text,
                    // An open end signals the commitment carries on past the window
                    // rather than stopping neatly at its edge.
                    item.clippedStart ? 'rounded-l-none' : 'rounded-l-full',
                    item.clippedEnd ? 'rounded-r-none' : 'rounded-r-full',
                ].join(' ')}
            >
                {item.clippedStart && <i className="fa-solid fa-caret-left text-[10px] opacity-60" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.clippedEnd && <i className="fa-solid fa-caret-right text-[10px] opacity-60" aria-hidden="true" />}
            </button>
        </div>
    )
}

/**
 * One reserve in one month, as a column rising towards its capacity line.
 *
 * The lanes above say what is happening; this says what it costs. Reading a
 * ribbon row across is one reserve's whole year — where the pressure builds,
 * where it peaks, and when it clears — which no single month's number can show
 * and which is the question a plan is actually made of.
 */
function RibbonCell({ load, reserve }: { load: MonthLoad; reserve: Reserve }) {
    const r = load.reserves[reserve]
    const title = `${RESERVE_LABELS[reserve]} · ${load.month} — ${
        r.capacity === null
            ? `${formatDemand(reserve, r.demand)} (no capacity set)`
            : `${formatDemand(reserve, r.demand)} of ${formatDemand(reserve, r.capacity)}`
    }`

    if (r.ratio === null) {
        return (
            <div className="flex h-full items-end justify-center px-1.5 pb-1" title={title}>
                <div className="h-px w-full bg-neutral-200" />
            </div>
        )
    }

    const height = Math.min(r.ratio, RIBBON_CEILING) * CAPACITY_LINE * 100

    return (
        <div className="flex h-full items-end px-1.5 pb-1" title={title}>
            <div
                className={`w-full rounded-sm ${r.level ? LEVEL_BAR[r.level] : 'bg-neutral-200'}`}
                style={{ height: `${Math.max(height, 2)}%` }}
            />
        </div>
    )
}

export default function LifePlanTimeline({
    timeline,
    loads,
    onSelectItem,
    onSelectSeason,
    onSelectMonth,
}: {
    timeline: Timeline
    loads: MonthLoad[]
    onSelectItem: (item: LaneItem) => void
    onSelectSeason?: (seasonId: string) => void
    onSelectMonth: (month: string) => void
}) {
    const { months, lanes, goals, bands } = timeline
    const today = currentMonthKey()

    if (months.length === 0) {
        return (
            <EmptyState
                icon="fa-timeline"
                title="Nothing to plot"
                description="This plan's window is empty — give it a start and end month."
            />
        )
    }

    // Lay everything onto one grid so the lanes, bands and month headers stay in
    // lockstep. Rows are assigned up front: header, bands, goals, then each
    // pillar's packed rows.
    const headerRow = 1
    const bandRow = 2
    const goalRow = goals.length > 0 ? 3 : 0
    const firstLaneRow = (goalRow || bandRow) + 1
    const packed = lanes.map((lane) => ({ lane, rows: packLaneRows(lane.items) }))
    // Every lane is as tall as the busiest one, so the eye can compare pillars
    // without the row height itself carrying meaning.
    const laneRowCount = Math.max(1, ...packed.map((e) => e.rows.length))
    const laneLayout = packed.map((entry, i) => ({
        ...entry,
        startRow: firstLaneRow + i * laneRowCount,
    }))
    const laneRowsEnd = firstLaneRow - 1 + lanes.length * laneRowCount
    // The ribbon is the same grid, so a column of it lines up exactly under the
    // commitments that caused it — the whole point of putting it here rather than
    // in a chart of its own.
    const firstRibbonRow = laneRowsEnd + 1
    const loadByMonth = new Map(loads.map((l) => [l.month, l]))
    const totalRows = laneRowsEnd + RESERVES.length

    const gridStyle = {
        gridTemplateColumns: `${LABEL_WIDTH}px repeat(${months.length}, minmax(${MONTH_WIDTH}px, 1fr))`,
        // Fixed row tracks keep every lane — and every row inside a lane — the
        // same height regardless of what it carries.
        gridTemplateRows: `auto auto ${goalRow ? `${ROW_HEIGHT}px ` : ''}repeat(${
            lanes.length * laneRowCount
        }, ${ROW_HEIGHT}px) repeat(${RESERVES.length}, ${RIBBON_HEIGHT}px)`,
        minWidth: LABEL_WIDTH + months.length * MONTH_WIDTH,
    }

    return (
        <div className="overflow-x-auto rounded-2xl border border-black/[0.06] bg-white pb-6">
            <div className="grid items-stretch" style={gridStyle}>
                {/* Month column guides, drawn behind everything as full-height cells. */}
                {months.map((month, i) => (
                    <div
                        key={`guide-${month}`}
                        aria-hidden="true"
                        style={{ gridColumn: i + 2, gridRow: `1 / span ${totalRows}` }}
                        className={[
                            'border-l border-black/[0.04]',
                            month === today ? 'bg-coral-50/40' : isJanuary(month) ? 'bg-neutral-50/60' : '',
                        ].join(' ')}
                    />
                ))}

                {/* Month headers */}
                <div
                    style={{ gridColumn: 1, gridRow: headerRow }}
                    className="sticky left-0 z-20 bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
                >
                    Month
                </div>
                {months.map((month, i) => (
                    <div
                        key={`head-${month}`}
                        style={{ gridColumn: i + 2, gridRow: headerRow }}
                        className="px-1 py-2 text-center"
                    >
                        <p
                            className={`text-[11px] font-bold ${month === today ? 'text-coral-600' : 'text-neutral-700'}`}
                        >
                            {shortMonth(month)}
                        </p>
                        {(isJanuary(month) || i === 0) && (
                            <p className="text-[9px] font-semibold text-neutral-400">
                                {month.slice(0, 4)}
                            </p>
                        )}
                    </div>
                ))}

                {/* Season bands — one tinted strip naming the chapter each month sits in. */}
                <div
                    style={{ gridColumn: 1, gridRow: bandRow }}
                    className="sticky left-0 z-20 flex items-center bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400"
                >
                    Season
                </div>
                {bands.length === 0 && (
                    <div
                        style={{ gridColumn: `2 / span ${months.length}`, gridRow: bandRow }}
                        className="px-2 py-1.5 text-[11px] text-neutral-400"
                    >
                        No seasons yet
                    </div>
                )}
                {bands.map((band) => {
                    const startIdx = months.indexOf(band.startMonth)
                    const endIdx = months.indexOf(band.endMonth)
                    if (startIdx < 0 || endIdx < 0) return null
                    const colors = CALENDAR_COLOR_CLASSES[band.season.color]
                    return (
                        <div
                            key={band.season._id}
                            style={{
                                gridColumn: `${startIdx + 2} / span ${endIdx - startIdx + 1}`,
                                gridRow: bandRow,
                            }}
                            className="flex items-center px-1 py-2"
                        >
                            <button
                                type="button"
                                onClick={() => onSelectSeason?.(band.season._id)}
                                title={band.season.focus ?? band.season.name}
                                className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-xs font-bold ${colors.light} ${colors.text} ring-1 ring-inset ring-black/[0.04] transition-colors hover:brightness-95`}
                            >
                                {band.season.name}
                            </button>
                        </div>
                    )
                })}

                {/* Goal deadlines — their own row, since a goal belongs to no single pillar. */}
                {goalRow > 0 && (
                    <>
                        <div
                            style={{ gridColumn: 1, gridRow: goalRow }}
                            className="sticky left-0 z-20 flex items-center gap-2 border-t border-black/[0.06] bg-white px-4 py-2"
                        >
                            <i className="fa-solid fa-bullseye w-4 text-center text-xs text-neutral-300" aria-hidden="true" />
                            <span className="text-sm font-bold text-neutral-700">Goals</span>
                        </div>
                        <div
                            aria-hidden="true"
                            style={{ gridColumn: `2 / span ${months.length}`, gridRow: goalRow }}
                            className="border-t border-black/[0.06]"
                        />
                        {goals.map((goal) => (
                            <LaneBar
                                key={goal.id}
                                item={goal}
                                months={months}
                                row={goalRow}
                                onSelect={onSelectItem}
                            />
                        ))}
                    </>
                )}

                {/* One lane per pillar, growing downwards when commitments overlap. */}
                {laneLayout.map(({ lane, rows, startRow }) => (
                    <PillarLane
                        key={lane.pillar}
                        pillar={lane.pillar}
                        rows={rows}
                        startRow={startRow}
                        rowCount={laneRowCount}
                        months={months}
                        onSelectItem={onSelectItem}
                    />
                ))}

                {/* The capacity ribbon: what the lanes above cost, reserve by reserve. */}
                {RESERVES.map((reserve, i) => {
                    const row = firstRibbonRow + i
                    return (
                        <Fragment key={`ribbon-${reserve}`}>
                            <div
                                style={{ gridColumn: 1, gridRow: row }}
                                className={`sticky left-0 z-20 flex items-center gap-2 bg-white px-4 ${
                                    i === 0 ? 'border-t-2 border-black/[0.08]' : ''
                                }`}
                            >
                                <i
                                    className={`fa-solid ${RESERVE_ICONS[reserve]} w-4 shrink-0 text-center text-[10px] text-neutral-300`}
                                    aria-hidden="true"
                                />
                                <span className="min-w-0 truncate text-[11px] font-bold text-neutral-500">
                                    {RESERVE_LABELS[reserve]}
                                </span>
                            </div>
                            {i === 0 && (
                                <div
                                    aria-hidden="true"
                                    style={{ gridColumn: `2 / span ${months.length}`, gridRow: row }}
                                    className="border-t-2 border-black/[0.08]"
                                />
                            )}
                            {/* The capacity line, drawn once across every column so the
                                row reads as one chart rather than twelve. */}
                            <div
                                aria-hidden="true"
                                style={{ gridColumn: `2 / span ${months.length}`, gridRow: row }}
                                className="pointer-events-none relative"
                            >
                                <div
                                    className="absolute inset-x-0 border-t border-dashed border-neutral-400/60"
                                    style={{ bottom: `calc(${CAPACITY_LINE * 100}% + 4px)` }}
                                />
                            </div>
                            {months.map((month, m) => {
                                const load = loadByMonth.get(month)
                                if (!load) return null
                                return (
                                    <button
                                        key={`${reserve}-${month}`}
                                        type="button"
                                        onClick={() => onSelectMonth(month)}
                                        style={{ gridColumn: m + 2, gridRow: row }}
                                        title={summarise(load)}
                                        className="transition-opacity hover:opacity-70"
                                    >
                                        <RibbonCell load={load} reserve={reserve} />
                                    </button>
                                )
                            })}
                        </Fragment>
                    )
                })}
            </div>
        </div>
    )
}

function PillarLane({
    pillar,
    rows,
    startRow,
    rowCount,
    months,
    onSelectItem,
}: {
    pillar: LifePillar
    rows: LaneItem[][]
    startRow: number
    rowCount: number
    months: string[]
    onSelectItem: (item: LaneItem) => void
}) {
    return (
        <>
            <div
                style={{ gridColumn: 1, gridRow: `${startRow} / span ${rowCount}` }}
                className="sticky left-0 z-20 flex items-center gap-2 border-t border-black/[0.06] bg-white px-4 py-2"
            >
                <i
                    className={`fa-solid ${LIFE_PILLAR_ICONS[pillar]} w-4 shrink-0 text-center text-xs text-neutral-300`}
                    aria-hidden="true"
                />
                <span className="min-w-0 truncate text-sm font-bold text-neutral-700">
                    {TIMELINE_LANE_LABELS[pillar]}
                </span>
            </div>
            {/* The lane's top rule, drawn across the month columns. */}
            <div
                aria-hidden="true"
                style={{ gridColumn: `2 / span ${months.length}`, gridRow: startRow }}
                className="border-t border-black/[0.06]"
            />
            {rows.length === 0 ? (
                <div
                    style={{ gridColumn: `2 / span ${months.length}`, gridRow: startRow }}
                    className="flex items-center px-2 text-[11px] text-neutral-300"
                >
                    —
                </div>
            ) : (
                rows.flatMap((row, i) =>
                    row.map((item) => (
                        <LaneBar
                            key={item.id}
                            item={item}
                            months={months}
                            row={startRow + i}
                            onSelect={onSelectItem}
                        />
                    ))
                )
            )}
        </>
    )
}
