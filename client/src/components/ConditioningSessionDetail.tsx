import { useEffect, useRef } from 'react'
import RoundCounter, { clock, roundWindows } from './RoundCounter'
import PhaseHeading, { phaseSpan } from './PhaseHeading'
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
import type { ConditioningSession, ConditioningCategory, SessionPart } from '../types'
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
 * `readOnly` mode it's a recap of what was logged. `overview` is the plan
 * before it's started: a plain list to read, with nothing to tap.
 */
export default function ConditioningSessionDetail({
    session,
    counts = {},
    onCount,
    readOnly = false,
    overview = false,
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
    /** The session as a plan to read — no progress, counters or tick boxes. */
    overview?: boolean
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

    // As each part is completed, bring the next one up so the session flows
    // down the page. Only on moving forward — an undo stays where it is.
    const items = useRef<Record<number, HTMLLIElement | null>>({})
    const lastNext = useRef(nextIndex)
    useEffect(() => {
        const prev = lastNext.current
        lastNext.current = nextIndex
        if (!logging || nextIndex <= prev) return
        items.current[nextIndex]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, [logging, nextIndex])

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
                if (overview)
                    return (
                        <section key={phase} className="flex flex-col gap-3">
                            <PhaseHeading
                                phase={phase}
                                meta={phaseSpan(rows.map(({ item }) => item))}
                            />
                            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                                {rows.map(({ item, index }, n) => (
                                    <OverviewPart
                                        key={index}
                                        part={item}
                                        number={n + 1}
                                        slot={slots[index]}
                                    />
                                ))}
                            </ul>
                        </section>
                    )
                return (
                    <PhaseTimeline
                        key={phase}
                        phase={phase}
                        meta={phaseSpan(rows.map(({ item }) => item))}
                    >
                        {rows.map(({ item: part, index: i }, n) => (
                            <TimelineItem
                                key={i}
                                itemRef={(el) => {
                                    items.current[i] = el
                                }}
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

/**
 * One part of a session in the overview: its number, name, slot and detail,
 * then any reps and steps as plain numbered lists — read, not ticked.
 */
function OverviewPart({
    part,
    number,
    slot,
}: {
    part: SessionPart
    number: number
    slot: { startMin?: number; endMin?: number }
}) {
    const reps = part.rounds ?? 0
    const one = (part.roundLabel?.trim() || 'round').toLowerCase()
    const many = one.endsWith('s') ? one : `${one}s`
    const windows = part.roundSeconds?.length
        ? roundWindows(
              reps,
              part.roundSeconds,
              part.startAtSec ?? (part.startMin !== undefined ? part.startMin * 60 : 0)
          )
        : []
    const listReps = reps > 0 && (!!part.roundDetails?.length || windows.length > 0)

    return (
        <li className="flex flex-col gap-2.5 px-4 py-3.5">
            <div className="flex items-start gap-3">
                <span className="w-4 shrink-0 pt-px text-right text-xs font-semibold tabular-nums text-neutral-400">
                    {number}
                </span>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-neutral-900">{part.name}</p>
                    {reps > 0 && !listReps && (
                        <p className="mt-0.5 text-xs text-neutral-500">
                            {reps} {reps === 1 ? one : many}
                        </p>
                    )}
                </div>
                <SlotChip slot={slot} />
            </div>
            {(part.detail || listReps || !!part.steps?.length) && (
                <div className="flex flex-col gap-2.5 pl-7">
                    {part.detail && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
                            {part.detail}
                        </p>
                    )}
                    {listReps && (
                        <div className="flex flex-col gap-2">
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                {reps} {reps === 1 ? one : many}
                            </p>
                            <ol className="flex flex-col gap-1.5">
                                {Array.from({ length: reps }, (_, i) => (
                                    <li
                                        key={i}
                                        className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-2.5 text-sm text-neutral-700"
                                    >
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold tabular-nums text-neutral-500 ring-1 ring-inset ring-neutral-200">
                                            {i + 1}
                                        </span>
                                        <span className="min-w-0 flex-1 leading-snug">
                                            {part.roundDetails?.[i] ??
                                                `${part.roundLabel?.trim() || 'Round'} ${i + 1}`}
                                        </span>
                                        {windows[i] && (
                                            <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                                                {clock(windows[i][0])}–{clock(windows[i][1])}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    )}
                    <StepChecklist steps={part.steps} />
                </div>
            )}
        </li>
    )
}
