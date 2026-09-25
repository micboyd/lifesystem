import { useRef, type ReactNode, type TouchEvent } from 'react'
import Button from '../Button'
import DatePicker from '../DatePicker'
import { parseDateKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'

/**
 * The building blocks shared by the week planners (Fitness and Nutrition): a
 * gradient hero with week navigation, a progress ring, a seven-day strip, a
 * sticky edit bar and the swipe that moves a phone between days. Each planner
 * supplies its own numbers; these keep the two looking and behaving alike.
 */

// ─── Layout helpers ─────────────────────────────────────────────────────────────

/** Phones show one day at a time; from `md` up the whole week is a feed. */
const WIDE_QUERY = '(min-width: 768px)'
export const isWide = () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches

/** The DOM id a planner gives each day card, so the strip can scroll to it. */
export const dayCardId = (scope: string, date: string) => `${scope}-day-${date}`

/** Scroll a day card into view — the strip's job on wide screens. */
export function scrollToDay(scope: string, date: string) {
    document
        .getElementById(dayCardId(scope, date))
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** "This week", "Next week", "In 3 weeks", "2 weeks ago" — `weekStart` relative to `todayMonday`. */
export function relativeWeekLabel(weekStart: string, todayMonday: string): string {
    const a = parseDateKey(weekStart)
    const b = parseDateKey(todayMonday)
    const diff = Math.round(
        (Date.UTC(a.year, a.month, a.day) - Date.UTC(b.year, b.month, b.day)) / (7 * 86_400_000)
    )
    if (diff === 0) return 'This week'
    if (diff === 1) return 'Next week'
    if (diff === -1) return 'Last week'
    return diff > 0 ? `In ${diff} weeks` : `${-diff} weeks ago`
}

/**
 * Swipe left/right to move a day on a phone. Returns touch handlers for the
 * day area; wide screens ignore them (every day is already on show there).
 */
export function useDaySwipe(onSwipe: (dir: -1 | 1) => void) {
    const touch = useRef<{ x: number; y: number } | null>(null)
    return {
        onTouchStart: (e: TouchEvent) => {
            const p = e.touches[0]
            touch.current = { x: p.clientX, y: p.clientY }
        },
        onTouchEnd: (e: TouchEvent) => {
            const start = touch.current
            touch.current = null
            if (!start || isWide()) return
            const p = e.changedTouches[0]
            const dx = p.clientX - start.x
            const dy = p.clientY - start.y
            // A deliberate, mostly-horizontal flick — not a scroll that drifted.
            if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
            onSwipe(dx < 0 ? 1 : -1)
        },
    }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The top of a planner: week navigation and title on the left, a ring on the
 * right, then whatever the planner stacks beneath (stats, strip, actions).
 */
export function WeekHero({
    title,
    subtitle,
    isThisWeek,
    onStep,
    onToday,
    ring,
    children,
}: {
    title: string
    subtitle: string
    isThisWeek: boolean
    onStep: (dir: -1 | 1) => void
    onToday: () => void
    ring: ReactNode
    children: ReactNode
}) {
    return (
        <HeroShell>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <HeroIconButton
                            label="Previous week"
                            icon="fa-solid fa-chevron-left"
                            onClick={() => onStep(-1)}
                        />
                        <HeroIconButton
                            label="Next week"
                            icon="fa-solid fa-chevron-right"
                            onClick={() => onStep(1)}
                        />
                        {!isThisWeek && (
                            <button
                                type="button"
                                onClick={onToday}
                                className="ml-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/25"
                            >
                                Today
                            </button>
                        )}
                    </div>
                    <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
                    <p className="mt-1 text-sm font-medium text-white/60">{subtitle}</p>
                </div>
                {ring}
            </div>
            {children}
        </HeroShell>
    )
}

/** The gradient panel behind a hero, for planners that lay out their own top. */
export function HeroShell({ children }: { children: ReactNode }) {
    return (
        <section className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 text-white shadow-[0_18px_40px_-20px_rgba(1,61,90,0.6)]">
            {/* Soft glows for depth — purely decorative. */}
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl"
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-coral-500/20 blur-3xl"
            />
            <div className="relative flex flex-col gap-5 p-5 sm:p-7">{children}</div>
        </section>
    )
}

function HeroIconButton({
    icon,
    label,
    onClick,
}: {
    icon: string
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white active:bg-white/25"
        >
            <i className={`${icon} text-xs`} aria-hidden="true" />
        </button>
    )
}

/** A pill on the hero — a stat, a count, a phase. */
export function HeroChip({
    children,
    className = '',
}: {
    children: ReactNode
    className?: string
}) {
    return (
        <span
            className={`inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-inset ring-white/10 ${className}`}
        >
            {children}
        </span>
    )
}

/** A hero action: `primary` is the solid white one, the rest are glassy. */
export function HeroButton({
    icon,
    children,
    onClick,
    primary = false,
    disabled = false,
}: {
    icon: string
    children: ReactNode
    onClick: () => void
    primary?: boolean
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all disabled:opacity-60 ${
                primary
                    ? 'bg-white text-brand-700 shadow-sm hover:scale-[1.02] active:scale-[0.98]'
                    : 'bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/20'
            }`}
        >
            <i className={`${icon} text-xs`} aria-hidden="true" />
            {children}
        </button>
    )
}

/** The hero's "Jump to…" date picker — any day jumps to the week holding it. */
export function HeroJumpPicker({
    value,
    onPick,
    className = '',
}: {
    value: string
    onPick: (date: string) => void
    className?: string
}) {
    return (
        <DatePicker
            value={value}
            displayLabel="Jump to…"
            clearable={false}
            onChange={(v) => {
                if (typeof v === 'string' && v) onPick(v)
            }}
            className={`w-[9.5rem] [&>button]:rounded-full [&>button]:border-white/15 [&>button]:bg-white/10 [&>button]:py-2 [&>button]:text-white [&>button:hover]:bg-white/20 [&_i]:text-white/60 [&_span]:text-white ${className}`}
        />
    )
}

/** A ring filling from `value` toward `max`, with the count in its centre. */
export function ProgressRing({
    value,
    max,
    label,
    completeLabel,
}: {
    value: number
    max: number
    /** The word under the count, e.g. "done" or "logged". */
    label: string
    /** Screen-reader text once the ring is full. */
    completeLabel: string
}) {
    const r = 30
    const c = 2 * Math.PI * r
    const pct = max > 0 ? Math.min(1, value / max) : 0
    const complete = max > 0 && value >= max
    return (
        <div className="relative grid h-20 w-20 shrink-0 place-items-center sm:h-24 sm:w-24">
            <svg
                viewBox="0 0 72 72"
                className="absolute inset-0 h-full w-full -rotate-90"
                aria-hidden="true"
            >
                <circle
                    cx="36"
                    cy="36"
                    r={r}
                    fill="none"
                    strokeWidth="6"
                    className="stroke-white/15"
                />
                <circle
                    cx="36"
                    cy="36"
                    r={r}
                    fill="none"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={c * (1 - pct)}
                    className={`transition-[stroke-dashoffset] duration-700 ease-out ${
                        complete ? 'stroke-emerald-400' : 'stroke-white'
                    }`}
                />
            </svg>
            <div className="text-center leading-none">
                {complete ? (
                    <i
                        className="fa-solid fa-check text-xl text-emerald-300"
                        aria-label={completeLabel}
                    />
                ) : (
                    <>
                        <p className="text-lg font-bold tabular-nums sm:text-xl">
                            {value}
                            <span className="text-white/50">/{max}</span>
                        </p>
                        <p className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-white/50">
                            {label}
                        </p>
                    </>
                )}
            </div>
        </div>
    )
}

// ─── Day strip ────────────────────────────────────────────────────────────────

/** The seven-day strip's frame. */
export function DayStrip({ children, light = false }: { children: ReactNode; light?: boolean }) {
    return (
        <div
            className={`grid grid-cols-7 gap-1 rounded-2xl p-1 sm:gap-1.5 sm:p-1.5 ${
                light ? 'bg-neutral-100' : 'bg-black/15'
            }`}
        >
            {children}
        </div>
    )
}

/** One day in the hero's strip: weekday, date, a row of coloured dots and badges. */
export function DayPill({
    date,
    active,
    isToday,
    dots,
    allDone,
    alert = false,
    light = false,
    onClick,
}: {
    date: string
    active: boolean
    isToday: boolean
    /** Background classes, one per dot. */
    dots: string[]
    allDone: boolean
    alert?: boolean
    /** For a strip on a white card rather than the hero. */
    light?: boolean
    onClick: () => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${weekday} ${day} ${MONTHS[month]}`}
            aria-current={active ? 'date' : undefined}
            className={`relative flex flex-col items-center gap-1 rounded-xl py-2 transition-all sm:py-2.5 ${
                active
                    ? 'bg-white text-brand-700 shadow-md'
                    : light
                      ? 'text-neutral-700 hover:bg-white/70'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
        >
            <span
                className={`text-[10px] font-semibold uppercase tracking-wider ${
                    active ? 'text-brand-500' : light ? 'text-neutral-400' : 'text-white/50'
                }`}
            >
                <span className="sm:hidden">{weekday.slice(0, 1)}</span>
                <span className="hidden sm:inline">{weekday.slice(0, 3)}</span>
            </span>
            <span
                className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold tabular-nums sm:h-8 sm:w-8 sm:text-base ${
                    isToday ? 'bg-coral-500 text-white' : ''
                }`}
            >
                {day}
            </span>
            <span className="flex h-1.5 items-center gap-0.5">
                {dots.map((cls, i) => (
                    <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${cls} ${active || light ? '' : 'ring-1 ring-white/20'}`}
                    />
                ))}
            </span>
            {allDone && (
                <span
                    className={`absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ${
                        light ? 'ring-neutral-100' : 'ring-brand-600'
                    }`}
                    title="All done"
                >
                    <i className="fa-solid fa-check text-[8px]" aria-hidden="true" />
                </span>
            )}
            {alert && !allDone && (
                <span
                    className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-brand-600"
                    title="Needs a look"
                />
            )}
        </button>
    )
}

// ─── Edit bar ─────────────────────────────────────────────────────────────────

/**
 * Pinned under the hero while editing (and below the phone header), so "Done"
 * stays in reach however far down the week the edit has scrolled.
 */
export function EditBar({
    children,
    onCancel,
    onDone,
    busy = false,
}: {
    children?: ReactNode
    /** Omit when the planner's edits can't be rolled back. */
    onCancel?: () => void
    onDone: () => void
    busy?: boolean
}) {
    return (
        <div className="sticky top-16 z-30 flex flex-wrap items-center gap-2 rounded-2xl bg-white/90 p-2 pl-4 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/[0.06] backdrop-blur-md lg:top-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-coral-500" />
                </span>
                Editing
            </span>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                {children}
                {onCancel && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
                        {busy ? 'Undoing…' : 'Cancel'}
                    </Button>
                )}
                <Button
                    variant="primary"
                    size="sm"
                    icon="fa-solid fa-check"
                    disabled={busy}
                    onClick={onDone}
                >
                    Done
                </Button>
            </div>
        </div>
    )
}

// ─── Day card pieces ──────────────────────────────────────────────────────────

/** The square date badge that opens every day card — coral for today. */
export function DayBadge({ date, isToday }: { date: string; isToday: boolean }) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return (
        <div
            className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl leading-none ${
                isToday ? 'bg-coral-500 text-white' : 'bg-neutral-100 text-neutral-900'
            }`}
        >
            <div className="text-center">
                <p
                    className={`text-[9px] font-bold uppercase tracking-wider ${
                        isToday ? 'text-white/80' : 'text-neutral-400'
                    }`}
                >
                    {weekday.slice(0, 3)}
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{day}</p>
            </div>
        </div>
    )
}

/** The shell of a day card — the white rounded panel, today ringed in coral. */
export function DayCardShell({
    id,
    isToday,
    className = '',
    children,
}: {
    id: string
    isToday: boolean
    className?: string
    children: ReactNode
}) {
    return (
        <section
            id={id}
            className={`relative scroll-mt-32 flex-col gap-4 overflow-hidden rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-5 ${
                isToday ? 'ring-2 ring-coral-200' : 'ring-1 ring-black/[0.06]'
            } ${className}`}
        >
            {children}
        </section>
    )
}

/** The "swipe to change day" nudge under a phone's single day. */
export function SwipeHint() {
    return (
        <p className="text-center text-[11px] text-neutral-400 md:hidden">
            <i className="fa-solid fa-arrows-left-right mr-1.5 text-[10px]" aria-hidden="true" />
            Swipe to change day
        </p>
    )
}
