import type { RepEffort, SessionPart, SessionRep } from '../../types'
import { effortFacts, partReps, repGroups, type FactKind } from '../../lib/sessionReps'
import { clock, roundWindows } from '../RoundCounter'

/**
 * How a conditioning section's reps are drawn — the same rows for a run, a bike
 * set, a walk or a list of drills. A rep is its name, then its numbers as small
 * pills (how many, how far, how long, how fast, how hard), then its recovery on
 * a line of its own. Shared by the overview and the rep counter while logging.
 */

const FACT_ICON: Record<FactKind, string | null> = {
    count: null,
    distance: 'fa-solid fa-route',
    time: 'fa-regular fa-clock',
    speed: 'fa-solid fa-gauge-high',
    pace: 'fa-solid fa-stopwatch',
    incline: 'fa-solid fa-mountain',
    effort: 'fa-solid fa-heart-pulse',
}

/** An effort's numbers as pills. */
export function RepFacts({ effort }: { effort: RepEffort }) {
    const facts = effortFacts(effort)
    if (facts.length === 0) return null
    return (
        <>
            {facts.map((f) => (
                <span
                    key={f.kind}
                    className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums text-neutral-700 ring-1 ring-inset ring-neutral-200"
                >
                    {FACT_ICON[f.kind] && (
                        <i className={`${FACT_ICON[f.kind]} text-[10px] text-neutral-400`} aria-hidden="true" />
                    )}
                    {f.text}
                </span>
            ))}
        </>
    )
}

/** One effort: its name and numbers on a line, any note beneath. */
function EffortLine({ effort, rest = false }: { effort: RepEffort; rest?: boolean }) {
    const measured = effortFacts(effort).length > 0
    // A rep carried over from prose is a sentence, not a name: set it plainly.
    const plain = !measured && effort.do.length > 32
    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {rest && (
                    <i
                        className="fa-solid fa-arrow-turn-up rotate-90 text-[10px] text-neutral-400"
                        aria-label="then"
                    />
                )}
                <span
                    className={`text-sm leading-snug ${
                        rest
                            ? 'text-neutral-600'
                            : plain
                              ? 'text-neutral-700'
                              : 'font-semibold text-neutral-900'
                    }`}
                >
                    {effort.do}
                </span>
                <RepFacts effort={effort} />
            </div>
            {effort.note && (
                <p className={`text-xs leading-snug text-neutral-500 ${rest ? 'pl-4' : ''}`}>{effort.note}</p>
            )}
        </div>
    )
}

/** A whole rep: the work, then its recovery. */
export function RepBody({ rep }: { rep: SessionRep }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <EffortLine effort={rep} />
            {rep.rest && <EffortLine effort={rep.rest} rest />}
        </div>
    )
}

/**
 * When each piece of a folded group starts — "Run 5:00 · Walk 10:00 · Run 11:30"
 * — so the switch times inside "2×" stay visible. Only when every piece is timed.
 */
function SwitchTimes({ rep, times, start }: { rep: SessionRep; times: number; start: number }) {
    if (!rep.seconds) return null
    const rest = rep.rest
    if (rest && !rest.seconds) return null
    const marks: { label: string; at: number }[] = []
    let t = start
    for (let i = 0; i < times; i++) {
        marks.push({ label: rep.do, at: t })
        t += rep.seconds
        if (rest?.seconds) {
            marks.push({ label: rest.do, at: t })
            t += rest.seconds
        }
    }
    return (
        <p className="flex flex-wrap gap-x-1.5 text-xs leading-snug text-neutral-500">
            {marks.map((m, i) => (
                <span key={i} className="whitespace-nowrap">
                    {m.label} <span className="tabular-nums text-neutral-700">{clock(m.at)}</span>
                    {i < marks.length - 1 && <span className="pl-1.5 text-neutral-300">·</span>}
                </span>
            ))}
        </p>
    )
}

/**
 * A section's reps as a plan to read: identical reps folded into one row
 * ("6×"), each with its clock window when the reps are timed.
 */
export function RepList({ part }: { part: SessionPart }) {
    const reps = partReps(part)
    if (reps.length === 0) return null
    const groups = repGroups(reps)
    const windows = part.roundSeconds?.length
        ? roundWindows(
              reps.length,
              part.roundSeconds,
              part.startAtSec ?? (part.startMin !== undefined ? part.startMin * 60 : 0)
          )
        : []
    const numbered = groups.length > 1

    return (
        <ol className="flex flex-col gap-1.5">
            {groups.map((g, n) => {
                const start = windows[g.from]?.[0]
                const end = windows[g.from + g.times - 1]?.[1]
                return (
                    <li key={n} className="flex items-start gap-3 rounded-xl bg-neutral-50 px-3 py-2.5">
                        {g.times > 1 ? (
                            <span className="mt-px shrink-0 rounded-md bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
                                {g.times}×
                            </span>
                        ) : numbered ? (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[11px] font-semibold tabular-nums text-neutral-500 ring-1 ring-inset ring-neutral-200">
                                {n + 1}
                            </span>
                        ) : null}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <RepBody rep={g.rep} />
                            {g.times > 1 && start !== undefined && (
                                <SwitchTimes rep={g.rep} times={g.times} start={start} />
                            )}
                        </div>
                        {start !== undefined && end !== undefined && end > start && (
                            <span className="shrink-0 pt-0.5 text-xs tabular-nums text-neutral-500">
                                {clock(start)}–{clock(end)}
                            </span>
                        )}
                    </li>
                )
            })}
        </ol>
    )
}
