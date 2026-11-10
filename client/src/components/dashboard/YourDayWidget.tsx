import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AREA_TONES, AreaIcon, DASH, DASH_CARD, SectionLoading, type AreaTone } from './DashSection'
import { useNutritionToday, type NutritionToday } from './useNutritionToday'
import { listPlanEntries } from '../../services/fitnessPlan'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { checkGarminRunsQuietly, GARMIN_RUNS_LINKED } from '../../services/garmin'
import { listHabits, listLogs as listHabitLogs, checkHabit, uncheckHabit } from '../../services/habits'
import { listWalks, type Walk } from '../../services/walks'
import { walkDayItems } from '../../lib/walking'
import { useDataVersion, useInvalidate } from '../../context/DataSyncContext'
import { useAuth } from '../../context/AuthContext'
import { WEEKDAYS_LONG, parseDateKey, todayKey } from '../../lib/calendar'
import { iconForHabit } from '../../lib/habitIcons'
import {
    DAY_PARTS,
    isTask,
    sessionKey,
    yourDay,
    type DayPart,
    type DayStep,
    type StepKind,
    type YourDay,
} from '../../lib/yourDay'
import type { FitnessPlanEntry, HabitDef } from '../../types'

const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** The area each kind of step belongs to, as a tag on its row: same hue as that area everywhere else. */
const KIND_TAG: Partial<Record<StepKind, { label: string; tone: AreaTone }>> = {
    weigh: { label: 'Body', tone: 'navy' },
    training: { label: 'Training', tone: 'violet' },
    rest: { label: 'Rest', tone: 'violet' },
    walk: { label: 'Walk', tone: 'green' },
    meal: { label: 'Meals', tone: 'orange' },
    'plan-meals': { label: 'Meals', tone: 'orange' },
    protein: { label: 'Meals', tone: 'orange' },
    calories: { label: 'Meals', tone: 'orange' },
}

/** Where each kind of step is done, and what the Next up button says. */
const ACTION: Record<StepKind, { to: string; label: string }> = {
    weigh: { to: '/fitness?tab=body', label: 'Weigh in' },
    training: { to: '/fitness', label: 'Open the planner' },
    rest: { to: '/fitness', label: 'Open the planner' },
    walk: { to: '/walking', label: 'Open the walk' },
    meal: { to: '/nutrition', label: 'Open meals' },
    'plan-meals': { to: '/nutrition', label: 'Plan meals' },
    protein: { to: '/nutrition', label: 'Open meals' },
    calories: { to: '/nutrition', label: 'Open meals' },
    habit: { to: '/goals', label: 'Tick it off' },
}

function minutesNow(): number {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
}

/** The minute, kept current so "now" and "next" move through the day by themselves. */
function useMinutes(): number {
    const [now, setNow] = useState(minutesNow)
    useEffect(() => {
        const id = window.setInterval(() => setNow(minutesNow()), 60_000)
        return () => window.clearInterval(id)
    }, [])
    return now
}

interface DayRecords {
    training: FitnessPlanEntry[]
    logged: Set<string>
    habits: HabitDef[]
    habitsDone: Set<string>
    walks: Walk[]
}

/** The day's training, what's been logged, and the habits. */
function useDayRecords(date: string) {
    // Refetched when habits change elsewhere — keeping what's shown meanwhile, so a tick doesn't flash.
    const habitsVersion = useDataVersion('habits')
    // Bumped when a finished run is linked from Garmin and ticks a session off.
    const [runsVersion, setRunsVersion] = useState(0)
    useEffect(() => {
        const bump = () => setRunsVersion((v) => v + 1)
        window.addEventListener(GARMIN_RUNS_LINKED, bump)
        return () => window.removeEventListener(GARMIN_RUNS_LINKED, bump)
    }, [])
    const [state, setState] = useState<{ date: string; records: DayRecords } | null>(null)

    useEffect(() => {
        let active = true
        const range = { from: date, to: date }
        Promise.all([
            listPlanEntries(date, date).catch(() => [] as FitnessPlanEntry[]),
            listWorkoutLogs(range).catch(() => []),
            listConditioningLogs(range).catch(() => []),
            listHabits().catch(() => [] as HabitDef[]),
            listHabitLogs(date, date).catch(() => []),
            listWalks(date, date).catch(() => [] as Walk[]),
        ]).then(([training, workouts, sessions, habits, habitLogs, walks]) => {
            if (!active) return
            const logged = new Set<string>()
            for (const l of workouts) if (l.workout && l.date === date) logged.add(sessionKey('workout', l.workout))
            for (const l of sessions) if (l.session && l.date === date) logged.add(sessionKey('conditioning', l.session))
            // A session still to tick off today or earlier: see if its run is on Garmin yet.
            const waiting = training.some(
                (e) => e.kind === 'conditioning' && e.session && !e.skipped && !logged.has(sessionKey('conditioning', e.session._id))
            )
            if (waiting && date <= todayKey()) void checkGarminRunsQuietly(date, date)
            setState({
                date,
                records: {
                    training,
                    logged,
                    habits: habits.filter((h) => h.active).sort((a, b) => a.order - b.order),
                    habitsDone: new Set(habitLogs.filter((l) => l.completed && l.date === date).map((l) => l.habit)),
                    walks,
                },
            })
        })
        return () => {
            active = false
        }
    }, [date, habitsVersion, runsVersion])

    const current = state?.date === date ? state.records : null
    return { records: current, setRecords: setState }
}

/**
 * Your day: what to do to make today a perfect one, across the whole width at
 * the top of the dashboard — the one place today lives. The next thing to do
 * on the left; the day in order beside it, training, meals and habits each in
 * its part of the day; protein and calories up by the score. Habits tick
 * here; everything else opens where it's done.
 */
export default function YourDayWidget({
    date,
    aside,
}: {
    date: string
    /** Cards to sit beside the plan on wide screens (Home passes steps and weather). */
    aside?: ReactNode
}) {
    const today = todayKey()
    const nowMin = useMinutes()
    const invalidate = useInvalidate()
    const nutrition = useNutritionToday(date)
    const { records, setRecords } = useDayRecords(date)
    const selection = useAuth().user?.settings?.perfectDay

    const day = useMemo<YourDay | null>(() => {
        if (!records || nutrition.loading) return null
        return yourDay({
            date,
            today,
            nowMin,
            ...records,
            walks: walkDayItems(records.walks, nutrition.weightLogs[nutrition.weightLogs.length - 1]?.weight ?? null),
            meals: nutrition.entries,
            goals: nutrition.goals,
            eaten: nutrition.eaten,
            weightLogs: nutrition.weightLogs,
            weightRate: nutrition.ratePerWeek,
            selection,
        })
    }, [records, nutrition, date, today, nowMin, selection])

    async function toggleHabit(habitId: string) {
        if (!records) return
        const wasDone = records.habitsDone.has(habitId)
        const flip = (done: boolean) =>
            setRecords((prev) => {
                if (!prev) return prev
                const next = new Set(prev.records.habitsDone)
                if (done) next.add(habitId)
                else next.delete(habitId)
                return { date: prev.date, records: { ...prev.records, habitsDone: next } }
            })
        flip(!wasDone)
        try {
            if (wasDone) await uncheckHabit(habitId, date)
            else await checkHabit(habitId, date)
            invalidate('habits')
        } catch {
            flip(wasDone)
        }
    }

    const habitIcons = useMemo(
        () => new Map((records?.habits ?? []).map((h) => [h._id, iconForHabit(h.name, h.icon)])),
        [records?.habits]
    )

    if (!day)
        return (
            <section className="min-w-0" aria-label="Your day">
                <div className={DASH_CARD}>
                    <Title summary={null} />
                </div>
                <div className="mt-5 grid items-start gap-5 lg:grid-cols-12">
                    <div className={`${DASH_CARD} lg:col-span-8`}>
                        <SectionLoading rows={5} />
                    </div>
                    {aside && <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">{aside}</div>}
                </div>
            </section>
        )

    const row = (s: DayStep) => (
        <StepRow
            key={s.id}
            step={s}
            isNext={day.next?.id === s.id}
            icon={s.habitId ? habitIcons.get(s.habitId) : undefined}
            onTick={toggleHabit}
        />
    )
    const anyTime = day.steps.filter((s) => s.part === null && s.kind !== 'protein' && s.kind !== 'calories')

    return (
        <section className="min-w-0" aria-label="Your day">
            {/* The day's score and targets in one strip, so the state of today reads first. */}
            <div className={`${DASH_CARD} flex flex-wrap items-center justify-between gap-x-10 gap-y-5`}>
                <div className="flex min-w-0 items-center gap-4">
                    {day.total > 0 && <ScoreRing day={day} />}
                    <Title summary={summaryOf(day, date, today)} />
                </div>
                <div className="flex w-full items-end gap-5 sm:w-auto sm:gap-8">
                    <Targets day={day} nutrition={nutrition} />
                </div>
            </div>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-12">
                <div className={`${DASH_CARD} min-w-0 !p-2 sm:!p-2 lg:col-span-8`}>
                    <NextUp day={day} date={date} today={today} onTick={toggleHabit} />
                    <div className="flex flex-col gap-5 px-3 pb-3 pt-5 sm:px-4">
                        {DAY_PARTS.map((part) => (
                            <PartGroup key={part} label={PART_LABEL[part]} part={part} day={day}>
                                {day.steps.filter((s) => s.part === part).map(row)}
                            </PartGroup>
                        ))}
                        {anyTime.length > 0 && (
                            <PartGroup label="Any time" day={day} steps={anyTime}>
                                {anyTime.map(row)}
                            </PartGroup>
                        )}
                    </div>
                </div>
                {aside && <div className="flex min-w-0 flex-col gap-5 lg:col-span-4">{aside}</div>}
            </div>
        </section>
    )
}

function summaryOf(day: YourDay, date: string, today: string): string {
    if (day.total === 0) return date >= today ? 'Nothing planned yet.' : 'Nothing was planned.'
    if (day.perfect) return date === today ? 'A perfect day — everything’s done.' : 'A perfect day.'
    if (date > today) return `${day.total} ${day.total === 1 ? 'thing' : 'things'} planned`
    if (date < today) return `${day.done} of ${day.total} done`
    const missed = day.steps.filter((s) => s.state === 'missed').length
    if (missed) return `${missed} skipped · ${day.steps.filter((s) => s.state === 'todo').length} still to do`
    return `${day.total - day.done} to go for a perfect day`
}

function Title({ summary }: { summary: string | null }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <AreaIcon icon="fa-solid fa-list-check" tone="coral" />
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-[-0.015em] text-neutral-900">Your day</h2>
                    <Link
                        to="/perfect-day"
                        className="grid h-7 w-7 place-items-center rounded-full text-[13px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        aria-label="Choose what makes a perfect day"
                        title="Choose what makes a perfect day"
                    >
                        <i className="fa-solid fa-sliders" aria-hidden="true" />
                    </Link>
                </div>
                {summary && <p className="mt-0.5 truncate text-[13px] text-neutral-500">{summary}</p>}
            </div>
        </div>
    )
}

/** Protein to reach and calories to stay within, each a figure and a hairline bar. */
function Targets({ day, nutrition }: { day: YourDay; nutrition: NutritionToday }) {
    const goals = nutrition.goals
    const meters = [
        { kind: 'protein' as const, label: 'Protein', value: nutrition.eaten.protein, goal: goals?.protein, unit: ' g' },
        { kind: 'calories' as const, label: 'Calories', value: nutrition.eaten.calories, goal: goals?.calories, unit: '' },
    ].flatMap((m) => {
        const step = day.steps.find((s) => s.kind === m.kind)
        return step && m.goal ? [{ ...m, goal: m.goal, state: step.state }] : []
    })
    return (
        <>
            {meters.map((m) => (
                <Link key={m.kind} to="/nutrition" className="group block min-w-0 flex-1 sm:w-36 sm:flex-none">
                    <p className="text-[12px] text-neutral-500 group-hover:text-neutral-900">{m.label}</p>
                    <p className="nums mt-0.5 truncate text-[15px] font-medium text-neutral-900">
                        {Math.round(m.value).toLocaleString('en-GB')}
                        <span className="font-normal text-neutral-500">
                            {' '}
                            / {Math.round(m.goal).toLocaleString('en-GB')}
                            {m.unit}
                        </span>
                    </p>
                    <div className={`mt-1.5 ${DASH.track}`}>
                        <div
                            className={`h-full rounded-full ${
                                m.state === 'over' ? 'bg-danger' : m.state === 'done' ? 'bg-success' : 'bg-neutral-900'
                            }`}
                            style={{ width: `${Math.min(100, (m.value / m.goal) * 100)}%` }}
                        />
                    </div>
                </Link>
            ))}
        </>
    )
}

/** Done out of total as a ring, with the count in the middle. */
function ScoreRing({ day }: { day: YourDay }) {
    const r = 21
    const length = 2 * Math.PI * r
    const share = day.total ? day.done / day.total : 0
    return (
        <div className="relative grid h-14 w-14 shrink-0 place-items-center" role="img" aria-label={`${day.done} of ${day.total} done`}>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 52 52" aria-hidden="true">
                <circle cx="26" cy="26" r={r} fill="none" strokeWidth="5" className="stroke-neutral-200" />
                <circle
                    cx="26"
                    cy="26"
                    r={r}
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className={`${day.perfect ? 'stroke-success' : 'stroke-neutral-900'} transition-[stroke-dasharray] duration-500`}
                    strokeDasharray={`${Math.max(share * length, share > 0 ? 1 : 0)} ${length}`}
                />
            </svg>
            <span className="tabular-nums text-[13px] font-medium text-neutral-900">
                {day.done}/{day.total}
            </span>
        </div>
    )
}

// ── Next up ──────────────────────────────────────────────────────────────────

function NextUp({
    day,
    date,
    today,
    onTick,
}: {
    day: YourDay
    date: string
    today: string
    onTick: (habitId: string) => void
}) {
    const panel = 'rounded-2xl p-5 sm:p-6'
    const overline = 'text-[11px] font-medium uppercase tracking-[0.06em]'
    if (date !== today) {
        const { year, month, day: dayOfMonth } = parseDateKey(date)
        const weekday = WEEKDAYS_LONG[new Date(year, month, dayOfMonth).getDay()]
        return (
            <div className={`${panel} bg-neutral-100`}>
                <p className={`${overline} text-neutral-500`}>{date > today ? 'Coming up' : 'Looking back'}</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">{weekday}</p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">
                    {date > today ? 'What’s planned for the day, in order.' : `${day.done} of ${day.total} done that day.`}
                </p>
            </div>
        )
    }

    if (day.perfect)
        return (
            <div className={`${panel} bg-success-bg`}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-success text-white" aria-hidden="true">
                    <i className="fa-solid fa-check" />
                </span>
                <p className="mt-4 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">Perfect day</p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">Everything’s done. Enjoy the rest of it.</p>
            </div>
        )

    const next = day.next
    if (!next) {
        const over = day.steps.some((s) => s.state === 'over')
        const missed = day.steps.some((s) => s.state === 'missed')
        return (
            <div className={`${panel} bg-neutral-100`}>
                <p className={`${overline} text-neutral-500`}>Next up</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">
                    {over || missed ? 'Nothing left to tick' : 'Nothing planned'}
                </p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">
                    {over
                        ? 'Calories ran over today — keep the rest of it light.'
                        : missed
                          ? 'A meal was skipped, so not a perfect one — tomorrow’s a fresh start.'
                          : 'Plan some training or meals and they’ll show here.'}
                </p>
            </div>
        )
    }

    const action = ACTION[next.kind]
    const button =
        'flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 sm:w-auto'
    return (
        <div className={`${panel} flex flex-col gap-5 bg-neutral-900 text-white sm:flex-row sm:items-end sm:justify-between`}>
            <div className="min-w-0">
                <p className={`${overline} flex items-center gap-2 text-neutral-500`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-coral-400" aria-hidden="true" />
                    Next up · {next.part ? PART_LABEL[next.part] : 'Any time'}
                </p>
                <p className="mt-2.5 text-2xl font-semibold leading-tight tracking-[-0.025em]">
                    {next.kind === 'protein' ? `Get to ${next.title}` : next.title}
                </p>
                {next.detail && <p className="mt-1.5 text-[14px] leading-6 text-neutral-300">{next.detail}</p>}
            </div>
            {next.habitId ? (
                <button type="button" className={button} onClick={() => onTick(next.habitId!)}>
                    <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                    {action.label}
                </button>
            ) : (
                <Link to={next.to ?? action.to} className={button}>
                    {action.label}
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            )}
        </div>
    )
}

// ── The day in order ─────────────────────────────────────────────────────────

/** One part of the day as a group: its name, Now when it's the current one, a count, then its steps. */
function PartGroup({
    label,
    part,
    day,
    steps,
    children,
}: {
    label: string
    part?: DayPart
    day: YourDay
    /** The group's steps, when it isn't a part of the day (Any time). */
    steps?: DayStep[]
    children: ReactNode[]
}) {
    const now = part !== undefined && day.nowPart === part
    const passed =
        part !== undefined && day.nowPart !== null && DAY_PARTS.indexOf(part) < DAY_PARTS.indexOf(day.nowPart)
    const own = (steps ?? day.steps.filter((s) => s.part === part)).filter(isTask)
    const done = own.filter((s) => s.state === 'done').length
    return (
        <div className="min-w-0">
            <div className="mb-1 flex h-6 items-center gap-2 px-2">
                <p className={`text-[13px] font-semibold ${passed ? 'text-neutral-500' : 'text-neutral-700'}`}>{label}</p>
                {now && (
                    <span className="inline-flex h-5 items-center rounded-full bg-coral-50 px-2 text-[11px] font-semibold text-coral-700">
                        Now
                    </span>
                )}
                {own.length > 0 && (
                    <span className="tabular-nums ml-auto text-[12px] text-neutral-500">
                        {done} of {own.length}
                    </span>
                )}
            </div>
            {children.length === 0 ? (
                <p className="rounded-xl px-2 py-3 text-[14px] text-neutral-500">Nothing planned</p>
            ) : (
                <ul className="flex flex-col">{children}</ul>
            )}
        </div>
    )
}

/** One step. A habit ticks where it stands; anything else opens the page where it's done. */
function StepRow({
    step,
    isNext,
    icon,
    onTick,
}: {
    step: DayStep
    isNext: boolean
    /** A habit's own icon, shown quietly so habits read apart from meals and training. */
    icon?: string
    onTick: (habitId: string) => void
}) {
    const quiet = step.state === 'done' || step.state === 'handled'
    const tag = KIND_TAG[step.kind]
    const body = (
        <>
            <StateMark step={step} isNext={isNext} />
            <div className="min-w-0 flex-1">
                <p
                    className={`truncate text-[15px] ${
                        quiet ? 'text-neutral-500' : 'text-neutral-900'
                    } ${isNext ? 'font-medium' : ''}`}
                >
                    {step.title}
                </p>
                {step.detail && (
                    <p className="mt-0.5 truncate text-[13px] text-neutral-500">{step.detail}</p>
                )}
            </div>
            {icon ? (
                <i className={`${icon} shrink-0 pt-1 text-xs text-neutral-500`} aria-hidden="true" />
            ) : (
                tag && (
                    <span
                        className={`mt-0.5 hidden h-6 shrink-0 items-center rounded-full px-2.5 text-[12px] font-medium sm:inline-flex ${AREA_TONES[tag.tone].tile}`}
                    >
                        {tag.label}
                    </span>
                )
            )}
        </>
    )
    const cls = `group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50 ${
        isNext ? 'bg-coral-50/60 hover:bg-coral-50' : ''
    }`
    return (
        <li className="border-t border-neutral-100 first:border-t-0">
            {step.habitId ? (
                <button
                    type="button"
                    className={cls}
                    aria-pressed={step.state === 'done'}
                    onClick={() => onTick(step.habitId!)}
                >
                    {body}
                </button>
            ) : (
                <Link to={step.to ?? ACTION[step.kind].to} className={cls}>
                    {body}
                </Link>
            )}
        </li>
    )
}

/** Done, to do (ringed in coral when it's next), over, skipped, not happening — or an icon for context. */
function StateMark({ step, isNext }: { step: DayStep; isNext: boolean }) {
    const box = 'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]'
    if (step.state === 'done')
        return (
            <span className={`${box} bg-success text-white`} aria-label="Done">
                <i className="fa-solid fa-check" aria-hidden="true" />
            </span>
        )
    if (step.state === 'over')
        return (
            <span className={`${box} bg-danger-bg text-danger`} aria-label="Over">
                <i className="fa-solid fa-exclamation" aria-hidden="true" />
            </span>
        )
    if (step.state === 'missed')
        return (
            <span className={`${box} bg-danger-bg text-danger`} aria-label="Skipped">
                <i className="fa-solid fa-xmark" aria-hidden="true" />
            </span>
        )
    if (step.state === 'handled')
        return (
            <span className={`${box} bg-neutral-100 text-neutral-500`} aria-label="Not happening">
                <i className="fa-solid fa-minus" aria-hidden="true" />
            </span>
        )
    if (step.state === 'info')
        return (
            <span className={`${box} text-neutral-500`} aria-hidden="true">
                <i className={'fa-solid fa-mug-hot'} />
            </span>
        )
    return (
        <span
            className={`${box} ring-[1.5px] ring-inset ${isNext ? 'ring-coral-500' : 'ring-neutral-300 group-hover:ring-neutral-500'}`}
            aria-label={isNext ? 'Next' : 'To do'}
        >
            {isNext && <span className="h-2 w-2 rounded-full bg-coral-500" />}
        </span>
    )
}
