import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cumulative, haversine, kmMarkers, placeArrows, pointAt, toLatLng, type LatLng } from '../../lib/routeTrack'
import type { StepKind } from '../../lib/routeDistance'

/**
 * The route on an OpenStreetMap base: the line, start/finish, a marker at each
 * km and where each planned run and walk starts. With no route it's a map to
 * drop a start point on. `hoverM` (from the elevation chart) shows where that
 * distance is; tapping the line reports a distance back the other way.
 *
 * Chevrons along the line show which way it goes (recomputed on zoom so they
 * stay evenly spaced on screen); where the route runs back over itself they sit
 * either side of the line, one side per direction.
 *
 * "Show my location" starts watching the device position only when tapped,
 * then draws a blue dot with its accuracy circle; tapping again re-centres on
 * it. The watch stops when the map is closed (`active` false) or unmounts.
 *
 * The expand button takes the map full screen. Leaflet's element is moved
 * between the inline frame and a full-screen frame rather than rebuilt, so the
 * view, markers and hover link carry straight over.
 *
 * Tiles are OSM's standard tiles, fine for light personal use under the OSMF
 * tile policy as long as the attribution stays visible.
 */

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Routes: <a href="https://openrouteservice.org/">openrouteservice</a>'

const INK = '#1a1917'
const CORAL = '#e0294a'

const dot = (html: string, size: number) =>
    L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

const BLUE = '#2563eb'

// A chevron pointing right, turned to the direction of travel. White under-stroke so
// it reads both on the coral line and beside it on the tiles.
const chevron = (angle: number) =>
    L.divIcon({
        html: `<div style="width:16px;height:16px;transform:rotate(${angle.toFixed(1)}deg)"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 3.5l4.5 4.5L6 12.5" fill="none" stroke="#7f1d1d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`,
        className: '',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    })

type Locate = 'off' | 'finding' | 'on' | 'denied' | 'unavailable'

const LOCATE_TEXT: Partial<Record<Locate, string>> = {
    denied: 'Location is blocked for this site — allow it in your browser settings to see where you are.',
    unavailable: 'Can’t find your location right now.',
}

const pill = (text: string, bg: string, fg = '#fff') =>
    `<div style="display:grid;place-items:center;height:100%;border-radius:999px;background:${bg};color:${fg};font:600 11px/1 Geist,system-ui,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)">${text}</div>`

export interface StepMarker {
    atM: number
    kind: StepKind
    label: string
}

/** A place the route has to pass (or finish at), shown with or without a route drawn. */
export interface MapWaypoint {
    lat: number
    lng: number
    /** What the pin says: "1", "2", "F". */
    mark: string
    label?: string
}

export default function RouteMap({
    coords,
    loop,
    start,
    waypoints,
    pickLabel,
    fill = false,
    fitKey,
    fitPadding,
    onMoveStart,
    onMoveWaypoint,
    steps = [],
    planned = null,
    hoverM,
    onHover,
    onPick,
    active = true,
    className = '',
}: {
    coords: number[][] | null
    loop: boolean
    /** Shown when there's no route yet. */
    start: LatLng | null
    waypoints?: MapWaypoint[]
    /** Says what a tap will set, for screen readers. */
    pickLabel?: string
    /** Fills its parent edge to edge, as the whole of a page. */
    fill?: boolean
    /** Set: the view only moves when this changes, so editing never yanks the map about. */
    fitKey?: number
    /** Room to leave for whatever floats over the map when fitting to `fitKey`. */
    fitPadding?: { topLeft: [number, number]; bottomRight: [number, number] }
    /** Set: the start pin can be dragged. */
    onMoveStart?: (p: LatLng) => void
    /** Set: waypoint pins can be dragged. */
    onMoveWaypoint?: (index: number, p: LatLng) => void
    steps?: StepMarker[]
    /** A second line under the main one — the planned route, behind the run as done. */
    planned?: number[][] | null
    hoverM: number | null
    onHover?: (atM: number | null) => void
    /** Set when the map is in "drop a start point" mode. */
    onPick?: (p: LatLng) => void
    /** False while the map's drawer is shut (it stays mounted) — stops watching location. */
    active?: boolean
    className?: string
}) {
    const inlineSlot = useRef<HTMLDivElement>(null)
    const fullSlot = useRef<HTMLDivElement>(null)
    // Leaflet's own element — created here, not by React, so it can move between frames.
    const holder = useRef<HTMLDivElement | null>(null)
    const bounds = useRef<L.LatLngBounds | null>(null)
    const [full, setFull] = useState(false)
    const map = useRef<L.Map | null>(null)
    const layer = useRef<L.LayerGroup | null>(null)
    const hoverMarker = useRef<L.CircleMarker | null>(null)
    const arrowLayer = useRef<L.LayerGroup | null>(null)
    const youLayer = useRef<L.LayerGroup | null>(null)
    // Redraws the chevrons for the current zoom; set by the route effect.
    const drawArrows = useRef<() => void>(() => {})
    const [locate, setLocate] = useState<Locate>('off')
    const watchId = useRef<number | null>(null)
    const you = useRef<{ lat: number; lng: number; acc: number } | null>(null)
    const centreOnFix = useRef(false)
    // Leaflet's handlers are bound once; these keep them calling the latest props.
    const pickRef = useRef(onPick)
    const hoverRef = useRef(onHover)
    const moveStartRef = useRef(onMoveStart)
    const moveWaypointRef = useRef(onMoveWaypoint)
    const fillRef = useRef(fill)
    useEffect(() => {
        pickRef.current = onPick
        hoverRef.current = onHover
        moveStartRef.current = onMoveStart
        moveWaypointRef.current = onMoveWaypoint
    })
    const canDragStart = !!onMoveStart
    const canDragWaypoints = !!onMoveWaypoint

    // Create once.
    useEffect(() => {
        if (!inlineSlot.current || map.current) return
        const node = document.createElement('div')
        node.style.width = '100%'
        node.style.height = '100%'
        inlineSlot.current.appendChild(node)
        holder.current = node
        const m = L.map(node, { zoomControl: !fillRef.current, attributionControl: true }).setView([54.5, -2.5], 5)
        // Full page: the bottom and left are covered by panels, so everything required stays top right.
        if (fillRef.current) {
            m.attributionControl.setPosition('topright')
            L.control.zoom({ position: 'topright' }).addTo(m)
        }
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
        m.attributionControl.setPrefix(false)
        m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
        layer.current = L.layerGroup().addTo(m)
        arrowLayer.current = L.layerGroup().addTo(m)
        // Your dot sits above the route line and its markers.
        m.createPane('you').style.zIndex = '640'
        youLayer.current = L.layerGroup().addTo(m)
        m.on('zoomend', () => drawArrows.current())
        map.current = m
        // The drawer slides in; measure again once it has.
        const t = window.setTimeout(() => m.invalidateSize(), 350)
        const ro = new ResizeObserver(() => m.invalidateSize())
        ro.observe(node)
        return () => {
            window.clearTimeout(t)
            ro.disconnect()
            m.remove()
            node.remove()
            map.current = null
            arrowLayer.current = null
            youLayer.current = null
            holder.current = null
        }
    }, [])

    // Move the map into whichever frame is showing, then refit it.
    useEffect(() => {
        const node = holder.current
        const target = full ? fullSlot.current : inlineSlot.current
        if (!node || !target || node.parentElement === target) return
        target.appendChild(node)
        const raf = requestAnimationFrame(() => {
            const m = map.current
            if (!m) return
            m.invalidateSize()
            if (bounds.current) m.fitBounds(bounds.current, { padding: [24, 24] })
        })
        return () => cancelAnimationFrame(raf)
    }, [full])

    // Escape leaves full screen without also closing the drawer underneath.
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

    const autoFit = fitKey === undefined

    // Draw the route (or the bare start point).
    useEffect(() => {
        const m = map.current
        const g = layer.current
        if (!m || !g) return
        g.clearLayers()
        arrowLayer.current?.clearLayers()
        drawArrows.current = () => {}
        hoverMarker.current = null
        bounds.current = null
        const dragStart = (marker: L.Marker) => {
            marker.on('dragend', () => {
                const at = marker.getLatLng()
                moveStartRef.current?.({ lat: at.lat, lng: at.lng })
            })
            return marker
        }
        const plannedLine =
            planned && planned.length > 1
                ? L.polyline(
                      planned.map((c) => [c[1], c[0]] as [number, number]),
                      { color: '#716d66', weight: 4, opacity: 0.7, dashArray: '6 8', interactive: false }
                  ).addTo(g)
                : null
        if (coords && coords.length > 1) {
            const cum = cumulative(coords)
            const latlngs = coords.map((c) => [c[1], c[0]] as [number, number])
            const line = L.polyline(latlngs, { color: CORAL, weight: 5, opacity: 0.9 }).addTo(g)
            // A wide invisible line makes the route easy to tap on a phone.
            const hit = L.polyline(latlngs, { color: '#000', weight: 24, opacity: 0 }).addTo(g)
            const nearest = (e: L.LeafletMouseEvent) => {
                let best = 0
                let bestD = Infinity
                coords.forEach((c, i) => {
                    const d = (c[1] - e.latlng.lat) ** 2 + (c[0] - e.latlng.lng) ** 2
                    if (d < bestD) {
                        bestD = d
                        best = i
                    }
                })
                hoverRef.current?.(cum[best])
            }
            hit.on('mousemove', nearest)
            hit.on('click', nearest)
            hit.on('mouseout', () => hoverRef.current?.(null))

            for (const s of steps) {
                if (s.atM <= 0) continue
                const p = pointAt(coords, cum, s.atM)
                L.marker([p.lat, p.lng], {
                    icon: dot(pill('', s.kind === 'run' ? INK : '#a8a39a'), 12),
                    title: `${s.kind === 'run' ? 'Run' : 'Walk'} starts — ${s.label}`,
                    keyboard: false,
                }).addTo(g)
            }
            for (const k of kmMarkers(coords, cum)) {
                L.marker([k.lat, k.lng], { icon: dot(pill(String(k.km), '#fff', INK), 22), title: `${k.km} km`, keyboard: false }).addTo(g)
            }
            // Chevrons every ~80 px on screen, kept clear of the km and run/walk markers.
            const clearOfM = [...kmMarkers(coords, cum).map((k) => k.km * 1000), ...steps.filter((s) => s.atM > 0).map((s) => s.atM)]
            drawArrows.current = () => {
                const a = arrowLayer.current
                if (!a || !map.current) return
                a.clearLayers()
                const z = map.current.getZoom()
                const pts = latlngs.map((ll) => map.current!.project(ll, z))
                for (const arrow of placeArrows(pts, cum, { clearOfM })) {
                    L.marker(map.current.unproject(L.point(arrow.x, arrow.y), z), {
                        icon: chevron(arrow.angle),
                        interactive: false,
                        keyboard: false,
                        zIndexOffset: -1000,
                    }).addTo(a)
                }
            }

            const s = toLatLng(coords[0])
            const f = toLatLng(coords[coords.length - 1])
            // An out-and-back finishes where it started: one S/F marker, like a loop.
            const closed = loop || haversine(s, f) < 40
            if (!closed && !waypoints?.some((w) => w.mark === 'F'))
                L.marker([f.lat, f.lng], { icon: dot(pill('F', INK), 26), title: 'Finish' }).addTo(g)
            dragStart(
                L.marker([s.lat, s.lng], {
                    icon: dot(pill(closed ? 'S/F' : 'S', '#1f7a45'), closed ? 32 : 26),
                    title: closed ? 'Start and finish' : 'Start',
                    zIndexOffset: 1000,
                    draggable: canDragStart,
                })
            ).addTo(g)
            bounds.current = line.getBounds()
            if (plannedLine) bounds.current.extend(plannedLine.getBounds())
            if (autoFit) m.fitBounds(bounds.current, { padding: [24, 24] })
            drawArrows.current()
        } else if (start || waypoints?.length) {
            if (start)
                dragStart(
                    L.marker([start.lat, start.lng], { icon: dot(pill('S', '#1f7a45'), 26), title: 'Start', draggable: canDragStart, zIndexOffset: 1000 })
                ).addTo(g)
            const all = [...(start ? [start] : []), ...(waypoints ?? [])]
            bounds.current = L.latLngBounds(all.map((p) => [p.lat, p.lng] as [number, number]))
            if (autoFit) {
                if (all.length > 1) m.fitBounds(bounds.current, { padding: [40, 40], maxZoom: 16 })
                else m.setView([all[0].lat, all[0].lng], Math.max(m.getZoom(), 14))
            }
        }
        ;(waypoints ?? []).forEach((w, i) => {
            const marker = L.marker([w.lat, w.lng], {
                icon: dot(pill(w.mark, w.mark === 'F' ? INK : BLUE), 26),
                title: w.label ?? w.mark,
                zIndexOffset: 900,
                draggable: canDragWaypoints,
            }).addTo(g)
            marker.on('dragend', () => {
                const at = marker.getLatLng()
                moveWaypointRef.current?.(i, { lat: at.lat, lng: at.lng })
            })
        })
    }, [coords, loop, start, waypoints, steps, planned, autoFit, canDragStart, canDragWaypoints])

    // Fit on request only. Runs after the draw above, so the bounds are this render's.
    useEffect(() => {
        if (fitKey === undefined || !map.current || !bounds.current) return
        map.current.fitBounds(bounds.current, {
            paddingTopLeft: fitPadding?.topLeft ?? [24, 24],
            paddingBottomRight: fitPadding?.bottomRight ?? [24, 24],
            maxZoom: 16,
        })
    }, [fitKey, fitPadding])

    // The point the chart is pointing at.
    useEffect(() => {
        const m = map.current
        const g = layer.current
        if (!m || !g || !coords || coords.length < 2) return
        if (hoverM === null) {
            hoverMarker.current?.remove()
            hoverMarker.current = null
            return
        }
        const p = pointAt(coords, cumulative(coords), hoverM)
        if (!hoverMarker.current) {
            hoverMarker.current = L.circleMarker([p.lat, p.lng], {
                radius: 8,
                color: '#fff',
                weight: 3,
                fillColor: INK,
                fillOpacity: 1,
            }).addTo(g)
        } else hoverMarker.current.setLatLng([p.lat, p.lng])
    }, [hoverM, coords])

    const frameButton =
        'absolute z-[1001] grid h-11 w-11 place-items-center rounded-xl bg-white text-neutral-800 shadow-md ring-1 ring-neutral-900/10 hover:bg-neutral-50 active:bg-neutral-100'

    // ── Your location ──
    const stopWatching = () => {
        if (watchId.current !== null) navigator.geolocation?.clearWatch(watchId.current)
        watchId.current = null
        you.current = null
        youLayer.current?.clearLayers()
    }
    useEffect(() => stopWatching, [])
    // Drawer shut: stop watching, and start from "Show my location" next time.
    const [wasActive, setWasActive] = useState(active)
    if (active !== wasActive) {
        setWasActive(active)
        if (!active) setLocate('off')
    }
    useEffect(() => {
        if (!active) stopWatching()
    }, [active])

    const centreOnYou = () => {
        const m = map.current
        const p = you.current
        if (!m || !p) return
        m.setView([p.lat, p.lng], Math.max(m.getZoom(), 16))
    }

    const showYou = () => {
        const m = map.current
        const g = youLayer.current
        const p = you.current
        if (!m || !g || !p) return
        g.clearLayers()
        L.circle([p.lat, p.lng], { pane: 'you', radius: p.acc, color: BLUE, weight: 1, opacity: 0.4, fillColor: BLUE, fillOpacity: 0.12, interactive: false }).addTo(g)
        L.circleMarker([p.lat, p.lng], { pane: 'you', radius: 7, color: '#fff', weight: 3, fillColor: BLUE, fillOpacity: 1, interactive: false }).addTo(g)
    }

    const onLocateTap = () => {
        if (watchId.current !== null) {
            if (you.current) centreOnYou()
            else centreOnFix.current = true
            return
        }
        if (!('geolocation' in navigator) || !window.isSecureContext) {
            setLocate('unavailable')
            return
        }
        setLocate('finding')
        centreOnFix.current = true
        watchId.current = navigator.geolocation.watchPosition(
            (pos) => {
                you.current = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }
                showYou()
                setLocate('on')
                if (centreOnFix.current) {
                    centreOnFix.current = false
                    centreOnYou()
                }
            },
            (err) => {
                if (err.code === err.PERMISSION_DENIED) {
                    stopWatching()
                    setLocate('denied')
                } else if (!you.current) {
                    // Keep watching — a fix may still come; the dot stays put meanwhile.
                    setLocate('unavailable')
                }
            },
            { enableHighAccuracy: true, maximumAge: 5000 }
        )
    }

    const locateMessage = LOCATE_TEXT[locate]
    const locateButton = (top: string) => (
        <button
            type="button"
            onClick={onLocateTap}
            className={`${frameButton} right-3 ${top} ${locate === 'on' ? 'text-blue-600' : ''}`}
            aria-label={locate === 'on' ? 'Centre the map on me' : 'Show my location'}
            title={locate === 'on' ? 'Centre on me' : 'Show my location'}
        >
            <i className={`fa-solid ${locate === 'finding' ? 'fa-spinner fa-spin' : 'fa-location-crosshairs'}`} aria-hidden="true" />
        </button>
    )

    const label = onPick ? (pickLabel ?? 'Map — tap to set the start point') : 'Route map'

    return (
        <>
            <div
                className={`relative isolate w-full overflow-hidden bg-neutral-100 ${fill ? 'h-full' : 'h-[320px] rounded-2xl sm:h-[380px]'} ${className}`}
            >
                <div
                    ref={inlineSlot}
                    className={`h-full w-full ${onPick ? 'cursor-crosshair' : ''}`}
                    role="application"
                    aria-label={label}
                />
                {!full && !fill && (
                    <button type="button" onClick={() => setFull(true)} className={`${frameButton} right-3 top-3`} aria-label="Expand map to full screen">
                        <i className="fa-solid fa-expand" aria-hidden="true" />
                    </button>
                )}
                {!full && locateButton(fill ? 'top-[7.25rem]' : 'top-16')}
            </div>
            {!full && locateMessage && <p className="mt-2 text-sm text-neutral-500">{locateMessage}</p>}
            {full &&
                createPortal(
                    <div className="fixed inset-0 z-[60] bg-white" role="dialog" aria-modal="true" aria-label="Route map, full screen">
                        <div ref={fullSlot} className={`isolate h-full w-full ${onPick ? 'cursor-crosshair' : ''}`} role="application" aria-label={label} />
                        <button
                            type="button"
                            onClick={() => setFull(false)}
                            className={`${frameButton} right-3 top-[max(0.75rem,env(safe-area-inset-top))]`}
                            aria-label="Exit full screen"
                            autoFocus
                        >
                            <i className="fa-solid fa-compress" aria-hidden="true" />
                        </button>
                        {locateButton('top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)]')}
                        {locateMessage && (
                            <p className="absolute inset-x-3 bottom-[max(1.75rem,calc(env(safe-area-inset-bottom)+1.25rem))] z-[1001] mx-auto w-fit max-w-full rounded-xl bg-white px-3 py-2 text-sm text-neutral-700 shadow-md ring-1 ring-neutral-900/10">
                                {locateMessage}
                            </p>
                        )}
                    </div>,
                    document.body
                )}
        </>
    )
}
