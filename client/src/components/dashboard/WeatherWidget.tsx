import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { useAuth } from '../../context/AuthContext'
import { todayKey } from '../../lib/calendar'
import { fetchForecast, weatherInfo, whatToWear, dayLabel, type Forecast } from '../../lib/weather'

export default function WeatherWidget() {
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null
    const today = todayKey()

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
                            Add a location to see today’s weather and what to wear
                        </p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                </Link>
            </Card>
        )
    }

    const todayDay = forecast?.daily[0]
    // Treat "location set but nothing loaded yet" as loading, so we never flash
    // the error state in the render between setting a location and the fetch.
    const pending = loading || (!forecast && !error)

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Weather</CardTitle>
                <Link
                    to="/weather"
                    className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Details
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {pending ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : error || !forecast || !todayDay ? (
                <p className="py-4 text-sm text-neutral-400">Couldn’t load the forecast right now.</p>
            ) : (
                <>
                    {/* Current conditions */}
                    <div className="flex items-center gap-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-50 text-3xl text-sky-500">
                            <i
                                className={weatherInfo(forecast.current.code, forecast.current.isDay).icon}
                                aria-hidden="true"
                            />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-bold tracking-tight text-neutral-900">
                                    {forecast.current.temperature}°
                                </span>
                                <span className="truncate text-sm font-medium text-neutral-500">
                                    {weatherInfo(forecast.current.code, forecast.current.isDay).label}
                                </span>
                            </div>
                            <p className="truncate text-xs text-neutral-400">
                                <i className="fa-solid fa-location-dot mr-1" aria-hidden="true" />
                                {location.name}
                                <span className="mx-1.5 text-neutral-200">·</span>
                                Feels {forecast.current.apparentTemperature}°
                            </p>
                        </div>
                    </div>

                    {/* What to wear today */}
                    <p className="mt-4 rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                        <i className="fa-solid fa-shirt mr-1.5 text-neutral-400" aria-hidden="true" />
                        {whatToWear(todayDay)}
                    </p>

                    {/* Next three days */}
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {forecast.daily.slice(1, 4).map((d) => (
                            <div
                                key={d.date}
                                className="flex flex-col items-center gap-1 rounded-xl border border-neutral-100 py-2.5"
                            >
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                    {dayLabel(d.date, today)}
                                </span>
                                <i
                                    className={`${weatherInfo(d.code).icon} text-base text-sky-500`}
                                    aria-hidden="true"
                                />
                                <span className="text-xs font-medium text-neutral-700">
                                    {d.tempMax}°
                                    <span className="text-neutral-400"> / {d.tempMin}°</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    )
}
