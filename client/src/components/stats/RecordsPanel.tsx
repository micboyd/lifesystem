import { useMemo } from 'react'
import Badge from '../Badge'
import { Card } from '../Card'
import EmptyState from '../EmptyState'
import StatTile from '../StatTile'
import { personalBests, type PersonalBest } from '../../lib/exerciseProgress'
import {
    strengthSummary,
    COMPARE_WINDOW_DAYS,
    PERFORMANCE_LABELS,
    type LiftTrend,
    type PerformanceStatus,
} from '../../lib/strengthTrend'
import type { WorkoutLog } from '../../types'
import { kg, longDate, plural, setLabel, signedPct } from './format'

/** Badge colours follow the verdict, not the number. */
const STATUS_VARIANT: Record<PerformanceStatus, 'success' | 'outline' | 'danger'> = {
    improving: 'success',
    stable: 'outline',
    declining: 'danger',
    'insufficient-data': 'outline',
}

/** How many current bests the board lists before it stops. */
const BOARD_LIMIT = 12

/**
 * The record book: how the big lifts are trending, and what you've actually beaten.
 *
 * The key-lift table is the same reading the nutrition module uses to tell a
 * recomposition from a stall, shown here in its own right. Underneath it, the
 * board — because a six-week trend is the useful number and a personal best is
 * the one anybody actually wants to look at.
 */
export default function RecordsPanel({
    logs,
    since,
    today,
    rangeLabel,
}: {
    logs: WorkoutLog[]
    since: string
    today: string
    rangeLabel: string
}) {
    const summary = useMemo(() => strengthSummary(logs, today), [logs, today])
    const bests = useMemo(() => personalBests(logs), [logs])

    /** The current best for every exercise, most recently set first. */
    const board = useMemo(() => {
        const current = new Map<string, PersonalBest>()
        for (const best of bests) current.set(best.key, best)
        return [...current.values()].sort((a, b) => b.date.localeCompare(a.date))
    }, [bests])

    /** Bests actually beaten inside the range — the first time doesn't count. */
    const beaten = useMemo(
        () =>
            bests
                .filter((b) => b.previousKg !== null && (!since || b.date >= since))
                .sort((a, b) => b.date.localeCompare(a.date)),
        [bests, since]
    )

    if (logs.length === 0 || board.length === 0) {
        return (
            <EmptyState
                icon="fa-solid fa-trophy"
                title="No records yet"
                description="Records come from logged working sets — a weight and a rep count. Log a couple of sessions and the board fills itself in, starting with everything you lift for the first time."
            />
        )
    }

    const weeks = COMPARE_WINDOW_DAYS / 7

    return (
        <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile
                    label="Overall"
                    value={PERFORMANCE_LABELS[summary.overall]}
                    sub={
                        summary.judged === 0
                            ? `Needs 2 sessions of a lift in each ${weeks}-week window`
                            : `Across ${plural(summary.judged, 'key lift')} with enough data`
                    }
                    tone={
                        summary.overall === 'improving'
                            ? 'good'
                            : summary.overall === 'declining'
                              ? 'bad'
                              : 'neutral'
                    }
                />
                <StatTile
                    label={`PRs · ${rangeLabel.toLowerCase()}`}
                    value={String(beaten.length)}
                    sub={
                        beaten.length > 0
                            ? `Last one ${longDate(beaten[0].date)}`
                            : 'Nothing beaten in this range'
                    }
                    tone={beaten.length > 0 ? 'good' : 'neutral'}
                />
                <StatTile
                    label="Movements tracked"
                    value={String(board.length)}
                    sub="Exercises with a recorded best"
                />
                <StatTile
                    label="Newest best"
                    value={board.length ? kg(board[0].weightKg) : '—'}
                    sub={board.length ? `${board[0].name} · ${longDate(board[0].date)}` : undefined}
                />
            </div>

            <Card hover={false} className="flex flex-col gap-4">
                <div>
                    <h3 className="text-sm font-bold text-neutral-900">Key lifts</h3>
                    <p className="text-xs text-neutral-500">
                        The last {weeks} weeks against the {weeks} before, by estimated one-rep max.
                        Holding through a deficit is the good outcome, not the boring one.
                    </p>
                </div>
                <div className="flex flex-col gap-1.5">
                    {summary.lifts.map((lift) => (
                        <LiftRow key={lift.lift} lift={lift} />
                    ))}
                </div>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card hover={false} className="flex flex-col gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-neutral-900">Personal bests beaten</h3>
                        <p className="text-xs text-neutral-500">
                            {rangeLabel} — a heavier top set than you had ever done before.
                        </p>
                    </div>
                    {beaten.length === 0 ? (
                        <p className="text-sm text-neutral-400">
                            Nothing beaten in this range. Records come in bursts; a quiet stretch
                            after a run of them is normal.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {beaten.slice(0, BOARD_LIMIT).map((best) => (
                                <div
                                    key={`${best.key}-${best.date}`}
                                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-1 py-1 text-sm odd:bg-neutral-50/70"
                                >
                                    <span className="min-w-0 truncate font-semibold text-neutral-900">
                                        {best.name}
                                    </span>
                                    <span className="flex items-baseline gap-2 tabular-nums">
                                        <span className="font-semibold text-neutral-900">
                                            {setLabel(best.weightKg, best.reps)}
                                        </span>
                                        <span className="text-[11px] text-emerald-600">
                                            +{Number((best.weightKg - best.previousKg!).toFixed(2))} kg
                                        </span>
                                        <span className="text-[11px] text-neutral-400">
                                            {longDate(best.date)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                <Card hover={false} className="flex flex-col gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-neutral-900">Current bests</h3>
                        <p className="text-xs text-neutral-500">
                            The heaviest set on record for every movement, newest first.
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {board.slice(0, BOARD_LIMIT).map((best) => (
                            <div
                                key={best.key}
                                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-lg px-1 py-1 text-sm odd:bg-neutral-50/70"
                            >
                                <span className="min-w-0 truncate font-semibold text-neutral-900">
                                    {best.name}
                                </span>
                                <span className="flex items-baseline gap-2 tabular-nums">
                                    <span className="font-semibold text-neutral-900">
                                        {setLabel(best.weightKg, best.reps)}
                                    </span>
                                    <span className="text-[11px] text-neutral-400">
                                        {longDate(best.date)}
                                    </span>
                                </span>
                            </div>
                        ))}
                        {board.length > BOARD_LIMIT && (
                            <p className="px-1 pt-1 text-[11px] text-neutral-400">
                                {board.length - BOARD_LIMIT} more not shown.
                            </p>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    )
}

/** One key lift: where it is, which way it's going, and what it's ever done. */
function LiftRow({ lift }: { lift: LiftTrend }) {
    const judged = lift.status !== 'insufficient-data'

    return (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg px-1 py-1.5 odd:bg-neutral-50/70">
            <span className="flex min-w-0 items-baseline gap-2">
                <span className="text-sm font-semibold text-neutral-900">{lift.label}</span>
                {lift.bestKg !== null && (
                    <span className="text-[11px] tabular-nums text-neutral-400">
                        best {kg(lift.bestKg)} est.
                    </span>
                )}
            </span>
            <span className="flex items-center gap-2 tabular-nums">
                <span className="text-sm font-semibold text-neutral-900">
                    {lift.recentKg !== null
                        ? kg(lift.recentKg)
                        : lift.latest
                          ? kg(lift.latest.estimatedMaxKg)
                          : '—'}
                </span>
                {judged && lift.changePct !== null && (
                    <span
                        className={`text-[11px] ${
                            lift.status === 'improving'
                                ? 'text-emerald-600'
                                : lift.status === 'declining'
                                  ? 'text-red-600'
                                  : 'text-neutral-400'
                        }`}
                    >
                        {signedPct(lift.changePct)}
                    </span>
                )}
                <Badge variant={STATUS_VARIANT[lift.status]}>
                    {judged
                        ? PERFORMANCE_LABELS[lift.status]
                        : lift.latest
                          ? 'Too few sessions'
                          : 'Not logged'}
                </Badge>
            </span>
        </div>
    )
}
