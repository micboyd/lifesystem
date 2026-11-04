import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cumulative, kmMarkers, pointAt, toLatLng, type LatLng } from '../../lib/routeTrack'
import type { StepKind } from '../../lib/routeDistance'

/**
 * The route on an OpenStreetMap base: the line, start/finish, a marker at each
 * km and where each planned run and walk starts. With no route it's a map to
 * drop a start point on. `hoverM` (from the elevation chart) shows where that
 * distance is; tapping the line reports a distance back the other way.
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

const INK = '#171717'
const CORAL = '#e0294a'

const dot = (html: string, size: number) =>
    L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] })

const pill = (text: string, bg: string, fg = '#fff') =>
    `<div style="display:grid;place-items:center;height:100%;border-radius:999px;background:${bg};color:${fg};font:600 11px/1 Geist,system-ui,sans-serif;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.3)">${text}</div>`

export interface StepMarker {
    atM: number
    kind: StepKind
    label: string
}

export default function RouteMap({
    coords,
    loop,
    start,
    steps = [],
    planned = null,
    hoverM,
    onHover,
    onPick,
    className = '',
}: {
    coords: number[][] | null
    loop: boolean
    /** Shown when there's no route yet. */
    start: LatLng | null
    steps?: StepMarker[]
    /** A second line under the main one — the planned route, behind the run as done. */
    planned?: number[][] | null
    hoverM: number | null
    onHover?: (atM: number | null) => void
    /** Set when the map is in "drop a start point" mode. */
    onPick?: (p: LatLng) => void
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
    // Leaflet's handlers are bound once; these keep them calling the latest props.
    const pickRef = useRef(onPick)
    const hoverRef = useRef(onHover)
    useEffect(() => {
        pickRef.current = onPick
        hoverRef.current = onHover
    })

    // Create once.
    useEffect(() => {
        if (!inlineSlot.current || map.current) return
        const node = document.createElement('div')
        node.style.width = '100%'
        node.style.height = '100%'
        inlineSlot.current.appendChild(node)
        holder.current = node
        const m = L.map(node, { zoomControl: true, attributionControl: true }).setView([54.5, -2.5], 5)
        L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(m)
        m.attributionControl.setPrefix(false)
        m.on('click', (e: L.LeafletMouseEvent) => pickRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
        layer.current = L.layerGroup().addTo(m)
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

    // Draw the route (or the bare start point).
    useEffect(() => {
        const m = map.current
        const g = layer.current
        if (!m || !g) return
        g.clearLayers()
        hoverMarker.current = null
        bounds.current = null
        const plannedLine =
            planned && planned.length > 1
                ? L.polyline(
                      planned.map((c) => [c[1], c[0]] as [number, number]),
                      { color: '#737373', weight: 4, opacity: 0.7, dashArray: '6 8', interactive: false }
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
                    icon: dot(pill('', s.kind === 'run' ? INK : '#a3a3a3'), 12),
                    title: `${s.kind === 'run' ? 'Run' : 'Walk'} starts — ${s.label}`,
                    keyboard: false,
                }).addTo(g)
            }
            for (const k of kmMarkers(coords, cum)) {
                L.marker([k.lat, k.lng], { icon: dot(pill(String(k.km), '#fff', INK), 22), title: `${k.km} km`, keyboard: false }).addTo(g)
            }
            const s = toLatLng(coords[0])
            const f = toLatLng(coords[coords.length - 1])
            if (!loop) L.marker([f.lat, f.lng], { icon: dot(pill('F', INK), 26), title: 'Finish' }).addTo(g)
            L.marker([s.lat, s.lng], {
                icon: dot(pill(loop ? 'S/F' : 'S', '#10b981'), loop ? 32 : 26),
                title: loop ? 'Start and finish' : 'Start',
                zIndexOffset: 1000,
            }).addTo(g)
            bounds.current = line.getBounds()
            if (plannedLine) bounds.current.extend(plannedLine.getBounds())
            m.fitBounds(bounds.current, { padding: [24, 24] })
        } else if (start) {
            L.marker([start.lat, start.lng], { icon: dot(pill('S', '#10b981'), 26), title: 'Start' }).addTo(g)
            m.setView([start.lat, start.lng], Math.max(m.getZoom(), 14))
        }
    }, [coords, loop, start, steps, planned])

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

    const label = onPick ? 'Map — tap to set the start point' : 'Route map'
    const frameButton =
        'absolute z-[1001] grid h-11 w-11 place-items-center rounded-xl bg-white text-neutral-800 shadow-md ring-1 ring-neutral-900/10 hover:bg-neutral-50 active:bg-neutral-100'

    return (
        <>
            <div className={`relative isolate h-[320px] w-full overflow-hidden rounded-2xl bg-neutral-100 sm:h-[380px] ${className}`}>
                <div
                    ref={inlineSlot}
                    className={`h-full w-full ${onPick ? 'cursor-crosshair' : ''}`}
                    role="application"
                    aria-label={label}
                />
                {!full && (
                    <button type="button" onClick={() => setFull(true)} className={`${frameButton} right-3 top-3`} aria-label="Expand map to full screen">
                        <i className="fa-solid fa-expand" aria-hidden="true" />
                    </button>
                )}
            </div>
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
                    </div>,
                    document.body
                )}
        </>
    )
}
