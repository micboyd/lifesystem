import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { useAuth } from '../../context/AuthContext'
import { fetchForecast, weatherInfo, dayCondition, type Forecast } from '../../lib/weather'

/** "Today" for the first day, otherwise a short weekday ("Mon", "Tue"). */
function dayLabel(date: string, isFirst: boolean): string {
    if (isFirst) return 'Today'
    const [y, m, d] = date.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' })
}

export default function WeatherWidget() {
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
    const days = forecast?.daily.slice(0, 5) ?? []

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <CardTitle>Weather</CardTitle>
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
            ) : error || days.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">Couldn&apos;t load the forecast right now.</p>
            ) : (
                <div className="grid grid-cols-5 gap-1.5">
                    {days.map((day, i) => {
                        const info = weatherInfo(
                            dayCondition(day, forecast!.hourlyByDate[day.date] ?? [])
                        )
                        return (
                            <div
                                key={day.date}
                                className="flex flex-col items-center gap-1.5 rounded-2xl bg-neutral-50 px-1 py-3"
                                title={info.label}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                                    {dayLabel(day.date, i === 0)}
                                </span>
                                <i
                                    className={`${info.icon} text-lg text-sky-500`}
                                    aria-hidden="true"
                                />
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
