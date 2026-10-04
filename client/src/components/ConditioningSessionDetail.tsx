import RoundCounter from './RoundCounter'
import PhaseHeading, { phaseSpan } from './PhaseHeading'
import { CompleteButton, PaceBanner, SlotChip } from './SessionPace'
import { SESSION_PHASES } from '../types'
import type { ConditioningSession, ConditioningCategory } from '../types'
import { flattenPhases } from '../lib/phases'
import { paceOf } from '../lib/sessionPace'

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
 * The body of a conditioning session — category, purpose, its warm-up, main
 * session and cool-down parts (each with its planned slot and any tap-to-count
 * rep counter) and how-to-use. Shared by the Session Library view drawer, the
 * weekly planner's detail drawer and the Sessions log recap so all three render
 * identically.
 *
 * Everything per part is keyed by the part's position across all three phases,
 * warm-up first. The parent owns it: `counts` (rounds tapped) and `completedAt`
 * (when each part's Completed button was pressed, ms). With `onComplete` the
 * session is being logged — each part gets a Completed button and a pace banner
 * sits on top; in `readOnly` mode it's a recap of what was logged.
 */
export default function ConditioningSessionDetail({
    session,
    counts = {},
    onCount,
    readOnly = false,
    completedAt,
    onComplete,
    onUndo,
}: {
    session: ConditioningSession
    counts?: Record<number, number>
    onCount?: (index: number, next: number) => void
    readOnly?: boolean
    completedAt?: Record<number, number>
    onComplete?: (index: number) => void
    onUndo?: (index: number) => void
}) {
    const indexed = flattenPhases(session).map((r, index) => ({ ...r, index }))
    const slots = indexed.map(({ item }) => ({ startMin: item.startMin, endMin: item.endMin }))
    const logging = !!onComplete && !readOnly
    const times = indexed.map(({ index }) => completedAt?.[index] ?? null)
    const pace = paceOf(slots, times)
    // The part to do next: the first not yet completed.
    const nextIndex = logging ? times.findIndex((t) => t === null) : -1

    return (
        <div className="flex flex-col gap-6">
            {logging && (
                <PaceBanner
                    slots={slots}
                    completedAt={times}
                    names={indexed.map(({ item }) => item.name)}
                />
            )}

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

            {!!session.helpers?.length && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
                    <p className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-neutral-900">
                        <i className="fa-solid fa-flag text-amber-600" aria-hidden="true" />
                        Helpers
                    </p>
                    <ul className="flex flex-col gap-1.5 text-sm text-neutral-700">
                        {session.helpers.map((h, i) => (
                            <li key={i} className="flex gap-2">
                                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                                <span>{h}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {SESSION_PHASES.map((phase) => {
                const rows = indexed.filter((r) => r.phase === phase)
                if (rows.length === 0) return null
                return (
                    <section key={phase}>
                        <PhaseHeading
                            phase={phase}
                            meta={phaseSpan(rows.map(({ item }) => item))}
                            className="mb-3"
                        />
                        <ol className="flex flex-col gap-3">
                            {rows.map(({ item: part, index: i }, n) => (
                                <li
                                    key={i}
                                    className={`flex gap-3 text-sm ${
                                        logging
                                            ? `rounded-2xl border p-3 ${
                                                  i === nextIndex
                                                      ? 'border-coral-200 ring-1 ring-coral-100'
                                                      : 'border-neutral-200'
                                              }`
                                            : ''
                                    }`}
                                >
                                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                        {n + 1}
                                    </span>
                                    <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
                                        <div>
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-semibold text-neutral-900">
                                                    {part.name}
                                                </p>
                                                <SlotChip slot={slots[i]} />
                                            </div>
                                            {part.detail && (
                                                <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                                    {part.detail}
                                                </p>
                                            )}
                                        </div>
                                        {!!part.rounds && (
                                            <RoundCounter
                                                target={part.rounds}
                                                label={part.roundLabel}
                                                details={part.roundDetails}
                                                seconds={part.roundSeconds}
                                                startAtSec={
                                                    part.startAtSec ??
                                                    (part.startMin !== undefined
                                                        ? part.startMin * 60
                                                        : undefined)
                                                }
                                                done={counts[i] ?? 0}
                                                onChange={(next) => onCount?.(i, next)}
                                                readOnly={readOnly}
                                            />
                                        )}
                                        {(logging || times[i] !== null) && (
                                            <CompleteButton
                                                completedAt={times[i]}
                                                delta={pace.delta[i]}
                                                isNext={i === nextIndex}
                                                readOnly={!logging}
                                                onComplete={() => onComplete?.(i)}
                                                onUndo={() => onUndo?.(i)}
                                            />
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    </section>
                )
            })}

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
