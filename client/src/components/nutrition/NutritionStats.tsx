import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Spinner from '../Spinner'
import PillToggle from '../PillToggle'
import Select from '../Select'
import { fmt, kcal, signedKcal, signedKg } from './format'
import { mondayOf } from './NutritionPlanner'
import { listPlanEntries } from '../../services/mealPlan'
import { listDailyEnergy } from '../../services/dailyEnergy'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { addDays, addMonths, formatMonthYear, formatWeekRange, parseDateKey, todayKey, MONTHS } from '../../lib/calendar'
import { sumEatenMacros, targetsFor } from '../../lib/nutrition'
import type { DailyEnergy, MacroGoals, Macros, MealPlanEntry, NutritionPhase } from '../../types'

type Range = 'week' | 'month' | 'phase'

/** Roughly what a kilogram of body weight is worth in calories. */
const KCAL_PER_KG = 7700

interface Day {
    date: string
    eaten: Macros | null
    out: number | null
    goals: MacroGoals | null
}

function monthBounds(anchor: string): [string, string] {
    const { year, month } = parseDateKey(anchor)
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return [start, addDays(addMonths(start, 1), -1)]
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function weekdayOf(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return WD[new Date(year, month, day).getDay()]
}

function shortDay(date: string): string {
    const { month, day } = parseDateKey(date)
    return `${weekdayOf(date)} ${day} ${MONTHS[month].slice(0, 3)}`
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

/**
 * How it's going over a week, a month or a phase: the balance up top, a bar
 * for every day, average macros against their targets, and the days listed.
 * Averages only count days you logged; the balance only days with both in and out.
 */
export default function NutritionStats({ settingsGoals }: { settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const [range, setRange] = useState<Range>('week')
    const [anchor, setAnchor] = useState(today)
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [phaseId, setPhaseId] = useState('')
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [energy, setEnergy] = useState<DailyEnergy[]>([])

    useEffect(() => {
        listNutritionPhases()
            .then((p) => {
                const sorted = [...p].sort((a, b) => b.startDate.localeCompare(a.startDate))
                setPhases(sorted)
                const current = sorted.find((x) => x.startDate <= today && x.endDate >= today) ?? sorted[0]
                if (current) setPhaseId(current._id)
            })
            .catch(() => {})
    }, [today])

    const phase = phases.find((p) => p._id === phaseId) ?? null
    const [start, end]: [string, string] =
        range === 'week'
            ? [mondayOf(anchor), addDays(mondayOf(anchor), 6)]
            : range === 'month'
              ? monthBounds(anchor)
              : phase
                ? [phase.startDate, phase.endDate]
                : [today, today]
    // Nothing after today has happened yet.
    const last = end < today ? end : today
    const isCurrent = start <= today && end >= today

    // Loading is "the range on screen isn't the one last fetched". A phase that
    // hasn't started has nothing to fetch.
    const rangeKey = `${start}|${last}`
    const [loadedKey, setLoadedKey] = useState('')
    const loading = start <= last && loadedKey !== rangeKey
    useEffect(() => {
        if (start > last) return
        Promise.all([listPlanEntries(start, last), listDailyEnergy(start, last)])
            .then(([e, en]) => {
                setEntries(e)
                setEnergy(en)
            })
            .finally(() => setLoadedKey(`${start}|${last}`))
    }, [start, last])

    /** Oldest first. */
    const days: Day[] = useMemo(() => {
        const out: Day[] = []
        for (let d = start; d <= last; d = addDays(d, 1)) {
            const eatenList = entries.filter((e) => e.date === d && e.status === 'eaten')
            out.push({
                date: d,
                eaten: eatenList.length ? sumEatenMacros(eatenList) : null,
                out: energy.find((x) => x.date === d)?.caloriesOut ?? null,
                goals: targetsFor(d, phases, settingsGoals).goals,
            })
        }
        return out
    }, [start, last, entries, energy, phases, settingsGoals])

    const logged = days.filter((d) => d.eaten)
    const withOut = days.filter((d) => d.out !== null)
    const both = days.filter((d) => d.eaten && d.out !== null)
    const avgIn = avg(logged.map((d) => d.eaten!.calories))
    const avgOut = avg(withOut.map((d) => d.out!))
    const totalNet = both.length ? both.reduce((a, d) => a + d.eaten!.calories - d.out!, 0) : null

    const title =
        range === 'week' ? formatWeekRange(start, end) : range === 'month' ? formatMonthYear(start) : (phase?.name ?? 'No phases yet')

    function step(dir: -1 | 1) {
        setAnchor(range === 'week' ? addDays(anchor, dir * 7) : addMonths(anchor, dir))
    }

    return (
        <div className="flex flex-col gap-4">
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-white p-3 ring-1 ring-black/[0.06] sm:p-4">
                <PillToggle
                    label="Range"
                    value={range}
                    onChange={setRange}
                    options={[
                        { value: 'week', label: 'Week' },
                        { value: 'month', label: 'Month' },
                        { value: 'phase', label: 'Phase' },
                    ]}
                />
                {range === 'phase' ? (
                    phases.length > 0 && (
                        <Select
                            className="min-w-[12rem]"
                            value={phaseId}
                            onChange={setPhaseId}
                            options={phases.map((p) => ({ value: p._id, label: p.name }))}
                        />
                    )
                ) : (
                    <div className="flex w-full items-center gap-1.5 sm:w-auto">
                        <StepButton label="Previous" icon="fa-chevron-left" onClick={() => step(-1)} />
                        <p className="min-w-0 flex-1 truncate text-center text-sm font-bold text-neutral-900 sm:min-w-[11rem]">{title}</p>
                        <StepButton label="Next" icon="fa-chevron-right" onClick={() => step(1)} />
                        {!isCurrent && (
                            <button
                                type="button"
                                onClick={() => setAnchor(today)}
                                className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
                            >
                                {range === 'week' ? 'This week' : 'This month'}
                            </button>
                        )}
                    </div>
                )}
            </section>

            {range === 'phase' && !phase ? (
                <p className="rounded-3xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-500">
                    No phases yet — set one up in the Phases tab.
                </p>
            ) : start > last ? (
                <p className="rounded-3xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-500">
                    Nothing to show — this is still to come.
                </p>
            ) : loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <>
                    <Summary
                        totalNet={totalNet}
                        bothDays={both.length}
                        avgIn={avgIn}
                        avgOut={avgOut}
                        logged={logged.length}
                        outDays={withOut.length}
                        total={days.length}
                    />
                    <DailyChart days={days} />
                    <MacroAverages logged={logged} />
                    <DayList days={[...days].reverse()} today={today} />
                </>
            )}
        </div>
    )
}

function StepButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:bg-neutral-300"
        >
            <i className={`fa-solid ${icon} text-xs`} aria-hidden="true" />
        </button>
    )
}

const card = 'rounded-3xl bg-white p-4 ring-1 ring-black/[0.06] sm:p-5'

function CardTitle({ children, aside }: { children: string; aside?: ReactNode }) {
    return (
        <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-bold text-neutral-900">{children}</h3>
            {aside}
        </div>
    )
}

// ── Summary ──────────────────────────────────────────────────────────────────

/** The headline: the balance and what it's worth in weight, then the averages behind it. */
function Summary({
    totalNet,
    bothDays,
    avgIn,
    avgOut,
    logged,
    outDays,
    total,
}: {
    totalNet: number | null
    bothDays: number
    avgIn: number | null
    avgOut: number | null
    logged: number
    outDays: number
    total: number
}) {
    const deficit = totalNet !== null && totalNet < 0
    return (
        <section className={`${card} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">Balance</p>
                {totalNet === null ? (
                    <>
                        <p className="text-3xl font-bold tracking-tight text-neutral-300">—</p>
                        <p className="text-xs text-neutral-500">Needs days with both calories in and out</p>
                    </>
                ) : (
                    <>
                        <p className="flex items-baseline gap-2">
                            <span className={`text-3xl font-bold tabular-nums tracking-tight sm:text-4xl ${deficit ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {signedKcal(totalNet)}
                            </span>
                            <span className="text-sm font-semibold text-neutral-500">kcal</span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    deficit ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                }`}
                            >
                                <i className={`fa-solid ${deficit ? 'fa-arrow-down' : 'fa-arrow-up'} text-[9px]`} aria-hidden="true" />
                                {deficit ? 'Deficit' : 'Surplus'}
                            </span>
                        </p>
                        <p className="text-xs tabular-nums text-neutral-500">
                            ≈ {signedKg(totalNet / KCAL_PER_KG)} over {bothDays} day{bothDays === 1 ? '' : 's'}
                        </p>
                    </>
                )}
            </div>
            <dl className="grid grid-cols-2 gap-3 sm:flex sm:gap-6">
                <MiniStat label="In / day" value={avgIn === null ? '—' : kcal(avgIn)} sub={`${logged} of ${total} days logged`} />
                <MiniStat label="Out / day" value={avgOut === null ? '—' : kcal(avgOut)} sub={`${outDays} of ${total} days entered`} />
            </dl>
        </section>
    )
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
    return (
        <div className="min-w-0 rounded-2xl bg-neutral-50 px-3 py-2 sm:bg-transparent sm:p-0 sm:text-right">
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{label}</dt>
            <dd className="text-xl font-bold tabular-nums text-neutral-900">
                {value}
                {value !== '—' && <span className="ml-1 text-xs font-semibold text-neutral-400">kcal</span>}
            </dd>
            <dd className="truncate text-[11px] text-neutral-500">{sub}</dd>
        </div>
    )
}

// ── Chart ────────────────────────────────────────────────────────────────────

/**
 * A bar per day for calories in, a dark tick for calories out, and a dashed
 * line where the day's calorie target sat. Hover or tap a day for its numbers.
 */
function DailyChart({ days }: { days: Day[] }) {
    const [active, setActive] = useState<string | null>(null)
    const max =
        Math.max(1, ...days.map((d) => Math.max(d.eaten?.calories ?? 0, d.out ?? 0, d.goals?.calories ?? 0))) * 1.08
    const pct = (v: number) => `${(v / max) * 100}%`
    const hasTargets = days.some((d) => d.goals?.calories)
    const many = days.length > 10
    const shown = days.find((d) => d.date === active) ?? null

    return (
        <section className={card}>
            <CardTitle
                aside={
                    <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> In
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="h-0.5 w-3 rounded-full bg-neutral-900" /> Out
                        </span>
                        {hasTargets && (
                            <span className="inline-flex items-center gap-1.5">
                                <span className="w-3 border-t-2 border-dashed border-coral-500" /> Target
                            </span>
                        )}
                    </div>
                }
            >
                Calories by day
            </CardTitle>

            <div className="mb-2 h-5 text-xs tabular-nums text-neutral-600">
                {shown ? (
                    <>
                        <span className="font-semibold text-neutral-900">{shortDay(shown.date)}</span>
                        {' · '}In {shown.eaten ? kcal(shown.eaten.calories) : '—'} · Out {shown.out !== null ? kcal(shown.out) : '—'}
                        {shown.eaten && shown.out !== null && <> · {signedKcal(shown.eaten.calories - shown.out)}</>}
                    </>
                ) : (
                    <span className="text-neutral-400">Hover or tap a day for its numbers</span>
                )}
            </div>

            <div className="relative h-44 border-b border-neutral-200" onMouseLeave={() => setActive(null)}>
                {[0.5, 1].map((f) => (
                    <div key={f} aria-hidden="true" className="absolute inset-x-0 border-t border-neutral-100" style={{ bottom: `${f * 100}%` }}>
                        <span className="absolute -top-2 right-0 bg-white pl-1 text-[10px] tabular-nums text-neutral-400">
                            {kcal(Math.round((max * f) / 100) * 100)}
                        </span>
                    </div>
                ))}
                <div className={`absolute inset-0 flex items-end ${many ? 'gap-[2px]' : 'gap-2 sm:gap-3'} pr-9`}>
                    {days.map((d) => {
                        const on = d.date === active
                        return (
                            <button
                                key={d.date}
                                type="button"
                                aria-label={`${shortDay(d.date)}: in ${d.eaten ? kcal(d.eaten.calories) : 'not logged'}, out ${d.out !== null ? kcal(d.out) : 'not entered'}`}
                                onMouseEnter={() => setActive(d.date)}
                                onFocus={() => setActive(d.date)}
                                onClick={() => setActive(d.date)}
                                className={`relative h-full min-w-0 flex-1 rounded-t-md ${on ? 'bg-neutral-100/70' : ''}`}
                            >
                                {d.eaten && (
                                    <span
                                        className={`absolute inset-x-[15%] bottom-0 rounded-t-[4px] ${on ? 'bg-brand-600' : 'bg-brand-500'}`}
                                        style={{ height: pct(d.eaten.calories) }}
                                    />
                                )}
                                {d.goals?.calories ? (
                                    <span
                                        className="absolute inset-x-0 border-t-2 border-dashed border-coral-500"
                                        style={{ bottom: pct(d.goals.calories) }}
                                    />
                                ) : null}
                                {d.out !== null && (
                                    <span
                                        className="absolute inset-x-[5%] h-[3px] -translate-y-1/2 rounded-full bg-neutral-900 ring-2 ring-white"
                                        style={{ bottom: pct(d.out) }}
                                    />
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
            <div className={`mt-1.5 flex ${many ? 'gap-[2px]' : 'gap-2 sm:gap-3'} pr-9`}>
                {days.map((d, i) => {
                    const { day } = parseDateKey(d.date)
                    const label = many ? (i % 5 === 0 ? String(day) : '') : weekdayOf(d.date)
                    return (
                        <span key={d.date} className="min-w-0 flex-1 text-center text-[10px] font-medium tabular-nums text-neutral-400">
                            {label}
                        </span>
                    )
                })}
            </div>
        </section>
    )
}

// ── Macros ───────────────────────────────────────────────────────────────────

/** Average per logged day against the average target over the same days. */
function MacroAverages({ logged }: { logged: Day[] }) {
    const rows: { key: keyof Macros; label: string; unit: string }[] = [
        { key: 'calories', label: 'Calories', unit: 'kcal' },
        { key: 'protein', label: 'Protein', unit: 'g' },
        { key: 'carbs', label: 'Carbs', unit: 'g' },
        { key: 'fat', label: 'Fat', unit: 'g' },
    ]
    return (
        <section className={card}>
            <CardTitle aside={<span className="text-[11px] text-neutral-400">per logged day</span>}>Average macros</CardTitle>
            {logged.length === 0 ? (
                <p className="py-4 text-center text-sm text-neutral-400">Nothing eaten logged in this range yet.</p>
            ) : (
                <div className="flex flex-col gap-3.5">
                    {rows.map((r) => {
                        const value = avg(logged.map((d) => d.eaten![r.key]))!
                        const targets = logged.map((d) => d.goals?.[r.key as keyof MacroGoals]).filter((t): t is number => !!t)
                        const target = avg(targets)
                        const show = (v: number) => (r.key === 'calories' ? kcal(v) : fmt(Math.round(v)))
                        const ratio = target ? value / target : null
                        return (
                            <div key={r.key}>
                                <div className="flex items-baseline justify-between gap-3 text-sm">
                                    <span className="font-semibold text-neutral-700">{r.label}</span>
                                    <span className="tabular-nums">
                                        <span className="font-bold text-neutral-900">
                                            {show(value)} {r.unit}
                                        </span>
                                        {target && <span className="text-neutral-400"> / {show(target)}</span>}
                                        {ratio !== null && (
                                            <span className="ml-2 text-xs font-semibold text-neutral-500">{Math.round(ratio * 100)}%</span>
                                        )}
                                    </span>
                                </div>
                                {target ? (
                                    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-neutral-100">
                                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%` }} />
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            )}
        </section>
    )
}

// ── Day list ─────────────────────────────────────────────────────────────────

function DayList({ days, today }: { days: Day[]; today: string }) {
    return (
        <section className={card}>
            <CardTitle>Day by day</CardTitle>
            <ul className="-mx-2 flex flex-col divide-y divide-neutral-100">
                {days.map((d) => {
                    const net = d.eaten && d.out !== null ? d.eaten.calories - d.out : null
                    return (
                        <li key={d.date} className="flex items-center gap-3 px-2 py-2.5">
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-neutral-900">
                                    {shortDay(d.date)}
                                    {d.date === today && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-coral-500">Today</span>}
                                </p>
                                <p className="truncate text-xs tabular-nums text-neutral-500">
                                    {d.eaten
                                        ? `P ${fmt(Math.round(d.eaten.protein))} g · C ${fmt(Math.round(d.eaten.carbs))} g · F ${fmt(Math.round(d.eaten.fat))} g`
                                        : 'Nothing logged'}
                                </p>
                            </div>
                            <div className="shrink-0 text-right text-xs tabular-nums text-neutral-500">
                                <p>
                                    <span className="font-semibold text-neutral-900">{d.eaten ? kcal(d.eaten.calories) : '—'}</span> in
                                </p>
                                <p>{d.out !== null ? kcal(d.out) : '—'} out</p>
                            </div>
                            <span
                                className={`w-[4.5rem] shrink-0 rounded-full py-1 text-center text-xs font-bold tabular-nums ${
                                    net === null
                                        ? 'bg-neutral-50 text-neutral-300'
                                        : net < 0
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-amber-50 text-amber-700'
                                }`}
                            >
                                {net === null ? '—' : signedKcal(net)}
                            </span>
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
