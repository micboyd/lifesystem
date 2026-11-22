import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AREA_TEXT, GlanceMetric, SectionLoading, type AreaTone } from './DashSection'
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
    glance,
}: {
    date: string
    /** More figures for the summary strip, after protein and calories (Home adds steps). */
    glance?: ReactNode
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
                <p className="h-10 w-2/3 animate-pulse rounded-lg bg-neutral-100" />
                <div className="mt-14 grid grid-cols-1 gap-x-16 gap-y-12 lg:grid-cols-12">
                    <div className="lg:col-span-8">
                        <SectionLoading rows={6} />
                    </div>
                    {aside && <div className="flex min-w-0 flex-col gap-12 lg:col-span-4">{aside}</div>}
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
            {/* The state of the day in a sentence, carrying on from the greeting above. */}
            <p className="max-w-3xl text-[18px] leading-[26px] tracking-[-0.015em] text-neutral-500 sm:text-[20px] sm:leading-7">
                {headlineOf(day, date, today)}
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {day.total > 0 && (
                    <GlanceMetric
                        label="Your day"
                        value={String(day.done)}
                        goal={String(day.total)}
                        share={day.done / day.total}
                        bar={day.perfect ? 'bg-success' : 'bg-neutral-900'}
                        icon="fa-solid fa-list-check"
                        iconTone="text-neutral-700"
                        note={day.perfect ? 'All done' : `${day.total - day.done} left to do`}
                        noteTone={day.perfect ? 'text-success' : 'text-neutral-600'}
                        to="/perfect-day"
                    />
                )}
                <Targets day={day} nutrition={nutrition} />
                {glance}
            </div>

            <div className="mt-11 grid gap-x-16 gap-y-12">
                <div className="min-w-0">
                    <Title />
                    <ColumnHeads />
                    {!day.next && <NextUp day={day} date={date} today={today} onTick={toggleHabit} />}
                    <div className="flex flex-col gap-6">
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
                {aside && <div className="flex min-w-0 flex-col gap-10">{aside}</div>}
            </div>
        </section>
    )
}

/** The day in one sentence: how far through, and what's next. */
function headlineOf(day: YourDay, date: string, today: string): string {
    const n = (k: number) =>
        ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'][k] ?? String(k)
    if (day.total === 0) return date >= today ? 'Nothing planned yet.' : 'Nothing was planned that day.'
    if (day.perfect) return date === today ? 'Everything’s done. A perfect day.' : 'A perfect day.'
    if (date > today) return `${n(day.total)} ${day.total === 1 ? 'thing' : 'things'} planned.`
    if (date < today) return `${n(day.done)} of ${day.total} done that day.`
    const done = `${n(day.done)} of ${day.total} done`
    if (day.next) return `${done}. Next, ${day.next.title.charAt(0).toLowerCase()}${day.next.title.slice(1)}.`
    return `${done}.`
}

function Title() {
    return (
        <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-medium tracking-[-0.02em] text-neutral-900">Your day</h2>
            <Link to="/perfect-day" className="text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900">
                What makes a perfect day
            </Link>
        </div>
    )
}

/** Protein to reach and calories to stay within, each a figure and a hairline bar. */
function Targets({ day, nutrition }: { day: YourDay; nutrition: NutritionToday }) {
    const goals = nutrition.goals
    const meters = [
        { kind: 'protein' as const, label: 'Protein', icon: 'fa-solid fa-drumstick-bite', value: nutrition.eaten.protein, goal: goals?.protein, unit: ' g' },
        { kind: 'calories' as const, label: 'Calories', icon: 'fa-solid fa-bowl-food', value: nutrition.eaten.calories, goal: goals?.calories, unit: '' },
    ].flatMap((m) => {
        const step = day.steps.find((s) => s.kind === m.kind)
        return step && m.goal ? [{ ...m, goal: m.goal, state: step.state }] : []
    })
    return (
        <>
            {meters.map((m) => (
                <GlanceMetric
                    key={m.kind}
                    label={m.label}
                    value={Math.round(m.value).toLocaleString('en-GB')}
                    goal={`${Math.round(m.goal).toLocaleString('en-GB')}${m.unit}`}
                    share={m.value / m.goal}
                    bar={m.state === 'over' ? 'bg-danger' : 'bg-orange-500'}
                    icon={m.icon}
                    iconTone="text-orange-600"
                    note={targetNote(m.kind, m.value, m.goal, m.unit)}
                    noteTone={m.state === 'over' ? 'text-danger' : m.state === 'done' ? 'text-success' : 'text-neutral-600'}
                    to="/nutrition"
                />
            ))}
        </>
    )
}

/** Protein says how much is still to get; calories how much is left, or how far over. */
function targetNote(kind: 'protein' | 'calories', value: number, goal: number, unit: string): string {
    const n = (x: number) => Math.round(x).toLocaleString('en-GB')
    const gap = goal - value
    if (kind === 'protein') return gap <= goal * 0.05 ? 'Target hit' : `${n(gap)}${unit} to go`
    return gap < 0 ? `${n(-gap)} over` : `${n(gap)} left`
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
    const panel = 'mb-4 border-t border-hairline pt-5'
    const overline = 'text-[11px] font-medium uppercase tracking-[0.06em]'
    if (date !== today) {
        const { year, month, day: dayOfMonth } = parseDateKey(date)
        const weekday = WEEKDAYS_LONG[new Date(year, month, dayOfMonth).getDay()]
        return (
            <div className={panel}>
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
            <div className={panel}>
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
            <div className={panel}>
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
                <p className={`${overline} flex items-center gap-2 text-neutral-400`}>
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
            <div className="flex h-8 items-center gap-2.5">
                <p className={`text-[13px] font-medium ${passed ? 'text-neutral-500' : 'text-neutral-700'}`}>{label}</p>
                {now && <span className="text-[12px] font-semibold text-coral-600">Now</span>}
                {own.length > 0 && (
                    <span className="nums ml-auto text-[12px] text-neutral-500">
                        {done} of {own.length}
                    </span>
                )}
            </div>
            {children.length === 0 ? (
                <p className="border-t border-hairline py-4 text-[15px] text-neutral-500">Nothing planned</p>
            ) : (
                <ul className="flex flex-col">{children}</ul>
            )}
        </div>
    )
}

/** One step. A habit ticks where it stands; anything else opens the page where it's done. */
/** The columns every row of the day shares: time, mark, item, area, length. */
const ROW_GRID =
    'grid grid-cols-[44px_20px_minmax(0,1fr)_auto] items-start gap-x-3 sm:grid-cols-[52px_20px_minmax(0,1fr)_104px_68px]'

/** "45 min", "1 h 05 min". */
function lengthLabel(minutes: number | null | undefined): string {
    if (!minutes) return '—'
    if (minutes < 60) return `${minutes} min`
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`
}

/** The column names, once above the day. */
function ColumnHeads() {
    return (
        <div className={`${ROW_GRID} pb-1.5 text-[12px] text-neutral-500`} aria-hidden="true">
            <span>Time</span>
            <span />
            <span>Item</span>
            <span className="hidden sm:block">Area</span>
            <span className="text-right">Length</span>
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
    const href = step.to ?? ACTION[step.kind].to
    const time = step.time ?? (step.part === null ? 'Any' : '—')

    const timeCell = <span className="nums pt-0.5 text-[13px] text-neutral-500">{time}</span>
    const areaCell = (
        <span className="hidden min-w-0 items-center gap-1.5 truncate pt-0.5 text-[12px] font-medium sm:flex">
            {icon ? (
                <>
                    <i className={`${icon} text-[11px] text-teal-600`} aria-hidden="true" />
                    <span className="text-teal-600">Habit</span>
                </>
            ) : (
                tag && <span className={AREA_TEXT[tag.tone]}>{tag.label}</span>
            )}
        </span>
    )
    const lengthCell = (
        <span className={`pt-0.5 text-right text-[13px] text-neutral-600 ${step.minutes ? 'tabular-nums' : ''}`}>
            {lengthLabel(step.minutes)}
        </span>
    )

    // The next thing to do opens out: bigger, with its action right there.
    if (isNext) {
        const action = ACTION[step.kind]
        return (
            <li className={`${ROW_GRID} -mx-3 rounded-lg border-t border-hairline bg-coral-50/60 px-3 py-5`}>
                {timeCell}
                <StateMark step={step} isNext />
                <div className="min-w-0">
                    <p className="text-[24px] font-medium leading-tight tracking-[-0.03em] text-neutral-950">
                        {step.kind === 'protein' ? `Get to ${step.title}` : step.title}
                    </p>
                    {step.detail && <p className="mt-1 text-[13px] text-neutral-500">{step.detail}</p>}
                    <div className="mt-3.5 flex flex-wrap items-center gap-2">
                        {step.habitId ? (
                            <button
                                type="button"
                                onClick={() => onTick(step.habitId!)}
                                className="inline-flex h-11 items-center gap-2 rounded-lg bg-coral-500 px-4 text-sm font-medium text-white transition-colors hover:bg-coral-600 lg:h-10"
                            >
                                <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                                {action.label}
                            </button>
                        ) : (
                            <Link
                                to={href}
                                className="inline-flex h-11 items-center gap-2 rounded-lg bg-coral-500 px-4 text-sm font-medium text-white transition-colors hover:bg-coral-600 lg:h-10"
                            >
                                {action.label}
                                <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                            </Link>
                        )}
                    </div>
                </div>
                {areaCell}
                {lengthCell}
            </li>
        )
    }

    const body = (
        <>
            {timeCell}
            <StateMark step={step} isNext={false} />
            <div className="min-w-0">
                <p
                    className={`truncate text-sm font-medium ${
                        quiet ? 'text-neutral-500 line-through decoration-neutral-300' : 'text-neutral-900'
                    }`}
                >
                    {step.title}
                </p>
                {step.detail && <p className="mt-0.5 truncate text-[13px] text-neutral-500">{step.detail}</p>}
            </div>
            {areaCell}
            {lengthCell}
        </>
    )
    const cls = `${ROW_GRID} w-full py-3 text-left`
    return (
        <li className="border-t border-hairline">
            {step.habitId ? (
                <button type="button" className={cls} aria-pressed={step.state === 'done'} onClick={() => onTick(step.habitId!)}>
                    {body}
                </button>
            ) : (
                <Link to={href} className={cls}>
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
            <span className={`${box} bg-neutral-900 text-white`} aria-label="Done">
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
