import { useEffect, useMemo, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import DatePicker from '../DatePicker'
import { resizeImage } from './resizeImage'
import { useProgressPhoto } from './useProgressPhoto'
import { savePhoto, deletePhoto } from '../../services/progress'
import {
    CLOTHES_FITS,
    MEASUREMENT_FIELDS,
    MEASUREMENT_LABELS,
    PHOTO_VIEWS,
    PHOTO_VIEW_LABELS,
    RATING_FIELDS,
    RATING_LABELS,
} from '../../types'
import type {
    ClothesFit,
    MeasurementField,
    PhotoView,
    ProgressCheckIn,
    ProgressCheckInInput,
    ProgressPhoto,
    WeightLog,
} from '../../types'
import type { WeightLogPayload } from '../../services/weightLogs'

/**
 * Logging a progress check.
 *
 * Two modes, because two very different things are being asked for. The weekly
 * one is three boxes and a Save — weight, waist, body fat — and has to be
 * finishable in about ten seconds, because a weekly habit that takes two minutes
 * is a weekly habit that lasts a month. The monthly one adds photos and the
 * subjective questions.
 *
 * Nothing is required beyond the date. A check with a waist measurement and
 * nothing else is a perfectly good check, and demanding the full set is how the
 * cadence quietly dies.
 */

type Mode = 'weekly' | 'monthly'

/** The circumferences beyond waist, hidden behind a disclosure. */
const EXTRA_MEASUREMENTS = MEASUREMENT_FIELDS.filter((f) => f !== 'waist')

const CLOTHES_LABELS: Record<ClothesFit, string> = {
    tighter: 'Tighter',
    same: 'Same',
    looser: 'Looser',
}

/** What each end of a 1–5 rating means, so the numbers aren't arbitrary. */
const RATING_SCALE: Record<(typeof RATING_FIELDS)[number], [string, string]> = {
    hunger: ['Ravenous', 'Comfortable'],
    energy: ['Flat', 'Excellent'],
    recovery: ['Wrecked', 'Fully recovered'],
    trainingFeel: ['Going backwards', 'Strong'],
}

/** A 1–5 picker. Five buttons beats a slider for something answered in a second. */
function Rating({
    label,
    scale,
    value,
    onChange,
}: {
    label: string
    scale: [string, string]
    value: number | undefined
    onChange: (v: number | undefined) => void
}) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</p>
            <div className="mt-1.5 flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        aria-label={`${label}: ${n} of 5`}
                        aria-pressed={value === n}
                        // Tapping the current value clears it — there is no way
                        // back to "not answered" otherwise.
                        onClick={() => onChange(value === n ? undefined : n)}
                        className={`h-9 flex-1 rounded-lg text-sm font-semibold transition-colors ${
                            value === n
                                ? 'bg-neutral-900 text-white'
                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                        }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
                <span>{scale[0]}</span>
                <span>{scale[1]}</span>
            </div>
        </div>
    )
}

/** One photo slot: shows what's there, or takes a new one. */
function PhotoSlot({
    view,
    existing,
    date,
    onSaved,
    onRemoved,
}: {
    view: PhotoView
    existing: ProgressPhoto | null
    date: string
    onSaved: (photo: ProgressPhoto) => void
    onRemoved: (id: string) => void
}) {
    const { url, loading } = useProgressPhoto(existing?._id)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function choose(file: File | undefined) {
        if (!file) return
        setError('')
        setBusy(true)
        try {
            const dataUri = await resizeImage(file)
            onSaved(await savePhoto(date, view, dataUri))
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not save that photo.')
        } finally {
            setBusy(false)
        }
    }

    async function remove() {
        if (!existing) return
        setBusy(true)
        try {
            await deletePhoto(existing._id)
            onRemoved(existing._id)
        } catch {
            setError('Could not remove that photo.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="min-w-0">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {PHOTO_VIEW_LABELS[view]}
            </p>
            <label className="relative block aspect-[3/4] cursor-pointer overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 transition-colors hover:border-neutral-400">
                {url ? (
                    <img src={url} alt={`${PHOTO_VIEW_LABELS[view]} view`} className="h-full w-full object-cover" />
                ) : (
                    <span className="grid h-full place-items-center text-center text-[11px] text-neutral-400">
                        {busy || loading ? 'Working…' : 'Add photo'}
                    </span>
                )}
                <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => choose(e.target.files?.[0])}
                />
            </label>
            {existing && (
                <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    className="mt-1 text-[11px] font-semibold text-neutral-400 underline hover:text-red-500"
                >
                    Remove
                </button>
            )}
            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
    )
}

export default function ProgressCheckDrawer({
    open,
    mode,
    date: initialDate,
    logs,
    checkIns,
    photos,
    onClose,
    onSaveWeighIn,
    onSaveCheckIn,
    onPhotosChanged,
}: {
    open: boolean
    mode: Mode
    date: string
    /**
     * The full history, not just the chosen day's record. The date is editable
     * in here, and a submission replaces the whole reading for its date — so the
     * form has to re-read whichever day is currently selected, or backdating a
     * check would blank out what that day already held.
     */
    logs: WeightLog[]
    checkIns: ProgressCheckIn[]
    photos: ProgressPhoto[]
    onClose: () => void
    onSaveWeighIn: (payload: WeightLogPayload) => Promise<void>
    onSaveCheckIn: (input: ProgressCheckInInput) => Promise<void>
    onPhotosChanged: () => void
}) {
    const [date, setDate] = useState(initialDate)
    const [weight, setWeight] = useState('')
    const [bodyFat, setBodyFat] = useState('')
    const [measures, setMeasures] = useState<Record<string, string>>({})
    const [showExtra, setShowExtra] = useState(false)
    const [clothesFit, setClothesFit] = useState<ClothesFit | undefined>()
    const [ratings, setRatings] = useState<Record<string, number | undefined>>({})
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const weighIn = useMemo(() => logs.find((l) => l.date === date) ?? null, [logs, date])
    const checkIn = useMemo(() => checkIns.find((c) => c.date === date) ?? null, [checkIns, date])

    // Reset the date to today's each time the drawer opens.
    useEffect(() => {
        if (open) setDate(initialDate)
    }, [open, initialDate])

    // Refill from whatever that date already holds — on open, and again whenever
    // the date changes — so a reopened or backdated check edits rather than
    // silently replacing.
    useEffect(() => {
        if (!open) return
        setWeight(weighIn?.weight?.toString() ?? '')
        setBodyFat(weighIn?.bodyFat?.toString() ?? '')
        setMeasures(
            Object.fromEntries(
                MEASUREMENT_FIELDS.map((f) => [f, weighIn?.[f]?.toString() ?? ''])
            )
        )
        setClothesFit(checkIn?.clothesFit)
        setRatings(Object.fromEntries(RATING_FIELDS.map((f) => [f, checkIn?.[f]])))
        setNotes(checkIn?.notes ?? '')
        setShowExtra(EXTRA_MEASUREMENTS.some((f) => weighIn?.[f] !== undefined))
        setError('')
    }, [open, weighIn, checkIn])

    const photosByView = useMemo(() => {
        const map = new Map<PhotoView, ProgressPhoto>()
        for (const p of photos) if (p.date === date) map.set(p.view, p)
        return map
    }, [photos, date])

    function readNumber(value: string): number | undefined {
        if (!value.trim()) return undefined
        const n = Number(value)
        return Number.isFinite(n) && n > 0 ? n : undefined
    }

    async function submit() {
        setError('')
        const kg = readNumber(weight)

        const anyMeasure = MEASUREMENT_FIELDS.some((f) => readNumber(measures[f]) !== undefined)
        if (kg === undefined && anyMeasure) {
            // The weigh-in record is keyed on weight, so a measurement cannot be
            // saved without one. Better to say so than to drop it silently.
            setError('Add a weight to save measurements against.')
            return
        }

        setBusy(true)
        try {
            if (kg !== undefined) {
                await onSaveWeighIn({
                    date,
                    weight: kg,
                    bodyFat: readNumber(bodyFat),
                    ...Object.fromEntries(
                        MEASUREMENT_FIELDS.map((f) => [f, readNumber(measures[f])])
                    ),
                    notes: weighIn?.notes,
                })
            }

            if (mode === 'monthly') {
                await onSaveCheckIn({
                    date,
                    clothesFit,
                    ...Object.fromEntries(RATING_FIELDS.map((f) => [f, ratings[f]])),
                    notes: notes.trim() || undefined,
                })
            }
            onClose()
        } catch {
            setError('Could not save that.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={mode === 'weekly' ? 'Weekly check-in' : 'Progress check'}
            size={mode === 'weekly' ? 'lg' : 'xl'}
            footer={
                <div className="flex flex-col gap-2">
                    {error && <p className="text-xs text-red-600">{error}</p>}
                    <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={submit} disabled={busy}>
                            {busy ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-5">
                <div>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Date
                    </p>
                    <DatePicker value={date} onChange={(v) => typeof v === 'string' && setDate(v)} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <Input
                        label="Weight (kg)"
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        placeholder="100.8"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                    />
                    <Input
                        label="Waist (cm)"
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        placeholder="108.4"
                        value={measures.waist ?? ''}
                        onChange={(e) => setMeasures((m) => ({ ...m, waist: e.target.value }))}
                    />
                    <Input
                        label="Body fat (%)"
                        type="number"
                        step="0.1"
                        inputMode="decimal"
                        placeholder="26.7"
                        value={bodyFat}
                        onChange={(e) => setBodyFat(e.target.value)}
                    />
                </div>

                <p className="-mt-2 text-[11px] leading-relaxed text-neutral-400">
                    Measure the waist around the navel, relaxed, at the same time of day — the
                    consistency matters more than the exact spot. Once a week is plenty.
                </p>

                {/* The rest of the tape work, out of the way until wanted. */}
                <div>
                    <button
                        type="button"
                        onClick={() => setShowExtra((v) => !v)}
                        className="text-[11px] font-semibold text-neutral-500 underline"
                    >
                        {showExtra ? 'Hide' : 'Add'} other measurements
                    </button>
                    {showExtra && (
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            {EXTRA_MEASUREMENTS.map((field: MeasurementField) => (
                                <Input
                                    key={field}
                                    label={`${MEASUREMENT_LABELS[field]} (cm)`}
                                    type="number"
                                    step="0.1"
                                    inputMode="decimal"
                                    value={measures[field] ?? ''}
                                    onChange={(e) =>
                                        setMeasures((m) => ({ ...m, [field]: e.target.value }))
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>

                {mode === 'monthly' && (
                    <>
                        <div className="border-t border-neutral-100 pt-5">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Photos
                            </p>
                            <div className="grid grid-cols-3 gap-3">
                                {PHOTO_VIEWS.map((view) => (
                                    <PhotoSlot
                                        key={view}
                                        view={view}
                                        date={date}
                                        existing={photosByView.get(view) ?? null}
                                        onSaved={onPhotosChanged}
                                        onRemoved={onPhotosChanged}
                                    />
                                ))}
                            </div>
                            <p className="mt-2 text-[11px] text-neutral-400">
                                Same spot, same light, same time of day. Photos are private to your
                                account and are never shared anywhere.
                            </p>
                        </div>

                        <div className="border-t border-neutral-100 pt-5">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                How is it going?
                            </p>
                            <div className="flex flex-col gap-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Clothes fit
                                    </p>
                                    <div className="mt-1.5 flex gap-1.5">
                                        {CLOTHES_FITS.map((fit) => (
                                            <button
                                                key={fit}
                                                type="button"
                                                aria-pressed={clothesFit === fit}
                                                onClick={() =>
                                                    setClothesFit(clothesFit === fit ? undefined : fit)
                                                }
                                                className={`h-9 flex-1 rounded-lg text-sm font-semibold transition-colors ${
                                                    clothesFit === fit
                                                        ? 'bg-neutral-900 text-white'
                                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                                }`}
                                            >
                                                {CLOTHES_LABELS[fit]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {RATING_FIELDS.map((field) => (
                                    <Rating
                                        key={field}
                                        label={RATING_LABELS[field]}
                                        scale={RATING_SCALE[field]}
                                        value={ratings[field]}
                                        onChange={(v) => setRatings((r) => ({ ...r, [field]: v }))}
                                    />
                                ))}

                                <Textarea
                                    label="Notes"
                                    rows={3}
                                    placeholder="Anything worth remembering about this month."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                />
                            </div>
                            <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
                                These ratings are context for reading your progress. They never move
                                your calorie target on their own.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </Drawer>
    )
}
