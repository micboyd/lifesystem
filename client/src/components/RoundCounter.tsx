/**
 * A tap-to-count control for interval parts (e.g. "6 x 90s jog / 2min walk").
 * The big primary button logs a round; the dots and X / N read-out track
 * progress; an undo steps back. It's a controlled component — the parent owns the
 * `done` count so it can be persisted (e.g. when a session is marked done).
 */
export default function RoundCounter({
    target,
    label,
    done,
    onChange,
}: {
    target: number
    label?: string
    done: number
    onChange: (next: number) => void
}) {
    const complete = done >= target
    const one = (label?.trim() || 'round').toLowerCase()
    const many = one.endsWith('s') ? one : `${one}s`

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

            {/* Progress dots — one per round, filled as you go. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
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

            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => onChange(Math.min(target, done + 1))}
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
                    onClick={() => onChange(Math.max(0, done - 1))}
                    disabled={done === 0}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-white hover:text-neutral-800 disabled:opacity-40"
                >
                    <i className="fa-solid fa-rotate-left" />
                </button>
            </div>
        </div>
    )
}
