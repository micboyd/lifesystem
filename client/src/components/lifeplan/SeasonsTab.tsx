import { CALENDAR_COLOR_CLASSES, LIFE_PILLAR_ICONS, LIFE_PILLAR_LABELS } from '../../types'
import type { LifePlan, Season, SeasonLinks } from '../../types'
import { formatMonthKey, formatMonthRange, monthKey } from '../../lib/calendar'
import { monthRange, seasonProgress } from '../../lib/lifeTimeline'
import {
    LEVEL_THRESHOLDS,
    RESERVES,
    RESERVE_ICONS,
    RESERVE_LABELS,
    reserveShape,
    type MonthLoad,
} from '../../lib/lifeLoad'
import Button from '../Button'
import EmptyState from '../EmptyState'

/**
 * The plan's chapters, in order — the one surface in the module that writes
 * rather than reads.
 *
 * Gaps between seasons are shown rather than hidden: an unclaimed run of months
 * is a real fact about a plan, and seeing it is what prompts filling it in.
 */

const LINK_LABELS: Record<keyof SeasonLinks, string> = {
    trainingPlans: 'training plan',
    nutritionPhases: 'nutrition phase',
    savingsTargets: 'savings target',
    courses: 'course',
    monthNotes: 'month flag',
    goals: 'goal',
}

/** "2 training plans · 1 cut" — what a season has pulled in. */
function linkSummary(links: SeasonLinks): string[] {
    return (Object.keys(LINK_LABELS) as (keyof SeasonLinks)[])
        .map((key) => {
            const count = links[key]?.length ?? 0
            if (count === 0) return null
            const label = LINK_LABELS[key]
            return `${count} ${label}${count === 1 ? '' : 's'}`
        })
        .filter((s): s is string => s !== null)
}

/** Runs of months in the plan window that no season claims. */
function findGaps(plan: LifePlan): { startMonth: string; endMonth: string }[] {
    const claimed = new Set(
        plan.seasons.flatMap((s) => monthRange(s.startMonth, s.endMonth))
    )
    const gaps: { startMonth: string; endMonth: string }[] = []
    let run: string[] = []
    for (const month of monthRange(plan.start, plan.end)) {
        if (claimed.has(month)) {
            if (run.length > 0) {
                gaps.push({ startMonth: run[0], endMonth: run[run.length - 1] })
                run = []
            }
        } else {
            run.push(month)
        }
    }
    if (run.length > 0) gaps.push({ startMonth: run[0], endMonth: run[run.length - 1] })
    return gaps
}

/**
 * The shape of a season: which reserves it leans on hardest.
 *
 * A season with a point runs heavy in one reserve and quiet in the rest. One that
 * runs heavy in three isn't a season, it's a wish list — and since seasons are
 * the one thing this module actually authors, that's worth saying out loud at the
 * moment it's being written rather than in the review three months later.
 */
function SeasonShape({ season, loads }: { season: Season; loads: MonthLoad[] }) {
    const within = loads.filter(
        (l) => l.month >= season.startMonth && l.month <= season.endMonth
    )
    if (within.length === 0) return null

    const shape = reserveShape(within)
    const heavy = RESERVES.filter((r) => (shape[r] ?? 0) >= LEVEL_THRESHOLDS.busy)

    return (
        <div className="mt-4 border-t border-neutral-100 pt-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {RESERVES.map((reserve) => {
                    const peak = shape[reserve]
                    return (
                        <span
                            key={reserve}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-500"
                            title={`${RESERVE_LABELS[reserve]} at its heaviest month of the season`}
                        >
                            <i
                                className={`fa-solid ${RESERVE_ICONS[reserve]} w-3.5 text-center text-[10px] text-neutral-300`}
                                aria-hidden="true"
                            />
                            {RESERVE_LABELS[reserve]}
                            <span
                                className={
                                    peak === null
                                        ? 'text-neutral-300'
                                        : peak >= 1
                                          ? 'text-coral-600'
                                          : peak >= LEVEL_THRESHOLDS.busy
                                            ? 'text-amber-700'
                                            : 'text-neutral-400'
                                }
                            >
                                {peak === null ? '—' : `${Math.round(peak * 100)}%`}
                            </span>
                        </span>
                    )
                })}
            </div>
            {heavy.length >= 3 && (
                <p className="mt-2 text-[11px] font-semibold text-amber-700">
                    Heavy on {heavy.map((r) => RESERVE_LABELS[r].toLowerCase()).join(', ')} at once.
                    A season usually only survives one.
                </p>
            )}
        </div>
    )
}

export default function SeasonsTab({
    plan,
    loads,
    onNew,
    onEdit,
    onDelete,
}: {
    plan: LifePlan
    loads: MonthLoad[]
    onNew: () => void
    onEdit: (season: Season) => void
    onDelete: (season: Season) => void
}) {
    const now = new Date()
    const thisMonth = monthKey(now.getFullYear(), now.getMonth())
    const gaps = findGaps(plan)

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold tracking-tight text-neutral-950">Seasons</h2>
                    <p className="text-sm text-neutral-500">
                        {plan.seasons.length === 0
                            ? 'Break the plan into chapters.'
                            : `${plan.seasons.length} chapter${plan.seasons.length === 1 ? '' : 's'} across ${formatMonthRange(plan.start, plan.end)}.`}
                    </p>
                </div>
                <Button icon="fa-solid fa-plus" onClick={onNew} size="sm">
                    New season
                </Button>
            </div>

            {plan.seasons.length === 0 ? (
                <EmptyState
                    icon="fa-layer-group"
                    title="No seasons yet"
                    description="A season is a run of months with a focus — what this stretch of time is for."
                    action={<Button onClick={onNew}>Add the first season</Button>}
                />
            ) : (
                <div className="space-y-3">
                    {plan.seasons.map((season) => {
                        const colors = CALENDAR_COLOR_CLASSES[season.color]
                        const isNow =
                            season.startMonth <= thisMonth && season.endMonth >= thisMonth
                        const { monthIndex, monthCount } = seasonProgress(season, thisMonth)
                        const links = linkSummary(season.links)

                        return (
                            <div
                                key={season._id}
                                className={[
                                    'rounded-2xl border bg-white p-5',
                                    isNow ? 'border-coral-200 ring-1 ring-coral-100' : 'border-black/[0.06]',
                                ].join(' ')}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span
                                                className={`h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`}
                                                aria-hidden="true"
                                            />
                                            <h3 className="truncate text-base font-bold text-neutral-950">
                                                {season.name}
                                            </h3>
                                            {isNow && (
                                                <span className="rounded-full bg-coral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-coral-700">
                                                    Month {monthIndex} of {monthCount}
                                                </span>
                                            )}
                                            {season.review && (
                                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                                                    Reviewed
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-1 text-xs font-semibold text-neutral-400">
                                            {formatMonthRange(season.startMonth, season.endMonth)}
                                        </p>
                                        {season.focus && (
                                            <p className="mt-2 text-sm text-neutral-600">{season.focus}</p>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 gap-1">
                                        <button
                                            type="button"
                                            onClick={() => onEdit(season)}
                                            aria-label={`Edit ${season.name}`}
                                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                                        >
                                            <i className="fa-solid fa-pen text-xs" aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDelete(season)}
                                            aria-label={`Delete ${season.name}`}
                                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                        >
                                            <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>

                                <SeasonShape season={season} loads={loads} />

                                {season.intent.length > 0 && (
                                    <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
                                        {season.intent.map((intent) => (
                                            <div key={intent.pillar} className="flex gap-2.5">
                                                <i
                                                    className={`fa-solid ${LIFE_PILLAR_ICONS[intent.pillar]} mt-0.5 w-4 shrink-0 text-center text-[11px] text-neutral-300`}
                                                    aria-hidden="true"
                                                    title={LIFE_PILLAR_LABELS[intent.pillar]}
                                                />
                                                <p className="min-w-0 text-sm text-neutral-700">
                                                    <span className="font-semibold text-neutral-500">
                                                        {LIFE_PILLAR_LABELS[intent.pillar]}
                                                    </span>{' '}
                                                    — {intent.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {links.length > 0 && (
                                    <p className="mt-3 text-xs text-neutral-400">{links.join(' · ')}</p>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {gaps.length > 0 && plan.seasons.length > 0 && (
                <div className="rounded-2xl border border-dashed border-neutral-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Unclaimed months
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {gaps.map((gap) => (
                            <span
                                key={gap.startMonth}
                                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500"
                            >
                                {gap.startMonth === gap.endMonth
                                    ? formatMonthKey(gap.startMonth)
                                    : formatMonthRange(gap.startMonth, gap.endMonth)}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
