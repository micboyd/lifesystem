import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import PillToggle from '../components/PillToggle'
import QuizDrawer from '../components/timeline/QuizDrawer'
import PlanDrawer, { type OpenPlan } from '../components/timeline/PlanDrawer'
import ProjectionChart, { type ChartPoint } from '../components/timeline/ProjectionChart'
import {
    MILESTONE_STYLE,
    PHASE_TONES,
    fmtDate,
    fmtLift,
    fmtNum,
    fromNow,
    kcal,
    signed,
} from '../components/timeline/format'
import { AreaIcon, type AreaTone } from '../components/dashboard/DashSection'
import { OVERLINE, PANEL } from '../components/lifeplan/ui'
import { useTimeline, type TimelineSources } from '../components/timeline/useTimeline'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../services/users'
import { daysBetween } from '../lib/weightTrend'
import { planDirection } from '../lib/timelineHint'
import {
    type AdherenceReading,
    type Milestone,
    type Range,
    type PastWeek,
    type Suggestion,
    type Timeline as TimelineData,
    type TimelineEnd,
    type TimelineGap,
    type TimelineWeek,
} from '../lib/timeline'
import type { TimelineQuiz } from '../types'

/**
 * Timeline: where the training and nutrition plans could take you, week by week,
 * to the end of the last one. Built from the plans on first view; every weigh-in
 * and logged lift after that sharpens it (lib/timeline.ts).
 *
 * Figures use `.nums` (aligned digits in the body font), never `tabular-nums`,
 * which switches to the mono face.
 */

const GAP_COPY: Record<TimelineGap, { title: string; detail: string; to: string; action: string }> = {
    'training-plan': {
        title: 'A strength & conditioning plan',
        detail: 'Import one in Fitness → Plans. It sets the sessions week by week.',
        to: '/fitness?tab=plans',
        action: 'Go to Plans',
    },
    'nutrition-plan': {
        title: 'A nutrition plan',
        detail: 'Add a phase — cut, maintenance or build — with its calories in Nutrition → Phases.',
        to: '/nutrition?tab=phases',
        action: 'Go to Phases',
    },
    'body-profile': {
        title: 'Height, date of birth and sex',
        detail: 'Your burn is worked out from these. Set them once in Profile.',
        to: '/profile',
        action: 'Open Profile',
    },
    'weigh-in': {
        title: 'A weigh-in',
        detail: 'The starting point. Log one in Fitness → Body.',
        to: '/fitness?tab=body',
        action: 'Weigh in',
    },
}

export default function Timeline() {
    const { user, updateUser } = useAuth()
    const quiz = user?.settings?.timelineQuiz
    const { today, data, error, gaps, timeline } = useTimeline()

    const [quizOpen, setQuizOpen] = useState(false)
    const [saving, setSaving] = useState(false)

    const hasRecentBodyFat = !!data?.weightLogs.some(
        (l) => l.bodyFat && l.date <= today && daysBetween(l.date, today) <= 60
    )

    async function saveQuiz(next: TimelineQuiz) {
        setSaving(true)
        try {
            updateUser(await updateSettings({ ...(user?.settings ?? {}), timelineQuiz: next }))
            setQuizOpen(false)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Timeline
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {timeline
                            ? `Where your plans could take you, to ${fmtDate(timeline.end, true)}.`
                            : 'Where your plans could take you, week by week.'}
                    </p>
                </div>
                {quiz && gaps.length === 0 && data && (
                    <Button variant="secondary" icon="fa-solid fa-sliders" onClick={() => setQuizOpen(true)}>
                        Retake quiz
                    </Button>
                )}
            </header>

            {error ? (
                <Alert variant="danger">Couldn’t load your plans. Please try again shortly.</Alert>
            ) : !data ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : gaps.length > 0 ? (
                <SetupList gaps={gaps} />
            ) : !timeline ? (
                <QuizPrompt onStart={() => setQuizOpen(true)} />
            ) : (
                <TimelineView timeline={timeline} today={today} data={data} />
            )}

            <QuizDrawer
                open={quizOpen}
                quiz={quiz}
                today={today}
                hasRecentBodyFat={hasRecentBodyFat}
                saving={saving}
                onClose={() => setQuizOpen(false)}
                onSave={saveQuiz}
            />
        </Container>
    )
}

// ── Before there's a timeline ────────────────────────────────────────────────

function SetupList({ gaps }: { gaps: TimelineGap[] }) {
    return (
        <section className={`${PANEL} mx-auto max-w-2xl p-6 sm:p-8`}>
            <AreaIcon icon="fa-solid fa-route" tone="coral" />
            <h2 className="mt-4 text-lg font-semibold tracking-[-0.015em] text-neutral-900">A few things first</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
                The timeline is built from your plans, so it needs a training plan and a nutrition plan that haven’t
                finished yet.
            </p>
            <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
                {gaps.map((gap) => {
                    const copy = GAP_COPY[gap]
                    return (
                        <li key={gap} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4">
                            <span className="h-5 w-5 shrink-0 rounded-full ring-[1.5px] ring-inset ring-neutral-300" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-medium text-neutral-900">{copy.title}</p>
                                <p className="text-[13px] leading-5 text-neutral-500">{copy.detail}</p>
                            </div>
                            <Link
                                to={copy.to}
                                className="inline-flex h-9 items-center rounded-[10px] border border-neutral-200 bg-white px-3.5 text-[13px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
                            >
                                {copy.action}
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}

function QuizPrompt({ onStart }: { onStart: () => void }) {
    return (
        <section className={`${PANEL} mx-auto max-w-xl p-6 text-center sm:p-10`}>
            <div className="flex justify-center">
                <AreaIcon icon="fa-solid fa-route" tone="coral" />
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-neutral-900">Your plans are in place</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
                Eight quick questions — how closely you’ll stick to each plan, creatine, sleep and the rest — and you’ll
                see where you could be every week until the last plan ends.
            </p>
            <div className="mt-6">
                <Button icon="fa-solid fa-arrow-right" iconPosition="right" onClick={onStart}>
                    Take the quiz
                </Button>
            </div>
        </section>
    )
}

// ── The timeline ─────────────────────────────────────────────────────────────

/** Which run the page shows: the quiz's adherence, or the plans followed fully. */
interface View {
    weeks: TimelineWeek[]
    final: TimelineEnd
}

function TimelineView({ timeline, today, data }: { timeline: TimelineData; today: string; data: TimelineSources }) {
    const [allIn, setAllIn] = useState(false)
    const [openPlan, setOpenPlan] = useState<OpenPlan | null>(null)
    const view: View = allIn && timeline.perfect ? timeline.perfect : timeline

    function showPlan(id: string) {
        const plan = data.plans.find((p) => p._id === id)
        if (plan) return setOpenPlan({ type: 'training', plan })
        const phase = data.phases.find((p) => p._id === id)
        if (phase) setOpenPlan({ type: 'nutrition', phase })
    }

    return (
        <div className="flex flex-col gap-8 sm:gap-10">
            <PlanDrawer
                open={openPlan}
                timeline={timeline}
                weeks={view.weeks}
                today={today}
                onClose={() => setOpenPlan(null)}
            />
            <Overview timeline={timeline} view={view} allIn={allIn} onAllIn={setAllIn} onPlan={showPlan} />
            <CloseTheGap timeline={timeline} />
            <ComingUp view={view} today={today} />
            <WeekTable timeline={timeline} view={view} today={today} />
            <HowItWorks timeline={timeline} />
        </div>
    )
}

function Overview({
    timeline,
    view,
    allIn,
    onAllIn,
    onPlan,
}: {
    timeline: TimelineData
    view: View
    allIn: boolean
    onAllIn: (allIn: boolean) => void
    onPlan: (id: string) => void
}) {
    const { initial } = timeline
    const { final } = view
    const dir = planDirection(timeline)
    const lead = final.lifts[0]
    const leadStart = initial.lifts[0]
    const [metric, setMetric] = useState('weight')

    const options = [
        { value: 'weight', label: 'Weight' },
        { value: 'bodyFat', label: 'Body fat' },
        ...(final.lifts.length
            ? final.lifts.map((l) => ({ value: l.lift as string, label: l.label }))
            : [{ value: 'strength', label: 'Strength' }]),
    ]
    const chart = chartFor(timeline, view.weeks, metric)

    return (
        <section className={`${PANEL} overflow-hidden`}>
            <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className={OVERLINE}>By {fmtDate(timeline.end, true)}</p>
                        <p className="nums mt-1 text-[13px] text-neutral-500">
                            <span className="font-medium text-coral-600">
                                Week {timeline.weeks[0].index} of {timeline.past.length + timeline.weeks.length}
                            </span>{' '}
                            ·{' '}
                            {allIn
                                ? 'both plans followed to the letter'
                                : timeline.calibration
                                  ? 'at your pace, calibrated on your weigh-ins'
                                  : timeline.adherence.training.measured !== null ||
                                      timeline.adherence.nutrition.measured !== null
                                    ? 'at your pace, from your logs and the quiz'
                                    : 'at the pace you said in the quiz'}
                        </p>
                    </div>
                    {timeline.perfect && (
                        <PillToggle
                            label="Scenario"
                            options={[
                                { value: 'pace', label: 'Your pace' },
                                { value: 'all', label: 'All in' },
                            ]}
                            value={allIn ? 'all' : 'pace'}
                            onChange={(v) => onAllIn(v === 'all')}
                        />
                    )}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-neutral-200">
                    <Headline
                        label="Weight"
                        value={fmtNum(final.weight.mid, 1)}
                        unit="kg"
                        change={`${signed(final.weight.mid - initial.weight, 1)} kg`}
                        good={dir !== 0 && Math.sign(final.weight.mid - initial.weight) === dir}
                        detail={`Likely ${fmtNum(final.weight.low, 1)}–${fmtNum(final.weight.high, 1)} · from ${fmtNum(initial.weight, 1)}`}
                    />
                    <Headline
                        label="Body fat"
                        value={fmtNum(final.bodyFat.mid, 1)}
                        unit="%"
                        change={`${signed(final.bodyFat.mid - initial.bodyFat, 1)} pts`}
                        good={final.bodyFat.mid < initial.bodyFat - 0.2}
                        detail={`Likely ${fmtNum(final.bodyFat.low, 1)}–${fmtNum(final.bodyFat.high, 1)} · from ${fmtNum(initial.bodyFat, 1)}${initial.bodyFatSource === 'estimated' ? ' (est.)' : ''}`}
                    />
                    {lead && leadStart ? (
                        <Headline
                            label={`${lead.label} · est. 1RM`}
                            value={fmtLift(lead.range.mid)}
                            unit="kg"
                            change={`${signed(lead.range.mid - leadStart.kg)} kg`}
                            good={lead.range.mid > leadStart.kg + 1}
                            detail={`Likely ${fmtLift(lead.range.low)}–${fmtLift(lead.range.high)} · from ${fmtLift(leadStart.kg)}`}
                        />
                    ) : (
                        <Headline
                            label="Main lifts"
                            value={signed(final.strengthPct)}
                            unit="%"
                            change={null}
                            good={false}
                            detail="Log sets with weights to see kilos"
                        />
                    )}
                </div>

                <GoalProgress timeline={timeline} />
            </div>

            <div className="border-t border-neutral-200 p-5 sm:p-7">
                <PillToggle label="Chart measure" options={options} value={metric} onChange={setMetric} />
                <div className="mt-5">
                    <ProjectionChart
                        key={metric}
                        timeline={timeline}
                        points={chart.points}
                        logged={chart.logged}
                        unit={chart.unit}
                        decimals={chart.decimals}
                        goal={chart.goal}
                        onPlan={onPlan}
                    />
                </div>
            </div>
        </section>
    )
}

function Headline({
    label,
    value,
    unit,
    change,
    good,
    detail,
}: {
    label: string
    value: string
    unit: string
    change: string | null
    good: boolean
    detail: string
}) {
    return (
        <div className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
            <p className="truncate text-[13px] text-neutral-500">{label}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <p className="nums text-[34px] font-semibold leading-none tracking-[-0.035em] text-neutral-950">
                    {value}
                    <span className="ml-1 text-lg font-medium tracking-normal text-neutral-500">{unit}</span>
                </p>
                {change && (
                    <span
                        className={`nums inline-flex h-6 items-center rounded-full px-2 text-[12px] font-medium ${
                            good ? 'bg-success-bg text-success' : 'bg-neutral-100 text-neutral-600'
                        }`}
                    >
                        {change}
                    </span>
                )}
            </div>
            <p className="nums mt-2 text-[13px] text-neutral-500">{detail}</p>
        </div>
    )
}

/**
 * How far towards the plan's goal each scenario gets — body fat when the goal
 * names one, else weight. The pale bar is "all in", the solid one your pace.
 */
function GoalProgress({ timeline }: { timeline: TimelineData }) {
    const { goal, initial, final, perfect } = timeline
    const bf = goal.bodyFatPct !== null
    const target = bf ? goal.bodyFatPct! : goal.weightKg
    if (target === null) return null
    const start = bf ? initial.bodyFat : initial.weight
    if (Math.abs(target - start) < 0.5) return null

    const unit = bf ? '%' : ' kg'
    const value = (e: TimelineEnd) => (bf ? e.bodyFat.mid : e.weight.mid)
    const share = (v: number) => Math.max(0, Math.min(1, (v - start) / (target - start)))
    const pace = share(value(final))
    const best = perfect ? share(value(perfect.final)) : pace
    const there = (x: number) => x >= 0.995
    const goalText = bf
        ? `${fmtNum(target, 0)}% body fat${goal.weightKg ? ` · ${fmtNum(goal.weightKg, 0)} kg` : ''}`
        : `${fmtNum(target, 1)} kg`

    let message: ReactNode
    if (there(pace)) message = <>On course at your pace. Keep doing what you said you’d do.</>
    else if (perfect && there(best))
        message = (
            <>
                <span className="font-medium text-neutral-900">All in gets you there.</span> At your pace you finish on{' '}
                {fmtNum(value(final), 1)}
                {unit} — the changes below close the gap.
            </>
        )
    else
        message = (
            <>
                These calories fall {fmtNum(Math.abs(value(perfect?.final ?? final) - target), 1)}
                {bf ? ' points' : ' kg'} short even all in — the changes below close it.
            </>
        )

    return (
        <div className="mt-7 rounded-2xl bg-neutral-50 p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="nums text-[14px] font-medium text-neutral-900">Goal · {goalText}</p>
                <p className="nums text-[13px] text-neutral-500">
                    Your pace {Math.round(pace * 100)}%{perfect ? ` · all in ${Math.round(best * 100)}%` : ''} of the way
                </p>
            </div>
            <div
                className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-200"
                role="img"
                aria-label={`Your pace gets ${Math.round(pace * 100)}% of the way to the goal${perfect ? `, all in ${Math.round(best * 100)}%` : ''}`}
            >
                {best > pace && (
                    <div className="absolute inset-y-0 left-0 rounded-full bg-coral-200" style={{ width: `${best * 100}%` }} />
                )}
                <div className="absolute inset-y-0 left-0 rounded-full bg-coral-500" style={{ width: `${pace * 100}%` }} />
            </div>
            <p className="nums mt-3 text-[13px] leading-5 text-neutral-600">{message}</p>
        </div>
    )
}

const SUGGESTION_STYLE: Record<string, { icon: string; tone: AreaTone }> = {
    nutrition: { icon: 'fa-solid fa-utensils', tone: 'coral' },
    training: { icon: 'fa-solid fa-dumbbell', tone: 'navy' },
    calories: { icon: 'fa-solid fa-scale-balanced', tone: 'amber' },
    steps: { icon: 'fa-solid fa-person-walking', tone: 'green' },
    protein: { icon: 'fa-solid fa-drumstick-bite', tone: 'violet' },
    sleep: { icon: 'fa-solid fa-moon', tone: 'sky' },
    creatine: { icon: 'fa-solid fa-flask', tone: 'sky' },
}

/**
 * The levers, each measured on its own against your pace, then all together.
 * With a goal, a lever that reaches it shows *when* — more effort means getting
 * there sooner and then holding, never cutting on past the goal.
 */
function CloseTheGap({ timeline }: { timeline: TimelineData }) {
    const { suggestions, combined, final, goal } = timeline
    if (suggestions.length === 0) return null
    const bf = suggestions[0].measure === 'bodyFat'
    const target = bf ? goal.bodyFatPct : null
    const goalText = target !== null ? `${fmtNum(target, 0)}%` : null
    const deadline = goal.date ?? timeline.end
    const paceReaches = target !== null && final.bodyFat.mid <= target
    const anyReach = suggestions.some((s) => s.reaches)

    const result = (s: Suggestion) =>
        bf ? `${fmtNum(s.final.bodyFat.mid, 1)}%` : `+${fmtNum(s.final.leanChange, 1)} kg`
    const gain = (s: Suggestion) => (bf ? `−${fmtNum(s.gain, 1)} pts` : `+${fmtNum(s.gain, 1)} kg muscle`)
    const early = (date: string) => Math.floor(daysBetween(date, deadline) / 7)

    let intro: string
    if (goalText && paceReaches)
        intro = `At your pace you already reach ${goalText}. These get you there sooner:`
    else if (goalText && anyReach)
        intro = `At your pace you finish on ${fmtNum(final.bodyFat.mid, 1)}%, short of ${goalText}. Any change marked with a date gets you there on its own:`
    else if (goalText)
        intro = `At your pace you finish on ${fmtNum(final.bodyFat.mid, 1)}%, short of ${goalText}. Each change closes part of it:`
    else
        intro = `At your pace you finish on ${bf ? `${fmtNum(final.bodyFat.mid, 1)}% body fat` : `+${fmtNum(final.leanChange, 1)} kg of muscle`}. Each change on its own moves that to:`

    return (
        <section>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-neutral-900">
                {paceReaches ? 'Get there sooner' : 'Close the gap'}
            </h2>
            <p className="nums mt-1 text-[13px] text-neutral-500">{intro}</p>
            <ul className={`${PANEL} mt-4 divide-y divide-neutral-200 overflow-hidden`}>
                {suggestions.map((s) => {
                    const style = SUGGESTION_STYLE[s.key] ?? { icon: 'fa-solid fa-bolt', tone: 'coral' as AreaTone }
                    return (
                        <li key={s.key} className="flex items-start gap-4 px-5 py-4 sm:px-6">
                            <AreaIcon icon={style.icon} tone={style.tone} />
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-medium text-neutral-900">{s.title}</p>
                                <p className="nums mt-0.5 text-[13px] leading-5 text-neutral-600">{s.detail}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                {s.reaches && goalText ? (
                                    <>
                                        <p className="nums text-[17px] font-semibold tracking-[-0.02em] text-neutral-950">
                                            {fmtDate(s.reaches)}
                                        </p>
                                        <p className="nums mt-0.5 text-[12px] font-medium text-success">
                                            <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                                            {goalText} reached
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="nums text-[17px] font-semibold tracking-[-0.02em] text-neutral-950">
                                            {result(s)}
                                        </p>
                                        <p className="nums mt-0.5 text-[12px] font-medium text-success">{gain(s)}</p>
                                    </>
                                )}
                            </div>
                        </li>
                    )
                })}
                {combined && (
                    <li className="flex items-center gap-4 bg-neutral-900 px-5 py-4 text-white sm:px-6">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-white/10 text-sm" aria-hidden="true">
                            <i className="fa-solid fa-bolt" />
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-medium">All of them together</p>
                            <p className="nums mt-0.5 text-[13px] leading-5 text-neutral-300">
                                {combined.reaches && goalText
                                    ? early(combined.reaches) >= 1
                                        ? `${goalText} about ${early(combined.reaches)} weeks early — then ease up to maintenance and hold it.`
                                        : `${goalText} right on time.`
                                    : 'Everything above at once.'}
                            </p>
                        </div>
                        <div className="shrink-0 text-right">
                            <p className="nums text-[17px] font-semibold tracking-[-0.02em]">
                                {combined.reaches && goalText ? fmtDate(combined.reaches) : result(combined)}
                            </p>
                            <p className="nums mt-0.5 text-[12px] font-medium text-neutral-300">
                                {combined.reaches && goalText ? `${goalText} reached` : gain(combined)}
                            </p>
                        </div>
                    </li>
                )}
            </ul>
        </section>
    )
}

/** The series the chart draws for a measure: today, then every week's snapshot. */
function chartFor(
    timeline: TimelineData,
    weeks: TimelineWeek[],
    metric: string
): { points: ChartPoint[]; logged: ChartPoint[]; unit: string; decimals: number; goal: number | null } {
    const { initial } = timeline
    const label = (w: { index: number; start: string; end: string }) =>
        `Week ${w.index} · ${fmtDate(w.start)} – ${fmtDate(w.end)}`
    const flat = (v: number): Range => ({ low: v, mid: v, high: v })
    // The weeks already lived, wherever something was measured.
    const past = (pick: (w: PastWeek) => number | null): ChartPoint[] =>
        timeline.past.flatMap((w) => {
            const v = pick(w)
            return v === null ? [] : [{ date: w.end, label: label(w), range: flat(v), milestones: [], logged: true }]
        })
    const series = (pick: (w: TimelineWeek) => Range, start: number): ChartPoint[] => [
        { date: timeline.start, label: `Today · ${fmtDate(timeline.start)}`, range: flat(start), milestones: [] },
        ...weeks.map((w) => ({ date: w.end, label: label(w), range: pick(w), milestones: w.milestones })),
    ]

    if (metric === 'weight')
        return {
            points: series((w) => w.weight, initial.weight),
            logged: past((w) => w.weight),
            unit: 'kg',
            decimals: 1,
            goal: timeline.goal.weightKg,
        }
    if (metric === 'bodyFat')
        return {
            points: series((w) => w.bodyFat, initial.bodyFat),
            logged: past((w) => w.bodyFat),
            unit: '%',
            decimals: 1,
            goal: timeline.goal.bodyFatPct,
        }
    const start = initial.lifts.find((l) => l.lift === metric)?.kg
    if (start === undefined)
        return { points: series((w) => flat(w.strengthPct), 0), logged: [], unit: '%', decimals: 0, goal: null }
    return {
        points: series((w) => w.lifts.find((l) => l.lift === metric)!.range, start),
        logged: past((w) => w.lifts.find((l) => l.lift === metric)?.kg ?? null),
        unit: 'kg',
        decimals: 0,
        goal: null,
    }
}

function ComingUp({ view, today }: { view: View; today: string }) {
    const next = view.weeks
        .flatMap((w) => w.milestones)
        .filter((m) => m.date >= today)
        .slice(0, 3)
    if (next.length === 0) return null
    return (
        <section>
            <h2 className="text-lg font-semibold tracking-[-0.015em] text-neutral-900">Coming up</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {next.map((m, i) => (
                    <li key={`${m.date}-${i}`} className={`${PANEL} flex flex-col p-5`}>
                        <div className="flex items-center justify-between gap-3">
                            <AreaIcon icon={MILESTONE_STYLE[m.kind].icon} tone={MILESTONE_STYLE[m.kind].tone} size="sm" />
                            <span className="nums text-[12px] font-medium text-neutral-500">
                                {fromNow(today, m.date, daysBetween(today, m.date))} · {fmtDate(m.date)}
                            </span>
                        </div>
                        <p className="mt-4 text-[15px] font-semibold leading-snug text-neutral-900">{m.title}</p>
                        <p className="mt-1 text-[13px] leading-5 text-neutral-600">{m.detail}</p>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// ── Week by week ─────────────────────────────────────────────────────────────

const ROW_GRID = 'sm:grid sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))] sm:items-center sm:gap-4'

function WeekTable({ timeline, view, today }: { timeline: TimelineData; view: View; today: string }) {
    // Every week of the plans, lived and to come, in one list.
    const rows: Row[] = [
        ...timeline.past.map((w): Row => ({ kind: 'past', start: w.start, week: w })),
        ...view.weeks.map((w): Row => ({ kind: 'future', start: w.start, week: w })),
    ]
    const months = groupByMonth(rows)
    const liftLabel = timeline.final.lifts[0]?.label
    const nowId = 'timeline-this-week'

    return (
        <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold tracking-[-0.015em] text-neutral-900">Week by week</h2>
                {timeline.past.length > 0 ? (
                    <button
                        type="button"
                        onClick={() =>
                            document.getElementById(nowId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-coral-600 hover:text-coral-700"
                    >
                        <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
                        Jump to this week
                    </button>
                ) : (
                    <p className="text-[13px] text-neutral-500">Likely ranges at the end of each week</p>
                )}
            </div>

            <div className={`${PANEL} mt-4 overflow-hidden`}>
                <div className={`hidden border-b border-neutral-200 px-6 py-3 text-[12px] font-medium text-neutral-500 ${ROW_GRID}`}>
                    <span>Week</span>
                    <span>Weight, kg</span>
                    <span>Body fat, %</span>
                    <span>{liftLabel ? `${liftLabel}, kg` : 'Main lifts'}</span>
                </div>
                {months.map(({ month, items }, i) => (
                    <div key={month}>
                        <h3
                            className={`border-b border-neutral-200 bg-neutral-50 px-5 py-3.5 text-[17px] font-semibold tracking-[-0.015em] text-neutral-900 sm:px-6 ${i > 0 ? 'border-t' : ''}`}
                        >
                            {month}
                        </h3>
                        <ol className="divide-y divide-neutral-200">
                            {items.map((r) =>
                                r.kind === 'past' ? (
                                    <PastRow key={r.start} week={r.week} />
                                ) : (
                                    <WeekRow
                                        key={r.start}
                                        week={r.week}
                                        isNow={r.week.start <= today && r.week.end >= today}
                                        total={timeline.past.length + view.weeks.length}
                                        id={r.week.start <= today && r.week.end >= today ? nowId : undefined}
                                    />
                                )
                            )}
                        </ol>
                    </div>
                ))}
            </div>
        </section>
    )
}

type Row = { kind: 'past'; start: string; week: PastWeek } | { kind: 'future'; start: string; week: TimelineWeek }

function weekMeta(week: PastWeek | TimelineWeek): string {
    const phase = week.phase ? PHASE_TONES[week.phase.kind] : null
    return [
        phase ? `${phase.label}${week.targetKcal ? ` · ${kcal(week.targetKcal)} kcal` : ''}` : null,
        week.strengthSessions ? `${week.strengthSessions} lift` : null,
        week.cardioSessions ? `${week.cardioSessions} cardio` : null,
    ]
        .filter(Boolean)
        .join(' · ')
}

/** A week already lived: what was logged, quieter than the weeks ahead. */
function PastRow({ week }: { week: PastWeek }) {
    const phase = week.phase ? PHASE_TONES[week.phase.kind] : null
    const meta = weekMeta(week)
    const lift = week.lifts[0]
    return (
        <li className="px-5 py-4 sm:px-6">
            <div className={ROW_GRID}>
                <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-neutral-500">
                        Week {week.index}
                        <span className="nums ml-2 text-[13px] font-normal text-neutral-400">
                            {fmtDate(week.start)} – {fmtDate(week.end)}
                        </span>
                        <span className="ml-2 inline-flex h-5 items-center rounded-full bg-neutral-100 px-1.5 align-middle text-[11px] font-medium text-neutral-500">
                            <i className="fa-solid fa-check mr-1 text-[9px]" aria-hidden="true" />
                            Done
                        </span>
                    </p>
                    {meta && (
                        <p className="nums mt-1 flex items-center gap-1.5 text-[12px] text-neutral-400">
                            {phase && <span className={`h-2 w-2 shrink-0 rounded-full opacity-60 ${phase.dot}`} aria-hidden="true" />}
                            <span className="truncate">{meta}</span>
                        </p>
                    )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:contents">
                    <Cell label="Weight, kg" value={week.weight !== null ? fmtNum(week.weight, 1) : '—'} muted />
                    <Cell label="Body fat, %" value={week.bodyFat !== null ? fmtNum(week.bodyFat, 1) : '—'} muted />
                    {lift ? (
                        <Cell label={`${lift.label}, kg`} value={lift.kg !== null ? fmtLift(lift.kg) : '—'} muted />
                    ) : (
                        <Cell label="Main lifts" value="—" muted />
                    )}
                </div>
            </div>
        </li>
    )
}

function WeekRow({ week, isNow, total, id }: { week: TimelineWeek; isNow: boolean; total: number; id?: string }) {
    const phase = week.phase ? PHASE_TONES[week.phase.kind] : null
    const lift = week.lifts[0]
    const meta = weekMeta(week)

    return (
        <li id={id} className={`relative scroll-mt-24 px-5 py-4 sm:px-6 ${isNow ? 'bg-coral-50/60' : ''}`}>
            {isNow && <span className="absolute inset-y-0 left-0 w-1 bg-coral-500" aria-hidden="true" />}
            <div className={ROW_GRID}>
                <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-neutral-900">
                        Week {week.index}
                        <span className="nums ml-2 text-[13px] font-normal text-neutral-500">
                            {fmtDate(week.start)} – {fmtDate(week.end)}
                        </span>
                        {isNow && (
                            <span className="nums ml-2 inline-flex h-5 items-center rounded-full bg-coral-500 px-2 align-middle text-[11px] font-semibold text-white">
                                You are here · {total - week.index} to go
                            </span>
                        )}
                    </p>
                    {meta && (
                        <p className="nums mt-1 flex items-center gap-1.5 text-[12px] text-neutral-500">
                            {phase && <span className={`h-2 w-2 shrink-0 rounded-full ${phase.dot}`} aria-hidden="true" />}
                            <span className="truncate">{meta}</span>
                        </p>
                    )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3 sm:contents">
                    <Cell label="Weight, kg" value={rangeText(week.weight, 1)} />
                    <Cell label="Body fat, %" value={rangeText(week.bodyFat, 1)} />
                    {lift ? (
                        <Cell label={`${lift.label}, kg`} value={`${fmtLift(lift.range.low)}–${fmtLift(lift.range.high)}`} />
                    ) : (
                        <Cell label="Main lifts" value={`${signed(week.strengthPct)}%`} />
                    )}
                </div>
            </div>

            {week.milestones.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                    {week.milestones.map((m, i) => (
                        <MilestoneLine key={`${m.date}-${i}`} milestone={m} />
                    ))}
                </ul>
            )}
        </li>
    )
}

function Cell({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="truncate text-[11px] text-neutral-500 sm:hidden">{label}</p>
            <p className={`nums text-[14px] font-medium ${muted ? 'text-neutral-500' : 'text-neutral-900'}`}>{value}</p>
        </div>
    )
}

function MilestoneLine({ milestone }: { milestone: Milestone }) {
    const style = MILESTONE_STYLE[milestone.kind]
    return (
        <li className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3">
            <AreaIcon icon={style.icon} tone={style.tone} size="sm" />
            <div className="min-w-0">
                <p className="text-[14px] font-medium text-neutral-900">{milestone.title}</p>
                <p className="nums mt-0.5 text-[13px] leading-5 text-neutral-600">{milestone.detail}</p>
            </div>
        </li>
    )
}

// ── How it's worked out ──────────────────────────────────────────────────────

function HowItWorks({ timeline }: { timeline: TimelineData }) {
    const { burn, calibration, trainingGaps, initial, adherence } = timeline
    const items: ReactNode[] = [
        <>Built from {timeline.plans.map((p) => p.name).join(', ')}, and how closely you follow them:</>,
    ]
    if (calibration) {
        const off = Math.round(calibration.offsetKcal / 10) * 10
        items.push(
            <>
                Calibrated on {calibration.spanDays} days of weigh-ins: your trend is{' '}
                {signed(calibration.observedRate, 2)} kg a week against {signed(calibration.predictedRate, 2)} predicted
                {Math.abs(off) >= 20 ? `, so each day carries a ${signed(off)} kcal correction.` : ' — close enough to leave alone.'}
            </>
        )
    } else if (burn.source === 'goal' && burn.planKcal) {
        items.push(
            <>
                Your nutrition plan was written to reach its goal, so the projection assumes it can: followed to the
                letter, it lands on it. That means a maintenance of about {kcal(burn.planKcal)} kcal a day — the general
                formula guesses {kcal(burn.formulaKcal)}, which runs low for big, active lifters. A couple of weeks of
                weigh-ins will confirm or correct it.
            </>
        )
    } else if (burn.source === 'plan' && burn.planKcal) {
        items.push(
            <>
                Maintenance read from {burn.phaseName}: about {kcal(burn.planKcal)} kcal a day
                {burn.rateKg
                    ? ` (its calories plus a ${fmtNum(Math.abs(burn.rateKg), 2)} kg a week ${burn.rateKg < 0 ? 'loss' : 'gain'})`
                    : ''}
                . The general formula guesses {kcal(burn.formulaKcal)}; a couple of weeks of weigh-ins will settle it.
                {burn.goalReachable === false &&
                    ' Even a generous maintenance can’t reach the goal on these calories by its date, so the changes above matter.'}
            </>
        )
    } else {
        items.push(<>Maintenance estimated at {kcal(burn.formulaKcal)} kcal a day until weigh-ins can measure it.</>)
    }
    for (const g of trainingGaps) {
        items.push(
            <>
                No training plan from {fmtDate(g.start)} to {fmtDate(g.end, true)}, so that stretch repeats the end of
                your last block.
            </>
        )
    }
    items.push(
        initial.bodyFatSource === 'logged' ? (
            <>Starting body fat is your logged trend.</>
        ) : initial.bodyFatSource === 'quiz' ? (
            <>Starting body fat is the figure from the quiz.</>
        ) : (
            <>Starting body fat is estimated from height and weight — log a reading to tighten it.</>
        ),
        <>Water is kept apart from fat: creatine and glycogen move the scale without moving body fat.</>
    )

    return (
        <section className={`${PANEL} p-5 sm:p-7`}>
            <h2 className="text-[15px] font-semibold text-neutral-900">How this is worked out</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
                {items.map((item, i) => (
                    <li key={i} className="flex flex-col gap-2.5">
                        <div className="flex gap-3 text-[13px] leading-5 text-neutral-600">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-neutral-400" aria-hidden="true" />
                            <span className="nums">{item}</span>
                        </div>
                        {i === 0 && (
                            <div className="ml-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <AdherenceCard label="Training" reading={adherence.training} unit="sessions done" />
                                <AdherenceCard label="Nutrition" reading={adherence.nutrition} unit="logged days on target" />
                            </div>
                        )}
                    </li>
                ))}
            </ul>
            <p className="mt-4 border-t border-neutral-200 pt-4 text-[12px] leading-5 text-neutral-500">
                Projections, not promises. Lift figures are estimated one-rep maxes from your logged sets.
            </p>
        </section>
    )
}

/** What the quiz said against what the logs show, and the figure the projection runs on. */
function AdherenceCard({ label, reading, unit }: { label: string; reading: AdherenceReading; unit: string }) {
    const { stated, measured, used, hit, total, days, weight } = reading
    return (
        <div className="rounded-xl bg-neutral-50 p-3.5">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium text-neutral-900">{label}</p>
                <p className="nums text-[13px] font-semibold text-neutral-950">Using {pct(used)}</p>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                <div>
                    <dt className="text-neutral-500">You said</dt>
                    <dd className="nums mt-0.5 text-[14px] font-medium text-neutral-900">{pct(stated)}</dd>
                </div>
                <div>
                    <dt className="text-neutral-500">Your logs</dt>
                    <dd className="nums mt-0.5 text-[14px] font-medium text-neutral-900">
                        {measured === null ? '—' : pct(measured)}
                    </dd>
                </div>
            </dl>
            <p className="nums mt-2 text-[12px] leading-5 text-neutral-500">
                {measured === null
                    ? days > 0
                        ? 'Not enough yet: your logs start counting after a week.'
                        : label === 'Training'
                          ? 'Nothing logged against the plan in the last four weeks yet.'
                          : 'No food marked eaten in the last four weeks yet.'
                    : `${hit} of ${total} ${unit} in the last four weeks${
                          weight < 1 ? ` · weighted ${pct(weight)} against the quiz until there are four weeks` : ''
                      }.`}
            </p>
        </div>
    )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rangeText(r: Range, decimals: number): string {
    return `${fmtNum(r.low, decimals)}–${fmtNum(r.high, decimals)}`
}

function pct(n: number): string {
    return `${Math.round(n * 100)}%`
}

function groupByMonth<T extends { start: string }>(rows: T[]): { month: string; items: T[] }[] {
    const out: { month: string; items: T[] }[] = []
    for (const w of rows) {
        const month = new Date(`${w.start}T00:00:00Z`).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
        })
        const last = out[out.length - 1]
        if (last?.month === month) last.items.push(w)
        else out.push({ month, items: [w] })
    }
    return out
}
