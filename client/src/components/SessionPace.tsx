import { useEffect, useState } from 'react'
import {
    driftLabel,
    driftTone,
    hasSlot,
    paceOf,
    slotLabel,
    timeOfDay,
    type DriftTone,
    type Slot,
} from '../lib/sessionPace'

const TONE: Record<DriftTone, string> = {
    on: 'bg-emerald-100 text-emerald-700',
    behind: 'bg-amber-100 text-amber-800',
    ahead: 'bg-sky-100 text-sky-800',
}

/** The current time, refreshed every `ms` — enough for "due in 4 min". */
function useNow(ms = 30000): number {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), ms)
        return () => clearInterval(timer)
    }, [ms])
    return now
}

/** "in 4 min" / "now" / "3 min overdue" for a due time. */
function dueIn(dueAt: number, now: number): { label: string; overdue: boolean } {
    const min = Math.round((dueAt - now) / 60000)
    if (min > 0) return { label: `in ${min} min`, overdue: false }
    if (min === 0) return { label: 'now', overdue: false }
    return { label: `${-min} min overdue`, overdue: true }
}

/**
 * The strip at the top of a session being logged: where you stand against the
 * plan (from the Completed presses so far) and what's next, with when it's due.
 * Sticks to the top of the drawer so it's in view while you scroll through sets.
 */
export function PaceBanner({
    slots,
    completedAt,
    names,
}: {
    /** Each item's slot, in session order. */
    slots: Slot[]
    /** When each item was completed (ms), by the same index. */
    completedAt: (number | null | undefined)[]
    names: string[]
}) {
    const now = useNow()
    const pace = paceOf(slots, completedAt)
    if (pace.timed === 0) return null

    if (pace.completed === 0) {
        const firstIndex = slots.findIndex(hasSlot)
        const first = slots[firstIndex] as Required<Slot>
        return (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-sm font-semibold text-neutral-900">
                    Tap <span className="text-coral-600">Completed</span> as you finish each item
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                    Each press is timed against the plan, so you&apos;ll see if you&apos;re on
                    time. First up: {names[firstIndex]} ({slotLabel(first)} min).
                </p>
            </div>
        )
    }

    const done = pace.completed === pace.timed
    const due = pace.next ? dueIn(pace.next.dueAt, now) : null
    const status =
        pace.drift === null
            ? { label: 'Under way', cls: 'bg-neutral-100 text-neutral-700' }
            : { label: driftLabel(pace.drift), cls: TONE[driftTone(pace.drift)] }

    return (
        <div className="sticky top-0 z-10 flex flex-col gap-1.5 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
                <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${status.cls}`}>
                    {done ? `Done · ${status.label.toLowerCase()}` : status.label}
                </span>
                <span className="text-xs font-semibold tabular-nums text-neutral-400">
                    {pace.completed}/{pace.timed} done
                </span>
            </div>
            {pace.next && due ? (
                <p className="truncate text-sm text-neutral-600">
                    Next: <span className="font-semibold text-neutral-900">{names[pace.next.index]}</span>{' '}
                    — due {timeOfDay(pace.next.dueAt)}{' '}
                    <span className={due.overdue ? 'font-semibold text-amber-700' : 'text-neutral-400'}>
                        ({due.label})
                    </span>
                </p>
            ) : done && pace.last >= 0 ? (
                <p className="text-sm text-neutral-600">
                    Finished at {timeOfDay(completedAt[pace.last] as number)}.
                </p>
            ) : null}
        </div>
    )
}

/**
 * The Completed button under one item. Before it's pressed: a big full-width
 * button (coral when it's the item you should be on). After: when it was
 * completed and how that item ran against the plan, with Undo. In a recap it's
 * just the result, or nothing if the item wasn't completed.
 */
export function CompleteButton({
    completedAt,
    delta,
    isNext = false,
    readOnly = false,
    onComplete,
    onUndo,
}: {
    completedAt?: number | null
    /** How the item ran against its planned gap from the previous one (min, + behind). */
    delta?: number | null
    isNext?: boolean
    readOnly?: boolean
    onComplete?: () => void
    onUndo?: () => void
}) {
    if (completedAt == null) {
        if (readOnly) return null
        return (
            <button
                type="button"
                onClick={onComplete}
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors ${
                    isNext
                        ? 'bg-coral-500 text-white hover:bg-coral-600 active:bg-coral-700'
                        : 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100'
                }`}
            >
                <i className="fa-solid fa-check text-xs" aria-hidden="true" />
                Completed
            </button>
        )
    }

    return (
        <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl bg-emerald-50 px-3 py-2">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-800">
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                    Completed {timeOfDay(completedAt)}
                </span>
                {delta != null && (
                    <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[driftTone(delta)]}`}
                    >
                        {driftLabel(delta)}
                    </span>
                )}
            </span>
            {!readOnly && (
                <button
                    type="button"
                    onClick={onUndo}
                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-500 transition-colors hover:bg-white hover:text-neutral-800"
                >
                    Undo
                </button>
            )}
        </div>
    )
}

/** An item's planned slot as a small chip, e.g. "15–30 min". Nothing without one. */
export function SlotChip({ slot }: { slot: Slot }) {
    if (!hasSlot(slot)) return null
    return (
        <span
            className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-500"
            title="Planned minutes into the session"
        >
            {slotLabel(slot)} min
        </span>
    )
}

/** A minute-mark input value → minutes (decimals allowed, e.g. 1.5), or undefined. */
function toMark(v: string): number | undefined {
    if (v.trim() === '') return undefined
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * The start → end minute inputs for one item in a workout or session builder.
 * Flags a slot whose end isn't after its start, which pacing would ignore.
 */
export function SlotInputs({
    slot,
    label,
    onChange,
}: {
    slot: Slot
    /** What the slot belongs to, for the inputs' accessible names. */
    label: string
    onChange: (next: Slot) => void
}) {
    const bad =
        slot.startMin !== undefined && slot.endMin !== undefined && slot.endMin <= slot.startMin
    const cls = `w-16 rounded-lg border bg-white px-2 py-1.5 text-base tabular-nums outline-none placeholder:text-neutral-400 focus:border-neutral-400 sm:text-sm ${
        bad ? 'border-red-300' : 'border-neutral-200'
    }`
    return (
        <div
            className="flex items-center gap-1.5"
            title={bad ? 'The end has to be after the start' : 'Minutes into the session'}
        >
            <i className="fa-regular fa-clock text-xs text-neutral-400" aria-hidden="true" />
            <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="From"
                aria-label={`Start minute for ${label}`}
                value={slot.startMin ?? ''}
                onChange={(e) => onChange({ ...slot, startMin: toMark(e.target.value) })}
                className={cls}
            />
            <span className="text-xs text-neutral-400">–</span>
            <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="To"
                aria-label={`End minute for ${label}`}
                value={slot.endMin ?? ''}
                onChange={(e) => onChange({ ...slot, endMin: toMark(e.target.value) })}
                className={cls}
            />
            <span className="text-xs text-neutral-400">min</span>
        </div>
    )
}

/** Autosave state for a session being logged. */
export type SaveState = 'idle' | 'saving' | 'saved' | 'local' | 'error'

/** One line saying where the session's entries are: saving, saved, or only on this device. */
export function SaveStatus({ state, savedAt }: { state: SaveState; savedAt?: number | null }) {
    const view: Record<SaveState, { icon: string; label: string; cls: string } | null> = {
        idle: null,
        saving: { icon: 'fa-solid fa-rotate fa-spin', label: 'Saving…', cls: 'text-neutral-400' },
        saved: {
            icon: 'fa-solid fa-cloud',
            label: savedAt ? `Saved ${timeOfDay(savedAt)}` : 'Saved',
            cls: 'text-emerald-600',
        },
        local: {
            icon: 'fa-solid fa-mobile-screen',
            label: 'On this device — saves as you go',
            cls: 'text-neutral-400',
        },
        error: {
            icon: 'fa-solid fa-triangle-exclamation',
            label: 'Not saved yet — kept on this device, retrying',
            cls: 'text-amber-700',
        },
    }
    const v = view[state]
    if (!v) return null
    return (
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${v.cls}`}>
            <i className={`${v.icon} text-[10px]`} aria-hidden="true" />
            {v.label}
        </span>
    )
}
