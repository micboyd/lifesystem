import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Button from '../Button'
import type { RunRoute } from '../../services/routes'
import type { StepMarker } from './RouteMap'
import { cumulative, formatKm, haversine, kmMarkers, pointAt, toLatLng, type LatLng } from '../../lib/routeTrack'
import {
    MAX_ACCURACY_M,
    OFF_ROUTE_M,
    formatClock,
    formatPace,
    recentPace,
    snapToRoute,
    type Fix,
} from '../../lib/routeProgress'

/**
 * Running a generated route with live GPS: the map follows your blue dot along
 * the route, the part you've done greys out, and the panel shows distance done
 * and to go, time, current pace and the next run/walk change. A banner warns
 * when you're off the line.
 *
 * It's a web page, so the phone only feeds it GPS while the screen is on and
 * this page is in front — it holds a screen wake lock for that. It doesn't save
 * anything: the watch records the run (and Garmin import brings it back).
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const CORAL = '#e0294a'
const BLUE = '#2563eb'
const INK = '#171717'

const pill = (text: string, bg: string, fg = '#fff') =>
    `<div style="display:grid;place-items:center;height:100%;border-radius:999px;background:${bg};color:${fg};font:600 11px/1 Geist,system-ui,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)">${text}</div>`
const dot = (html: string, size: number) =>
    L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

type Gps = 'finding' | 'on' | 'denied' | 'unavailable'
type Phase = 'ready' | 'running' | 'paused'

/** Two rough fixes in a row off the line before warning, so one GPS wobble doesn't. */
const OFF_ROUTE_FIXES = 2

export default function RouteRun({
    route,
    name,
    steps,
    onClose,
}: {
    route: RunRoute
    name: string
    steps: StepMarker[]
    onClose: () => void
}) {
    const coords = route.coords
    const cum = useMemo(() => cumulative(coords), [coords])
    const totalM = cum[cum.length - 1] ?? route.distanceM

    const mapEl = useRef<HTMLDivElement>(null)
    const map = useRef<L.Map | null>(null)
    const doneLine = useRef<L.Polyline | null>(null)
    const youLayer = useRef<L.LayerGroup | null>(null)
    const follow = useRef(true)
    const [following, setFollowing] = useState(true)

    const [gps, setGps] = useState<Gps>(() =>
        'geolocation' in navigator && window.isSecureContext ? 'finding' : 'unavailable'
    )
    const [fix, setFix] = useState<Fix | null>(null)
    const fixes = useRef<Fix[]>([])
    const lastM = useRef(0)
    const offCount = useRef(0)
    const [atM, setAtM] = useState(0)
    const [offM, setOffM] = useState<number | null>(null)
    const [pace, setPace] = useState<number | null>(null)

    const [phase, setPhase] = useState<Phase>('ready')
    const [elapsedMs, setElapsedMs] = useState(0)
    const runningSince = useRef<number | null>(null)
    const banked = useRef(0)
    const [confirmEnd, setConfirmEnd] = useState(false)
    const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(() => ('wakeLock' in navigator ? null : false))

    // ── Map ──
    useEffect(() => {
        if (!mapEl.current) return
        const m = L.map(mapEl.current, { zoomControl: false, attributionControl: true })
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
        m.attributionControl.setPrefix(false)
        const latlngs = coords.map((c) => [c[1], c[0]] as [number, number])
        const line = L.polyline(latlngs, { color: CORAL, weight: 6, opacity: 0.9 }).addTo(m)
        doneLine.current = L.polyline([], { color: '#737373', weight: 7, opacity: 0.85 }).addTo(m)
        for (const s of steps) {
            if (s.atM <= 0) continue
            const p = pointAt(coords, cum, s.atM)
            L.marker([p.lat, p.lng], { icon: dot(pill('', s.kind === 'run' ? INK : '#a3a3a3'), 12), keyboard: false, interactive: false }).addTo(m)
        }
        for (const k of kmMarkers(coords, cum)) {
            L.marker([k.lat, k.lng], { icon: dot(pill(String(k.km), '#fff', INK), 22), keyboard: false, interactive: false }).addTo(m)
        }
        const s = toLatLng(coords[0])
        L.marker([s.lat, s.lng], { icon: dot(pill('S', '#10b981'), 26), keyboard: false, interactive: false }).addTo(m)
        m.createPane('you').style.zIndex = '640'
        youLayer.current = L.layerGroup().addTo(m)
        m.fitBounds(line.getBounds(), { padding: [32, 32] })
        // Panning by hand stops the map following you until Recentre.
        m.on('dragstart', () => {
            follow.current = false
            setFollowing(false)
        })
        map.current = m
        const ro = new ResizeObserver(() => m.invalidateSize())
        ro.observe(mapEl.current)
        return () => {
            ro.disconnect()
            m.remove()
            map.current = null
        }
    }, [coords, cum, steps])

    // ── GPS ──
    useEffect(() => {
        if (!('geolocation' in navigator) || !window.isSecureContext) return
        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const f: Fix = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: pos.timestamp, accuracy: pos.coords.accuracy }
                setGps('on')
                setFix(f)
                fixes.current = [...fixes.current.filter((x) => f.t - x.t < 120_000), f]
                setPace(recentPace(fixes.current))
                const snap = snapToRoute(coords, cum, f, lastM.current)
                if (snap) {
                    const off = snap.offM > OFF_ROUTE_M && f.accuracy <= MAX_ACCURACY_M * 2
                    offCount.current = off ? offCount.current + 1 : 0
                    setOffM(offCount.current >= OFF_ROUTE_FIXES ? snap.offM : null)
                    if (snap.offM <= OFF_ROUTE_M) {
                        lastM.current = snap.atM
                        setAtM(snap.atM)
                    }
                }
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) setGps('denied')
                else setGps((g) => (g === 'on' ? g : 'unavailable'))
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
        )
        return () => navigator.geolocation.clearWatch(id)
    }, [coords, cum])

    // Draw you, the done part, and follow.
    useEffect(() => {
        const m = map.current
        const g = youLayer.current
        if (!m || !g || !fix) return
        g.clearLayers()
        L.circle([fix.lat, fix.lng], { pane: 'you', radius: fix.accuracy, color: BLUE, weight: 1, opacity: 0.4, fillColor: BLUE, fillOpacity: 0.12, interactive: false }).addTo(g)
        L.circleMarker([fix.lat, fix.lng], { pane: 'you', radius: 8, color: '#fff', weight: 3, fillColor: BLUE, fillOpacity: 1, interactive: false }).addTo(g)
        if (follow.current) m.setView([fix.lat, fix.lng], Math.max(m.getZoom(), 16), { animate: true })
    }, [fix])

    useEffect(() => {
        const line = doneLine.current
        if (!line) return
        const pts: [number, number][] = []
        for (let i = 0; i < coords.length && cum[i] <= atM; i++) pts.push([coords[i][1], coords[i][0]])
        if (atM > 0) {
            const p = pointAt(coords, cum, atM)
            pts.push([p.lat, p.lng])
        }
        line.setLatLngs(pts)
    }, [atM, coords, cum])

    // ── Clock ──
    useEffect(() => {
        if (phase !== 'running') return
        const t = window.setInterval(() => {
            if (runningSince.current !== null) setElapsedMs(banked.current + Date.now() - runningSince.current)
        }, 500)
        return () => window.clearInterval(t)
    }, [phase])

    const start = () => {
        runningSince.current = Date.now()
        setPhase('running')
    }
    const pause = () => {
        if (runningSince.current !== null) banked.current += Date.now() - runningSince.current
        runningSince.current = null
        setElapsedMs(banked.current)
        setPhase('paused')
    }

    // ── Keep the screen on ──
    useEffect(() => {
        let lock: WakeLockSentinel | null = null
        let gone = false
        const take = async () => {
            if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
            try {
                lock = await navigator.wakeLock.request('screen')
                if (gone) void lock.release()
                setWakeLockOk(true)
            } catch {
                setWakeLockOk(false)
            }
        }
        void take()
        // The lock drops whenever the page is hidden; take it back on return.
        const onVis = () => document.visibilityState === 'visible' && void take()
        document.addEventListener('visibilitychange', onVis)
        return () => {
            gone = true
            document.removeEventListener('visibilitychange', onVis)
            void lock?.release()
        }
    }, [])

    // Escape asks before ending, like the End button.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            e.stopPropagation()
            if (phase === 'ready') onClose()
            else setConfirmEnd(true)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [phase, onClose])

    const recentre = () => {
        follow.current = true
        setFollowing(true)
        if (fix) map.current?.setView([fix.lat, fix.lng], Math.max(map.current.getZoom(), 16))
    }

    const toGoM = Math.max(0, totalM - atM)
    const next = steps.find((s) => s.atM > atM + 5)
    const toStartM = fix ? haversine(fix, toLatLng(coords[0]) as LatLng) : null
    const finished = toGoM < 30 && atM > 0

    const status =
        gps === 'denied'
            ? 'Location is blocked for this site. Allow it in your browser settings to follow the route.'
            : gps === 'unavailable'
              ? "Can't get a GPS fix yet. Head outside with a clear view of the sky."
              : gps === 'finding'
                ? 'Finding GPS…'
                : fix && fix.accuracy > MAX_ACCURACY_M
                  ? `GPS is rough (±${Math.round(fix.accuracy)} m) — give it a moment.`
                  : null

    return createPortal(
        <div className="fixed inset-0 z-[60] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={`Running ${name}`}>
            <div className="relative min-h-0 flex-1">
                <div ref={mapEl} className="isolate h-full w-full" role="application" aria-label="Live route map" />

                <div className="pointer-events-none absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[1001] flex items-start gap-2">
                    <div className="pointer-events-auto min-w-0 flex-1 rounded-xl bg-white/95 px-3 py-2 shadow-md ring-1 ring-neutral-900/10">
                        <p className="truncate text-sm font-semibold text-neutral-900">{name}</p>
                        <p className="text-xs tabular-nums text-neutral-500">
                            {formatKm(route.distanceM)} · ↑{route.ascentM} m
                            {fix && gps === 'on' && ` · GPS ±${Math.round(fix.accuracy)} m`}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => (phase === 'ready' ? onClose() : setConfirmEnd(true))}
                        className="pointer-events-auto grid h-11 shrink-0 place-items-center rounded-xl bg-white px-4 text-sm font-semibold text-neutral-800 shadow-md ring-1 ring-neutral-900/10"
                    >
                        {phase === 'ready' ? 'Close' : 'End'}
                    </button>
                </div>

                {!following && fix && (
                    <button
                        type="button"
                        onClick={recentre}
                        className="absolute bottom-3 right-3 z-[1001] inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-blue-600 shadow-md ring-1 ring-neutral-900/10"
                    >
                        <i className="fa-solid fa-location-crosshairs" aria-hidden="true" /> Recentre
                    </button>
                )}

                {(status || offM !== null) && (
                    <p
                        role="status"
                        className={`absolute inset-x-3 bottom-3 z-[1000] mx-auto w-fit max-w-[calc(100%-8rem)] rounded-xl px-3 py-2 text-sm font-medium shadow-md ${
                            offM !== null ? 'bg-amber-500 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-900/10'
                        }`}
                    >
                        {offM !== null ? `Off the route by ${Math.round(offM)} m` : status}
                    </p>
                )}
            </div>

            <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                        { label: 'Done', value: formatKm(atM) },
                        { label: 'To go', value: formatKm(toGoM) },
                        { label: 'Time', value: formatClock(elapsedMs / 1000) },
                        { label: 'Pace', value: formatPace(pace).replace(' /km', '') },
                    ].map((s) => (
                        <div key={s.label} className="min-w-0">
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">{s.label}</p>
                            <p className="truncate text-lg font-semibold tabular-nums text-neutral-900 sm:text-2xl">{s.value}</p>
                        </div>
                    ))}
                </div>

                {finished ? (
                    <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800">Route done.</p>
                ) : next ? (
                    <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                        <span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${next.kind === 'run' ? 'bg-neutral-900' : 'bg-neutral-400'}`} />
                        {next.kind === 'run' ? 'Run' : 'Walk'} starts in <strong className="tabular-nums">{formatKm(next.atM - atM)}</strong>
                        <span className="text-neutral-500"> — {next.label}</span>
                    </p>
                ) : null}

                {phase === 'ready' && toStartM !== null && toStartM > 60 && (
                    <p className="text-center text-sm text-neutral-500">The start is {formatKm(toStartM)} away.</p>
                )}

                {confirmEnd ? (
                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="lg" onClick={() => setConfirmEnd(false)}>
                            Keep going
                        </Button>
                        <Button variant="danger" size="lg" onClick={onClose}>
                            End run
                        </Button>
                    </div>
                ) : phase === 'running' ? (
                    <Button variant="secondary" size="lg" fullWidth icon="fa-solid fa-pause" onClick={pause}>
                        Pause
                    </Button>
                ) : (
                    <Button size="lg" fullWidth icon="fa-solid fa-play" onClick={start} disabled={gps === 'denied'}>
                        {phase === 'paused' ? 'Resume' : 'Start'}
                    </Button>
                )}

                {phase === 'ready' && (
                    <p className="text-center text-xs leading-relaxed text-neutral-500">
                        Keep this screen open: phones stop sending GPS to web pages when the screen locks or you switch app.
                        {wakeLockOk === false && " This browser can't keep the screen awake, so turn auto-lock off for the run."}{' '}
                        Nothing is saved here — your watch records the run.
                    </p>
                )}
            </div>
        </div>,
        document.body
    )
}
