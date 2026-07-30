import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import { useAuth } from '../../context/AuthContext'
import { useCalendars } from '../../context/CalendarsContext'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    fetchForecast,
    weatherInfo,
    whatToWear,
    dayCondition,
    partOfDaySummary,
    planningInsight,
    weatherWarnings,
    SEVERITY_STYLES,
    SEVERITY_ICON_STYLES,
    type Forecast,
} from '../../lib/weather'
import {
    todayKey,
    formatDateLong,
    addDays,
    PERIODS,
    eventCoversSlot,
    eventCoversAllDay,
} from '../../lib/calendar'
import { listEvents } from '../../services/events'
import { listTasks } from '../../services/tasks'
import { listReminders } from '../../services/reminders'
import { listStatuses } from '../../services/dayStatus'
import { timeToMinutes, DEFAULT_WAKE } from '../../lib/time'
import { DAY_STATUS_OPTIONS } from '../../types'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event, Task, Reminder, Part, DayStatus, Calendar as CalendarLayer } from '../../types'

/** From this hour onwards, "today" is basically done and tomorrow is the useful view. */
const EVENING_HOUR = 19

/** Minutes since midnight for the current wall-clock time. */
function nowMinutes(): number {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
}

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
 * The evening counterpart to the dashboard: once today is effectively over, what
 * matters is what you need to have ready. Weather and clothing come first because
 * they're the things you act on before bed (washing, bag, alarm).
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
    const hourly = forecast?.hourlyByDate[date] ?? []
    const info = day ? weatherInfo(dayCondition(day, hourly)) : null
    const bands = partOfDaySummary(hourly)
    const warnings = day && hourly.length > 0 ? weatherWarnings(hourly, day) : []
    const insight = hourly.length > 0 ? planningInsight(hourly) : ''
    // Waking-hours figures for the extra detail line.
    const waking = hourly.filter((h) => h.hour >= 6 && h.hour <= 22)
    const maxGust = waking.length > 0 ? Math.max(...waking.map((h) => h.windGust)) : 0
    const totalRain = waking.reduce((sum, h) => sum + h.precipitation, 0)
    const minVis = waking.length > 0 ? Math.min(...waking.map((h) => h.visibility)) : Infinity
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
                                {totalRain > 0.2 && (
                                    <span>
                                        <i
                                            className="fa-solid fa-cloud-rain mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        {Math.round(totalRain * 10) / 10}mm rain
                                    </span>
                                )}
                                {minVis < 10 && (
                                    <span>
                                        <i
                                            className="fa-solid fa-eye mr-1 text-neutral-300"
                                            aria-hidden="true"
                                        />
                                        Vis {minVis < 1 ? `${Math.round(minVis * 1000)}m` : `${minVis}km`}
                                    </span>
                                )}
                            </div>

                            <Link
                                to="/weather"
                                className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-sky-600 transition-colors hover:text-sky-700"
                            >
                                Full forecast
                                <i className="fa-solid fa-arrow-right text-[10px]" aria-hidden="true" />
                            </Link>
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
                            <span className="truncate text-sm font-semibold">{statusOption.label}</span>
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
                                <p className={`min-w-0 flex-1 truncate text-sm font-semibold ${colors.text}`}>
                                    {e.title}
                                </p>
                                <span className={`shrink-0 text-xs font-medium opacity-60 ${colors.text}`}>
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
                        <p className="text-sm text-neutral-400">Nothing scheduled — a clear day ahead.</p>
                    )}
                </div>
            </div>
        </Card>
    )
}

/**
 * Whether the "prepare for tomorrow" brief should show right now, and which day
 * it targets. Exposed as a hook so the dashboard can know in advance and adjust
 * its layout — otherwise the brief's column leaves a gap when it's hidden.
 *
 * Shows from {@link EVENING_HOUR} in the evening right through midnight until the
 * timebox day-start time (the user's `wakeTime`), so it stays useful in the
 * small hours. Only appears while viewing today.
 */
export function useTomorrowVisible(date: string = todayKey()): { show: boolean; target: string } {
    const { user } = useAuth()

    // The day "begins" at the timebox wake time; until then, an evening that ran
    // past midnight is still winding down toward the day about to start. Bounded
    // by EVENING_HOUR so a misconfigured wake time can't reveal it mid-afternoon.
    const eveningMin = EVENING_HOUR * 60
    const dayStartMin = Math.min(timeToMinutes(user?.settings?.wakeTime ?? DEFAULT_WAKE), eveningMin)

    // Re-checked each minute so crossing 7pm or the morning start reveals/hides
    // the section on a page that's been sitting open.
    const [nowMin, setNowMin] = useState(() => nowMinutes())
    useEffect(() => {
        const id = setInterval(() => setNowMin(nowMinutes()), 60_000)
        return () => clearInterval(id)
    }, [])

    // Pre-dawn: after midnight but before the day has officially begun.
    const isPreDawn = nowMin < dayStartMin
    const inWindow = nowMin >= eveningMin || isPreDawn

    // Only meaningful while looking at today — "tomorrow" relative to a date
    // you're browsing isn't something you can prepare for.
    const show = date === todayKey() && inWindow
    // Evening → prepare for the next calendar day. Pre-dawn → the day about to
    // start *is* the calendar's "today".
    const target = isPreDawn ? todayKey() : addDays(todayKey(), 1)

    return { show, target }
}

/**
 * Evening wind-down for the dashboard. Renders a brief for the day about to
 * begin — see {@link useTomorrowVisible} for when it appears. Fetches its own
 * forecast and day items so the dashboard can just drop it in.
 */
export default function TomorrowWidget({ date = todayKey() }: { date?: string }) {
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null
    const { byId: calendarsById } = useCalendars()
    const tasksVersion = useDataVersion('tasks')

    const { show, target } = useTomorrowVisible(date)

    const [forecast, setForecast] = useState<Forecast | null>(null)
    useEffect(() => {
        if (!show || !location) return
        let active = true
        fetchForecast(location)
            .then((f) => active && setForecast(f))
            .catch(() => active && setForecast(null))
        return () => {
            active = false
        }
    }, [show, location?.latitude, location?.longitude])

    const [data, setData] = useState<TomorrowData | null>(null)
    useEffect(() => {
        if (!show) return
        let active = true
        Promise.all([
            listEvents(target, target).catch(() => [] as Event[]),
            listTasks(target, target).catch(() => [] as Task[]),
            listReminders(target, target).catch(() => [] as Reminder[]),
            listStatuses(target, target).catch(() => [] as DayStatus[]),
        ]).then(([events, tasks, reminders, statuses]) => {
            if (active) setData({ events, tasks, reminders, statuses })
        })
        return () => {
            active = false
        }
    }, [show, target, tasksVersion])

    if (!show) return null

    return (
        <TomorrowBrief
            date={target}
            forecast={forecast}
            data={data}
            calendarsById={calendarsById}
        />
    )
}
