import type { SessionRep } from '../types'
import { RepBody } from './session/RepList'

/** Seconds → "M:SS" clock label. */
export function clock(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
}

/** Each rep's clock window [start, end] in seconds, from the per-rep durations. */
export function roundWindows(
    target: number,
    seconds: number[],
    startAtSec = 0
): [number, number][] {
    const windows: [number, number][] = []
    let t = startAtSec
    for (let i = 0; i < target; i++) {
        const dur = seconds[i] ?? 0
        windows.push([t, t + dur])
        t += dur
    }
    return windows
}

/**
 * The reps of an interval part, each one its own row you tap when you finish
 * it — no separate counter button. Tapping a later row ticks everything up to
 * it; tapping a ticked row unticks back to it. It's controlled: the parent owns
 * the `done` count so it can be persisted.
 *
 * Without per-rep info it's a row of progress dots and one small "+1" button.
 */
export default function RoundCounter({
    target,
    label,
    details,
    reps,
    seconds,
    startAtSec = 0,
    done,
    onChange,
    readOnly = false,
    active = true,
}: {
    target: number
    label?: string
    /** Optional per-rep info; entry i is shown under rep i+1. */
    details?: string[]
    /** The section's reps, when written as reps — each row then shows its numbers as pills. */
    reps?: SessionRep[]
    /** Optional per-rep duration (seconds); enables a clock window on each rep. */
    seconds?: number[]
    /** Clock offset (seconds) when rep 1 begins, e.g. after a warm-up. */
    startAtSec?: number
    done: number
    onChange?: (next: number) => void
    /** Recap mode (e.g. a logged session): show the progress, nothing to tap. */
    readOnly?: boolean
    /** The part you're on — its next rep is picked out. */
    active?: boolean
}) {
    const complete = done >= target
    const one = (label?.trim() || 'round').toLowerCase()
    const hasReps = !!reps && reps.length === target
    const hasDetails = hasReps || (!!details && details.length > 0)
    // One rep's window is the part's own slot, already on its header.
    const windows =
        seconds && seconds.length > 0 && target > 1 ? roundWindows(target, seconds, startAtSec) : []

    if (!hasDetails && windows.length === 0) {
        return (
            <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-wrap gap-1.5">
                    {Array.from({ length: target }, (_, i) => (
                        <span
                            key={i}
                            className={`h-2 flex-1 rounded-full transition-colors ${
                                i < done ? 'bg-emerald-500' : 'bg-neutral-200'
                            }`}
                            style={{ minWidth: 10 }}
                        />
                    ))}
                </div>
                {!readOnly && (
                    <>
                        <button
                            type="button"
                            aria-label="Undo one"
                            onClick={() => onChange?.(Math.max(0, done - 1))}
                            disabled={done === 0}
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                        >
                            <i className="fa-solid fa-rotate-left text-xs" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onChange?.(Math.min(target, done + 1))}
                            disabled={complete}
                            className="h-11 shrink-0 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-40"
                        >
                            +1 {one}
                        </button>
                    </>
                )}
            </div>
        )
    }

    return (
        <ol className="flex flex-col gap-1.5">
            {Array.from({ length: target }, (_, i) => {
                const isDone = i < done
                const isNext = active && i === done && !complete
                const win = windows[i]
                const body = hasReps ? (
                    <RepBody rep={reps![i]} />
                ) : (
                    <span className="min-w-0 flex-1 text-sm text-neutral-800">
                        {details?.[i] ?? `${label?.trim() || 'Round'} ${i + 1}`}
                    </span>
                )
                const inner = (
                    <>
                        <span
                            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${
                                isDone
                                    ? 'bg-emerald-600 text-white'
                                    : isNext
                                      ? 'ring-2 ring-inset ring-neutral-900'
                                      : 'ring-1 ring-inset ring-neutral-300'
                            }`}
                            aria-hidden="true"
                        >
                            {isDone && <i className="fa-solid fa-check text-[10px]" />}
                        </span>
                        <span className={`flex min-w-0 flex-1 ${isDone ? 'opacity-50' : ''}`}>
                            {body}
                        </span>
                        {win && (
                            <span className="shrink-0 pt-0.5 text-xs tabular-nums text-neutral-400">
                                {clock(win[0])}–{clock(win[1])}
                            </span>
                        )}
                    </>
                )
                const row = `flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    isDone ? 'bg-transparent' : 'bg-neutral-50'
                }`
                return (
                    <li key={i}>
                        {readOnly ? (
                            <div className={row}>{inner}</div>
                        ) : (
                            <button
                                type="button"
                                aria-pressed={isDone}
                                aria-label={`${isDone ? 'Untick' : 'Tick'} ${one} ${i + 1}`}
                                onClick={() => onChange?.(isDone ? i : i + 1)}
                                className={`${row} hover:bg-neutral-100 active:bg-neutral-200/60`}
                            >
                                {inner}
                            </button>
                        )}
                    </li>
                )
            })}
        </ol>
    )
}
