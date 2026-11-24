import type { RepStep } from '../../lib/repSteps'
import { driftLabel, driftTone } from '../../lib/sessionPace'
import { DoneLine, OVERLINE, RepCard, StepTimeline } from './StepList'

/**
 * Cardio while you're doing it, as one step list for the whole session: what's
 * done folded to faded lines, the rep you're on picked out in a black card —
 * "Run for 3 min" at 11:30, then "Walk for 1:30" at 14:30 — then every step
 * still to come through to the cool-down. The times are the plan's, minutes
 * into the session; nothing ticks on screen.
 */

export interface NowState {
    /** "Warm-up", "Main", "Cool-down". */
    phase: string
    /** The section's name, e.g. "Run-walk intervals". */
    part: string
    partIndex: number
    partCount: number
    /** What one rep is called, "Interval". */
    repLabel: string
    /** The section's reps as steps. */
    reps: RepStep[]
    /** How many reps are done — the next one is the one you're on. */
    done: number
    /** Session drift in minutes (+ behind), once two parts are in. */
    drift: number | null
    /** Sections already finished, in order (the warm-up, once it's done). */
    before: { name: string; reps: RepStep[] }[]
    /** Sections still to come after this one. */
    upcoming: { name: string; phase: string; reps: RepStep[] }[]
}

export const DRIFT_TONE: Record<'on' | 'behind' | 'ahead', string> = {
    on: 'bg-emerald-50 text-emerald-700',
    behind: 'bg-amber-50 text-amber-700',
    ahead: 'bg-sky-50 text-sky-700',
}

export default function NowView({ now }: { now: NowState }) {
    const current = now.reps[now.done]
    if (!current) return null
    const many = now.reps.length > 1
    const label = now.repLabel.toLowerCase()
    const later = now.reps.slice(now.done + 1)

    return (
        <div className="flex flex-col gap-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={`${OVERLINE} text-neutral-400`}>
                        {now.phase} · {now.partIndex + 1}/{now.partCount}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold leading-tight tracking-[-0.02em] text-neutral-950">
                        {now.part}
                    </h3>
                    {many && (
                        <p className="mt-0.5 text-sm tabular-nums text-neutral-500">
                            {now.repLabel} {now.done + 1} of {now.reps.length}
                            {now.done > 0 && (
                                <span className="text-neutral-400"> · {now.done} done</span>
                            )}
                        </p>
                    )}
                </div>
                {now.drift != null && (
                    <span
                        className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${DRIFT_TONE[driftTone(now.drift)]}`}
                    >
                        {driftLabel(now.drift)}
                    </span>
                )}
            </header>

            {(now.before.length > 0 || now.done > 0) && (
                <div className="flex flex-col gap-2">
                    {now.before.map((b, n) =>
                        b.reps.length === 1 ? (
                            <DoneLine key={n} rep={b.reps[0]} prefix={b.name} />
                        ) : (
                            <DoneLine
                                key={n}
                                rep={{ index: 0, steps: [b.reps[0].steps[0]] }}
                                prefix={`${b.name} · ${b.reps.length} ${label}s`}
                            />
                        )
                    )}
                    {now.reps.slice(0, now.done).map((r) => (
                        <DoneLine key={`d${r.index}`} rep={r} />
                    ))}
                </div>
            )}

            <RepCard
                rep={current}
                label={`Now${many ? ` · ${now.repLabel} ${now.done + 1}` : ''}`}
            />

            {later.length > 0 && (
                <section>
                    <p className={`${OVERLINE} mb-3 text-neutral-400`}>
                        Then · {later.length} more {later.length === 1 ? label : `${label}s`}
                    </p>
                    <StepTimeline reps={later} />
                </section>
            )}

            {now.upcoming.map((u, n) => (
                <section key={n}>
                    <p className={`${OVERLINE} mb-3 text-neutral-400`}>
                        {u.phase} · {u.name}
                    </p>
                    <StepTimeline reps={u.reps} />
                </section>
            ))}
        </div>
    )
}
