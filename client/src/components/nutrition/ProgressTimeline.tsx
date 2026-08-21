import { useMemo } from 'react'
import { useProgressPhoto } from './useProgressPhoto'
import { PHOTO_VIEWS, RATING_LABELS, type PhotoView } from '../../types'
import type { ProgressCheckIn, ProgressPhoto, WeightLog } from '../../types'
import { longDate } from './format'

/**
 * The check-ins, in order.
 *
 * Deliberately *not* every weigh-in. A daily scale reading belongs on the trend
 * chart, where the noise averages out; a timeline of 200 near-identical numbers
 * would bury the thing it exists to show. What lands here is a check: a day that
 * carried a waist measurement, a body-fat reading, photos or a written check-in
 * — the days you deliberately stopped and took stock.
 *
 * Seeing those a month apart, side by side with the photos, is the most
 * motivating view in the module and the hardest to reconstruct from a chart.
 */

/** A single check, assembled from whatever was recorded that day. */
interface Entry {
    date: string
    weight?: number
    waist?: number
    bodyFat?: number
    photos: Map<PhotoView, ProgressPhoto>
    checkIn: ProgressCheckIn | null
}

/** A thumbnail small enough that a year of them still loads sensibly. */
function Thumb({ photo }: { photo: ProgressPhoto }) {
    const { url } = useProgressPhoto(photo._id)
    return (
        <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {url && <img src={url} alt="" className="h-full w-full object-cover" />}
        </div>
    )
}

export default function ProgressTimeline({
    logs,
    photos,
    checkIns,
}: {
    logs: WeightLog[]
    photos: ProgressPhoto[]
    checkIns: ProgressCheckIn[]
}) {
    const entries = useMemo(() => {
        const byDate = new Map<string, Entry>()

        const ensure = (date: string): Entry => {
            const existing = byDate.get(date)
            if (existing) return existing
            const fresh: Entry = { date, photos: new Map(), checkIn: null }
            byDate.set(date, fresh)
            return fresh
        }

        // A weigh-in only earns a place if it carried more than the scale — the
        // tape, the body-fat reading, or a note about it.
        for (const log of logs) {
            if (log.waist === undefined && log.bodyFat === undefined) continue
            const entry = ensure(log.date)
            entry.weight = log.weight
            entry.waist = log.waist
            entry.bodyFat = log.bodyFat
        }
        for (const photo of photos) ensure(photo.date).photos.set(photo.view, photo)
        for (const checkIn of checkIns) ensure(checkIn.date).checkIn = checkIn

        // Fill in the weight for photo- or check-in-only days, so a row never
        // shows photos beside a blank.
        for (const entry of byDate.values()) {
            if (entry.weight === undefined) {
                entry.weight = logs.find((l) => l.date === entry.date)?.weight
            }
        }

        return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
    }, [logs, photos, checkIns])

    if (entries.length === 0) {
        return (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Timeline</h3>
                <p className="mt-2 text-sm text-neutral-400">
                    No checks yet. A waist measurement, a body-fat reading, photos or a monthly
                    check-in all put a marker here.
                </p>
            </div>
        )
    }

    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Timeline</h3>
                <span className="text-[11px] text-neutral-400">
                    {entries.length} check{entries.length === 1 ? '' : 's'} · newest first
                </span>
            </div>

            <ol className="mt-4 flex flex-col">
                {entries.map((entry, i) => (
                    <li
                        key={entry.date}
                        className={`flex gap-4 py-4 ${i > 0 ? 'border-t border-neutral-100' : ''}`}
                    >
                        <div className="w-20 shrink-0">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">
                                {longDate(entry.date).replace(/ \d{4}$/, '')}
                            </p>
                            <p className="text-[10px] text-neutral-400">{entry.date.slice(0, 4)}</p>
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                                {entry.weight !== undefined && (
                                    <span className="text-sm font-bold text-neutral-900">
                                        {entry.weight.toFixed(1)} kg
                                    </span>
                                )}
                                {entry.waist !== undefined && (
                                    <span className="text-sm font-semibold text-neutral-600">
                                        {entry.waist.toFixed(1)} cm waist
                                    </span>
                                )}
                                {entry.bodyFat !== undefined && (
                                    <span className="text-sm font-semibold text-neutral-500">
                                        {entry.bodyFat.toFixed(1)}%
                                        <span className="ml-1 text-[10px] font-medium text-neutral-400">
                                            est.
                                        </span>
                                    </span>
                                )}
                            </div>

                            {entry.checkIn && (
                                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
                                    {entry.checkIn.clothesFit && (
                                        <span>Clothes {entry.checkIn.clothesFit}</span>
                                    )}
                                    {(['energy', 'recovery', 'trainingFeel'] as const).map((f) =>
                                        entry.checkIn![f] !== undefined ? (
                                            <span key={f}>
                                                {RATING_LABELS[f]} {entry.checkIn![f]}/5
                                            </span>
                                        ) : null
                                    )}
                                </p>
                            )}

                            {entry.checkIn?.notes && (
                                <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-600">
                                    {entry.checkIn.notes}
                                </p>
                            )}

                            {entry.photos.size > 0 && (
                                <div className="mt-2 flex gap-2">
                                    {PHOTO_VIEWS.map((view) => {
                                        const photo = entry.photos.get(view)
                                        return photo ? <Thumb key={view} photo={photo} /> : null
                                    })}
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    )
}
