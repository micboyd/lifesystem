import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import Button from '../Button'
import 'leaflet/dist/leaflet.css'
import type { RunRoute } from '../../services/routes'
import type { StepMarker } from './RouteMap'
import {
    cumulative,
    formatKm,
    haversine,
    kmMarkers,
    placeArrows,
    pointAt,
    toLatLng,
} from '../../lib/routeTrack'
import {
    MAX_ACCURACY_M,
    OFF_ROUTE_M,
    formatPace,
    recentPace,
    snapToRoute,
    travelHeading,
    type Fix,
} from '../../lib/routeProgress'

/**
 * The chosen route, live, at the top of the conditioning logger: the map
 * follows your blue dot (with an arrow the way you're moving; chevrons on the
 * line show the route's way) and the part you've done greys out. A banner
 * warns when you're off the line. GPS starts when the logger opens and stops when it
 * moves on to the wrap-up or closes — the session's own Completed buttons and
 * Wrap up are the only controls, so there's no second clock or End button.
 *
 * Inline it's just the map. Expanded it goes full screen with the live stats:
 * the part you're on and its round, km to go and done, pace, the next run/walk
 * change, and the part's one button (round done / completed), so you needn't
 * come out of full screen mid-run.
 *
 * It's a web page, so the phone only feeds it GPS while the screen is on and
 * this page is in front — it holds a screen wake lock for that.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const CORAL = '#e0294a'
const BLUE = '#2563eb'
const INK = '#171717'

const pill = (text: string, bg: string, fg = '#fff') =>
    `<div style="display:grid;place-items:center;height:100%;border-radius:999px;background:${bg};color:${fg};font:600 11px/1 Geist,system-ui,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)">${text}</div>`
const dot = (html: string, size: number) =>
    L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

/**
 * You: a blue dot, with an arrow out front pointing the way you're moving
 * (compass degrees; the map is north-up) — or just the dot when standing still.
 */
const youIcon = (heading: number | null) =>
    L.divIcon({
        className: '',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        html: `<div style="position:relative;width:44px;height:44px">${
            heading === null
                ? ''
                : `<svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;inset:0;transform:rotate(${heading.toFixed(0)}deg)" aria-hidden="true"><path d="M22 1 L31 15 Q22 11 13 15 Z" fill="${BLUE}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`
        }<div style="position:absolute;left:13px;top:13px;width:18px;height:18px;border-radius:999px;background:${BLUE};box-shadow:0 0 0 3px #fff,0 1px 4px rgba(0,0,0,.35)"></div></div>`,
    })

// A chevron along the route showing which way it goes (0° = right on screen).
const chevron = (angle: number) =>
    L.divIcon({
        html: `<div style="width:16px;height:16px;transform:rotate(${angle.toFixed(1)}deg)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="#7f1d1d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })

type Gps = 'finding' | 'on' | 'denied' | 'unavailable'

/** Where you are in the session, for the full-screen view. */
export interface LiveProgress {
    /** The part you're on, e.g. "Run intervals"; null once every part is done. */
    part: string | null
    /** "Main · part 3 of 7". */
    where?: string
    /** "Round 2/5". */
    round?: string
    /** The one press the part needs next — "Round done" or "Completed". */
    action?: { label: string; onPress: () => void }
}

/** Two rough fixes in a row off the line before warning, so one GPS wobble doesn't. */
const OFF_ROUTE_FIXES = 2

export default function LiveRouteMap({
    route,
    steps,
    progress,
}: {
    route: RunRoute
    steps: StepMarker[]
    progress?: LiveProgress
}) {
    const coords = route.coords
    const cum = useMemo(() => cumulative(coords), [coords])
    const totalM = cum[cum.length - 1] ?? route.distanceM

    const inlineSlot = useRef<HTMLDivElement>(null)
    const fullSlot = useRef<HTMLDivElement>(null)
    // Leaflet's own element — made here, not by React, so it can move between
    // the inline frame and the full-screen one without rebuilding the map.
    const holder = useRef<HTMLDivElement | null>(null)
    const map = useRef<L.Map | null>(null)
    const doneLine = useRef<L.Polyline | null>(null)
    const youLayer = useRef<L.LayerGroup | null>(null)
    const follow = useRef(true)
    const [following, setFollowing] = useState(true)
    const [full, setFull] = useState(false)

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
    const [heading, setHeading] = useState<number | null>(null)
    const [wakeLockOk, setWakeLockOk] = useState<boolean | null>(() =>
        'wakeLock' in navigator ? null : false
    )

    // ── Map ──
    useEffect(() => {
        if (!inlineSlot.current) return
        const node = document.createElement('div')
        node.style.width = '100%'
        node.style.height = '100%'
        inlineSlot.current.appendChild(node)
        holder.current = node
        const m = L.map(node, { zoomControl: false, attributionControl: true })
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
        m.attributionControl.setPrefix(false)
        const latlngs = coords.map((c) => [c[1], c[0]] as [number, number])
        const line = L.polyline(latlngs, { color: CORAL, weight: 6, opacity: 0.9 }).addTo(m)
        doneLine.current = L.polyline([], { color: '#737373', weight: 7, opacity: 0.85 }).addTo(m)
        for (const s of steps) {
            if (s.atM <= 0) continue
            const p = pointAt(coords, cum, s.atM)
            L.marker([p.lat, p.lng], {
                icon: dot(pill('', s.kind === 'run' ? INK : '#a3a3a3'), 12),
                keyboard: false,
                interactive: false,
            }).addTo(m)
        }
        for (const k of kmMarkers(coords, cum)) {
            L.marker([k.lat, k.lng], {
                icon: dot(pill(String(k.km), '#fff', INK), 22),
                keyboard: false,
                interactive: false,
            }).addTo(m)
        }
        const s = toLatLng(coords[0])
        L.marker([s.lat, s.lng], {
            icon: dot(pill('S', '#10b981'), 26),
            keyboard: false,
            interactive: false,
        }).addTo(m)
        m.createPane('you').style.zIndex = '640'
        youLayer.current = L.layerGroup().addTo(m)
        m.fitBounds(line.getBounds(), { padding: [24, 24] })
        // Chevrons along the line every ~80 px, redrawn per zoom so they stay evenly spaced.
        const arrows = L.layerGroup().addTo(m)
        const clearOfM = [
            ...kmMarkers(coords, cum).map((k) => k.km * 1000),
            ...steps.filter((st) => st.atM > 0).map((st) => st.atM),
        ]
        const drawArrows = () => {
            arrows.clearLayers()
            const z = m.getZoom()
            const pts = latlngs.map((ll) => m.project(ll, z))
            for (const a of placeArrows(pts, cum, { clearOfM })) {
                L.marker(m.unproject(L.point(a.x, a.y), z), {
                    icon: chevron(a.angle),
                    interactive: false,
                    keyboard: false,
                    zIndexOffset: -1000,
                }).addTo(arrows)
            }
        }
        drawArrows()
        m.on('zoomend', drawArrows)
        // Panning by hand stops the map following you until Recentre.
        m.on('dragstart', () => {
            follow.current = false
            setFollowing(false)
        })
        map.current = m
        // The drawer slides in; measure again once it has, and on every resize.
        const t = window.setTimeout(() => m.invalidateSize(), 350)
        const ro = new ResizeObserver(() => m.invalidateSize())
        ro.observe(node)
        return () => {
            window.clearTimeout(t)
            ro.disconnect()
            m.remove()
            node.remove()
            map.current = null
            holder.current = null
        }
    }, [coords, cum, steps])

    // Move the map into whichever frame is showing.
    useEffect(() => {
        const node = holder.current
        const target = full ? fullSlot.current : inlineSlot.current
        if (!node || !target || node.parentElement === target) return
        target.appendChild(node)
        const raf = requestAnimationFrame(() => map.current?.invalidateSize())
        return () => cancelAnimationFrame(raf)
    }, [full])

    // Escape leaves full screen without also closing the logger underneath.
    useEffect(() => {
        if (!full) return
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            e.stopPropagation()
            setFull(false)
        }
        window.addEventListener('keydown', onKey, true)
        return () => window.removeEventListener('keydown', onKey, true)
    }, [full])

    // ── GPS ──
    useEffect(() => {
        if (!('geolocation' in navigator) || !window.isSecureContext) return
        const id = navigator.geolocation.watchPosition(
            (pos) => {
                const f: Fix = {
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    t: pos.timestamp,
                    accuracy: pos.coords.accuracy,
                }
                setGps('on')
                setFix(f)
                fixes.current = [...fixes.current.filter((x) => f.t - x.t < 120_000), f]
                setPace(recentPace(fixes.current))
                setHeading(travelHeading(fixes.current, pos.coords.heading, pos.coords.speed))
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

    // Draw you, and follow.
    useEffect(() => {
        const m = map.current
        const g = youLayer.current
        if (!m || !g || !fix) return
        g.clearLayers()
        L.circle([fix.lat, fix.lng], {
            pane: 'you',
            radius: fix.accuracy,
            color: BLUE,
            weight: 1,
            opacity: 0.4,
            fillColor: BLUE,
            fillOpacity: 0.12,
            interactive: false,
        }).addTo(g)
        L.marker([fix.lat, fix.lng], {
            pane: 'you',
            icon: youIcon(heading),
            interactive: false,
            keyboard: false,
        }).addTo(g)
        if (follow.current)
            m.setView([fix.lat, fix.lng], Math.max(m.getZoom(), 16), { animate: true })
    }, [fix, heading])

    // Grey out the part done.
    useEffect(() => {
        const line = doneLine.current
        if (!line) return
        const pts: [number, number][] = []
        for (let i = 0; i < coords.length && cum[i] <= atM; i++)
            pts.push([coords[i][1], coords[i][0]])
        if (atM > 0) {
            const p = pointAt(coords, cum, atM)
            pts.push([p.lat, p.lng])
        }
        line.setLatLngs(pts)
    }, [atM, coords, cum])

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

    const recentre = () => {
        follow.current = true
        setFollowing(true)
        if (fix) map.current?.setView([fix.lat, fix.lng], Math.max(map.current.getZoom(), 16))
    }

    const toGoM = Math.max(0, totalM - atM)
    const next = steps.find((s) => s.atM > atM + 5)
    const toStartM = fix && atM < 50 ? haversine(fix, toLatLng(coords[0])) : null
    const finished = toGoM < 30 && atM > 0

    const status =
        gps === 'denied'
            ? 'Location is blocked for this site — allow it in your browser settings.'
            : gps === 'unavailable'
              ? "Can't get a GPS fix yet. Head outside with a clear view of the sky."
              : gps === 'finding'
                ? 'Finding GPS…'
                : fix && fix.accuracy > MAX_ACCURACY_M
                  ? `GPS is rough (±${Math.round(fix.accuracy)} m) — give it a moment.`
                  : toStartM !== null && toStartM > 60
                    ? `The start is ${formatKm(toStartM)} away.`
                    : null

    const frameButton =
        'grid h-11 w-11 place-items-center rounded-xl bg-white text-neutral-800 shadow-md ring-1 ring-neutral-900/10 hover:bg-neutral-50 active:bg-neutral-100'

    const banner = (status || offM !== null) && (
        <p
            role="status"
            className={`mx-auto w-fit max-w-full rounded-xl px-3 py-2 text-sm font-medium shadow-md ${
                offM !== null
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-neutral-700 ring-1 ring-neutral-900/10'
            }`}
        >
            {offM !== null ? `Off the route by ${Math.round(offM)} m` : status}
        </p>
    )

    const recentreButton = fix && (
        <button
            type="button"
            onClick={recentre}
            className={`${frameButton} ${following ? 'text-blue-600' : ''}`}
            aria-label="Centre the map on me"
        >
            <i className="fa-solid fa-location-crosshairs" aria-hidden="true" />
        </button>
    )

    return (
        <section className="flex flex-col gap-2" aria-label="Your route, live">
            <div className="relative h-[42svh] min-h-[260px] overflow-hidden rounded-2xl bg-neutral-100">
                <div
                    ref={inlineSlot}
                    className="isolate h-full w-full"
                    role="application"
                    aria-label="Live route map"
                />
                {!full && (
                    <>
                        <div className="absolute right-3 top-3 z-[1001] flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={() => setFull(true)}
                                className={frameButton}
                                aria-label="Full screen, with live stats"
                            >
                                <i className="fa-solid fa-expand" aria-hidden="true" />
                            </button>
                            {recentreButton}
                        </div>
                        {banner && (
                            <div className="absolute inset-x-3 bottom-3 z-[1000]">{banner}</div>
                        )}
                    </>
                )}
            </div>

            <p className="text-xs leading-relaxed text-neutral-500">
                {formatKm(route.distanceM)} · ↑{route.ascentM} m. Expand the map for live stats.
                Keep this screen open — phones stop GPS for web pages when the screen locks.
                {wakeLockOk === false &&
                    " This browser can't keep the screen awake, so turn auto-lock off for the run."}
            </p>

            {full &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[60] flex flex-col bg-white"
                        role="dialog"
                        aria-modal="true"
                        aria-label="Route, full screen"
                    >
                        {/* Where you are in the session */}
                        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                            <div className="min-w-0 flex-1">
                                {progress?.where && (
                                    <p className="truncate text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                        {progress.where}
                                    </p>
                                )}
                                <p className="truncate text-xl font-semibold tracking-[-0.01em] text-neutral-900">
                                    {progress
                                        ? (progress.part ?? 'Every part done')
                                        : formatKm(toGoM) + ' to go'}
                                </p>
                            </div>
                            {progress?.round && (
                                <p className="shrink-0 rounded-xl bg-neutral-900 px-3 py-1.5 text-lg font-semibold tabular-nums text-white">
                                    {progress.round}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={() => setFull(false)}
                                className={`${frameButton} shrink-0`}
                                aria-label="Exit full screen"
                                autoFocus
                            >
                                <i className="fa-solid fa-compress" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="relative min-h-0 flex-1">
                            <div
                                ref={fullSlot}
                                className="isolate h-full w-full"
                                role="application"
                                aria-label="Live route map"
                            />
                            {recentreButton && (
                                <div className="absolute right-3 top-3 z-[1001]">
                                    {recentreButton}
                                </div>
                            )}
                            {banner && (
                                <div className="absolute inset-x-3 bottom-3 z-[1000]">{banner}</div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 border-t border-neutral-100 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                {[
                                    { label: 'To go', value: formatKm(toGoM) },
                                    { label: 'Done', value: formatKm(atM) },
                                    { label: 'Pace', value: formatPace(pace).replace(' /km', '') },
                                ].map((st) => (
                                    <div key={st.label} className="min-w-0">
                                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                            {st.label}
                                        </p>
                                        <p className="truncate text-2xl font-semibold tabular-nums text-neutral-900">
                                            {st.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            {finished ? (
                                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-800">
                                    Route done.
                                </p>
                            ) : next ? (
                                <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                                    <span
                                        className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${next.kind === 'run' ? 'bg-neutral-900' : 'bg-neutral-400'}`}
                                    />
                                    {next.kind === 'run' ? 'Run' : 'Walk'} starts in{' '}
                                    <strong className="tabular-nums">
                                        {formatKm(next.atM - atM)}
                                    </strong>
                                    <span className="text-neutral-500"> — {next.label}</span>
                                </p>
                            ) : null}
                            {progress?.action && (
                                <Button
                                    size="lg"
                                    fullWidth
                                    icon="fa-solid fa-check"
                                    onClick={progress.action.onPress}
                                >
                                    {progress.action.label}
                                </Button>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </section>
    )
}
