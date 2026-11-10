import { CATEGORY_STYLE } from './timeboxStyles'
import { stripSegments, type WorkWindow } from '../../lib/timebox'
import type { Timebox } from '../../types'

interface Props {
    items: Timebox[]
    bounds: { start: number; end: number }
    /** Working hours on this day, drawn as a pale band under the blocks. */
    work: WorkWindow | null
    /** Minutes since midnight when the day shown is today, else null. */
    nowMin: number | null
    onOpen: (item: Timebox) => void
}

/** The whole day in one bar: each block in its colour, a coral tick for now. */
export default function DayStrip({ items, bounds, work, nowMin, onOpen }: Props) {
    const span = bounds.end - bounds.start
    const segments = stripSegments(items, bounds)
    // Hour labels at the ends and roughly every quarter between.
    const step = Math.max(1, Math.round(span / 60 / 4)) * 60
    const labels: number[] = []
    for (let m = bounds.start; m < bounds.end; m += step) labels.push(m)
    labels.push(bounds.end)
    const showNow = nowMin !== null && nowMin >= bounds.start && nowMin <= bounds.end

    return (
        <div>
            <div className="relative h-4 overflow-hidden rounded-full bg-neutral-200">
                {work &&
                    (work.lunch
                        ? [
                              [work.start, work.lunch.start],
                              [work.lunch.end, work.end],
                          ]
                        : [[work.start, work.end]]
                    ).map(([s, e]) => (
                        <span
                            key={s}
                            className="pointer-events-none absolute inset-y-0 bg-sky-200"
                            style={{ left: `${((s - bounds.start) / span) * 100}%`, width: `${((e - s) / span) * 100}%` }}
                            aria-hidden="true"
                        />
                    ))}
                {segments.map(({ item, left, width }) => (
                    <button
                        key={item._id + item.startTime}
                        type="button"
                        onClick={() => onOpen(item)}
                        aria-label={`${item.title}, ${item.startTime} to ${item.endTime}`}
                        className={`absolute inset-y-0 ${CATEGORY_STYLE[item.category ?? 'none'].solid} transition-opacity hover:opacity-80`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                    />
                ))}
                {showNow && (
                    <span
                        className="pointer-events-none absolute inset-y-0 w-[3px] -translate-x-1/2 bg-coral-500 ring-2 ring-white"
                        style={{ left: `${((nowMin! - bounds.start) / span) * 100}%` }}
                        aria-hidden="true"
                    />
                )}
            </div>
            <div className="relative mt-1.5 h-4 text-[11px] font-medium nums text-neutral-500">
                {labels.map((m, i) => (
                    <span
                        key={m}
                        className={`absolute ${i === 0 ? '' : i === labels.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
                        style={{ left: `${((m - bounds.start) / span) * 100}%` }}
                    >
                        {String(Math.floor(m / 60) % 24).padStart(2, '0')}
                    </span>
                ))}
            </div>
        </div>
    )
}
