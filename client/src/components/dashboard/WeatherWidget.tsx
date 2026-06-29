import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { useAuth } from '../../context/AuthContext'
import { fetchForecast, weatherInfo, whatToWear, planningInsight, weatherWarnings, type Forecast } from '../../lib/weather'

const SEVERITY_STYLES = {
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
}

const SEVERITY_ICON_STYLES = {
    red: 'text-red-500',
    amber: 'text-amber-500',
    yellow: 'text-yellow-500',
}

export default function WeatherWidget() {
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null

    const [forecast, setForecast] = useState<Forecast | null>(null)
    const [loading, setLoading] = useState(!!location)
    const [error, setError] = useState(false)
    const [detailsOpen, setDetailsOpen] = useState(false)

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
                            Add a location to see today's weather and what to wear
                        </p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
                </Link>
            </Card>
        )
    }

    const todayDay = forecast?.daily[0]
    const pending = loading || (!forecast && !error)
    const warnings = forecast && todayDay ? weatherWarnings(forecast.hourly, todayDay) : []

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Weather</CardTitle>
                <Link
                    to="/weather"
                    className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-400 transition-colors hover:text-neutral-900"
                >
                    Full forecast
                    <i className="fa-solid fa-arrow-right text-xs" aria-hidden="true" />
                </Link>
            </CardHeader>

            {pending ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : error || !forecast || !todayDay ? (
                <p className="py-4 text-sm text-neutral-400">Couldn't load the forecast right now.</p>
            ) : (
                <>
                    {/* Warning banners */}
                    {warnings.length > 0 && (
                        <div className="flex flex-col gap-1.5 mb-4">
                            {warnings.map((w) => (
                                <div
                                    key={w.id}
                                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${SEVERITY_STYLES[w.severity]}`}
                                >
                                    <i className={`${w.icon} mt-0.5 text-sm shrink-0 ${SEVERITY_ICON_STYLES[w.severity]}`} aria-hidden="true" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold leading-tight">{w.title}</p>
                                        <p className="mt-0.5 text-[11px] opacity-80">{w.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

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
                                    {forecast.current.temperature}&deg;
                                </span>
                                <span className="truncate text-sm font-medium text-neutral-500">
                                    {weatherInfo(forecast.current.code, forecast.current.isDay).label}
                                </span>
                            </div>
                            <p className="truncate text-xs text-neutral-400">
                                <i className="fa-solid fa-location-dot mr-1" aria-hidden="true" />
                                {location.name}
                                <span className="mx-1.5 text-neutral-200">&middot;</span>
                                Feels {forecast.current.apparentTemperature}&deg;
                            </p>
                        </div>
                    </div>

                    {/* Hourly timeline — 4 key slots */}
                    {forecast.hourly.length > 0 && (() => {
                        const slots = [8, 12, 16, 20].map((h) => forecast.hourly[h]).filter(Boolean)
                        const labels: Record<number, string> = { 8: 'Morning', 12: 'Midday', 16: 'Afternoon', 20: 'Evening' }
                        return (
                            <div className="mt-4 grid grid-cols-4 gap-1.5">
                                {slots.map((slot) => {
                                    const info = weatherInfo(slot.code, slot.hour >= 6 && slot.hour < 20)
                                    const rainy = slot.precipitationProbability >= 50
                                    return (
                                        <div key={slot.hour} className="flex flex-col items-center gap-1.5 rounded-xl border border-neutral-100 px-1 py-3">
                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                                {labels[slot.hour]}
                                            </span>
                                            <i className={`${info.icon} text-base text-sky-500`} aria-hidden="true" />
                                            <span className="text-xs font-semibold text-neutral-700">{slot.temperature}&deg;</span>
                                            {rainy ? (
                                                <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">
                                                    {slot.precipitationProbability}%
                                                </span>
                                            ) : (
                                                <span className="text-[9px] text-neutral-300">
                                                    {slot.precipitationProbability}%
                                                </span>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })()}

                    {/* Planning insight */}
                    {forecast.hourly.length > 0 && (
                        <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                            <i className="fa-solid fa-lightbulb mr-1.5 text-neutral-400" aria-hidden="true" />
                            {planningInsight(forecast.hourly)}
                        </p>
                    )}

                    {/* What to wear today */}
                    <p className="mt-2 rounded-xl bg-neutral-50 px-3 py-2.5 text-xs text-neutral-600">
                        <i className="fa-solid fa-shirt mr-1.5 text-neutral-400" aria-hidden="true" />
                        {whatToWear(todayDay)}
                    </p>

                    {/* Tomorrow */}
                    {forecast.daily[1] && (() => {
                        const tomorrow = forecast.daily[1]
                        const info = weatherInfo(tomorrow.code)
                        return (
                            <div className="mt-3 flex items-center gap-3 rounded-xl border border-neutral-100 px-3 py-2.5">
                                <i className={`${info.icon} text-base text-sky-500 w-5 text-center`} aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-neutral-700">Tomorrow &mdash; {info.label}</p>
                                    <p className="text-xs text-neutral-400">
                                        {tomorrow.tempMax}&deg; / {tomorrow.tempMin}&deg;
                                        {tomorrow.precipitationProbability > 0 && (
                                            <span className="ml-2">{tomorrow.precipitationProbability}% rain</span>
                                        )}
                                    </p>
                                </div>
                            </div>
                        )
                    })()}

                    {/* Details accordion */}
                    <div className="mt-3 rounded-xl border border-neutral-100 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setDetailsOpen((o) => !o)}
                            className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-neutral-50"
                        >
                            <span className="text-xs font-semibold text-neutral-500">Details</span>
                            <i
                                className={`fa-solid fa-chevron-down text-[10px] text-neutral-400 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                            />
                        </button>

                        {detailsOpen && (() => {
                            const waking = forecast.hourly.filter((h) => h.hour >= 6 && h.hour <= 22)
                            const maxGust = Math.max(...waking.map((h) => h.windGust))
                            const totalRain = waking.reduce((s, h) => s + h.precipitation, 0)
                            const minVis = Math.min(...waking.map((h) => h.visibility))
                            const uv = todayDay.uvIndexMax ?? 0
                            const sunrise = todayDay.sunrise
                                ? new Date(todayDay.sunrise).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                : null
                            const sunset = todayDay.sunset
                                ? new Date(todayDay.sunset).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                                : null

                            return (
                                <div className="border-t border-neutral-100 px-3 py-3 flex flex-col gap-2">
                                    {/* Wind */}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-neutral-500">
                                            <i className="fa-solid fa-wind w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                            Wind
                                        </span>
                                        <span className="font-semibold text-neutral-700">
                                            {forecast.current.windSpeed}mph
                                            {maxGust > forecast.current.windSpeed + 5 && (
                                                <span className="ml-1 font-normal text-neutral-400">gusts {maxGust}mph</span>
                                            )}
                                        </span>
                                    </div>

                                    {/* Humidity */}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-neutral-500">
                                            <i className="fa-solid fa-droplet w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                            Humidity
                                        </span>
                                        <span className="font-semibold text-neutral-700">{forecast.current.humidity}%</span>
                                    </div>

                                    {/* Rain */}
                                    {totalRain > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 text-neutral-500">
                                                <i className="fa-solid fa-cloud-rain w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                                Rainfall today
                                            </span>
                                            <span className="font-semibold text-neutral-700">{Math.round(totalRain * 10) / 10}mm</span>
                                        </div>
                                    )}

                                    {/* Visibility */}
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="flex items-center gap-1.5 text-neutral-500">
                                            <i className="fa-solid fa-eye w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                            Visibility
                                        </span>
                                        <span className="font-semibold text-neutral-700">
                                            {minVis >= 10 ? '10km+' : minVis < 1 ? `${Math.round(minVis * 1000)}m` : `${minVis}km`}
                                        </span>
                                    </div>

                                    {/* UV */}
                                    {uv > 0 && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 text-neutral-500">
                                                <i className="fa-solid fa-sun w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                                UV index
                                            </span>
                                            <span className={`font-semibold ${uv >= 8 ? 'text-red-600' : uv >= 6 ? 'text-amber-600' : uv >= 3 ? 'text-yellow-600' : 'text-neutral-700'}`}>
                                                {uv} &mdash; {uv >= 8 ? 'Very high' : uv >= 6 ? 'High' : uv >= 3 ? 'Moderate' : 'Low'}
                                            </span>
                                        </div>
                                    )}

                                    {/* Sunrise / Sunset */}
                                    {(sunrise || sunset) && (
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 text-neutral-500">
                                                <i className="fa-solid fa-circle-half-stroke w-3.5 text-center text-neutral-400" aria-hidden="true" />
                                                Daylight
                                            </span>
                                            <span className="font-semibold text-neutral-700">
                                                {sunrise} &ndash; {sunset}
                                            </span>
                                        </div>
                                    )}

                                    {/* Day after tomorrow */}
                                    {forecast.daily[2] && (() => {
                                        const dat = forecast.daily[2]
                                        const info = weatherInfo(dat.code)
                                        const label = new Date(`${dat.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })
                                        return (
                                            <div className="mt-1 flex items-center gap-2.5 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs">
                                                <i className={`${info.icon} text-sky-500 w-4 text-center`} aria-hidden="true" />
                                                <span className="text-neutral-500">{label}</span>
                                                <span className="ml-auto font-semibold text-neutral-700">
                                                    {dat.tempMax}&deg; / {dat.tempMin}&deg;
                                                </span>
                                                {dat.precipitationProbability > 0 && (
                                                    <span className="text-neutral-400">{dat.precipitationProbability}% rain</span>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )
                        })()}
                    </div>
                </>
            )}
        </Card>
    )
}
