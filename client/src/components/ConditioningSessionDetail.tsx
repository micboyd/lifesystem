import RoundCounter from './RoundCounter'
import { phaseSpan } from './PhaseHeading'
import {
    ItemDetail,
    LeadText,
    NoteBlock,
    PhaseTimeline,
    StatStrip,
    StepChecklist,
    TimelineItem,
    type ItemState,
} from './session/SessionUI'
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
 * The body of a conditioning session — its headline numbers and purpose, any
 * setup, then the warm-up, main session and cool-down as a timeline of parts
 * (each with its planned slot, any sub-list of steps and any tap-to-count rep
 * counter), and how to use it. Shared by the Session Library view drawer, the
 * weekly planner's detail drawer and the Sessions log recap so all three render
 * identically.
 *
 * Everything per part is keyed by the part's position across all three phases,
 * warm-up first. The parent owns it: `counts` (rounds tapped), `completedAt`
 * (when each part's Completed button was pressed, ms) and `stepTicks` (which of
 * a part's steps are ticked). With `onComplete` the session is being logged —
 * each part gets a Completed button and a pace banner sits on top; in
 * `readOnly` mode it's a recap of what was logged.
 */
export default function ConditioningSessionDetail({
    session,
    counts = {},
    onCount,
    readOnly = false,
    completedAt,
    onComplete,
    onUndo,
    stepTicks,
    onToggleStep,
}: {
    session: ConditioningSession
    counts?: Record<number, number>
    onCount?: (index: number, next: number) => void
    readOnly?: boolean
    completedAt?: Record<number, number>
    onComplete?: (index: number) => void
    onUndo?: (index: number) => void
    stepTicks?: Record<number, number[]>
    onToggleStep?: (index: number, step: number) => void
}) {
    const indexed = flattenPhases(session).map((r, index) => ({ ...r, index }))
    const slots = indexed.map(({ item }) => ({ startMin: item.startMin, endMin: item.endMin }))
    const logging = !!onComplete && !readOnly
    const times = indexed.map(({ index }) => completedAt?.[index] ?? null)
    const pace = paceOf(slots, times)
    // The part to do next: the first not yet completed.
    const nextIndex = logging ? times.findIndex((t) => t === null) : -1

    function stateOf(i: number): ItemState {
        if (times[i] !== null) return 'done'
        if (!logging) return 'plain'
        return i === nextIndex ? 'next' : 'todo'
    }

    return (
        <div className="flex flex-col gap-8">
            {logging && (
                <PaceBanner
                    slots={slots}
                    completedAt={times}
                    names={indexed.map(({ item }) => item.name)}
                />
            )}

            <div className="flex flex-col gap-5">
                <StatStrip
                    stats={[
                        {
                            icon: 'fa-regular fa-clock',
                            label: 'Duration',
                            value: `${session.duration} min`,
                        },
                        {
                            icon: 'fa-solid fa-list-ol',
                            label: 'Parts',
                            value: indexed.length,
                        },
                        {
                            icon: 'fa-solid fa-heart-pulse',
                            label: 'Type',
                            value: <CategoryChip category={session.category} />,
                        },
                    ]}
                />
                <LeadText>{session.purpose}</LeadText>
            </div>

            {!!session.helpers?.length && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-4">
                    <p className="mb-2.5 inline-flex items-center gap-2 text-sm font-semibold text-neutral-900">
                        <i className="fa-solid fa-flag text-xs text-amber-600" aria-hidden="true" />
                        Set up first
                    </p>
                    <ul className="flex flex-col gap-2 text-sm leading-relaxed text-neutral-700">
                        {session.helpers.map((h, i) => (
                            <li key={i} className="flex gap-2.5">
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
                    <PhaseTimeline
                        key={phase}
                        phase={phase}
                        meta={phaseSpan(rows.map(({ item }) => item))}
                    >
                        {rows.map(({ item: part, index: i }, n) => (
                            <TimelineItem
                                key={i}
                                number={n + 1}
                                state={stateOf(i)}
                                last={n === rows.length - 1}
                                title={part.name}
                                aside={<SlotChip slot={slots[i]} />}
                            >
                                <ItemDetail>{part.detail}</ItemDetail>
                                <StepChecklist
                                    steps={part.steps}
                                    ticked={stepTicks?.[i]}
                                    onToggle={
                                        onToggleStep && !readOnly
                                            ? (step) => onToggleStep(i, step)
                                            : undefined
                                    }
                                />
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
                            </TimelineItem>
                        ))}
                    </PhaseTimeline>
                )
            })}

            {session.howToUse && (
                <NoteBlock icon="fa-regular fa-lightbulb" title="How to use">
                    {session.howToUse}
                </NoteBlock>
            )}
        </div>
    )
}
