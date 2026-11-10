import { useEffect, useState } from 'react'
import { FIELD_BASE, FIELD_HINT, FIELD_IDLE } from '../fieldStyles'
import { searchPlaces, type Place } from '../../services/walks'

const DEBOUNCE_MS = 350
const MIN_CHARS = 3

/**
 * Find a place by name. Results sit in the flow rather than floating, so the
 * scrolling panel never clips them.
 */
export default function PlaceSearch({
    near,
    placeholder,
    onPick,
}: {
    /** Results nearest this come first. */
    near: { lat: number; lng: number } | null
    placeholder: string
    onPick: (place: Place) => void
}) {
    const [query, setQuery] = useState('')
    const [found, setFound] = useState<{ query: string; places: Place[]; failed: boolean } | null>(null)
    const text = query.trim()
    const lat = near?.lat
    const lng = near?.lng

    useEffect(() => {
        if (text.length < MIN_CHARS) return
        const ctrl = new AbortController()
        const t = window.setTimeout(() => {
            const at = lat !== undefined && lng !== undefined ? { lat, lng } : null
            searchPlaces(text, at, ctrl.signal)
                .then((places) => setFound({ query: text, places, failed: false }))
                .catch(() => {
                    if (!ctrl.signal.aborted) setFound({ query: text, places: [], failed: true })
                })
        }, DEBOUNCE_MS)
        return () => {
            window.clearTimeout(t)
            ctrl.abort()
        }
    }, [text, lat, lng])

    const result = found?.query === text ? found : null
    const searching = text.length >= MIN_CHARS && !result

    return (
        <div className="flex flex-col gap-2">
            <div className="relative">
                <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500" aria-hidden="true" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    className={`${FIELD_BASE} ${FIELD_IDLE} h-11 pl-9 pr-3`}
                />
            </div>
            {searching && <p className={FIELD_HINT}>Searching…</p>}
            {result?.failed && <p className={FIELD_HINT}>Place search isn’t available right now. Tap the map instead.</p>}
            {result && !result.failed && result.places.length === 0 && <p className={FIELD_HINT}>Nothing found for “{text}”.</p>}
            {result && result.places.length > 0 && (
                <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200">
                    {result.places.map((p) => (
                        <li key={`${p.lat},${p.lng},${p.label}`}>
                            <button
                                type="button"
                                className="flex min-h-11 w-full items-center px-3.5 py-2.5 text-left text-sm text-neutral-800 hover:bg-neutral-50"
                                onClick={() => {
                                    onPick(p)
                                    setQuery('')
                                }}
                            >
                                {p.label}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
