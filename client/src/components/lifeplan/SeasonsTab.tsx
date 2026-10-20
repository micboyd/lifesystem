import { LIFE_PILLAR_LABELS } from '../../types'
import type { LifePlan, Season, SeasonLinks } from '../../types'
import { formatMonthKey, formatMonthRange, monthKey } from '../../lib/calendar'
import { monthRange, seasonProgress } from '../../lib/lifeTimeline'
import {
    LEVEL_THRESHOLDS,
    RESERVES,
    RESERVE_LABELS,
    levelForRatio,
    reserveShape,
    type MonthLoad,
} from '../../lib/lifeLoad'
import Button from '../Button'
import EmptyState from '../EmptyState'
import DropdownMenu from '../DropdownMenu'
import { LEVEL_BAR, LEVEL_TEXT } from './loadStyles'
import { MoreButton, OVERLINE, PANEL, PillarTile, ReserveTile, StatusChip, TabHeading, colorClasses } from './ui'

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
        <div className="mt-5">
            <p className={OVERLINE}>Peak load</p>
            <div className="mt-2.5 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
                {RESERVES.map((reserve) => {
                    const peak = shape[reserve]
                    const level = peak === null ? null : levelForRatio(peak)
                    return (
                        <div
                            key={reserve}
                            className="min-w-0"
                            title={`${RESERVE_LABELS[reserve]} at its heaviest month of the season`}
                        >
                            <div className="flex items-center gap-2">
                                <ReserveTile reserve={reserve} size="xs" />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">
                                    {RESERVE_LABELS[reserve]}
                                </span>
                                <span
                                    className={`text-[13px] font-medium tabular-nums ${
                                        level ? LEVEL_TEXT[level] : 'text-neutral-400'
                                    }`}
                                >
                                    {peak === null ? '—' : `${Math.round(peak * 100)}%`}
                                </span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-200">
                                {level && (
                                    <span
                                        className={`block h-full rounded-full ${LEVEL_BAR[level]}`}
                                        style={{ width: `${Math.min(1, peak!) * 100}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
            {heavy.length >= 3 && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-bg px-3 py-2 text-[13px] text-amber-700">
                    <i className="fa-solid fa-triangle-exclamation mt-0.5 text-xs" aria-hidden="true" />
                    <span>
                        Heavy on {heavy.map((r) => RESERVE_LABELS[r].toLowerCase()).join(', ')} at once.
                        A season usually only survives one.
                    </span>
                </p>
            )}
        </div>
    )
}

type RailEntry =
    | { kind: 'season'; season: Season; start: string }
    | { kind: 'gap'; startMonth: string; endMonth: string; start: string }

export default function SeasonsTab({
    plan,
    loads,
    onNew,
    onEdit,
    onDelete,
}: {
    plan: LifePlan
    loads: MonthLoad[]
    /** Start a new season, optionally on a given run of months. */
    onNew: (preset?: { startMonth: string; endMonth: string }) => void
    onEdit: (season: Season) => void
    onDelete: (season: Season) => void
}) {
    const now = new Date()
    const thisMonth = monthKey(now.getFullYear(), now.getMonth())
    const gaps = findGaps(plan)

    // Seasons and the gaps between them, in calendar order, so an unclaimed run
    // sits exactly where it falls rather than in a list of its own.
    const rail: RailEntry[] = [
        ...plan.seasons.map((season) => ({ kind: 'season' as const, season, start: season.startMonth })),
        ...gaps.map((gap) => ({ kind: 'gap' as const, ...gap, start: gap.startMonth })),
    ].sort((a, b) => a.start.localeCompare(b.start))

    return (
        <div className="space-y-6">
            <TabHeading
                title="Seasons"
                meta={
                    plan.seasons.length === 0
                        ? 'Break the plan into chapters.'
                        : `${plan.seasons.length} chapter${plan.seasons.length === 1 ? '' : 's'} across ${formatMonthRange(plan.start, plan.end)}${
                              gaps.length > 0
                                  ? ` · ${gaps.reduce((n, g) => n + monthRange(g.startMonth, g.endMonth).length, 0)} months unclaimed`
                                  : ''
                          }`
                }
                action={
                    <Button icon="fa-solid fa-plus" variant="secondary" onClick={() => onNew()}>
                        New season
                    </Button>
                }
            />

            {plan.seasons.length === 0 ? (
                <EmptyState
                    icon="fa-layer-group"
                    title="No seasons yet"
                    description="A season is a run of months with a focus — what this stretch of time is for."
                    action={
                        <Button icon="fa-solid fa-plus" onClick={() => onNew()}>
                            Add the first season
                        </Button>
                    }
                />
            ) : (
                <ol className="relative">
                    {/* The rail itself, behind every node. */}
                    <span
                        aria-hidden="true"
                        className="absolute bottom-4 left-[11px] top-4 w-px bg-neutral-200 sm:left-[15px]"
                    />
                    {rail.map((entry) =>
                        entry.kind === 'gap' ? (
                            <li key={`gap-${entry.startMonth}`} className="relative flex gap-4 pb-4 sm:gap-5">
                                <span className="relative z-10 mt-4 grid h-6 w-6 shrink-0 place-items-center sm:h-8 sm:w-8">
                                    <span className="h-2.5 w-2.5 rounded-full border-2 border-dashed border-neutral-300 bg-neutral-50" />
                                </span>
                                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 rounded-[20px] border border-dashed border-neutral-300 px-5 py-3.5">
                                    <div className="min-w-0">
                                        <p className="text-[15px] text-neutral-500">Unclaimed</p>
                                        <p className="text-[13px] text-neutral-400">
                                            {entry.startMonth === entry.endMonth
                                                ? formatMonthKey(entry.startMonth)
                                                : formatMonthRange(entry.startMonth, entry.endMonth)}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => onNew({ startMonth: entry.startMonth, endMonth: entry.endMonth })}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-neutral-950"
                                    >
                                        <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                                        Add season here
                                    </button>
                                </div>
                            </li>
                        ) : (
                            <SeasonCard
                                key={entry.season._id}
                                season={entry.season}
                                loads={loads}
                                thisMonth={thisMonth}
                                onEdit={() => onEdit(entry.season)}
                                onDelete={() => onDelete(entry.season)}
                            />
                        )
                    )}
                </ol>
            )}
        </div>
    )
}

function SeasonCard({
    season,
    loads,
    thisMonth,
    onEdit,
    onDelete,
}: {
    season: Season
    loads: MonthLoad[]
    thisMonth: string
    onEdit: () => void
    onDelete: () => void
}) {
    const colors = colorClasses(season.color)
    const isNow = season.startMonth <= thisMonth && season.endMonth >= thisMonth
    const isPast = season.endMonth < thisMonth
    const { monthIndex, monthCount } = seasonProgress(season, thisMonth)
    const links = linkSummary(season.links)

    return (
        <li className="relative flex gap-4 pb-4 sm:gap-5">
            <span className="relative z-10 mt-5 grid h-6 w-6 shrink-0 place-items-center sm:h-8 sm:w-8">
                <span
                    className={`rounded-full ring-4 ring-white ${colors.dot} ${isNow ? 'h-4 w-4' : 'h-3 w-3'} ${isPast ? 'opacity-50' : ''}`}
                />
            </span>
            <article
                className={`min-w-0 flex-1 p-5 sm:p-6 ${PANEL} ${isNow ? '!ring-2 !ring-coral-200' : ''}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="min-w-0 truncate text-lg font-semibold tracking-[-0.015em] text-neutral-950">
                                {season.name}
                            </h3>
                            {isNow && (
                                <StatusChip tone="coral">
                                    Month {monthIndex} of {monthCount}
                                </StatusChip>
                            )}
                            {season.review && (
                                <StatusChip tone="green">
                                    <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                                    Reviewed
                                </StatusChip>
                            )}
                        </div>
                        <p className="mt-0.5 text-[13px] text-neutral-500">
                            {formatMonthRange(season.startMonth, season.endMonth)} · {monthCount} month
                            {monthCount === 1 ? '' : 's'}
                        </p>
                    </div>
                    <DropdownMenu
                        align="right"
                        trigger={<MoreButton label={`${season.name} options`} />}
                        items={[
                            { label: 'Edit season', icon: 'fa-solid fa-pen', onClick: onEdit },
                            'divider',
                            { label: 'Delete season', icon: 'fa-solid fa-trash', danger: true, onClick: onDelete },
                        ]}
                    />
                </div>

                {season.focus && (
                    <p className="mt-3 text-[15px] leading-relaxed text-neutral-700">{season.focus}</p>
                )}

                {isNow && (
                    <div className="mt-4 flex gap-1" aria-label={`Month ${monthIndex} of ${monthCount}`}>
                        {Array.from({ length: monthCount }, (_, i) => (
                            <span
                                key={i}
                                className={`h-1.5 flex-1 rounded-full ${i < monthIndex ? colors.dot : 'bg-neutral-200'}`}
                            />
                        ))}
                    </div>
                )}

                {season.intent.length > 0 && (
                    <ul className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
                        {season.intent.map((intent) => (
                            <li key={intent.pillar} className="flex items-start gap-3 py-2.5">
                                <PillarTile pillar={intent.pillar} size="sm" />
                                <div className="min-w-0 pt-0.5">
                                    <p className="text-[13px] text-neutral-500">{LIFE_PILLAR_LABELS[intent.pillar]}</p>
                                    <p className="text-[15px] text-neutral-900">{intent.text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <SeasonShape season={season} loads={loads} />

                {links.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-1.5">
                        {links.map((link) => (
                            <span
                                key={link}
                                className="inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-xs font-medium text-neutral-600"
                            >
                                <i className="fa-solid fa-link text-[10px] text-neutral-400" aria-hidden="true" />
                                {link}
                            </span>
                        ))}
                    </div>
                )}
            </article>
        </li>
    )
}
