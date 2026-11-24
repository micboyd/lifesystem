import type { ConditioningSession } from '../../types'
import { flattenPhases } from '../../lib/phases'
import { sectionSteps } from '../../lib/repSteps'
import { hasSlot, slotLabel, timeOfDay } from '../../lib/sessionPace'
import { DoneLine, OVERLINE, RepCard, StepTimeline } from './StepList'

const PHASE_NAME: Record<string, string> = {
    warmUp: 'Warm-up',
    main: 'Main',
    coolDown: 'Cool-down',
}

/**
 * The whole cardio session as one timeline, in the Now view's style: a phase
 * heading, each section's name and slot, then its steps with their planned
 * times. Finished sections fold to one line (with Undo); finished reps fold to
 * a faded line you tap to untick; the rep you're on is the black card.
 */
export default function SessionSteps({
    session,
    counts,
    completedAt,
    onRep,
    onUndo,
}: {
    session: ConditioningSession
    counts: Record<number, number>
    completedAt: Record<number, number>
    /** A rep row tapped: tick up to it, or untick back to it. */
    onRep: (part: number, rep: number, done: boolean) => void
    /** Reopen a finished section. */
    onUndo: (part: number) => void
}) {
    const parts = flattenPhases(session)
    const current = parts.findIndex((_, k) => completedAt[k] == null)

    return (
        <div className="flex flex-col gap-7">
            {parts.map(({ phase, item }, i) => {
                const reps = sectionSteps(item)
                const finished = completedAt[i] != null
                const done = finished ? reps.length : Math.min(counts[i] ?? 0, reps.length - 1)
                const firstOfPhase = i === 0 || parts[i - 1].phase !== phase
                return (
                    <section key={i} className="flex flex-col gap-3">
                        {firstOfPhase && (
                            <p
                                className={`${OVERLINE} border-b border-neutral-100 pb-2 text-neutral-400`}
                            >
                                {PHASE_NAME[phase] ?? phase}
                            </p>
                        )}
                        <div className="flex items-baseline justify-between gap-3">
                            <h4
                                className={`min-w-0 text-[15px] font-semibold tracking-[-0.01em] ${
                                    finished ? 'text-neutral-400' : 'text-neutral-950'
                                }`}
                            >
                                {finished && (
                                    <i
                                        className="fa-solid fa-check mr-2 text-xs text-emerald-600"
                                        aria-hidden="true"
                                    />
                                )}
                                {item.name}
                            </h4>
                            {finished ? (
                                <span className="flex shrink-0 items-baseline gap-3 text-[13px] tabular-nums text-neutral-400">
                                    {timeOfDay(completedAt[i])}
                                    <button
                                        type="button"
                                        onClick={() => onUndo(i)}
                                        className="font-medium text-neutral-600 underline decoration-neutral-300 underline-offset-2"
                                    >
                                        Undo
                                    </button>
                                </span>
                            ) : (
                                <span className="shrink-0 text-[13px] tabular-nums text-neutral-400">
                                    {reps.length > 1 &&
                                        `${Math.min(counts[i] ?? 0, reps.length)}/${reps.length} · `}
                                    {hasSlot(item) ? `${slotLabel(item)} min` : ''}
                                </span>
                            )}
                        </div>

                        {!finished && (
                            <div className="flex flex-col gap-3">
                                {reps.slice(0, done).map((r) => (
                                    <DoneLine
                                        key={r.index}
                                        rep={r}
                                        onTap={() => onRep(i, r.index, true)}
                                    />
                                ))}
                                {i === current ? (
                                    <RepCard
                                        rep={reps[done]}
                                        label={
                                            reps.length > 1
                                                ? `Now · ${done + 1} of ${reps.length}`
                                                : 'Now'
                                        }
                                    />
                                ) : null}
                                <StepTimeline
                                    reps={reps.slice(i === current ? done + 1 : done)}
                                    onRep={(r) => onRep(i, r, false)}
                                />
                            </div>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
