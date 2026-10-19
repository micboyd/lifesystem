import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH } from './DashSection'
import { useAuth } from '../../context/AuthContext'
import { useCalendars } from '../../context/CalendarsContext'
import { useDataVersion } from '../../context/DataSyncContext'
import {
    fetchForecast,
    weatherInfo,
    whatToWear,
    dayCondition,
    planningInsight,
    weatherWarnings,
    RAIN_LIKELY_PCT,
    SEVERITY_STYLES,
    SEVERITY_ICON_STYLES,
    type Forecast,
    type DailyForecast,
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

interface PrepItem {
    id: string
    icon: string
    text: string
}

/**
 * Concrete things worth doing tonight, inferred from tomorrow's weather and the
 * first thing on the calendar. Distinct from {@link whatToWear} — that's what to
 * put on in the morning; these are actions you take before bed (bag by the door,
 * alarm set, extra travel time). Ordered by how early in the evening you'd act.
 */
function prepChecklist(
    day: DailyForecast | null | undefined,
    firstTimed: Event | undefined,
    metrics: { maxGust: number; minVis: number; dayStartMin: number },
): PrepItem[] {
    const items: PrepItem[] = []
    if (day) {
        const likely = day.precipitationProbability >= RAIN_LIKELY_PCT
        const isSnow =
            likely && ((day.code >= 71 && day.code <= 77) || day.code === 85 || day.code === 86)
        const isRain =
            likely &&
            ((day.code >= 51 && day.code <= 67) ||
                (day.code >= 80 && day.code <= 82) ||
                day.code >= 95)

        if (isSnow) {
            items.push({
                id: 'snow',
                icon: 'fa-solid fa-snowflake',
                text: 'Snow likely — set out boots and allow extra travel time',
            })
        } else if (isRain) {
            items.push({
                id: 'rain',
                icon: 'fa-solid fa-umbrella',
                text: 'Rain likely — put an umbrella or waterproof by the door',
            })
        }

        if (day.tempMin <= 2) {
            items.push({
                id: 'frost',
                icon: 'fa-solid fa-icicles',
                text: 'Frost likely overnight — leave time to de-ice in the morning',
            })
        }

        if ((day.uvIndexMax ?? 0) >= 6) {
            items.push({
                id: 'uv',
                icon: 'fa-solid fa-sun',
                text: 'Strong sun tomorrow — set out sunscreen',
            })
        }

        if (day.windMax >= 25 || metrics.maxGust >= 35) {
            items.push({
                id: 'wind',
                icon: 'fa-solid fa-wind',
                text: 'Windy — bring loose items indoors tonight',
            })
        }

        if (metrics.minVis < 1) {
            items.push({
                id: 'fog',
                icon: 'fa-solid fa-smog',
                text: 'Fog likely — allow extra travel time',
            })
        }
    }

    // An early first commitment is the one thing that changes tonight's alarm —
    // "early" being before your timebox day-start (wakeTime), the time you'd
    // otherwise be up.
    if (firstTimed?.time && timeToMinutes(firstTimed.time) < metrics.dayStartMin) {
        items.push({
            id: 'alarm',
            icon: 'fa-regular fa-clock',
            text: `Early start — ${firstTimed.title} at ${firstTimed.time}. Set an alarm.`,
        })
    }

    return items
}

/** One "get ready" line: a small label stacked over a sentence that may wrap. */
function PrepRow({ icon, label, text, accent = false }: { icon: string; label: string; text: string; accent?: boolean }) {
    return (
        <li className={DASH.rowWrap}>
            <i
                className={`${icon} mt-[3px] w-4 shrink-0 text-center text-sm ${accent ? 'text-violet-500' : 'text-neutral-500'}`}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <p className={DASH.note}>{label}</p>
                <p className="mt-0.5 text-[15px] leading-6 text-neutral-900">{text}</p>
            </div>
        </li>
    )
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
    dayStartMin,
    isPreDawn,
}: {
    date: string
    forecast: Forecast | null
    data: TomorrowData | null
    calendarsById: Map<string, CalendarLayer>
    dayStartMin: number
    isPreDawn: boolean
}) {
    const day = forecast?.daily.find((d) => d.date === date)
    const hourly = forecast?.hourlyByDate[date] ?? []
    const info = day ? weatherInfo(dayCondition(day, hourly)) : null
    const warnings = day && hourly.length > 0 ? weatherWarnings(hourly, day) : []
    const insight = hourly.length > 0 ? planningInsight(hourly) : ''
    // Waking-hours figures for the extra detail line.
    const waking = hourly.filter((h) => h.hour >= 6 && h.hour <= 22)
    const maxGust = waking.length > 0 ? Math.max(...waking.map((h) => h.windGust)) : 0
    const totalRain = waking.reduce((sum, h) => sum + h.precipitation, 0)
    const minVis = waking.length > 0 ? Math.min(...waking.map((h) => h.visibility)) : Infinity

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

    const prep = prepChecklist(day, firstTimed, { maxGust, minVis, dayStartMin })

    return (
        <DashSection
            title={isPreDawn ? 'Day ahead' : 'Time to sleep'}
            icon={isPreDawn ? 'fa-solid fa-sun' : 'fa-solid fa-moon'}
            tone="violet"
            meta={formatDateLong(date)}
            to={`/day/${date}`}
            action="Open day"
        >
            {/* Warnings lead — they change what "prepared" means. */}
            {warnings.length > 0 && (
                <div className="mb-6 flex flex-col gap-2">
                    {warnings.map((w) => (
                        <div
                            key={w.id}
                            className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 ${SEVERITY_STYLES[w.severity]}`}
                        >
                            <i className={`${w.icon} mt-0.5 shrink-0 text-sm ${SEVERITY_ICON_STYLES[w.severity]}`} aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">{w.title}</p>
                                <p className="mt-0.5 text-[13px] leading-[19px]">{w.detail}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* One full-width column: weather, then what to get ready, then what's on.
                (Two side-by-side columns squeezed every row to a few words wide.) */}
            <div className={DASH.stack}>
                {day && info ? (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                        <div className="flex items-center gap-4">
                            <i className={`${info.icon} text-4xl text-sky-500`} aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="flex items-baseline gap-2">
                                    <span className={DASH.figureSm}>{day.tempMax}&deg;</span>
                                    <span className="text-[15px] text-neutral-600">{info.label}</span>
                                </p>
                                <p className={DASH.note}>
                                    Low {day.tempMin}&deg;
                                    {day.precipitationProbability > 0 && <> · {day.precipitationProbability}% rain</>}
                                    {` · wind ${day.windMax} mph`}
                                </p>
                            </div>
                        </div>
                        {/* Numbers worth knowing the night before. */}
                        <div className={`flex flex-wrap gap-x-5 gap-y-1 ${DASH.note}`}>
                            {day.sunrise && <span>Sunrise <span className="tabular-nums text-neutral-900">{formatClock(day.sunrise)}</span></span>}
                            {day.sunset && <span>Sunset <span className="tabular-nums text-neutral-900">{formatClock(day.sunset)}</span></span>}
                            {day.uvIndexMax != null && <span>UV <span className="tabular-nums text-neutral-900">{Math.round(day.uvIndexMax)}</span></span>}
                            {maxGust > day.windMax + 5 && <span>Gusts <span className="tabular-nums text-neutral-900">{maxGust} mph</span></span>}
                            {totalRain > 0.2 && <span>Rain <span className="tabular-nums text-neutral-900">{Math.round(totalRain * 10) / 10}mm</span></span>}
                            {minVis < 10 && (
                                <span>
                                    Visibility{' '}
                                    <span className="tabular-nums text-neutral-900">
                                        {minVis < 1 ? `${Math.round(minVis * 1000)}m` : `${minVis}km`}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className={DASH.empty}>
                        No forecast for tomorrow yet.{' '}
                        <Link to="/weather" className={DASH.emptyLink}>
                            Open weather
                        </Link>
                    </p>
                )}

                {day && info && (
                    <div>
                        <p className={`mb-2 ${DASH.subhead}`}>Get ready</p>
                        <ul className={DASH.list}>
                            {/* What to wear leads — it's the thing you sort out the night before. */}
                            <PrepRow icon="fa-solid fa-shirt" label="What to wear" text={whatToWear(day)} />
                            {insight && <PrepRow icon="fa-solid fa-lightbulb" label="Worth knowing" text={insight} />}
                            {/* Tonight's checklist — actions before bed, only when something applies. */}
                            {prep.map((item) => (
                                <PrepRow key={item.id} icon={item.icon} label="Tonight" text={item.text} accent />
                            ))}
                        </ul>
                    </div>
                )}

                <div>
                    <p className={`mb-2 ${DASH.subhead}`}>
                        {firstTimed ? (
                            <>
                                First thing: <span className="text-neutral-900">{firstTimed.title}</span> at{' '}
                                <span className="tabular-nums text-neutral-900">{firstTimed.time}</span>
                            </>
                        ) : (
                            "What's on"
                        )}
                    </p>
                    {statusOption && (
                        <p className={`mb-3 flex h-10 items-center gap-2.5 rounded-xl px-4 text-sm font-medium ${statusOption.bg} ${statusOption.text}`}>
                            <i className="fa-solid fa-umbrella-beach text-sm" aria-hidden="true" />
                            {statusOption.label}
                        </p>
                    )}
                    {nothingOn ? (
                        <p className={DASH.empty}>Nothing scheduled — a clear day ahead.</p>
                    ) : (
                        <ul className={DASH.list}>
                            {allDay.map((e) => {
                                const colors = colorsForEvent(e, calendarsById)
                                return (
                                    <li key={e._id} className={DASH.row}>
                                        <i className={`fa-regular fa-calendar ${DASH.rowIcon}`} aria-hidden="true" />
                                        <span className={DASH.rowLabel}>All day</span>
                                        <span className={`${DASH.dot} ${colors.bg}`} />
                                        <span className={DASH.rowText}>{e.title}</span>
                                    </li>
                                )
                            })}
                            {parts.map(({ period, event }) => {
                                const colors = colorsForEvent(event!, calendarsById)
                                return (
                                    <li key={period.key} className={DASH.row}>
                                        <i className={`${period.icon} ${DASH.rowIcon}`} aria-hidden="true" />
                                        <span className={DASH.rowLabel}>{period.label}</span>
                                        <span className={`${DASH.dot} ${colors.bg}`} />
                                        <span className={DASH.rowText}>{event!.title}</span>
                                        {event!.time && <span className={DASH.rowValue}>{event!.time}</span>}
                                    </li>
                                )
                            })}
                            {reminders.map((r) => (
                                <li key={`${r._id}-${r.date}`} className={DASH.row}>
                                    <i className="fa-solid fa-bell w-4 shrink-0 text-center text-sm text-amber-500" aria-hidden="true" />
                                    <span className={DASH.rowLabel}>Reminder</span>
                                    <span className={DASH.rowText}>{r.text}</span>
                                </li>
                            ))}
                            {openTasks.length > 0 && (
                                <li className={DASH.row}>
                                    <i className={`fa-solid fa-list-check ${DASH.rowIcon}`} aria-hidden="true" />
                                    <span className={DASH.rowLabel}>Tasks</span>
                                    <span className={DASH.rowText}>
                                        {openTasks.length} task{openTasks.length !== 1 ? 's' : ''} lined up
                                    </span>
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            </div>
        </DashSection>
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
export function useTomorrowVisible(
    date: string = todayKey(),
): { show: boolean; target: string; isPreDawn: boolean } {
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

    return { show, target, isPreDawn }
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

    const { show, target, isPreDawn } = useTomorrowVisible(date)

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

    // The timebox day-start decides what counts as an "early" alarm.
    const dayStartMin = timeToMinutes(user?.settings?.wakeTime ?? DEFAULT_WAKE)

    return (
        <TomorrowBrief
            date={target}
            forecast={forecast}
            data={data}
            calendarsById={calendarsById}
            dayStartMin={dayStartMin}
            isPreDawn={isPreDawn}
        />
    )
}
