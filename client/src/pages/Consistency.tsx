import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import Spinner from '../components/Spinner'
import Alert from '../components/Alert'
import PillToggle from '../components/PillToggle'
import { AreaIcon, type AreaTone } from '../components/dashboard/DashSection'
import { OVERLINE, PANEL } from '../components/lifeplan/ui'
import { fmtDate, fmtNum, kcal, signed } from '../components/timeline/format'
import { useConsistency, type ConsistencyData } from '../components/consistency/useConsistency'
import { addDays } from '../lib/calendar'
import { impliedWeeklyRate } from '../lib/energy'
import type { RateStatus } from '../lib/weightTrend'
import {
    AREA_WEIGHTS,
    scoreBand,
    summarise,
    weekScores,
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

const BAND: Record<ScoreBand, { label: string; text: string }> = {
    good: { label: 'On track', text: 'text-success' },
    fair: { label: 'Close', text: 'text-amber-600' },
    low: { label: 'Off track', text: 'text-coral-600' },
}

const AREAS: { key: 'training' | 'nutrition' | 'body'; label: string; icon: string; tone: AreaTone }[] = [
    { key: 'training', label: 'Training', icon: 'fa-solid fa-dumbbell', tone: 'coral' },
    { key: 'nutrition', label: 'Nutrition', icon: 'fa-solid fa-bowl-food', tone: 'green' },
    { key: 'body', label: 'Body', icon: 'fa-solid fa-weight-scale', tone: 'sky' },
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
                    <p className="mt-1 text-sm text-neutral-500">How closely you’re sticking to the plan, in numbers.</p>
                </div>
                <PillToggle
                    label="Period"
                    options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
                    value={period}
                    onChange={setPeriod}
                />
            </header>

            {error ? (
                <Alert variant="danger">Couldn’t load your training and meals. Please try again shortly.</Alert>
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
    const scores = useMemo(() => {
        const from = addDays(today, -(period - 1))
        return summarise(
            records.filter((d) => d.date >= from),
            today
        )
    }, [records, today, period])
    const weeks = useMemo(() => {
        const all = weekScores(records, today, 8)
        // Drop the empty weeks from before there was anything to score.
        let end = all.length
        while (end > 1 && all[end - 1].overall === null) end -= 1
        return all.slice(0, end)
    }, [records, today])
    const label = PERIODS.find((p) => p.value === period)!.long

    if (scores.overall === null) return <NothingYet label={label} />

    return (
        <div className="flex flex-col gap-6 sm:gap-8">
            <Overview scores={scores} label={label} />
            <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
                <TrainingPanel scores={scores} />
                <NutritionPanel scores={scores} />
                <BodyPanel scores={scores} rate={data.rate} />
            </div>
            <WeekTable weeks={weeks} />
            <HowItsScored />
        </div>
    )
}

// ── Overview ─────────────────────────────────────────────────────────────────

function Overview({ scores, label }: { scores: Scores; label: string }) {
    const overall = scores.overall!
    const band = BAND[scoreBand(overall)]
    const perfect = scores.perfectDays

    return (
        <section className={`${PANEL} p-5 sm:p-7`}>
            <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
                <div className="min-w-0">
                    <p className={OVERLINE}>{label}</p>
                    <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <p className="nums text-[56px] font-semibold leading-none tracking-[-0.04em] text-neutral-950 sm:text-[64px]">
                            {overall}
                            <span className="ml-0.5 text-[28px] font-medium tracking-[-0.02em] text-neutral-400">%</span>
                        </p>
                        <p className={`text-[15px] font-medium ${band.text}`}>{band.label}</p>
                    </div>
                    {perfect.of > 0 && (
                        <p className="nums mt-3 text-[13px] text-neutral-500">
                            <span className="font-medium text-neutral-900">
                                {perfect.done} of {perfect.of}
                            </span>{' '}
                            {perfect.of === 1 ? 'day' : 'days'} with everything done
                        </p>
                    )}
                </div>
                <div className="grid w-full grid-cols-3 gap-4 sm:w-auto sm:gap-0 sm:divide-x sm:divide-neutral-200">
                    {AREAS.map((a) => (
                        <div key={a.key} className="min-w-0 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                            <p className="flex items-center gap-1.5 text-[13px] text-neutral-500">
                                <AreaIcon icon={a.icon} tone={a.tone} size="sm" />
                                <span className="truncate">{a.label}</span>
                            </p>
                            <Score value={scores[a.key].score} className="mt-2 text-[28px]" />
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

/** A score in its band's colour, or a dash when there's nothing to score. */
function Score({ value, className = '' }: { value: number | null; className?: string }) {
    if (value === null) return <p className={`nums font-semibold leading-none text-neutral-300 ${className}`}>—</p>
    return (
        <p className={`nums font-semibold leading-none tracking-[-0.03em] ${BAND[scoreBand(value)].text} ${className}`}>
            {value}
            <span className="text-[0.6em] font-medium">%</span>
        </p>
    )
}

// ── Area panels ──────────────────────────────────────────────────────────────

function AreaPanel({
    area,
    score,
    to,
    action,
    children,
}: {
    area: (typeof AREAS)[number]['key']
    score: number | null
    to: string
    action: string
    children: ReactNode
}) {
    const a = AREAS.find((x) => x.key === area)!
    return (
        <section className={`${PANEL} flex min-w-0 flex-col p-5`}>
            <div className="flex items-center gap-3">
                <AreaIcon icon={a.icon} tone={a.tone} />
                <h2 className="min-w-0 flex-1 text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">
                    {a.label}
                </h2>
                <Score value={score} className="text-[24px]" />
            </div>
            <dl className="mt-4 flex-1 divide-y divide-neutral-200 border-y border-neutral-200">{children}</dl>
            <Link
                to={to}
                className="group mt-4 inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
            >
                {action}
                <i
                    className="fa-solid fa-arrow-right text-[10px] transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                />
            </Link>
        </section>
    )
}

/** One figure: a label on the left, the number on the right, an optional line under it. */
function Row({ label, value, pct, sub }: { label: string; value: ReactNode; pct?: number | null; sub?: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <dt className="min-w-0 pt-px text-[13px] text-neutral-500">{label}</dt>
            <dd className="min-w-0 text-right">
                <p className="nums flex items-baseline justify-end gap-2 text-[15px] text-neutral-900">
                    <span>{value}</span>
                    {pct !== undefined && (
                        <span
                            className={`w-10 shrink-0 text-[13px] font-medium ${pct === null ? 'text-neutral-300' : BAND[scoreBand(pct)].text}`}
                        >
                            {pct === null ? '—' : `${pct}%`}
                        </span>
                    )}
                </p>
                {sub && <p className="nums mt-0.5 text-[12px] text-neutral-500">{sub}</p>}
            </dd>
        </div>
    )
}

function RatioRow({
    label,
    ratio,
    unit,
    none,
    noneSub,
    sub,
}: {
    label: string
    ratio: Ratio
    unit?: string
    /** What to say with nothing to count, and the line under it. */
    none: string
    noneSub?: string
    sub?: ReactNode
}) {
    if (ratio.of === 0) return <Row label={label} value={<span className="text-neutral-400">{none}</span>} sub={noneSub} />
    return (
        <Row
            label={label}
            value={`${ratio.done} of ${ratio.of}${unit ? ` ${unit}` : ''}`}
            pct={ratio.pct}
            sub={sub}
        />
    )
}

/** "1 over · 2 not logged", leaving out the zeros; null when every part is zero. */
function parts(list: [number, string][]): string | null {
    const kept = list.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`)
    return kept.length ? kept.join(' · ') : null
}

function TrainingPanel({ scores }: { scores: Scores }) {
    const t = scores.training
    return (
        <AreaPanel area="training" score={t.score} to="/fitness" action="Open the planner">
            <RatioRow
                label="Sessions done"
                ratio={t.sessions}
                none="Nothing planned"
                sub={parts([
                    [t.skipped, 'skipped'],
                    [t.missed, 'missed'],
                ])}
            />
            {t.strength.of > 0 && <RatioRow label="Strength" ratio={t.strength} none="" />}
            {t.conditioning.of > 0 && <RatioRow label="Conditioning" ratio={t.conditioning} none="" />}
            {t.extra > 0 && (
                <Row label="Extra sessions" value={`+${t.extra}`} sub="Logged, not on the plan" />
            )}
        </AreaPanel>
    )
}

function NutritionPanel({ scores }: { scores: Scores }) {
    const n = scores.nutrition
    const avg = n.average
    const implied = n.balance ? impliedWeeklyRate(n.balance.kcal) : null
    return (
        <AreaPanel area="nutrition" score={n.score} to="/nutrition" action="Open meals">
            <RatioRow
                label="Calories on target"
                ratio={n.calories}
                unit="days"
                none="Not judged yet"
                noneSub="Once a logged day’s over"
                sub={parts([
                    [n.calories.over, 'over'],
                    [n.calories.under, 'well under'],
                    [n.calories.unlogged, 'not logged'],
                ])}
            />
            <RatioRow
                label="Protein hit"
                ratio={n.protein}
                unit="days"
                none="Not judged yet"
                sub={parts([[n.protein.unlogged, 'not logged']])}
            />
            <RatioRow label="Meals as planned" ratio={n.meals} none="Nothing planned" sub="Ticked eaten" />
            {avg && (
                <Row
                    label="Average day"
                    value={`${kcal(avg.calories)} kcal`}
                    sub={`Target ${kcal(avg.target)} · ${signed(((avg.calories - avg.target) / avg.target) * 100)}%`}
                />
            )}
            {avg && (
                <Row
                    label="Average protein"
                    value={`${avg.protein} g`}
                    sub={avg.proteinTarget ? `Target ${avg.proteinTarget} g` : undefined}
                />
            )}
            {n.balance && (
                <Row
                    label="Balance"
                    value={`${signed(n.balance.kcal)} kcal a day`}
                    sub={`${implied !== null ? `≈ ${signed(implied, 2)} kg/wk · ` : ''}${n.balance.days} ${n.balance.days === 1 ? 'day' : 'days'} with calories out`}
                />
            )}
            {n.extras > 0 && <Row label="Off-plan extras" value={n.extras} sub="“Also ate”" />}
        </AreaPanel>
    )
}

function BodyPanel({ scores, rate }: { scores: Scores; rate: ConsistencyData['rate'] }) {
    const status = RATE_COPY[rate.status]
    return (
        <AreaPanel area="body" score={scores.body.score} to="/fitness?tab=body" action="Weigh in">
            <RatioRow
                label="Weighed in weekly"
                ratio={scores.body.weighIns}
                unit="days"
                none="Not weighing in"
                sub="Within a week of a weigh-in"
            />
            <Row
                label="Weight trend"
                value={rate.actual !== null ? `${signed(rate.actual, 2)} kg/wk` : <span className="text-neutral-400">—</span>}
                sub="Last 4 weeks"
            />
            <Row
                label="The plan"
                value={rate.intended ? `${signed(rate.intended, 2)} kg/wk` : <span className="text-neutral-400">—</span>}
                sub={
                    <span className={status.band ? `font-medium ${BAND[status.band].text}` : undefined}>
                        {status.label}
                    </span>
                }
            />
        </AreaPanel>
    )
}

// ── Week by week ─────────────────────────────────────────────────────────────

function WeekTable({ weeks }: { weeks: WeekScore[] }) {
    const cell = (value: number | null) =>
        value === null ? (
            <span className="text-neutral-300">—</span>
        ) : (
            <span className={`font-medium ${BAND[scoreBand(value)].text}`}>{value}%</span>
        )

    return (
        <section className={PANEL}>
            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Week by week</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">Monday to Sunday. This week counts what’s done so far.</p>
            </div>
            <div className="mt-3 overflow-x-auto pb-2">
                <table className="nums w-full text-[13px]">
                    <thead>
                        <tr className="text-left text-neutral-500">
                            <th scope="col" className="py-2.5 pl-4 pr-2 font-medium sm:pl-6 sm:pr-3">
                                Week
                            </th>
                            {AREAS.map((a) => (
                                <th key={a.key} scope="col" className="px-2 py-2.5 text-right font-medium sm:px-3">
                                    {/* The area's icon on a phone, where five worded columns won't fit. */}
                                    <span className="inline-flex sm:hidden" title={a.label}>
                                        <AreaIcon icon={a.icon} tone={a.tone} size="sm" />
                                        <span className="sr-only">{a.label}</span>
                                    </span>
                                    <span className="hidden sm:inline">{a.label}</span>
                                </th>
                            ))}
                            <th scope="col" className="py-2.5 pl-2 pr-4 text-right font-medium sm:pl-3 sm:pr-6">
                                Overall
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 border-t border-neutral-200">
                        {weeks.map((w) => (
                            <tr key={w.start} className={w.current ? 'bg-neutral-50' : undefined}>
                                <th scope="row" className="whitespace-nowrap py-3 pl-4 pr-2 text-left font-normal sm:pl-6 sm:pr-3">
                                    <span className="text-[15px] text-neutral-900">
                                        {w.current ? 'This week' : fmtDate(w.start)}
                                    </span>
                                    {w.current && <span className="ml-1.5 hidden text-neutral-500 sm:inline">so far</span>}
                                </th>
                                {AREAS.map((a) => (
                                    <td key={a.key} className="px-2 py-3 text-right sm:px-3">
                                        {cell(w[a.key])}
                                    </td>
                                ))}
                                <td className="py-3 pl-2 pr-4 text-right text-[15px] sm:pl-3 sm:pr-6">{cell(w.overall)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}

// ── How it's scored ──────────────────────────────────────────────────────────

function HowItsScored() {
    const pct = (n: number) => `${fmtNum(n * 100, 0)}%`
    const lines: [string, string][] = [
        [
            'Training',
            'Planned sessions logged, that day or a day either side. A skipped session counts as not done; extra sessions never count against you.',
        ],
        [
            'Nutrition',
            'The average of three: days on calories (judged as the planner judges them), days protein’s hit (from 95%), and planned meals ticked eaten. A day with nothing ticked is a miss; a day away isn’t judged.',
        ],
        [
            'Body',
            'At least one weigh-in a week: each day counts when there’s been one in the 7 days up to it. Weight trend and the plan’s rate are shown, not scored.',
        ],
        [
            'Overall',
            `Training ${pct(AREA_WEIGHTS.training)}, nutrition ${pct(AREA_WEIGHTS.nutrition)}, body ${pct(AREA_WEIGHTS.body)}. Today counts what’s done; nothing today is a miss until it’s over.`,
        ],
    ]
    return (
        <section className="px-1">
            <p className={OVERLINE}>How it’s scored</p>
            <dl className="mt-3 grid gap-x-8 gap-y-3 text-[13px] leading-5 sm:grid-cols-2">
                {lines.map(([term, text]) => (
                    <div key={term}>
                        <dt className="font-medium text-neutral-900">{term}</dt>
                        <dd className="text-neutral-500">{text}</dd>
                    </div>
                ))}
            </dl>
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
            <h2 className="mt-4 text-xl font-semibold tracking-[-0.02em] text-neutral-900">Nothing to score yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-600">
                {label} had no sessions planned, no meals on the plan and no weigh-ins due. Plan a week and the numbers
                start here.
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
