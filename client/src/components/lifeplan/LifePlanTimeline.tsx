import type { LifePillar } from '../../types'
import { formatMonthKey, MONTHS, monthKey } from '../../lib/calendar'
import {
    packLaneRows,
    placeOnGrid,
    stretchLaneRow,
    TIMELINE_LANE_LABELS,
    type LaneItem,
    type Timeline,
} from '../../lib/lifeTimeline'
import { RESERVE_ICONS, RESERVE_LABELS, type MonthLoad } from '../../lib/lifeLoad'
import { LEVEL_BAR, LEVEL_TEXT, LEVEL_TINT } from './loadStyles'
import { summarise } from './ReserveMeter'
import EmptyState from '../EmptyState'
import { OVERLINE, PANEL, PillarTile, ToneTile, colorClasses } from './ui'

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
const LABEL_WIDTH = 164
/** Height of a single packed row, so lanes read as bands rather than hairlines. */
const ROW_HEIGHT = 56
/** Height of the load row — one line, sitting with the season band. */
const LOAD_HEIGHT = 34
/**
 * The narrowest a bar can be and still show a word or two of its label inside.
 * A block of a few days is a fifth of this, so it is widened to reach it — see
 * `stretchLaneRow`, which only ever takes space no other bar wants.
 */
const MIN_BAR_WIDTH = 64
const MIN_BAR_MONTHS = MIN_BAR_WIDTH / MONTH_WIDTH

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
    drawn = item,
    months,
    row,
    onSelect,
}: {
    item: LaneItem
    /**
     * The span to draw, when it isn't the item's own — a bar too short to label
     * is widened into the free space beside it. A click still hands on `item`,
     * so the drawer reports the dates the record really holds.
     */
    drawn?: LaneItem
    months: string[]
    row: number
    onSelect: (item: LaneItem) => void
}) {
    const placement = placeOnGrid(drawn, months)
    if (!placement) return null
    const { startIndex, span, left, right } = placement
    const colors = colorClasses(item.color)
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
                        className={`h-3 w-3 shrink-0 rotate-45 rounded-[3px] ring-2 ring-white ${colors.dot}`}
                        aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-xs font-medium text-neutral-700 group-hover:text-neutral-950">
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
                    'absolute inset-y-2 flex items-center gap-1.5 truncate px-2.5 text-left text-xs font-medium ring-1 ring-inset ring-neutral-900/[0.04] transition-colors',
                    colors.bg,
                    colors.hover,
                    colors.text,
                    // An open end signals the commitment carries on past the window
                    // rather than stopping neatly at its edge.
                    item.clippedStart ? 'rounded-l-none' : 'rounded-l-lg',
                    item.clippedEnd ? 'rounded-r-none' : 'rounded-r-lg',
                ].join(' ')}
            >
                {item.clippedStart && <i className="fa-solid fa-caret-left text-[11px] opacity-60" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.clippedEnd && <i className="fa-solid fa-caret-right text-[11px] opacity-60" aria-hidden="true" />}
            </button>
        </div>
    )
}

/**
 * One month's load, as a single cell.
 *
 * The four-strip ribbon this replaced was honest and unreadable: four rows of
 * unlabelled bars asked you to decode a chart before you could learn anything,
 * on a screen whose job is "what is happening, when". The month only ever has
 * one answer worth putting beside the lanes — *which* reserve is hot, and how
 * hot — so that is all this draws. The full four-gauge breakdown is one click
 * away in the month drawer, and the ribbon proper lives on the Pressure tab
 * where there's room to label it.
 *
 * Quiet and steady months are deliberately almost invisible. A row where only
 * the difficult months carry a mark is a row you can read across in one pass;
 * one where every month carries a shape is another chart to decode.
 */
function LoadCell({ load }: { load: MonthLoad }) {
    const { level, peak } = load
    const title = `${formatMonthKey(load.month)} — ${summarise(load)}`

    if (!level || !peak) {
        return <div className="h-full" title={title} />
    }

    if (level === 'quiet' || level === 'steady') {
        return (
            <div className="flex h-full items-center px-1.5" title={title}>
                <div className={`h-1 w-full rounded-full ${LEVEL_BAR[level]} opacity-60`} />
            </div>
        )
    }

    return (
        <div className="flex h-full items-center px-1" title={title}>
            <div
                className={`flex h-6 w-full items-center justify-center gap-1 rounded-lg ${
                    level === 'overloaded' ? 'bg-coral-500 text-white' : `${LEVEL_TINT.busy} ${LEVEL_TEXT.busy}`
                }`}
            >
                <i
                    className={`fa-solid ${RESERVE_ICONS[peak]} text-[9px]`}
                    aria-hidden="true"
                />
                <span className="text-[11px] font-medium">
                    {RESERVE_LABELS[peak]}
                </span>
            </div>
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
    const loadRow = 3
    const goalRow = goals.length > 0 ? 4 : 0
    const firstLaneRow = (goalRow || loadRow) + 1
    const packed = lanes.map((lane) => ({ lane, rows: packLaneRows(lane.items) }))
    // Every lane is as tall as the busiest one, so the eye can compare pillars
    // without the row height itself carrying meaning.
    const laneRowCount = Math.max(1, ...packed.map((e) => e.rows.length))
    const laneLayout = packed.map((entry, i) => ({
        ...entry,
        startRow: firstLaneRow + i * laneRowCount,
    }))
    const loadByMonth = new Map(loads.map((l) => [l.month, l]))
    const totalRows = firstLaneRow - 1 + lanes.length * laneRowCount

    const gridStyle = {
        gridTemplateColumns: `${LABEL_WIDTH}px repeat(${months.length}, minmax(${MONTH_WIDTH}px, 1fr))`,
        // Fixed row tracks keep every lane — and every row inside a lane — the
        // same height regardless of what it carries.
        gridTemplateRows: `auto auto ${LOAD_HEIGHT}px ${goalRow ? `${ROW_HEIGHT}px ` : ''}repeat(${
            lanes.length * laneRowCount
        }, ${ROW_HEIGHT}px)`,
        minWidth: LABEL_WIDTH + months.length * MONTH_WIDTH,
    }

    return (
        <div className={`overflow-x-auto pb-4 ${PANEL}`}>
            <div className="grid items-stretch" style={gridStyle}>
                {/* Month column guides, drawn behind everything as full-height cells. */}
                {months.map((month, i) => (
                    <div
                        key={`guide-${month}`}
                        aria-hidden="true"
                        style={{ gridColumn: i + 2, gridRow: `1 / span ${totalRows}` }}
                        className={[
                            isJanuary(month) && i > 0 ? 'border-l border-neutral-200' : 'border-l border-neutral-100',
                            month === today ? 'bg-coral-50/50' : '',
                        ].join(' ')}
                    />
                ))}

                {/* Month headers */}
                <div
                    style={{ gridColumn: 1, gridRow: headerRow }}
                    className={`sticky left-0 z-20 flex items-end bg-white px-5 pb-2 pt-4 ${OVERLINE}`}
                >
                    {months[0].slice(0, 4)}
                    {months[months.length - 1].slice(0, 4) !== months[0].slice(0, 4) &&
                        `–${months[months.length - 1].slice(2, 4)}`}
                </div>
                {months.map((month, i) => (
                    <div
                        key={`head-${month}`}
                        style={{ gridColumn: i + 2, gridRow: headerRow }}
                        className="flex flex-col items-center justify-end px-1 pb-2 pt-4"
                    >
                        {month === today ? (
                            <span className="inline-flex h-6 items-center rounded-full bg-coral-500 px-2.5 text-xs font-medium text-white">
                                {shortMonth(month)}
                            </span>
                        ) : (
                            <span className="inline-flex h-6 items-center text-xs font-medium text-neutral-600">
                                {shortMonth(month)}
                                {isJanuary(month) && i > 0 && (
                                    <span className="ml-1 text-neutral-400">{month.slice(2, 4)}</span>
                                )}
                            </span>
                        )}
                    </div>
                ))}

                {/* Season bands — one tinted strip naming the chapter each month sits in. */}
                <div
                    style={{ gridColumn: 1, gridRow: bandRow }}
                    className={`sticky left-0 z-20 flex items-center border-t border-neutral-100 bg-white px-5 py-2 ${OVERLINE}`}
                >
                    Season
                </div>
                {bands.length === 0 && (
                    <div
                        style={{ gridColumn: `2 / span ${months.length}`, gridRow: bandRow }}
                        className="flex items-center border-t border-neutral-100 px-2 py-2 text-[13px] text-neutral-400"
                    >
                        No seasons yet
                    </div>
                )}
                {bands.map((band) => {
                    const startIdx = months.indexOf(band.startMonth)
                    const endIdx = months.indexOf(band.endMonth)
                    if (startIdx < 0 || endIdx < 0) return null
                    const colors = colorClasses(band.season.color)
                    return (
                        <div
                            key={band.season._id}
                            style={{
                                gridColumn: `${startIdx + 2} / span ${endIdx - startIdx + 1}`,
                                gridRow: bandRow,
                            }}
                            className="flex items-center border-t border-neutral-100 px-1 py-2"
                        >
                            <button
                                type="button"
                                onClick={() => onSelectSeason?.(band.season._id)}
                                title={band.season.focus ?? band.season.name}
                                className={`flex w-full min-w-0 items-center gap-2 rounded-[10px] px-2.5 py-2 text-left text-[13px] font-semibold ${colors.light} ${colors.text} ring-1 ring-inset ring-neutral-900/[0.04] transition-colors hover:brightness-95`}
                            >
                                <span className={`h-2 w-2 shrink-0 rounded-full ${colors.dot}`} aria-hidden="true" />
                                <span className="min-w-0 truncate">{band.season.name}</span>
                            </button>
                        </div>
                    )
                })}

                {/* Load: one cell a month, naming the reserve under most strain. */}
                <div
                    style={{ gridColumn: 1, gridRow: loadRow }}
                    className={`sticky left-0 z-20 flex items-center bg-white px-5 ${OVERLINE}`}
                >
                    Load
                </div>
                {months.map((month, i) => {
                    const load = loadByMonth.get(month)
                    if (!load) return null
                    return (
                        <button
                            key={`load-${month}`}
                            type="button"
                            onClick={() => onSelectMonth(month)}
                            style={{ gridColumn: i + 2, gridRow: loadRow }}
                            className="transition-opacity hover:opacity-70"
                        >
                            <LoadCell load={load} />
                        </button>
                    )
                })}

                {/* Goal deadlines — their own row, since a goal belongs to no single pillar. */}
                {goalRow > 0 && (
                    <>
                        <div
                            style={{ gridColumn: 1, gridRow: goalRow }}
                            className="sticky left-0 z-20 flex items-center gap-2.5 border-t border-neutral-100 bg-white px-5 py-2"
                        >
                            <ToneTile icon="fa-bullseye" tone="navy" />
                            <span className="text-[13px] font-medium text-neutral-900">Goals</span>
                        </div>
                        <div
                            aria-hidden="true"
                            style={{ gridColumn: `2 / span ${months.length}`, gridRow: goalRow }}
                            className="border-t border-neutral-100"
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
                className="sticky left-0 z-20 flex items-center gap-2.5 border-t border-neutral-100 bg-white px-5 py-2"
            >
                <PillarTile pillar={pillar} size="md" />
                <span className="min-w-0 truncate text-[13px] font-medium text-neutral-900">
                    {TIMELINE_LANE_LABELS[pillar]}
                </span>
            </div>
            {/* The lane's top rule, drawn across the month columns. */}
            <div
                aria-hidden="true"
                style={{ gridColumn: `2 / span ${months.length}`, gridRow: startRow }}
                className="border-t border-neutral-100"
            />
            {rows.length === 0 ? (
                <div
                    style={{ gridColumn: `2 / span ${months.length}`, gridRow: startRow }}
                    className="flex items-center px-3 text-[13px] text-neutral-400"
                >
                    Nothing planned
                </div>
            ) : (
                rows.flatMap((row, i) =>
                    // Widened here rather than in the packing, so a stretched bar
                    // never pushes anything onto another row.
                    stretchLaneRow(row, months, MIN_BAR_MONTHS).map(({ item, drawn }) => (
                        <LaneBar
                            key={item.id}
                            item={item}
                            drawn={drawn}
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
