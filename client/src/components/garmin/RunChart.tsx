import { useMemo, useRef } from 'react'
import type { SeriesPoint } from '../../lib/garminRun'
import { clock } from '../../lib/garminRun'

/**
 * One series over the run's time as a plain line, with its range written at
 * the side. Pointing at it reports the distance there (`onHover`) so the map
 * can show the spot; `hoverT` draws the cursor when another chart is pointed at.
 */

const W = 600
const H = 110
const PAD = 8

export default function RunChart({
    label,
    points,
    format,
    invert = false,
    hoverT,
    onHover,
}: {
    label: string
    points: SeriesPoint[]
    format: (v: number) => string
    /** Lower is better and drawn higher — pace. */
    invert?: boolean
    hoverT: number | null
    onHover: (p: { t: number; d: number | null } | null) => void
}) {
    const svg = useRef<SVGSVGElement>(null)

    const shape = useMemo(() => {
        if (points.length < 2) return null
        const vs = points.map((p) => p.v)
        const lo = Math.min(...vs)
        const hi = Math.max(Math.max(...vs), lo + 1)
        const t0 = points[0].t
        const span = Math.max(1, points[points.length - 1].t - t0)
        const x = (t: number) => ((t - t0) / span) * W
        const y = (v: number) => {
            const f = (v - lo) / (hi - lo)
            return PAD + (invert ? f : 1 - f) * (H - PAD * 2)
        }
        const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')
        const avg = vs.reduce((a, b) => a + b, 0) / vs.length
        return { line, x, y, lo, hi, avg, t0, span }
    }, [points, invert])

    if (!shape) return null

    const nearest = (clientX: number) => {
        const box = svg.current?.getBoundingClientRect()
        if (!box) return null
        const t = shape.t0 + ((clientX - box.left) / box.width) * shape.span
        let best = points[0]
        for (const p of points) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
        return best
    }
    const cursor = hoverT == null ? null : points.reduce((b, p) => (Math.abs(p.t - hoverT) < Math.abs(b.t - hoverT) ? p : b), points[0])

    return (
        <figure className="flex flex-col gap-1.5">
            <figcaption className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-semibold text-neutral-900">{label}</span>
                <span className="tabular-nums text-neutral-500">
                    {cursor ? (
                        <>
                            <span className="font-semibold text-neutral-900">{format(cursor.v)}</span> at {clock(cursor.t)}
                        </>
                    ) : (
                        <>
                            avg {format(shape.avg)} · {format(invert ? shape.hi : shape.lo)}–{format(invert ? shape.lo : shape.hi)}
                        </>
                    )}
                </span>
            </figcaption>
            <svg
                ref={svg}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-[110px] w-full touch-none rounded-xl bg-neutral-50"
                role="img"
                aria-label={`${label} over the run`}
                onPointerMove={(e) => {
                    const p = nearest(e.clientX)
                    onHover(p ? { t: p.t, d: p.d } : null)
                }}
                onPointerLeave={() => onHover(null)}
            >
                <path d={shape.line} fill="none" stroke="#1a1917" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                {cursor && (
                    <line
                        x1={shape.x(cursor.t)}
                        x2={shape.x(cursor.t)}
                        y1={0}
                        y2={H}
                        stroke="#e0294a"
                        strokeWidth={1.5}
                        vectorEffect="non-scaling-stroke"
                    />
                )}
            </svg>
        </figure>
    )
}
