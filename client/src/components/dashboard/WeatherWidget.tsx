import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { useAuth } from '../../context/AuthContext'
import {
    fetchForecast,
    weatherInfo,
    dayCondition,
    type Forecast,
    type HourlySlot,
} from '../../lib/weather'

/** A short weekday ("Mon", "Tue") for an ahead-tile. */
function dayLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' })
}

/** Compact clock label for an hourly tile ("9am", "3pm", "12pm"). */
function hourLabel(hour: number): string {
    if (hour === 0) return '12am'
    if (hour === 12) return '12pm'
    return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/**
 * The next five hourly slots after now, walking across midnight into the
 * following day so the strip stays full late in the evening.
 */
function nextHours(forecast: Forecast, count = 5): HourlySlot[] {
    const days = forecast.daily
    const dayIndex = new Map(days.map((d, i) => [d.date, i]))
    const nowOrdinal = new Date().getHours() // today is day 0
    const ordinal = (slot: HourlySlot) => (dayIndex.get(slot.date) ?? 0) * 24 + slot.hour
    return days
        .flatMap((d) => forecast.hourlyByDate[d.date] ?? [])
        .filter((h) => ordinal(h) > nowOrdinal)
        .slice(0, count)
}

/**
 * `hourly` → today's next few hours (for "Today's outlook").
 * `daily`  → the five days from tomorrow (for "Looking ahead").
 */
type WeatherVariant = 'hourly' | 'daily'

export default function WeatherWidget({ variant = 'daily' }: { variant?: WeatherVariant }) {
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null

    const [forecast, setForecast] = useState<Forecast | null>(null)
    const [loading, setLoading] = useState(!!location)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!location) return
        let active = true
        setLoading(true)
        setError(false)
        fetchForecast(location)
            .then((f) => active && setForecast(f))
            .catch(() => active && setError(true))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [location?.latitude, location?.longitude])

    // Prompt to set a location the first time.
    if (!location) {
        return (
            <Card>
                <Link
                    to="/weather"
                    className="flex items-center gap-4 text-left transition-opacity hover:opacity-80"
                >
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-100 text-xl text-sky-500">
                        <i className="fa-solid fa-location-dot" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-neutral-900">Set your location</p>
                        <p className="text-xs text-neutral-400">
                            Add a location to see the five-day forecast
                        </p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                </Link>
            </Card>
        )
    }

    const pending = loading || (!forecast && !error)
    // Ahead tiles run from tomorrow onwards (today lives in its own hourly strip).
    const days = forecast?.daily.slice(1, 6) ?? []
    const hours = forecast ? nextHours(forecast) : []
    const tiles = variant === 'hourly' ? hours : days

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <CardTitle>{variant === 'hourly' ? "Today's weather" : 'Weather outlook'}</CardTitle>
                    <p className="mt-0.5 truncate text-xs text-neutral-400">
                        <i className="fa-solid fa-location-dot mr-1" aria-hidden="true" />
                        {location.name}
                    </p>
                </div>
                <CardAction to="/weather">Full forecast</CardAction>
            </CardHeader>

            {pending ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : error || tiles.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">Couldn&apos;t load the forecast right now.</p>
            ) : variant === 'hourly' ? (
                <div className="grid grid-cols-5 gap-1.5">
                    {hours.map((h) => {
                        const info = weatherInfo(h.code, h.hour >= 6 && h.hour < 20)
                        return (
                            <div
                                key={`${h.date}-${h.hour}`}
                                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1 py-3 ring-1 ring-black/[0.06]"
                                title={info.label}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                    {hourLabel(h.hour)}
                                </span>
                                <i className={`${info.icon} text-lg text-sky-500`} aria-hidden="true" />
                                <span className="text-sm font-bold tabular-nums text-neutral-900">
                                    {h.temperature}&deg;
                                </span>
                                {h.precipitationProbability >= 20 ? (
                                    <span className="text-[10px] font-medium tabular-nums text-sky-500">
                                        {h.precipitationProbability}%
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-neutral-300">&ndash;</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            ) : (
                <div className="grid grid-cols-5 gap-1.5">
                    {days.map((day) => {
                        const info = weatherInfo(
                            dayCondition(day, forecast!.hourlyByDate[day.date] ?? [])
                        )
                        return (
                            <div
                                key={day.date}
                                className="flex flex-col items-center gap-1.5 rounded-2xl bg-white px-1 py-3 ring-1 ring-black/[0.06]"
                                title={info.label}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                    {dayLabel(day.date)}
                                </span>
                                <i className={`${info.icon} text-lg text-sky-500`} aria-hidden="true" />
                                <span className="text-sm font-bold tabular-nums text-neutral-900">
                                    {day.tempMax}&deg;
                                </span>
                                <span className="text-[10px] tabular-nums text-neutral-400">
                                    {day.tempMin}&deg;
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </Card>
    )
}
