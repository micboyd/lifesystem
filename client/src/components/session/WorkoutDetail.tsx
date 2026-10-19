import { BringChecklist } from '../BringList'
import PhaseHeading from '../PhaseHeading'
import { VideoButton } from '../ExerciseVideo'
import { ItemCue, LeadText, StatStrip, StepChecklist } from './SessionUI'
import { flattenPhases } from '../../lib/phases'
import { SESSION_PHASES } from '../../types'
import type { Exercise, SessionPhase, Workout, WorkoutExercise } from '../../types'

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
function formatSetsReps(e: { sets?: number; reps?: string }): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

/**
 * A strength workout laid out for the gym: stats, description, what to bring,
 * then each phase's exercises with sets × reps, cues, sub-list steps and video.
 * Shared by the planner's item drawer and the workout library's view drawer.
 */
export default function WorkoutDetail({
    workout,
    exercisesById,
    packKey,
    stepTicks,
    onToggleStep,
}: {
    workout: Workout
    exercisesById: Map<string, Exercise>
    /** Where this session's packing ticks are kept (a plan entry or the workout). */
    packKey: string
    /** Ticked sub-list steps, by the line's position across all three phases. */
    stepTicks: Record<number, number[]>
    onToggleStep: (index: number, step: number) => void
}) {
    // Pair each workout line with its resolved library exercise and its position
    // across the phases (the index step ticks are kept under, the same one the
    // logger uses), dropping any since deleted from the library.
    const lines = flattenPhases(workout)
        .map(({ phase, item }) => ({ phase, item, ex: exercisesById.get(item.exercise) }))
        .filter(
            (r): r is { phase: SessionPhase; item: WorkoutExercise; ex: Exercise } => !!r.ex
        )
        .map((r, index) => ({ ...r, index }))
    const main = lines.filter((l) => l.phase === 'main')
    const sets = main.reduce((n, { item }) => n + (item.sets && item.sets > 0 ? item.sets : 0), 0)

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
                <StatStrip
                    stats={[
                        { icon: 'fa-solid fa-dumbbell', label: 'Exercises', value: main.length },
                        ...(sets > 0
                            ? [{ icon: 'fa-solid fa-layer-group', label: 'Working sets', value: sets }]
                            : []),
                    ]}
                />
                <LeadText>{workout.description}</LeadText>
            </div>

            <BringChecklist items={workout.bring} packKey={packKey} />

            {SESSION_PHASES.map((phase) => {
                const rows = lines.filter((l) => l.phase === phase)
                if (rows.length === 0 && phase !== 'main') return null
                return (
                    <section key={phase} className="flex flex-col gap-3">
                        <PhaseHeading
                            phase={phase}
                            meta={
                                rows.length
                                    ? `${rows.length} ${rows.length === 1 ? 'exercise' : 'exercises'}`
                                    : undefined
                            }
                        />
                        {rows.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-neutral-200 px-3 py-5 text-center text-xs text-neutral-500">
                                No main-session exercises in this workout yet.
                            </p>
                        ) : (
                            <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                                {rows.map(({ item, ex, index }, n) => (
                                    <li key={index} className="flex flex-col gap-3 px-4 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-400">
                                                {n + 1}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-semibold leading-snug text-neutral-900">
                                                    {ex.name}
                                                </p>
                                                {item.rest?.trim() && (
                                                    <p className="mt-0.5 text-xs text-neutral-500">
                                                        Rest {item.rest.trim()}
                                                    </p>
                                                )}
                                            </div>
                                            {formatSetsReps(item) && (
                                                <span className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-neutral-900">
                                                    {formatSetsReps(item)}
                                                </span>
                                            )}
                                            <VideoButton url={ex.videoUrl} title={ex.name} />
                                        </div>
                                        {(item.notes || item.steps?.length) && (
                                            <div className="flex flex-col gap-3 pl-7">
                                                <ItemCue>{item.notes}</ItemCue>
                                                <StepChecklist
                                                    steps={item.steps}
                                                    ticked={stepTicks[index]}
                                                    onToggle={(step) => onToggleStep(index, step)}
                                                />
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )
            })}
        </div>
    )
}
