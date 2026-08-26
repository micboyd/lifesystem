import RoundCounter from './RoundCounter'
import type { ConditioningSession, ConditioningCategory } from '../types'

const CATEGORY_META: Record<ConditioningCategory, string> = {
    HIIT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    Cardio: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Endurance: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    Mobility: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Recovery: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function CategoryChip({ category }: { category: ConditioningCategory }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${CATEGORY_META[category]}`}
        >
            {category}
        </span>
    )
}

/**
 * The read-only body of a conditioning session — category, purpose, ordered
 * parts (each with its tap-to-count rep counter) and how-to-use. Shared by the
 * Session Library view drawer, the weekly planner's detail drawer and the
 * Sessions log recap so all three render identically. The parent owns the
 * per-part `counts` so completed reps can be persisted when a planned session is
 * marked done; in `readOnly` mode the counts are a recap and the tap controls go.
 */
export default function ConditioningSessionDetail({
    session,
    counts = {},
    onCount,
    readOnly = false,
}: {
    session: ConditioningSession
    counts?: Record<number, number>
    onCount?: (index: number, next: number) => void
    readOnly?: boolean
}) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <CategoryChip category={session.category} />
                <span className="text-sm text-neutral-500">{session.duration} min</span>
            </div>

            {session.purpose && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Purpose
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{session.purpose}</p>
                </section>
            )}

            {session.parts.length > 0 && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Session parts
                    </p>
                    <ol className="flex flex-col gap-3">
                        {session.parts.map((part, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <div className="min-w-0 flex-1 pt-0.5">
                                    <p className="font-semibold text-neutral-900">{part.name}</p>
                                    {part.detail && (
                                        <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                            {part.detail}
                                        </p>
                                    )}
                                    {!!part.rounds && (
                                        <RoundCounter
                                            target={part.rounds}
                                            label={part.roundLabel}
                                            details={part.roundDetails}
                                            seconds={part.roundSeconds}
                                            startAtSec={part.startAtSec}
                                            done={counts[i] ?? 0}
                                            onChange={(next) => onCount?.(i, next)}
                                            readOnly={readOnly}
                                        />
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {session.howToUse && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        How to use
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{session.howToUse}</p>
                </section>
            )}
        </div>
    )
}
