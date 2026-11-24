import { useEffect, useRef } from 'react'
import RoundCounter from './RoundCounter'
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
import { driftLabel, driftTone, hasSlot, minutesLabel, slotLabel, timeOfDay, type Slot } from '../lib/sessionPace'
import { SESSION_PHASES, SESSION_PHASE_LABELS } from '../types'
import { sectionLines } from '../lib/repSteps'
import { OVERLINE } from './session/StepList'
import type { ConditioningSession, ConditioningCategory, SessionPart } from '../types'
import { flattenPhases } from '../lib/phases'
import { paceOf } from '../lib/sessionPace'
import { findGroup, useConditioningGroups } from '../lib/conditioningGroups'
import { GroupChip } from './ConditioningGroupsDrawer'

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
    stats = true,
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
    /** The headline tiles (duration · parts · type). Off where the drawer already
     *  says them, as the planner's meta line does. */
    stats?: boolean
}) {
    const indexed = flattenPhases(session).map((r, index) => ({ ...r, index }))
    const group = findGroup(useConditioningGroups(), session.group)
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

            {(stats || session.purpose) && (
            <div className="flex flex-col gap-5">
                {stats && !logging && (
                <StatStrip
                    stats={[
                        {
                            icon: 'fa-regular fa-clock',
                            label: 'Duration',
                            value: minutesLabel(session.duration),
                        },
                        {
                            icon: 'fa-solid fa-list-ol',
                            label: 'Parts',
                            value: indexed.length,
                        },
                        {
                            icon: 'fa-solid fa-heart-pulse',
                            label: 'Type',
                            value: (
                                <span className="inline-flex flex-wrap gap-1.5">
                                    {group && <GroupChip group={group} />}
                                    <CategoryChip category={session.category} />
                                </span>
                            ),
                        },
                    ]}
                />
                )}
                <LeadText>{session.purpose}</LeadText>
            </div>
            )}

            {!!session.helpers?.length && (
                <section className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-4">
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
                if (logging)
                    return (
                        <section key={phase} className="flex flex-col gap-3">
                            <PhaseHeading
                                phase={phase}
                                meta={phaseSpan(rows.map(({ item }) => item))}
                            />
                            <ol className="flex flex-col gap-2">
                                {rows.map(({ item: part, index: i }) => (
                                    <LogPart
                                        key={i}
                                        itemRef={(el) => {
                                            items.current[i] = el
                                        }}
                                        part={part}
                                        slot={slots[i]}
                                        state={stateOf(i)}
                                        count={counts[i] ?? 0}
                                        completedAt={times[i]}
                                        delta={pace.delta[i]}
                                        ticks={stepTicks?.[i]}
                                        onToggleStep={
                                            onToggleStep ? (step) => onToggleStep(i, step) : undefined
                                        }
                                        onCount={(next) => {
                                            // Unticking a rep reopens a finished part.
                                            if (next < (counts[i] ?? 0) && times[i] !== null) onUndo?.(i)
                                            onCount?.(i, next)
                                        }}
                                        onComplete={() => onComplete?.(i)}
                                        onUndo={() => {
                                            onUndo?.(i)
                                            // Step back one rep so the part reopens on its last.
                                            if (part.rounds && (counts[i] ?? 0) >= part.rounds)
                                                onCount?.(i, part.rounds - 1)
                                        }}
                                    />
                                ))}
                            </ol>
                        </section>
                    )
                if (overview)
                    return (
                        <section key={phase} className="flex flex-col gap-3.5">
                            <div className="flex items-baseline justify-between gap-3 border-b border-neutral-100 pb-2">
                                <p className={`${OVERLINE} text-neutral-400`}>
                                    {SESSION_PHASE_LABELS[phase]}
                                </p>
                                <span className="text-[13px] tabular-nums text-neutral-400">
                                    {phaseSpan(rows.map(({ item }) => item))}
                                </span>
                            </div>
                            <ul className="flex flex-col gap-4">
                                {rows.map(({ item, index }) => (
                                    <OverviewPart key={index} part={item} slot={rows.length > 1} />
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
                                        reps={part.reps}
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
 * One part while the session is being logged. A single action per part: tap
 * each rep as you finish it (the last one finishes the part), or one Done
 * button when the part has no reps. A finished part folds to one line with its
 * time and pace, and Undo.
 */
function LogPart({
    part,
    slot,
    state,
    count,
    completedAt,
    delta,
    ticks,
    onToggleStep,
    onCount,
    onComplete,
    onUndo,
    itemRef,
}: {
    part: SessionPart
    slot: Slot
    state: ItemState
    count: number
    completedAt: number | null
    delta: number | null | undefined
    ticks?: number[]
    onToggleStep?: (step: number) => void
    onCount: (next: number) => void
    onComplete: () => void
    onUndo: () => void
    itemRef: (el: HTMLLIElement | null) => void
}) {
    const done = state === 'done'
    const current = state === 'next'
    const rounds = part.rounds ?? 0
    const label = (part.roundLabel?.trim() || 'rep').toLowerCase()
    const unit = label.endsWith('s') ? label : `${label}s`
    const meta = [
        hasSlot(slot) ? `${slotLabel(slot)} min` : null,
        rounds > 1 && !done ? `${Math.min(count, rounds)} of ${rounds} ${unit}` : null,
    ]
        .filter(Boolean)
        .join(' · ')

    return (
        <li
            ref={itemRef}
            className={`scroll-mt-24 rounded-xl border transition-colors ${
                done
                    ? 'border-transparent bg-neutral-50'
                    : current
                      ? 'border-neutral-300 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white'
            }`}
        >
            <div className="flex items-center gap-3 px-4 py-3">
                <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                        done
                            ? 'bg-emerald-600 text-white'
                            : current
                              ? 'bg-neutral-900'
                              : 'ring-1 ring-inset ring-neutral-300'
                    }`}
                    aria-hidden="true"
                >
                    {done ? (
                        <i className="fa-solid fa-check text-[11px]" />
                    ) : current ? (
                        <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                </span>
                <div className="min-w-0 flex-1">
                    <p
                        className={`truncate text-[15px] font-semibold leading-snug ${
                            done ? 'text-neutral-500' : 'text-neutral-900'
                        }`}
                    >
                        {part.name}
                    </p>
                    {done && completedAt !== null ? (
                        <p className="mt-0.5 text-xs text-neutral-500">
                            Done {timeOfDay(completedAt)}
                            {delta != null && (
                                <span
                                    className={`ml-1.5 font-semibold ${
                                        {
                                            on: 'text-emerald-700',
                                            behind: 'text-amber-700',
                                            ahead: 'text-sky-700',
                                        }[driftTone(delta)]
                                    }`}
                                >
                                    · {driftLabel(delta)}
                                </span>
                            )}
                        </p>
                    ) : (
                        meta && <p className="mt-0.5 text-xs tabular-nums text-neutral-500">{meta}</p>
                    )}
                </div>
                {done && (
                    <button
                        type="button"
                        onClick={onUndo}
                        className="-my-2 h-10 shrink-0 rounded-lg px-3 text-xs font-semibold text-neutral-500 transition-colors hover:bg-white hover:text-neutral-800"
                    >
                        Undo
                    </button>
                )}
            </div>

            {!done && (
                <div className="flex flex-col gap-3 px-4 pb-4">
                    {part.detail && (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
                            {part.detail}
                        </p>
                    )}
                    <StepChecklist steps={part.steps} ticked={ticks} onToggle={onToggleStep} />
                    {rounds > 0 ? (
                        <RoundCounter
                            target={rounds}
                            label={part.roundLabel}
                            details={part.roundDetails}
                            reps={part.reps}
                            seconds={part.roundSeconds}
                            startAtSec={
                                part.startAtSec ??
                                (part.startMin !== undefined ? part.startMin * 60 : undefined)
                            }
                            done={count}
                            onChange={onCount}
                            active={current}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={onComplete}
                            className={`h-12 w-full rounded-lg text-sm font-semibold transition-colors ${
                                current
                                    ? 'bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-700'
                                    : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                        >
                            <i className="fa-solid fa-check mr-2 text-xs" aria-hidden="true" />
                            Done
                        </button>
                    )}
                </div>
            )}
        </li>
    )
}

/**
 * One section of a session in the overview, kept short: its name and slot,
 * then a line per run of identical reps — "3× Run 4 min (7.2 km/h) · Walk 1:30".
 * The full step-by-step is in the logger.
 */
function OverviewPart({ part, slot }: { part: SessionPart; slot: boolean }) {
    const lines = sectionLines(part)
    return (
        <li className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 text-[15px] font-semibold tracking-[-0.01em] text-neutral-950">
                    {part.name}
                </p>
                {slot && hasSlot(part) && (
                    <span className="shrink-0 text-[13px] tabular-nums text-neutral-400">
                        {slotLabel(part)}
                    </span>
                )}
            </div>
            {lines.map((l, k) => (
                <p key={k} className="text-sm leading-snug text-neutral-600">
                    {l}
                </p>
            ))}
            {part.detail && (
                <p className="line-clamp-2 text-[13px] leading-snug text-neutral-400">{part.detail}</p>
            )}
        </li>
    )
}
