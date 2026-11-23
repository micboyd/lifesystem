import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Surface, PanelHeader } from './stats/ui'
import PillToggle from './PillToggle'
import Button from './Button'
import DatePicker from './DatePicker'
import Textarea from './Textarea'
import Drawer from './Drawer'
import ConfirmModal from './ConfirmModal'
import Spinner from './Spinner'
import { useToast } from '../context/ToastContext'
import { todayKey, parseDateKey, MONTHS } from '../lib/calendar'
import { daysBetween } from '../lib/weightTrend'
import {
    photosConfigured,
    listPhotos,
    uploadPhoto,
    updatePhoto,
    deletePhoto,
    type PhotoDetails,
} from '../services/progressPhotos'
import type { PhotoKind, PhotoPose, ProgressPhoto, WeightLog } from '../types'

const POSES: { value: PhotoPose; label: string }[] = [
    { value: 'front', label: 'Front' },
    { value: 'side', label: 'Side' },
    { value: 'back', label: 'Back' },
]

const KINDS: { value: PhotoKind; label: string }[] = [
    { value: 'progress', label: 'Progress' },
    { value: 'goal', label: 'Goal' },
]

/**
 * Before / now / goal photos on the Body tab. For one pose at a time, the
 * original (earliest progress photo) sits on the left and anything else —
 * a later progress photo or a goal photo — is picked for the right.
 */
export default function BodyPhotos({
    logs,
    onPhotosChange,
}: {
    logs: WeightLog[]
    /** Every photo, after each load, upload, edit or delete — so the weigh-in list can mark its days. */
    onPhotosChange?: (photos: ProgressPhoto[]) => void
}) {
    const toast = useToast()
    const [configured, setConfigured] = useState<boolean | null>(null)
    const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null)
    const [pose, setPose] = useState<PhotoPose>('front')
    // The right-hand photo per pose; unset falls back to latest progress, then goal.
    const [picked, setPicked] = useState<Partial<Record<PhotoPose, string>>>({})
    const [adding, setAdding] = useState<PhotoKind | null>(null)
    const [open, setOpen] = useState<ProgressPhoto | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<ProgressPhoto[] | null>(null)
    const [comparing, setComparing] = useState(false)

    useEffect(() => {
        photosConfigured()
            .then((ok) => {
                setConfigured(ok)
                if (!ok) return
                // A failed list is a load error, not missing setup — say so.
                return listPhotos()
                    .then(setPhotos)
                    .catch(() => {
                        setPhotos([])
                        toast.error('Could not load your photos')
                    })
            })
            .catch(() => setConfigured(false))
        // Runs once on mount; toast is stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (photos) onPhotosChange?.(photos)
        // Only when the photos themselves change; the callback is a state setter.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [photos])

    const forPose = useMemo(() => (photos ?? []).filter((p) => p.pose === pose), [photos, pose])
    const progress = forPose.filter((p) => p.kind === 'progress')
    const goals = forPose.filter((p) => p.kind === 'goal')
    const original = progress[0] ?? null
    const laterProgress = progress.slice(1).reverse()
    const right =
        forPose.find((p) => p !== original && p._id === picked[pose]) ??
        laterProgress[0] ??
        goals[goals.length - 1] ??
        null

    /** Photos taken together with this one: same type, same day, any pose. */
    function setOf(photo: ProgressPhoto): ProgressPhoto[] {
        return (photos ?? []).filter((p) => p.kind === photo.kind && p.date === photo.date)
    }

    function upsert(photo: ProgressPhoto) {
        setPhotos((prev) =>
            [...(prev ?? []).filter((p) => p._id !== photo._id), photo].sort(
                (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)
            )
        )
    }

    // Each photo of a set lands as it uploads and becomes that pose's comparison.
    function handleUploaded(photo: ProgressPhoto) {
        upsert(photo)
        setPicked((prev) => ({ ...prev, [photo.pose]: photo._id }))
    }

    async function handleUpdate(photo: ProgressPhoto, details: PhotoDetails) {
        upsert(await updatePhoto(photo._id, details))
        setOpen(null)
    }

    async function handleDelete(targets: ProgressPhoto[]) {
        const ids = new Set(targets.map((p) => p._id))
        setOpen(null)
        setPhotos((prev) => (prev ?? []).filter((p) => !ids.has(p._id)))
        const results = await Promise.allSettled(targets.map((p) => deletePhoto(p._id)))
        if (results.some((r) => r.status === 'rejected')) {
            toast.error('Could not delete every photo')
            setPhotos(await listPhotos())
        } else {
            toast.show(
                targets.length > 1 ? `${targets.length} photos deleted.` : 'Photo deleted.',
                'success'
            )
        }
    }

    if (configured === false) {
        return (
            <Surface className="flex flex-col gap-2">
                <PanelHeader title="Photos" />
                <p className="text-[13px] text-neutral-500">
                    Photos are stored in Cloudinary. Add{' '}
                    <code className="text-[12px]">CLOUDINARY_URL</code> to the server&rsquo;s
                    environment to turn them on.
                </p>
            </Surface>
        )
    }

    const rightChange =
        original && right?.kind === 'progress' ? change(logs, original, right) : null
    const hasAny = (photos?.length ?? 0) > 0
    const pick = (p: ProgressPhoto) => setPicked((prev) => ({ ...prev, [pose]: p._id }))

    return (
        <Surface className="flex flex-col gap-3">
            <PanelHeader
                title="Photos"
                aside={
                    <Button
                        variant="ghost"
                        size="sm"
                        icon="fa-solid fa-camera"
                        onClick={() => setAdding('progress')}
                        disabled={!photos}
                    >
                        Add
                    </Button>
                }
            />

            {!photos ? (
                <div className="grid place-items-center py-10">
                    <Spinner />
                </div>
            ) : !hasAny ? (
                <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-neutral-200 p-4">
                    <p className="text-[13px] leading-snug text-neutral-500">
                        Front, side and back, in the same light each time. Your first set becomes
                        the original everything is compared with.
                    </p>
                    <button
                        type="button"
                        onClick={() => setAdding('progress')}
                        className="text-[13px] font-medium text-neutral-900 underline-offset-2 hover:underline"
                    >
                        Add your first set
                    </button>
                </div>
            ) : (
                <>
                    <SegmentedPose value={pose} onChange={setPose} />

                    <div className="grid grid-cols-2 gap-2">
                        <Thumb
                            label="Original"
                            photo={original}
                            sub={original ? caption(logs, original) : undefined}
                            onOpen={setOpen}
                            empty="No progress photo for this pose yet."
                        />
                        <Thumb
                            label={right?.kind === 'goal' ? 'Goal' : right ? 'Latest' : 'Compare'}
                            photo={right}
                            sub={right ? caption(logs, right) : undefined}
                            onOpen={setOpen}
                            empty={
                                original
                                    ? 'Add a later set or a goal photo.'
                                    : 'Nothing to compare yet.'
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <p className="nums min-w-0 truncate text-[12px] text-neutral-500">
                            {rightChange ?? ''}
                        </p>
                        {original && right && (
                            <button
                                type="button"
                                onClick={() => setComparing(true)}
                                className="group inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                            >
                                Compare
                                <i
                                    className="fa-solid fa-up-right-and-down-left-from-center text-[10px]"
                                    aria-hidden="true"
                                />
                            </button>
                        )}
                    </div>
                </>
            )}

            <CompareDrawer
                open={comparing && !!original && !!right}
                pose={pose}
                onPose={setPose}
                original={original}
                right={right}
                laterProgress={laterProgress}
                goals={goals}
                logs={logs}
                onPick={pick}
                onOpenPhoto={(p) => {
                    setComparing(false)
                    setOpen(p)
                }}
                onClose={() => setComparing(false)}
            />

            <AddPhotoDrawer
                key={`add-${adding ?? 'closed'}`}
                open={!!adding}
                kind={adding ?? 'progress'}
                onUploaded={handleUploaded}
                onDone={(count) => {
                    setAdding(null)
                    toast.show(count > 1 ? `${count} photos added.` : 'Photo added.', 'success')
                }}
                onClose={() => setAdding(null)}
            />

            <PhotoDrawer
                key={`photo-${open?._id ?? 'closed'}`}
                photo={open}
                logs={logs}
                set={open ? setOf(open) : []}
                onSave={handleUpdate}
                onDelete={(ps) => setConfirmDelete(ps)}
                onClose={() => setOpen(null)}
            />

            <ConfirmModal
                open={!!confirmDelete}
                title={
                    confirmDelete && confirmDelete.length > 1
                        ? `Delete all ${confirmDelete.length} photos in this set?`
                        : 'Delete this photo?'
                }
                message="They’re removed from Cloudinary too. This can’t be undone."
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    if (confirmDelete) void handleDelete(confirmDelete)
                }}
                onClose={() => setConfirmDelete(null)}
            />
        </Surface>
    )
}

// ─── Compact card parts ─────────────────────────────────────────────────────────

/** Front / Side / Back as one quiet segmented control that fits the side column. */
function SegmentedPose({
    value,
    onChange,
}: {
    value: PhotoPose
    onChange: (pose: PhotoPose) => void
}) {
    return (
        <div role="group" aria-label="Pose" className="grid grid-cols-3 gap-1 rounded-xl bg-neutral-100 p-1">
            {POSES.map((p) => (
                <button
                    key={p.value}
                    type="button"
                    aria-pressed={value === p.value}
                    onClick={() => onChange(p.value)}
                    className={`h-8 rounded-[9px] text-[13px] font-medium transition-colors ${
                        value === p.value
                            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                            : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                >
                    {p.label}
                </button>
            ))}
        </div>
    )
}

/** One small photo with its label underneath; tapping opens it. */
function Thumb({
    label,
    photo,
    sub,
    onOpen,
    empty,
}: {
    label: string
    photo: ProgressPhoto | null
    sub?: string
    onOpen: (p: ProgressPhoto) => void
    empty: string
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5">
            {photo ? (
                <button
                    type="button"
                    onClick={() => onOpen(photo)}
                    className="block aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100 ring-1 ring-neutral-900/[0.06] transition-opacity hover:opacity-90"
                    aria-label={`Open ${label.toLowerCase()} photo`}
                >
                    <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
                </button>
            ) : (
                <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-neutral-200 p-3 text-center">
                    <p className="text-[12px] leading-snug text-neutral-400">{empty}</p>
                </div>
            )}
            <div className="min-w-0">
                <p
                    className={`text-[12px] font-medium ${
                        photo?.kind === 'goal' ? 'text-emerald-700' : 'text-neutral-900'
                    }`}
                >
                    {label}
                </p>
                {sub && <p className="nums truncate text-[12px] text-neutral-500">{sub}</p>}
            </div>
        </div>
    )
}

/** "12 Nov · 102.7 kg" for a progress photo; the note (or "Goal") for a goal photo. */
function caption(logs: WeightLog[], photo: ProgressPhoto): string {
    if (photo.kind === 'goal') return photo.note || 'What you’re aiming for'
    const w = weightNear(logs, photo.date)
    return [shortDate(photo.date), w != null && `${w.toFixed(1)} kg`].filter(Boolean).join(' · ')
}

// ─── Compare (full size) ────────────────────────────────────────────────────────

/**
 * The big view: original against the chosen photo, side by side or as a wipe,
 * with every other photo of the pose underneath to pick from.
 */
function CompareDrawer({
    open,
    pose,
    onPose,
    original,
    right,
    laterProgress,
    goals,
    logs,
    onPick,
    onOpenPhoto,
    onClose,
}: {
    open: boolean
    pose: PhotoPose
    onPose: (pose: PhotoPose) => void
    original: ProgressPhoto | null
    right: ProgressPhoto | null
    laterProgress: ProgressPhoto[]
    goals: ProgressPhoto[]
    logs: WeightLog[]
    onPick: (p: ProgressPhoto) => void
    onOpenPhoto: (p: ProgressPhoto) => void
    onClose: () => void
}) {
    const [view, setView] = useState<'side' | 'slider'>('side')
    const rightChange =
        original && right?.kind === 'progress' ? change(logs, original, right) : null

    return (
        <Drawer size="2xl" open={open} onClose={onClose} title="Compare photos">
            {original && right && (
                <div className="flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <PillToggle label="Pose" options={POSES} value={pose} onChange={onPose} />
                        <PillToggle
                            label="Compare view"
                            options={[
                                { value: 'side', label: 'Side by side' },
                                { value: 'slider', label: 'Slider' },
                            ]}
                            value={view}
                            onChange={setView}
                        />
                    </div>

                    {view === 'slider' ? (
                        <SliderCompare
                            before={original}
                            after={right}
                            afterLabel={right.kind === 'goal' ? 'Goal' : shortDate(right.date)}
                            caption={[
                                `${longDate(original.date)} → ${right.kind === 'goal' ? 'goal' : longDate(right.date)}`,
                                rightChange,
                            ]
                                .filter(Boolean)
                                .join(' · ')}
                        />
                    ) : (
                        <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { photo: original, label: 'Original' },
                                    { photo: right, label: right.kind === 'goal' ? 'Goal' : 'Latest' },
                                ].map(({ photo, label }) => (
                                    <div key={photo._id} className="flex min-w-0 flex-col gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => onOpenPhoto(photo)}
                                            className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-900/[0.06]"
                                            aria-label={`Edit ${label.toLowerCase()} photo`}
                                        >
                                            <img
                                                src={photo.url}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        </button>
                                        <p className="nums truncate text-[12px] text-neutral-500">
                                            <span
                                                className={`font-medium ${photo.kind === 'goal' ? 'text-emerald-700' : 'text-neutral-900'}`}
                                            >
                                                {label}
                                            </span>{' '}
                                            · {caption(logs, photo)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            {rightChange && (
                                <p className="nums text-[13px] text-neutral-600">{rightChange}</p>
                            )}
                        </div>
                    )}

                    {(laterProgress.length > 0 || goals.length > 0) && (
                        <div className="flex flex-col gap-3 border-t border-hairline pt-4">
                            <p className="text-[13px] font-medium text-neutral-900">
                                Compare the original with
                            </p>
                            {laterProgress.length > 0 && (
                                <ThumbRow
                                    title="Progress"
                                    photos={laterProgress}
                                    selectedId={right._id}
                                    sub={(p) => weightDelta(logs, original, p) ?? ''}
                                    top={(p) => shortDate(p.date)}
                                    onPick={onPick}
                                />
                            )}
                            {goals.length > 0 && (
                                <ThumbRow
                                    title="Goal"
                                    photos={[...goals].reverse()}
                                    selectedId={right._id}
                                    top={() => 'Goal'}
                                    sub={(p) => p.note || shortDate(p.date)}
                                    onPick={onPick}
                                />
                            )}
                        </div>
                    )}
                    <p className="text-[12px] text-neutral-500">
                        Tap a photo to edit or delete it.
                    </p>
                </div>
            )}
        </Drawer>
    )
}

/**
 * Before and after stacked in one frame: the original shows left of the
 * handle, the comparison right of it. Drag (or arrow keys) to wipe between.
 */
function SliderCompare({
    before,
    after,
    afterLabel,
    caption,
}: {
    before: ProgressPhoto
    after: ProgressPhoto
    afterLabel: string
    caption: string
}) {
    const [pos, setPos] = useState(50)
    return (
        <div className="flex flex-col gap-2">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-md select-none overflow-hidden rounded-xl bg-neutral-100 ring-1 ring-neutral-900/[0.06]">
                <img
                    src={after.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    draggable={false}
                />
                <img
                    src={before.url}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                    draggable={false}
                />
                <div
                    className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow"
                    style={{ left: `${pos}%` }}
                >
                    <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[12px] text-neutral-700 shadow-md">
                        <i className="fa-solid fa-left-right" aria-hidden="true" />
                    </span>
                </div>
                <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-neutral-900">
                    Original
                </span>
                <span
                    className={`pointer-events-none absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        after.kind === 'goal'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-white/90 text-neutral-900'
                    }`}
                >
                    {afterLabel}
                </span>
                <input
                    type="range"
                    min={0}
                    max={100}
                    value={pos}
                    onChange={(e) => setPos(Number(e.target.value))}
                    aria-label="Slide between original and comparison"
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                />
            </div>
            <p className="nums text-center text-[12px] text-neutral-500">{caption}</p>
        </div>
    )
}

/**
 * One labelled row of pickable thumbnails. The scroller has its own padding so
 * the selected outline is never clipped by the overflow edge.
 */
function ThumbRow({
    title,
    photos,
    selectedId,
    top,
    sub,
    onPick,
}: {
    title: string
    photos: ProgressPhoto[]
    selectedId?: string
    top: (p: ProgressPhoto) => string
    sub: (p: ProgressPhoto) => string
    onPick: (p: ProgressPhoto) => void
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                {title} · {photos.length}
            </p>
            <div className="-mx-1 flex gap-2.5 overflow-x-auto p-1">
                {photos.map((p) => {
                    const on = p._id === selectedId
                    return (
                        <button
                            key={p._id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => onPick(p)}
                            className="flex w-[76px] shrink-0 flex-col gap-1 text-left"
                        >
                            <span
                                className={`block rounded-[14px] p-[3px] transition-colors ${
                                    on ? 'bg-neutral-900' : 'bg-transparent hover:bg-neutral-200'
                                }`}
                            >
                                <span className="block aspect-[3/4] overflow-hidden rounded-[11px] bg-neutral-200">
                                    <img
                                        src={p.thumbUrl}
                                        alt=""
                                        loading="lazy"
                                        className="h-full w-full object-cover"
                                    />
                                </span>
                            </span>
                            <span className="px-0.5">
                                <span
                                    className={`nums block truncate text-[11px] font-semibold ${on ? 'text-neutral-900' : 'text-neutral-700'}`}
                                >
                                    {top(p)}
                                </span>
                                <span className="nums block truncate text-[11px] text-neutral-500">
                                    {sub(p)}
                                </span>
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

// ─── Add ────────────────────────────────────────────────────────────────────────

/**
 * One set: a front, side and back photo taken together, sharing a type, date
 * and note. Each is stored as its own photo so each pose compares on its own;
 * any slot can be left empty.
 */
function AddPhotoDrawer({
    open,
    kind: initialKind,
    onUploaded,
    onDone,
    onClose,
}: {
    open: boolean
    kind: PhotoKind
    onUploaded: (photo: ProgressPhoto) => void
    onDone: (count: number) => void
    onClose: () => void
}) {
    const toast = useToast()
    const [files, setFiles] = useState<Partial<Record<PhotoPose, File>>>({})
    const [kind, setKind] = useState(initialKind)
    const [date, setDate] = useState(todayKey())
    const [note, setNote] = useState('')
    const [saving, setSaving] = useState(false)

    const chosen = POSES.filter((p) => files[p.value])

    async function submit() {
        if (!chosen.length) {
            toast.error('Add at least one photo')
            return
        }
        setSaving(true)
        const details = {
            kind,
            date: kind === 'goal' ? todayKey() : date,
            note: note.trim() || undefined,
        }
        let done = 0
        const failed: string[] = []
        // One at a time, so a failure leaves only the failed slots behind.
        for (const { value: pose, label } of chosen) {
            try {
                onUploaded(await uploadPhoto(files[pose]!, { ...details, pose }))
                done++
                setFiles((prev) => {
                    const next = { ...prev }
                    delete next[pose]
                    return next
                })
            } catch {
                failed.push(label.toLowerCase())
            }
        }
        setSaving(false)
        if (failed.length)
            toast.error(`Couldn’t upload the ${failed.join(' and ')} photo — try again`)
        else onDone(done)
    }

    return (
        <Drawer
            size="lg"
            open={open}
            onClose={onClose}
            title={kind === 'goal' ? 'Add goal photos' : 'Add progress photos'}
            footer={
                <div className="flex w-full items-center justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        icon="fa-solid fa-check"
                        onClick={() => void submit()}
                        disabled={saving || !chosen.length}
                    >
                        {saving
                            ? 'Uploading…'
                            : chosen.length > 1
                              ? `Save ${chosen.length} photos`
                              : 'Save'}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-5">
                <Field label="Type">
                    <PillToggle label="Type" options={KINDS} value={kind} onChange={setKind} />
                </Field>

                <div className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-medium text-neutral-700">Photos</span>
                    <div className="grid grid-cols-3 gap-2">
                        {POSES.map(({ value, label }) => (
                            <PoseSlot
                                key={value}
                                label={label}
                                file={files[value] ?? null}
                                disabled={saving}
                                onChange={(f) =>
                                    setFiles((prev) => {
                                        const next = { ...prev }
                                        if (f) next[value] = f
                                        else delete next[value]
                                        return next
                                    })
                                }
                            />
                        ))}
                    </div>
                    <p className="text-[12px] text-neutral-500">
                        All three keeps every pose comparable, but any one is fine.
                    </p>
                </div>

                {kind === 'progress' ? (
                    <Field label="Taken on">
                        <DatePicker
                            value={date}
                            maxDate={todayKey()}
                            onChange={(v) => setDate(typeof v === 'string' ? v : todayKey())}
                        />
                    </Field>
                ) : (
                    <p className="text-[13px] leading-relaxed text-neutral-500">
                        Anything you&rsquo;re aiming for — a reference physique, or photos of you
                        edited by an AI image tool to show you at your target.
                    </p>
                )}
                <Textarea
                    label="Note"
                    rows={2}
                    placeholder="Optional"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

/** One pose's picker: empty dashed box, or the chosen photo with a remove button. */
function PoseSlot({
    label,
    file,
    disabled,
    onChange,
}: {
    label: string
    file: File | null
    disabled: boolean
    onChange: (file: File | null) => void
}) {
    const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
    useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

    return (
        <div className="flex min-w-0 flex-col gap-1">
            <div className="relative">
                <label className={`block ${disabled ? 'pointer-events-none' : 'cursor-pointer'}`}>
                    <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={disabled}
                        onChange={(e) => {
                            onChange(e.target.files?.[0] ?? null)
                            e.target.value = ''
                        }}
                    />
                    {preview ? (
                        <span className="block aspect-[3/4] w-full overflow-hidden rounded-xl bg-neutral-100">
                            <img src={preview} alt="" className="h-full w-full object-cover" />
                        </span>
                    ) : (
                        <span className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-neutral-300 text-neutral-500 hover:bg-neutral-50">
                            <i className="fa-solid fa-camera" aria-hidden="true" />
                            <span className="text-[12px] font-medium">Add</span>
                        </span>
                    )}
                </label>
                {file && !disabled && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        aria-label={`Remove ${label.toLowerCase()} photo`}
                        className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-[12px] text-neutral-700 shadow-sm"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                )}
            </div>
            <span className="text-center text-[12px] font-medium text-neutral-700">{label}</span>
        </div>
    )
}

// ─── View / edit ────────────────────────────────────────────────────────────────

function PhotoDrawer({
    photo,
    logs,
    onSave,
    set,
    onDelete,
    onClose,
}: {
    photo: ProgressPhoto | null
    logs: WeightLog[]
    /** Every photo taken with this one (same type and day), itself included. */
    set: ProgressPhoto[]
    onSave: (photo: ProgressPhoto, details: PhotoDetails) => Promise<void>
    onDelete: (photos: ProgressPhoto[]) => void
    onClose: () => void
}) {
    const toast = useToast()
    const [kind, setKind] = useState<PhotoKind>(photo?.kind ?? 'progress')
    const [pose, setPose] = useState<PhotoPose>(photo?.pose ?? 'front')
    const [date, setDate] = useState(photo?.date ?? todayKey())
    const [note, setNote] = useState(photo?.note ?? '')
    const [saving, setSaving] = useState(false)
    const weight = photo ? weightNear(logs, photo.date) : null

    async function submit() {
        if (!photo) return
        setSaving(true)
        try {
            await onSave(photo, { kind, pose, date, note: note.trim() || undefined })
        } catch {
            toast.error('Could not save that photo')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            size="lg"
            open={!!photo}
            onClose={onClose}
            title={photo?.kind === 'goal' ? 'Goal photo' : photo ? longDate(photo.date) : ''}
            footer={
                <div className="flex w-full items-center justify-end gap-3">
                    {photo && (
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            className="mr-auto"
                            onClick={() => onDelete([photo])}
                        >
                            Delete
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        icon="fa-solid fa-check"
                        onClick={() => void submit()}
                        disabled={saving}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            }
        >
            {photo && (
                <div className="flex flex-col gap-5">
                    <a href={photo.url} target="_blank" rel="noreferrer" className="block">
                        <img
                            src={photo.url}
                            alt=""
                            className="w-full rounded-xl bg-neutral-100 object-contain"
                        />
                    </a>
                    {weight != null && kind === 'progress' && (
                        <p className="nums text-sm text-neutral-500">
                            Weighed {weight.toFixed(1)} kg around then.
                        </p>
                    )}
                    <Field label="Type">
                        <PillToggle label="Type" options={KINDS} value={kind} onChange={setKind} />
                    </Field>
                    <Field label="Pose">
                        <PillToggle label="Pose" options={POSES} value={pose} onChange={setPose} />
                    </Field>
                    {kind === 'progress' && (
                        <Field label="Taken on">
                            <DatePicker
                                value={date}
                                maxDate={todayKey()}
                                onChange={(v) => setDate(typeof v === 'string' ? v : todayKey())}
                            />
                        </Field>
                    )}
                    <Textarea
                        label="Note"
                        rows={2}
                        placeholder="Optional"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                    />
                    {set.length > 1 && (
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3">
                            <p className="text-[13px] text-neutral-600">
                                Taken with {set.length - 1} other{' '}
                                {set.length - 1 === 1 ? 'photo' : 'photos'} (
                                {set
                                    .filter((p) => p._id !== photo._id)
                                    .map((p) => p.pose)
                                    .join(', ')}
                                ).
                            </p>
                            <Button
                                variant="ghost"
                                size="sm"
                                icon="fa-solid fa-trash-can"
                                onClick={() => onDelete(set)}
                            >
                                Delete set
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Drawer>
    )
}

// ─── Bits ───────────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">{label}</span>
            {children}
        </div>
    )
}

/** The weigh-in closest to a date, within 3 days either side. */
function weightNear(logs: WeightLog[], date: string): number | null {
    let best: WeightLog | null = null
    let bestGap = Infinity
    for (const l of logs) {
        const gap = Math.abs(daysBetween(l.date, date))
        if (gap <= 3 && gap < bestGap) {
            best = l
            bestGap = gap
        }
    }
    return best?.weight ?? null
}

/** "−4.2 kg in 9 wks" between two progress photos, when both have a weigh-in. */
function change(logs: WeightLog[], from: ProgressPhoto, to: ProgressPhoto): string | null {
    const a = weightNear(logs, from.date)
    const b = weightNear(logs, to.date)
    const days = daysBetween(from.date, to.date)
    const span = days >= 14 ? `${Math.round(days / 7)} wks` : `${days} days`
    if (a == null || b == null) return days > 0 ? `${span} on` : null
    const d = b - a
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)} kg in ${span}`
}

/** "−2.1 kg" between two photos' weigh-ins, or null if either has none. */
function weightDelta(logs: WeightLog[], from: ProgressPhoto, to: ProgressPhoto): string | null {
    const a = weightNear(logs, from.date)
    const b = weightNear(logs, to.date)
    if (a == null || b == null) return null
    const d = b - a
    return `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)} kg`
}

function longDate(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return `${day} ${MONTHS[month].slice(0, 3)} ${year}`
}

function shortDate(date: string): string {
    const { month, day } = parseDateKey(date)
    return `${day} ${MONTHS[month].slice(0, 3)}`
}
