import {
    createContext,
    useContext,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type CSSProperties,
    type ReactNode,
} from 'react'
import { addDays, parseDateKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'

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

/** From `lg` up every day shows at once as a compact card in a week board. */
export const LARGE_QUERY = '(min-width: 1024px)'

/**
 * The week board's grid. Seven columns only once each day gets ~15rem (big
 * monitors); laptops and landscape tablets wrap the week into rows of three or
 * four roomy cards instead of seven squashed ones.
 */
export const BOARD_GRID =
    'grid items-start gap-3 grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7'

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

/** Gap (px) between a phone's day and its neighbours while they're dragged across. */
const PEEK_GAP = 16

/** How far (share of the width) a slow drag has to go before letting go moves day. */
const COMMIT_SHARE = 0.28

/** A flick this fast (px/ms) changes day however short it was… */
const FLICK_SPEED = 0.35
/** …as long as it went at least this far (px). */
const FLICK_MIN = 24

const reducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * A phone's one-day-at-a-time view as a carousel. The day before and the day
 * after sit either side of the one on show and travel with the finger, so a
 * drag pulls the next day into view rather than into empty space. Let go past
 * about a quarter of the width — or flick — and it glides the rest of the way
 * at the speed you threw it; otherwise it springs back. The hand-over to the
 * new day happens in the same frame the slide ends, so nothing jumps.
 *
 * Picking a day from the strip slides the new one in from the side it's on.
 * Wide screens show every day, so they get none of it.
 *
 * The drag never goes through React: one CSS variable on the slider moves all
 * three cards, so it keeps up with the finger.
 *
 * Spread `sliderProps` on the element holding the day cards, give each card
 * `dayClass(date)`, and render a `DayPeek` for each of `peeks` — the
 * neighbours that fall outside the loaded week.
 */
export function useDaySlider(selected: string, onSwipe: (dir: -1 | 1) => void, days: string[] = []) {
    const el = useRef<HTMLDivElement | null>(null)
    // Held in state too, so the touch listeners attach whenever the slider mounts.
    const [node, setNode] = useState<HTMLDivElement | null>(null)
    const gesture = useRef<{
        x: number
        y: number
        axis: 'x' | 'y' | null
        dx: number
        samples: { x: number; t: number }[]
    } | null>(null)
    // A day change our own swipe made — it's already in place, so no slide-in.
    const swiped = useRef(false)
    const settling = useRef<number | null>(null)
    const latest = useRef(onSwipe)
    latest.current = onSwipe

    const prev = addDays(selected, -1)
    const next = addDays(selected, 1)

    // A day picked from the strip arrives from its side.
    const [arrive, setArrive] = useState<{ date: string; dir: 1 | -1 } | null>(null)
    const [shown, setShown] = useState(selected)
    if (shown !== selected) {
        setShown(selected)
        setArrive(
            swiped.current || isWide() || reducedMotion()
                ? null
                : { date: selected, dir: selected > shown ? 1 : -1 }
        )
    }

    const setDx = (px: number) => el.current?.style.setProperty('--day-dx', `${px}px`)

    // The new day is on show: drop the slide's offset before the browser paints,
    // so the card that glided in is simply where it ends up.
    useLayoutEffect(() => {
        if (!swiped.current) return
        swiped.current = false
        el.current?.removeAttribute('data-settling')
        setDx(0)
    }, [selected])

    useEffect(() => {
        if (!arrive) return
        const t = setTimeout(() => setArrive(null), 320)
        return () => clearTimeout(t)
    }, [arrive])

    useEffect(() => () => {
        if (settling.current) clearTimeout(settling.current)
    }, [])

    /** Glide to `to` px over a time that suits how far (and how fast) it's going, then run `done`. */
    function settle(to: number, speed: number, done?: () => void) {
        const node = el.current
        if (!node) return
        const from = gesture.current?.dx ?? 0
        const dist = Math.abs(to - from)
        // Carry the flick's speed on; never slower than a calm 320ms or snappier than 140ms.
        const ms = Math.round(Math.min(320, Math.max(140, speed > 0.1 ? dist / speed : dist * 1.1)))
        node.style.setProperty('--day-ms', `${ms}ms`)
        node.setAttribute('data-settling', '')
        setDx(to)
        if (settling.current) clearTimeout(settling.current)
        settling.current = window.setTimeout(() => {
            settling.current = null
            if (done) done()
            else node.removeAttribute('data-settling')
        }, ms)
    }

    // Native listeners: a sideways drag has to cancel the page's own scroll,
    // which React's passive touch handlers can't do.
    useEffect(() => {
        if (!node) return

        function start(e: globalThis.TouchEvent) {
            if (isWide() || e.touches.length > 1 || settling.current) return
            const p = e.touches[0]
            gesture.current = { x: p.clientX, y: p.clientY, axis: null, dx: 0, samples: [{ x: p.clientX, t: e.timeStamp }] }
        }

        function move(e: globalThis.TouchEvent) {
            const g = gesture.current
            if (!g) return
            const p = e.touches[0]
            const dx = p.clientX - g.x
            const dy = p.clientY - g.y
            // Lock to an axis once the finger has clearly picked one, so a
            // scroll down the day never wobbles it sideways.
            if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 6) {
                g.axis = Math.abs(dx) > Math.abs(dy) * 1.1 ? 'x' : 'y'
                if (g.axis === 'x') node!.setAttribute('data-dragging', '')
            }
            if (g.axis !== 'x') return
            if (e.cancelable) e.preventDefault()
            g.dx = dx
            g.samples.push({ x: p.clientX, t: e.timeStamp })
            if (g.samples.length > 6) g.samples.shift()
            setDx(dx)
        }

        function end() {
            const g = gesture.current
            node!.removeAttribute('data-dragging')
            if (!g || g.axis !== 'x') {
                gesture.current = null
                return
            }
            // Speed over the last few moves, px/ms (signed).
            const first = g.samples[0]
            const last = g.samples[g.samples.length - 1]
            const dt = last.t - first.t
            const v = dt > 0 ? (last.x - first.x) / dt : 0
            const width = node!.clientWidth
            const flick = Math.abs(v) > FLICK_SPEED && Math.abs(g.dx) > FLICK_MIN && Math.sign(v) === Math.sign(g.dx)
            const far = Math.abs(g.dx) > width * COMMIT_SHARE
            if (flick || far) {
                const dir: 1 | -1 = g.dx < 0 ? 1 : -1
                settle(-dir * (width + PEEK_GAP), Math.abs(v), () => {
                    swiped.current = true
                    latest.current(dir)
                    // If the day somehow didn't change, don't leave it parked off-screen.
                    window.setTimeout(() => {
                        if (!swiped.current) return
                        swiped.current = false
                        node!.removeAttribute('data-settling')
                        setDx(0)
                    }, 120)
                })
            } else {
                settle(0, Math.abs(v))
            }
            gesture.current = null
        }

        node.addEventListener('touchstart', start, { passive: true })
        node.addEventListener('touchmove', move, { passive: false })
        node.addEventListener('touchend', end)
        node.addEventListener('touchcancel', end)
        return () => {
            node.removeEventListener('touchstart', start)
            node.removeEventListener('touchmove', move)
            node.removeEventListener('touchend', end)
            node.removeEventListener('touchcancel', end)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node])

    const sliderProps = {
        ref: (n: HTMLDivElement | null) => {
            el.current = n
            setNode(n)
        },
        style: { '--day-gap': `${PEEK_GAP}px` } as CSSProperties,
    }

    /** A day card's classes: the day on show, a neighbour waiting either side, or hidden. */
    function dayClass(date: string): string {
        if (date === selected) {
            if (arrive && arrive.date === date) return `flex day-arrive-${arrive.dir === 1 ? 'next' : 'prev'}`
            return 'flex day-current'
        }
        if (date === prev) return 'flex day-peek-prev'
        if (date === next) return 'flex day-peek-next'
        return 'hidden md:flex'
    }

    // Neighbours outside the loaded week still need something to drag into view.
    const peeks = [prev, next].filter((d) => !days.includes(d))

    return { sliderProps, dayClass, peeks }
}

/**
 * Stand-in for a neighbouring day outside the loaded week — its date and a few
 * quiet bars, so a swipe across Sunday or Monday still has a card to pull in.
 */
export function DayPeek({ date, className = '' }: { date: string; className?: string }) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    return (
        <section aria-hidden="true" className={`flex-col gap-4 rounded-2xl bg-white p-4 ring-1 ring-neutral-900/[0.07] sm:p-5 ${className} md:hidden`}>
            <p className="text-lg font-semibold tracking-[-0.015em] text-neutral-900">
                {weekday} {day} <span className="text-sm font-normal text-neutral-500">{MONTHS[month]}</span>
            </p>
            <div className="flex flex-col gap-3">
                <div className="h-10 rounded-lg bg-neutral-100" />
                <div className="h-10 rounded-lg bg-neutral-100" />
                <div className="h-10 rounded-lg bg-neutral-100" />
            </div>
        </section>
    )
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

/**
 * How loud a hero is: `dark` is the near-black panel, `soft` no panel at all —
 * just the controls in dark type on the page. The hero's pieces read it from context, so only the shell
 * needs telling.
 */
export type HeroTone = 'dark' | 'soft'
// Soft by default: the redesign dropped the dark panel, and pieces used outside a HeroShell
// (the planners' day strips) were left with white type on a white page.
const HeroToneContext = createContext<HeroTone>('soft')
const useSoftHero = () => useContext(HeroToneContext) === 'soft'

/** The panel behind a hero, for planners that lay out their own top. */
export function HeroShell({ tone: _tone = 'dark', children }: { tone?: HeroTone; children: ReactNode }) {
    // Open and editorial: every hero is the soft one now, controls in dark type
    // straight on the page. `tone` stays in the API so callers needn't change.
    void _tone
    const tone: HeroTone = 'soft'
    const soft = true
    return (
        <HeroToneContext.Provider value={tone}>
            <section
                className={
                    soft
                        ? 'text-neutral-900'
                        : 'relative overflow-hidden rounded-xl bg-neutral-900 text-neutral-50'
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
    void soft
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className={`grid h-11 w-11 shrink-0 place-items-center transition-colors lg:h-10 lg:w-10 disabled:opacity-60 ${
                primary ? 'bg-neutral-900 text-white hover:bg-black' : 'border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900'
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
    void soft
    const look = primary ? 'bg-neutral-900 text-white hover:bg-black' : 'border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-900'
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={iconOnlyOnPhone && typeof children === 'string' ? children : undefined}
            className={`inline-flex h-11 items-center gap-2 whitespace-nowrap px-4 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors disabled:opacity-60 lg:h-10 ${look}`}
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
                            className={`font-semibold nums ${soft ? 'text-base sm:text-lg' : 'text-lg sm:text-xl'}`}
                        >
                            {value}
                            <span className={soft ? 'text-neutral-500' : 'text-white/50'}>
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
            className={`grid grid-cols-7 gap-1.5 rounded-xl p-1.5 ${
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
                className={`grid h-7 w-7 place-items-center rounded-full text-sm font-semibold nums sm:h-8 sm:w-8 sm:text-base ${
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
            className={`grid h-12 w-12 shrink-0 place-items-start leading-none ${
                isToday ? 'text-coral-600' : 'text-neutral-900'
            }`}
        >
            <div className="text-left">
                <p
                    className={`text-[11px] font-medium uppercase tracking-[0.06em] ${
                        isToday ? 'text-coral-600' : 'text-neutral-500'
                    }`}
                >
                    {weekday.slice(0, 3)}
                </p>
                <p className="mt-1 text-[22px] font-normal tracking-[-0.03em] nums">{day}</p>
            </div>
        </div>
    )
}

/**
 * The shell of a day card — a white rounded panel, so each day reads as one
 * thing on the page; today is ringed in coral.
 */
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
            className={`relative scroll-mt-32 flex-col rounded-2xl bg-white ${
                compact ? 'gap-3 p-4' : 'gap-4 p-4 sm:p-5'
            } ${
                isToday ? 'ring-2 ring-coral-400' : 'ring-1 ring-neutral-900/[0.07]'
            } ${className}`}
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
