import { useCallback, useEffect, useState } from 'react'
import {
    EMPTY_CLOCK,
    clearClock,
    clockLabel,
    currentIndex,
    elapsedMin,
    hasSlot,
    paceOf,
    readClock,
    slotLabel,
    toSecondMark,
    writeClock,
    type ClockState,
    type Slot,
} from '../lib/sessionClock'

export interface SessionClock {
    state: ClockState
    /** Minutes on the clock right now (ticks every second while running). */
    elapsed: number
    running: boolean
    start: () => void
    /** Stop the clock and forget every tap. */
    reset: () => void
    /** Tap item `i` done at the current mark, or un-tap it. */
    toggle: (i: number) => void
    /** The tap marks aligned to `count` items — null where not tapped. */
    marks: (count: number) => (number | null)[]
}

/**
 * The running clock for one session, persisted on the device under `key`
 * (null while nothing is open). Re-reads storage whenever the key changes, so
 * reopening the same session carries on where it was.
 */
export function useSessionClock(key: string | null): SessionClock {
    const [state, setState] = useState<ClockState>(() => (key ? readClock(key) : EMPTY_CLOCK))
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        setState(key ? readClock(key) : EMPTY_CLOCK)
        setNow(Date.now())
    }, [key])

    const running = state.startedAt !== null
    useEffect(() => {
        if (!running) return
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [running])

    const commit = useCallback(
        (next: ClockState) => {
            setState(next)
            if (key) writeClock(key, next)
        },
        [key]
    )

    const elapsed = elapsedMin(state, now)

    return {
        state,
        elapsed,
        running,
        start: () => {
            const t = Date.now()
            setNow(t)
            commit({ startedAt: t, doneAt: {} })
        },
        reset: () => {
            if (key) clearClock(key)
            setState(EMPTY_CLOCK)
        },
        toggle: (i) => {
            if (state.startedAt === null) return
            const doneAt = { ...state.doneAt }
            if (doneAt[i] !== undefined) delete doneAt[i]
            else doneAt[i] = toSecondMark(elapsedMin(state, Date.now()))
            commit({ ...state, doneAt })
        },
        marks: (count) => Array.from({ length: count }, (_, i) => state.doneAt[i] ?? null),
    }
}

/**
 * The clock strip at the top of a session: Start before you begin, then the
 * running time, whether you're on pace, and which item you should be on.
 */
export function SessionClockBar({
    clock,
    slots,
    names,
}: {
    clock: SessionClock
    /** Each item's slot, in the same order the taps are indexed by. */
    slots: Slot[]
    names: string[]
}) {
    const timed = slots.some(hasSlot)
    if (!timed) return null

    if (!clock.running) {
        return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900">Session clock</p>
                    <p className="text-xs text-neutral-500">
                        Start it as you begin, then tap each item off as you finish it.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={clock.start}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-coral-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-coral-600 active:bg-coral-700"
                >
                    <i className="fa-solid fa-play text-xs" aria-hidden="true" />
                    Start
                </button>
            </div>
        )
    }

    const pace = paceOf(slots, clock.state, clock.elapsed)
    const now = currentIndex(slots, clock.state)
    const nowSlot = now >= 0 ? slots[now] : null
    const paceChip =
        pace.kind === 'behind'
            ? { label: `${pace.min} min behind`, cls: 'bg-amber-100 text-amber-800' }
            : pace.kind === 'ahead'
              ? { label: `${pace.min} min ahead`, cls: 'bg-sky-100 text-sky-800' }
              : pace.kind === 'done'
                ? { label: 'All done', cls: 'bg-emerald-100 text-emerald-700' }
                : { label: 'On track', cls: 'bg-emerald-100 text-emerald-700' }

    return (
        <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
            <div className="flex min-w-0 items-center gap-3">
                <span className="text-2xl font-bold tabular-nums text-neutral-950">
                    {clockLabel(clock.elapsed)}
                </span>
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                        className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${paceChip.cls}`}
                    >
                        {paceChip.label}
                    </span>
                    {nowSlot && hasSlot(nowSlot) && (
                        <span className="truncate text-xs text-neutral-500">
                            Now: <span className="font-medium text-neutral-700">{names[now]}</span>{' '}
                            · {slotLabel(nowSlot)}
                        </span>
                    )}
                </div>
            </div>
            <button
                type="button"
                onClick={clock.reset}
                className="shrink-0 text-xs font-semibold text-neutral-400 transition-colors hover:text-neutral-700"
            >
                Reset
            </button>
        </div>
    )
}

/**
 * One item's slot and its done-tap: the slot chip ("15–30 min"), and once the
 * clock is running a big tick you hit when the item is finished, which then
 * shows the mark it was done at. Tap again to undo.
 */
export function SlotTap({
    slot,
    doneAt,
    current,
    running,
    onToggle,
}: {
    slot: Slot
    doneAt?: number | null
    /** This is the item the clock says you should be on. */
    current?: boolean
    /** The clock is running, so the item can be tapped. */
    running: boolean
    onToggle?: () => void
}) {
    if (!hasSlot(slot)) return null
    const done = doneAt !== undefined && doneAt !== null
    const late = done && doneAt! > slot.endMin
    // A recap: when it was done, not a button.
    if (!running && done) {
        return (
            <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-neutral-500">
                    {slotLabel(slot)} min
                </span>
                <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                        late ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
                    }`}
                >
                    done {clockLabel(doneAt!)}
                </span>
            </div>
        )
    }
    return (
        <div className="flex shrink-0 items-center gap-2">
            <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                    done
                        ? 'bg-emerald-100 text-emerald-700'
                        : current
                          ? 'bg-coral-100 text-coral-700'
                          : 'bg-neutral-100 text-neutral-500'
                }`}
                title="Planned minutes into the session"
            >
                {slotLabel(slot)} min
            </span>
            {running && (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-pressed={done}
                    aria-label={done ? 'Undo done' : 'Mark done'}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                        done
                            ? late
                                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                : 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : current
                              ? 'bg-coral-500 text-white hover:bg-coral-600'
                              : 'border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                >
                    <i className="fa-solid fa-check text-[10px]" aria-hidden="true" />
                    {done ? clockLabel(doneAt!) : 'Done'}
                </button>
            )}
        </div>
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
 * Flags a slot whose end isn't after its start, which the clock would ignore.
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
    const cls = `w-16 rounded-lg border bg-white px-2 py-1.5 text-sm tabular-nums outline-none placeholder:text-neutral-400 focus:border-neutral-400 ${
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
