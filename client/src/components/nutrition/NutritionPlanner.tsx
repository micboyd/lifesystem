import { useCallback, useEffect, useMemo, useState } from 'react'
import Spinner from '../Spinner'
import MealPicker, { CATEGORY_LABEL } from './MealPicker'
import {
    WeekHero,
    ProgressRing,
    DayStrip,
    DayPill,
    DayBadge,
    DayCardShell,
    SwipeHint,
    dayCardId,
    isWide,
    scrollToDay,
    relativeWeekLabel,
    useDaySwipe,
} from '../planner/WeekPlannerUI'
import { fmt, kcal, signedKcal } from './format'
import { addPlanEntry, deletePlanEntry, listPlanEntries, setEntryStatus } from '../../services/mealPlan'
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { addDays, formatWeekRange, getWeekStart, parseDateKey, todayKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'
import { sumEatenMacros, sumPendingMacros, targetsFor } from '../../lib/nutrition'
import { MEAL_TYPES } from '../../types'
import type { DailyEnergy, MacroGoals, Meal, MealPlanEntry, MealType, NutritionPhase } from '../../types'

/** The Monday of the week holding `date`. */
export function mondayOf(date: string): string {
    const sunday = getWeekStart(date)
    return date === sunday ? addDays(sunday, -6) : addDays(sunday, 1)
}

function dayName(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return `${WEEKDAYS_LONG[new Date(year, month, day).getDay()]} ${day} ${MONTHS[month].slice(0, 3)}`
}

type Picking = { date: string; slot: MealType; extra: false } | { date: string; slot: null; extra: true }

/**
 * Seven days of meals. Plan them from the library, tick them off as you eat,
 * and "Log more" whatever else you had. The banner at the top is the selected
 * day: what's gone in, what went out, and the difference.
 */
export default function NutritionPlanner({ meals, settingsGoals }: { meals: Meal[]; settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const [selected, setSelected] = useState(today)
    const weekStart = mondayOf(selected)
    const weekEnd = addDays(weekStart, 6)
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [energy, setEnergy] = useState<DailyEnergy[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [loading, setLoading] = useState(true)
    const [picking, setPicking] = useState<Picking | null>(null)

    const load = useCallback(() => {
        Promise.all([
            listPlanEntries(weekStart, weekEnd),
            listDailyEnergy(weekStart, weekEnd),
            listNutritionPhases(weekStart, weekEnd).catch(() => [] as NutritionPhase[]),
        ])
            .then(([e, en, p]) => {
                setEntries(e)
                setEnergy(en)
                setPhases(p)
            })
            .finally(() => setLoading(false))
    }, [weekStart, weekEnd])
    useEffect(load, [load])

    const swipe = useDaySwipe((dir) => setSelected((d) => addDays(d, dir)))

    function select(date: string) {
        setSelected(date)
        if (isWide() && date >= weekStart && date <= weekEnd) scrollToDay('meals', date)
    }

    const byDay = (date: string) => entries.filter((e) => e.date === date)

    async function toggle(entry: MealPlanEntry) {
        const next = entry.status === 'eaten' ? 'planned' : 'eaten'
        setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, status: next } : e)))
        try {
            await setEntryStatus(entry._id, next)
        } catch {
            setEntries((prev) => prev.map((e) => (e._id === entry._id ? entry : e)))
        }
    }

    async function remove(entry: MealPlanEntry) {
        setEntries((prev) => prev.filter((e) => e._id !== entry._id))
        try {
            await deletePlanEntry(entry._id)
        } catch {
            setEntries((prev) => [...prev, entry])
        }
    }

    async function add(meal: Meal) {
        if (!picking) return
        const slot = picking.slot ?? meal.types[0] ?? 'snack'
        const entry = await addPlanEntry(picking.date, slot, meal._id, picking.extra)
        setEntries((prev) => [...prev, entry])
    }

    async function saveOut(date: string, value: number | null) {
        if (value === null) {
            await deleteDailyEnergy(date)
            setEnergy((prev) => prev.filter((e) => e.date !== date))
        } else {
            const saved = await saveDailyEnergy(date, value)
            setEnergy((prev) => [...prev.filter((e) => e.date !== date), saved])
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const dayEntries = byDay(selected)
    const planned = dayEntries.filter((e) => !e.extra)
    const eatenPlanned = planned.filter((e) => e.status === 'eaten').length

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            <WeekHero
                title={relativeWeekLabel(weekStart, mondayOf(today))}
                subtitle={formatWeekRange(weekStart, weekEnd)}
                isThisWeek={weekStart === mondayOf(today)}
                onStep={(dir) => setSelected(addDays(selected, dir * 7))}
                onToday={() => select(today)}
                ring={<ProgressRing value={eatenPlanned} max={planned.length} label="eaten" completeLabel="All planned meals eaten" />}
            >
                <DayBanner
                    key={selected}
                    date={selected}
                    entries={dayEntries}
                    out={energy.find((e) => e.date === selected)?.caloriesOut ?? null}
                    goals={targetsFor(selected, phases, settingsGoals).goals}
                    onSaveOut={(v) => saveOut(selected, v)}
                />
                <DayStrip>
                    {days.map((d) => {
                        const list = byDay(d).filter((e) => !e.extra)
                        return (
                            <DayPill
                                key={d}
                                date={d}
                                active={d === selected}
                                isToday={d === today}
                                dots={list.map((e) => (e.status === 'eaten' ? 'bg-emerald-400' : 'bg-white/40'))}
                                allDone={list.length > 0 && list.every((e) => e.status === 'eaten')}
                                onClick={() => select(d)}
                            />
                        )
                    })}
                </DayStrip>
            </WeekHero>

            <div {...swipe} className="flex flex-col gap-3 md:gap-4">
                {days.map((date) => (
                    <DayCard
                        key={date}
                        date={date}
                        className={date === selected ? 'flex' : 'hidden md:flex'}
                        isToday={date === today}
                        isSelected={date === selected}
                        entries={byDay(date)}
                        onSelect={() => setSelected(date)}
                        onAdd={(slot) => setPicking({ date, slot, extra: false })}
                        onLogMore={() => setPicking({ date, slot: null, extra: true })}
                        onToggle={(e) => void toggle(e)}
                        onRemove={(e) => void remove(e)}
                    />
                ))}
                <SwipeHint />
            </div>

            <MealPicker
                open={picking !== null}
                title={
                    picking?.extra
                        ? `Log more — ${dayName(picking.date)}`
                        : picking
                          ? `Add to ${CATEGORY_LABEL[picking.slot].toLowerCase()}`
                          : ''
                }
                meals={meals}
                category={picking?.extra ? null : (picking?.slot ?? null)}
                multi={picking?.extra}
                onPick={add}
                onClose={() => setPicking(null)}
            />
        </div>
    )
}

// ── The banner ───────────────────────────────────────────────────────────────

/**
 * The selected day: calories and macros in (eaten only), calories out typed
 * from your watch, and the balance between them.
 */
function DayBanner({
    date,
    entries,
    out,
    goals,
    onSaveOut,
}: {
    date: string
    entries: MealPlanEntry[]
    out: number | null
    goals: MacroGoals | null
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const eaten = sumEatenMacros(entries)
    const pending = sumPendingMacros(entries)
    const [value, setValue] = useState(out === null ? '' : String(out))
    const [saving, setSaving] = useState(false)

    async function commit() {
        const trimmed = value.trim()
        const n = Number(trimmed)
        const next = trimmed === '' ? null : Number.isFinite(n) && n > 0 ? Math.round(n) : out
        if (next === out) {
            setValue(out === null ? '' : String(out))
            return
        }
        setSaving(true)
        try {
            await onSaveOut(next)
        } catch {
            setValue(out === null ? '' : String(out))
        } finally {
            setSaving(false)
        }
    }

    const net = out === null ? null : eaten.calories - out

    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-black/15 p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{dayName(date)}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <BannerStat
                    label="Calories in"
                    value={kcal(eaten.calories)}
                    sub={goals?.calories ? `of ${kcal(goals.calories)}` : pending.calories > 0 ? `+${kcal(pending.calories)} planned` : undefined}
                    big
                />
                <BannerStat label="Protein" value={`${fmt(Math.round(eaten.protein))} g`} sub={goals?.protein ? `of ${fmt(goals.protein)} g` : undefined} />
                <BannerStat label="Carbs" value={`${fmt(Math.round(eaten.carbs))} g`} sub={goals?.carbs ? `of ${fmt(goals.carbs)} g` : undefined} />
                <BannerStat label="Fat" value={`${fmt(Math.round(eaten.fat))} g`} sub={goals?.fat ? `of ${fmt(goals.fat)} g` : undefined} />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-white/80">
                    Calories out
                    <input
                        type="text"
                        inputMode="numeric"
                        placeholder="—"
                        value={value}
                        disabled={saving}
                        onChange={(e) => setValue(e.target.value)}
                        onBlur={() => void commit()}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        className="h-10 w-24 rounded-xl border border-white/20 bg-white/10 px-3 text-right text-base font-bold tabular-nums text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none"
                    />
                </label>
                <p className="text-sm font-semibold tabular-nums">
                    {net === null ? (
                        <span className="text-white/50">Add calories out to see the balance</span>
                    ) : (
                        <>
                            <span className={net < 0 ? 'text-emerald-300' : net > 0 ? 'text-amber-300' : 'text-white'}>
                                {signedKcal(net)} kcal
                            </span>
                            <span className="ml-1.5 text-white/60">{net < 0 ? 'deficit' : net > 0 ? 'surplus' : 'even'}</span>
                        </>
                    )}
                </p>
            </div>
        </div>
    )
}

function BannerStat({ label, value, sub, big = false }: { label: string; value: string; sub?: string; big?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50">{label}</p>
            <p className={`truncate font-bold tabular-nums tracking-tight ${big ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'}`}>{value}</p>
            {sub && <p className="truncate text-[11px] tabular-nums text-white/60">{sub}</p>}
        </div>
    )
}

// ── A day ────────────────────────────────────────────────────────────────────

function DayCard({
    date,
    className,
    isToday,
    isSelected,
    entries,
    onSelect,
    onAdd,
    onLogMore,
    onToggle,
    onRemove,
}: {
    date: string
    className: string
    isToday: boolean
    isSelected: boolean
    entries: MealPlanEntry[]
    onSelect: () => void
    onAdd: (slot: MealType) => void
    onLogMore: () => void
    onToggle: (e: MealPlanEntry) => void
    onRemove: (e: MealPlanEntry) => void
}) {
    const eaten = sumEatenMacros(entries)
    const extras = entries.filter((e) => e.extra)
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]

    return (
        <DayCardShell id={dayCardId('meals', date)} isToday={isToday} className={`${className} ${isSelected ? 'md:ring-2 md:ring-brand-300' : ''}`}>
            <button type="button" onClick={onSelect} className="flex items-center gap-3 text-left">
                <DayBadge date={date} isToday={isToday} />
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold tracking-tight text-neutral-900">{weekday}</h3>
                    <p className="text-xs tabular-nums text-neutral-500">
                        {kcal(eaten.calories)} kcal · {fmt(Math.round(eaten.protein))} g protein eaten
                    </p>
                </div>
            </button>

            <div className="grid gap-3 lg:grid-cols-2">
                {MEAL_TYPES.map((slot) => (
                    <SlotList
                        key={slot}
                        label={CATEGORY_LABEL[slot]}
                        entries={entries.filter((e) => e.slot === slot && !e.extra)}
                        onAdd={() => onAdd(slot)}
                        onToggle={onToggle}
                        onRemove={onRemove}
                    />
                ))}
            </div>

            {extras.length > 0 && (
                <SlotList label="Also ate" entries={extras} onToggle={onToggle} onRemove={onRemove} />
            )}

            <button
                type="button"
                onClick={onLogMore}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100"
            >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                Log more
            </button>
        </DayCardShell>
    )
}

function SlotList({
    label,
    entries,
    onAdd,
    onToggle,
    onRemove,
}: {
    label: string
    entries: MealPlanEntry[]
    /** Omitted for "Also ate", which is filled by Log more. */
    onAdd?: () => void
    onToggle: (e: MealPlanEntry) => void
    onRemove: (e: MealPlanEntry) => void
}) {
    return (
        <section className="rounded-2xl bg-neutral-50 p-2">
            <header className="flex items-center justify-between px-2 py-1">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</h4>
                {onAdd && (
                    <button
                        type="button"
                        onClick={onAdd}
                        aria-label={`Add to ${label.toLowerCase()}`}
                        className="-mr-1 grid h-9 w-9 place-items-center rounded-full text-neutral-500 hover:bg-white active:bg-neutral-200"
                    >
                        <i className="fa-solid fa-plus text-sm" aria-hidden="true" />
                    </button>
                )}
            </header>
            {entries.length === 0 ? (
                onAdd && (
                    <button type="button" onClick={onAdd} className="w-full px-2 pb-1.5 text-left text-sm text-neutral-400">
                        Nothing planned
                    </button>
                )
            ) : (
                <ul className="flex flex-col">
                    {entries.map((e) => {
                        const eaten = e.status === 'eaten'
                        return (
                            <li key={e._id} className="flex items-center gap-1">
                                <button
                                    type="button"
                                    aria-pressed={eaten}
                                    aria-label={eaten ? `Mark ${e.name} as not eaten` : `Mark ${e.name} as eaten`}
                                    onClick={() => onToggle(e)}
                                    className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-xl px-2 text-left active:bg-white"
                                >
                                    <span
                                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
                                            eaten ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300 bg-white'
                                        }`}
                                    >
                                        {eaten && <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block truncate text-sm font-semibold ${eaten ? 'text-neutral-900' : 'text-neutral-600'}`}>
                                            {e.name}
                                        </span>
                                        <span className="block text-xs tabular-nums text-neutral-500">
                                            {kcal(e.macros.calories)} kcal · {fmt(Math.round(e.macros.protein))} g protein
                                        </span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onRemove(e)}
                                    aria-label={`Remove ${e.name}`}
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-300 hover:bg-white hover:text-neutral-600"
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
