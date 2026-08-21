import { useMemo, useState } from 'react'
import Select from '../Select'
import { useProgressPhoto } from './useProgressPhoto'
import { PHOTO_VIEWS, PHOTO_VIEW_LABELS } from '../../types'
import type { PhotoView, ProgressPhoto, WeightLog } from '../../types'
import { longDate, shortDate } from './format'

/**
 * Before and after.
 *
 * Side by side rather than a slider: a slider is a nicer demo and a worse tool.
 * Comparing two bodies means looking back and forth between them, which two
 * static images let you do and a wipe does not — and it works on a phone,
 * without drag handling, without a library, and without a failure mode.
 *
 * The numbers underneath matter as much as the pictures. Photos taken three
 * months apart in different light are easy to misread in either direction; the
 * weight and waist figures for those two dates are what anchor them.
 */

/** One image, fetched through the authenticated client. */
function Photo({ id, alt }: { id: string | undefined; alt: string }) {
    const { url, loading, failed } = useProgressPhoto(id)

    if (!id) {
        return (
            <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-[11px] text-neutral-300">
                No photo
            </div>
        )
    }
    if (failed) {
        return (
            <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 text-[11px] text-neutral-400">
                Could not load
            </div>
        )
    }
    return (
        <div className="aspect-[3/4] overflow-hidden rounded-xl bg-neutral-100">
            {url ? (
                <img src={url} alt={alt} className="h-full w-full object-cover" />
            ) : (
                <div className="grid h-full place-items-center text-[11px] text-neutral-300">
                    {loading ? 'Loading…' : ''}
                </div>
            )}
        </div>
    )
}

/** A metric on both dates, with the change between them. */
function CompareStat({
    label,
    from,
    to,
    unit,
    decimals = 1,
    estimate = false,
}: {
    label: string
    from: number | undefined
    to: number | undefined
    unit: string
    decimals?: number
    estimate?: boolean
}) {
    const known = from !== undefined && to !== undefined
    const change = known ? to - from : null
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
                {estimate && <span className="ml-1 font-medium normal-case">· estimate</span>}
            </p>
            {known ? (
                <>
                    <p className="mt-0.5 truncate text-sm font-bold tabular-nums text-neutral-900">
                        {from.toFixed(decimals)} → {to.toFixed(decimals)} {unit}
                    </p>
                    <p className="text-[11px] font-semibold tabular-nums text-neutral-500">
                        {change! < 0 ? '−' : change! > 0 ? '+' : ''}
                        {Math.abs(change!).toFixed(decimals)} {unit}
                    </p>
                </>
            ) : (
                <p className="mt-0.5 text-sm font-bold text-neutral-300">No data</p>
            )}
        </div>
    )
}

export default function ProgressPhotos({
    photos,
    logs,
}: {
    photos: ProgressPhoto[]
    logs: WeightLog[]
}) {
    /** The dates that actually have photos, newest first for the pickers. */
    const dates = useMemo(
        () => [...new Set(photos.map((p) => p.date))].sort().reverse(),
        [photos]
    )

    const [from, setFrom] = useState<string>('')
    const [to, setTo] = useState<string>('')

    // Default to the widest comparison available — the first and last sessions,
    // which is the one worth seeing.
    const fromDate = from || dates[dates.length - 1] || ''
    const toDate = to || dates[0] || ''

    const byDate = useMemo(() => {
        const map = new Map<string, Map<PhotoView, ProgressPhoto>>()
        for (const p of photos) {
            const forDate = map.get(p.date) ?? new Map<PhotoView, ProgressPhoto>()
            forDate.set(p.view, p)
            map.set(p.date, forDate)
        }
        return map
    }, [photos])

    const logFor = (date: string) => logs.find((l) => l.date === date)
    const fromLog = logFor(fromDate)
    const toLog = logFor(toDate)

    if (dates.length === 0) {
        return (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Progress photos</h3>
                <p className="mt-2 text-sm text-neutral-400">
                    No photos yet. Take front, side and back shots once a month — same spot, same
                    light — and the comparison builds itself.
                </p>
            </div>
        )
    }

    const options = dates.map((d) => ({ value: d, label: shortDate(d) }))

    return (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-black/[0.06]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-sm font-bold tracking-tight text-neutral-900">Progress photos</h3>
                {dates.length > 1 && (
                    <div className="flex items-end gap-2">
                        <div className="w-32">
                            <Select
                                label="From"
                                options={options}
                                value={fromDate}
                                onChange={setFrom}
                            />
                        </div>
                        <div className="w-32">
                            <Select label="To" options={options} value={toDate} onChange={setTo} />
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4">
                <p className="text-[11px] font-semibold text-neutral-500">{longDate(fromDate)}</p>
                <p className="text-[11px] font-semibold text-neutral-500">{longDate(toDate)}</p>
            </div>

            <div className="mt-2 flex flex-col gap-4">
                {PHOTO_VIEWS.map((view) => {
                    const a = byDate.get(fromDate)?.get(view)
                    const b = byDate.get(toDate)?.get(view)
                    if (!a && !b) return null
                    return (
                        <div key={view}>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                {PHOTO_VIEW_LABELS[view]}
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <Photo
                                    id={a?._id}
                                    alt={`${PHOTO_VIEW_LABELS[view]} view, ${longDate(fromDate)}`}
                                />
                                <Photo
                                    id={b?._id}
                                    alt={`${PHOTO_VIEW_LABELS[view]} view, ${longDate(toDate)}`}
                                />
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* What the pictures can't tell you on their own. */}
            {fromDate !== toDate && (
                <div className="mt-5 grid grid-cols-3 gap-4 border-t border-neutral-100 pt-4">
                    <CompareStat
                        label="Weight"
                        from={fromLog?.weight}
                        to={toLog?.weight}
                        unit="kg"
                    />
                    <CompareStat label="Waist" from={fromLog?.waist} to={toLog?.waist} unit="cm" />
                    <CompareStat
                        label="Body fat"
                        from={fromLog?.bodyFat}
                        to={toLog?.bodyFat}
                        unit="%"
                        estimate
                    />
                </div>
            )}
        </div>
    )
}
