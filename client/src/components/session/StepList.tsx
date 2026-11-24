import type { ReactNode } from 'react'
import { mark, type RepStep, type Step } from '../../lib/repSteps'

/**
 * Cardio steps as a timeline — the planned time, a dot on a hairline, then
 * "Run for 3 min" and its numbers. Shared by the Now view and the whole-session
 * list, so the two read the same.
 */

export const OVERLINE = 'text-[10.5px] font-semibold uppercase tracking-[0.16em]'

/** One step. `dark` is the rep you're on, set white on black. */
export function StepRow({
    step,
    last,
    dark = false,
    onClick,
    label,
}: {
    step: Step
    last: boolean
    dark?: boolean
    /** Makes the row a button, e.g. to tick up to it. */
    onClick?: () => void
    label?: string
}) {
    const facts = step.facts.map((f) => f.text).join(' · ')
    const Row = onClick ? 'button' : 'div'
    return (
        <li>
            <Row
                {...(onClick ? { type: 'button' as const, onClick, 'aria-label': label } : {})}
                className={`grid w-full grid-cols-[2.75rem_0.75rem_1fr] gap-x-2.5 text-left ${onClick ? 'active:opacity-60' : ''}`}
            >
                <span
                    className={`text-right text-[13px] tabular-nums tracking-tight ${
                        dark
                            ? 'pt-[5px] font-bold text-white'
                            : 'pt-[3px] font-medium text-neutral-400'
                    }`}
                >
                    {step.at !== undefined ? mark(step.at) : ''}
                </span>
                <span className="relative flex justify-center" aria-hidden="true">
                    <span
                        className={`relative z-10 h-1.5 w-1.5 rounded-full ${dark ? 'mt-[11px]' : 'mt-[9px]'} ${
                            step.rest
                                ? dark
                                    ? 'bg-emerald-400'
                                    : 'bg-emerald-400/70'
                                : dark
                                  ? 'bg-white'
                                  : 'bg-neutral-300'
                        }`}
                    />
                    {!last && (
                        <span
                            className={`absolute bottom-0 top-3 w-px ${dark ? 'bg-white/15' : 'bg-neutral-200'}`}
                        />
                    )}
                </span>
                <div className={last ? '' : dark ? 'pb-4' : 'pb-3'}>
                    <p
                        className={
                            dark
                                ? `text-[1.3rem] font-semibold leading-snug tracking-[-0.015em] ${step.rest ? 'text-emerald-300' : 'text-white'}`
                                : `text-[15px] font-medium leading-snug tracking-[-0.005em] ${step.rest ? 'text-neutral-500' : 'text-neutral-900'}`
                        }
                    >
                        {step.phrase}
                    </p>
                    {facts && (
                        <p
                            className={`tabular-nums ${dark ? 'mt-0.5 text-sm text-white/55' : 'text-[13px] text-neutral-400'}`}
                        >
                            {facts}
                        </p>
                    )}
                    {step.note && (
                        <p
                            className={`mt-0.5 ${dark ? 'text-sm text-white/45' : 'text-[13px] text-neutral-400'}`}
                        >
                            {step.note}
                        </p>
                    )}
                </div>
            </Row>
        </li>
    )
}

/** The rep you're on: a black card with its steps. */
export function RepCard({ rep, label }: { rep: RepStep; label: ReactNode }) {
    return (
        <section
            className="rounded-xl bg-neutral-950 px-4 pb-4 pt-3.5 text-white"
            aria-live="polite"
        >
            <p className={`${OVERLINE} text-white/40`}>{label}</p>
            <ol className="mt-3">
                {rep.steps.map((s, k) => (
                    <StepRow key={k} step={s} last={k === rep.steps.length - 1} dark />
                ))}
            </ol>
        </section>
    )
}

/** Reps as a plain timeline; `onRep` makes each row tappable. */
export function StepTimeline({ reps, onRep }: { reps: RepStep[]; onRep?: (rep: number) => void }) {
    return (
        <ol>
            {reps.flatMap((r, n) =>
                r.steps.map((s, k) => (
                    <StepRow
                        key={`${r.index}-${k}`}
                        step={s}
                        last={n === reps.length - 1 && k === r.steps.length - 1}
                        {...(onRep
                            ? { onClick: () => onRep(r.index), label: `Tick up to ${s.phrase}` }
                            : {})}
                    />
                ))
            )}
        </ol>
    )
}

/** A finished rep (or section) on one faded line; `onTap` makes it untick. */
export function DoneLine({
    rep,
    prefix,
    onTap,
}: {
    rep: RepStep
    /** Leads the line, e.g. the section's name. */
    prefix?: string
    onTap?: () => void
}) {
    const Row = onTap ? 'button' : 'div'
    return (
        <Row
            {...(onTap
                ? { type: 'button' as const, onClick: onTap, 'aria-label': 'Untick this rep' }
                : {})}
            className={`grid w-full grid-cols-[2.75rem_0.75rem_1fr] items-baseline gap-x-2.5 text-left ${onTap ? 'active:opacity-60' : ''}`}
        >
            <span className="text-right text-[13px] tabular-nums tracking-tight text-neutral-300">
                {rep.steps[0]?.at !== undefined ? mark(rep.steps[0].at) : ''}
            </span>
            <i className="fa-solid fa-check text-[10px] text-emerald-600" aria-hidden="true" />
            <span className="truncate text-[13px] text-neutral-400">
                {prefix && <span className="font-medium text-neutral-500">{prefix} · </span>}
                {rep.steps.map((s) => s.phrase).join(' · ')}
            </span>
        </Row>
    )
}
