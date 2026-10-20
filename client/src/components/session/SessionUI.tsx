import { useCallback, useState, type ReactNode } from 'react'
import PhaseHeading from '../PhaseHeading'
import type { SessionPhase } from '../../types'

/**
 * The parts a strength workout and a conditioning session are both drawn with,
 * wherever one is opened: a strip of headline numbers, each phase as a timeline
 * of item cards, and an item's own sub-list of steps to tick off. Shared so the
 * planner drawer, the strength logger and the session library read as one.
 */

// ─── Headline numbers ───────────────────────────────────────────────────────────

export interface Stat {
    icon: string
    label: string
    value: ReactNode
}

/** Two to four headline numbers in soft tiles, e.g. duration · parts · category. */
export function StatStrip({ stats }: { stats: Stat[] }) {
    if (stats.length === 0) return null
    return (
        <dl
            className={`grid gap-2 ${stats.length >= 4 ? 'grid-cols-2 sm:grid-cols-4' : stats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
            {stats.map((s) => (
                <div key={s.label} className="flex min-w-0 flex-col gap-1 rounded-2xl bg-neutral-50 px-3.5 py-3">
                    <dt className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                        <i className={`${s.icon} text-[10px]`} aria-hidden="true" />
                        <span className="truncate">{s.label}</span>
                    </dt>
                    <dd className="truncate text-base font-semibold tabular-nums tracking-tight text-neutral-900">
                        {s.value}
                    </dd>
                </div>
            ))}
        </dl>
    )
}

/** The session's purpose or description, set as a lead paragraph. */
export function LeadText({ children }: { children?: ReactNode }) {
    if (!children) return null
    return (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700">{children}</p>
    )
}

/** A quiet titled note, e.g. "How to use" at the end of a session. */
export function NoteBlock({
    icon,
    title,
    children,
}: {
    icon: string
    title: string
    children: ReactNode
}) {
    return (
        <section className="rounded-2xl bg-neutral-50 px-4 py-4">
            <p className="mb-1.5 inline-flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <i className={`${icon} text-xs text-neutral-500`} aria-hidden="true" />
                {title}
            </p>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">
                {children}
            </div>
        </section>
    )
}

// ─── Phases as a timeline ───────────────────────────────────────────────────────

/** One phase: its heading, then its items strung on a timeline rail. */
export function PhaseTimeline({
    phase,
    meta,
    children,
}: {
    phase: SessionPhase
    meta?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="flex flex-col gap-4">
            <PhaseHeading phase={phase} meta={meta} />
            <ol className="flex flex-col">{children}</ol>
        </section>
    )
}

/** Where an item stands while a session is under way. */
export type ItemState = 'todo' | 'next' | 'done' | 'plain'

const NODE: Record<ItemState, string> = {
    plain: 'bg-white text-neutral-500 ring-1 ring-inset ring-neutral-200',
    todo: 'bg-white text-neutral-500 ring-1 ring-inset ring-neutral-200',
    next: 'bg-coral-500 text-white ring-4 ring-coral-100',
    done: 'bg-emerald-600 text-white',
}

const CARD: Record<ItemState, string> = {
    plain: 'border-neutral-200 bg-white',
    todo: 'border-neutral-200 bg-white',
    next: 'border-coral-200 bg-white shadow-[0_1px_2px_rgba(26,25,23,0.04),0_8px_24px_-12px_rgba(224,41,74,0.25)]',
    done: 'border-neutral-200 bg-neutral-50/70',
}

/**
 * One item on a phase's timeline: a numbered node on the rail (a tick once it's
 * done, coral when it's the one you're on) and a card holding everything about
 * it. `title` and `aside` make the card's top row; the rest stacks under it.
 */
export function TimelineItem({
    number,
    state = 'plain',
    last = false,
    title,
    subtitle,
    aside,
    children,
    itemRef,
}: {
    number: number
    state?: ItemState
    /** The phase's last item — the rail stops at its node. */
    last?: boolean
    title: ReactNode
    /** A line under the name — the prescription, a summary. */
    subtitle?: ReactNode
    /** Top-right of the card: the slot chip, a video, actions. */
    aside?: ReactNode
    children?: ReactNode
    itemRef?: (el: HTMLLIElement | null) => void
}) {
    return (
        <li ref={itemRef} className="relative flex gap-3 pb-4 last:pb-0 sm:gap-4">
            {!last && (
                <span
                    className={`absolute bottom-0 left-[15px] top-9 w-0.5 rounded-full ${state === 'done' ? 'bg-emerald-200' : 'bg-neutral-100'}`}
                    aria-hidden="true"
                />
            )}
            <span
                className={`relative z-[1] mt-3 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors ${NODE[state]}`}
            >
                {state === 'done' ? (
                    <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
                ) : (
                    number
                )}
            </span>
            <div
                className={`flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] sm:p-5 ${CARD[state]}`}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p
                            className={`text-[15px] font-semibold leading-snug tracking-[-0.01em] ${state === 'done' ? 'text-neutral-600' : 'text-neutral-900'}`}
                        >
                            {title}
                        </p>
                        {subtitle && (
                            <div className="mt-1 text-[13px] text-neutral-500">{subtitle}</div>
                        )}
                    </div>
                    {aside && <div className="flex shrink-0 items-center gap-1">{aside}</div>}
                </div>
                {children}
            </div>
        </li>
    )
}

/** An item's free-text detail, e.g. "0.5% incline, 4.2 km/h". */
export function ItemDetail({ children }: { children?: ReactNode }) {
    if (!children) return null
    return <p className="-mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-600">{children}</p>
}

/** A coaching cue on an item, set apart from its detail. */
export function ItemCue({ children }: { children?: ReactNode }) {
    if (!children) return null
    return (
        <p className="-mt-1 flex gap-2 text-sm leading-relaxed text-neutral-600">
            <i className="fa-solid fa-quote-left mt-1 text-[10px] text-neutral-400" aria-hidden="true" />
            <span className="whitespace-pre-wrap">{children}</span>
        </p>
    )
}

// ─── Sub-list of steps ──────────────────────────────────────────────────────────

/**
 * An item's sub-list — the drills inside a warm-up block, say. With `onToggle`
 * each step is a big row to tick off; without, it's a numbered list to read.
 */
export function StepChecklist({
    steps,
    ticked = [],
    onToggle,
}: {
    steps?: string[]
    /** Indices of the steps ticked off. */
    ticked?: number[]
    onToggle?: (step: number) => void
}) {
    if (!steps?.length) return null
    const done = steps.filter((_, i) => ticked.includes(i)).length
    const all = done === steps.length

    return (
        <div className="rounded-xl bg-neutral-50 p-1.5">
            <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                    {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                </span>
                {onToggle && (
                    <span
                        className={`text-xs font-semibold tabular-nums ${all ? 'text-emerald-700' : 'text-neutral-500'}`}
                    >
                        {all ? 'All done' : `${done}/${steps.length}`}
                    </span>
                )}
            </div>
            <ul className="flex flex-col">
                {steps.map((step, i) => {
                    const on = ticked.includes(i)
                    if (!onToggle) {
                        return (
                            <li key={i} className="flex gap-3 px-2.5 py-2 text-sm text-neutral-700">
                                <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums leading-5 text-neutral-400">
                                    {i + 1}
                                </span>
                                <span className="min-w-0">{step}</span>
                            </li>
                        )
                    }
                    return (
                        <li key={i}>
                            <button
                                type="button"
                                onClick={() => onToggle(i)}
                                aria-pressed={on}
                                className="flex min-h-11 w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left text-sm transition-colors hover:bg-white active:bg-neutral-100"
                            >
                                <span
                                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors ${
                                        on
                                            ? 'border-emerald-600 bg-emerald-600 text-white'
                                            : 'border-neutral-300 bg-white text-transparent'
                                    }`}
                                >
                                    <i className="fa-solid fa-check text-[9px]" aria-hidden="true" />
                                </span>
                                <span
                                    className={`min-w-0 ${on ? 'text-neutral-400 line-through decoration-neutral-300' : 'text-neutral-800'}`}
                                >
                                    {step}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

/**
 * The sub-list editor in a workout or session builder: one step per line.
 * Blank lines are kept while typing and dropped when the item is saved.
 */
export function StepsInput({
    steps,
    label,
    onChange,
}: {
    steps?: string[]
    /** What the steps belong to, for the field's accessible name. */
    label: string
    onChange: (steps: string[] | undefined) => void
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-neutral-700">
                Sub-list <span className="font-normal text-neutral-500">· one step per line, ticked off in the gym</span>
            </span>
            <textarea
                aria-label={`Sub-list for ${label}`}
                rows={Math.min(8, Math.max(2, (steps?.length ?? 0) + 1))}
                placeholder={'Leg swings ×10 each side\nHip circles ×10\nBodyweight squats ×15'}
                value={steps?.join('\n') ?? ''}
                onChange={(e) => {
                    const v = e.target.value
                    onChange(v === '' ? undefined : v.split('\n'))
                }}
                className="w-full resize-y rounded-[10px] border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 hover:border-neutral-300 focus:border-neutral-900 focus:ring-4 focus:ring-neutral-100 focus-visible:outline-none"
            />
        </label>
    )
}

/** A sub-list as it's saved: trimmed, blank lines out, absent when empty. */
export function cleanSteps(steps?: string[]): string[] | undefined {
    const out = steps?.map((s) => s.trim()).filter(Boolean) ?? []
    return out.length ? out : undefined
}

// ─── Step ticks, kept on the device ─────────────────────────────────────────────

const TICKS_PREFIX = 'stepTicks:'
/** Ticks from yesterday's session don't carry into today's. */
const TICKS_TTL_MS = 24 * 60 * 60 * 1000

type Ticks = Record<number, number[]>

function readTicks(key: string): Ticks {
    try {
        const raw = localStorage.getItem(TICKS_PREFIX + key)
        if (!raw) return {}
        const parsed = JSON.parse(raw) as { ticks?: unknown; savedAt?: unknown }
        if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TICKS_TTL_MS)
            return {}
        const out: Ticks = {}
        if (parsed.ticks && typeof parsed.ticks === 'object') {
            for (const [k, v] of Object.entries(parsed.ticks as Record<string, unknown>)) {
                const i = Number(k)
                if (Number.isInteger(i) && Array.isArray(v))
                    out[i] = v.filter((n): n is number => Number.isInteger(n))
            }
        }
        return out
    } catch {
        return {}
    }
}

function writeTicks(key: string, ticks: Ticks): void {
    try {
        localStorage.setItem(TICKS_PREFIX + key, JSON.stringify({ ticks, savedAt: Date.now() }))
    } catch {
        /* best-effort */
    }
}

/**
 * Which steps of each item's sub-list are ticked, by item index. Kept on the
 * device under `key` (the planned session) so a locked phone or the drawer
 * closing between drills loses nothing. A null key keeps nothing.
 */
export function useStepTicks(key: string | null) {
    const [ticks, setTicks] = useState<Ticks>(() => (key ? readTicks(key) : {}))
    // A different session: pick up its ticks (set during render, not in an effect).
    const [loadedKey, setLoadedKey] = useState(key)
    if (loadedKey !== key) {
        setLoadedKey(key)
        setTicks(key ? readTicks(key) : {})
    }

    const toggle = useCallback(
        (item: number, step: number) => {
            setTicks((prev) => {
                const cur = prev[item] ?? []
                const next = {
                    ...prev,
                    [item]: cur.includes(step) ? cur.filter((s) => s !== step) : [...cur, step],
                }
                if (key) writeTicks(key, next)
                return next
            })
        },
        [key]
    )

    /** Untick everything — the session was marked not done, so it starts over. */
    const reset = useCallback(() => {
        if (key) clearTicks(key)
        setTicks({})
    }, [key])

    return { ticks, toggle, reset }
}

/** Forget the step ticks kept under `key`. */
export function clearTicks(key: string): void {
    try {
        localStorage.removeItem(TICKS_PREFIX + key)
    } catch {
        /* best-effort */
    }
}

/** The tick key for a workout on a day — shared by the planner drawer and the logger. */
export function workoutStepsKey(workoutId: string, date: string): string {
    return `workout:${workoutId}:${date}`
}
