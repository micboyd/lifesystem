import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import Drawer from '../components/Drawer'
import PillToggle from '../components/PillToggle'
import { AreaIcon, type AreaTone } from '../components/dashboard/DashSection'
import { OVERLINE, PANEL } from '../components/lifeplan/ui'
import { fmtDate, fmtNum, kcal, signed } from '../components/timeline/format'
import { useConsistency, type ConsistencyData } from '../components/consistency/useConsistency'
import { addDays } from '../lib/calendar'
import type { RateStatus } from '../lib/weightTrend'
import {
    AREA_WEIGHTS,
    scoreBand,
    summarise,
    weekScores,
    type AreaKey,
    type Consistency as Scores,
    type Ratio,
    type ScoreBand,
    type WeekScore,
} from '../lib/consistency'

/**
 * Consistency: how closely the plan is being followed — training, food and
 * weigh-ins — as plain numbers. One overall score, each area's score and the
 * counts behind it, and the same week by week (lib/consistency.ts).
 *
 * Figures use `.nums` (aligned digits in the body font), never `tabular-nums`,
 * which switches to the mono face.
 */

type Period = 7 | 28 | 84

const PERIODS: { value: Period; label: string; long: string }[] = [
    { value: 7, label: '7 days', long: 'Last 7 days' },
    { value: 28, label: '4 weeks', long: 'Last 4 weeks' },
    { value: 84, label: '12 weeks', long: 'Last 12 weeks' },
]

const PERIOD_KEY = 'consistencyPeriod'

const BAND: Record<ScoreBand, { label: string; text: string; bar: string }> = {
    good: { label: 'On track', text: 'text-success', bar: 'bg-success' },
    fair: { label: 'Close', text: 'text-amber-600', bar: 'bg-amber-500' },
    low: { label: 'Off track', text: 'text-coral-600', bar: 'bg-coral-500' },
}

const AREAS: {
    key: AreaKey
    label: string
    icon: string
    tone: AreaTone
    to: string
    action: string
    rule: string
}[] = [
    {
        key: 'training',
        label: 'Training',
        icon: 'fa-solid fa-dumbbell',
        tone: 'coral',
        to: '/fitness',
        action: 'Open the planner',
        rule: 'Planned sessions logged, that day or a day either side. A skipped session counts as not done; extra sessions never count against you.',
    },
    {
        key: 'nutrition',
        label: 'Nutrition',
        icon: 'fa-solid fa-bowl-food',
        tone: 'green',
        to: '/nutrition',
        action: 'Open meals',
        rule: 'The average of three: days on calories (as the planner judges them), days protein’s hit (from 95%), and planned meals ticked eaten. A day with nothing ticked is a miss; a day away isn’t judged; today waits until it’s over.',
    },
    {
        key: 'body',
        label: 'Body',
        icon: 'fa-solid fa-weight-scale',
        tone: 'sky',
        to: '/fitness?tab=body',
        action: 'Weigh in',
        rule: 'At least one weigh-in a week: each day counts when there’s been one in the 7 days up to it. The weight trend is shown, not scored.',
    },
]

const RATE_COPY: Record<RateStatus, { label: string; band: ScoreBand | null }> = {
    'on-track': { label: 'On track', band: 'good' },
    slow: { label: 'Slower than planned', band: 'fair' },
    fast: { label: 'Faster than planned', band: 'fair' },
    stalled: { label: 'Holding steady', band: 'fair' },
    'wrong-way': { label: 'Going the wrong way', band: 'low' },
    'no-goal': { label: 'No rate set', band: null },
    'no-data': { label: 'Not enough weigh-ins yet', band: null },
}

function readPeriod(): Period {
    try {
        const n = Number(localStorage.getItem(PERIOD_KEY))
        return PERIODS.some((p) => p.value === n) ? (n as Period) : 7
    } catch {
        return 7
    }
}

export default function Consistency() {
    const { data, error } = useConsistency()
    const [period, setPeriodState] = useState<Period>(readPeriod)

    function setPeriod(next: Period) {
        setPeriodState(next)
        try {
            localStorage.setItem(PERIOD_KEY, String(next))
        } catch {
            // A remembered period is a convenience; the page works without it.
        }
    }

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Consistency
                    </h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        How closely you’re sticking to the plan, in numbers.
                    </p>
                </div>
                <PillToggle
                    label="Period"
                    options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                    value={period}
                    onChange={setPeriod}
                />
            </header>

            {error ? (
                <Alert variant="danger">
                    Couldn’t load your training and meals. Please try again shortly.
                </Alert>
            ) : !data ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <ConsistencyView data={data} period={period} />
            )}
        </Container>
    )
}

function ConsistencyView({ data, period }: { data: ConsistencyData; period: Period }) {
    const { today, records } = data
    const [open, setOpen] = useState<AreaKey | null>(null)
    const scores = useMemo(() => {
        const from = addDays(today, -(period - 1))
        return summarise(
            records.filter((d) => d.date >= from),
            today
        )
    }, [records, today, period])
    const weeks = useMemo(() => {
        const all = weekScores(records, today, 6)
        // Drop the empty weeks from before there was anything to score.
        let end = all.length
        while (end > 1 && all[end - 1].overall === null) end -= 1
        return all.slice(0, end)
    }, [records, today])
    const label = PERIODS.find((p) => p.value === period)!.long

    if (scores.overall === null) return <NothingYet label={label} />

    return (
        <div className="flex flex-col gap-5 sm:gap-6">
            <section className={PANEL}>
                <Headline scores={scores} label={label} />
                <ul className="divide-y divide-neutral-200 border-t border-neutral-200">
                    {AREAS.map((a) => (
                        <li key={a.key}>
                            <AreaRow
                                area={a}
                                score={scores[a.key].score}
                                line={summaryLine(a.key, scores)}
                                onOpen={() => setOpen(a.key)}
                            />
                        </li>
                    ))}
                </ul>
            </section>
            {weeks.length > 1 && <RecentWeeks weeks={weeks} />}
            <p className="px-1 text-[12px] leading-5 text-neutral-500">
                Overall is training {pctOf(AREA_WEIGHTS.training)}, nutrition{' '}
                {pctOf(AREA_WEIGHTS.nutrition)} and body {pctOf(AREA_WEIGHTS.body)}. 80% and up is
                on track. Tap an area to see how it’s counted.
            </p>

            <AreaDrawer
                area="training"
                open={open === 'training'}
                onClose={() => setOpen(null)}
                score={scores.training.score}
            >
                <TrainingDetail scores={scores} />
            </AreaDrawer>
            <AreaDrawer
                area="nutrition"
                open={open === 'nutrition'}
                onClose={() => setOpen(null)}
                score={scores.nutrition.score}
            >
                <NutritionDetail scores={scores} />
            </AreaDrawer>
            <AreaDrawer
                area="body"
                open={open === 'body'}
                onClose={() => setOpen(null)}
                score={scores.body.score}
            >
                <BodyDetail scores={scores} rate={data.rate} />
            </AreaDrawer>
        </div>
    )
}

const pctOf = (n: number) => `${fmtNum(n * 100, 0)}%`

/** One plain sentence per area: the count that matters most. */
function summaryLine(area: AreaKey, scores: Scores): string {
    if (area === 'training') {
        const s = scores.training.sessions
        return s.of === 0 ? 'Nothing planned' : `${s.done} of ${s.of} sessions done`
    }
    if (area === 'nutrition') {
        const n = scores.nutrition
        if (n.calories.of > 0) {
            const protein = n.protein.of > 0 ? `, protein ${n.protein.done} of ${n.protein.of}` : ''
            return `Calories on target ${n.calories.done} of ${n.calories.of} days${protein}`
        }
        return n.meals.of > 0
            ? `${n.meals.done} of ${n.meals.of} meals as planned`
            : 'Not judged yet'
    }
    const w = scores.body.weighIns
    if (w.of === 0) return 'No weigh-ins due'
    return w.done === w.of ? 'Weighing in every week' : 'A weekly weigh-in was missed'
}

// ── Headline ─────────────────────────────────────────────────────────────────

function Headline({ scores, label }: { scores: Scores; label: string }) {
    const overall = scores.overall!
    const band = BAND[scoreBand(overall)]
    const perfect = scores.perfectDays

    return (
        <div className="p-5 sm:p-7">
            <p className={OVERLINE}>{label}</p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="nums text-[56px] font-semibold leading-none tracking-[-0.04em] text-neutral-950 sm:text-[64px]">
                    {overall}
                    <span className="ml-0.5 text-[28px] font-medium tracking-[-0.02em] text-neutral-400">
                        %
                    </span>
                </p>
                <p className={`text-[15px] font-medium ${band.text}`}>{band.label}</p>
            </div>
            <Bar value={overall} className="mt-4" />
            {perfect.of > 0 && (
                <p className="nums mt-3 text-[13px] text-neutral-500">
                    <span className="font-medium text-neutral-900">
                        {perfect.done} of {perfect.of}
                    </span>{' '}
                    {perfect.of === 1 ? 'day' : 'days'} with everything done
                </p>
            )}
        </div>
    )
}

/** A thin bar filled to the score, in its band's colour. */
function Bar({ value, className = '' }: { value: number | null; className?: string }) {
    return (
        <div className={`h-1.5 overflow-hidden rounded-full bg-neutral-100 ${className}`}>
            {value !== null && (
                <div
                    className={`h-full rounded-full ${BAND[scoreBand(value)].bar}`}
                    style={{ width: `${Math.max(value, 2)}%` }}
                />
            )}
        </div>
    )
}

/** A score in its band's colour, or a dash when there's nothing to score. */
function Score({ value, className = '' }: { value: number | null; className?: string }) {
    if (value === null)
        return <p className={`nums font-semibold leading-none text-neutral-300 ${className}`}>—</p>
    return (
        <p
            className={`nums font-semibold leading-none tracking-[-0.03em] ${BAND[scoreBand(value)].text} ${className}`}
        >
            {value}
            <span className="text-[0.6em] font-medium">%</span>
        </p>
    )
}

// ── Areas ────────────────────────────────────────────────────────────────────

function AreaRow({
    area,
    score,
    line,
    onOpen,
}: {
    area: (typeof AREAS)[number]
    score: number | null
    line: string
    onOpen: () => void
}) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-neutral-50 sm:px-7"
        >
            <AreaIcon icon={area.icon} tone={area.tone} />
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-neutral-900">{area.label}</p>
                <p className="nums mt-0.5 truncate text-[13px] text-neutral-500">{line}</p>
            </div>
            <Score value={score} className="text-[22px]" />
            <i
                className="fa-solid fa-chevron-right text-[11px] text-neutral-400"
                aria-hidden="true"
            />
        </button>
    )
}

function AreaDrawer({
    area,
    open,
    onClose,
    score,
    children,
}: {
    area: AreaKey
    open: boolean
    onClose: () => void
    score: number | null
    children: ReactNode
}) {
    const a = AREAS.find((x) => x.key === area)!
    return (
        <Drawer open={open} onClose={onClose} title={a.label} size="lg">
            <div className="flex items-center gap-3">
                <Score value={score} className="text-[40px]" />
                {score !== null && (
                    <p className={`text-[15px] font-medium ${BAND[scoreBand(score)].text}`}>
                        {BAND[scoreBand(score)].label}
                    </p>
                )}
            </div>
            <Bar value={score} className="mt-3" />
            <dl className="mt-5 divide-y divide-neutral-200 border-y border-neutral-200">
                {children}
            </dl>
            <p className={`${OVERLINE} mt-6`}>How it’s counted</p>
            <p className="mt-1.5 text-[13px] leading-5 text-neutral-600">{a.rule}</p>
            <Link
                to={a.to}
                onClick={onClose}
                className="group mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            >
                {a.action}
                <i
                    className="fa-solid fa-arrow-right text-[10px] transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                />
            </Link>
        </Drawer>
    )
}

/** One figure: a label on the left, the number on the right, an optional line under it. */
function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <dt className="min-w-0 pt-px text-[13px] text-neutral-500">{label}</dt>
            <dd className="min-w-0 text-right">
                <p className="nums text-[15px] text-neutral-900">{value}</p>
                {sub && <p className="nums mt-0.5 text-[12px] text-neutral-500">{sub}</p>}
            </dd>
        </div>
    )
}

/** "4 of 5", or what to say when there's nothing to count. */
function RatioRow({
    label,
    ratio,
    unit,
    none,
    sub,
}: {
    label: string
    ratio: Ratio
    unit?: string
    none: string
    sub?: ReactNode
}) {
    if (ratio.of === 0)
        return <Row label={label} value={<span className="text-neutral-400">{none}</span>} />
    return (
        <Row
            label={label}
            value={`${ratio.done} of ${ratio.of}${unit ? ` ${unit}` : ''}`}
            sub={sub}
        />
    )
}

/** "1 over · 2 not logged", leaving out the zeros; null when every part is zero. */
function parts(list: [number, string][]): string | null {
    const kept = list.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`)
    return kept.length ? kept.join(' · ') : null
}

function TrainingDetail({ scores }: { scores: Scores }) {
    const t = scores.training
    return (
        <>
            <RatioRow
                label="Sessions done"
                ratio={t.sessions}
                none="Nothing planned"
                sub={parts([
                    [t.skipped, 'skipped'],
                    [t.missed, 'missed'],
                ])}
            />
            {t.extra > 0 && (
                <Row
                    label="Extra sessions"
                    value={`+${t.extra}`}
                    sub="Not on the plan, never counted against you"
                />
            )}
        </>
    )
}

function NutritionDetail({ scores }: { scores: Scores }) {
    const n = scores.nutrition
    const avg = n.average
    return (
        <>
            <RatioRow
                label="Calories on target"
                ratio={n.calories}
                unit="days"
                none="Not judged yet"
                sub={parts([
                    [n.calories.over, 'over'],
                    [n.calories.under, 'well under'],
                    [n.calories.unlogged, 'not logged'],
                ])}
            />
            <RatioRow label="Protein hit" ratio={n.protein} unit="days" none="Not judged yet" />
            <RatioRow label="Meals eaten as planned" ratio={n.meals} none="Nothing planned" />
            {avg && (
                <Row
                    label="Average day"
                    value={`${kcal(avg.calories)} kcal`}
                    sub={`Target ${kcal(avg.target)}`}
                />
            )}
        </>
    )
}

function BodyDetail({ scores, rate }: { scores: Scores; rate: ConsistencyData['rate'] }) {
    const status = RATE_COPY[rate.status]
    return (
        <>
            <RatioRow
                label="Weigh-in up to date"
                ratio={scores.body.weighIns}
                unit="days"
                none="No weigh-ins due"
            />
            <Row
                label="Weight trend"
                value={
                    rate.actual !== null ? (
                        `${signed(rate.actual, 2)} kg/wk`
                    ) : (
                        <span className="text-neutral-400">—</span>
                    )
                }
                sub={
                    <span
                        className={
                            status.band ? `font-medium ${BAND[status.band].text}` : undefined
                        }
                    >
                        {status.label}
                        {rate.intended ? ` · plan ${signed(rate.intended, 2)} kg/wk` : ''}
                    </span>
                }
            />
        </>
    )
}

// ── Recent weeks ─────────────────────────────────────────────────────────────

function RecentWeeks({ weeks }: { weeks: WeekScore[] }) {
    return (
        <section className={`${PANEL} p-5 sm:p-7`}>
            <h2 className="text-[15px] font-semibold text-neutral-900">Recent weeks</h2>
            <ul className="mt-3 flex flex-col gap-3">
                {weeks.map((w) => (
                    <li key={w.start} className="flex items-center gap-3">
                        <span className="nums w-20 shrink-0 text-[13px] text-neutral-500">
                            {w.current ? 'This week' : fmtDate(w.start)}
                        </span>
                        <Bar value={w.overall} className="flex-1" />
                        <span
                            className={`nums w-10 shrink-0 text-right text-[13px] font-medium ${w.overall === null ? 'text-neutral-300' : BAND[scoreBand(w.overall)].text}`}
                        >
                            {w.overall === null ? '—' : `${w.overall}%`}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// ── Nothing to score ─────────────────────────────────────────────────────────

function NothingYet({ label }: { label: string }) {
    return (
        <section className={`${PANEL} mx-auto max-w-xl p-6 text-center sm:p-10`}>
            <div className="flex justify-center">
                <AreaIcon icon="fa-solid fa-gauge-high" tone="coral" />
            </div>
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-neutral-900">
                Nothing to score yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
                {label} had no sessions planned, no meals on the plan and no weigh-ins due. Plan a
                week and the numbers start here.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                    { to: '/fitness', text: 'Plan training' },
                    { to: '/nutrition', text: 'Plan meals' },
                ].map((l) => (
                    <Link
                        key={l.to}
                        to={l.to}
                        className="inline-flex h-9 items-center rounded-[10px] border border-neutral-200 bg-white px-3.5 text-[13px] font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
                    >
                        {l.text}
                    </Link>
                ))}
            </div>
        </section>
    )
}
