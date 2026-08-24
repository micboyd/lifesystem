import { CALENDAR_COLOR_CLASSES, LIFE_PILLAR_ICONS } from '../../types'
import type { LifePillar } from '../../types'
import { formatMonthKey, monthKey } from '../../lib/calendar'
import { TIMELINE_LANE_LABELS, type LaneItem, type Timeline } from '../../lib/lifeTimeline'
import { RESERVE_LABELS, type MonthLoad } from '../../lib/lifeLoad'
import LoadPill from './LoadPill'

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
        <div className="space-y-3">
            {timeline.months.map((month) => {
                const band = timeline.bands.find(
                    (b) => b.startMonth <= month && b.endMonth >= month
                )
                const groups = itemsForMonth(month)
                const goals = timeline.goals.filter((g) => g.startMonth === month)
                const load = loadByMonth.get(month)
                const isNow = month === today

                return (
                    <div
                        key={month}
                        className={[
                            'rounded-2xl border bg-white p-4',
                            isNow ? 'border-coral-200 ring-1 ring-coral-100' : 'border-black/[0.06]',
                        ].join(' ')}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <h3
                                    className={`truncate text-sm font-bold ${isNow ? 'text-coral-700' : 'text-neutral-900'}`}
                                >
                                    {formatMonthKey(month)}
                                </h3>
                                {isNow && (
                                    <span className="shrink-0 rounded-full bg-coral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral-700">
                                        Now
                                    </span>
                                )}
                            </div>
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
                            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-coral-600">
                                <i className="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
                                {load.conflicts[0].title}
                            </p>
                        )}

                        {band && (
                            <p
                                className={`mt-2 inline-flex rounded-lg px-2 py-1 text-[11px] font-bold ${CALENDAR_COLOR_CLASSES[band.season.color].light} ${CALENDAR_COLOR_CLASSES[band.season.color].text}`}
                            >
                                {band.season.name}
                            </p>
                        )}

                        {groups.length === 0 && goals.length === 0 ? (
                            <p className="mt-3 text-xs text-neutral-400">Nothing planned.</p>
                        ) : (
                            <div className="mt-3 space-y-2.5">
                                {groups.map(({ pillar, items }) => (
                                    <div key={pillar} className="flex gap-2.5">
                                        <i
                                            className={`fa-solid ${LIFE_PILLAR_ICONS[pillar]} mt-1 w-4 shrink-0 text-center text-[11px] text-neutral-300`}
                                            aria-hidden="true"
                                            title={TIMELINE_LANE_LABELS[pillar]}
                                        />
                                        <div className="flex min-w-0 flex-wrap gap-1.5">
                                            {items.map((item) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => onSelectItem(item)}
                                                    className={`max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-semibold ${CALENDAR_COLOR_CLASSES[item.color].bg} ${CALENDAR_COLOR_CLASSES[item.color].text}`}
                                                >
                                                    {item.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {goals.length > 0 && (
                                    <div className="flex gap-2.5">
                                        <i
                                            className="fa-solid fa-bullseye mt-1 w-4 shrink-0 text-center text-[11px] text-neutral-300"
                                            aria-hidden="true"
                                            title="Goal deadline"
                                        />
                                        <div className="flex min-w-0 flex-wrap gap-1.5">
                                            {goals.map((goal) => (
                                                <button
                                                    key={goal.id}
                                                    type="button"
                                                    onClick={() => onSelectItem(goal)}
                                                    className="flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-neutral-600"
                                                >
                                                    <span
                                                        className="h-2 w-2 shrink-0 rotate-45 rounded-[2px] bg-purple-400"
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
                )
            })}
        </div>
    )
}
