import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Drawer from '../Drawer'
import { PlanDetail } from '../PlanLibrary'
import { AreaIcon } from '../dashboard/DashSection'
import { OVERLINE } from '../lifeplan/ui'
import { daysBetween } from '../../lib/weightTrend'
import { phaseTargetsOn } from '../../lib/nutrition'
import type { Milestone, Timeline, TimelineStart, TimelineWeek } from '../../lib/timeline'
import type { NutritionPhase, TrainingPlan } from '../../types'
import { MILESTONE_STYLE, PHASE_TONES, fmtDate, fmtLift, fmtNum, kcal, signed } from './format'

/**
 * A plan from the chart's lanes, opened wide: what this stretch of the timeline
 * does (from the scenario on screen), then the plan itself — the Fitness plan
 * view for a training plan, a read-only summary for a nutrition phase.
 */

export type OpenPlan = { type: 'training'; plan: TrainingPlan } | { type: 'nutrition'; phase: NutritionPhase }

export default function PlanDrawer({
    open,
    timeline,
    weeks,
    today,
    onClose,
}: {
    open: OpenPlan | null
    timeline: Timeline
    /** The weeks of the scenario on screen — your pace or all in. */
    weeks: TimelineWeek[]
    today: string
    onClose: () => void
}) {
    const name = open ? (open.type === 'training' ? open.plan.name : open.phase.name) : ''
    const start = open ? (open.type === 'training' ? open.plan.planStart : open.phase.startDate) : ''
    const end = open ? (open.type === 'training' ? open.plan.planEnd : open.phase.endDate) : ''

    return (
        <Drawer
            open={!!open}
            onClose={onClose}
            size="2xl"
            title={name}
            footer={
                open && (
                    <div className="flex w-full justify-end">
                        <Link
                            to={
                                open.type === 'training'
                                    ? '/fitness?tab=plans'
                                    : `/nutrition?tab=phases&phase=${open.phase._id}`
                            }
                            className="inline-flex h-11 items-center gap-2 rounded-xl border border-neutral-200 bg-white px-[18px] text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            {open.type === 'training' ? 'Open in Fitness' : 'Edit in Nutrition'}
                            <i className="fa-solid fa-arrow-right text-[0.9em]" aria-hidden="true" />
                        </Link>
                    </div>
                )
            }
        >
            {open && (
                <div className="flex flex-col gap-8">
                    <InTimeline
                        initial={timeline.initial}
                        weeks={weeks}
                        start={start}
                        end={end}
                        today={today}
                        kind={open.type === 'nutrition' ? open.phase.kind : null}
                    />
                    {open.type === 'training' ? (
                        <PlanDetail key={open.plan._id} plan={open.plan} />
                    ) : (
                        <PhaseDetail phase={open.phase} today={today} />
                    )}
                </div>
            )}
        </Drawer>
    )
}

/** This plan's stretch of the projection: where you'd be at its start and its end. */
function InTimeline({
    initial,
    weeks,
    start,
    end,
    today,
    kind,
}: {
    initial: TimelineStart
    weeks: TimelineWeek[]
    start: string
    end: string
    today: string
    kind: NutritionPhase['kind'] | null
}) {
    const from = start > today ? start : today
    // The snapshot just before the stretch starts — or today, if it already has.
    const before = from === today ? null : [...weeks].reverse().find((w) => w.end < from) ?? null
    const after = [...weeks].reverse().find((w) => w.end <= end) ?? weeks[weeks.length - 1]
    const inside = weeks.filter((w) => w.end >= from && w.start <= end)
    const milestones = inside.flatMap((w) => w.milestones).filter((m) => m.date >= from && m.date <= end)

    const startWeight = before?.weight.mid ?? initial.weight
    const startBf = before?.bodyFat.mid ?? initial.bodyFat
    const lift = after.lifts[0]
    const liftStart = lift ? (before?.lifts[0]?.range.mid ?? initial.lifts[0]?.kg) : undefined
    const weeksLeft = Math.max(1, Math.round((daysBetween(from, end) + 1) / 7))
    const status =
        today < start
            ? `Starts ${fmtDate(start, true)}`
            : today > end
              ? 'Finished'
              : `Week ${Math.floor(daysBetween(start, today) / 7) + 1} of ${Math.max(1, Math.ceil((daysBetween(start, end) + 1) / 7))}`

    return (
        <section className="rounded-2xl bg-neutral-50 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className={OVERLINE}>Your timeline in this {kind ? 'phase' : 'plan'}</p>
                <p className="nums text-[13px] text-neutral-500">
                    {fmtDate(start)} – {fmtDate(end, true)} · {status}
                </p>
            </div>
            {kind && (
                <span className={`mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-neutral-700`}>
                    <span className={`h-2 w-2 rounded-full ${PHASE_TONES[kind].dot}`} aria-hidden="true" />
                    {PHASE_TONES[kind].label}
                </span>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Change
                    label="Weight"
                    from={`${fmtNum(startWeight, 1)}`}
                    to={`${fmtNum(after.weight.mid, 1)} kg`}
                    delta={`${signed(after.weight.mid - startWeight, 1)} kg`}
                />
                <Change
                    label="Body fat"
                    from={`${fmtNum(startBf, 1)}`}
                    to={`${fmtNum(after.bodyFat.mid, 1)}%`}
                    delta={`${signed(after.bodyFat.mid - startBf, 1)} pts`}
                />
                {lift && liftStart !== undefined ? (
                    <Change
                        label={lift.label}
                        from={fmtLift(liftStart)}
                        to={`${fmtLift(lift.range.mid)} kg`}
                        delta={`${signed(lift.range.mid - liftStart)} kg`}
                    />
                ) : (
                    <Change
                        label="Main lifts"
                        from={`${signed(before?.strengthPct ?? 0)}%`}
                        to={`${signed(after.strengthPct)}%`}
                        delta={`over ${weeksLeft} weeks`}
                    />
                )}
            </div>

            {milestones.length > 0 && (
                <ul className="mt-5 flex flex-col gap-2 border-t border-neutral-200 pt-4">
                    {milestones.map((m, i) => (
                        <MilestoneRow key={`${m.date}-${i}`} milestone={m} />
                    ))}
                </ul>
            )}
        </section>
    )
}

function Change({ label, from, to, delta }: { label: string; from: string; to: string; delta: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-white p-4 ring-1 ring-neutral-900/[0.06]">
            <p className="truncate text-[12px] text-neutral-500">{label}</p>
            <p className="nums mt-1 text-[20px] font-semibold tracking-[-0.02em] text-neutral-950">
                <span className="text-neutral-400">{from} → </span>
                {to}
            </p>
            <p className="nums mt-0.5 text-[12px] text-neutral-500">{delta}</p>
        </div>
    )
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
    const style = MILESTONE_STYLE[milestone.kind]
    return (
        <li className="flex items-start gap-3">
            <AreaIcon icon={style.icon} tone={style.tone} size="sm" />
            <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-neutral-900">{milestone.title}</p>
                <p className="nums text-[13px] leading-5 text-neutral-600">{milestone.detail}</p>
            </div>
            <span className="nums shrink-0 pt-0.5 text-[12px] text-neutral-500">{fmtDate(milestone.date)}</span>
        </li>
    )
}

/** A nutrition phase, read-only: targets, goal, revisions, notes. */
function PhaseDetail({ phase, today }: { phase: NutritionPhase; today: string }) {
    const on = today < phase.startDate ? phase.startDate : today > phase.endDate ? phase.endDate : today
    const targets = phaseTargetsOn(phase, on)
    const goal = phase.goal
    const rate = phase.weeklyRate ?? goal?.targetWeeklyRateKg
    const revisions = (phase.adjustments ?? []).filter((a) => a.targets)

    return (
        <div className="flex flex-col gap-8">
            <Block title={today >= phase.startDate && today <= phase.endDate ? 'Daily targets now' : 'Daily targets'}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Figure label="Calories" value={targets.calories ? kcal(targets.calories) : '—'} unit="kcal" />
                    <Figure label="Protein" value={targets.protein ? fmtNum(targets.protein, 0) : '—'} unit="g" />
                    <Figure label="Carbs" value={targets.carbs ? fmtNum(targets.carbs, 0) : '—'} unit="g" />
                    <Figure label="Fat" value={targets.fat ? fmtNum(targets.fat, 0) : '—'} unit="g" />
                </div>
            </Block>

            {(goal || rate) && (
                <Block title="Goal">
                    <dl className="divide-y divide-neutral-200 border-y border-neutral-200">
                        {goal?.targetWeightKg && <Row label="Weight" value={`${fmtNum(goal.targetWeightKg, 1)} kg`} />}
                        {goal?.targetBodyFatPct && <Row label="Body fat" value={`${fmtNum(goal.targetBodyFatPct, 1)}%`} />}
                        {goal?.targetDate && <Row label="By" value={fmtDate(goal.targetDate, true)} />}
                        {rate ? <Row label="Weekly rate" value={`${signed(rate, 2)} kg`} /> : null}
                        {goal?.proteinFloorG && <Row label="Protein floor" value={`${fmtNum(goal.proteinFloorG, 0)} g`} />}
                    </dl>
                </Block>
            )}

            {revisions.length > 0 && (
                <Block title="Calorie changes">
                    <ol className="flex flex-col gap-3">
                        {revisions.map((a, i) => (
                            <li key={i} className="flex items-start gap-3">
                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neutral-300" aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="nums text-[14px] font-medium text-neutral-900">
                                        {fmtDate(a.effectiveFrom, true)} · {a.targets?.calories ? `${kcal(a.targets.calories)} kcal` : 'macros changed'}
                                        {a.previous?.calories ? (
                                            <span className="font-normal text-neutral-500"> (was {kcal(a.previous.calories)})</span>
                                        ) : null}
                                    </p>
                                    {a.reason && <p className="text-[13px] leading-5 text-neutral-600">{a.reason}</p>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </Block>
            )}

            {phase.notes && (
                <Block title="Notes">
                    <p className="whitespace-pre-line text-[14px] leading-6 text-neutral-700">{phase.notes}</p>
                </Block>
            )}
        </div>
    )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-3 text-[15px] font-semibold text-neutral-900">{title}</h3>
            {children}
        </section>
    )
}

function Figure({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div className="rounded-xl bg-neutral-50 p-4">
            <p className="text-[12px] text-neutral-500">{label}</p>
            <p className="nums mt-1 text-[20px] font-semibold tracking-[-0.02em] text-neutral-950">
                {value}
                {value !== '—' && <span className="ml-1 text-[13px] font-medium text-neutral-500">{unit}</span>}
            </p>
        </div>
    )
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4 py-3">
            <dt className="text-[13px] text-neutral-500">{label}</dt>
            <dd className="nums text-[14px] font-medium text-neutral-900">{value}</dd>
        </div>
    )
}
