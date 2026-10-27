import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AreaIcon, DASH, SectionLoading } from './DashSection'
import { useNutritionToday, type NutritionToday } from './useNutritionToday'
import { useDayEvents } from './useDayEvents'
import { listPlanEntries } from '../../services/fitnessPlan'
import { listLogs as listWorkoutLogs } from '../../services/workoutLogs'
import { listLogs as listConditioningLogs } from '../../services/conditioningLogs'
import { listHabits, listLogs as listHabitLogs, checkHabit, uncheckHabit } from '../../services/habits'
import { useDataVersion, useInvalidate } from '../../context/DataSyncContext'
import { useAuth } from '../../context/AuthContext'
import { PERIODS, WEEKDAYS_LONG, eventCoversAllDay, eventCoversSlot, parseDateKey, todayKey } from '../../lib/calendar'
import { iconForHabit } from '../../lib/habitIcons'
import {
    DAY_PARTS,
    sessionKey,
    yourDay,
    type DayPart,
    type DayStep,
    type StepKind,
    type YourDay,
} from '../../lib/yourDay'
import type { Event, FitnessPlanEntry, HabitDef } from '../../types'

const PART_LABEL: Record<DayPart, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** Where each kind of step is done, and what the Next up button says. */
const ACTION: Record<StepKind, { to: string; label: string }> = {
    weigh: { to: '/fitness?tab=body', label: 'Weigh in' },
    training: { to: '/fitness', label: 'Open the planner' },
    rest: { to: '/fitness', label: 'Open the planner' },
    meal: { to: '/nutrition', label: 'Open meals' },
    'plan-meals': { to: '/nutrition', label: 'Plan meals' },
    protein: { to: '/nutrition', label: 'Open meals' },
    calories: { to: '/nutrition', label: 'Open meals' },
    event: { to: '/calendar', label: 'Open the calendar' },
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
}

/** The day's training, what's been logged, and the habits. */
function useDayRecords(date: string) {
    // Refetched when habits change elsewhere — keeping what's shown meanwhile, so a tick doesn't flash.
    const habitsVersion = useDataVersion('habits')
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
        ]).then(([training, workouts, sessions, habits, habitLogs]) => {
            if (!active) return
            const logged = new Set<string>()
            for (const l of workouts) if (l.workout && l.date === date) logged.add(sessionKey('workout', l.workout))
            for (const l of sessions) if (l.session && l.date === date) logged.add(sessionKey('conditioning', l.session))
            setState({
                date,
                records: {
                    training,
                    logged,
                    habits: habits.filter((h) => h.active).sort((a, b) => a.order - b.order),
                    habitsDone: new Set(habitLogs.filter((l) => l.completed && l.date === date).map((l) => l.habit)),
                },
            })
        })
        return () => {
            active = false
        }
    }, [date, habitsVersion])

    const current = state?.date === date ? state.records : null
    return { records: current, setRecords: setState }
}

/** Which part of the day an event sits in; null when it runs all day. */
function eventPart(event: Event, date: string): DayPart | null {
    if (eventCoversAllDay(event, date)) return null
    return (PERIODS.find((p) => eventCoversSlot(event, date, p.key))?.key as DayPart | undefined) ?? null
}

/**
 * Your day: what to do to make today a perfect one, across the whole width at
 * the top of the dashboard — the one place today lives. The next thing to do
 * on the left; the day in order beside it, training, meals and habits each in
 * its part of the day; protein and calories up by the score. Habits tick
 * here; everything else opens where it's done.
 */
export default function YourDayWidget({ date }: { date: string }) {
    const today = todayKey()
    const nowMin = useMinutes()
    const invalidate = useInvalidate()
    const nutrition = useNutritionToday(date)
    const events = useDayEvents(date)
    const { records, setRecords } = useDayRecords(date)
    const selection = useAuth().user?.settings?.perfectDay

    const day = useMemo<YourDay | null>(() => {
        if (!records || nutrition.loading || events.loading) return null
        return yourDay({
            date,
            today,
            nowMin,
            ...records,
            meals: nutrition.entries,
            goals: nutrition.goals,
            eaten: nutrition.eaten,
            weightLogs: nutrition.weightLogs,
            weightRate: nutrition.ratePerWeek,
            events: events.events.map((e) => ({ id: e._id, title: e.title, part: eventPart(e, date), time: e.time })),
            selection,
        })
    }, [records, nutrition, events, date, today, nowMin, selection])

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
                <div className="mb-5">
                    <Title summary={null} />
                </div>
                <SectionLoading rows={4} />
            </section>
        )

    const row = (s: DayStep) => (
        <StepRow
            key={s.id}
            step={s}
            date={date}
            isNext={day.next?.id === s.id}
            icon={s.habitId ? habitIcons.get(s.habitId) : undefined}
            onTick={toggleHabit}
        />
    )
    const anyTime = day.steps.filter((s) => s.part === null && s.kind !== 'protein' && s.kind !== 'calories')

    return (
        <section className="min-w-0" aria-label="Your day">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
                <Title summary={summaryOf(day, date, today)} />
                <div className="flex w-full items-end gap-5 sm:w-auto sm:gap-8">
                    <Targets day={day} nutrition={nutrition} />
                    {day.total > 0 && (
                        <p className="nums ml-auto shrink-0 text-[28px] font-semibold leading-none tracking-[-0.03em] text-neutral-950 sm:ml-0">
                            {day.done}
                            <span className="ml-1 text-base font-medium tracking-normal text-neutral-500">/ {day.total}</span>
                        </p>
                    )}
                </div>
            </div>
            <ScoreBar day={day} />

            <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-x-12">
                <div className="self-start lg:col-span-4">
                    <NextUp day={day} date={date} today={today} onTick={toggleHabit} />
                </div>
                <div className="min-w-0 lg:col-span-8">
                    <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
                        {DAY_PARTS.map((part) => (
                            <PartColumn key={part} part={part} day={day}>
                                {day.steps.filter((s) => s.part === part).map(row)}
                            </PartColumn>
                        ))}
                    </div>
                    {anyTime.length > 0 && (
                        <div className="mt-8">
                            <p className="mb-2 text-[13px] font-medium text-neutral-600">Any time</p>
                            <ul className="grid border-t border-neutral-200 sm:grid-cols-3 sm:gap-x-6 [&>li]:border-b [&>li]:border-neutral-200">
                                {anyTime.map(row)}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

function summaryOf(day: YourDay, date: string, today: string): string {
    if (day.total === 0) return date >= today ? 'Nothing planned yet.' : 'Nothing was planned.'
    if (day.perfect) return date === today ? 'A perfect day — everything’s done.' : 'A perfect day.'
    if (date > today) return `${day.total} ${day.total === 1 ? 'thing' : 'things'} planned`
    if (date < today) return `${day.done} of ${day.total} done`
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
                        className="grid h-7 w-7 place-items-center rounded-full text-[13px] text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
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

/** One segment per task: done, still to do, or over. */
function ScoreBar({ day }: { day: YourDay }) {
    const tasks = day.steps.filter((s) => s.state === 'todo' || s.state === 'done' || s.state === 'over')
    if (tasks.length === 0) return null
    // Done first, so the bar fills from the left.
    const order: Record<string, number> = { done: 0, over: 1, todo: 2 }
    const sorted = [...tasks].sort((a, b) => order[a.state] - order[b.state])
    return (
        <div className="flex gap-1" role="img" aria-label={`${day.done} of ${day.total} done`}>
            {sorted.map((s) => (
                <span
                    key={s.id}
                    className={`h-1.5 min-w-0 flex-1 rounded-full ${
                        s.state === 'done' ? 'bg-success' : s.state === 'over' ? 'bg-danger' : 'bg-neutral-200'
                    }`}
                />
            ))}
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
    const panel = 'rounded-3xl p-6 sm:p-7'
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
        return (
            <div className={`${panel} bg-neutral-100`}>
                <p className={`${overline} text-neutral-500`}>Next up</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-neutral-950">
                    {over ? 'Nothing left to tick' : 'Nothing planned'}
                </p>
                <p className="mt-1 text-[14px] leading-6 text-neutral-600">
                    {over
                        ? 'Calories ran over today — keep the rest of it light.'
                        : 'Plan some training or meals and they’ll show here.'}
                </p>
            </div>
        )
    }

    const action = ACTION[next.kind]
    const button =
        'mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100'
    return (
        <div className={`${panel} bg-neutral-900 text-white`}>
            <p className={`${overline} text-neutral-400`}>Next up · {next.part ? PART_LABEL[next.part] : 'Any time'}</p>
            <p className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.025em]">
                {next.kind === 'protein' ? `Get to ${next.title}` : next.title}
            </p>
            {next.detail && <p className="mt-1.5 text-[14px] leading-6 text-neutral-300">{next.detail}</p>}
            {next.habitId ? (
                <button type="button" className={button} onClick={() => onTick(next.habitId!)}>
                    <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                    {action.label}
                </button>
            ) : (
                <Link to={action.to} className={button}>
                    {action.label}
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            )}
        </div>
    )
}

// ── The day in order ─────────────────────────────────────────────────────────

function PartColumn({ part, day, children }: { part: DayPart; day: YourDay; children: ReactNode[] }) {
    const now = day.nowPart === part
    const passed = day.nowPart !== null && DAY_PARTS.indexOf(part) < DAY_PARTS.indexOf(day.nowPart)
    return (
        <div className="min-w-0">
            <div className="mb-2 flex h-6 items-center gap-2">
                <p className={`text-[13px] font-medium ${passed ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {PART_LABEL[part]}
                </p>
                {now && (
                    <span className="inline-flex h-5 items-center rounded-full bg-coral-50 px-2 text-[11px] font-semibold text-coral-600">
                        Now
                    </span>
                )}
            </div>
            {children.length === 0 ? (
                <p className="border-y border-neutral-200 py-3 text-[14px] text-neutral-400">Nothing planned</p>
            ) : (
                <ul className={DASH.list}>{children}</ul>
            )}
        </div>
    )
}

/** One step. A habit ticks where it stands; anything else opens the page where it's done. */
function StepRow({
    step,
    date,
    isNext,
    icon,
    onTick,
}: {
    step: DayStep
    date: string
    isNext: boolean
    /** A habit's own icon, shown quietly so habits read apart from meals and training. */
    icon?: string
    onTick: (habitId: string) => void
}) {
    const quiet = step.state === 'done' || step.state === 'handled'
    const body = (
        <>
            <StateMark step={step} isNext={isNext} />
            <div className="min-w-0 flex-1">
                <p
                    className={`truncate text-[15px] group-hover:underline group-hover:underline-offset-4 ${
                        quiet ? 'text-neutral-500' : 'text-neutral-900'
                    } ${isNext ? 'font-medium' : ''}`}
                >
                    {step.title}
                </p>
                {step.detail && step.kind !== 'event' && (
                    <p className="mt-0.5 truncate text-[13px] text-neutral-500">{step.detail}</p>
                )}
            </div>
            {step.time && <span className="nums shrink-0 pt-0.5 text-[13px] text-neutral-500">{step.time}</span>}
            {icon && <i className={`${icon} shrink-0 pt-1 text-xs text-neutral-300`} aria-hidden="true" />}
        </>
    )
    const cls = 'group flex w-full items-start gap-3 py-3 text-left'
    return (
        <li>
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
                <Link to={step.kind === 'event' ? `/calendar?date=${date}` : ACTION[step.kind].to} className={cls}>
                    {body}
                </Link>
            )}
        </li>
    )
}

/** Done, to do (ringed in coral when it's next), over, not happening — or an icon for context. */
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
    if (step.state === 'handled')
        return (
            <span className={`${box} bg-neutral-100 text-neutral-400`} aria-label="Not happening">
                <i className="fa-solid fa-minus" aria-hidden="true" />
            </span>
        )
    if (step.state === 'info')
        return (
            <span className={`${box} text-neutral-400`} aria-hidden="true">
                <i className={step.kind === 'rest' ? 'fa-solid fa-mug-hot' : 'fa-regular fa-calendar'} />
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
