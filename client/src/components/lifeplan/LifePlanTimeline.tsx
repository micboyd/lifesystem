import { CALENDAR_COLOR_CLASSES, LIFE_PILLAR_ICONS, LIFE_PILLAR_LABELS } from '../../types'
import type { LifePillar } from '../../types'
import { MONTHS, monthKey } from '../../lib/calendar'
import {
    LANE_SOURCE_CHIPS,
    LANE_SOURCE_ICONS,
    LANE_SOURCE_LABELS,
    packLaneRows,
    placeOnGrid,
    type LaneItem,
    type Timeline,
} from '../../lib/lifeTimeline'
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
 * The "what is this" tag carried by every item on the grid.
 *
 * The lane label on the left already gives the pillar, but a pillar holds
 * several kinds of record at once — a Money lane mixes savings targets with
 * month flags — so the bar says its own kind rather than leaving it to be
 * inferred from the colour.
 */
function SourceChip({
    item,
    withText = true,
    className,
}: {
    item: LaneItem
    withText?: boolean
    className: string
}) {
    return (
        <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${className}`}
        >
            <i
                className={`fa-solid ${LANE_SOURCE_ICONS[item.source]} text-[8px]`}
                aria-hidden="true"
            />
            {withText ? (
                LANE_SOURCE_CHIPS[item.source]
            ) : (
                // Icon-only bars still need the name read out loud.
                <span className="sr-only">{LANE_SOURCE_CHIPS[item.source]}</span>
            )}
        </span>
    )
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
                    title={`${item.label} — ${LANE_SOURCE_LABELS[item.source]}`}
                    // Anchored on the diamond, which is the part that carries the
                    // date; the label reads off to its right.
                    style={{ left: `${left}%` }}
                    className="group absolute top-1/2 flex max-w-[210px] -translate-y-1/2 -translate-x-[7px] items-center gap-1.5"
                >
                    <span
                        className={`h-3 w-3 shrink-0 rotate-45 rounded-[2px] ${colors.dot}`}
                        aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-xs font-semibold text-neutral-600 group-hover:text-neutral-900">
                        {item.label}
                    </span>
                    <SourceChip item={item} className="bg-neutral-100 text-neutral-500" />
                </button>
            </div>
        )
    }

    // A bar only gets the word "Savings" if the months it covers leave room for
    // it; anything shorter keeps the icon alone rather than eating the label.
    const coveredMonths = span - item.startOffset - (1 - item.endOffset)
    const showChipText = coveredMonths * MONTH_WIDTH >= 150

    return (
        <div style={style} className="relative">
            <button
                type="button"
                onClick={() => onSelect(item)}
                title={`${item.label} — ${LANE_SOURCE_LABELS[item.source]}${
                    item.detail ? ` · ${item.detail}` : ''
                }`}
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
                <SourceChip
                    item={item}
                    withText={showChipText}
                    className={`bg-white/70 ${colors.text}`}
                />
                {item.clippedEnd && <i className="fa-solid fa-caret-right text-[10px] opacity-60" aria-hidden="true" />}
            </button>
        </div>
    )
}

export default function LifePlanTimeline({
    timeline,
    onSelectItem,
    onSelectSeason,
}: {
    timeline: Timeline
    onSelectItem: (item: LaneItem) => void
    onSelectSeason?: (seasonId: string) => void
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
    const totalRows = firstLaneRow - 1 + lanes.length * laneRowCount

    const gridStyle = {
        gridTemplateColumns: `${LABEL_WIDTH}px repeat(${months.length}, minmax(${MONTH_WIDTH}px, 1fr))`,
        // Fixed row tracks keep every lane — and every row inside a lane — the
        // same height regardless of what it carries.
        gridTemplateRows: `auto auto ${goalRow ? `${ROW_HEIGHT}px ` : ''}repeat(${
            lanes.length * laneRowCount
        }, ${ROW_HEIGHT}px)`,
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
                    {LIFE_PILLAR_LABELS[pillar]}
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
