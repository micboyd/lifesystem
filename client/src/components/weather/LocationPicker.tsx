import { useEffect, useState } from 'react'
import Input from '../Input'
import Spinner from '../Spinner'
import { reverseGeocode, searchLocations, type GeocodeResult } from '../../lib/weather'
import type { WeatherLocation } from '../../types'

function placeLabel(r: GeocodeResult): string {
    return [r.admin1, r.country].filter(Boolean).join(', ')
}

/** Search by name or use the device's position. Calls `onSelect` with the chosen place. */
export default function LocationPicker({
    onSelect,
    saving,
}: {
    onSelect: (loc: WeatherLocation) => void
    saving: boolean
}) {
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
                setLocating(false)
                setQuery('')
                onSelect({ name, latitude, longitude })
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

    return (
        <div className="flex flex-col gap-4">
            <Input
                label="Search location"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Glasgow"
                icon="fa-solid fa-magnifying-glass"
            />

            <div>
                <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating || saving}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-neutral-200 px-3.5 text-[13px] font-medium text-neutral-700 transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                >
                    <i
                        className={locating ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-location-crosshairs text-sky-500'}
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
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl ring-1 ring-neutral-900/[0.06]">
                    {results.map((r) => (
                        <li key={`${r.latitude},${r.longitude}`}>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => {
                                    setQuery('')
                                    onSelect({ name: r.name, latitude: r.latitude, longitude: r.longitude })
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-location-dot text-neutral-300" aria-hidden="true" />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-semibold text-neutral-900">{r.name}</span>
                                    {placeLabel(r) && (
                                        <span className="block truncate text-xs text-neutral-500">{placeLabel(r)}</span>
                                    )}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : query.trim().length >= 2 ? (
                <p className="px-1 py-2 text-sm text-neutral-500">No matches found.</p>
            ) : null}
        </div>
    )
}
