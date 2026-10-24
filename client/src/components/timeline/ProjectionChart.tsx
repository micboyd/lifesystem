import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { daysBetween } from '../../lib/weightTrend'
import type { Milestone, Range, Timeline } from '../../lib/timeline'
import { PHASE_TONES, fmtDate, fmtNum } from './format'

/**
 * One projected measure across the whole timeline: the likely range as a soft
 * band, the middle of it as a 2px line, the goal as a labelled reference, and a
 * crosshair that reads out any week. The plan lanes sit underneath on the same
 * date scale, so "when the cut ends" lines up with what it does to the line.
 */

export interface ChartPoint {
    date: string
    label: string
    range: Range
    milestones: Milestone[]
    /** A measured value from a week already lived, not a projection. */
    logged?: boolean
}

const HEIGHT = 220
const PAD = { top: 26, right: 64, bottom: 28, left: 44 }

export default function ProjectionChart({
    timeline,
    points,
    logged = [],
    unit,
    decimals,
    goal,
    onPlan,
}: {
    timeline: Timeline
    /** The projection, from today. */
    points: ChartPoint[]
    /** What was measured in the weeks before today. */
    logged?: ChartPoint[]
    unit: string
    decimals: number
    goal: number | null
    /** A plan bar in the lanes was clicked, by its id. */
    onPlan?: (id: string) => void
}) {
    const wrap = useRef<HTMLDivElement>(null)
    const [width, setWidth] = useState(640)
    const [active, setActive] = useState<number | null>(null)

    useEffect(() => {
        const el = wrap.current
        if (!el) return
        const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    // Drawn from the start of the plans, so the whole timeline is always in view.
    const origin = timeline.chainStart
    const total = Math.max(1, daysBetween(origin, timeline.end))
    const plotW = width - PAD.left - PAD.right
    const plotH = HEIGHT - PAD.top - PAD.bottom
    const x = (date: string) => PAD.left + (daysBetween(origin, date) / total) * plotW
    const all = useMemo(() => [...logged, ...points], [logged, points])

    const { y, ticks } = useMemo(() => {
        const values = all.flatMap((p) => [p.range.low, p.range.high])
        if (goal !== null) values.push(goal)
        const { min, max, step } = niceDomain(Math.min(...values), Math.max(...values))
        const ticks: number[] = []
        for (let v = min; v <= max + step / 2; v += step) ticks.push(v)
        return {
            ticks,
            y: (v: number) => PAD.top + (1 - (v - min) / (max - min)) * plotH,
        }
    }, [all, goal, plotH])

    const months = useMemo(() => monthTicks(origin, timeline.end), [origin, timeline.end])
    const todayX = x(timeline.start)
    const hasPast = origin < timeline.start

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.range.mid)}`).join(' ')
    const band =
        points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.range.high)}`).join(' ') +
        [...points]
            .reverse()
            .map((p) => `L${x(p.date)},${y(p.range.low)}`)
            .join(' ') +
        'Z'

    // What was logged, joined on to today so the two lines meet.
    const loggedLine = [...logged, points[0]]
        .map((p, i) => `${i ? 'L' : 'M'}${x(p.date)},${y(p.range.mid)}`)
        .join(' ')

    const last = points[points.length - 1]
    const hovered = active !== null ? all[active] : null

    function nearest(clientX: number) {
        const rect = wrap.current!.getBoundingClientRect()
        const px = clientX - rect.left
        let best = 0
        for (let i = 1; i < all.length; i++) {
            if (Math.abs(x(all[i].date) - px) < Math.abs(x(all[best].date) - px)) best = i
        }
        setActive(best)
    }

    function onKey(e: KeyboardEvent) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const from = active ?? logged.length
        setActive(Math.max(0, Math.min(all.length - 1, from + (e.key === 'ArrowRight' ? 1 : -1))))
    }

    const fmt = (v: number) => fmtNum(v, decimals)

    return (
        <div>
            <div ref={wrap} className="relative">
                <svg
                    width={width}
                    height={HEIGHT}
                    role="img"
                    aria-label={`Projected ${unit} from ${fmt(points[0].range.mid)} today to ${fmt(last.range.low)}–${fmt(last.range.high)} by ${fmtDate(timeline.end, true)}. Use the arrow keys to read each week.`}
                    tabIndex={0}
                    onKeyDown={onKey}
                    onPointerMove={(e: PointerEvent) => nearest(e.clientX)}
                    onPointerLeave={() => setActive(null)}
                    onBlur={() => setActive(null)}
                    className="block touch-pan-y outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-neutral-900"
                >
                    {/* The weeks already lived, shaded */}
                    {hasPast && (
                        <rect
                            x={PAD.left}
                            y={PAD.top}
                            width={Math.max(0, todayX - PAD.left)}
                            height={plotH}
                            className="fill-neutral-100"
                            rx={6}
                        />
                    )}

                    {/* Grid + y labels */}
                    {ticks.map((t) => (
                        <g key={t}>
                            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-neutral-200" strokeWidth={1} />
                            <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="nums fill-neutral-500 text-[11px]">
                                {fmtNum(t, decimals && Number.isInteger(t) ? 0 : decimals)}
                            </text>
                        </g>
                    ))}

                    {/* Month ticks */}
                    {months.map((m) => (
                        <text key={m.date} x={x(m.date)} y={HEIGHT - 8} textAnchor="middle" className="fill-neutral-500 text-[11px]">
                            {m.label}
                        </text>
                    ))}

                    {/* Goal */}
                    {goal !== null && (
                        <g>
                            <line
                                x1={PAD.left}
                                x2={width - PAD.right}
                                y1={y(goal)}
                                y2={y(goal)}
                                className="stroke-success"
                                strokeWidth={1}
                            />
                            <text x={width - PAD.right + 8} y={y(goal)} dy="0.32em" className="nums fill-success text-[11px] font-medium">
                                Goal {fmt(goal)}
                            </text>
                        </g>
                    )}

                    {/* Range + projection */}
                    <path d={band} className="fill-coral-500/10" />
                    <path d={line} fill="none" className="stroke-coral-500" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

                    {/* What was logged before today */}
                    {logged.length > 0 && (
                        <>
                            <path
                                d={loggedLine}
                                fill="none"
                                className="stroke-neutral-900"
                                strokeWidth={2}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                            {logged.map((p) => (
                                <circle key={p.date} cx={x(p.date)} cy={y(p.range.mid)} r={3} className="fill-neutral-900 stroke-white" strokeWidth={2} />
                            ))}
                        </>
                    )}

                    {/* You are here */}
                    <line x1={todayX} x2={todayX} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="stroke-coral-500" strokeWidth={1} />
                    <text
                        x={todayX}
                        y={PAD.top - 9}
                        textAnchor={todayX < PAD.left + 24 ? 'start' : 'middle'}
                        className="fill-coral-600 text-[11px] font-semibold"
                    >
                        You are here
                    </text>

                    {/* Today and the finish, ringed in the surface colour */}
                    <circle cx={x(points[0].date)} cy={y(points[0].range.mid)} r={4} className="fill-neutral-900 stroke-white" strokeWidth={2} />
                    <circle cx={x(last.date)} cy={y(last.range.mid)} r={4} className="fill-coral-500 stroke-white" strokeWidth={2} />
                    {(goal === null || Math.abs(y(goal) - y(last.range.mid)) > 14) && (
                        <text x={width - PAD.right + 8} y={y(last.range.mid)} dy="0.32em" className="nums fill-neutral-900 text-[12px] font-medium">
                            {fmt(last.range.mid)}
                        </text>
                    )}

                    {/* Crosshair */}
                    {hovered && (
                        <g pointerEvents="none">
                            <line
                                x1={x(hovered.date)}
                                x2={x(hovered.date)}
                                y1={PAD.top}
                                y2={HEIGHT - PAD.bottom}
                                className="stroke-neutral-400"
                                strokeWidth={1}
                            />
                            <circle
                                cx={x(hovered.date)}
                                cy={y(hovered.range.mid)}
                                r={4}
                                className={`${hovered.logged ? 'fill-neutral-900' : 'fill-coral-500'} stroke-white`}
                                strokeWidth={2}
                            />
                        </g>
                    )}
                </svg>

                {hovered && (
                    <div
                        className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl bg-white p-3 shadow-lg ring-1 ring-neutral-900/[0.06]"
                        style={tooltipPosition(x(hovered.date), width)}
                        role="status"
                    >
                        <p className="text-[12px] text-neutral-500">{hovered.label}</p>
                        <p className="nums mt-0.5 text-[15px] font-semibold text-neutral-900">
                            {fmt(hovered.range.mid)} {unit}
                        </p>
                        <p className="nums text-[12px] text-neutral-500">
                            {hovered.logged
                                ? 'Logged'
                                : hovered.range.high - hovered.range.low < 1e-6
                                  ? 'Today'
                                  : `Likely ${fmt(hovered.range.low)}–${fmt(hovered.range.high)}`}
                        </p>
                        {hovered.milestones.length > 0 && (
                            <ul className="mt-2 flex flex-col gap-1 border-t border-neutral-100 pt-2">
                                {hovered.milestones.slice(0, 3).map((m, i) => (
                                    <li key={i} className="truncate text-[12px] text-neutral-700">
                                        {m.title}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            <PlanLanes timeline={timeline} width={width} onPlan={onPlan} />
        </div>
    )
}

/** Training above nutrition, on the chart's own x-scale. */
function PlanLanes({
    timeline,
    width,
    onPlan,
}: {
    timeline: Timeline
    width: number
    onPlan?: (id: string) => void
}) {
    const total = Math.max(1, daysBetween(timeline.chainStart, timeline.end) + 1)
    const plotW = width - PAD.left - PAD.right
    const place = (start: string, end: string) => {
        const from = Math.max(0, daysBetween(timeline.chainStart, start))
        const to = Math.min(total, daysBetween(timeline.start, end) + 1)
        return { left: (from / total) * plotW, width: Math.max(4, ((to - from) / total) * plotW) }
    }
    const lanes = [
        { icon: 'fa-solid fa-dumbbell', label: 'Training', items: timeline.plans.filter((p) => p.type === 'training') },
        { icon: 'fa-solid fa-utensils', label: 'Nutrition', items: timeline.plans.filter((p) => p.type === 'nutrition') },
    ]
    return (
        <div className="mt-2 flex flex-col gap-1.5">
            {lanes.map((lane) => (
                <div key={lane.label} className="flex items-center" style={{ width }}>
                    <span
                        className="grid shrink-0 place-items-center text-[11px] text-neutral-400"
                        style={{ width: PAD.left }}
                        title={lane.label}
                    >
                        <i className={lane.icon} aria-hidden="true" />
                        <span className="sr-only">{lane.label}</span>
                    </span>
                    <div className="relative h-7" style={{ width: plotW }}>
                        <div className="absolute inset-0 rounded-md bg-neutral-100" />
                        {/* You are here, carried down through the lanes */}
                        <div
                            className="pointer-events-none absolute -inset-y-1 z-10 w-px bg-coral-500"
                            style={{ left: ((daysBetween(timeline.chainStart, timeline.start) + 0.5) / total) * plotW }}
                            aria-hidden="true"
                        />
                        {lane.items.map((p) => {
                            const pos = place(p.start, p.end)
                            const tone = p.kind ? PHASE_TONES[p.kind].bar : 'bg-brand-500'
                            return (
                                <button
                                    key={`${p.id}-${p.start}`}
                                    type="button"
                                    onClick={() => onPlan?.(p.id)}
                                    disabled={!onPlan}
                                    className={`absolute inset-y-0 flex items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[11px] font-medium text-white transition-[filter,box-shadow] hover:brightness-110 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-1 disabled:cursor-default ${tone}`}
                                    style={{ left: pos.left, width: pos.width }}
                                    title={`${p.name} · ${fmtDate(p.start)} – ${fmtDate(p.end, true)}`}
                                    aria-label={`Open ${p.name}`}
                                >
                                    <span className="truncate">{p.name}</span>
                                    {onPlan && pos.width > 90 && (
                                        <i className="fa-solid fa-chevron-right ml-auto shrink-0 text-[9px] opacity-70" aria-hidden="true" />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>
            ))}
        </div>
    )
}

function tooltipPosition(px: number, width: number) {
    const w = 224
    const left = px + 12 + w > width ? px - 12 - w : px + 12
    return { left: Math.max(0, left) }
}

/** A domain padded and snapped to 1, 2, 2.5 or 5 × 10ⁿ steps, ~4 gridlines. */
export function niceDomain(lo: number, hi: number): { min: number; max: number; step: number } {
    if (hi - lo < 1e-6) {
        lo -= 1
        hi += 1
    }
    const raw = (hi - lo) / 4
    const mag = Math.pow(10, Math.floor(Math.log10(raw)))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!
    return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step }
}

/** First of each month inside the window, thinned to fit. */
function monthTicks(start: string, end: string): { date: string; label: string }[] {
    const out: { date: string; label: string }[] = []
    let [y, m] = start.split('-').map(Number)
    for (;;) {
        m += 1
        if (m > 12) {
            m = 1
            y += 1
        }
        const date = `${y}-${String(m).padStart(2, '0')}-01`
        if (date > end) break
        out.push({
            date,
            label: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
        })
    }
    const every = Math.ceil(out.length / 8)
    return out.filter((_, i) => i % every === 0)
}
