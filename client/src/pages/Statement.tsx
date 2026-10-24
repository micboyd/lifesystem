import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import Spinner from '../components/Spinner'
import EmptyState from '../components/EmptyState'
import Drawer from '../components/Drawer'
import Input from '../components/Input'
import PillToggle from '../components/PillToggle'
import Pagination from '../components/Pagination'
import { Card } from '../components/Card'
import { getStarlingBalance, getStarlingHistory, listStarlingFlow } from '../services/finances'
import { listEvents } from '../services/events'
import { listCalendars } from '../services/calendars'
import { colorsForEvent } from '../lib/eventColors'
import { formatMoney } from '../lib/money'
import { useMoneyHidden } from '../components/useMoneyHidden'
import { formatMonthKey, todayKey, WEEKDAYS_LONG } from '../lib/calendar'
import {
    buildMonthStatement,
    categoryLabel,
    daysIn,
    shiftMonth,
    type MonthStatement,
    type StatementGroup,
} from '../lib/monthStatement'
import {
    buildInsights,
    kindTotals,
    spendKind,
    totalSaving,
    KIND_LABEL,
    type Copy,
    type Insight,
    type InsightTone,
    type KindTotal,
    type SpendKind,
} from '../lib/statementInsights'
import { buildDoh, type Doh } from '../lib/statementDoh'
import { refineCategory, tagAll, tagText, TAGS, type Tag } from '../lib/spendTags'
import { AHEAD_DAYS, buildMonthAhead, type MonthAhead } from '../lib/monthAhead'
import { buildSavingsPlan, goalPresets, type SavingsPlan } from '../lib/savingsPlan'
import { incomeForMonth } from '../lib/finance'
import { listEntries, listGroups, listRows } from '../services/finances'
import { updateSettings } from '../services/users'
import { useAuth } from '../context/AuthContext'
import { matchSpendToEvents, upcomingPlans, type EventSpend, type UpcomingPlan } from '../lib/spendEvents'
import { buildMoneyIn, INCOME_LABEL, type MoneyIn } from '../lib/moneyIn'
import { goalProgress, type GoalProgress } from '../lib/goalProgress'
import { buildWeekReview, type WeekReview } from '../lib/weekReview'
import { findSubscriptions, type SubscriptionList } from '../lib/subscriptions'
import { buildTrends, type Trends } from '../lib/trends'
import {
    EVENT_TYPE_LABELS,
    type Calendar,
    type Event,
    type StarlingBalance,
    type StarlingHistory,
    type StarlingSpendItem,
} from '../types'

/** Re-pull while the tab is open. The server caches Starling for 5 minutes anyway. */
const REFRESH_MS = 5 * 60_000
type StatementData = { month: string; items: StarlingSpendItem[]; incoming: StarlingSpendItem[]; events: Event[] }
type LoadResult =
    | { ok: true; now: string; data: StatementData }
    | { ok: false; notConfigured?: boolean; message?: string }

/** History fills a few months per request; ask this many times, this far apart. */
const HISTORY_TRIES = 6
const HISTORY_RETRY_MS = 5_000

const OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600'
const HERO_OVERLINE = 'text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-400'
const H2 = 'text-[20px] font-semibold tracking-[-0.015em] text-neutral-950'

const CATEGORY_ICONS: Record<string, string> = {
    GROCERIES: 'fa-basket-shopping',
    EATING_OUT: 'fa-utensils',
    DRINKS: 'fa-beer-mug-empty',
    TRANSPORT: 'fa-train',
    SHOPPING: 'fa-bag-shopping',
    ENTERTAINMENT: 'fa-ticket',
    BILLS_AND_SERVICES: 'fa-file-invoice',
    HOLIDAYS: 'fa-plane',
    LIFESTYLE: 'fa-mug-hot',
    PERSONAL_CARE: 'fa-pump-soap',
    HOME: 'fa-house',
    FAMILY: 'fa-people-roof',
    GIFTS: 'fa-gift',
    CHARITY: 'fa-hand-holding-heart',
    PETS: 'fa-paw',
    FITNESS: 'fa-dumbbell',
    GAMBLING: 'fa-dice',
    PAYMENTS: 'fa-money-bill-transfer',
    SAVING: 'fa-piggy-bank',
}

const categoryIcon = (key: string | null) => CATEGORY_ICONS[key ?? ''] ?? 'fa-receipt'

// Needs, treats, other: one colour each, lighter shades so they read on the dark hero.
const KIND_DOT: Record<SpendKind, string> = {
    essential: 'bg-brand-300',
    lifestyle: 'bg-coral-400',
    other: 'bg-neutral-500',
}

function dayLabel(date: string): string {
    const [y, m, d] = date.split('-').map(Number)
    return `${WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()]} ${d}`
}

function shortDay(date: string): { weekday: string; day: number } {
    const [y, m, d] = date.split('-').map(Number)
    return { weekday: WEEKDAYS_LONG[new Date(y, m - 1, d).getDay()].slice(0, 3), day: d }
}

function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Smart tags by payment id: what each payment actually was. */
const EMPTY_TAGS = new Map<string, Tag[]>()
const TagsContext = createContext<Map<string, Tag[]>>(EMPTY_TAGS)

/** Calendars by id, so a linked plan can wear its calendar's colour. */
const CalendarsContext = createContext<Map<string, Calendar>>(new Map())

function useEventColors(event: Event) {
    return colorsForEvent(event, useContext(CalendarsContext))
}

/** The plan a payment was matched to, as a small pill in the event's calendar colour. */
function EventPill({ event }: { event: Event }) {
    const c = useEventColors(event)
    return (
        <span
            title={`Linked to ${event.title} in your calendar`}
            className={`inline-flex min-w-0 max-w-[11rem] shrink items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.bg} ${c.text}`}
        >
            <i className="fa-regular fa-calendar shrink-0 text-[10px]" aria-hidden="true" />
            <span className="truncate">{event.title}</span>
        </span>
    )
}

// ── Money in text ─────────────────────────────────────────────────────────────

/** A money figure: the only thing on the page set in the mono font. */
function M({ v, d, className = '' }: { v: number; d?: number; className?: string }) {
    // Whole pounds once a figure is in the hundreds; pence below that.
    const decimals = d ?? (Math.abs(v) >= 100 ? 0 : 2)
    return <span className={`tabular-nums ${className}`}>{formatMoney(v, decimals)}</span>
}

function Text({ copy }: { copy: Copy }) {
    return (
        <>
            {copy.map((p, i) => (typeof p === 'string' ? <Fragment key={i}>{p}</Fragment> : <M key={i} v={p.money} />))}
        </>
    )
}

/** "£12.40 less than last month" style comparison, with a tone. */
function compare(now: number, then: number): { copy: Copy; tone: 'good' | 'bad' | 'neutral' } {
    const diff = Math.round((now - then) * 100) / 100
    if (then === 0 && now === 0) return { copy: ['Nothing spent either month'], tone: 'neutral' }
    if (Math.abs(diff) < 0.01) return { copy: ['Level with last month'], tone: 'neutral' }
    const pct = then > 0 ? ` (${Math.round((Math.abs(diff) / then) * 100)}%)` : ''
    return diff < 0
        ? { copy: [{ money: -diff }, ` less${pct} than last month`], tone: 'good' }
        : { copy: [{ money: diff }, ` more${pct} than last month`], tone: 'bad' }
}

// ── Hero ──────────────────────────────────────────────────────────────────────

/** Running total this month against last month, both on a day-of-month axis. */
function PaceChart({ s }: { s: MonthStatement }) {
    const days = Math.max(s.daysInMonth, s.prevCumulative.length)
    const top = Math.max(1, ...s.cumulative, ...s.prevCumulative, s.projected ?? 0)
    const W = 300
    const H = 90
    const x = (i: number) => (days <= 1 ? 0 : (i / (days - 1)) * W)
    const y = (v: number) => H - (v / top) * H
    const path = (vals: number[]) =>
        vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    const last = s.cumulative.length - 1

    return (
        <svg
            viewBox={`0 -4 ${W} ${H + 8}`}
            preserveAspectRatio="none"
            className="h-28 w-full overflow-visible"
            role="img"
            aria-label="Running total this month against last month"
        >
            <path
                d={path(s.prevCumulative)}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                className="text-neutral-600"
                vectorEffect="non-scaling-stroke"
            />
            {s.projected !== null && last >= 0 && (
                <path
                    d={`M${x(last)},${y(s.cumulative[last])} L${x(s.daysInMonth - 1)},${y(s.projected)}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeDasharray="1 4"
                    strokeLinecap="round"
                    className="text-white/50"
                    vectorEffect="non-scaling-stroke"
                />
            )}
            {last >= 0 && (
                <path
                    d={path(s.cumulative)}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    className="text-white"
                    vectorEffect="non-scaling-stroke"
                />
            )}
        </svg>
    )
}

function MonthArrow({ dir, onClick, disabled = false }: { dir: 'prev' | 'next'; onClick: () => void; disabled?: boolean }) {
    const label = dir === 'prev' ? 'Previous month' : 'Next month'
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onClick}
            disabled={disabled}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-neutral-200 transition-colors hover:bg-white/20 hover:text-white disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:w-9"
        >
            <i className={`fa-solid ${dir === 'prev' ? 'fa-chevron-left' : 'fa-chevron-right'} text-xs`} aria-hidden="true" />
        </button>
    )
}

/** Needs / treats / other as one bar, with the figures beside it in plain numbers. */
function KindSplit({ kinds, total }: { kinds: KindTotal[]; total: number }) {
    const shown = kinds.filter((k) => k.total > 0)
    return (
        <div>
            <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-white/10">
                {shown.map((k) => (
                    <div key={k.kind} className={`h-full ${KIND_DOT[k.kind]}`} style={{ width: `${(k.total / total) * 100}%` }} />
                ))}
            </div>
            <ul className="mt-3 grid gap-1.5">
                {kinds.map((k) => {
                    const diff = k.total - k.prevTotal
                    return (
                        <li key={k.kind} className="flex items-baseline gap-2 text-[13px]">
                            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${KIND_DOT[k.kind]}`} aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-neutral-300">{KIND_LABEL[k.kind]}</span>
                            {Math.abs(diff) >= 1 && (
                                <span className="text-xs text-neutral-500">
                                    {diff > 0 ? '+' : '−'}
                                    <M v={Math.abs(diff)} d={0} />
                                </span>
                            )}
                            <M v={k.total} className="w-20 text-right font-medium text-white" />
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function HeroFigure({ label, children, sub }: { label: string; children: ReactNode; sub?: ReactNode }) {
    return (
        <div className="min-w-0">
            <p className={HERO_OVERLINE}>{label}</p>
            <p className="mt-1.5 truncate text-xl font-medium tracking-[-0.03em] text-white">{children}</p>
            {sub && <p className="mt-0.5 truncate text-xs text-neutral-500">{sub}</p>}
        </div>
    )
}

function Hero({
    s,
    kinds,
    status,
    nav,
}: {
    s: MonthStatement | null
    kinds: KindTotal[]
    status: ReactNode
    nav: { label: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean }
}) {
    const vs = s ? compare(s.total, s.prev.toSameDay) : null
    const pill =
        vs?.tone === 'good'
            ? 'bg-emerald-400/15 text-emerald-300'
            : vs?.tone === 'bad'
              ? 'bg-coral-400/20 text-coral-300'
              : 'bg-white/10 text-neutral-300'
    const prevName = s ? formatMonthKey(s.prev.month).split(' ')[0] : ''

    return (
        <section className="mb-6 rounded-3xl bg-neutral-900 p-5 text-neutral-50 sm:p-7">
            <div className="flex items-center gap-3">
                <div className="flex shrink-0 items-center gap-1.5">
                    <MonthArrow dir="prev" onClick={nav.onPrev} />
                    <MonthArrow dir="next" onClick={nav.onNext} disabled={nav.nextDisabled} />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-white sm:text-[22px]">{nav.label}</h1>
                    <p className="truncate text-[13px] text-neutral-400">{status}</p>
                </div>
            </div>

            {s && vs && (
                <>
                    <div className="mt-7 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
                        <div className="flex min-w-0 flex-col gap-5">
                            <div>
                                <p className={HERO_OVERLINE}>{s.isCurrent ? 'Spent so far' : 'Spent in total'}</p>
                                <p className="mt-2 text-[44px] font-medium leading-none tracking-[-0.04em] text-white sm:text-[52px]">
                                    <M v={s.total} d={0} />
                                </p>
                                <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${pill}`}>
                                    <span>
                                        <Text copy={vs.copy} />
                                        {s.isCurrent ? ` by day ${s.dayOfMonth}` : ''}
                                    </span>
                                </span>
                            </div>
                            {s.total > 0 && <KindSplit kinds={kinds} total={s.total} />}
                        </div>
                        <div className="min-w-0">
                            <PaceChart s={s} />
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-400">
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-0.5 w-4 rounded bg-white" aria-hidden="true" />
                                    {nav.label.split(' ')[0]}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <span className="h-0 w-4 border-t border-dashed border-neutral-500" aria-hidden="true" />
                                    <span>
                                        {prevName} (<M v={s.prev.fullTotal} d={0} /> in total)
                                    </span>
                                </span>
                                {s.projected !== null && (
                                    <span className="inline-flex items-center gap-2">
                                        <span className="h-0 w-4 border-t border-dotted border-white/50" aria-hidden="true" />
                                        At this pace
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/10 pt-5 sm:grid-cols-4">
                        <HeroFigure label="Per day" sub={`Over ${plural(s.dayOfMonth, 'day')}`}>
                            <M v={s.dailyAverage} />
                        </HeroFigure>
                        {s.projected !== null ? (
                            <HeroFigure label="On track for" sub={<>{prevName} was <M v={s.prev.fullTotal} d={0} /></>}>
                                <M v={s.projected} d={0} />
                            </HeroFigure>
                        ) : (
                            <HeroFigure label={`${prevName} total`}>
                                <M v={s.prev.fullTotal} d={0} />
                            </HeroFigure>
                        )}
                        <HeroFigure label="No-spend days" sub={`of ${s.dayOfMonth}`}>
                            {s.noSpendDays}
                        </HeroFigure>
                        <HeroFigure label="Payments" sub={s.count ? <>Average <M v={s.total / s.count} /></> : undefined}>
                            {s.count}
                        </HeroFigure>
                    </div>
                </>
            )}
        </section>
    )
}

// ── Insights ──────────────────────────────────────────────────────────────────

const TONE: Record<InsightTone, { wrap: string; icon: string; label: string }> = {
    save: { wrap: 'bg-warning-bg', icon: 'text-warning', label: 'Could save' },
    watch: { wrap: 'bg-neutral-100', icon: 'text-neutral-700', label: 'Keep an eye on' },
    good: { wrap: 'bg-success-bg', icon: 'text-success', label: 'Going well' },
}

function InsightCard({ insight, onOpen }: { insight: Insight; onOpen?: () => void }) {
    const tone = TONE[insight.tone]
    const body = (
        <>
            <div className="flex items-center gap-2.5">
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white text-[13px] ${tone.icon}`}>
                    <i className={`fa-solid ${insight.icon}`} aria-hidden="true" />
                </span>
                <span className={OVERLINE}>{tone.label}</span>
                {insight.saving ? (
                    <span className="ml-auto shrink-0 rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-900">
                        ~<M v={insight.saving} d={0} /> a month
                    </span>
                ) : null}
            </div>
            <p className="text-[15px] font-medium leading-snug text-neutral-900">
                <Text copy={insight.title} />
            </p>
            <p className="text-[13px] leading-snug text-neutral-600">
                <Text copy={insight.detail} />
            </p>
            {onOpen && (
                <span className="mt-auto inline-flex items-center gap-1.5 text-[13px] font-medium text-neutral-900">
                    See {plural(insight.items.length, 'payment')}
                    <i className="fa-solid fa-arrow-right text-[11px]" aria-hidden="true" />
                </span>
            )}
        </>
    )
    const cls = `flex h-full flex-col gap-2.5 rounded-[20px] p-4 text-left ${tone.wrap}`
    return onOpen ? (
        <button type="button" onClick={onOpen} className={`${cls} transition-[filter] hover:brightness-[0.97]`}>
            {body}
        </button>
    ) : (
        <div className={cls}>{body}</div>
    )
}

const INSIGHTS_SHOWN = 4

function Insights({ insights, onOpen }: { insights: Insight[]; onOpen: (title: string, items: StarlingSpendItem[]) => void }) {
    const [all, setAll] = useState(false)
    const saving = totalSaving(insights)
    const shown = all ? insights : insights.slice(0, INSIGHTS_SHOWN)
    return (
        <section className="mb-6">
            <div className="mb-3">
                <h2 className={H2}>What to do about it</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                    {saving > 0 ? (
                        <>
                            Acting on the ideas below could free up about <M v={saving} d={0} className="font-medium text-neutral-900" /> a month.
                        </>
                    ) : insights.length ? (
                        'Nothing to cut. Here’s how the month is shaping up.'
                    ) : (
                        'A steady month. Nothing stands out yet.'
                    )}
                </p>
            </div>
            {insights.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                    {shown.map((i) => (
                        <InsightCard
                            key={i.id}
                            insight={i}
                            onOpen={i.items.length ? () => onOpen(i.subject, i.items) : undefined}
                        />
                    ))}
                </div>
            )}
            {insights.length > INSIGHTS_SHOWN && (
                <button
                    type="button"
                    onClick={() => setAll(!all)}
                    className="mt-3 text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
                >
                    {all ? 'Show fewer' : `Show ${insights.length - INSIGHTS_SHOWN} more`}
                </button>
            )}
        </section>
    )
}

// ── Doh ───────────────────────────────────────────────────────────────────────

/** Money that bought nothing worth having, and what you'd have kept. */
function DohSection({ doh, onOpen }: { doh: Doh; onOpen: (title: string, items: StarlingSpendItem[]) => void }) {
    if (doh.lines.length === 0) {
        return (
            <section className="mb-6 flex items-center gap-3 rounded-3xl bg-success-bg px-5 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-success">
                    <i className="fa-solid fa-face-smile" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-neutral-900">No doh moments this month</p>
                    <p className="text-[13px] text-neutral-600">No bets, no 2am takeaways, no fees. Smart.</p>
                </div>
            </section>
        )
    }
    return (
        <section className="mb-6 rounded-3xl bg-coral-50 p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3 px-1">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-coral-600">
                    <i className="fa-solid fa-face-grimace" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className={H2}>Doh.</h2>
                    <p className="text-[13px] text-neutral-600">Money you’d still have if you hadn’t been a numpty.</p>
                </div>
                <div className="shrink-0 text-right">
                    <M v={doh.total} d={doh.total >= 100 ? 0 : 2} className="block text-[26px] font-medium leading-none tracking-[-0.03em] text-coral-700" />
                    <p className="mt-1 text-xs text-neutral-600">down the drain</p>
                </div>
            </div>
            <ul className="divide-y divide-neutral-100 overflow-hidden rounded-[20px] bg-white">
                {doh.lines.map((l) => (
                    <li key={l.id}>
                        <button
                            type="button"
                            onClick={() => onOpen(l.subject, l.items)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                        >
                            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-coral-50 text-[13px] text-coral-600">
                                <i className={`fa-solid ${l.icon}`} aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] leading-snug text-neutral-900">
                                    <Text copy={l.title} />
                                </p>
                                <p className="text-[13px] leading-snug text-neutral-500">{l.why}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                <M v={l.saved} className="block text-[15px] font-medium text-coral-700" />
                                <span className="text-[11px] text-neutral-500">could’ve kept</span>
                            </div>
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    )
}

// ── The month ahead ───────────────────────────────────────────────────────────

const monthOnly = (month: string) => formatMonthKey(month).split(' ')[0]

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
function ordinal(n: number): string {
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
    return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`
}

/** The savings goal: how much to keep back, and a plan to get there from last month's spending. */
function SavingsGoalCard({
    plan,
    goal,
    presets,
    possible,
    lastName,
    onGoal,
    onOpen,
}: {
    plan: SavingsPlan | null
    goal: number | null
    presets: number[]
    possible: number
    lastName: string
    onGoal: (goal: number | null) => void
    onOpen: (title: string, items: StarlingSpendItem[]) => void
}) {
    const [custom, setCustom] = useState('')
    const chosen = new Set(plan?.chosen ?? [])
    const doh = plan?.levers.filter((l) => l.kind === 'skip').reduce((s, l) => s + l.amount, 0) ?? 0
    return (
        <div className="mb-3 rounded-[20px] bg-success-bg p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className={OVERLINE}>Savings goal</p>
                    <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.015em] text-neutral-950">
                        {goal ? (
                            <>
                                Keep <M v={goal} d={0} /> back this month
                            </>
                        ) : (
                            'How much do you want to keep back?'
                        )}
                    </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Savings goal">
                    {presets.map((p) => (
                        <button
                            key={p}
                            type="button"
                            aria-pressed={goal === p}
                            onClick={() => onGoal(goal === p ? null : p)}
                            className={`h-8 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                goal === p ? 'bg-neutral-900 text-neutral-50' : 'bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                        >
                            <M v={p} d={0} />
                        </button>
                    ))}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault()
                            const n = parseFloat(custom)
                            if (Number.isFinite(n) && n > 0) onGoal(Math.round(n))
                            setCustom('')
                        }}
                        className="flex h-8 items-center rounded-full bg-white pl-3 pr-1 text-[13px]"
                    >
                        <span className="text-neutral-500">£</span>
                        <input
                            type="number"
                            min="1"
                            inputMode="numeric"
                            aria-label="Your own goal"
                            placeholder="Other"
                            value={custom}
                            onChange={(e) => setCustom(e.target.value)}
                            className="w-14 bg-transparent px-1 tabular-nums text-neutral-900 outline-none placeholder:text-neutral-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        {custom && (
                            <button type="submit" className="h-6 rounded-full bg-neutral-900 px-2 text-xs font-medium text-white">
                                Set
                            </button>
                        )}
                    </form>
                </div>
            </div>

            {plan?.leftOver && (
                <p className="mt-3 text-[13px] leading-snug text-neutral-700">
                    Income <M v={plan.leftOver.income} d={0} /> − bills <M v={plan.leftOver.bills} d={0} /> − day-to-day{' '}
                    <M v={plan.leftOver.dayToDay} d={0} /> at {lastName}’s pace leaves about{' '}
                    <M v={plan.leftOver.left} d={0} className="font-medium text-neutral-900" />
                    {goal ? (
                        <>
                            . Hit the goal and it’s <M v={plan.leftOver.leftAfterGoal} d={0} className="font-medium text-success" />.
                        </>
                    ) : (
                        '.'
                    )}
                </p>
            )}

            {!goal && (
                <p className="mt-3 text-[13px] leading-snug text-neutral-700">
                    Pick one and you’ll get a plan built from {lastName}’s spending.{' '}
                    {doh > 0 && (
                        <>
                            Skipping {lastName}’s doh moments alone keeps <M v={doh} d={0} className="font-medium text-neutral-900" />;{' '}
                        </>
                    )}
                    everything on offer comes to about <M v={possible} d={0} className="font-medium text-neutral-900" />.
                </p>
            )}

            {goal && plan && (
                <>
                    <ul className="mt-4 divide-y divide-neutral-100 overflow-hidden rounded-2xl bg-white">
                        {plan.levers.map((l, i) => {
                            const on = chosen.has(l.id)
                            const firstSpare = !on && i > 0 && chosen.has(plan.levers[i - 1].id)
                            return (
                                <li key={l.id}>
                                    {firstSpare && (
                                        <p className="bg-neutral-50 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-500">
                                            If you want more
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => l.items.length && onOpen(plain(l.title), l.items)}
                                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                                    >
                                        <span
                                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12px] ${
                                                on ? 'bg-success text-white' : 'bg-neutral-100 text-neutral-500'
                                            }`}
                                        >
                                            <i className={`fa-solid ${on ? 'fa-check' : l.icon}`} aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-[15px] leading-snug ${on ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                                <Text copy={l.title} />
                                            </p>
                                            <p className="text-[13px] leading-snug text-neutral-500">
                                                <Text copy={l.detail} />
                                            </p>
                                        </div>
                                        <M v={l.amount} d={0} className={`shrink-0 text-[15px] font-medium ${on ? 'text-success' : 'text-neutral-500'}`} />
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                    <p className="mt-3 text-[13px] leading-snug text-neutral-700">
                        {plan.short > 0 ? (
                            <>
                                Everything here comes to <M v={plan.possible} d={0} className="font-medium text-neutral-900" />,{' '}
                                <M v={plan.short} d={0} className="font-medium text-danger" /> short of the goal. A smaller goal, or a bigger change
                                somewhere (a bill, a habit) would close it.
                            </>
                        ) : (
                            <>
                                The ticked steps cover <M v={plan.covered} d={0} className="font-medium text-neutral-900" /> of your{' '}
                                <M v={goal} d={0} /> goal.
                            </>
                        )}{' '}
                        That means keeping day-to-day to <M v={plan.dayToDayBudget} d={0} className="font-medium text-neutral-900" /> this
                        month: <M v={plan.perDay} className="font-medium text-neutral-900" /> a day.
                    </p>
                </>
            )}
        </div>
    )
}

/** Copy as plain text, for a drawer title. */
function plain(copy: Copy): string {
    return copy.map((p) => (typeof p === 'string' ? p : formatMoney(p.money, 0))).join('')
}

/** The start of a month: what's coming, a budget to play to, and last month's lessons. */
function MonthAheadSection({
    a,
    monthName,
    prevName,
    onOpen,
    goal,
    plan,
}: {
    a: MonthAhead
    monthName: string
    prevName: string
    onOpen: (title: string, items: StarlingSpendItem[]) => void
    goal: ReactNode
    plan: SavingsPlan | null
}) {
    const biggestDoh = a.lastDoh.lines[0]
    const vsBefore = a.lastMonth.before !== null ? compare(a.lastMonth.total, a.lastMonth.before) : null
    const hasGoal = !!plan && plan.goal > 0
    const options: { label: string; perDay: number; note: ReactNode; on?: boolean }[] = [
        { label: `Match ${prevName}`, perDay: a.matchPerDay, note: <><M v={a.prevDayToDay} d={0} /> for the month</> },
        { label: '10% under', perDay: a.trimPerDay, note: <>saves <M v={a.trimSaving} d={0} /></> },
        ...(hasGoal ? [{ label: 'Your goal', perDay: plan!.perDay, note: <>keeps <M v={plan!.goal} d={0} /> back</>, on: true }] : []),
    ]
    const headline = hasGoal ? plan!.perDay : a.matchPerDay

    return (
        <section className="mb-8">
            <div className="mb-4">
                <h2 className={H2}>The month ahead</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">What’s coming in {monthName}, going by how {prevName} went.</p>
            </div>
            {goal}

            <div className="mb-4 grid items-start gap-4 lg:grid-cols-2">
                {/* Your budget */}
                <div className="rounded-[20px] bg-white p-5 ring-1 ring-neutral-900/[0.06] sm:p-6">
                    <p className={OVERLINE}>Your day-to-day budget</p>
                    <div className="mt-3 flex items-baseline gap-2">
                        <M v={headline} className="text-[40px] font-medium leading-none tracking-[-0.04em] text-neutral-950" />
                        <span className="text-[15px] text-neutral-600">a day</span>
                    </div>
                    <p className="mt-2 text-[13px] text-neutral-500">{hasGoal ? 'to hit your savings goal.' : `to match ${prevName}.`}</p>

                    <ul className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
                        {options.map((o) => (
                            <li key={o.label} className="flex items-center gap-3 py-3">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${o.on ? 'bg-success' : 'bg-neutral-300'}`} aria-hidden="true" />
                                <span className={`min-w-0 flex-1 text-[15px] ${o.on ? 'font-medium text-neutral-900' : 'text-neutral-700'}`}>{o.label}</span>
                                <span className="hidden text-[13px] text-neutral-500 sm:inline">{o.note}</span>
                                <span className="w-24 shrink-0 text-right text-[15px] font-medium text-neutral-900">
                                    <M v={o.perDay} />
                                    <span className="text-[13px] font-normal text-neutral-500"> /day</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                        Day-to-day is everything except bills, rent and big one-offs. {prevName}’s came to <M v={a.prevDayToDay} d={0} />.
                    </p>
                </div>

                {/* Bills coming */}
                <div className="rounded-[20px] bg-white p-5 ring-1 ring-neutral-900/[0.06] sm:p-6">
                    <p className={OVERLINE}>Bills coming</p>
                    {a.bills.length === 0 ? (
                        <p className="mt-3 text-[15px] text-neutral-500">No regular bills in {prevName} to go on.</p>
                    ) : (
                        <>
                            <ul className="mt-3 divide-y divide-neutral-100">
                                {a.bills.slice(0, 8).map((b) => (
                                    <li key={b.merchant} className="flex items-center gap-3 py-3">
                                        <span
                                            className={`grid h-9 w-11 shrink-0 place-items-center rounded-lg text-[13px] font-semibold ${
                                                b.paid ? 'bg-success-bg text-success' : 'bg-neutral-100 text-neutral-700'
                                            }`}
                                        >
                                            {b.paid ? <i className="fa-solid fa-check" aria-label="Paid" /> : ordinal(b.day)}
                                        </span>
                                        <span className={`min-w-0 flex-1 truncate text-[15px] ${b.paid ? 'text-neutral-500 line-through' : 'text-neutral-900'}`}>
                                            {b.merchant}
                                        </span>
                                        <M v={b.amount} className={`shrink-0 text-[15px] ${b.paid ? 'text-neutral-500' : 'font-medium text-neutral-900'}`} />
                                    </li>
                                ))}
                            </ul>
                            {a.bills.length > 8 && <p className="pt-1 text-xs text-neutral-500">and {a.bills.length - 8} more</p>}
                            <div className="mt-2 flex items-baseline justify-between border-t border-neutral-200 pt-3">
                                <span className="text-[13px] text-neutral-500">Still to go out</span>
                                <M v={a.billsLeft} d={0} className="text-[17px] font-semibold text-neutral-900" />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Lessons from last month */}
            <div className="rounded-[20px] bg-neutral-100 p-4 sm:p-5">
                <p className={`mb-3 px-1 ${OVERLINE}`}>Lessons from {prevName}</p>
                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4">
                        <p className="text-[13px] text-neutral-500">{prevName} in total</p>
                        <M v={a.lastMonth.total} d={0} className="mt-1 block text-[26px] font-medium leading-tight tracking-[-0.03em] text-neutral-950" />
                        {vsBefore && vsBefore.tone !== 'neutral' && (
                            <p className={`mt-1 text-[13px] ${vsBefore.tone === 'good' ? 'text-success' : 'text-danger'}`}>
                                <Text copy={vsBefore.copy} />
                            </p>
                        )}
                    </div>
                    {biggestDoh ? (
                        <button
                            type="button"
                            onClick={() => onOpen(biggestDoh.subject, biggestDoh.items)}
                            className="rounded-2xl bg-white p-4 text-left transition-colors hover:bg-neutral-50"
                        >
                            <p className="text-[13px] text-neutral-500">
                                <i className="fa-solid fa-face-grimace mr-1.5 text-coral-600" aria-hidden="true" />
                                Down the drain
                            </p>
                            <M v={a.lastDoh.total} className="mt-1 block text-[26px] font-medium leading-tight tracking-[-0.03em] text-coral-700" />
                            <p className="mt-1 text-[13px] leading-snug text-neutral-600">
                                Biggest: <Text copy={biggestDoh.title} />
                            </p>
                        </button>
                    ) : (
                        <div className="rounded-2xl bg-white p-4">
                            <p className="text-[13px] text-neutral-500">Down the drain</p>
                            <p className="mt-1 text-[15px] text-neutral-900">Nothing. No doh moments in {prevName}.</p>
                        </div>
                    )}
                    {a.tryThis ? (
                        <button
                            type="button"
                            onClick={() => onOpen(a.tryThis!.subject, a.tryThis!.items)}
                            className="rounded-2xl bg-white p-4 text-left transition-colors hover:bg-neutral-50"
                        >
                            <p className="text-[13px] text-neutral-500">
                                <i className="fa-solid fa-lightbulb mr-1.5 text-warning" aria-hidden="true" />
                                One thing to try
                            </p>
                            <p className="mt-1 text-[15px] font-medium leading-snug text-neutral-900">
                                <Text copy={a.tryThis.title} />
                            </p>
                            {a.tryThis.saving ? (
                                <p className="mt-1 text-[13px] text-success">
                                    Worth about <M v={a.tryThis.saving} d={0} /> a month
                                </p>
                            ) : null}
                        </button>
                    ) : (
                        <div className="rounded-2xl bg-white p-4">
                            <p className="text-[13px] text-neutral-500">One thing to try</p>
                            <p className="mt-1 text-[15px] text-neutral-900">Same again: nothing big stood out.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    )
}

// ── Plans (the calendar link) ─────────────────────────────────────────────────

/** The event's date, tinted with its calendar colour. */
function DateChip({ event }: { event: Event }) {
    const { weekday, day } = shortDay(event.startDate)
    const c = useEventColors(event)
    return (
        <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none ${c.bg} ${c.text}`}>
            <span className="text-[10px] font-medium uppercase tracking-[0.06em] opacity-80">{weekday}</span>
            <span className="mt-0.5 text-[15px] font-semibold">{day}</span>
        </span>
    )
}

function eventMeta(e: Event): string {
    return [EVENT_TYPE_LABELS[e.eventType], e.location].filter(Boolean).join(' · ')
}

function Plans({
    spent,
    upcoming,
    planned,
    everyday,
    onOpen,
}: {
    spent: EventSpend[]
    upcoming: UpcomingPlan[]
    planned: number
    everyday: number
    onOpen: (title: string, items: StarlingSpendItem[]) => void
}) {
    const setAside = upcoming.reduce((s, p) => s + (p.typical ?? 0), 0)
    return (
        <Card hover={false}>
            <div className="mb-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] text-neutral-700">
                    <i className="fa-regular fa-calendar" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Plans and what they cost</h2>
                    <p className="text-[13px] text-neutral-500">
                        {planned > 0 ? (
                            <>
                                <M v={planned} className="text-neutral-900" /> went on plans in your calendar,{' '}
                                <M v={everyday} className="text-neutral-900" /> on everyday spend.
                            </>
                        ) : (
                            'Matched to your calendar by when you paid.'
                        )}
                    </p>
                </div>
            </div>

            {spent.length === 0 ? (
                <p className="rounded-xl bg-neutral-50 px-4 py-3 text-[13px] text-neutral-500">
                    Nothing in your calendar lined up with spending this month.
                </p>
            ) : (
                <ul className="-mx-2">
                    {spent.slice(0, 6).map((g) => (
                        <li key={`${g.event._id}|${g.event.startDate}`}>
                            <button
                                type="button"
                                onClick={() => onOpen(g.event.title, g.items)}
                                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-neutral-50"
                            >
                                <DateChip event={g.event} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] text-neutral-900">{g.event.title}</p>
                                    <p className="truncate text-[13px] text-neutral-500">
                                        {eventMeta(g.event)} · {plural(g.items.length, 'payment')}
                                    </p>
                                </div>
                                <M v={g.total} className="shrink-0 text-[15px] font-medium text-neutral-900" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {upcoming.length > 0 && (
                <div className="mt-5 border-t border-neutral-200 pt-4">
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                        <p className={OVERLINE}>Coming up</p>
                        {setAside > 0 && (
                            <p className="text-[13px] text-neutral-500">
                                Set aside about <M v={setAside} d={0} className="font-medium text-neutral-900" />
                            </p>
                        )}
                    </div>
                    <ul className="-mx-2">
                        {upcoming.slice(0, 5).map((p) => (
                            <li key={`${p.event._id}|${p.event.startDate}`} className="flex items-center gap-3 px-2 py-2">
                                <DateChip event={p.event} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] text-neutral-900">{p.event.title}</p>
                                    <p className="truncate text-[13px] text-neutral-500">
                                        {p.typical !== null ? (
                                            <>
                                                {EVENT_TYPE_LABELS[p.event.eventType]} plans usually cost about <M v={p.typical} d={0} />
                                            </>
                                        ) : (
                                            `${eventMeta(p.event)} · no history to go on yet`
                                        )}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Card>
    )
}

// ── Breakdown ─────────────────────────────────────────────────────────────────

type View = 'categories' | 'places'

function GroupRow({ g, view, onOpen }: { g: StatementGroup; view: View; onOpen: () => void }) {
    const diff = g.total - g.prevTotal
    const icon =
        view === 'categories' ? (
            <i className={`fa-solid ${categoryIcon(g.key === 'NONE' ? null : g.key)}`} aria-hidden="true" />
        ) : (
            <span className="text-[13px] font-semibold">{g.label.charAt(0).toUpperCase()}</span>
        )
    return (
        <button
            type="button"
            onClick={onOpen}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50"
        >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] text-neutral-700">{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[15px] text-neutral-900">{g.label}</p>
                    <M v={g.total} className="shrink-0 text-[15px] font-medium text-neutral-900" />
                </div>
                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-neutral-500">
                    <span className="truncate">
                        {Math.round(g.share * 100)}% · {plural(g.count, 'payment')}
                    </span>
                    <span className={`shrink-0 ${Math.abs(diff) < 0.01 ? '' : diff > 0 ? 'text-danger' : 'text-success'}`}>
                        {g.prevTotal === 0 ? (
                            'New'
                        ) : Math.abs(diff) < 0.01 ? (
                            'Same'
                        ) : (
                            <>
                                {diff > 0 ? '+' : '−'}
                                <M v={Math.abs(diff)} />
                            </>
                        )}
                    </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-neutral-900" style={{ width: `${Math.max(2, g.share * 100)}%` }} />
                </div>
            </div>
        </button>
    )
}

const ROWS_SHOWN = 7

function Breakdown({ s, onOpen }: { s: MonthStatement; onOpen: (title: string, items: StarlingSpendItem[], prevTotal?: number) => void }) {
    const [view, setView] = useState<View>('categories')
    const [all, setAll] = useState(false)
    const list = view === 'categories' ? s.categories : s.merchants
    const shown = all ? list : list.slice(0, ROWS_SHOWN)
    return (
        <Card hover={false}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Where it went</h2>
                <PillToggle
                    label="Group by"
                    value={view}
                    onChange={(v) => {
                        setView(v)
                        setAll(false)
                    }}
                    options={[
                        { value: 'categories', label: 'Categories' },
                        { value: 'places', label: 'Places' },
                    ]}
                />
            </div>
            <p className="mb-2 text-[13px] text-neutral-500">Change is against last month by the same day.</p>
            <div className="-mx-2">
                {shown.map((g) => (
                    <GroupRow key={g.key} g={g} view={view} onOpen={() => onOpen(g.label, g.items, g.prevTotal)} />
                ))}
            </div>
            {list.length > ROWS_SHOWN && (
                <button
                    type="button"
                    onClick={() => setAll(!all)}
                    className="mt-2 text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
                >
                    {all ? 'Show fewer' : `Show all ${list.length}`}
                </button>
            )}
        </Card>
    )
}

// ── Transactions ──────────────────────────────────────────────────────────────

function TransactionRow({ t, event, showDate }: { t: StarlingSpendItem; event?: Event; showDate?: boolean }) {
    const main = useContext(TagsContext).get(t.id)?.[0]
    return (
        <li className="flex items-center gap-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neutral-100 text-xs text-neutral-600">
                <i className={`fa-solid ${categoryIcon(t.category)}`} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-neutral-900">{t.merchant ?? 'Unknown'}</p>
                <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-neutral-500">
                    <span className="truncate">
                        {showDate ? `${dayLabel(t.date)} · ` : ''}
                        {timeLabel(t.time)}
                        {main ? ` · ${TAGS[main].label}` : ''}
                    </span>
                    {event && <EventPill event={event} />}
                </div>
            </div>
            <M v={t.amount} className="shrink-0 text-[15px] font-medium text-neutral-900" />
        </li>
    )
}

type KindFilter = 'all' | SpendKind

const PAGE_SIZE = 20

function Transactions({ s, eventOf }: { s: MonthStatement; eventOf: (id: string) => Event | undefined }) {
    const [query, setQuery] = useState('')
    const [kind, setKind] = useState<KindFilter>('all')
    const [page, setPage] = useState(1)
    const [tag, setTag] = useState<Tag | null>(null)
    const tagsOf = useContext(TagsContext)
    const q = query.trim().toLowerCase()
    // The month's most common tags, as quick filters.
    const tagCounts = new Map<Tag, number>()
    for (const c of s.categories)
        for (const t of c.items) for (const x of tagsOf.get(t.id) ?? []) tagCounts.set(x, (tagCounts.get(x) ?? 0) + 1)
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
    const items = s.categories
        .flatMap((c) => c.items)
        .filter((t) => kind === 'all' || spendKind(t.category) === kind)
        .filter((t) => !tag || (tagsOf.get(t.id) ?? []).includes(tag))
        .filter(
            (t) =>
                !q ||
                (t.merchant ?? '').toLowerCase().includes(q) ||
                categoryLabel(t.category).toLowerCase().includes(q) ||
                tagText(tagsOf.get(t.id) ?? []).includes(q) ||
                (eventOf(t.id)?.title ?? '').toLowerCase().includes(q)
        )
        .sort((a, b) => (a.time < b.time ? 1 : -1))
    const total = items.reduce((sum, t) => sum + t.amount, 0)
    // A day's total covers the whole day, even when it runs across two pages.
    const dayTotals = new Map<string, number>()
    for (const t of items) dayTotals.set(t.date, (dayTotals.get(t.date) ?? 0) + t.amount)
    const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
    const current = Math.min(page, pageCount)
    const byDay = new Map<string, StarlingSpendItem[]>()
    for (const t of items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE))
        byDay.set(t.date, [...(byDay.get(t.date) ?? []), t])

    return (
        <Card hover={false}>
            <div className="mb-4 flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Transactions</h2>
                    <p className="text-[13px] text-neutral-500">
                        {plural(items.length, 'payment')} · <M v={total} />
                    </p>
                </div>
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    placeholder="Search: pub, coffee, taxi, a place, a plan"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value)
                        setPage(1)
                    }}
                    aria-label="Search payments"
                />
                <PillToggle
                    label="Kind of spend"
                    value={kind}
                    onChange={(k) => {
                        setKind(k)
                        setPage(1)
                    }}
                    options={[
                        { value: 'all', label: 'All' },
                        { value: 'essential', label: 'Essentials' },
                        { value: 'lifestyle', label: 'Lifestyle' },
                        { value: 'other', label: 'Other' },
                    ]}
                />
                {topTags.length > 0 && (
                    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by tag">
                        {topTags.map(([x, count]) => {
                            const on = tag === x
                            return (
                                <button
                                    key={x}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => {
                                        setTag(on ? null : x)
                                        setPage(1)
                                    }}
                                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                        on ? 'bg-neutral-900 text-neutral-50' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                                    }`}
                                >
                                    <i className={`fa-solid ${TAGS[x].icon} text-[11px] opacity-70`} aria-hidden="true" />
                                    {TAGS[x].label}
                                    <span className={on ? 'text-neutral-400' : 'text-neutral-500'}>{count}</span>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
            {items.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-neutral-500">No payments match.</p>
            ) : (
                <div className="divide-y divide-neutral-100">
                    {[...byDay.entries()].map(([date, list]) => (
                        <div key={date} className="py-2">
                            <div className="flex items-baseline justify-between gap-3 pt-2">
                                <p className="text-[13px] font-medium text-neutral-600">{dayLabel(date)}</p>
                                <M v={dayTotals.get(date) ?? 0} className="text-[13px] font-medium text-neutral-600" />
                            </div>
                            <ul>
                                {list.map((t) => (
                                    <TransactionRow key={t.id} t={t} event={eventOf(t.id)} />
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
            {pageCount > 1 && (
                <div className="mt-4 flex flex-col items-center gap-2 border-t border-neutral-100 pt-4">
                    <Pagination
                        page={current}
                        pageCount={pageCount}
                        onChange={(p) => {
                            setPage(p)
                            document.getElementById('statement-transactions')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }}
                    />
                    <p className="text-xs text-neutral-500">
                        {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, items.length)} of {items.length}
                    </p>
                </div>
            )}
        </Card>
    )
}

// ── What's really yours ───────────────────────────────────────────────────────

/** The balance, less what's already spoken for: the money that's actually free. */
function ReallyYoursCard({
    balance,
    stillToCome,
    goal,
    payExpected,
}: {
    balance: StarlingBalance
    stillToCome: number
    goal: number | null
    payExpected: MoneyIn['payExpected']
}) {
    const free = balance.total - stillToCome
    const toLiveOn = goal ? free - goal : null
    const rows: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: string }[] = [
        {
            label: (
                <>
                    In the bank <span className="text-neutral-500">(main <M v={balance.main} d={0} /> + spaces <M v={balance.spaces} d={0} />)</span>
                </>
            ),
            value: <M v={balance.total} />,
        },
        { label: 'Bills still to come this month', value: <>−<M v={stillToCome} /></> },
        { label: 'Really yours', value: <M v={free} />, strong: true },
        ...(goal && toLiveOn !== null
            ? [
                  { label: 'Your savings goal, put aside', value: <>−<M v={goal} /></> },
                  { label: 'To live on', value: <M v={toLiveOn} />, strong: true, tone: toLiveOn < 0 ? 'text-danger' : 'text-success' },
              ]
            : []),
    ]
    return (
        <div className="rounded-[20px] bg-white p-5 ring-1 ring-neutral-900/[0.06] sm:p-6">
            <p className={OVERLINE}>What’s really yours</p>
            <div className="mt-3 flex items-baseline gap-2">
                <M v={toLiveOn ?? free} d={0} className={`text-[40px] font-medium leading-none tracking-[-0.04em] ${(toLiveOn ?? free) < 0 ? 'text-danger' : 'text-neutral-950'}`} />
            </div>
            <p className="mt-2 text-[13px] text-neutral-500">
                {toLiveOn !== null ? 'to live on, once bills and your goal are covered.' : 'once the bills still to come are paid.'}
            </p>
            <ul className="mt-5 divide-y divide-neutral-100 border-y border-neutral-100">
                {rows.map((r, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                        <span className={`min-w-0 ${r.strong ? 'font-medium text-neutral-900' : 'text-neutral-700'}`}>{r.label}</span>
                        <span className={`shrink-0 ${r.strong ? `font-semibold ${r.tone ?? 'text-neutral-900'}` : 'text-neutral-700'}`}>{r.value}</span>
                    </li>
                ))}
            </ul>
            {free < 0 && (
                <p className="mt-3 rounded-xl bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
                    The bills still to come are more than what’s in the bank. Move money in from savings, or talk to whoever’s due before it bounces.
                </p>
            )}
            {payExpected && (
                <p className="mt-3 text-xs text-neutral-500">
                    Pay of about <M v={payExpected.amount} d={0} /> usually lands around the {ordinal(payExpected.day)}.
                </p>
            )}
        </div>
    )
}

// ── Goal progress ─────────────────────────────────────────────────────────────

const GOAL_STATUS: Record<GoalProgress['status'], { label: string; tone: string; bar: string }> = {
    ahead: { label: 'Ahead', tone: 'text-success', bar: 'bg-success' },
    'on-track': { label: 'On track', tone: 'text-success', bar: 'bg-success' },
    behind: { label: 'Behind', tone: 'text-warning', bar: 'bg-marigold' },
    missed: { label: 'Budget gone', tone: 'text-danger', bar: 'bg-danger' },
    kept: { label: 'Kept', tone: 'text-success', bar: 'bg-success' },
}

/** The savings goal, any day of the month: on course or not, and what to keep to. */
function GoalProgressCard({
    progress,
    onGoal,
}: {
    progress: GoalProgress | null
    onGoal: (goal: number | null) => void
}) {
    const [changing, setChanging] = useState(false)
    const chips = (
        <div className="mt-3 flex flex-wrap gap-2">
            {[100, 250, 500].map((g) => (
                <button
                    key={g}
                    type="button"
                    onClick={() => {
                        onGoal(g)
                        setChanging(false)
                    }}
                    className="h-8 rounded-full bg-white px-3 text-[13px] font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200 hover:bg-neutral-50"
                >
                    <M v={g} d={0} /> a month
                </button>
            ))}
            {progress && (
                <button type="button" onClick={() => onGoal(null)} className="h-8 rounded-full px-3 text-[13px] text-neutral-500 hover:text-neutral-900">
                    No goal
                </button>
            )}
        </div>
    )
    if (!progress) {
        return (
            <div className="rounded-[20px] bg-success-bg p-5 sm:p-6">
                <p className={OVERLINE}>Savings goal</p>
                <p className="mt-2 text-[20px] font-semibold tracking-[-0.015em] text-neutral-950">How much do you want to keep back?</p>
                <p className="mt-1 text-[13px] text-neutral-600">Pick a monthly goal and this tracks it every day: on course or not, and what to keep to.</p>
                {chips}
            </div>
        )
    }
    const st = GOAL_STATUS[progress.status]
    const used = progress.budget > 0 ? Math.min(100, (progress.spent / progress.budget) * 100) : 100
    const pace = progress.budget > 0 ? Math.min(100, ((progress.spent + progress.aheadBy) / progress.budget) * 100) : 0
    const finished = progress.status === 'kept' || (progress.status === 'missed' && progress.daysLeft === 0)
    return (
        <div className="rounded-[20px] bg-success-bg p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
                <p className={OVERLINE}>Savings goal</p>
                <button type="button" onClick={() => setChanging(!changing)} className="text-[13px] font-medium text-neutral-600 hover:text-neutral-900">
                    {changing ? 'Cancel' : 'Change'}
                </button>
            </div>
            <p className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.015em] text-neutral-950">
                <span className={st.tone}>{st.label}:</span>{' '}
                {finished ? 'kept' : 'on course to keep'} <M v={Math.max(0, progress.onCourseToKeep)} d={0} /> of your <M v={progress.goal} d={0} />
            </p>
            {changing && chips}
            <div className="relative mt-5 h-2.5 overflow-hidden rounded-full bg-white">
                <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${used}%` }} />
                {!finished && <div className="absolute top-0 h-full w-0.5 bg-neutral-900/40" style={{ left: `${pace}%` }} title="Where you'd be at an even pace" />}
            </div>
            <p className="mt-3 text-[13px] leading-snug text-neutral-700">
                <M v={progress.spent} d={0} className="font-medium text-neutral-900" /> of a <M v={progress.budget} d={0} /> day-to-day budget spent
                {progress.daysLeft > 0 && progress.status !== 'missed' ? (
                    <>
                        . Keep to <M v={progress.perDayToHit} className="font-medium text-neutral-900" /> a day for the last {progress.daysLeft} days.
                    </>
                ) : progress.daysLeft > 0 ? (
                    '. Every pound not spent from here still counts.'
                ) : (
                    '.'
                )}
            </p>
        </div>
    )
}

// ── This week ─────────────────────────────────────────────────────────────────

function shortRange(start: string, end: string): string {
    const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${f(start)} – ${f(end)}`
}

/** The weekly check-in: the week against its budget, where it went, one doh, one tip. */
function WeekCard({ week, onOpen }: { week: WeekReview; onOpen: (title: string, items: StarlingSpendItem[]) => void }) {
    const over = week.left < 0
    const used = week.budget > 0 ? Math.min(100, (week.spent / week.budget) * 100) : 0
    const vsLast = week.spent - week.lastWeek
    return (
        <section className="mb-6 rounded-[20px] bg-white p-5 ring-1 ring-neutral-900/[0.06] sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <p className={OVERLINE}>{week.done ? 'Your week in review' : 'This week'}</p>
                    <p className="mt-0.5 text-[13px] text-neutral-500">
                        {shortRange(week.start, week.end)}
                        {week.done ? '' : ` · day ${week.days} of 7`}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onOpen(week.done ? 'Last week' : 'This week', week.items)}
                    className="text-[13px] font-medium text-neutral-600 hover:text-neutral-900"
                >
                    See {plural(week.items.length, 'payment')}
                </button>
            </div>

            <div className="mt-4 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
                <div>
                    <div className="flex items-baseline gap-2">
                        <M v={week.spent} d={0} className="text-[40px] font-medium leading-none tracking-[-0.04em] text-neutral-950" />
                        <span className="text-[15px] text-neutral-600">
                            of <M v={week.budget} d={0} />
                        </span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-100">
                        <div className={`h-full rounded-full ${over ? 'bg-danger' : 'bg-neutral-900'}`} style={{ width: `${used}%` }} />
                    </div>
                    <p className={`mt-2 text-[13px] ${over ? 'text-danger' : 'text-neutral-600'}`}>
                        {over ? (
                            <>
                                <M v={-week.left} d={0} /> over the week’s budget
                            </>
                        ) : (
                            <>
                                <M v={week.left} d={0} /> {week.done ? 'under budget' : 'left this week'}
                            </>
                        )}
                        {week.lastWeek > 0 && (
                            <span className="text-neutral-500">
                                {' · '}
                                {Math.abs(vsLast) < 1 ? (
                                    'same as the week before'
                                ) : (
                                    <>
                                        <M v={Math.abs(vsLast)} d={0} /> {vsLast > 0 ? 'more' : 'less'} than the week before
                                    </>
                                )}
                            </span>
                        )}
                    </p>
                    {week.bills > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">
                            Plus <M v={week.bills} d={0} /> of bills and one-offs, not counted against the week.
                        </p>
                    )}
                    <p className="mt-4 flex gap-2 rounded-xl bg-warning-bg px-3 py-2.5 text-[13px] leading-snug text-neutral-800">
                        <i className="fa-solid fa-lightbulb mt-0.5 text-warning" aria-hidden="true" />
                        <span>
                            <Text copy={week.tip} />
                        </span>
                    </p>
                </div>
                <div>
                    <p className={`mb-1 ${OVERLINE}`}>Where it went</p>
                    {week.topPlaces.length === 0 ? (
                        <p className="py-2 text-[15px] text-neutral-500">Nothing yet this week.</p>
                    ) : (
                        <ul className="divide-y divide-neutral-100">
                            {week.topPlaces.map((p) => (
                                <li key={p.label} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                                    <span className="min-w-0 truncate text-neutral-900">
                                        {p.label} <span className="text-[13px] text-neutral-500">×{p.count}</span>
                                    </span>
                                    <M v={p.total} className="shrink-0 font-medium text-neutral-900" />
                                </li>
                            ))}
                        </ul>
                    )}
                    {week.doh.lines.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onOpen(week.doh.lines[0].subject, week.doh.lines[0].items)}
                            className="mt-3 flex w-full items-center gap-2 rounded-xl bg-coral-50 px-3 py-2.5 text-left text-[13px] text-neutral-800 hover:bg-coral-100"
                        >
                            <i className="fa-solid fa-face-grimace text-coral-600" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                                Doh this week: <Text copy={week.doh.lines[0].title} />
                            </span>
                        </button>
                    )}
                </div>
            </div>
        </section>
    )
}

// ── Money in ──────────────────────────────────────────────────────────────────

function MoneyInCard({ m, prevName, onOpen }: { m: MoneyIn; prevName: string; onOpen: (title: string, items: StarlingSpendItem[]) => void }) {
    const vs = m.prevTotal > 0 || m.total > 0 ? compare(m.total, m.prevTotal) : null
    return (
        <Card hover={false}>
            <div className="mb-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success-bg text-[13px] text-success">
                    <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Money in</h2>
                    <p className="text-[13px] text-neutral-500">Everything that arrived, not counting moves between your own pots.</p>
                </div>
            </div>
            <div className="flex items-baseline gap-2">
                <M v={m.total} d={0} className="text-[32px] font-medium leading-none tracking-[-0.03em] text-neutral-950" />
                {vs && vs.tone !== 'neutral' && (
                    <span className="text-[13px] text-neutral-500">
                        vs <M v={m.prevTotal} d={0} /> in {prevName} by now
                    </span>
                )}
            </div>
            {m.groups.length === 0 ? (
                <p className="mt-4 rounded-xl bg-neutral-50 px-4 py-3 text-[13px] text-neutral-500">Nothing in yet this month.</p>
            ) : (
                <ul className="-mx-2 mt-3">
                    {m.groups.map((g) => (
                        <li key={g.kind}>
                            <button
                                type="button"
                                onClick={() => onOpen(INCOME_LABEL[g.kind].label, g.items)}
                                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50"
                            >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] text-neutral-700">
                                    <i className={`fa-solid ${INCOME_LABEL[g.kind].icon}`} aria-hidden="true" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[15px] text-neutral-900">{INCOME_LABEL[g.kind].label}</span>
                                    <span className="block text-[13px] text-neutral-500">{plural(g.items.length, 'payment')}</span>
                                </span>
                                <M v={g.total} className="shrink-0 text-[15px] font-medium text-neutral-900" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-neutral-200 pt-3 text-[15px]">
                <span className="text-neutral-700">In minus out so far</span>
                <span className={`font-semibold ${m.net >= 0 ? 'text-success' : 'text-danger'}`}>
                    {m.net >= 0 ? '+' : ''}
                    <M v={m.net} d={0} />
                </span>
            </div>
            {m.payExpected && (
                <p className="mt-2 text-xs text-neutral-500">
                    No pay in yet. Last month it was <M v={m.payExpected.amount} d={0} /> on the {ordinal(m.payExpected.day)}.
                </p>
            )}
        </Card>
    )
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

function SubscriptionsCard({
    list,
    loading,
    onOpen,
}: {
    list: SubscriptionList
    loading: boolean
    onOpen: (title: string, items: StarlingSpendItem[]) => void
}) {
    const dayMonth = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return (
        <Card hover={false}>
            <div className="mb-4 flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] text-neutral-700">
                    <i className="fa-solid fa-rotate" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-neutral-900">Subscriptions</h2>
                    <p className="text-[13px] text-neutral-500">
                        {list.subs.length ? (
                            <>
                                <M v={list.monthly} className="font-medium text-neutral-900" /> a month,{' '}
                                <M v={list.yearly} d={0} className="font-medium text-neutral-900" /> a year.
                            </>
                        ) : loading ? (
                            'Reading your past months…'
                        ) : (
                            'Nothing that looks like a subscription.'
                        )}
                    </p>
                </div>
            </div>
            {list.subs.length > 0 && (
                <ul className="-mx-2">
                    {list.subs.map((sub) => (
                        <li key={sub.key}>
                            <button
                                type="button"
                                onClick={() => onOpen(sub.name, sub.items)}
                                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-neutral-50"
                            >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-[13px] font-semibold text-neutral-700">
                                    {sub.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        <span className="truncate text-[15px] text-neutral-900">{sub.name}</span>
                                        {sub.priceRise && (
                                            <span className="shrink-0 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning">
                                                up from <M v={sub.priceRise.from} />
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-[13px] text-neutral-500">
                                        <M v={sub.amount} /> a {sub.every} · next around {dayMonth(sub.nextDue)}
                                    </span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <M v={sub.yearly} d={0} className="block text-[15px] font-medium text-neutral-900" />
                                    <span className="text-[11px] text-neutral-500">a year</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {list.subs.length > 1 && (
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                    Not using one? Cancelling the cheapest still puts <M v={Math.min(...list.subs.map((x) => x.yearly))} d={0} /> a year back.
                </p>
            )}
        </Card>
    )
}

// ── The bigger picture ────────────────────────────────────────────────────────

function TrendsSection({ t, loading }: { t: Trends; loading: boolean }) {
    const shown = t.months.filter((m) => m.out > 0 || m.in > 0)
    const top = Math.max(1, ...shown.map((m) => Math.max(m.out, m.in)))
    const finished = shown.filter((m) => !m.partial).length
    const label = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    const tiles = [
        { label: 'A typical month out', value: <M v={t.averageOut} d={0} />, sub: <>day-to-day <M v={t.averageDayToDay} d={0} /></> },
        { label: 'A typical month in', value: <M v={t.averageIn} d={0} />, sub: 'pay, refunds and the rest' },
        { label: 'Months you came out ahead', value: `${t.monthsAhead} of ${finished}`, sub: 'more in than out' },
        {
            label: 'Cheapest month',
            value: t.best ? <M v={t.best.out} d={0} /> : '—',
            sub: t.best ? `${label(t.best.month)}${t.worst ? `; dearest ${label(t.worst.month)}` : ''}` : '',
        },
    ]
    return (
        <section className="mb-6">
            <div className="mb-3">
                <h2 className={H2}>The bigger picture</h2>
                <p className="mt-0.5 text-[13px] text-neutral-500">
                    {finished ? `Your last ${finished} month${finished === 1 ? '' : 's'}${loading ? ', more on the way' : ''}.` : 'Reading your past months…'}
                </p>
            </div>
            {finished > 0 && (
                <>
                    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        {tiles.map((x) => (
                            <div key={x.label} className="rounded-[20px] bg-white p-4 ring-1 ring-neutral-900/[0.06]">
                                <p className="text-[13px] text-neutral-500">{x.label}</p>
                                <p className="mt-1 text-[24px] font-medium tracking-[-0.03em] text-neutral-950">{x.value}</p>
                                <p className="mt-0.5 truncate text-xs text-neutral-500">{x.sub}</p>
                            </div>
                        ))}
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr]">
                        <Card hover={false}>
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <p className={OVERLINE}>Month by month</p>
                                <span className="flex items-center gap-3 text-xs text-neutral-500">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-neutral-900" aria-hidden="true" /> Out
                                    </span>
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> In
                                    </span>
                                </span>
                            </div>
                            <ul className="flex flex-col gap-2.5">
                                {[...shown].reverse().map((m) => (
                                    <li key={m.month} className="grid grid-cols-[3.25rem_1fr_auto] items-center gap-3">
                                        <span className="text-[13px] text-neutral-600">{label(m.month)}</span>
                                        <span className="flex flex-col gap-1">
                                            <span className="h-2 rounded-full bg-neutral-100">
                                                <span className={`block h-full rounded-full ${m.partial ? 'bg-neutral-400' : 'bg-neutral-900'}`} style={{ width: `${(m.out / top) * 100}%` }} />
                                            </span>
                                            <span className="h-1.5 rounded-full bg-neutral-100">
                                                <span className="block h-full rounded-full bg-success" style={{ width: `${(m.in / top) * 100}%` }} />
                                            </span>
                                        </span>
                                        <span className="w-28 text-right text-[13px]">
                                            <M v={m.out} d={0} className="font-medium text-neutral-900" />
                                            <span className="text-neutral-500"> / </span>
                                            <M v={m.in} d={0} className="text-success" />
                                            {m.partial && <span className="block text-[11px] text-neutral-500">so far</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </Card>
                        <Card hover={false}>
                            <p className={OVERLINE}>Creeping up</p>
                            {t.creepingUp.length === 0 ? (
                                <p className="mt-2 text-[15px] text-neutral-500">Nothing creeping up over the last three months. Nice.</p>
                            ) : (
                                <ul className="mt-2 divide-y divide-neutral-100">
                                    {t.creepingUp.map((c) => (
                                        <li key={c.key} className="py-2.5">
                                            <div className="flex items-baseline justify-between gap-3 text-[15px]">
                                                <span className="text-neutral-900">{c.label}</span>
                                                <span className="font-medium text-danger">
                                                    +<M v={c.change} d={0} /> a month
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-neutral-500">
                                                <M v={c.before} d={0} /> → <M v={c.recent} d={0} /> a month, three months against the three before
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {t.easingOff.length > 0 && (
                                <>
                                    <p className={`mt-5 ${OVERLINE}`}>Easing off</p>
                                    <ul className="mt-2 divide-y divide-neutral-100">
                                        {t.easingOff.map((c) => (
                                            <li key={c.key} className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
                                                <span className="text-neutral-900">{c.label}</span>
                                                <span className="font-medium text-success">
                                                    −<M v={-c.change} d={0} /> a month
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </>
                            )}
                        </Card>
                    </div>
                </>
            )}
        </section>
    )
}

// ── Drill-in ──────────────────────────────────────────────────────────────────

interface Detail {
    title: string
    items: StarlingSpendItem[]
    /** The same thing last month by this day, when there's one to compare. */
    prevTotal?: number
}

function DetailBody({ d, eventOf }: { d: Detail; eventOf: (id: string) => Event | undefined }) {
    const total = d.items.reduce((s, t) => s + t.amount, 0)
    const places = new Map<string, { label: string; total: number; count: number }>()
    for (const t of d.items) {
        const key = (t.merchant ?? 'Unknown').toLowerCase()
        const p = places.get(key) ?? { label: t.merchant ?? 'Unknown', total: 0, count: 0 }
        p.total += t.amount
        p.count++
        places.set(key, p)
    }
    const top = [...places.values()].sort((a, b) => b.total - a.total)
    const vs = d.prevTotal !== undefined ? compare(total, d.prevTotal) : null

    return (
        <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-3">
                {[
                    { label: 'Total', value: <M v={total} /> },
                    { label: 'Payments', value: d.items.length },
                    { label: 'Average', value: d.items.length ? <M v={total / d.items.length} /> : '—' },
                ].map((f) => (
                    <div key={f.label} className="rounded-xl bg-neutral-50 px-3 py-2.5">
                        <p className="text-[12px] text-neutral-500">{f.label}</p>
                        <p className="mt-0.5 truncate text-[17px] font-medium text-neutral-900">{f.value}</p>
                    </div>
                ))}
            </div>
            {vs && (
                <p
                    className={`-mt-3 text-[13px] ${vs.tone === 'good' ? 'text-success' : vs.tone === 'bad' ? 'text-danger' : 'text-neutral-500'}`}
                >
                    <Text copy={vs.copy} />, by the same day.
                </p>
            )}
            {top.length > 1 && (
                <div>
                    <p className={`mb-1 ${OVERLINE}`}>Where</p>
                    <ul className="divide-y divide-neutral-100">
                        {top.slice(0, 5).map((p) => (
                            <li key={p.label} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                                <span className="min-w-0 truncate text-neutral-900">
                                    {p.label} <span className="text-[13px] text-neutral-500">×{p.count}</span>
                                </span>
                                <M v={p.total} className="shrink-0 font-medium text-neutral-900" />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div>
                <p className={`mb-1 ${OVERLINE}`}>Payments</p>
                <ul className="divide-y divide-neutral-100">
                    {[...d.items]
                        .sort((a, b) => (a.time < b.time ? 1 : -1))
                        .map((t) => (
                            <TransactionRow key={t.id} t={t} event={eventOf(t.id)} showDate />
                        ))}
                </ul>
            </div>
        </div>
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Finances → Statement: this month's spend, analysed live up to today. */
export default function Statement() {
    useMoneyHidden()
    // Dev only: ?mock=first-of-month (1 November, nothing spent) or ?mock=mid-month
    // (Thursday 22 October) shows made-up data. Never in production builds.
    const [mock] = useState<'first-of-month' | 'mid-month' | null>(() => {
        if (!import.meta.env.DEV) return null
        const m = new URLSearchParams(window.location.search).get('mock')
        return m === 'first-of-month' || m === 'mid-month' ? m : null
    })
    const [today, setToday] = useState(() =>
        mock === 'first-of-month' ? '2026-11-01' : mock === 'mid-month' ? '2026-10-22' : todayKey()
    )
    const currentMonth = today.slice(0, 7)
    // null = follow the current month, so the page rolls over to a clean slate on the 1st.
    const [picked, setPicked] = useState<string | null>(null)
    const month = picked ?? currentMonth

    const [data, setData] = useState<StatementData | null>(null)
    const [configured, setConfigured] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
    const [detail, setDetail] = useState<Detail | null>(null)
    const [calendars, setCalendars] = useState<Map<string, Calendar>>(new Map())
    useEffect(() => {
        // Colour only: without it, pills fall back to the event-type colours.
        listCalendars()
            .then((list) => setCalendars(new Map(list.map((c) => [c._id, c]))))
            .catch(() => {})
    }, [])
    // The savings goal lives in user settings, so it follows you between devices.
    const { user, updateUser } = useAuth()
    const [goal, setGoal] = useState<number | null>(user?.settings?.savingsGoal ?? null)
    async function saveGoal(next: number | null) {
        setGoal(next)
        if (mock || !user) return
        try {
            // 0 clears it on the server.
            updateUser(await updateSettings({ ...(user.settings ?? {}), savingsGoal: next ?? 0 }))
        } catch {
            // Keep the choice on screen; it just won't stick until next time.
        }
    }
    // This month's planned income from the Monthly sheet (our own data, no Starling calls).
    const [income, setIncome] = useState<{ month: string; amount: number } | null>(null)
    useEffect(() => {
        let active = true
        if (import.meta.env.DEV && mock) {
            import('../dev/statementMock').then((m) => active && setIncome({ month, amount: m.income }))
        } else {
            Promise.all([listGroups(), listRows(), listEntries(month)])
                .then(([g, r, e]) => active && setIncome({ month, amount: incomeForMonth(g, r, e, month) }))
                .catch(() => {})
        }
        return () => {
            active = false
        }
    }, [month, mock])

    // Up to a year of finished months (stored server-side), for trends, subscriptions
    // and the month before last. Filled a few months per request, so ask again
    // while the server says some are pending.
    const [history, setHistory] = useState<StarlingHistory | null>(null)
    useEffect(() => {
        let active = true
        if (import.meta.env.DEV && mock) {
            import('../dev/statementMock').then((m) => active && setHistory(m.historyBefore(today.slice(0, 7))))
            return () => {
                active = false
            }
        }
        let tries = 0
        const pull = () =>
            getStarlingHistory(12)
                .then((h) => {
                    if (!active) return
                    setHistory(h)
                    if (h.pending > 0 && ++tries < HISTORY_TRIES) window.setTimeout(pull, HISTORY_RETRY_MS)
                })
                .catch(() => {})
        pull()
        return () => {
            active = false
        }
    }, [mock, today])

    // What's in the account right now (current month only).
    const [balance, setBalance] = useState<StarlingBalance | null>(null)
    useEffect(() => {
        let active = true
        if (month !== currentMonth) return
        if (import.meta.env.DEV && mock) {
            import('../dev/statementMock').then((m) => active && setBalance(m.balance))
        } else {
            getStarlingBalance()
                .then((b) => active && setBalance(b))
                .catch(() => {})
        }
        return () => {
            active = false
        }
    }, [month, currentMonth, mock])

    // Fetch a month (and the one before it), then apply the result. Split in two so
    // effects only ever set state from a callback.
    const fetchMonth = useCallback(async (m: string): Promise<LoadResult> => {
        const prevMonth = shiftMonth(m, -1)
        const now = todayKey()
        // Only ask for days that have happened.
        const monthEnd = `${m}-${String(daysIn(m)).padStart(2, '0')}`
        const end = m === now.slice(0, 7) ? now : monthEnd
        try {
            // One request for both months (at most 62 days, under the server's 70) —
            // every request reads each space's feed, and Starling rate-limits.
            // buildMonthStatement picks each month out by date.
            const [flow, events] = await Promise.all([
                listStarlingFlow(`${prevMonth}-01`, end),
                // The calendar is a bonus: the statement still works without it.
                listEvents(`${prevMonth}-01`, monthEnd).catch(() => [] as Event[]),
            ])
            return { ok: true, now, data: { month: m, items: flow.out, incoming: flow.in, events } }
        } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { message?: string } } }
            if (e?.response?.status === 501) return { ok: false, notConfigured: true }
            return { ok: false, message: e?.response?.data?.message ?? 'Check the access token is still valid, then reload this page.' }
        }
    }, [])

    const apply = useCallback((r: LoadResult) => {
        if (r.ok) {
            // Set together so a month rollover swaps the page and its data in one go.
            setToday(r.now)
            setData(r.data)
            setConfigured(true)
            setError(null)
            setUpdatedAt(new Date())
        } else if (r.notConfigured) setConfigured(false)
        else setError(r.message ?? null)
    }, [])

    const load = useCallback((m: string) => fetchMonth(m).then(apply), [fetchMonth, apply])

    // The spinner shows whenever the loaded data isn't for this month, so no loading flag.
    useEffect(() => {
        let active = true
        if (import.meta.env.DEV && mock) {
            // Serve every month from the mock; no Starling calls.
            import('../dev/statementMock').then((m) => {
                if (!active) return
                setData({ month, items: m.items, incoming: m.incoming, events: m.events })
                setUpdatedAt(new Date())
            })
        } else {
            fetchMonth(month).then((r) => active && apply(r))
        }
        return () => {
            active = false
        }
    }, [month, fetchMonth, apply, mock])

    // Live: refresh on an interval and whenever the tab comes back into view.
    // Past months don't change, so only the current one is kept fresh.
    useEffect(() => {
        if (mock || month !== currentMonth) return
        const refresh = () => {
            if (document.visibilityState === 'visible') load(picked ?? todayKey().slice(0, 7))
        }
        const id = window.setInterval(refresh, REFRESH_MS)
        document.addEventListener('visibilitychange', refresh)
        return () => {
            window.clearInterval(id)
            document.removeEventListener('visibilitychange', refresh)
        }
    }, [month, currentMonth, picked, load, mock])

    const view = useMemo(() => {
        if (!data || data.month !== month) return null
        // Tag both months, then give drinks their own category (Starling files them as eating out).
        const tags = tagAll(data.items)
        const items = data.items.map((t) => refineCategory(t, tags.get(t.id)))
        const s = buildMonthStatement(month, items, items, today)
        const prevName = formatMonthKey(s.prev.month).split(' ')[0]
        // Matched across both months, so upcoming plans can lean on last month's too.
        const matched = matchSpendToEvents(items, data.events)
        // The month before last, tagged and refined the same way, for trends.
        const olderKey = shiftMonth(month, -2)
        const olderRaw = history?.months.find((h) => h.month === olderKey)?.items.filter((t) => t.direction !== 'IN')
        const olderMonth = olderRaw?.length
            ? (() => {
                  const olderTags = tagAll(olderRaw)
                  return {
                      month: olderKey,
                      name: formatMonthKey(olderKey).split(' ')[0],
                      items: olderRaw.map((t) => refineCategory(t, olderTags.get(t.id))),
                  }
              })()
            : undefined
        const inMonth = (t: StarlingSpendItem) => t.date.startsWith(month) && t.date <= s.asOf
        const spent = matched.events
            .map((g) => {
                const items = g.items.filter(inMonth)
                return { ...g, items, total: Math.round(items.reduce((a, t) => a + t.amount, 0) * 100) / 100 }
            })
            .filter((g) => g.total > 0)
            .sort((a, b) => b.total - a.total)
        const planned = spent.reduce((a, g) => a + g.total, 0)
        return {
            s,
            kinds: kindTotals(s),
            doh: buildDoh(s.categories.flatMap((c) => c.items)),
            tags,
            insights: buildInsights(s, items, prevName, olderMonth),
            ahead: s.isCurrent && (s.dayOfMonth <= AHEAD_DAYS || s.count === 0) ? buildMonthAhead(s, items, olderMonth) : null,
            spent,
            planned,
            everyday: s.total - planned,
            upcoming: s.isCurrent ? upcomingPlans(data.events, matched, today, `${month}-${String(s.daysInMonth).padStart(2, '0')}`) : [],
            byItem: matched.byItem,
            items,
            moneyIn: buildMoneyIn(month, data.incoming, s.asOf, s.prev.month, s.total),
        }
    }, [data, month, today, history])

    // The bigger picture: a year of months (history + this one), and subscriptions across it.
    const bigPicture = useMemo(() => {
        if (!view || !history || !data) return null
        const past = history.months.filter((h) => h.month < month)
        const pastOut = past.flatMap((h) => h.items.filter((t) => t.direction !== 'IN'))
        const pastTags = tagAll(pastOut)
        const out = [...pastOut.map((t) => refineCategory(t, pastTags.get(t.id))), ...view.s.categories.flatMap((c) => c.items)]
        const incoming = [
            ...past.flatMap((h) => h.items.filter((t) => t.direction === 'IN')),
            ...data.incoming.filter((t) => t.date.startsWith(month) && t.date <= view.s.asOf),
        ]
        const months = [...past.map((h) => h.month), month].sort().slice(-12)
        return {
            trends: buildTrends(out, incoming, months, view.s.isCurrent ? month : ''),
            subs: findSubscriptions(out, view.s.asOf),
            loading: history.pending > 0,
        }
    }, [view, history, data, month])

    // The goal all month long, and the week's budget that follows from it.
    const progress = useMemo(() => {
        if (!view || !goal) return null
        return goalProgress(view.s, view.items, goal)
    }, [view, goal])
    const week = useMemo(() => {
        if (!view || !view.s.isCurrent || !view.s.forecast) return null
        // Per day: the goal's budget spread over the month, or last month's day-to-day rate.
        const perDay = progress ? progress.budget / view.s.daysInMonth : view.s.forecast.prevDayToDayPerDay
        return buildWeekReview(view.items, today, perDay)
    }, [view, progress, today])

    const plan = useMemo(() => {
        const a = view?.ahead
        if (!a) return null
        return buildSavingsPlan({
            last: a.last,
            lastDoh: a.lastDoh,
            goal: goal ?? 0,
            lastName: formatMonthKey(a.last.month).split(' ')[0],
            prevDayToDay: a.prevDayToDay,
            bills: a.billsTotal,
            spentDayToDay: a.spentDayToDay,
            daysLeft: a.daysLeft,
            income: income && income.month === month && income.amount > 0 ? income.amount : null,
        })
    }, [view, goal, income, month])

    if (!configured) {
        return (
            <EmptyState
                icon="fa-solid fa-building-columns"
                title="Starling isn't connected"
                description="Add a Starling access token on the server to see your statement here."
            />
        )
    }

    const isCurrent = month === currentMonth
    const eventOf = (id: string) => view?.byItem.get(id)
    const open = (title: string, items: StarlingSpendItem[], prevTotal?: number) => setDetail({ title, items, prevTotal })
    const s = view?.s ?? null
    const prevName = s ? formatMonthKey(s.prev.month).split(' ')[0] : ''

    const aheadEl =
        view?.ahead && s ? (
            <MonthAheadSection
                a={view.ahead}
                monthName={monthOnly(month)}
                prevName={prevName}
                onOpen={open}
                plan={plan}
                goal={
                    <SavingsGoalCard
                        plan={plan}
                        goal={goal}
                        presets={goalPresets(plan?.possible ?? 0)}
                        possible={plan?.possible ?? 0}
                        lastName={prevName}
                        onGoal={saveGoal}
                        onOpen={open}
                    />
                }
            />
        ) : null
    const moneyInEl = view ? <MoneyInCard m={view.moneyIn} prevName={prevName} onOpen={open} /> : null
    // Right now: what's really yours, beside the goal (or, early in the month when
    // the goal sits in the month ahead, beside money in).
    const reallyYours =
        s?.isCurrent && balance && s.forecast ? (
            <ReallyYoursCard balance={balance} stillToCome={s.forecast.stillToCome} goal={goal} payExpected={view?.moneyIn.payExpected ?? null} />
        ) : null
    const besideIt = view?.ahead ? moneyInEl : view ? <GoalProgressCard progress={progress} onGoal={saveGoal} /> : null
    const nowRow =
        reallyYours || besideIt ? (
            <div className={`mb-6 grid items-start gap-4 ${reallyYours && besideIt ? 'lg:grid-cols-2' : ''}`}>
                {reallyYours}
                {besideIt}
            </div>
        ) : null
    const subsEl = bigPicture ? <SubscriptionsCard list={bigPicture.subs} loading={bigPicture.loading} onOpen={open} /> : null
    const trendsEl = bigPicture ? <TrendsSection t={bigPicture.trends} loading={bigPicture.loading} /> : null

    return (
        <CalendarsContext.Provider value={calendars}>
            <TagsContext.Provider value={view?.tags ?? EMPTY_TAGS}>
                <Hero
                    s={s}
                    kinds={view?.kinds ?? []}
                    status={
                        isCurrent
                            ? `Live${updatedAt ? ` · updated ${updatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                            : 'A finished month, for looking back'
                    }
                    nav={{
                        label: formatMonthKey(month),
                        onPrev: () => setPicked(shiftMonth(month, -1)),
                        onNext: () => {
                            const next = shiftMonth(month, 1)
                            setPicked(next === currentMonth ? null : next)
                        },
                        nextDisabled: isCurrent,
                    }}
                />

                {error && !view ? (
                    <EmptyState icon="fa-solid fa-triangle-exclamation" title="Couldn't reach Starling" description={error} />
                ) : !view || !s ? (
                    <div className="grid place-items-center py-16">
                        <Spinner />
                    </div>
                ) : s.count === 0 ? (
                    <>
                        {aheadEl}
                        {nowRow}
                        {!s.isCurrent && (
                            <EmptyState icon="fa-regular fa-calendar" title="Nothing spent" description="Nothing went out this month." />
                        )}
                        <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
                            {s.isCurrent && (
                                <Plans spent={[]} upcoming={view.upcoming} planned={0} everyday={0} onOpen={(title, items) => open(title, items)} />
                            )}
                            {subsEl}
                        </div>
                        {trendsEl}
                    </>
                ) : (
                    <>
                        {aheadEl}
                        {nowRow}
                        {week && <WeekCard week={week} onOpen={open} />}
                        <DohSection doh={view.doh} onOpen={open} />
                        <Insights insights={view.insights} onOpen={open} />
                        <div className="mb-6 grid items-start gap-6 lg:grid-cols-2">
                            <Breakdown s={s} onOpen={open} />
                            <Plans
                                spent={view.spent}
                                upcoming={view.upcoming}
                                planned={view.planned}
                                everyday={view.everyday}
                                onOpen={(title, items) => open(title, items)}
                            />
                        </div>
                        <div className={`mb-6 grid items-start gap-6 ${view.ahead ? '' : 'lg:grid-cols-2'}`}>
                            {!view.ahead && moneyInEl}
                            {subsEl}
                        </div>
                        {trendsEl}
                        <div id="statement-transactions" className="scroll-mt-6">
                            <Transactions key={s.month} s={s} eventOf={eventOf} />
                        </div>
                    </>
                )}

                <Drawer
                    open={!!detail}
                    onClose={() => setDetail(null)}
                    title={detail?.title}
                    badge={detail ? plural(detail.items.length, 'payment') : undefined}
                    size="lg"
                >
                    {detail && <DetailBody d={detail} eventOf={eventOf} />}
                </Drawer>
            </TagsContext.Provider>
        </CalendarsContext.Provider>
    )
}
