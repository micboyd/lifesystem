import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { MONTHS, parseDateKey } from '../../lib/calendar'
import { adjoins, niceScale, type Bucket, type TrendPoint } from '../../lib/garminTrends'

/**
 * A long-run line: one point per week or month, on a real time axis from the
 * start of the range to its end, so a stretch with no watch reads as a gap in
 * the line rather than being bridged.
 *
 * The line is an SVG stretched to its box; every label is HTML laid over it, so
 * the type stays its own size on a phone instead of shrinking with the drawing.
 * Hovering (or dragging a finger) reads off the nearest point underneath.
 */

const W = 1000
const H = 100
const DAY_MS = 86_400_000
const ms = (date: string) => Date.parse(`${date}T00:00:00Z`)

/** Month-start ticks across the range, thinned to at most six. */
function timeTicks(from: string, to: string): { date: string; label: string }[] {
    const start = parseDateKey(from)
    const all: { year: number; month: number }[] = []
    let { year, month } = start
    if (start.day > 1) month += 1
    for (;;) {
        if (month > 11) {
            month = 0
            year += 1
        }
        const key = `${year}-${String(month + 1).padStart(2, '0')}-01`
        if (key > to) break
        all.push({ year, month })
        month += 1
    }
    const step = [1, 2, 3, 6, 12, 24, 60].find((s) => all.length / s <= 6) ?? 120
    const picked = all.filter((t) =>
        step <= 12 ? t.month % step === 0 : t.month === 0 && t.year % (step / 12) === 0
    )
    return picked.map((t, i) => ({
        date: `${t.year}-${String(t.month + 1).padStart(2, '0')}-01`,
        label:
            step >= 12
                ? String(t.year)
                : t.month === 0 || i === 0
                  ? `${MONTHS[t.month].slice(0, 3)} ${String(t.year).slice(2)}`
                  : MONTHS[t.month].slice(0, 3),
    }))
}

function pointLabel(p: TrendPoint, bucket: Bucket): string {
    const { year, month, day } = parseDateKey(p.date)
    return bucket === 'week'
        ? `Week of ${day} ${MONTHS[month].slice(0, 3)} ${year}`
        : `${MONTHS[month]} ${year}`
}

export default function TrendChart({
    points,
    bucket,
    from,
    to,
    label,
    format,
    formatTick = format,
    minSpan,
}: {
    points: TrendPoint[]
    bucket: Bucket
    /** The ends of the time axis, YYYY-MM-DD. */
    from: string
    to: string
    /** Names the chart for screen readers, e.g. "Steps". */
    label: string
    /** A value as it reads in the readout: "11,240 steps". */
    format: (value: number) => string
    /** A value as it reads on the axis; defaults to `format`. */
    formatTick?: (value: number) => string
    /** The least the y-axis will span, so a flat series isn't stretched. */
    minSpan: number
}) {
    const plot = useRef<HTMLDivElement>(null)
    const [hover, setHover] = useState<number | null>(null)

    const geometry = useMemo(() => {
        if (points.length < 2) return null
        const t0 = ms(from)
        const span = Math.max(DAY_MS, ms(to) - t0)
        // A point stands for its whole week or month, so it sits mid-way through it.
        const half = (bucket === 'week' ? 3.5 : 15) * DAY_MS
        const fx = (date: string) => Math.min(1, Math.max(0, (ms(date) + half - t0) / span))
        const values = points.map((p) => p.value)
        const scale = niceScale(Math.min(...values), Math.max(...values), minSpan)
        const fy = (v: number) => 1 - (v - scale.lo) / (scale.hi - scale.lo)
        const xy = points.map((p) => ({ x: fx(p.date), y: fy(p.value) }))
        let path = ''
        points.forEach((p, i) => {
            const joined = i > 0 && adjoins(points[i - 1], p, bucket)
            path += `${joined ? 'L' : 'M'}${(xy[i].x * W).toFixed(1)},${(xy[i].y * H).toFixed(2)} `
        })
        // A point with a gap on both sides has no line to be part of; mark it.
        const lone = xy.filter((_, i) => {
            const before = i > 0 && adjoins(points[i - 1], points[i], bucket)
            const after = i < points.length - 1 && adjoins(points[i], points[i + 1], bucket)
            return !before && !after
        })
        const ticks = timeTicks(from, to)
            .map((t) => ({ ...t, x: (ms(t.date) - t0) / span }))
            .filter((t) => t.x >= 0.04 && t.x <= 0.96)
        return { xy, path, lone, scale, fy, ticks }
    }, [points, bucket, from, to, minSpan])

    if (!geometry) {
        return (
            <p className="py-10 text-center text-sm text-neutral-500">
                {points.length === 0
                    ? 'Nothing recorded in this stretch.'
                    : 'Not enough here yet to draw a line.'}
            </p>
        )
    }

    const { xy, path, lone, scale, fy, ticks } = geometry

    function onMove(e: PointerEvent<HTMLDivElement>) {
        const box = plot.current?.getBoundingClientRect()
        if (!box || box.width === 0) return
        const f = (e.clientX - box.left) / box.width
        let best = 0
        for (let i = 1; i < xy.length; i++) if (Math.abs(xy[i].x - f) < Math.abs(xy[best].x - f)) best = i
        setHover(best)
    }

    const shown = hover !== null && hover < points.length ? hover : null
    const last = points[points.length - 1]

    return (
        <div>
            <p className="mb-2 flex min-h-5 flex-wrap items-baseline gap-x-2 text-[13px] text-neutral-500" aria-live="off">
                <span className="nums font-semibold text-neutral-900">
                    {format(shown !== null ? points[shown].value : last.value)}
                </span>
                <span>{pointLabel(shown !== null ? points[shown] : last, bucket)}</span>
            </p>
            <div className="flex gap-2">
                <div className="relative h-40 w-11 shrink-0 text-right text-[11px] nums text-neutral-500" aria-hidden="true">
                    {scale.ticks.map((t) => (
                        <span
                            key={t}
                            className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
                            style={{ top: `${fy(t) * 100}%` }}
                        >
                            {formatTick(t)}
                        </span>
                    ))}
                </div>
                <div className="min-w-0 flex-1">
                    <div
                        ref={plot}
                        className="relative h-40 touch-pan-y"
                        onPointerMove={onMove}
                        onPointerDown={onMove}
                        onPointerLeave={() => setHover(null)}
                    >
                        {scale.ticks.map((t) => (
                            <div
                                key={t}
                                className="absolute inset-x-0 border-t border-neutral-900/[0.07]"
                                style={{ top: `${fy(t) * 100}%` }}
                            />
                        ))}
                        <svg
                            viewBox={`0 0 ${W} ${H}`}
                            preserveAspectRatio="none"
                            className="absolute inset-0 h-full w-full overflow-visible"
                            role="img"
                            aria-label={`${label} over time`}
                        >
                            <path
                                d={path}
                                fill="none"
                                className="stroke-coral-500"
                                strokeWidth={2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                                vectorEffect="non-scaling-stroke"
                            />
                        </svg>
                        {lone.map((p) => (
                            <span
                                key={p.x}
                                className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral-500"
                                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                            />
                        ))}
                        {shown !== null && (
                            <>
                                <div
                                    className="pointer-events-none absolute inset-y-0 w-px bg-neutral-900/20"
                                    style={{ left: `${xy[shown].x * 100}%` }}
                                />
                                <span
                                    className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-coral-500 ring-2 ring-white"
                                    style={{ left: `${xy[shown].x * 100}%`, top: `${xy[shown].y * 100}%` }}
                                />
                            </>
                        )}
                    </div>
                    <div className="relative mt-1.5 h-4 text-[11px] nums text-neutral-500" aria-hidden="true">
                        {ticks.map((t) => (
                            <span
                                key={t.date}
                                className="absolute -translate-x-1/2 whitespace-nowrap"
                                style={{ left: `${t.x * 100}%` }}
                            >
                                {t.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
