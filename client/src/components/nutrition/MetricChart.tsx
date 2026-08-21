import { daysBetween } from '../../lib/weightTrend'

/**
 * One measurement over time, drawn the way the bodyweight chart already is: a
 * fixed viewBox scaled to its container, with the x-axis as real elapsed time
 * rather than point index — so a month without a reading reads as a month
 * without a reading, not as a steady run of them.
 *
 * Sparse data is the normal case here. Waist gets measured weekly at best, so
 * the points are drawn as points and the line only joins what actually exists.
 * Nothing is interpolated to make the line look smoother than the measuring was.
 */

const CHART_W = 720
const CHART_H = 180
const PAD_X = 8
const PAD_Y = 14

export interface ChartPoint {
    date: string
    value: number
}

export default function MetricChart({
    points,
    unit,
    label,
    /** A second, smoother series drawn prominently over the raw points. */
    trend,
    /** A horizontal marker, e.g. the goal weight. */
    target,
    targetLabel,
    tone = 'stroke-coral-500',
}: {
    points: ChartPoint[]
    unit: string
    label: string
    trend?: ChartPoint[]
    target?: number
    targetLabel?: string
    tone?: string
}) {
    if (points.length < 2) {
        return (
            <p className="py-8 text-center text-sm text-neutral-400">
                {points.length === 0
                    ? 'No readings yet.'
                    : 'One more reading and the line appears.'}
            </p>
        )
    }

    const first = points[0].date
    const last = points[points.length - 1].date
    const span = Math.max(1, daysBetween(first, last))

    const values = points.map((p) => p.value)
    if (trend) values.push(...trend.map((p) => p.value))
    if (target !== undefined) values.push(target)
    const min = Math.min(...values)
    const max = Math.max(...values)
    // A floor on the range keeps a nearly-flat series from being amplified into
    // dramatic peaks by autoscaling — which would be a lie about the data.
    const range = Math.max(0.5, max - min)

    const x = (date: string) => PAD_X + (daysBetween(first, date) / span) * (CHART_W - PAD_X * 2)
    const y = (v: number) => PAD_Y + (1 - (v - min) / range) * (CHART_H - PAD_Y * 2)

    const line = (series: ChartPoint[]) =>
        series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.date)},${y(p.value)}`).join(' ')

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="h-44 w-full min-w-[20rem]"
                role="img"
                aria-label={`${label} over time`}
            >
                {target !== undefined && (
                    <>
                        <line
                            x1={PAD_X}
                            x2={CHART_W - PAD_X}
                            y1={y(target)}
                            y2={y(target)}
                            className="stroke-emerald-500"
                            strokeWidth={1}
                            strokeDasharray="4 4"
                        />
                        {targetLabel && (
                            <text
                                x={CHART_W - PAD_X}
                                y={y(target) - 5}
                                textAnchor="end"
                                className="fill-emerald-600 text-[10px] font-semibold"
                            >
                                {targetLabel}
                            </text>
                        )}
                    </>
                )}

                {/* Raw readings sit behind the trend, deliberately quiet. */}
                {points.map((p) => (
                    <circle
                        key={p.date}
                        cx={x(p.date)}
                        cy={y(p.value)}
                        r={2}
                        className={trend ? 'fill-neutral-300' : 'fill-neutral-400'}
                    />
                ))}

                <path
                    d={line(trend ?? points)}
                    fill="none"
                    className={tone}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            </svg>
            <div className="flex justify-between px-1 text-[11px] tabular-nums text-neutral-400">
                <span>
                    {points[0].value.toFixed(1)} {unit}
                </span>
                <span>
                    {points[points.length - 1].value.toFixed(1)} {unit}
                </span>
            </div>
        </div>
    )
}
