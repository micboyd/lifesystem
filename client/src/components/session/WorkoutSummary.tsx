import { PhaseLabel } from '../PhaseHeading'
import type { LoggedSet, SessionPhase, WorkoutLog } from '../../types'

/**
 * The strength session read-out: a strip of totals and one row per exercise
 * with what was done. The logger's wrap-up step and a logged workout opened
 * from the history share it, so a finished session looks the same either way.
 */

export type SummaryProgress = 'none' | 'some' | 'all'

export interface SummaryRow {
    key: string | number
    name: string
    /** Rows are grouped under phase labels when any of them isn't main work. */
    phase?: SessionPhase
    progress: SummaryProgress
    /** The sets as done, one pill each — e.g. "60 kg × 8". */
    sets?: string[]
    /** Shown instead of the pills when there are none — e.g. "Done", "Nothing ticked yet". */
    detail: string
    /** A small grey note under the name, e.g. "Swapped in for Bench press". */
    note?: string
    /** Makes the row a button (the wrap-up jumps back to the exercise). */
    onClick?: () => void
}

/** The session's totals as one compact strip, a column per figure. */
export function SummaryStats({
    items,
}: {
    items: { label: string; value: string | number; unit?: string }[]
}) {
    return (
        <dl className="grid grid-flow-col auto-cols-fr divide-x divide-neutral-200 rounded-2xl bg-neutral-50 py-3">
            {items.map((s) => (
                <div key={s.label} className="flex min-w-0 flex-col items-center gap-0.5 px-2">
                    <dt className="order-last text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        {s.label}
                    </dt>
                    <dd className="truncate text-lg font-semibold tabular-nums text-neutral-900">
                        {s.value}
                        {s.unit && (
                            <span className="ml-0.5 text-xs font-medium text-neutral-500">
                                {s.unit}
                            </span>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    )
}

const PHASE_ORDER: SessionPhase[] = ['warmUp', 'main', 'coolDown']

/**
 * One row per exercise: a progress tick, the name, then each set as a pill so
 * a long session wraps neatly on a phone. Grouped by phase when the session
 * has a warm-up or cool-down.
 */
export function SummaryExerciseList({ rows }: { rows: SummaryRow[] }) {
    if (rows.length === 0) return null
    const grouped = rows.some((r) => (r.phase ?? 'main') !== 'main')
    if (!grouped) return <RowList rows={rows} />
    return (
        <div className="flex flex-col gap-5">
            {PHASE_ORDER.map((phase) => {
                const group = rows.filter((r) => (r.phase ?? 'main') === phase)
                if (group.length === 0) return null
                return (
                    <section key={phase} className="flex flex-col gap-2">
                        <PhaseLabel phase={phase} meta={group.length} />
                        <RowList rows={group} />
                    </section>
                )
            })}
        </div>
    )
}

function RowList({ rows }: { rows: SummaryRow[] }) {
    return (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200">
            {rows.map((r) => {
                const body = (
                    <>
                        <span
                            className={`mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] ${
                                r.progress === 'all'
                                    ? 'bg-emerald-600 text-white'
                                    : r.progress === 'some'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-neutral-100 text-neutral-400'
                            }`}
                        >
                            <i
                                className={`fa-solid ${r.progress === 'none' ? 'fa-minus' : 'fa-check'}`}
                                aria-hidden="true"
                            />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-sm font-semibold leading-snug text-neutral-900">
                                {r.name}
                            </span>
                            {r.note && (
                                <span className="text-[11px] text-neutral-400">{r.note}</span>
                            )}
                            {r.sets?.length ? (
                                <span className="mt-0.5 flex flex-wrap gap-1.5">
                                    {r.sets.map((s, i) => (
                                        <span
                                            key={i}
                                            className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-neutral-700"
                                        >
                                            {s}
                                        </span>
                                    ))}
                                </span>
                            ) : (
                                <span className="text-xs text-neutral-500">{r.detail}</span>
                            )}
                        </span>
                    </>
                )
                return (
                    <li key={r.key}>
                        {r.onClick ? (
                            <button
                                type="button"
                                onClick={r.onClick}
                                className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                            >
                                {body}
                                <i
                                    className="fa-solid fa-chevron-right self-center text-[11px] text-neutral-300"
                                    aria-hidden="true"
                                />
                            </button>
                        ) : (
                            <div className="flex w-full items-start gap-3 px-4 py-3">{body}</div>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

// ─── Last time ──────────────────────────────────────────────────────────────────

export interface LastTime {
    date: string
    weight: number
    reps?: number
}

/**
 * The heaviest set from the most recent session that recorded a weight for an
 * exercise, matched by name (logs snapshot names, not ids). `excludeId` keeps
 * the session being logged right now out of it.
 */
export function lastTimeFor(
    logs: WorkoutLog[],
    name: string,
    excludeId?: string | null
): LastTime | null {
    const want = name.trim().toLowerCase()
    const sorted = [...logs].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)
    )
    for (const log of sorted) {
        if (log._id === excludeId) continue
        let best: LoggedSet | undefined
        for (const ex of log.exercises) {
            if (ex.name.trim().toLowerCase() !== want) continue
            for (const s of ex.loggedSets ?? []) {
                if (s.weight == null) continue
                if (
                    !best ||
                    s.weight > best.weight! ||
                    (s.weight === best.weight && (s.reps ?? 0) > (best.reps ?? 0))
                )
                    best = s
            }
        }
        if (best) return { date: log.date, weight: best.weight!, reps: best.reps }
    }
    return null
}

// ─── Next time ──────────────────────────────────────────────────────────────────

export interface Suggestion {
    weight: number
    /** Reps to aim for, when the target says. */
    reps?: number
    /** Going up in weight, or staying put to beat the reps first. */
    kind: 'up' | 'hold'
    why: string
}

/** Kit loaded a plate a side, so the smallest sensible jump is 5 kg each side. */
const PAIRED = new Set(['Barbell', 'Smith machine'])

/** "8-12" → { low: 8, high: 12 }, "8" → { low: 8, high: 8 }; null for AMRAP and the like. */
function repRange(reps?: string): { low: number; high: number } | null {
    const m = reps?.trim().match(/^(\d+)\s*(?:[-–]\s*(\d+))?$/)
    if (!m) return null
    const low = Number(m[1])
    return { low, high: m[2] ? Number(m[2]) : low }
}

/**
 * Today's target from last time's top set, by double progression in whole
 * 5 kg steps (10 kg on a barbell — 5 a side). Hit the top of the rep target
 * and the weight goes up; fall short and it stays put while the reps catch up.
 */
export function suggestNext(
    last: LastTime,
    targetReps: string | undefined,
    equipment: string
): Suggestion {
    const step = PAIRED.has(equipment) ? 10 : 5
    const range = repRange(targetReps)
    // Odd loads (62.5) round up onto the 5 kg grid before anything else.
    const base = Math.ceil(last.weight / 5) * 5
    const up = (why: string): Suggestion => ({
        weight: base === last.weight ? base + step : base,
        reps: range?.low,
        kind: 'up',
        why,
    })
    if (last.reps == null || !range) return up('Add a little on.')
    if (last.reps >= range.high) return up(`You hit ${last.reps} reps last time.`)
    return {
        weight: last.weight,
        reps: Math.min(range.high, Math.max(range.low, last.reps + 1)),
        kind: 'hold',
        why: `Beat ${last.reps} reps before adding weight.`,
    }
}
