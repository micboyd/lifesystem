import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DASH } from './DashSection'
import { useAuth } from '../../context/AuthContext'
import { useCalendars } from '../../context/CalendarsContext'
import {
    fetchForecast,
    weatherInfo,
    whatToWear,
    dayCondition,
    planningInsight,
    weatherWarnings,
    RAIN_LIKELY_PCT,
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
import { listReminders } from '../../services/reminders'
import { listStatuses } from '../../services/dayStatus'
import { timeToMinutes, DEFAULT_WAKE } from '../../lib/time'
import { DAY_STATUS_OPTIONS } from '../../types'
import { colorsForEvent } from '../../lib/eventColors'
import type { Event, Reminder, Part, DayStatus, Calendar as CalendarLayer } from '../../types'

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

/** One "get ready" line on the night banner: a small label over a sentence that may wrap. */
function PrepRow({ icon, label, text, accent = false }: { icon: string; label: string; text: string; accent?: boolean }) {
    return (
        <li className="flex items-start gap-3 py-3">
            <i
                className={`${icon} mt-[3px] w-4 shrink-0 text-center text-sm ${accent ? 'text-violet-300' : 'text-white/50'}`}
                aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
                <p className="text-[13px] text-white/50">{label}</p>
                <p className="mt-0.5 text-[15px] leading-6 text-white/90">{text}</p>
            </div>
        </li>
    )
}

/** A column's small heading on the banner. */
function BannerLabel({ children }: { children: ReactNode }) {
    return <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-white/50">{children}</p>
}

/** One "what's on" line: icon, a muted label, the thing, an optional value. */
function OnRow({
    icon,
    iconClass = 'text-white/50',
    label,
    dot,
    text,
    value,
}: {
    icon: string
    iconClass?: string
    label: string
    dot?: string
    text: string
    value?: string
}) {
    return (
        <li className="flex min-h-[48px] items-center gap-3 py-3">
            <i className={`${icon} w-4 shrink-0 text-center text-sm ${iconClass}`} aria-hidden="true" />
            <span className="w-20 shrink-0 text-[13px] text-white/50">{label}</span>
            {dot && <span className={`${DASH.dot} ${dot}`} />}
            <span className="min-w-0 flex-1 truncate text-[15px] text-white/90">{text}</span>
            {value && <span className="shrink-0 text-[13px] nums text-white/60">{value}</span>}
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
    // The plain "rain likely" notice repeats the forecast's own rain % just below,
    // so only warnings that change plans (storms, heavy rain, wind, fog, UV) lead.
    const warnings =
        day && hourly.length > 0
            ? weatherWarnings(hourly, day).filter((w) => !(w.id === 'rain' && w.severity === 'yellow'))
            : []
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
        allDay.length + parts.length + reminders.length === 0 && !statusOption

    const prep = prepChecklist(day, firstTimed, { maxGust, minVis, dayStartMin })

    const facts = day
        ? [
              day.sunrise && { label: 'Sunrise', value: formatClock(day.sunrise) },
              day.sunset && { label: 'Sunset', value: formatClock(day.sunset) },
              day.uvIndexMax != null && { label: 'UV', value: String(Math.round(day.uvIndexMax)) },
              maxGust > day.windMax + 5 && { label: 'Gusts', value: `${maxGust} mph` },
              totalRain > 0.2 && { label: 'Rain', value: `${Math.round(totalRain * 10) / 10}mm` },
              minVis < 10 && {
                  label: 'Visibility',
                  value: minVis < 1 ? `${Math.round(minVis * 1000)}m` : `${minVis}km`,
              },
          ].filter((f): f is { label: string; value: string } => !!f)
        : []

    return (
        <section className="relative overflow-hidden rounded-3xl bg-neutral-900 text-white">
            {/* A faint night sky — a violet glow and a few stars, nothing that competes with the words. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
                <span className="absolute right-[18%] top-8 h-1 w-1 rounded-full bg-white/40" />
                <span className="absolute right-[30%] top-16 h-0.5 w-0.5 rounded-full bg-white/50" />
                <span className="absolute right-[9%] top-20 h-0.5 w-0.5 rounded-full bg-white/30" />
                <span className="absolute right-[24%] top-5 h-0.5 w-0.5 rounded-full bg-white/40" />
            </div>

            <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:p-8">
                {/* Heading */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-lg text-violet-200" aria-hidden="true">
                            <i className={isPreDawn ? 'fa-solid fa-sun' : 'fa-solid fa-moon'} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-xl font-semibold tracking-[-0.015em] sm:text-2xl">
                                {isPreDawn ? 'Day ahead' : 'Time to sleep'}
                            </h2>
                            <p className="mt-0.5 truncate text-[13px] text-white/60">
                                {isPreDawn ? 'Today' : 'Tomorrow'} · {formatDateLong(date)}
                            </p>
                        </div>
                    </div>
                    <Link
                        to={`/calendar?date=${date}`}
                        className="group inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-sm font-medium text-white/90 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/20"
                    >
                        Open day
                        <i className="fa-solid fa-arrow-right text-[11px] transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                </div>

                {/* Warnings lead — they change what "prepared" means. */}
                {warnings.length > 0 && (
                    <div className="grid gap-2 md:grid-cols-2">
                        {warnings.map((w) => (
                            <div key={w.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.07] px-4 py-3.5 ring-1 ring-inset ring-white/10">
                                <i className={`${w.icon} mt-0.5 shrink-0 text-sm ${SEVERITY_ICON_STYLES[w.severity]}`} aria-hidden="true" />
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-white">{w.title}</p>
                                    <p className="mt-0.5 text-[13px] leading-[19px] text-white/70">{w.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Weather · Get ready · What's on — side by side on wide screens. */}
                <div className="grid gap-8 lg:grid-cols-3 lg:gap-0 lg:divide-x lg:divide-white/10">
                    <div className="lg:pr-8">
                        <BannerLabel>Weather</BannerLabel>
                        {day && info ? (
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4">
                                    <i className={`${info.icon} text-4xl text-sky-300`} aria-hidden="true" />
                                    <div className="min-w-0">
                                        <p className="flex items-baseline gap-2">
                                            <span className="text-[40px] font-medium leading-none tracking-[-0.04em] nums">
                                                {day.tempMax}&deg;
                                            </span>
                                            <span className="text-[15px] text-white/70">{info.label}</span>
                                        </p>
                                        <p className="mt-1.5 text-[13px] text-white/60">
                                            Low {day.tempMin}&deg;
                                            {day.precipitationProbability > 0 && <> · {day.precipitationProbability}% rain</>}
                                            {` · wind ${day.windMax} mph`}
                                        </p>
                                    </div>
                                </div>
                                {facts.length > 0 && (
                                    <dl className="grid grid-cols-3 gap-2">
                                        {facts.map((f) => (
                                            <div key={f.label} className="rounded-xl bg-white/[0.06] px-3 py-2">
                                                <dt className="text-[11px] text-white/50">{f.label}</dt>
                                                <dd className="text-sm font-medium nums text-white/90">{f.value}</dd>
                                            </div>
                                        ))}
                                    </dl>
                                )}
                            </div>
                        ) : (
                            <p className="py-3 text-[15px] text-white/60">
                                No forecast yet.{' '}
                                <Link to="/weather" className="font-medium text-white underline underline-offset-4">
                                    Open weather
                                </Link>
                            </p>
                        )}
                    </div>

                    <div className="lg:px-8">
                        <BannerLabel>Get ready</BannerLabel>
                        {day && info ? (
                            <ul className="divide-y divide-white/10">
                                {/* What to wear leads — it's the thing you sort out the night before. */}
                                <PrepRow icon="fa-solid fa-shirt" label="What to wear" text={whatToWear(day)} />
                                {insight && <PrepRow icon="fa-solid fa-lightbulb" label="Worth knowing" text={insight} />}
                                {/* Tonight's checklist — actions before bed, only when something applies. */}
                                {prep.map((item) => (
                                    <PrepRow key={item.id} icon={item.icon} label="Tonight" text={item.text} accent />
                                ))}
                            </ul>
                        ) : prep.length > 0 ? (
                            <ul className="divide-y divide-white/10">
                                {prep.map((item) => (
                                    <PrepRow key={item.id} icon={item.icon} label="Tonight" text={item.text} accent />
                                ))}
                            </ul>
                        ) : (
                            <p className="py-3 text-[15px] text-white/60">Nothing to sort tonight.</p>
                        )}
                    </div>

                    <div className="lg:pl-8">
                        <BannerLabel>
                            {firstTimed ? (
                                <>
                                    First thing · <span className="text-white/90">{firstTimed.title}</span>{' '}
                                    <span className="nums text-white/90">{firstTimed.time}</span>
                                </>
                            ) : (
                                "What's on"
                            )}
                        </BannerLabel>
                        {statusOption && (
                            <p className={`mb-2 flex h-10 items-center gap-2.5 rounded-xl px-4 text-sm font-medium ${statusOption.bg} ${statusOption.text}`}>
                                <i className="fa-solid fa-umbrella-beach text-sm" aria-hidden="true" />
                                {statusOption.label}
                            </p>
                        )}
                        {nothingOn ? (
                            <p className="py-3 text-[15px] text-white/60">Nothing scheduled — a clear day ahead.</p>
                        ) : (
                            <ul className="divide-y divide-white/10">
                                {allDay.map((e) => (
                                    <OnRow
                                        key={e._id}
                                        icon="fa-regular fa-calendar"
                                        label="All day"
                                        dot={colorsForEvent(e, calendarsById).bg}
                                        text={e.title}
                                    />
                                ))}
                                {parts.map(({ period, event }) => (
                                    <OnRow
                                        key={period.key}
                                        icon={period.icon}
                                        label={period.label}
                                        dot={colorsForEvent(event!, calendarsById).bg}
                                        text={event!.title}
                                        value={event!.time}
                                    />
                                ))}
                                {reminders.map((r) => (
                                    <OnRow
                                        key={`${r._id}-${r.date}`}
                                        icon="fa-solid fa-bell"
                                        iconClass="text-amber-300"
                                        label="Reminder"
                                        text={r.text}
                                    />
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </section>
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
            listReminders(target, target).catch(() => [] as Reminder[]),
            listStatuses(target, target).catch(() => [] as DayStatus[]),
        ]).then(([events, reminders, statuses]) => {
            if (active) setData({ events, reminders, statuses })
        })
        return () => {
            active = false
        }
    }, [show, target])

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
