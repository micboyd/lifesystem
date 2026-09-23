import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ProgressRing, HeroChip } from '../planner/WeekPlannerUI'
import { useMoneyHidden } from '../useMoneyHidden'
import { formatMoney } from '../../lib/money'
import { formatDateLong, todayKey, addDays } from '../../lib/calendar'
import {
    reportHeadline,
    type DailyReport,
    type NoteArea,
    type ReportNote,
    type SessionKind,
} from '../../lib/dailyReport'

/**
 * A day's report laid out in full: the gradient hero with the day's numbers,
 * what went well against what didn't, then a panel per area.
 */

const AREA_ICONS: Record<NoteArea, string> = {
    money: 'fa-sterling-sign',
    training: 'fa-dumbbell',
    habits: 'fa-repeat',
    tasks: 'fa-list-check',
    food: 'fa-bowl-food',
    weight: 'fa-weight-scale',
}

const SESSION_META: Record<SessionKind, { icon: string; tint: string }> = {
    strength: { icon: 'fa-dumbbell', tint: 'bg-brand-50 text-brand-600' },
    conditioning: { icon: 'fa-heart-pulse', tint: 'bg-coral-50 text-coral-600' },
    mobility: { icon: 'fa-person-walking', tint: 'bg-emerald-50 text-emerald-600' },
    recovery: { icon: 'fa-spa', tint: 'bg-violet-50 text-violet-600' },
}

/** "Today's Report", "Yesterday's Report", else plain "Daily Report". */
export function reportTitle(date: string): string {
    const today = todayKey()
    if (date === today) return "Today's Report"
    if (date === addDays(today, -1)) return "Yesterday's Report"
    return 'Daily Report'
}

// ── Hero ──────────────────────────────────────────────────────────────────────

export function ReportHero({ report, nav }: { report: DailyReport; nav?: ReactNode }) {
    useMoneyHidden()
    const habitTotal = report.habits.done.length + report.habits.missed.length
    return (
        <section className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 text-white shadow-[0_18px_40px_-20px_rgba(1,61,90,0.6)]">
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl"
            />
            <span
                aria-hidden="true"
                className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-coral-500/20 blur-3xl"
            />
            <div className="relative flex flex-col gap-5 p-5 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        {nav}
                        <p
                            className={`text-xs font-semibold uppercase tracking-wider text-white/60 ${nav ? 'mt-4' : ''}`}
                        >
                            {formatDateLong(report.date)}
                        </p>
                        <h2 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                            {reportTitle(report.date)}
                        </h2>
                        <p className="mt-1 text-sm font-medium text-white/70">
                            {reportHeadline(report)}
                        </p>
                    </div>
                    {habitTotal > 0 && (
                        <ProgressRing
                            value={report.habits.done.length}
                            max={habitTotal}
                            label="habits"
                            completeLabel="Every habit done"
                        />
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <HeroChip>
                        <i className="fa-solid fa-sterling-sign text-white/60" aria-hidden="true" />
                        {report.money
                            ? `${formatMoney(report.money.total)} spent`
                            : 'Spend unavailable'}
                    </HeroChip>
                    <HeroChip>
                        <i className="fa-solid fa-dumbbell text-white/60" aria-hidden="true" />
                        {report.training.sessions.length === 0
                            ? 'No training'
                            : report.training.minutes > 0
                              ? `${report.training.minutes} min trained`
                              : `${report.training.sessions.length} session${report.training.sessions.length === 1 ? '' : 's'}`}
                    </HeroChip>
                    {report.nutrition && report.nutrition.mealsEaten > 0 && (
                        <HeroChip>
                            <i className="fa-solid fa-bowl-food text-white/60" aria-hidden="true" />
                            {Math.round(report.nutrition.eaten.calories).toLocaleString(
                                'en-GB'
                            )}{' '}
                            kcal
                        </HeroChip>
                    )}
                    <HeroChip>
                        <i
                            className="fa-solid fa-circle-check text-emerald-300"
                            aria-hidden="true"
                        />
                        {report.wins.length} went well
                    </HeroChip>
                    {report.misses.length > 0 && (
                        <HeroChip>
                            <i
                                className="fa-solid fa-circle-exclamation text-amber-300"
                                aria-hidden="true"
                            />
                            {report.misses.length} to work on
                        </HeroChip>
                    )}
                </div>
            </div>
        </section>
    )
}

// ── Panels ────────────────────────────────────────────────────────────────────

function Panel({
    icon,
    title,
    aside,
    to,
    children,
    className = '',
}: {
    icon: string
    title: string
    aside?: ReactNode
    to?: string
    children: ReactNode
    className?: string
}) {
    return (
        <section
            className={`flex flex-col gap-4 rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] sm:p-5 ${className}`}
        >
            <header className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
                        <i className={`fa-solid ${icon} text-sm`} aria-hidden="true" />
                    </span>
                    <h3 className="truncate text-base font-bold tracking-tight text-neutral-900">
                        {to ? (
                            <Link to={to} className="hover:text-brand-700">
                                {title}
                            </Link>
                        ) : (
                            title
                        )}
                    </h3>
                </div>
                {aside}
            </header>
            {children}
        </section>
    )
}

function Muted({ children }: { children: ReactNode }) {
    return <p className="text-sm text-neutral-400">{children}</p>
}

function NoteList({ notes, tone }: { notes: ReportNote[]; tone: 'good' | 'bad' }) {
    const good = tone === 'good'
    return (
        <section
            className={`rounded-3xl p-4 ring-1 sm:p-5 ${
                good ? 'bg-emerald-50/60 ring-emerald-100' : 'bg-amber-50/60 ring-amber-100'
            }`}
        >
            <h3
                className={`flex items-center gap-2 text-sm font-bold ${good ? 'text-emerald-800' : 'text-amber-800'}`}
            >
                <i
                    className={`fa-solid ${good ? 'fa-circle-check text-emerald-500' : 'fa-circle-exclamation text-amber-500'}`}
                    aria-hidden="true"
                />
                {good ? 'Went well' : "Didn't go so well"}
            </h3>
            {notes.length === 0 ? (
                <p className="mt-3 text-sm text-neutral-500">
                    {good
                        ? 'Nothing to celebrate yet — the day is still being written.'
                        : 'Nothing — a clean day.'}
                </p>
            ) : (
                <ul className="mt-3 flex flex-col gap-2">
                    {notes.map((n, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-800">
                            <span
                                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white ${
                                    good ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                            >
                                <i
                                    className={`fa-solid ${AREA_ICONS[n.area]} text-[11px]`}
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="pt-0.5">{n.text}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}

function MoneyPanel({ report }: { report: DailyReport }) {
    useMoneyHidden()
    const [showAll, setShowAll] = useState(false)
    const m = report.money

    if (!m) {
        return (
            <Panel icon="fa-sterling-sign" title="Money" to="/finances/spaces">
                <Muted>{report.moneyError}</Muted>
            </Panel>
        )
    }

    const diff = m.weekAverage !== null ? m.total - m.weekAverage : null
    const items = showAll ? m.items : m.items.slice(-5).reverse()

    return (
        <Panel
            icon="fa-sterling-sign"
            title="Money"
            to="/finances/spaces"
            aside={
                diff !== null && m.weekAverage !== null ? (
                    <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            diff > 0
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700'
                        }`}
                        title="Compared with the average day over the week before"
                    >
                        {diff > 0 ? '+' : '−'}
                        {formatMoney(Math.abs(diff))} vs avg
                    </span>
                ) : undefined
            }
        >
            <div>
                <p className="text-3xl font-bold tracking-tight tabular-nums text-neutral-950">
                    {formatMoney(m.total)}
                </p>
                <p className="mt-0.5 text-sm text-neutral-500">
                    {m.count === 0
                        ? 'Nothing left any space today.'
                        : `${m.count} transaction${m.count === 1 ? '' : 's'} across all spaces${
                              m.weekAverage !== null
                                  ? ` · ${formatMoney(m.weekAverage)} a day last week`
                                  : ''
                          }`}
                </p>
            </div>

            {m.categories.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                    {m.categories.map((c) => (
                        <li key={c.key}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2 text-neutral-700">
                                    <i
                                        className={`fa-solid ${c.icon} w-4 text-center text-xs text-neutral-400`}
                                        aria-hidden="true"
                                    />
                                    <span className="truncate font-medium">{c.label}</span>
                                    <span className="text-xs text-neutral-400">×{c.count}</span>
                                </span>
                                <span className="font-semibold tabular-nums text-neutral-900">
                                    {formatMoney(c.total)}
                                </span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                <div
                                    className="h-full rounded-full bg-brand-500"
                                    style={{
                                        width: `${m.total > 0 ? (c.total / m.total) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {m.items.length > 0 && (
                <div className="border-t border-neutral-100 pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                        {showAll ? 'All transactions' : 'Latest'}
                    </p>
                    <ul className="mt-2 flex flex-col divide-y divide-neutral-100">
                        {items.map((t) => (
                            <li
                                key={t.id}
                                className="flex items-center justify-between gap-3 py-2 text-sm"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium text-neutral-800">
                                        {t.merchant ?? 'Unknown'}
                                    </span>
                                    <span className="block text-xs text-neutral-400">
                                        {new Date(t.time).toLocaleTimeString('en-GB', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}{' '}
                                        · {t.space}
                                    </span>
                                </span>
                                <span className="shrink-0 font-semibold tabular-nums text-neutral-900">
                                    {formatMoney(t.amount)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {m.items.length > 5 && (
                        <button
                            type="button"
                            onClick={() => setShowAll((v) => !v)}
                            className="mt-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                            {showAll ? 'Show fewer' : `Show all ${m.items.length}`}
                        </button>
                    )}
                </div>
            )}
        </Panel>
    )
}

function TrainingPanel({ report }: { report: DailyReport }) {
    const { sessions, minutes, missed } = report.training
    return (
        <Panel
            icon="fa-dumbbell"
            title="Training"
            to="/fitness"
            aside={
                minutes > 0 ? (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                        {minutes} min
                    </span>
                ) : undefined
            }
        >
            {sessions.length === 0 ? (
                <Muted>No sessions logged.</Muted>
            ) : (
                <ul className="flex flex-col gap-2">
                    {sessions.map((s) => (
                        <li
                            key={s.id}
                            className="flex items-center gap-3 rounded-2xl bg-neutral-50 p-3"
                        >
                            <span
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${SESSION_META[s.kind].tint}`}
                            >
                                <i
                                    className={`fa-solid ${SESSION_META[s.kind].icon} text-sm`}
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-neutral-900">
                                    {s.name}
                                </span>
                                <span className="block truncate text-xs text-neutral-500">
                                    {s.detail}
                                </span>
                            </span>
                            {s.minutes !== null && (
                                <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-500">
                                    {s.minutes} min
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {missed.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                    {missed.map((name, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-amber-700">
                            <i className="fa-regular fa-circle text-[10px]" aria-hidden="true" />
                            <span className="truncate">
                                {name}{' '}
                                <span className="text-amber-600/70">— planned, not logged</span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

function HabitsPanel({ report }: { report: DailyReport }) {
    const { done, missed } = report.habits
    const total = done.length + missed.length
    return (
        <Panel
            icon="fa-repeat"
            title="Habits"
            to="/habits"
            aside={
                total > 0 ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                        {done.length}
                        <span className="text-neutral-400">/{total}</span>
                    </span>
                ) : undefined
            }
        >
            {total === 0 ? (
                <Muted>No habits set up.</Muted>
            ) : (
                <ul className="flex flex-wrap gap-2">
                    {done.map((h) => (
                        <li
                            key={h._id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-inset ring-emerald-100"
                        >
                            <i
                                className="fa-solid fa-check text-[10px] text-emerald-500"
                                aria-hidden="true"
                            />
                            {h.name}
                        </li>
                    ))}
                    {missed.map((h) => (
                        <li
                            key={h._id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-3 py-1.5 text-sm font-medium text-neutral-400 ring-1 ring-inset ring-neutral-200"
                        >
                            <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                            <span className="line-through decoration-neutral-300">{h.name}</span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

function Meter({
    label,
    value,
    target,
    unit,
}: {
    label: string
    value: number
    target?: number
    unit: string
}) {
    const pct = target ? Math.min(100, (value / target) * 100) : 0
    const over = target !== undefined && value > target
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-neutral-600">{label}</span>
                <span className="tabular-nums">
                    <span className="font-bold text-neutral-900">
                        {Math.round(value).toLocaleString('en-GB')}
                    </span>
                    {target !== undefined && (
                        <span className="text-neutral-400">
                            {' '}
                            / {Math.round(target).toLocaleString('en-GB')}
                        </span>
                    )}{' '}
                    <span className="text-xs text-neutral-400">{unit}</span>
                </span>
            </div>
            {target !== undefined && (
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                    <div
                        className={`h-full rounded-full ${over ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
            )}
        </div>
    )
}

function FoodPanel({ report }: { report: DailyReport }) {
    const n = report.nutrition
    const w = report.weight
    return (
        <Panel icon="fa-bowl-food" title="Food & body" to="/nutrition">
            {!n ? (
                <Muted>No meals planned or logged.</Muted>
            ) : (
                <>
                    <div className="flex flex-col gap-3">
                        <Meter
                            label="Calories"
                            value={n.eaten.calories}
                            target={n.goals?.calories}
                            unit="kcal"
                        />
                        <Meter
                            label="Protein"
                            value={n.eaten.protein}
                            target={n.goals?.protein}
                            unit="g"
                        />
                    </div>
                    <p className="text-xs text-neutral-500">
                        {n.mealsEaten} eaten
                        {n.mealsSkipped > 0 && ` · ${n.mealsSkipped} skipped`}
                        {n.mealsUnmarked > 0 && ` · ${n.mealsUnmarked} not marked`}
                    </p>
                </>
            )}
            {w && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-50 p-3 text-sm">
                    <span className="flex items-center gap-2 font-medium text-neutral-700">
                        <i
                            className="fa-solid fa-weight-scale text-neutral-400"
                            aria-hidden="true"
                        />
                        {w.kg} kg
                    </span>
                    {w.change !== null && (
                        <span
                            className={`text-xs font-semibold tabular-nums ${
                                w.change < 0
                                    ? 'text-emerald-600'
                                    : w.change > 0
                                      ? 'text-amber-600'
                                      : 'text-neutral-500'
                            }`}
                        >
                            {w.change > 0 ? '+' : ''}
                            {w.change} kg vs{' '}
                            {w.sinceDays === 1 ? 'yesterday' : `${w.sinceDays} days ago`}
                        </span>
                    )}
                </div>
            )}
        </Panel>
    )
}

function TasksPanel({ report }: { report: DailyReport }) {
    const { done, open } = report.tasks
    const total = done.length + open.length
    return (
        <Panel
            icon="fa-list-check"
            title="Tasks"
            to={`/day/${report.date}`}
            aside={
                total > 0 ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-neutral-900">
                        {done.length}
                        <span className="text-neutral-400">/{total}</span>
                    </span>
                ) : undefined
            }
        >
            {total === 0 ? (
                <Muted>No tasks for the day.</Muted>
            ) : (
                <ul className="flex flex-col gap-1.5">
                    {[...done, ...open].map((t) => (
                        <li key={t._id} className="flex items-center gap-2.5 text-sm">
                            <i
                                className={`fa-solid ${t.completed ? 'fa-circle-check text-emerald-500' : 'fa-circle text-neutral-200'}`}
                                aria-hidden="true"
                            />
                            <span
                                className={
                                    t.completed
                                        ? 'text-neutral-400 line-through'
                                        : 'text-neutral-800'
                                }
                            >
                                {t.title}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Panel>
    )
}

// ── The whole report ──────────────────────────────────────────────────────────

export default function ReportView({ report, nav }: { report: DailyReport; nav?: ReactNode }) {
    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            <ReportHero report={report} nav={nav} />
            <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
                <NoteList notes={report.wins} tone="good" />
                <NoteList notes={report.misses} tone="bad" />
            </div>
            <div className="grid items-start gap-4 sm:gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-4 sm:gap-5">
                    <MoneyPanel report={report} />
                    <TasksPanel report={report} />
                </div>
                <div className="flex flex-col gap-4 sm:gap-5">
                    <TrainingPanel report={report} />
                    <HabitsPanel report={report} />
                    <FoodPanel report={report} />
                </div>
            </div>
        </div>
    )
}
