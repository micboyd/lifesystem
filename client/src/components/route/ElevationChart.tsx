import { useMemo, useRef } from 'react'
import { formatKm } from '../../lib/routeTrack'

/**
 * Height along the route as a filled line. Pointing or dragging on it reports
 * a distance (`onHover`) so the map can show where that is; `hoverM` coming
 * the other way (a tap on the route line) draws the cursor here.
 */

const W = 600
const H = 132
const PAD_T = 10
const PAD_B = 4

export default function ElevationChart({
    profile,
    totalM,
    hoverM,
    onHover,
}: {
    profile: { atM: number; ele: number }[]
    totalM: number
    hoverM: number | null
    onHover: (atM: number | null) => void
}) {
    const svg = useRef<SVGSVGElement>(null)

    const shape = useMemo(() => {
        if (profile.length < 2) return null
        const eles = profile.map((p) => p.ele)
        const lo = Math.min(...eles)
        // At least 20 m of range so a flat route reads flat, not jagged.
        const hi = Math.max(Math.max(...eles), lo + 20)
        const x = (m: number) => (m / totalM) * W
        const y = (e: number) => PAD_T + (1 - (e - lo) / (hi - lo)) * (H - PAD_T - PAD_B)
        const line = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.atM).toFixed(1)},${y(p.ele).toFixed(1)}`).join(' ')
        const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`
        return { line, area, lo: Math.round(Math.min(...eles)), hi: Math.round(Math.max(...eles)), x, y }
    }, [profile, totalM])

    if (!shape) return <p className="py-6 text-center text-sm text-neutral-500">No elevation data for this route.</p>

    function at(clientX: number) {
        const box = svg.current?.getBoundingClientRect()
        if (!box) return
        const frac = Math.min(1, Math.max(0, (clientX - box.left) / box.width))
        onHover(frac * totalM)
    }

    const hoverEle =
        hoverM === null ? null : profile.reduce((best, p) => (Math.abs(p.atM - hoverM) < Math.abs(best.atM - hoverM) ? p : best))

    return (
        <figure className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-xs text-neutral-500">
                <figcaption className="font-medium text-neutral-700">Elevation</figcaption>
                <span className="tabular-nums">
                    {hoverM !== null && hoverEle
                        ? `${formatKm(hoverM)} · ${Math.round(hoverEle.ele)} m`
                        : `${shape.lo}–${shape.hi} m`}
                </span>
            </div>
            <svg
                ref={svg}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-28 w-full touch-none select-none"
                role="img"
                aria-label={`Elevation from ${shape.lo} m to ${shape.hi} m`}
                onPointerMove={(e) => at(e.clientX)}
                onPointerDown={(e) => at(e.clientX)}
                onPointerLeave={(e) => e.pointerType === 'mouse' && onHover(null)}
            >
                <path d={shape.area} className="fill-coral-100" />
                <path d={shape.line} className="fill-none stroke-coral-500" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                <line x1={0} x2={W} y1={H - PAD_B} y2={H - PAD_B} className="stroke-neutral-200" vectorEffect="non-scaling-stroke" />
                {hoverM !== null && hoverEle && (
                    <>
                        <line
                            x1={shape.x(hoverM)}
                            x2={shape.x(hoverM)}
                            y1={PAD_T}
                            y2={H - PAD_B}
                            className="stroke-neutral-900"
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                        />
                    </>
                )}
            </svg>
            {/* Km labels as HTML so they keep their size when the chart stretches. */}
            <div className="relative h-4 text-[11px] tabular-nums text-neutral-500" aria-hidden="true">
                {Array.from({ length: Math.floor((totalM - 1) / 1000) }, (_, i) => (
                    <span
                        key={i}
                        className="absolute -translate-x-1/2"
                        style={{ left: `${(((i + 1) * 1000) / totalM) * 100}%` }}
                    >
                        {i + 1} km
                    </span>
                ))}
            </div>
        </figure>
    )
}
