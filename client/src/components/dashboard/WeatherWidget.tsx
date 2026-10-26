import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DashSection, { DASH, SectionLoading } from './DashSection'
import { useAuth } from '../../context/AuthContext'
import {
    fetchForecast,
    weatherInfo,
    type Forecast,
    type HourlySlot,
} from '../../lib/weather'

/** Sun reads amber, the moon violet, wet or cloudy weather sky blue. */
function iconTint(icon: string): string {
    if (icon.includes('fa-sun') && !icon.includes('rain')) return 'text-amber-500'
    if (icon.includes('fa-moon') && !icon.includes('rain')) return 'text-violet-500'
    return 'text-sky-500'
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

/** Today's next few hours; the full outlook lives on the Weather page. */
export default function WeatherWidget() {
    const { user } = useAuth()
    const location = user?.settings?.weatherLocation ?? null

    // Keyed by place, so loading is derived rather than set inside the effect.
    const placeKey = location ? `${location.latitude},${location.longitude}` : null
    const [result, setResult] = useState<{ key: string; forecast: Forecast | null } | null>(null)
    const loading = placeKey !== null && result?.key !== placeKey
    const forecast = result?.key === placeKey ? result.forecast : null
    const error = !loading && forecast === null

    useEffect(() => {
        if (!location || !placeKey) return
        let active = true
        fetchForecast(location)
            .then((f) => active && setResult({ key: placeKey, forecast: f }))
            .catch(() => active && setResult({ key: placeKey, forecast: null }))
        return () => {
            active = false
        }
        // `location` is read through `placeKey`, which changes exactly when it does.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeKey])

    // Prompt to set a location the first time.
    if (!location) {
        return (
            <DashSection title="Weather" icon="fa-solid fa-cloud-sun" tone="sky">
                <Link
                    to="/weather"
                    className={`group flex items-center gap-3 text-left ${DASH.list} py-3.5`}
                >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-info-bg text-sm text-info">
                        <i className="fa-solid fa-location-dot" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-medium text-neutral-900">Set your location</p>
                        <p className={DASH.note}>Add a location to see today&apos;s forecast</p>
                    </div>
                    <i className="fa-solid fa-chevron-right text-xs text-neutral-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
            </DashSection>
        )
    }

    const pending = loading || (!forecast && !error)
    const hours = forecast ? nextHours(forecast) : []

    const now = hours[0]

    return (
        <DashSection title="Weather" icon="fa-solid fa-cloud-sun" tone="sky" meta={location.name} to="/weather" action="Forecast">
            {pending ? (
                <SectionLoading rows={2} />
            ) : error || hours.length === 0 ? (
                <p className={DASH.empty}>Couldn&apos;t load the forecast right now.</p>
            ) : (
                <div className={DASH.stack}>
                    <div className="flex items-center gap-4">
                        <i
                            className={`${weatherInfo(now.code, now.hour >= 6 && now.hour < 20).icon} text-4xl ${iconTint(weatherInfo(now.code, now.hour >= 6 && now.hour < 20).icon)}`}
                            aria-hidden="true"
                        />
                        <span className={DASH.figure}>
                            {now.temperature}&deg;
                        </span>
                        <span className="text-[15px] leading-snug text-neutral-600">
                            {weatherInfo(now.code, now.hour >= 6 && now.hour < 20).label}
                            <span className={`block ${DASH.note}`}>at {hourLabel(now.hour)}</span>
                        </span>
                    </div>
                    <div className="grid grid-cols-5 border-y border-neutral-200 py-4">
                        {hours.map((h) => {
                            const info = weatherInfo(h.code, h.hour >= 6 && h.hour < 20)
                            return (
                                <div
                                    key={`${h.date}-${h.hour}`}
                                    className="flex flex-col items-center gap-2"
                                    title={info.label}
                                >
                                    <span className={DASH.note}>{hourLabel(h.hour)}</span>
                                    <i className={`${info.icon} text-lg ${iconTint(info.icon)}`} aria-hidden="true" />
                                    <span className="text-[15px] nums text-neutral-900">{h.temperature}&deg;</span>
                                    <span className="text-[11px] nums text-info">
                                        {h.precipitationProbability >= 20 ? `${h.precipitationProbability}%` : '\u00a0'}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </DashSection>
    )
}
