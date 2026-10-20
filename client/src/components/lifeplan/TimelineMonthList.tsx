import type { LifePillar } from '../../types'
import { MONTHS, monthKey } from '../../lib/calendar'
import { TIMELINE_LANE_LABELS, type LaneItem, type Timeline } from '../../lib/lifeTimeline'
import { RESERVE_LABELS, type MonthLoad } from '../../lib/lifeLoad'
import LoadPill from './LoadPill'
import { PANEL, PillarTile, ToneTile, colorClasses } from './ui'

/**
 * The timeline read vertically, a month at a time.
 *
 * A twelve-column grid can't survive a phone, and squeezing it makes both axes
 * useless at once. On a narrow screen the useful question is the column, not the
 * row — "what is this month carrying" — so the small-screen view answers that
 * one properly instead of showing a worse version of the grid.
 */
export default function TimelineMonthList({
    timeline,
    loads,
    onSelectItem,
    onSelectMonth,
}: {
    timeline: Timeline
    loads: MonthLoad[]
    onSelectItem: (item: LaneItem) => void
    onSelectMonth: (month: string) => void
}) {
    const today = (() => {
        const now = new Date()
        return monthKey(now.getFullYear(), now.getMonth())
    })()

    const loadByMonth = new Map(loads.map((l) => [l.month, l]))

    /** Everything sitting on a month, pillar by pillar, in the plan's lane order. */
    function itemsForMonth(month: string): { pillar: LifePillar; items: LaneItem[] }[] {
        return timeline.lanes
            .map((lane) => ({
                pillar: lane.pillar,
                items: lane.items.filter((i) => i.startMonth <= month && i.endMonth >= month),
            }))
            .filter((g) => g.items.length > 0)
    }

    return (
        <ol className={`divide-y divide-neutral-100 ${PANEL}`}>
            {timeline.months.map((month, index) => {
                const band = timeline.bands.find(
                    (b) => b.startMonth <= month && b.endMonth >= month
                )
                const groups = itemsForMonth(month)
                const goals = timeline.goals.filter((g) => g.startMonth === month)
                const load = loadByMonth.get(month)
                const isNow = month === today
                const showYear = index === 0 || month.endsWith('-01')
                const empty = groups.length === 0 && goals.length === 0

                return (
                    <li
                        key={month}
                        className={`flex gap-4 px-4 py-4 sm:px-5 ${isNow ? 'bg-coral-50/40' : ''}`}
                    >
                        {/* The month, as a fixed column so the rows read down like a diary. */}
                        <div className="w-11 shrink-0 pt-0.5 text-center">
                            <p
                                className={`text-[15px] font-semibold leading-none ${isNow ? 'text-coral-600' : 'text-neutral-900'}`}
                            >
                                {MONTHS[Number(month.slice(5, 7)) - 1].slice(0, 3)}
                            </p>
                            {(showYear || isNow) && (
                                <p className={`mt-1 text-[11px] ${isNow ? 'font-medium text-coral-600' : 'text-neutral-400'}`}>
                                    {isNow ? 'Now' : month.slice(0, 4)}
                                </p>
                            )}
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                {band ? (
                                    <span
                                        className={`inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ${colorClasses(band.season.color).light} ${colorClasses(band.season.color).text}`}
                                    >
                                        <span
                                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorClasses(band.season.color).dot}`}
                                            aria-hidden="true"
                                        />
                                        <span className="truncate">{band.season.name}</span>
                                    </span>
                                ) : (
                                    <span className="text-xs text-neutral-400">No season</span>
                                )}
                                {load && (
                                    <button
                                        type="button"
                                        onClick={() => onSelectMonth(month)}
                                        className="shrink-0"
                                    >
                                        <LoadPill
                                            level={load.level}
                                            detail={load.peak ? RESERVE_LABELS[load.peak] : undefined}
                                        />
                                    </button>
                                )}
                            </div>

                            {load && load.conflicts.length > 0 && (
                                <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-coral-600">
                                    <i className="fa-solid fa-circle-exclamation text-[11px]" aria-hidden="true" />
                                    {load.conflicts[0].title}
                                </p>
                            )}

                            {empty ? (
                                <p className="mt-2.5 text-[13px] text-neutral-400">Nothing planned</p>
                            ) : (
                                <div className="mt-3 space-y-2">
                                    {groups.map(({ pillar, items }) => (
                                        <div key={pillar} className="flex items-start gap-2.5">
                                            <span title={TIMELINE_LANE_LABELS[pillar]}>
                                                <PillarTile pillar={pillar} size="sm" />
                                            </span>
                                            <div className="flex min-w-0 flex-wrap gap-1.5">
                                                {items.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        type="button"
                                                        onClick={() => onSelectItem(item)}
                                                        className={`h-7 max-w-full truncate rounded-lg px-2.5 text-xs font-medium ${colorClasses(item.color).bg} ${colorClasses(item.color).text}`}
                                                    >
                                                        {item.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {goals.length > 0 && (
                                        <div className="flex items-start gap-2.5">
                                            <span title="Goal deadline">
                                                <ToneTile icon="fa-bullseye" tone="navy" size="sm" />
                                            </span>
                                            <div className="flex min-w-0 flex-wrap gap-1.5">
                                                {goals.map((goal) => (
                                                    <button
                                                        key={goal.id}
                                                        type="button"
                                                        onClick={() => onSelectItem(goal)}
                                                        className="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200"
                                                    >
                                                        <span
                                                            className={`h-2 w-2 shrink-0 rotate-45 rounded-[2px] ${colorClasses(goal.color).dot}`}
                                                            aria-hidden="true"
                                                        />
                                                        <span className="truncate">{goal.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </li>
                )
            })}
        </ol>
    )
}
