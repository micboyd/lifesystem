import type { DailyForecast, HourlySlot } from '../../lib/weather'
import { hourLabel } from '../../lib/weather'
import { ConditionIcon } from './weatherUi'

// Chart band geometry (px): labels sit above each dot, so the curve starts low enough to leave room.
const CHART_H = 120
const CURVE_TOP = 48
const CURVE_BOTTOM = 100

/** Decimal hour of a "…T07:31" stamp. */
function decimalHour(iso?: string): number | null {
    if (!iso || !iso.includes('T')) return null
    const [h, m] = iso.split('T')[1].split(':').map(Number)
    return h + m / 60
}

/**
 * The next 24 hours as columns: time, sky, a temperature curve and rain bars.
 * Each column is one tap target that opens that hour's detail.
 *
 * The bands are drawn in percentages of the full width so the curve, the dots
 * and the columns line up whether the strip fills the card or scrolls.
 */
export default function HourStrip({
    hours,
    days,
    onSelect,
}: {
    hours: HourlySlot[]
    days: DailyForecast[]
    onSelect: (index: number) => void
}) {
    const n = hours.length
    if (n === 0) return null

    const temps = hours.map((h) => h.temperature)
    const max = Math.max(...temps)
    const min = Math.min(...temps)
    const span = Math.max(max - min, 4) // a flat day shouldn't read as a cliff
    const mid = (max + min) / 2
    const y = (t: number) => {
        const top = mid + span / 2
        return CURVE_TOP + ((top - t) / span) * (CURVE_BOTTOM - CURVE_TOP)
    }
    const x = (i: number) => ((i + 0.5) / n) * 100

    // Sunrise / sunset that land inside one of the columns.
    const sunEvents = new Map<number, { kind: 'sunrise' | 'sunset'; time: string }>()
    hours.forEach((h, i) => {
        const day = days.find((d) => d.date === h.date)
        for (const kind of ['sunrise', 'sunset'] as const) {
            const iso = day?.[kind]
            const dec = decimalHour(iso)
            if (dec != null && Math.floor(dec) === h.hour && iso) {
                sunEvents.set(i, { kind, time: iso.split('T')[1].slice(0, 5) })
            }
        }
    })

    return (
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            <div className="relative" style={{ minWidth: n * 56 }}>
                {/* Time + sky */}
                <div className="flex">
                    {hours.map((h, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center gap-4 pt-5">
                            <span
                                className={`text-xs ${
                                    i === 0 || h.hour === 0 ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-500'
                                }`}
                            >
                                {i === 0
                                    ? 'Now'
                                    : h.hour === 0
                                      ? new Date(`${h.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
                                      : hourLabel(h.hour)}
                            </span>
                            <ConditionIcon code={h.code} isDay={h.isDay} className="text-2xl" />
                        </div>
                    ))}
                </div>

                {/* Temperature curve */}
                <div className="relative" style={{ height: CHART_H }}>
                    <svg
                        className="absolute inset-0 h-full w-full overflow-visible"
                        viewBox={`0 0 100 ${CHART_H}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                    >
                        <polyline
                            points={hours.map((h, i) => `${x(i)},${y(h.temperature)}`).join(' ')}
                            fill="none"
                            className="stroke-neutral-300"
                            strokeWidth={2}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    </svg>
                    {hours.map((h, i) => (
                        <div key={i}>
                            <span
                                className="absolute -translate-x-1/2 text-[15px] font-semibold text-neutral-900"
                                style={{ left: `${x(i)}%`, top: y(h.temperature) - 34 }}
                            >
                                {h.temperature}°
                            </span>
                            <span
                                className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-neutral-400"
                                style={{ left: `${x(i)}%`, top: y(h.temperature) }}
                            />
                        </div>
                    ))}
                </div>

                {/* Rain chance */}
                <div className="flex">
                    {hours.map((h, i) => {
                        const p = h.precipitationProbability
                        return (
                            <div key={i} className="flex flex-1 flex-col items-center gap-2 pt-2 pb-5">
                                <div className="flex h-10 w-3.5 items-end overflow-hidden rounded-[4px] bg-neutral-100">
                                    {p > 0 && (
                                        <div
                                            className={`w-full ${p >= 40 ? 'bg-sky-500' : 'bg-sky-300'}`}
                                            style={{ height: `${Math.max(p, 6)}%` }}
                                        />
                                    )}
                                </div>
                                <span
                                    className={`text-[11px] tabular-nums ${
                                        p >= 40 ? 'font-semibold text-sky-600' : 'text-neutral-400'
                                    }`}
                                >
                                    {p}%
                                </span>
                                <span className="mt-3 h-4 text-[10px] font-medium text-neutral-500">
                                    {sunEvents.get(i) && (
                                        <>
                                            <i
                                                className={`fa-solid ${
                                                    sunEvents.get(i)!.kind === 'sunrise'
                                                        ? 'fa-sun text-amber-500'
                                                        : 'fa-moon text-indigo-400'
                                                } mr-0.5`}
                                                aria-hidden="true"
                                            />
                                            {sunEvents.get(i)!.time}
                                        </>
                                    )}
                                </span>
                            </div>
                        )
                    })}
                </div>

                {/* Tap targets laid over every band — one per hour. */}
                <div className="absolute inset-0 flex">
                    {hours.map((h, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onSelect(i)}
                            aria-label={`${i === 0 ? 'Now' : hourLabel(h.hour)}: ${h.temperature}°, ${h.precipitationProbability}% chance of rain`}
                            className={`flex-1 transition-colors hover:bg-neutral-900/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 ${
                                h.isDay ? '' : 'bg-indigo-950/[0.025]'
                            } ${h.hour === 0 && i > 0 ? 'border-l border-dashed border-neutral-200' : ''}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
