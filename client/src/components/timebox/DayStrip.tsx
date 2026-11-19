import { useRef, useState, type PointerEvent } from 'react'
import { CATEGORY_STYLE } from './timeboxStyles'
import { blockLength, placeAt, stripSegments, type WorkWindow } from '../../lib/timebox'
import { timeToMinutes } from '../../lib/time'
import type { Timebox } from '../../types'

interface Props {
    items: Timebox[]
    bounds: { start: number; end: number }
    /** Working hours on this day, drawn as a pale band under the blocks. */
    work: WorkWindow | null
    /** Minutes since midnight when the day shown is today, else null. */
    nowMin: number | null
    onOpen: (item: Timebox) => void
    /** Drag one of your own blocks along the bar to land at `startMin`. */
    onMove?: (item: Timebox, startMin: number) => void
}

/** Drag steps, in minutes. */
const SNAP = 5

/**
 * The whole day in one bar: each block in its colour, a coral tick for now.
 * Your own blocks can be dragged along it, in 5-minute steps; a tap opens one.
 */
export default function DayStrip({ items, bounds, work, nowMin, onOpen, onMove }: Props) {
    const span = bounds.end - bounds.start
    const barRef = useRef<HTMLDivElement>(null)
    const [drag, setDrag] = useState<{
        item: Timebox
        x0: number
        delta: number
        moved: boolean
    } | null>(null)

    function down(e: PointerEvent, item: Timebox) {
        if (e.button !== 0) return
        if (!onMove || item.source) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ item, x0: e.clientX, delta: 0, moved: false })
    }
    function move(e: PointerEvent) {
        if (!drag || !barRef.current) return
        const dx = e.clientX - drag.x0
        const perPx = span / barRef.current.getBoundingClientRect().width
        const delta = Math.round((dx * perPx) / SNAP) * SNAP
        setDrag({ ...drag, delta, moved: drag.moved || Math.abs(dx) > 3 })
    }
    function up(item: Timebox) {
        const d = drag
        setDrag(null)
        if (d?.moved) {
            if (d.delta) onMove?.(item, timeToMinutes(item.startTime) + d.delta)
        } else onOpen(item)
    }
    const preview = drag?.moved
        ? placeAt(timeToMinutes(drag.item.startTime) + drag.delta, blockLength(drag.item))
        : null
    // In start order; `over` marks a block that starts inside an earlier one.
    const segments = stripSegments(items, bounds)
    // Hour labels at the ends and roughly every quarter between.
    const step = Math.max(1, Math.round(span / 60 / 4)) * 60
    const labels: number[] = []
    for (let m = bounds.start; m < bounds.end; m += step) labels.push(m)
    labels.push(bounds.end)
    const showNow = nowMin !== null && nowMin >= bounds.start && nowMin <= bounds.end

    return (
        <div>
            <div
                ref={barRef}
                className="relative h-4 overflow-hidden rounded-full bg-surface-muted"
            >
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
                            className="pointer-events-none absolute inset-y-0 bg-sky-100"
                            style={{
                                left: `${((s - bounds.start) / span) * 100}%`,
                                width: `${((e - s) / span) * 100}%`,
                            }}
                            aria-hidden="true"
                        />
                    ))}
                {segments.map(({ item, left: baseLeft, width, over }) => {
                    // A block that starts inside an earlier one shows through as
                    // the lower half of the bar, outlined so both stay visible.
                    const dragged = drag?.item === item && !!preview
                    const left = dragged
                        ? ((timeToMinutes(preview!.startTime) - bounds.start) / span) * 100
                        : baseLeft
                    const canMove = !!onMove && !item.source
                    return (
                        <button
                            key={item._id + item.startTime}
                            type="button"
                            // Pointer taps open from `up`; this is for the keyboard.
                            onClick={(e) => e.detail === 0 && onOpen(item)}
                            onPointerDown={(e) => (canMove ? down(e, item) : undefined)}
                            onPointerMove={move}
                            onPointerUp={() => (canMove ? up(item) : onOpen(item))}
                            onPointerCancel={() => setDrag(null)}
                            aria-label={`${item.title}, ${item.startTime} to ${item.endTime}`}
                            className={[
                                'absolute',
                                over && !dragged
                                    ? 'top-1/2 bottom-0 z-10 ring-1 ring-canvas'
                                    : 'inset-y-0',
                                dragged ? 'z-30 ring-2 ring-neutral-950' : '',
                                CATEGORY_STYLE[item.category ?? 'none'].solid,
                                canMove ? 'cursor-grab touch-none active:cursor-grabbing' : '',
                                'transition-opacity hover:opacity-80',
                            ].join(' ')}
                            style={{ left: `${left}%`, width: `${width}%` }}
                        />
                    )
                })}
                {showNow && (
                    <span
                        className="pointer-events-none absolute inset-y-0 z-20 w-[2px] -translate-x-1/2 bg-coral-500 ring-2 ring-canvas"
                        style={{ left: `${((nowMin! - bounds.start) / span) * 100}%` }}
                        aria-hidden="true"
                    />
                )}
            </div>
            <div className="relative mt-2 h-4 text-[11px] nums text-neutral-500">
                {preview && (
                    <span
                        className="absolute -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-950 px-1.5 font-medium text-white"
                        style={{
                            left: `${Math.min(92, Math.max(8, ((timeToMinutes(preview.startTime) - bounds.start) / span) * 100))}%`,
                        }}
                    >
                        {preview.startTime} – {preview.endTime}
                    </span>
                )}
                {!preview &&
                    labels.map((m, i) => (
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
