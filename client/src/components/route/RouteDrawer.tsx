import { useCallback, useEffect, useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import PillToggle from '../PillToggle'
import ConfirmModal from '../ConfirmModal'
import Spinner from '../Spinner'
import { StatStrip } from '../session/SessionUI'
import { FIELD_BASE, FIELD_HINT, FIELD_IDLE, FIELD_LABEL } from '../fieldStyles'
import RouteMap from './RouteMap'
import ElevationChart from './ElevationChart'
import type { FitnessPlanEntry } from '../../types'
import { plannedSeconds, sessionDistance, stepStarts } from '../../lib/routeDistance'
import { cumulative, elevationProfile, formatDiff, formatDuration, formatKm, type LatLng } from '../../lib/routeTrack'
import { googleMapsUrl, MAPS_WARNING } from '../../lib/routeMaps'
import { gpxFileName, routeGpx } from '../../lib/routeGpx'
import { LIT_WARNING, needsLitCheck } from '../../lib/routeSafety'
import {
    chooseRoute,
    deleteRoute,
    generateRoute,
    getRouteSettings,
    listRoutes,
    reportRoute,
    routeFailure,
    setHome,
    unchooseRoute,
    type RouteFailure,
    type RouteSettings,
    type RunRoute,
} from '../../services/routes'

/**
 * "Generate route" for an outdoor conditioning session: a loop (or out-and-back)
 * from home, here, or a dropped pin, sized to the whole session. Every press
 * gives a new route; one can be chosen for this planned entry, opened in Google
 * Maps or downloaded as GPX. Generating again never replaces the chosen route.
 */

type StartMode = 'home' | 'gps' | 'map'
type Kind = 'loop' | 'outback'

const FAILURE_TEXT: Partial<Record<RouteFailure['code'], string>> = {
    quota: "Today's route quota is used up. It resets at midnight (UTC).",
    down: "The routing service isn't responding right now.",
    no_route: 'No walkable route from this start point. Try moving the start onto a street or path.',
    location_denied:
        'Location permission was denied. Allow it in your browser settings, or start from Home or a point on the map.',
}

function when(iso: string): string {
    return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function currentPosition(): Promise<LatLng> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject({ code: 'location_denied', message: 'This browser has no location service.' } satisfies RouteFailure)
            return
        }
        navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (err) =>
                reject(
                    (err.code === err.PERMISSION_DENIED
                        ? { code: 'location_denied', message: FAILURE_TEXT.location_denied! }
                        : { code: 'unknown', message: "Couldn't get your location. Try again outside, or drop a pin." }) satisfies RouteFailure
                ),
            { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }
        )
    })
}

export default function RouteDrawer({
    entry,
    onClose,
    onChanged,
}: {
    entry: FitnessPlanEntry | null
    onClose: () => void
    /** A route was chosen, unchosen or deleted — the caller's summary may be stale. */
    onChanged?: () => void
}) {
    // Keep showing the last entry while the drawer slides shut.
    const [e, setE] = useState(entry)
    if (entry && entry !== e) setE(entry)
    const session = e?.session ?? null

    const planned = useMemo(() => (session ? sessionDistance(session) : null), [session])
    const [settings, setSettings] = useState<RouteSettings | null>(null)
    const [routes, setRoutes] = useState<RunRoute[]>([])
    const [loading, setLoading] = useState(false)
    const [viewId, setViewId] = useState<string | null>(null)

    const [override, setOverride] = useState('')
    const [editingTarget, setEditingTarget] = useState(false)
    const [mode, setMode] = useState<StartMode>('home')
    const [pin, setPin] = useState<LatLng | null>(null)
    const [gps, setGps] = useState<LatLng | null>(null)
    const [picking, setPicking] = useState(false)
    const [kind, setKind] = useState<Kind>('loop')

    const [busy, setBusy] = useState(false)
    const [failure, setFailure] = useState<RouteFailure | null>(null)
    const [cooldownUntil, setCooldownUntil] = useState(0)
    const [now, setNow] = useState(0)
    const [hoverM, setHoverM] = useState<number | null>(null)
    const [confirmMaps, setConfirmMaps] = useState(false)
    const [confirmReport, setConfirmReport] = useState(false)
    const [notice, setNotice] = useState('')

    const sessionId = session?._id

    const refresh = useCallback(async () => {
        if (!sessionId) return
        const list = await listRoutes(sessionId)
        setRoutes(list)
        return list
    }, [sessionId])

    // Fresh form each time the drawer opens on an item.
    const [openFor, setOpenFor] = useState<string | null>(null)
    const openId = entry?._id ?? null
    if (openId !== openFor) {
        setOpenFor(openId)
        if (openId) {
            setLoading(true)
            setFailure(null)
            setNotice('')
            setEditingTarget(false)
            setOverride('')
            setPicking(false)
            setHoverM(null)
        }
    }

    // Load on open.
    useEffect(() => {
        if (!entry || !sessionId) return
        let live = true
        Promise.all([getRouteSettings(), listRoutes(sessionId)])
            .then(([s, list]) => {
                if (!live) return
                setSettings(s)
                setRoutes(list)
                setMode(s.home ? 'home' : 'gps')
                const chosen = list.find((r) => r.chosenFor.includes(entry._id))
                setViewId(chosen?._id ?? list[0]?._id ?? null)
            })
            .catch((err) => live && setFailure(routeFailure(err)))
            .finally(() => live && setLoading(false))
        return () => {
            live = false
        }
    }, [entry, sessionId])

    // Tick the cooldown down.
    useEffect(() => {
        if (cooldownUntil <= now) return
        const t = window.setInterval(() => setNow(Date.now()), 250)
        return () => window.clearInterval(t)
    }, [cooldownUntil, now])
    const waitSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000))

    const overrideM = Math.round(Number(override.replace(',', '.')) * 1000)
    const targetM = override.trim() && overrideM > 0 ? overrideM : (planned?.totalM ?? null)

    const view = routes.find((r) => r._id === viewId) ?? null
    const chosenId = e ? routes.find((r) => r.chosenFor.includes(e._id))?._id : undefined

    const start: LatLng | null = mode === 'home' ? settings?.home ?? null : mode === 'gps' ? gps : pin
    const showingRoute = view && !picking

    // Everything drawn from the route, memoised so a hover doesn't redraw the map.
    const drawn = useMemo(() => {
        if (!view) return null
        const cum = cumulative(view.coords)
        const totalPlanned = planned?.steps.reduce((t, s) => t + s.distanceM, 0) ?? 0
        // Planned steps stretched to the route as it came out.
        const scale = totalPlanned > 0 ? view.distanceM / totalPlanned : 1
        const steps = planned?.steps.length
            ? stepStarts(planned.steps).map((s) => ({ ...s, atM: s.atM * scale }))
            : []
        const seconds = planned?.steps.length ? plannedSeconds(planned.steps) * scale : null
        return { profile: elevationProfile(view.coords, cum), steps, seconds }
    }, [view, planned])

    async function generate() {
        if (!session || !targetM) return
        setFailure(null)
        setNotice('')
        let from: 'home' | LatLng
        if (mode === 'home') {
            if (!settings?.home) {
                setFailure({ code: 'no_start', message: 'No home saved yet. Use My location or drop a pin, then save it as home.' })
                return
            }
            from = 'home'
        } else if (mode === 'gps') {
            setBusy(true)
            try {
                const here = await currentPosition()
                setGps(here)
                from = here
            } catch (err) {
                setFailure(err as RouteFailure)
                setBusy(false)
                return
            }
        } else {
            if (!pin) {
                setFailure({ code: 'no_start', message: 'Tap the map to drop your start point first.' })
                return
            }
            from = pin
        }
        setBusy(true)
        setCooldownUntil(Date.now() + (settings?.cooldownMs ?? 8000))
        setNow(Date.now())
        try {
            const out = await generateRoute({ session: session._id, targetM, kind, start: from })
            setRoutes((rs) => [out.route, ...rs])
            setViewId(out.route._id)
            setPicking(false)
            setHoverM(null)
            setSettings((s) => (s ? { ...s, usage: out.usage } : s))
            // History may have been trimmed server-side.
            void refresh()
        } catch (err) {
            const f = routeFailure(err)
            if (f.code === 'cooldown' && f.retryInMs) setCooldownUntil(Date.now() + f.retryInMs)
            setFailure(f)
        } finally {
            setBusy(false)
        }
    }

    async function choose(r: RunRoute) {
        if (!e) return
        const updated = r.chosenFor.includes(e._id) ? await unchooseRoute(r._id, e._id) : await chooseRoute(r._id, e._id)
        setRoutes((rs) =>
            rs.map((x) =>
                x._id === updated._id ? updated : { ...x, chosenFor: x.chosenFor.filter((id) => id !== e._id) }
            )
        )
        onChanged?.()
    }

    async function remove(r: RunRoute) {
        await deleteRoute(r._id)
        const rest = routes.filter((x) => x._id !== r._id)
        setRoutes(rest)
        if (viewId === r._id) setViewId(rest[0]?._id ?? null)
        onChanged?.()
    }

    async function report(r: RunRoute) {
        const updated = await reportRoute(r._id)
        setRoutes((rs) => rs.map((x) => (x._id === updated._id ? updated : x)))
        setNotice("Reported. Routes like this won't be offered from here again.")
        onChanged?.()
    }

    async function saveHome() {
        const p = mode === 'gps' ? gps : pin
        if (!p) return
        await setHome(p)
        setSettings((s) => (s ? { ...s, home: p } : s))
        setMode('home')
        setNotice('Saved as home.')
    }

    function downloadGpx(r: RunRoute) {
        const name = session?.name ?? 'Route'
        const blob = new Blob([routeGpx(r.coords, name, r.createdAt)], { type: 'application/gpx+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = gpxFileName(name)
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function openMaps(r: RunRoute) {
        // An https link: Android and iOS hand it to the Google Maps app when it's
        // installed, and it opens Google Maps in the browser when it isn't.
        const url = googleMapsUrl(r.coords, r.kind)
        const win = window.open(url, '_blank', 'noopener')
        if (!win) window.location.href = url
    }

    const litCheck = e ? needsLitCheck(e.part, e.date) : false
    const failureText = failure ? (FAILURE_TEXT[failure.code] ?? failure.message) : ''
    const retryable = failure && ['quota', 'down', 'no_route', 'no_new', 'location_denied', 'unknown', 'cooldown'].includes(failure.code)
    const canGenerate = !!targetM && !busy && waitSec === 0

    return (
        <>
            <Drawer open={!!entry} onClose={onClose} size="2xl" title={session ? `Route · ${session.name}` : 'Route'}>
                {loading || !session ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {/* ── Distance ── */}
                        <section className="flex flex-col gap-2">
                            {planned?.totalM && !editingTarget ? (
                                <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                            Route distance
                                        </p>
                                        <p className="text-lg font-semibold tabular-nums text-neutral-900">
                                            {formatKm(targetM ?? planned.totalM)}
                                        </p>
                                        <p className={FIELD_HINT}>
                                            {override.trim()
                                                ? 'Your distance'
                                                : `The whole session — warm-up, ${planned.steps.some((s) => s.kind === 'run') ? 'runs, walks' : 'main'} and cool-down`}
                                        </p>
                                    </div>
                                    <Button variant="secondary" onClick={() => setEditingTarget(true)}>
                                        Change
                                    </Button>
                                </div>
                            ) : (
                                <label className="flex flex-col gap-1.5">
                                    <span className={FIELD_LABEL}>Route distance (km)</span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        min={0.4}
                                        max={42.2}
                                        step={0.1}
                                        value={override}
                                        onChange={(ev) => setOverride(ev.target.value)}
                                        placeholder={planned?.totalM ? (planned.totalM / 1000).toFixed(2) : 'e.g. 4'}
                                        className={`${FIELD_BASE} ${FIELD_IDLE} h-12 px-3.5`}
                                    />
                                    <span className={FIELD_HINT}>
                                        {planned?.totalM
                                            ? `The plan works out at ${formatKm(planned.totalM)}. Leave empty to use that.`
                                            : "This session doesn't set a distance it can be routed on, so enter one."}
                                    </span>
                                    {planned?.totalM && (
                                        <button
                                            type="button"
                                            className="self-start text-sm font-medium text-neutral-600 underline-offset-2 hover:underline"
                                            onClick={() => setEditingTarget(false)}
                                        >
                                            Done
                                        </button>
                                    )}
                                </label>
                            )}
                        </section>

                        {/* ── Start + type ── */}
                        <section className="flex flex-col gap-3">
                            <div className="flex flex-col gap-1.5">
                                <span className={FIELD_LABEL}>Start from</span>
                                <PillToggle
                                    label="Start point"
                                    value={mode}
                                    onChange={(m) => {
                                        setMode(m)
                                        setFailure(null)
                                        setPicking(m === 'map')
                                    }}
                                    options={[
                                        { value: 'home', label: settings?.home ? 'Home' : 'Home (not set)' },
                                        { value: 'gps', label: 'My location' },
                                        { value: 'map', label: 'Drop a pin' },
                                    ]}
                                />
                                {mode === 'map' && (
                                    <p className={FIELD_HINT}>
                                        {picking ? 'Tap the map to set the start.' : 'Pin set.'}{' '}
                                        {!picking && (
                                            <button type="button" className="font-medium text-neutral-700 underline" onClick={() => setPicking(true)}>
                                                Move pin
                                            </button>
                                        )}
                                    </p>
                                )}
                                {((mode === 'gps' && gps) || (mode === 'map' && pin)) && (
                                    <button
                                        type="button"
                                        onClick={() => void saveHome()}
                                        className="self-start text-sm font-medium text-neutral-700 underline-offset-2 hover:underline"
                                    >
                                        <i className="fa-solid fa-house mr-1.5 text-xs" aria-hidden="true" />
                                        Save this point as home
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <span className={FIELD_LABEL}>Route</span>
                                <PillToggle
                                    label="Route type"
                                    value={kind}
                                    onChange={setKind}
                                    options={[
                                        { value: 'loop', label: 'Loop' },
                                        { value: 'outback', label: 'Out and back' },
                                    ]}
                                />
                            </div>
                        </section>

                        <div className="flex flex-col gap-2">
                            <Button size="lg" fullWidth icon={busy ? undefined : 'fa-solid fa-route'} onClick={() => void generate()} disabled={!canGenerate}>
                                {busy
                                    ? 'Finding a route…'
                                    : waitSec > 0
                                      ? `Generate another in ${waitSec}s`
                                      : routes.length
                                        ? 'Generate another'
                                        : 'Generate route'}
                            </Button>
                            {settings && (
                                <p className={`${FIELD_HINT} text-center`}>
                                    {settings.usage.used} of {settings.usage.limit} routing calls used today
                                </p>
                            )}
                        </div>

                        {failure && (
                            <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50/70 p-4">
                                <i className="fa-solid fa-triangle-exclamation mt-0.5 text-red-500" aria-hidden="true" />
                                <div className="flex min-w-0 flex-1 flex-col gap-2">
                                    <p className="text-sm text-neutral-800">{failureText}</p>
                                    {retryable && failure.code !== 'cooldown' && (
                                        <Button variant="secondary" size="sm" className="self-start" onClick={() => void generate()} disabled={!canGenerate}>
                                            {waitSec > 0 ? `Try again in ${waitSec}s` : 'Try again'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}
                        {notice && <p className="rounded-2xl bg-neutral-50 px-4 py-3 text-sm text-neutral-700">{notice}</p>}

                        {litCheck && (
                            <p className="flex items-center gap-2.5 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                                <i className="fa-solid fa-lightbulb text-amber-500" aria-hidden="true" />
                                {LIT_WARNING}
                            </p>
                        )}

                        {/* ── Map + route ── */}
                        <section className="flex flex-col gap-4">
                            <RouteMap
                                coords={showingRoute ? view.coords : null}
                                loop={view?.kind !== 'outback'}
                                start={start}
                                steps={showingRoute ? drawn?.steps : undefined}
                                hoverM={hoverM}
                                onHover={setHoverM}
                                active={!!entry}
                                onPick={
                                    mode === 'map' && picking
                                        ? (p) => {
                                              setPin(p)
                                              setPicking(false)
                                          }
                                        : undefined
                                }
                            />

                            {showingRoute && drawn && (
                                <>
                                    {view.offTarget && (
                                        <div className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                                            <p>
                                                No route came back within 5% (or 250 m) of {formatKm(view.targetM)}. This is the
                                                closest: <strong className="tabular-nums">{formatDiff(view.distanceM - view.targetM)}</strong>.
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <Button variant="secondary" size="sm" onClick={() => setNotice('Kept.')}>
                                                    Keep it
                                                </Button>
                                                <Button variant="secondary" size="sm" onClick={() => void generate()} disabled={!canGenerate}>
                                                    {waitSec > 0 ? `Try again in ${waitSec}s` : 'Try again'}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                    {view.reported && (
                                        <p className="rounded-2xl bg-red-50/70 px-4 py-3 text-sm text-red-700">
                                            You reported this route as bad.
                                        </p>
                                    )}
                                    <StatStrip
                                        stats={[
                                            { icon: 'fa-solid fa-route', label: 'Distance', value: formatKm(view.distanceM) },
                                            { icon: 'fa-solid fa-bullseye', label: 'vs target', value: formatDiff(view.distanceM - view.targetM) },
                                            { icon: 'fa-solid fa-mountain', label: 'Up / down', value: `↑${view.ascentM} ↓${view.descentM} m` },
                                            {
                                                icon: 'fa-regular fa-clock',
                                                label: 'Est. time',
                                                value: drawn.seconds ? formatDuration(drawn.seconds) : '—',
                                            },
                                        ]}
                                    />
                                    <ElevationChart profile={drawn.profile} totalM={view.distanceM} hoverM={hoverM} onHover={setHoverM} />
                                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500" aria-label="Map key">
                                        <li className="inline-flex items-center gap-1.5">
                                            <span className="h-3 w-3 rounded-full bg-emerald-500" /> Start{view.kind === 'loop' ? ' / finish' : ''}
                                        </li>
                                        <li className="inline-flex items-center gap-1.5">
                                            <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-semibold text-neutral-900 ring-1 ring-neutral-300">1</span>
                                            Each km
                                        </li>
                                        {drawn.steps.length > 0 && (
                                            <>
                                                <li className="inline-flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-900" /> Run starts
                                                </li>
                                                <li className="inline-flex items-center gap-1.5">
                                                    <span className="h-2.5 w-2.5 rounded-full bg-neutral-400" /> Walk starts
                                                </li>
                                            </>
                                        )}
                                    </ul>

                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Button
                                            variant={chosenId === view._id ? 'secondary' : 'strong'}
                                            size="lg"
                                            icon={chosenId === view._id ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle-check'}
                                            onClick={() => void choose(view)}
                                            disabled={view.reported}
                                        >
                                            {chosenId === view._id ? 'Chosen — tap to unchoose' : 'Choose this route'}
                                        </Button>
                                        <Button variant="secondary" size="lg" icon="fa-solid fa-diamond-turn-right" onClick={() => setConfirmMaps(true)}>
                                            Open in Google Maps
                                        </Button>
                                        <Button variant="secondary" size="lg" icon="fa-solid fa-download" onClick={() => downloadGpx(view)}>
                                            Download GPX
                                        </Button>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="lg"
                                                className="flex-1"
                                                icon="fa-regular fa-flag"
                                                onClick={() => setConfirmReport(true)}
                                                disabled={view.reported}
                                            >
                                                Report
                                            </Button>
                                            <Button variant="danger" size="lg" className="flex-1" icon="fa-solid fa-trash-can" onClick={() => void remove(view)}>
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </section>

                        {/* ── History ── */}
                        {routes.length > 0 && (
                            <section className="flex flex-col gap-2">
                                <h3 className="text-sm font-semibold text-neutral-900">Routes for this session</h3>
                                <ul className="flex flex-col gap-1.5">
                                    {[...routes]
                                        .sort((a, b) => Number(b._id === chosenId) - Number(a._id === chosenId))
                                        .map((r) => (
                                            <li key={r._id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setViewId(r._id)
                                                        setPicking(false)
                                                        setHoverM(null)
                                                    }}
                                                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors ${
                                                        r._id === viewId ? 'bg-neutral-900 text-white' : 'bg-neutral-50 text-neutral-800 hover:bg-neutral-100'
                                                    }`}
                                                >
                                                    <span className="font-semibold tabular-nums">{formatKm(r.distanceM)}</span>
                                                    <span className="tabular-nums opacity-70">↑{r.ascentM} m</span>
                                                    <span className="opacity-70">{r.kind === 'loop' ? 'Loop' : 'Out and back'}</span>
                                                    <span className="ml-auto flex shrink-0 items-center gap-2 text-xs opacity-80">
                                                        {r._id === chosenId && (
                                                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 font-semibold text-white">Chosen</span>
                                                        )}
                                                        {r.reported && <span className="rounded-full bg-red-500 px-2 py-0.5 font-semibold text-white">Reported</span>}
                                                        {when(r.createdAt)}
                                                    </span>
                                                </button>
                                            </li>
                                        ))}
                                </ul>
                            </section>
                        )}

                        <p className="text-xs leading-relaxed text-neutral-500">
                            Routes follow walkable streets and paths from OpenStreetMap. They say nothing about whether a
                            route is lit, safe or quiet — check before you go.
                        </p>
                    </div>
                )}
            </Drawer>

            <ConfirmModal
                open={confirmMaps}
                title="Open in Google Maps"
                message={
                    <>
                        {MAPS_WARNING} Opens the Google Maps app if it&apos;s installed, or Google Maps in your browser if not. For the
                        exact route, use Download GPX.
                    </>
                }
                confirmLabel="Open Google Maps"
                onConfirm={() => view && openMaps(view)}
                onClose={() => setConfirmMaps(false)}
            />
            <ConfirmModal
                open={confirmReport}
                title="Report this route?"
                message="It's marked as bad and routes like it won't be offered from this area again."
                confirmLabel="Report route"
                danger
                onConfirm={() => view && void report(view)}
                onClose={() => setConfirmReport(false)}
            />
        </>
    )
}
