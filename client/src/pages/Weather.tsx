import { useEffect, useState } from 'react'
import Container from '../components/Container'
import { Card, CardBody } from '../components/Card'
import Input from '../components/Input'
import Button from '../components/Button'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import { useAuth } from '../context/AuthContext'
import { updateSettings } from '../services/users'
import { todayKey } from '../lib/calendar'
import {
    fetchForecast,
    searchLocations,
    reverseGeocode,
    weatherInfo,
    whatToWear,
    dayLabel,
    type Forecast,
    type GeocodeResult,
} from '../lib/weather'
import type { WeatherLocation } from '../types'

/** "2026-06-25T04:35" → "04:35". */
function formatTime(iso?: string): string {
    return iso && iso.includes('T') ? iso.split('T')[1].slice(0, 5) : '—'
}

function placeLabel(r: GeocodeResult): string {
    return [r.admin1, r.country].filter(Boolean).join(', ')
}

function LocationPicker({
    current,
    onSelect,
    saving,
}: {
    current: WeatherLocation | null
    onSelect: (loc: WeatherLocation) => void
    saving: boolean
}) {
    const [editing, setEditing] = useState(!current)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<GeocodeResult[]>([])
    const [searching, setSearching] = useState(false)
    const [locating, setLocating] = useState(false)
    const [geoError, setGeoError] = useState<string | null>(null)

    function useMyLocation() {
        if (!navigator.geolocation) {
            setGeoError('Your browser doesn’t support location access.')
            return
        }
        setGeoError(null)
        setLocating(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords
                const name = (await reverseGeocode(latitude, longitude)) ?? 'My location'
                onSelect({ name, latitude, longitude })
                setLocating(false)
                setEditing(false)
                setQuery('')
            },
            (err) => {
                setLocating(false)
                setGeoError(
                    err.code === err.PERMISSION_DENIED
                        ? 'Location permission was denied — search by name instead.'
                        : 'Couldn’t get your location — search by name instead.'
                )
            },
            { enableHighAccuracy: true, timeout: 10_000 }
        )
    }

    // Debounced geocoding search.
    useEffect(() => {
        const q = query.trim()
        if (q.length < 2) {
            setResults([])
            return
        }
        setSearching(true)
        const handle = setTimeout(() => {
            searchLocations(q)
                .then(setResults)
                .finally(() => setSearching(false))
        }, 350)
        return () => clearTimeout(handle)
    }, [query])

    if (!editing) {
        return (
            <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                    <i className="fa-solid fa-location-dot text-neutral-400" aria-hidden="true" />
                    {current?.name}
                </p>
                <Button variant="secondary" size="sm" icon="fa-solid fa-pen" onClick={() => setEditing(true)}>
                    Change
                </Button>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
                <div className="flex-1">
                    <Input
                        label="Search location"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g. Glasgow"
                        icon="fa-solid fa-magnifying-glass"
                        autoFocus
                    />
                </div>
                {current && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setEditing(false)
                            setQuery('')
                            setGeoError(null)
                        }}
                    >
                        Cancel
                    </Button>
                )}
            </div>

            {/* Geolocation — exact coordinates, no name ambiguity. */}
            <div>
                <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating || saving}
                    className="inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-semibold text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                >
                    <i
                        className={
                            locating
                                ? 'fa-solid fa-spinner fa-spin'
                                : 'fa-solid fa-location-crosshairs text-sky-500'
                        }
                        aria-hidden="true"
                    />
                    {locating ? 'Locating…' : 'Use my current location'}
                </button>
                {geoError && <p className="mt-2 text-xs text-red-500">{geoError}</p>}
            </div>

            {searching ? (
                <div className="grid place-items-center py-4">
                    <Spinner />
                </div>
            ) : results.length > 0 ? (
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-100">
                    {results.map((r) => (
                        <li key={`${r.latitude},${r.longitude}`}>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                    onSelect({ name: r.name, latitude: r.latitude, longitude: r.longitude })
                                    setEditing(false)
                                    setQuery('')
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-location-dot text-neutral-300" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-neutral-900">
                                        {r.name}
                                    </span>
                                    {placeLabel(r) && (
                                        <span className="block truncate text-xs text-neutral-400">
                                            {placeLabel(r)}
                                        </span>
                                    )}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : query.trim().length >= 2 ? (
                <p className="px-1 py-2 text-sm text-neutral-400">No matches found.</p>
            ) : null}
        </div>
    )
}

export default function Weather() {
    const { user, updateUser } = useAuth()
    const location = user?.settings?.weatherLocation ?? null
    const today = todayKey()

    const [forecast, setForecast] = useState<Forecast | null>(null)
    const [loading, setLoading] = useState(!!location)
    const [error, setError] = useState(false)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (!location) {
            setLoading(false)
            return
        }
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

    async function handleSelect(loc: WeatherLocation) {
        setSaving(true)
        try {
            const updated = await updateSettings({ ...(user?.settings ?? {}), weatherLocation: loc })
            updateUser(updated)
        } finally {
            setSaving(false)
        }
    }

    const current = forecast?.current
    const todayDay = forecast?.daily[0]
    // "Location set but nothing loaded yet" counts as loading, so we don't flash
    // the error card in the gap between selecting a location and the fetch.
    const pending = loading || (!!location && !forecast && !error)

    return (
        <Container as="main" className="py-10">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Weather</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    Your forecast and what to wear over the next few days
                </p>
            </header>

            {/* Location picker */}
            <Card className="mb-6">
                <CardBody>
                    <LocationPicker current={location} onSelect={handleSelect} saving={saving} />
                </CardBody>
            </Card>

            {!location ? (
                <Card>
                    <EmptyState
                        icon="fa-solid fa-location-dot"
                        title="No location set"
                        description="Search for a town or city above to see your forecast."
                    />
                </Card>
            ) : pending ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : error || !forecast || !current || !todayDay ? (
                <Card>
                    <EmptyState
                        icon="fa-solid fa-triangle-exclamation"
                        title="Couldn’t load the forecast"
                        description="Something went wrong reaching the weather service. Please try again shortly."
                    />
                </Card>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Current conditions */}
                    <Card>
                        <div className="flex flex-wrap items-center justify-between gap-6">
                            <div className="flex items-center gap-5">
                                <span className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-sky-50 text-5xl text-sky-500">
                                    <i
                                        className={weatherInfo(current.code, current.isDay).icon}
                                        aria-hidden="true"
                                    />
                                </span>
                                <div>
                                    <div className="flex items-start gap-1">
                                        <span className="text-5xl font-bold tracking-tighter text-neutral-900">
                                            {current.temperature}
                                        </span>
                                        <span className="mt-1 text-2xl font-semibold text-neutral-400">°C</span>
                                    </div>
                                    <p className="text-sm font-medium text-neutral-600">
                                        {weatherInfo(current.code, current.isDay).label} · feels like{' '}
                                        {current.apparentTemperature}°
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
                                <Stat icon="fa-solid fa-droplet" label="Humidity" value={`${current.humidity}%`} />
                                <Stat icon="fa-solid fa-wind" label="Wind" value={`${current.windSpeed} mph`} />
                                <Stat icon="fa-solid fa-arrow-up" label="Sunrise" value={formatTime(todayDay.sunrise)} />
                                <Stat icon="fa-solid fa-arrow-down" label="Sunset" value={formatTime(todayDay.sunset)} />
                            </div>
                        </div>

                        {/* What to wear today */}
                        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-neutral-50 px-4 py-3.5">
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-neutral-500">
                                <i className="fa-solid fa-shirt" aria-hidden="true" />
                            </span>
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                    What to wear today
                                </p>
                                <p className="mt-0.5 text-sm text-neutral-700">{whatToWear(todayDay)}</p>
                            </div>
                        </div>
                    </Card>

                    {/* Forecast */}
                    <div>
                        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-neutral-400">
                            Next few days
                        </p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {forecast.daily.map((d) => {
                                const info = weatherInfo(d.code)
                                return (
                                    <Card key={d.date}>
                                        <div className="flex items-center gap-4">
                                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-2xl text-sky-500">
                                                <i className={info.icon} aria-hidden="true" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-neutral-900">
                                                    {dayLabel(d.date, today)}
                                                </p>
                                                <p className="text-xs text-neutral-400">{info.label}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-neutral-900">{d.tempMax}°</p>
                                                <p className="text-xs text-neutral-400">{d.tempMin}°</p>
                                            </div>
                                        </div>

                                        <div className="mt-4 flex items-center gap-4 text-xs text-neutral-500">
                                            <span>
                                                <i className="fa-solid fa-umbrella mr-1 text-neutral-300" aria-hidden="true" />
                                                {d.precipitationProbability}%
                                            </span>
                                            <span>
                                                <i className="fa-solid fa-wind mr-1 text-neutral-300" aria-hidden="true" />
                                                {d.windMax} mph
                                            </span>
                                            {d.uvIndexMax != null && (
                                                <span>
                                                    <i className="fa-solid fa-sun mr-1 text-neutral-300" aria-hidden="true" />
                                                    UV {Math.round(d.uvIndexMax)}
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-3 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                                            <i className="fa-solid fa-shirt mr-1.5 text-neutral-400" aria-hidden="true" />
                                            {whatToWear(d)}
                                        </p>
                                    </Card>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </Container>
    )
}

function Stat({ icon, label, value }: { icon: string; label: string; value: string }) {
    return (
        <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
                <i className={`${icon} text-[10px]`} aria-hidden="true" />
                {label}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-900">{value}</p>
        </div>
    )
}
