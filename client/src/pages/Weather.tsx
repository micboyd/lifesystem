import { useEffect, useState, type ReactNode } from 'react'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Drawer from '../components/Drawer'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import LocationPicker from '../components/weather/LocationPicker'
import HourStrip from '../components/weather/HourStrip'
import WeekList from '../components/weather/WeekList'
import { DayDrawer, HourDrawer } from '../components/weather/ForecastDrawers'
import { ConditionIcon, Overline, WindArrow, clockTime } from '../components/weather/weatherUi'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../services/users'
import { todayKey } from '../lib/calendar'
import {
    compass,
    fetchForecast,
    hoursFromNow,
    hoursSummary,
    SEVERITY_ICON_STYLES,
    SEVERITY_STYLES,
    uvLabel,
    weatherInfo,
    weatherWarnings,
    wearInputForHours,
    whatToWear,
    type Forecast,
} from '../lib/weather'
import type { WeatherLocation } from '../types'

/** The next sunrise or sunset after now, from today's and tomorrow's times. */
function nextSunEvent(
    forecast: Forecast,
    now = new Date()
): { kind: 'Sunrise' | 'Sunset'; time: string; note: string } | null {
    const stamp = `${forecast.daily[0]?.date}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const [today, tomorrow] = forecast.daily
    if (today?.sunrise && today.sunrise > stamp) {
        return { kind: 'Sunrise', time: clockTime(today.sunrise), note: `Sunset ${clockTime(today.sunset)}` }
    }
    if (today?.sunset && today.sunset > stamp) {
        return { kind: 'Sunset', time: clockTime(today.sunset), note: `Rose at ${clockTime(today.sunrise)}` }
    }
    if (tomorrow?.sunrise) return { kind: 'Sunrise', time: clockTime(tomorrow.sunrise), note: 'Tomorrow' }
    return null
}

/** Drawer state that keeps the last index while the drawer slides shut. */
function useStepper() {
    const [state, setState] = useState({ open: false, index: 0 })
    return {
        ...state,
        show: (index: number) => setState({ open: true, index }),
        go: (index: number) => setState((s) => ({ ...s, index })),
        close: () => setState((s) => ({ ...s, open: false })),
    }
}

export default function Weather() {
    const { user, updateUser } = useAuth()
    const location = user?.settings?.weatherLocation ?? null
    const today = todayKey()

    const [forecast, setForecast] = useState<Forecast | null>(null)
    const [loading, setLoading] = useState(!!location)
    const [error, setError] = useState(false)
    const [saving, setSaving] = useState(false)
    const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [picking, setPicking] = useState(false)
    const hourDrawer = useStepper()
    const dayDrawer = useStepper()

    useEffect(() => {
        if (!location) {
            setLoading(false)
            return
        }
        let active = true
        setLoading(true)
        setError(false)
        fetchForecast(location)
            .then((f) => {
                if (!active) return
                setForecast(f)
                setFetchedAt(new Date())
            })
            .catch(() => active && setError(true))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [location?.latitude, location?.longitude, reloadKey])

    async function handleSelect(loc: WeatherLocation) {
        setSaving(true)
        try {
            const updated = await updateSettings({ ...(user?.settings ?? {}), weatherLocation: loc })
            updateUser(updated)
            setPicking(false)
        } finally {
            setSaving(false)
        }
    }

    // "Location set but nothing loaded yet" counts as loading, so we don't flash
    // the error card in the gap between selecting a location and the fetch.
    const pending = (loading && !forecast) || (!!location && !forecast && !error)

    return (
        <Container as="main" className="py-8 sm:py-10">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
                <div className="min-w-0">
                    <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.025em] text-neutral-950 sm:text-[32px]">
                        Weather
                    </h1>
                    {fetchedAt && (
                        <p className="mt-1 text-sm text-neutral-500">
                            Updated {fetchedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    )}
                </div>
                {location && (
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setReloadKey((k) => k + 1)}
                            disabled={loading}
                            aria-label="Refresh forecast"
                            className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50"
                        >
                            <i className={`fa-solid fa-rotate-right ${loading ? 'fa-spin' : ''}`} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="inline-flex h-10 max-w-[14rem] items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                        >
                            <i className="fa-solid fa-location-dot text-coral-500" aria-hidden="true" />
                            <span className="truncate">{location.name}</span>
                            <i className="fa-solid fa-chevron-down text-[10px] text-neutral-400" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </header>

            {!location ? (
                <Card hover={false} className="mx-auto max-w-lg">
                    <div className="mb-5">
                        <p className="text-lg font-semibold text-neutral-900">Where are you?</p>
                        <p className="mt-1 text-sm text-neutral-500">Pick a town or city to see its forecast.</p>
                    </div>
                    <LocationPicker onSelect={handleSelect} saving={saving} />
                </Card>
            ) : pending ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : error || !forecast || forecast.daily.length === 0 ? (
                <Card hover={false}>
                    <EmptyState
                        icon="fa-solid fa-triangle-exclamation"
                        title="Couldn’t load the forecast"
                        description="Something went wrong reaching the weather service. Please try again shortly."
                    />
                </Card>
            ) : (
                <ForecastView
                    forecast={forecast}
                    today={today}
                    onHour={hourDrawer.show}
                    onDay={dayDrawer.show}
                />
            )}

            {forecast && (
                <>
                    <HourDrawer
                        hours={hoursFromNow(forecast, 24)}
                        open={hourDrawer.open}
                        index={hourDrawer.index}
                        today={today}
                        onIndex={hourDrawer.go}
                        onClose={hourDrawer.close}
                    />
                    <DayDrawer
                        forecast={forecast}
                        open={dayDrawer.open}
                        index={dayDrawer.index}
                        today={today}
                        onIndex={dayDrawer.go}
                        onClose={dayDrawer.close}
                    />
                </>
            )}

            <Drawer open={picking} onClose={() => setPicking(false)} title="Location" size="lg">
                {picking && <LocationPicker onSelect={handleSelect} saving={saving} />}
            </Drawer>
        </Container>
    )
}

export function ForecastView({
    forecast,
    today,
    onHour,
    onDay,
}: {
    forecast: Forecast
    today: string
    onHour: (i: number) => void
    onDay: (i: number) => void
}) {
    const current = forecast.current
    const todayDay = forecast.daily[0]
    const next24 = hoursFromNow(forecast, 24)
    const wear = wearInputForHours(next24.slice(0, 12))
    const warnings = weatherWarnings(forecast.hourly, todayDay)
    const sun = nextSunEvent(forecast)
    const info = weatherInfo(current.code, current.isDay)

    return (
        <div className="flex flex-col gap-6 sm:gap-8">
            {/* Right now */}
            <Card hover={false}>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-5">
                        <ConditionIcon code={current.code} isDay={current.isDay} className="text-[56px] sm:text-[64px]" />
                        <div>
                            <p className="text-[56px] font-semibold leading-none tracking-[-0.04em] text-neutral-950 sm:text-[64px]">
                                {current.temperature}°
                            </p>
                            <p className="mt-2 text-sm text-neutral-600">
                                <span className="font-medium text-neutral-900">{info.label}</span> · feels like{' '}
                                {current.apparentTemperature}°
                            </p>
                            <p className="mt-0.5 text-sm text-neutral-500">
                                High {todayDay.tempMax}° · Low {todayDay.tempMin}°
                            </p>
                        </div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 lg:gap-x-10">
                        <Fact label="Wind">
                            <span className="inline-flex items-center gap-1.5">
                                {current.windSpeed} mph
                                <WindArrow degrees={current.windDirection} className="text-[11px] text-neutral-400" />
                            </span>
                            <span className="block text-xs font-normal text-neutral-500">
                                From {compass(current.windDirection)} · gusts {current.windGust}
                            </span>
                        </Fact>
                        <Fact label="Humidity">
                            {current.humidity}%
                            <span className="block text-xs font-normal text-neutral-500">Cloud {current.cloudCover}%</span>
                        </Fact>
                        <Fact label="UV today">
                            {todayDay.uvIndexMax != null ? Math.round(todayDay.uvIndexMax) : '—'}
                            {todayDay.uvIndexMax != null && (
                                <span className="block text-xs font-normal text-neutral-500">{uvLabel(todayDay.uvIndexMax)}</span>
                            )}
                        </Fact>
                        {sun && (
                            <Fact label={sun.kind}>
                                {sun.time}
                                <span className="block text-xs font-normal text-neutral-500">{sun.note}</span>
                            </Fact>
                        )}
                    </dl>
                </div>

                {wear && (
                    <p className="mt-6 flex gap-3 border-t border-neutral-100 pt-5 text-sm text-neutral-700">
                        <i className="fa-solid fa-shirt mt-0.5 text-neutral-400" aria-hidden="true" />
                        <span className="first-letter:uppercase">{whatToWear(wear)}</span>
                    </p>
                )}
            </Card>

            {warnings.length > 0 && (
                <div className="flex flex-col gap-2">
                    {warnings.map((w) => (
                        <div key={w.id} className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${SEVERITY_STYLES[w.severity]}`}>
                            <i className={`${w.icon} mt-0.5 ${SEVERITY_ICON_STYLES[w.severity]}`} aria-hidden="true" />
                            <p className="text-sm">
                                <span className="font-semibold">{w.title}</span> — {w.detail}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Next 24 hours */}
            <section className="flex flex-col gap-3">
                <Overline aside={<span className="text-xs text-neutral-500">Tap an hour for detail</span>}>
                    Next 24 hours
                </Overline>
                <Card hover={false}>
                    <p className="mb-4 text-[15px] leading-relaxed text-neutral-800">{hoursSummary(next24)}</p>
                    <HourStrip hours={next24} days={forecast.daily} onSelect={onHour} />
                </Card>
            </section>

            {/* Week ahead */}
            <section className="flex flex-col gap-3">
                <Overline aside={<span className="text-xs text-neutral-500">Tap a day for detail</span>}>
                    Week ahead
                </Overline>
                <Card hover={false} flush className="overflow-hidden">
                    <WeekList forecast={forecast} today={today} onSelect={onDay} />
                </Card>
            </section>
        </div>
    )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="text-xs font-medium text-neutral-500">{label}</dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-neutral-900">{children}</dd>
        </div>
    )
}
