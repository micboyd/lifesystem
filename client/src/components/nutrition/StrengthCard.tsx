import { Link } from 'react-router-dom'
import {
    PERFORMANCE_LABELS,
    COMPARE_WINDOW_DAYS,
    type LiftTrend,
    type PerformanceStatus,
    type StrengthSummary,
} from '../../lib/strengthTrend'

/**
 * Whether the training is holding up while the weight comes off.
 *
 * Kept deliberately small: this is the one signal that says the loss is coming
 * from fat rather than muscle, and it needs exactly one line per lift to say it.
 * Anything more would be a second workout dashboard living inside the food tab,
 * and Fitness already has one — hence the link out rather than more detail here.
 */

const STATUS_TONE: Record<PerformanceStatus, string> = {
    improving: 'text-emerald-600',
    stable: 'text-neutral-700',
    declining: 'text-amber-600',
    'insufficient-data': 'text-neutral-300',
}

const ARROW: Record<PerformanceStatus, string> = {
    improving: '↑',
    stable: '↔',
    declining: '↓',
    'insufficient-data': '—',
}

function LiftRow({ lift }: { lift: LiftTrend }) {
    const known = lift.status !== 'insufficient-data'
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5">
            <span className="truncate text-[13px] text-neutral-600">{lift.label}</span>
            <span className="shrink-0 text-right tabular-nums">
                <span className={`text-sm font-bold ${STATUS_TONE[lift.status]}`}>
                    {ARROW[lift.status]}
                    {known && lift.changePct !== null && (
                        <span className="ml-1">
                            {lift.changePct > 0 ? '+' : lift.changePct < 0 ? '−' : ''}
                            {Math.abs(lift.changePct).toFixed(0)}%
                        </span>
                    )}
                </span>
                {!known && (
                    <span className="ml-1 text-[11px] text-neutral-300">
                        {lift.recentSessions + lift.previousSessions === 0
                            ? 'no sessions'
                            : 'too few sessions'}
                    </span>
                )}
            </span>
        </div>
    )
}

export default function StrengthCard({ summary }: { summary: StrengthSummary }) {
    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Strength</h3>
                <Link
                    to="/fitness"
                    className="text-[11px] font-semibold text-neutral-500 underline underline-offset-2"
                >
                    Open Fitness
                </Link>
            </div>

            {summary.judged === 0 ? (
                <p className="mt-3 text-sm text-neutral-400">
                    No data yet. Log working weights and reps against your main lifts and this fills
                    in after a few weeks.
                </p>
            ) : (
                <>
                    <p className="mt-1 flex items-baseline gap-2">
                        <span
                            className={`text-xl font-bold tracking-tight ${STATUS_TONE[summary.overall]}`}
                        >
                            {PERFORMANCE_LABELS[summary.overall]}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                            last {COMPARE_WINDOW_DAYS / 7} weeks vs the {COMPARE_WINDOW_DAYS / 7}{' '}
                            before
                        </span>
                    </p>
                    <div className="mt-3 divide-y divide-neutral-100 border-t border-neutral-100 pt-1">
                        {summary.lifts.map((lift) => (
                            <LiftRow key={lift.lift} lift={lift} />
                        ))}
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
                        Estimated from your logged working sets. Holding steady through a deficit is
                        a good outcome, not a flat one.
                    </p>
                </>
            )}
        </div>
    )
}
