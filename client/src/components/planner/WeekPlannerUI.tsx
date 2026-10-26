import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type ReactNode,
    type TouchEvent,
} from 'react'
import { parseDateKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'

/**
 * The building blocks shared by the week planners (Fitness and Nutrition): a
 * gradient hero with week navigation, a progress ring, a seven-day strip and
 * the swipe that moves a phone between days. Each planner supplies its own
 * numbers; these keep the two looking and behaving alike. The day cards'
 * slots, rows, menus and banners live in PlannerParts.
 */

// ─── Layout helpers ─────────────────────────────────────────────────────────────

/** Phones show one day at a time; from `md` up the whole week is a feed. */
const WIDE_QUERY = '(min-width: 768px)'
export const isWide = () => typeof window !== 'undefined' && window.matchMedia(WIDE_QUERY).matches

/** From `lg` up there's room for the whole week side by side. */
export const LARGE_QUERY = '(min-width: 1024px)'

/** Whether a media query matches, kept live as the window resizes. */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mq = window.matchMedia(query)
            mq.addEventListener('change', onChange)
            return () => mq.removeEventListener('change', onChange)
        },
        () => window.matchMedia(query).matches,
        () => false
    )
}

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

/** How long a day takes to slide across on a phone — matches `.day-slide-*` in index.css. */
const SLIDE_MS = 300

/** How far (px) a finger has to drag a day before letting go moves to the next one. */
const SWIPE_COMMIT = 60

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A phone's one-day-at-a-time view as a carousel. The day follows the finger
 * while dragged; let go far enough and it carries on off-screen while the next
 * one slides in behind it — the same slide plays when a day is picked from the
 * strip, in the direction of travel. Wide screens show every day, so they get
 * none of it.
 *
 * Spread `sliderProps` on the element holding the day cards and give each card
 * `dayClass(date)` for its visibility.
 */
export function useDaySlider(selected: string, onSwipe: (dir: -1 | 1) => void) {
    const el = useRef<HTMLDivElement>(null)
    const touch = useRef<{ x: number; y: number; axis: 'x' | 'y' | null } | null>(null)
    // Where the finger left the day, so the slide-out picks up from there.
    const releasedAt = useRef(0)

    // The day leaving, and which way — `dir` 1 means moving forward in time.
    const [slide, setSlide] = useState<{ from: string; dir: 1 | -1; fromX: number } | null>(null)
    const [shown, setShown] = useState(selected)
    if (shown !== selected) {
        setShown(selected)
        setSlide(
            isWide() || reducedMotion()
                ? null
                : { from: shown, dir: selected > shown ? 1 : -1, fromX: releasedAt.current }
        )
        releasedAt.current = 0
    }
    useEffect(() => {
        if (!slide) return
        const t = setTimeout(() => setSlide(null), SLIDE_MS)
        return () => clearTimeout(t)
    }, [slide])

    const setDrag = (px: number) => el.current?.style.setProperty('--day-dx', `${px}px`)

    const sliderProps = {
        ref: el,
        style: { '--day-from': `${slide?.fromX ?? 0}px` } as CSSProperties,
        onTouchStart: (e: TouchEvent) => {
            const p = e.touches[0]
            touch.current = { x: p.clientX, y: p.clientY, axis: null }
        },
        onTouchMove: (e: TouchEvent) => {
            const t = touch.current
            if (!t || isWide()) return
            const p = e.touches[0]
            const dx = p.clientX - t.x
            const dy = p.clientY - t.y
            // Lock to an axis once the finger has clearly picked one, so a
            // scroll down the day never wobbles it sideways.
            if (!t.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
                t.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
                if (t.axis === 'x') el.current?.setAttribute('data-dragging', '')
            }
            if (t.axis === 'x') setDrag(dx)
        },
        onTouchEnd: (e: TouchEvent) => {
            const t = touch.current
            touch.current = null
            el.current?.removeAttribute('data-dragging')
            setDrag(0)
            if (!t || t.axis !== 'x' || isWide()) return
            const dx = e.changedTouches[0].clientX - t.x
            // Not far enough — the day springs back to centre.
            if (Math.abs(dx) < SWIPE_COMMIT) return
            releasedAt.current = dx
            onSwipe(dx < 0 ? 1 : -1)
        },
    }

    /** A day card's classes: the focused day (sliding in, if it just arrived), the one sliding out, or hidden. */
    function dayClass(date: string): string {
        if (date === selected) {
            if (!slide) return 'flex day-slide-current'
            return `flex day-slide-in-${slide.dir === 1 ? 'next' : 'prev'}`
        }
        if (slide && date === slide.from) {
            return `flex day-slide-out-${slide.dir === 1 ? 'next' : 'prev'}`
        }
        return 'hidden md:flex'
    }

    return { sliderProps, dayClass }
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * How loud a hero is: `dark` is the near-black panel, `soft` no panel at all —
 * just the controls in dark type on the page. The hero's pieces read it from context, so only the shell
 * needs telling.
 */
export type HeroTone = 'dark' | 'soft'
const HeroToneContext = createContext<HeroTone>('dark')
const useSoftHero = () => useContext(HeroToneContext) === 'soft'

/** The panel behind a hero, for planners that lay out their own top. */
export function HeroShell({ tone = 'dark', children }: { tone?: HeroTone; children: ReactNode }) {
    const soft = tone === 'soft'
    return (
        <HeroToneContext.Provider value={tone}>
            <section
                className={
                    soft
                        ? 'text-neutral-900'
                        : 'relative overflow-hidden rounded-3xl bg-neutral-900 text-neutral-50'
                }
            >
                <div
                    className={`relative flex flex-col ${soft ? 'gap-5 sm:gap-3' : 'gap-5 p-5 sm:p-7'}`}
                >
                    {children}
                </div>
            </section>
        </HeroToneContext.Provider>
    )
}

/** A square icon-only hero button; `primary` is the solid one. */
export function HeroIconButton({
    icon,
    label,
    onClick,
    primary = false,
    disabled = false,
}: {
    icon: string
    label: string
    onClick: () => void
    primary?: boolean
    disabled?: boolean
}) {
    const soft = useSoftHero()
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors sm:h-9 sm:w-9 disabled:opacity-60 ${
                primary
                    ? soft
                        ? 'bg-neutral-900 text-white hover:bg-neutral-800'
                        : 'bg-white text-neutral-900 hover:bg-neutral-100'
                    : soft
                      ? 'bg-white text-neutral-600 ring-1 ring-neutral-900/[0.06] hover:text-neutral-900'
                      : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white active:bg-white/25'
            }`}
        >
            <i className={`${icon} text-xs`} aria-hidden="true" />
        </button>
    )
}

/** A hero action: `primary` is the solid white one, the rest are glassy. */
export function HeroButton({
    icon,
    children,
    onClick,
    primary = false,
    disabled = false,
    iconOnlyOnPhone = false,
}: {
    icon: string
    children: ReactNode
    onClick: () => void
    primary?: boolean
    disabled?: boolean
    /** Hide the words below `sm`, leaving just the icon (they become its label). */
    iconOnlyOnPhone?: boolean
}) {
    const soft = useSoftHero()
    const look = soft
        ? primary
            ? 'rounded-xl bg-neutral-900 text-white hover:bg-neutral-800'
            : 'rounded-xl bg-white text-neutral-700 ring-1 ring-inset ring-neutral-900/[0.06] hover:text-neutral-900'
        : primary
          ? 'rounded-full bg-white text-neutral-900 hover:bg-neutral-100'
          : 'rounded-full bg-white/10 text-white ring-1 ring-inset ring-white/15 hover:bg-white/20'
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={iconOnlyOnPhone && typeof children === 'string' ? children : undefined}
            className={`inline-flex items-center gap-2 text-sm font-semibold transition-all disabled:opacity-60 ${
                soft ? 'h-10 px-4 sm:h-9 sm:px-3.5' : 'px-4 py-2'
            } ${look}`}
        >
            <i className={`${icon} text-xs`} aria-hidden="true" />
            {iconOnlyOnPhone ? <span className="hidden sm:inline">{children}</span> : children}
        </button>
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
    const soft = useSoftHero()
    return (
        <div
            className={`relative grid shrink-0 place-items-center ${
                soft ? 'h-16 w-16 sm:h-20 sm:w-20' : 'h-20 w-20 sm:h-24 sm:w-24'
            }`}
        >
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
                    className={soft ? 'stroke-coral-100' : 'stroke-white/15'}
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
                        complete
                            ? soft
                                ? 'stroke-emerald-500'
                                : 'stroke-emerald-400'
                            : soft
                              ? 'stroke-coral-500'
                              : 'stroke-white'
                    }`}
                />
            </svg>
            <div className="text-center leading-none">
                {complete ? (
                    <i
                        className={`fa-solid fa-check text-xl ${soft ? 'text-emerald-600' : 'text-emerald-300'}`}
                        aria-label={completeLabel}
                    />
                ) : (
                    <>
                        <p
                            className={`font-bold tabular-nums ${soft ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'}`}
                        >
                            {value}
                            <span className={soft ? 'text-neutral-400' : 'text-white/50'}>
                                /{max}
                            </span>
                        </p>
                        <p
                            className={`mt-1 text-[11px] font-medium uppercase tracking-[0.06em] ${
                                soft ? 'text-neutral-500' : 'text-white/50'
                            }`}
                        >
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
    const soft = useSoftHero()
    return (
        <div
            className={`grid grid-cols-7 gap-1.5 rounded-2xl p-1.5 ${
                light
                    ? 'bg-neutral-100'
                    : soft
                      ? 'bg-white ring-1 ring-inset ring-neutral-900/[0.06]'
                      : 'bg-white/[0.06]'
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
    // A soft hero is light enough to style its strip like one on a white card.
    const soft = useSoftHero()
    const onLight = light || soft
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`${weekday} ${day} ${MONTHS[month]}`}
            aria-current={active ? 'date' : undefined}
            className={`relative flex flex-col items-center gap-1 rounded-xl py-2.5 transition-all ${
                active
                    ? soft
                        ? 'bg-coral-50 text-neutral-900 ring-1 ring-inset ring-coral-200'
                        : 'bg-white text-neutral-900'
                    : onLight
                      ? `text-neutral-700 ${soft ? 'hover:bg-neutral-50' : 'hover:bg-white/70'}`
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
            }`}
        >
            <span
                className={`text-[10px] font-semibold uppercase tracking-[0.04em] sm:text-[11px] sm:font-medium sm:tracking-[0.06em] ${
                    active ? 'text-neutral-600' : onLight ? 'text-neutral-500' : 'text-white/50'
                }`}
            >
                {weekday.slice(0, 3)}
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
                        className={`h-1.5 w-1.5 rounded-full ${cls} ${active || onLight ? '' : 'ring-1 ring-white/20'}`}
                    />
                ))}
            </span>
            {allDone && (
                <span
                    className={`absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ${
                        light ? 'ring-neutral-100' : soft ? 'ring-white' : 'ring-neutral-900'
                    }`}
                    title="All done"
                >
                    <i className="fa-solid fa-check text-[8px]" aria-hidden="true" />
                </span>
            )}
            {alert && !allDone && (
                <span
                    className={`absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 ring-2 ${
                        onLight ? 'ring-white' : 'ring-neutral-900'
                    }`}
                    title="Needs a look"
                />
            )}
        </button>
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
                    className={`text-[11px] font-medium uppercase tracking-[0.06em] ${
                        isToday ? 'text-white/80' : 'text-neutral-500'
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
    compact = false,
    className = '',
    children,
}: {
    id: string
    isToday: boolean
    /** Tighter padding for a narrow column in a week board. */
    compact?: boolean
    className?: string
    children: ReactNode
}) {
    return (
        <section
            id={id}
            className={`relative scroll-mt-32 flex-col overflow-hidden rounded-[20px] bg-white ${
                compact ? 'gap-3 p-3' : 'gap-4 p-4 sm:p-5'
            } ${isToday ? 'ring-2 ring-coral-200' : 'ring-1 ring-neutral-900/[0.06]'} ${className}`}
        >
            {children}
        </section>
    )
}

/** The "swipe to change day" nudge under a phone's single day. */
export function SwipeHint() {
    return (
        <p className="text-center text-[11px] text-neutral-500 md:hidden">
            <i className="fa-solid fa-arrows-left-right mr-1.5 text-[11px]" aria-hidden="true" />
            Swipe to change day
        </p>
    )
}
