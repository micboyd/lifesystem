import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { Card, CardHeader, CardTitle } from '../components/Card'
import Spinner from '../components/Spinner'
import DashboardDateNav from '../components/dashboard/DashboardDateNav'
import { useAuth } from '../context/AuthContext'
import { useDataVersion, useInvalidate } from '../context/DataSyncContext'
import {
    fetchForecast,
    weatherInfo,
    whatToWear,
    partOfDaySummary,
    planningInsight,
    weatherWarnings,
    SEVERITY_STYLES,
    SEVERITY_ICON_STYLES,
    type Forecast,
} from '../lib/weather'
import { computeExclusionPot, monthOf } from '../lib/budget'
import { rowSpendSummary } from '../lib/budgetDiscipline'
import { rowVisibleInMonth } from '../lib/finance'
import { formatAmount } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import {
    todayKey,
    formatDateLong,
    parseDateKey,
    addDays,
    WEEKDAYS_LONG,
    PERIODS,
    eventCoversSlot,
    eventCoversAllDay,
} from '../lib/calendar'
import {
    listGroups,
    listRows,
    listEntries,
    listBudgetSpends,
    listBudgetExclusions,
    listBudgetTopUps,
    listExclusionBudgets,
} from '../services/finances'
import { listTasks, updateTask } from '../services/tasks'
import { listEvents } from '../services/events'
import { listReminders } from '../services/reminders'
import { listStatuses } from '../services/dayStatus'
import { DAY_STATUS_OPTIONS, EVENT_TYPE_LABELS } from '../types'
import { useCalendars } from '../context/CalendarsContext'
import { colorsForEvent } from '../lib/eventColors'
import type {
    FinanceGroup,
    FinanceRow,
    FinanceEntry,
    BudgetSpend,
    BudgetTopUp,
    ExclusionBudget,
    Task,
    Event,
    Reminder,
    Part,
    DayStatus,
    Calendar as CalendarLayer,
} from '../types'

const fmt = formatAmount

// ── Budget maths ──────────────────────────────────────────────────────────────

interface BudgetToday {
    row: FinanceRow
    /** What can still be spent against this budget today, carry included. */
    canSpendToday: number
    /** Context line under the figure. */
    context: string
}

/**
 * One "you can spend X today" figure per tracked budget. The figure itself comes
 * from the shared {@link rowSpendSummary} engine (the same maths the dashboard
 * safe-to-spend pill and budget widget use), so every surface agrees; this wrapper
 * only adds the presentation context line.
 */
function computeBudgetToday(
    row: FinanceRow,
    entry: FinanceEntry | undefined,
    rowSpends: BudgetSpend[],
    rowTopUps: BudgetTopUp[],
    date: string,
    excluded: Set<string>
): BudgetToday {
    if (excluded.has(date)) {
        return { row, canSpendToday: 0, context: 'Day off budget — no allowance today' }
    }

    const s = rowSpendSummary(row, entry, rowSpends, rowTopUps, date, excluded)

    if (row.budgetType === 'weekly') {
        const bw = s.weekMaths
        return {
            row,
            canSpendToday: s.today.safe,
            context: `£${fmt(Math.abs(bw.remaining))} ${bw.remaining < 0 ? 'over' : 'left'} this week · £${fmt(Math.abs(bw.monthlyRemaining))} ${bw.monthlyRemaining < 0 ? 'over' : 'left'} this month`,
        }
    }

    const bd = s.day
    const carryNote =
        Math.abs(bd.carry) > 0.005
            ? bd.carry > 0
                ? ` incl. £${fmt(bd.carry)} carry`
                : ` after £${fmt(Math.abs(bd.carry))} deficit`
            : ''
    return {
        row,
        canSpendToday: s.today.safe,
        context: `£${fmt(bd.straightDailyRate)}/day${carryNote} · £${fmt(Math.abs(bd.monthlyRemaining))} ${bd.monthlyRemaining < 0 ? 'over' : 'left'} this month`,
    }
}

// ── Weather section ───────────────────────────────────────────────────────────

function WeatherBrief({ date, forecast }: { date: string; forecast: Forecast | null }) {
    const day = forecast?.daily.find((d) => d.date === date)
    if (!forecast || !day) {
        return (
            <p className="text-sm text-neutral-400">
                No forecast available for this date.{' '}
                <Link to="/weather" className="font-semibold text-neutral-600 underline underline-offset-2">
                    Open weather
                </Link>
            </p>
        )
    }

    const isToday = date === todayKey()
    const info = isToday ? weatherInfo(forecast.current.code, forecast.current.isDay) : weatherInfo(day.code)
    const headlineTemp = isToday ? forecast.current.temperature : day.tempMax

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-50 text-3xl text-sky-500">
                    <i className={info.icon} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold tracking-tight text-neutral-900">
                            {headlineTemp}&deg;
                        </span>
                        <span className="truncate text-sm font-medium text-neutral-500">{info.label}</span>
                    </div>
                    <p className="text-xs text-neutral-400">
                        High {day.tempMax}&deg; · Low {day.tempMin}&deg;
                        {day.precipitationProbability > 0 && <> · {day.precipitationProbability}% rain</>}
                        {` · wind ${day.windMax} mph`}
                    </p>
                </div>
            </div>
            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                <i className="fa-solid fa-shirt mr-1.5 text-neutral-400" aria-hidden="true" />
                {whatToWear(day)}
            </p>
        </div>
    )
}

// ── Tomorrow section ──────────────────────────────────────────────────────────

/** From this hour onwards, "today" is basically done and tomorrow is the useful view. */
const EVENING_HOUR = 19

/** ISO timestamp → "07:42". */
function formatClock(stamp: string): string {
    return new Date(stamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

interface TomorrowData {
    events: Event[]
    tasks: Task[]
    reminders: Reminder[]
    statuses: DayStatus[]
}

/**
 * The evening counterpart to the rest of the page: once today is effectively
 * over, what matters is what you need to have ready. Weather and clothing come
 * first because they're the things you act on before bed (washing, bag, alarm).
 */
function TomorrowBrief({
    date,
    forecast,
    data,
    calendarsById,
}: {
    date: string
    forecast: Forecast | null
    data: TomorrowData | null
    calendarsById: Map<string, CalendarLayer>
}) {
    const day = forecast?.daily.find((d) => d.date === date)
    const info = day ? weatherInfo(day.code) : null
    const hourly = forecast?.hourlyByDate[date] ?? []
    const bands = partOfDaySummary(hourly)
    const warnings = day && hourly.length > 0 ? weatherWarnings(hourly, day) : []
    const insight = hourly.length > 0 ? planningInsight(hourly) : ''
    const maxGust = hourly.length > 0 ? Math.max(...hourly.map((h) => h.windGust)) : 0
    // The evening band runs to 10pm, which is still daylight in midsummer —
    // pick sun or moon glyphs from the actual sunset rather than the clock.
    const eveningIsDay = day?.sunset ? new Date(day.sunset).getHours() >= 20 : false

    const events = data?.events ?? []
    const allDay = events.filter((e) => eventCoversAllDay(e, date))
    const parts = PERIODS.map((period) => ({
        period,
        event: events.find((e) => eventCoversSlot(e, date, period.key as Part)) ?? null,
    })).filter((p) => p.event !== null)
    const openTasks = (data?.tasks ?? []).filter((t) => !t.completed)
    const reminders = data?.reminders ?? []
    const status = (data?.statuses ?? []).find((s) => s.startDate <= date && s.endDate >= date)
    const statusOption = status
        ? DAY_STATUS_OPTIONS.find((o) => o.value === status.status)
        : undefined

    // The earliest thing with a clock time — the one detail that decides an alarm.
    const firstTimed = [...events]
        .filter((e) => e.time && e.startDate === date)
        .sort((a, b) => (a.time! < b.time! ? -1 : 1))[0]

    const nothingOn =
        allDay.length + parts.length + reminders.length + openTasks.length === 0 && !statusOption

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>
                    <span className="flex items-center gap-2">
                        <i className="fa-solid fa-moon text-sm text-indigo-400" aria-hidden="true" />
                        Prepare for tomorrow
                    </span>
                </CardTitle>
                <Link
                    to={`/day/${date}`}
                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Open day
                </Link>
            </CardHeader>

            <p className="-mt-1 mb-4 text-sm text-neutral-500">{formatDateLong(date)}</p>

            {/* Warnings lead — they change what "prepared" means. */}
            {warnings.length > 0 && (
                <div className="mb-4 flex flex-col gap-1.5">
                    {warnings.map((w) => (
                        <div
                            key={w.id}
                            className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${SEVERITY_STYLES[w.severity]}`}
                        >
                            <i
                                className={`${w.icon} mt-0.5 shrink-0 text-sm ${SEVERITY_ICON_STYLES[w.severity]}`}
                                aria-hidden="true"
                            />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold leading-tight">{w.title}</p>
                                <p className="mt-0.5 text-[11px] opacity-80">{w.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
                {/* Weather + clothing */}
                <div className="flex flex-col gap-3">
                    {day && info ? (
                        <>
                            <div className="flex items-center gap-4">
                                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-2xl text-sky-500">
                                    <i className={info.icon} aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-2xl font-bold tracking-tight text-neutral-900">
                                            {day.tempMax}&deg;
                                        </span>
                                        <span className="truncate text-sm font-medium text-neutral-500">
                                            {info.label}
                                        </span>
                                    </div>
                                    <p className="text-xs text-neutral-400">
                                        Low {day.tempMin}&deg;
                                        {day.precipitationProbability > 0 && (
                                            <> · {day.precipitationProbability}% rain</>
                                        )}
                                        {` · wind ${day.windMax} mph`}
                                    </p>
                                </div>
                            </div>

                            {/* Morning / afternoon / evening — the app's own day model,
                                so a band lines up with the events sitting in it. */}
                            {bands.length > 0 && (
                                <div className="grid grid-cols-3 gap-1.5">
                                    {bands.map((band) => {
                                        const bandInfo = weatherInfo(
                                            band.code,
                                            band.key !== 'evening' || eveningIsDay
                                        )
                                        const rainy = band.precipitationProbability >= 50
                                        return (
                                            <div
                                                key={band.key}
                                                className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-100 px-1 py-3"
                                                title={`${band.label}: ${bandInfo.label}, ${band.tempMin}–${band.tempMax}°, ${band.precipitationProbability}% rain, gusts ${band.windGust} mph`}
                                            >
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                                    {band.label}
                                                </span>
                                                <i
                                                    className={`${bandInfo.icon} text-base text-sky-500`}
                                                    aria-hidden="true"
                                                />
                                                <span className="text-xs font-semibold text-neutral-700">
                                                    {band.tempMax}&deg;
                                                </span>
                                                <span
                                                    className={
                                                        rainy
                                                            ? 'rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-600'
                                                            : 'text-[9px] text-neutral-300'
                                                    }
                                                >
                                                    {band.precipitationProbability}%
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {insight && (
                                <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                                    <i
                                        className="fa-solid fa-lightbulb mr-1.5 text-neutral-400"
                                        aria-hidden="true"
                                    />
                                    {insight}
                                </p>
                            )}

                            <p className="rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                                <i
                                    className="fa-solid fa-shirt mr-1.5 text-neutral-400"
                                    aria-hidden="true"
                                />
                                {whatToWear(day)}
                            </p>

                            {/* Numbers worth knowing the night before. */}
                            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-neutral-500">
                                {day.sunrise && (
                                    <span>
                                        <i
                                            className="fa-solid fa-arrow-up mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        Sunrise {formatClock(day.sunrise)}
                                    </span>
                                )}
                                {day.sunset && (
                                    <span>
                                        <i
                                            className="fa-solid fa-arrow-down mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        Sunset {formatClock(day.sunset)}
                                    </span>
                                )}
                                {day.uvIndexMax != null && (
                                    <span>
                                        <i
                                            className="fa-solid fa-sun mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        UV {Math.round(day.uvIndexMax)}
                                    </span>
                                )}
                                {maxGust > day.windMax + 5 && (
                                    <span>
                                        <i
                                            className="fa-solid fa-wind mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        Gusts {maxGust} mph
                                    </span>
                                )}
                            </div>
                        </>
                    ) : (
                        <p className="text-sm text-neutral-400">
                            No forecast for tomorrow yet.{' '}
                            <Link
                                to="/weather"
                                className="font-semibold text-neutral-600 underline underline-offset-2"
                            >
                                Open weather
                            </Link>
                        </p>
                    )}
                </div>

                {/* What's coming up */}
                <div className="flex flex-col gap-1">
                    {statusOption && (
                        <div
                            className={`mb-1 flex items-center gap-2 rounded-xl px-3 py-2 ${statusOption.bg} ${statusOption.text}`}
                        >
                            <i
                                className="fa-solid fa-umbrella-beach w-4 shrink-0 text-center text-sm opacity-70"
                                aria-hidden="true"
                            />
                            <span className="truncate text-sm font-semibold">
                                {statusOption.label}
                            </span>
                        </div>
                    )}

                    {firstTimed && (
                        <p className="mb-1 text-xs font-semibold text-neutral-400">
                            First thing: {firstTimed.title} at {firstTimed.time}
                        </p>
                    )}

                    {allDay.map((e) => {
                        const colors = colorsForEvent(e, calendarsById)
                        return (
                            <div
                                key={e._id}
                                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${colors.bg}`}
                            >
                                <i
                                    className="fa-regular fa-calendar w-4 shrink-0 text-center text-sm opacity-60"
                                    aria-hidden="true"
                                />
                                <p
                                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${colors.text}`}
                                >
                                    {e.title}
                                </p>
                                <span
                                    className={`shrink-0 text-xs font-medium opacity-60 ${colors.text}`}
                                >
                                    all day
                                </span>
                            </div>
                        )
                    })}

                    {parts.map(({ period, event }) => (
                        <div key={period.key} className="flex items-center gap-3 rounded-xl px-3 py-2">
                            <i
                                className={`${period.icon} w-4 shrink-0 text-center text-sm text-neutral-300`}
                                aria-hidden="true"
                            />
                            <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                {period.label}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800">
                                {event!.title}
                            </span>
                            {event!.time && (
                                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                                    {event!.time}
                                </span>
                            )}
                        </div>
                    ))}

                    {reminders.map((r) => (
                        <div
                            key={`${r._id}-${r.date}`}
                            className="flex items-center gap-3 rounded-xl px-3 py-2"
                        >
                            <i
                                className="fa-solid fa-bell w-4 shrink-0 text-center text-sm text-amber-400"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                                {r.text}
                            </span>
                        </div>
                    ))}

                    {openTasks.length > 0 && (
                        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
                            <i
                                className="fa-solid fa-list-check w-4 shrink-0 text-center text-sm text-neutral-300"
                                aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                                {openTasks.length} task{openTasks.length !== 1 ? 's' : ''} lined up
                            </span>
                        </div>
                    )}

                    {nothingOn && (
                        <p className="text-sm text-neutral-400">
                            Nothing scheduled — a clear day ahead.
                        </p>
                    )}
                </div>
            </div>
        </Card>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DailyReport() {
    useMoneyHidden() // re-render when money is hidden/shown
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null
    const invalidate = useInvalidate()
    const { byId: calendarsById } = useCalendars()

    const [date, setDate] = useState(todayKey())
    const month = monthOf(date)

    // Weather — one fetch per location, covers today + next few days.
    const [forecast, setForecast] = useState<Forecast | null>(null)
    useEffect(() => {
        if (!location) return
        let active = true
        fetchForecast(location)
            .then((f) => active && setForecast(f))
            .catch(() => active && setForecast(null))
        return () => {
            active = false
        }
    }, [location?.latitude, location?.longitude])

    // Finance — same data set the Budgets page uses, keyed by month.
    const [groups, setGroups] = useState<FinanceGroup[]>([])
    const [rows, setRows] = useState<FinanceRow[]>([])
    const [entries, setEntries] = useState<FinanceEntry[]>([])
    const [spends, setSpends] = useState<BudgetSpend[]>([])
    const [topUps, setTopUps] = useState<BudgetTopUp[]>([])
    const [exclusionPots, setExclusionPots] = useState<ExclusionBudget[]>([])
    const [excludedDates, setExcludedDates] = useState<Set<string>>(new Set())
    const [loadedMonth, setLoadedMonth] = useState<string | null>(null)
    const budgetVersion = useDataVersion('budget')

    useEffect(() => {
        let active = true
        Promise.all([
            listGroups(),
            listRows(),
            listEntries(month),
            listBudgetSpends({ month }),
            listBudgetExclusions(month),
            listBudgetTopUps(month),
            listExclusionBudgets(month),
        ])
            .then(([g, r, e, s, x, t, p]) => {
                if (!active) return
                setGroups(g)
                setRows(r)
                setEntries(e)
                setSpends(s)
                setExcludedDates(new Set(x.map((d) => d.date)))
                setTopUps(t)
                setExclusionPots(p)
            })
            .finally(() => active && setLoadedMonth(month))
        return () => {
            active = false
        }
    }, [month, budgetVersion])

    // Day items — tasks, events, reminders for the chosen date.
    const [tasks, setTasks] = useState<Task[]>([])
    const [events, setEvents] = useState<Event[]>([])
    const [reminders, setReminders] = useState<Reminder[]>([])
    const [loadedDate, setLoadedDate] = useState<string | null>(null)
    const [togglingId, setTogglingId] = useState<string | null>(null)
    const tasksVersion = useDataVersion('tasks')

    useEffect(() => {
        let active = true
        Promise.all([
            listTasks(date, date).catch(() => [] as Task[]),
            listEvents(date, date).catch(() => [] as Event[]),
            listReminders(date, date).catch(() => [] as Reminder[]),
        ])
            .then(([t, e, r]) => {
                if (!active) return
                setTasks(t)
                setEvents(e)
                setReminders(r)
            })
            .finally(() => active && setLoadedDate(date))
        return () => {
            active = false
        }
    }, [date, tasksVersion])

    const loading = loadedMonth !== month || loadedDate !== date

    // ── Tomorrow ────────────────────────────────────────────────────────────
    // Tracked as state, and re-checked each minute, so 7pm arriving reveals the
    // section on a page that's been sitting open all evening.
    const [hour, setHour] = useState(() => new Date().getHours())
    useEffect(() => {
        const id = setInterval(() => setHour(new Date().getHours()), 60_000)
        return () => clearInterval(id)
    }, [])

    // Only meaningful while looking at today — "tomorrow" relative to a date
    // you're browsing in the past isn't something you can prepare for.
    const viewingToday = date === todayKey()
    const showTomorrow = viewingToday && hour >= EVENING_HOUR
    const tomorrow = addDays(date, 1)

    const [tomorrowData, setTomorrowData] = useState<TomorrowData | null>(null)
    useEffect(() => {
        if (!showTomorrow) return
        let active = true
        Promise.all([
            listEvents(tomorrow, tomorrow).catch(() => [] as Event[]),
            listTasks(tomorrow, tomorrow).catch(() => [] as Task[]),
            listReminders(tomorrow, tomorrow).catch(() => [] as Reminder[]),
            listStatuses(tomorrow, tomorrow).catch(() => [] as DayStatus[]),
        ]).then(([events, tasks, reminders, statuses]) => {
            if (active) setTomorrowData({ events, tasks, reminders, statuses })
        })
        return () => {
            active = false
        }
    }, [showTomorrow, tomorrow, tasksVersion])

    async function toggleTask(task: Task) {
        if (togglingId) return
        setTogglingId(task._id)
        setTasks((prev) => prev.map((t) => (t._id === task._id ? { ...t, completed: !t.completed } : t)))
        try {
            await updateTask(task._id, { completed: !task.completed })
            invalidate('tasks')
        } catch {
            setTasks((prev) =>
                prev.map((t) => (t._id === task._id ? { ...t, completed: task.completed } : t))
            )
        } finally {
            setTogglingId(null)
        }
    }

    // ── Derived: budgets ────────────────────────────────────────────────────
    const trackedRows = rows.filter(
        (r) =>
            r.budgeted &&
            (r.budgetType === 'daily' || r.budgetType === 'weekly') &&
            rowVisibleInMonth(r, month, groups.find((g) => g._id === r.group))
    )
    // On an excluded day (trip/holiday), regular budgets carry no allowance — the
    // day is funded by its exclusion pot instead, so show that pot's figures.
    const isExcludedDay = excludedDates.has(date)
    const potsToday = exclusionPots.filter((p) => p.dates.includes(date))

    interface SpendFigure {
        key: string
        name: string
        amount: number
        context: string
    }
    const spendFigures: SpendFigure[] = isExcludedDay
        ? potsToday.map((p) => {
              const pot = computeExclusionPot(p, spends)
              const last = p.dates[p.dates.length - 1]
              return {
                  key: p._id,
                  name: p.label || 'Day-off pot',
                  amount: pot.remaining,
                  context: `£${fmt(p.amount)} pot over ${p.dates.length} day${p.dates.length !== 1 ? 's' : ''} · £${fmt(pot.spent)} spent · ${last === date ? 'last day' : `runs to ${Number(last.slice(8))}/${Number(last.slice(5, 7))}`}`,
              }
          })
        : trackedRows.map((row) => {
              const b = computeBudgetToday(
                  row,
                  entries.find((e) => e.row === row._id),
                  spends.filter((s) => s.row === row._id),
                  topUps.filter((t) => t.row === row._id),
                  date,
                  excludedDates
              )
              return { key: row._id, name: row.name, amount: b.canSpendToday, context: b.context }
          })
    const totalToday = spendFigures.reduce((sum, b) => sum + b.amount, 0)
    const spendSubtitle = isExcludedDay
        ? potsToday.length > 0
            ? `Day off regular budgets — spending comes from your ${potsToday.map((p) => p.label || 'day-off').join(' & ')} pot${potsToday.length !== 1 ? 's' : ''}`
            : 'Day off budget — no pot covers this day'
        : `Across ${spendFigures.length} budget${spendFigures.length !== 1 ? 's' : ''}, carry included`

    // ── Derived: day plan ───────────────────────────────────────────────────
    const allDayEvents = events.filter((e) => eventCoversAllDay(e, date))
    const partEvents = PERIODS.map((period) => ({
        period,
        event: events.find((e) => eventCoversSlot(e, date, period.key as Part)) ?? null,
    })).filter((p) => p.event !== null)
    const openTasks = tasks.filter((t) => !t.completed)
    const isToday = viewingToday
    const { year, month: m, day: d } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, m, d).getDay()]

    return (
        <Container as="main" className="py-10">
            <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Daily Report</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {isToday ? 'Your brief for today' : `Your brief for ${weekday}`} —{' '}
                        {formatDateLong(date)}
                    </p>
                </div>
                <DashboardDateNav date={date} onChange={setDate} />
            </header>

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* At-a-glance brief */}
                    <div className="rounded-2xl bg-neutral-950 p-6 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                            {isToday ? 'You can spend today' : `Spendable on this day`}
                        </p>
                        <p
                            className={`mt-1 text-4xl font-bold tabular-nums tracking-tight ${totalToday < 0 ? 'text-red-400' : ''}`}
                        >
                            {totalToday < 0 ? '-' : ''}£{fmt(Math.abs(totalToday))}
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                            {spendSubtitle}
                            {openTasks.length > 0 && (
                                <>
                                    {' '}
                                    · {openTasks.length} task{openTasks.length !== 1 ? 's' : ''} to do
                                </>
                            )}
                            {allDayEvents.length + partEvents.length > 0 && (
                                <>
                                    {' '}
                                    · {allDayEvents.length + partEvents.length} event
                                    {allDayEvents.length + partEvents.length !== 1 ? 's' : ''}
                                </>
                            )}
                        </p>

                        {/* Per-budget (or per-pot) figures */}
                        {spendFigures.length > 0 && (
                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {spendFigures.map((b) => (
                                    <div key={b.key} className="rounded-xl bg-white/5 px-4 py-3">
                                        <p className="truncate text-xs font-semibold text-neutral-300">
                                            {b.name}
                                        </p>
                                        <p
                                            className={`mt-0.5 text-xl font-bold tabular-nums ${b.amount < 0 ? 'text-red-400' : 'text-emerald-400'}`}
                                        >
                                            {b.amount < 0 ? '-' : ''}£{fmt(Math.abs(b.amount))}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-neutral-500">{b.context}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                        {spendFigures.length === 0 && !isExcludedDay && (
                            <p className="mt-3 text-xs text-neutral-500">
                                No tracked budgets this month —{' '}
                                <Link to="/finances/budgets" className="font-semibold text-neutral-300 underline underline-offset-2">
                                    enable tracking on a budget
                                </Link>
                                .
                            </p>
                        )}
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Weather */}
                        <Card>
                            <CardHeader className="flex items-center justify-between gap-4">
                                <CardTitle>Weather</CardTitle>
                                <Link
                                    to="/weather"
                                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                                >
                                    Full forecast
                                </Link>
                            </CardHeader>
                            {location ? (
                                <WeatherBrief date={date} forecast={forecast} />
                            ) : (
                                <p className="text-sm text-neutral-400">
                                    <Link
                                        to="/weather"
                                        className="font-semibold text-neutral-600 underline underline-offset-2"
                                    >
                                        Set a location
                                    </Link>{' '}
                                    to see the day&apos;s weather here.
                                </p>
                            )}
                        </Card>

                        {/* Tasks */}
                        <Card>
                            <CardHeader className="flex items-center justify-between gap-4">
                                <CardTitle>Tasks</CardTitle>
                                <Link
                                    to={`/day/${date}`}
                                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                                >
                                    Open day
                                </Link>
                            </CardHeader>
                            {tasks.length === 0 ? (
                                <p className="text-sm text-neutral-400">Nothing on the list — clear day.</p>
                            ) : (
                                <div className="flex flex-col gap-1">
                                    <p className="mb-1 text-xs font-semibold text-neutral-400">
                                        {openTasks.length === 0
                                            ? 'All done'
                                            : `${openTasks.length} of ${tasks.length} still to do`}
                                    </p>
                                    {tasks.map((task) => (
                                        <div
                                            key={task._id}
                                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleTask(task)}
                                                disabled={togglingId === task._id}
                                                className={[
                                                    'grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-colors',
                                                    task.completed
                                                        ? 'border-neutral-800 bg-neutral-800'
                                                        : 'border-neutral-300 hover:border-neutral-500',
                                                ].join(' ')}
                                                aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                                            >
                                                {task.completed && (
                                                    <i
                                                        className="fa-solid fa-check text-[9px] text-white"
                                                        aria-hidden="true"
                                                    />
                                                )}
                                            </button>
                                            <span
                                                className={[
                                                    'flex-1 truncate text-sm font-medium',
                                                    task.completed
                                                        ? 'text-neutral-400 line-through'
                                                        : 'text-neutral-800',
                                                ].join(' ')}
                                            >
                                                {task.title}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Day plan — events and reminders, only when there's something on */}
                    {(allDayEvents.length > 0 || partEvents.length > 0 || reminders.length > 0) && (
                        <Card>
                            <CardHeader className="flex items-center justify-between gap-4">
                                <CardTitle>On today</CardTitle>
                                <Link
                                    to="/calendar"
                                    className="text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                                >
                                    View calendar
                                </Link>
                            </CardHeader>
                            <div className="flex flex-col gap-1">
                                {allDayEvents.map((e) => {
                                    const colors = colorsForEvent(e, calendarsById)
                                    return (
                                        <div
                                            key={e._id}
                                            className={`flex items-center gap-3 rounded-xl px-3 py-2 ${colors.bg}`}
                                        >
                                            <i
                                                className="fa-regular fa-calendar w-4 shrink-0 text-center text-sm opacity-60"
                                                aria-hidden="true"
                                            />
                                            <p className={`min-w-0 flex-1 truncate text-sm font-semibold ${colors.text}`}>
                                                {e.title}
                                            </p>
                                            <span className={`shrink-0 text-xs font-medium opacity-60 ${colors.text}`}>
                                                all day
                                            </span>
                                        </div>
                                    )
                                })}
                                {partEvents.map(({ period, event }) => {
                                    const colors = colorsForEvent(event!, calendarsById)
                                    return (
                                        <div
                                            key={period.key}
                                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
                                        >
                                            <i
                                                className={`${period.icon} w-4 shrink-0 text-center text-sm text-neutral-300`}
                                                aria-hidden="true"
                                            />
                                            <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                {period.label}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-800">
                                                {event!.title}
                                            </span>
                                            {event!.time && (
                                                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                                                    {event!.time}
                                                </span>
                                            )}
                                            <span
                                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${colors.bg} ${colors.text}`}
                                            >
                                                {EVENT_TYPE_LABELS[event!.eventType]}
                                            </span>
                                        </div>
                                    )
                                })}
                                {reminders.map((r) => (
                                    <div
                                        key={`${r._id}-${r.date}`}
                                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50"
                                    >
                                        <i
                                            className="fa-solid fa-bell w-4 shrink-0 text-center text-sm text-amber-400"
                                            aria-hidden="true"
                                        />
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                                            {r.text}
                                        </span>
                                        <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                                            reminder
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

                    {/* Evening wind-down — today's report ends, tomorrow's prep begins. */}
                    {showTomorrow && (
                        <TomorrowBrief
                            date={tomorrow}
                            forecast={forecast}
                            data={tomorrowData}
                            calendarsById={calendarsById}
                        />
                    )}
                </div>
            )}
        </Container>
    )
}
