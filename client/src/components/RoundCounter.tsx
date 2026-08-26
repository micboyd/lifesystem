/**
 * A tap-to-count control for interval parts (e.g. "6 x 90s jog / 2min walk").
 * The big primary button logs a round; an undo steps back. It's a controlled
 * component — the parent owns the `done` count so it can be persisted (e.g. when
 * a session is marked done).
 *
 * When `details` are supplied, each rep is drawn as its own row with that rep's
 * info underneath; otherwise a compact row of progress dots is shown.
 */
/** Seconds → "M:SS" clock label. */
function clock(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = Math.round(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
}

export default function RoundCounter({
    target,
    label,
    details,
    seconds,
    startAtSec = 0,
    done,
    onChange,
    readOnly = false,
}: {
    target: number
    label?: string
    /** Optional per-rep info; entry i is shown under rep i+1. */
    details?: string[]
    /** Optional per-rep duration (seconds); enables a clock window on each rep. */
    seconds?: number[]
    /** Clock offset (seconds) when rep 1 begins, e.g. after a warm-up. */
    startAtSec?: number
    done: number
    onChange?: (next: number) => void
    /** Recap mode (e.g. a logged session): show the progress, hide the tap controls. */
    readOnly?: boolean
}) {
    const complete = done >= target
    const one = (label?.trim() || 'round').toLowerCase()
    const many = one.endsWith('s') ? one : `${one}s`
    const hasDetails = !!details && details.length > 0
    const hasTimes = !!seconds && seconds.length > 0

    // Cumulative clock window [start, end] for each rep, from the durations.
    const windows: [number, number][] = []
    if (hasTimes) {
        let t = startAtSec
        for (let i = 0; i < target; i++) {
            const dur = seconds![i] ?? 0
            windows.push([t, t + dur])
            t += dur
        }
    }

    return (
        <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    {target} {many}
                </span>
                <span
                    className={`text-sm font-bold tabular-nums ${
                        complete ? 'text-emerald-600' : 'text-neutral-900'
                    }`}
                >
                    {done} / {target}
                </span>
            </div>

            {hasDetails || hasTimes ? (
                /* Per-rep checklist — each rep shows its own info and clock window. */
                <ol className={`${readOnly ? '' : 'mb-3'} flex flex-col gap-1.5`}>
                    {Array.from({ length: target }, (_, i) => {
                        const isDone = i < done
                        const isNext = i === done && !complete
                        const win = windows[i]
                        return (
                            <li
                                key={i}
                                className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                                    isDone
                                        ? 'border-emerald-200 bg-emerald-50'
                                        : isNext
                                          ? 'border-coral-300 bg-white ring-1 ring-coral-200'
                                          : 'border-neutral-200 bg-white'
                                }`}
                            >
                                <span
                                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
                                        isDone
                                            ? 'bg-emerald-500 text-white'
                                            : isNext
                                              ? 'bg-coral-500 text-white'
                                              : 'bg-neutral-100 text-neutral-500'
                                    }`}
                                >
                                    {isDone ? <i className="fa-solid fa-check text-[10px]" /> : i + 1}
                                </span>
                                <span
                                    className={`min-w-0 flex-1 text-sm ${
                                        isDone ? 'text-emerald-800' : 'text-neutral-700'
                                    }`}
                                >
                                    {hasDetails
                                        ? (details![i] ?? `${label?.trim() || 'Round'} ${i + 1}`)
                                        : `${label?.trim() || 'Round'} ${i + 1}`}
                                </span>
                                {win && (
                                    <span
                                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                                            isDone
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : isNext
                                                  ? 'bg-coral-100 text-coral-700'
                                                  : 'bg-neutral-100 text-neutral-500'
                                        }`}
                                    >
                                        {clock(win[0])}–{clock(win[1])}
                                    </span>
                                )}
                            </li>
                        )
                    })}
                </ol>
            ) : (
                /* Progress dots — one per round, filled as you go. */
                <div className={`${readOnly ? '' : 'mb-3'} flex flex-wrap gap-1.5`}>
                    {Array.from({ length: target }, (_, i) => (
                        <span
                            key={i}
                            className={`h-2.5 flex-1 rounded-full transition-colors ${
                                i < done ? 'bg-emerald-500' : 'bg-neutral-200'
                            }`}
                            style={{ minWidth: 10 }}
                        />
                    ))}
                </div>
            )}

            {!readOnly && (
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => onChange?.(Math.min(target, done + 1))}
                        disabled={complete}
                        className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                            complete
                                ? 'cursor-default bg-emerald-100 text-emerald-700'
                                : 'bg-coral-500 text-white hover:bg-coral-600 active:bg-coral-700'
                        }`}
                    >
                        {complete ? (
                            <>
                                <i className="fa-solid fa-check mr-1.5" />
                                All {target} done
                            </>
                        ) : (
                            <>Tap after each {one}</>
                        )}
                    </button>
                    <button
                        type="button"
                        aria-label="Undo one"
                        onClick={() => onChange?.(Math.max(0, done - 1))}
                        disabled={done === 0}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-800 disabled:opacity-40"
                    >
                        <i className="fa-solid fa-rotate-left" />
                    </button>
                </div>
            )}
        </div>
    )
}
