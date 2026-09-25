import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Spinner from '../Spinner'
import Checkbox from '../Checkbox'
import ConfirmModal from '../ConfirmModal'
import MealPicker, { CATEGORY_LABEL } from './MealPicker'
import {
    HeroShell,
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
import { sumEatenMacros, sumMacros, sumPendingMacros, targetsFor } from '../../lib/nutrition'
import { MEAL_TYPES } from '../../types'
import type { DailyEnergy, MacroGoals, Macros, Meal, MealPlanEntry, MealType, NutritionPhase } from '../../types'

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
 * A copied day or week of planned meals. `offset` is days from the source's
 * start, so a week pastes Monday onto Monday; a day's are all 0.
 */
type Clip = {
    kind: 'day' | 'week'
    from: string
    label: string
    items: { offset: number; slot: MealType; meal: string }[]
}

/** Planned meals still waiting to be eaten — the only ones "Clear" removes. */
const clearable = (e: MealPlanEntry) => !e.extra && e.status === 'planned'

const ADVANCED_KEY = 'nutrition.planner.advanced'

function readAdvanced(): boolean {
    try {
        return localStorage.getItem(ADVANCED_KEY) === '1'
    } catch {
        return false
    }
}

/**
 * Seven days of meals. Plan them from the library, tick them off as you eat,
 * and "Log more" whatever else you had. The banner at the top is always today:
 * what's gone in, what went out, and the difference. The week and its controls
 * sit beneath it; "Show advanced options" adds copy, paste and clear.
 */
export default function NutritionPlanner({ meals, settingsGoals }: { meals: Meal[]; settingsGoals?: MacroGoals }) {
    const today = todayKey()
    const [selected, setSelected] = useState(today)
    const weekStart = mondayOf(selected)
    const weekEnd = addDays(weekStart, 6)
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
    const todayInWeek = today >= weekStart && today <= weekEnd

    // The week on show, plus today whenever the week doesn't hold it — the banner needs it.
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [energy, setEnergy] = useState<DailyEnergy[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [loading, setLoading] = useState(true)
    const [picking, setPicking] = useState<Picking | null>(null)

    const [advanced, setAdvanced] = useState(readAdvanced)
    const [clip, setClip] = useState<Clip | null>(null)
    const [working, setWorking] = useState(false)
    const [clearing, setClearing] = useState<{ dates: string[]; label: string } | null>(null)

    const load = useCallback(() => {
        const ranges: [string, string][] = [[weekStart, weekEnd]]
        if (!todayInWeek) ranges.push([today, today])
        Promise.all(
            ranges.map(([a, b]) =>
                Promise.all([
                    listPlanEntries(a, b),
                    listDailyEnergy(a, b),
                    listNutritionPhases(a, b).catch(() => [] as NutritionPhase[]),
                ])
            )
        )
            .then((results) => {
                setEntries(results.flatMap(([e]) => e))
                setEnergy(results.flatMap(([, en]) => en))
                const seen = new Set<string>()
                setPhases(results.flatMap(([, , p]) => p).filter((p) => !seen.has(p._id) && !!seen.add(p._id)))
            })
            .finally(() => setLoading(false))
    }, [weekStart, weekEnd, today, todayInWeek])
    useEffect(load, [load])

    const swipe = useDaySwipe((dir) => setSelected((d) => addDays(d, dir)))

    function select(date: string) {
        setSelected(date)
        if (isWide() && date >= weekStart && date <= weekEnd) scrollToDay('meals', date)
    }

    function toggleAdvanced(on: boolean) {
        setAdvanced(on)
        try {
            localStorage.setItem(ADVANCED_KEY, on ? '1' : '0')
        } catch {
            // Just won't be remembered.
        }
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

    // ── Advanced: copy, paste, clear ─────────────────────────────────────────

    function copy(kind: Clip['kind'], dates: string[]) {
        const items = dates.flatMap((date, offset) =>
            byDay(date)
                .filter((e) => !e.extra && e.meal)
                .map((e) => ({ offset, slot: e.slot, meal: e.meal as string }))
        )
        const label = kind === 'day' ? dayName(dates[0]) : `week of ${formatWeekRange(dates[0], dates[6])}`
        setClip({ kind, from: dates[0], label, items })
    }

    /** Adds the clipboard's meals from `start` on, as planned. Adds — never replaces. */
    async function paste(start: string) {
        if (!clip) return
        setWorking(true)
        try {
            // One at a time so each slot keeps the copied order.
            for (const item of clip.items) {
                try {
                    const entry = await addPlanEntry(addDays(start, item.offset), item.slot, item.meal)
                    setEntries((prev) => [...prev, entry])
                } catch {
                    // The meal's gone from the library since it was copied — skip it.
                }
            }
        } finally {
            setWorking(false)
        }
    }

    async function clear(dates: string[]) {
        const doomed = entries.filter((e) => dates.includes(e.date) && clearable(e))
        setWorking(true)
        try {
            for (const e of doomed) {
                await deletePlanEntry(e._id)
                setEntries((prev) => prev.filter((x) => x._id !== e._id))
            }
        } finally {
            setWorking(false)
        }
    }

    if (loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const todayEntries = byDay(today)
    const todayPlanned = todayEntries.filter((e) => !e.extra)
    const todayEaten = todayPlanned.filter((e) => e.status === 'eaten').length
    const weekHasPlanned = days.some((d) => byDay(d).some((e) => !e.extra && e.meal))
    const weekHasClearable = entries.some((e) => e.date >= weekStart && e.date <= weekEnd && clearable(e))

    return (
        <div className="flex flex-col gap-4 sm:gap-5">
            <HeroShell>
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Today</h2>
                        <p className="mt-1 text-sm font-medium text-white/60">{dayName(today)}</p>
                    </div>
                    <ProgressRing value={todayEaten} max={todayPlanned.length} label="eaten" completeLabel="All planned meals eaten" />
                </div>
                <DayBanner
                    key={today}
                    entries={todayEntries}
                    out={energy.find((e) => e.date === today)?.caloriesOut ?? null}
                    goals={targetsFor(today, phases, settingsGoals).goals}
                    onSaveOut={(v) => saveOut(today, v)}
                />
            </HeroShell>

            <section className="flex flex-col gap-3 rounded-3xl bg-white p-3 ring-1 ring-black/[0.06] sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <WeekStepButton label="Previous week" icon="fa-chevron-left" onClick={() => setSelected(addDays(selected, -7))} />
                        <div className="min-w-0 px-1">
                            <h2 className="truncate text-lg font-bold tracking-tight text-neutral-900">
                                {relativeWeekLabel(weekStart, mondayOf(today))}
                            </h2>
                            <p className="truncate text-xs tabular-nums text-neutral-500">{formatWeekRange(weekStart, weekEnd)}</p>
                        </div>
                        <WeekStepButton label="Next week" icon="fa-chevron-right" onClick={() => setSelected(addDays(selected, 7))} />
                        {!todayInWeek && (
                            <button
                                type="button"
                                onClick={() => select(today)}
                                className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-200"
                            >
                                Today
                            </button>
                        )}
                    </div>
                    <Checkbox checked={advanced} onChange={toggleAdvanced} label="Show advanced options" />
                </div>

                <DayStrip light>
                    {days.map((d) => {
                        const list = byDay(d).filter((e) => !e.extra)
                        return (
                            <DayPill
                                key={d}
                                date={d}
                                light
                                active={d === selected}
                                isToday={d === today}
                                dots={list.map((e) => (e.status === 'eaten' ? 'bg-emerald-500' : 'bg-neutral-300'))}
                                allDone={list.length > 0 && list.every((e) => e.status === 'eaten')}
                                onClick={() => select(d)}
                            />
                        )
                    })}
                </DayStrip>

                {advanced && (
                    <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                        <div className="flex flex-wrap gap-1.5">
                            <ToolButton icon="fa-copy" disabled={working || !weekHasPlanned} onClick={() => copy('week', days)}>
                                Copy week
                            </ToolButton>
                            {clip?.kind === 'week' && clip.from !== weekStart && (
                                <ToolButton icon="fa-paste" disabled={working} onClick={() => void paste(weekStart)}>
                                    Paste week
                                </ToolButton>
                            )}
                            <ToolButton
                                icon="fa-eraser"
                                disabled={working || !weekHasClearable}
                                onClick={() => setClearing({ dates: days, label: 'this week' })}
                            >
                                Clear week
                            </ToolButton>
                        </div>
                        <ClipNote clip={clip} working={working} onClear={() => setClip(null)} />
                    </div>
                )}
            </section>

            <div {...swipe} className="flex flex-col gap-3 md:gap-4">
                {days.map((date) => (
                    <DayCard
                        key={date}
                        date={date}
                        className={date === selected ? 'flex' : 'hidden md:flex'}
                        isToday={date === today}
                        isSelected={date === selected}
                        entries={byDay(date)}
                        out={date < today ? (energy.find((e) => e.date === date)?.caloriesOut ?? null) : undefined}
                        onSaveOut={(v) => saveOut(date, v)}
                        tools={
                            advanced ? (
                                <>
                                    <ToolButton
                                        icon="fa-copy"
                                        disabled={working || !byDay(date).some((e) => !e.extra && e.meal)}
                                        onClick={() => copy('day', [date])}
                                    >
                                        Copy day
                                    </ToolButton>
                                    {clip?.kind === 'day' && clip.from !== date && (
                                        <ToolButton icon="fa-paste" disabled={working} onClick={() => void paste(date)}>
                                            Paste day
                                        </ToolButton>
                                    )}
                                    <ToolButton
                                        icon="fa-eraser"
                                        disabled={working || !byDay(date).some(clearable)}
                                        onClick={() => setClearing({ dates: [date], label: dayName(date) })}
                                    >
                                        Clear day
                                    </ToolButton>
                                </>
                            ) : null
                        }
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

            <ConfirmModal
                open={clearing !== null}
                title={`Clear ${clearing?.label ?? ''}?`}
                message="Removes the planned meals you haven't ticked yet. Eaten meals and anything you logged stay."
                confirmLabel="Clear"
                danger
                onConfirm={() => clearing && void clear(clearing.dates)}
                onClose={() => setClearing(null)}
            />
        </div>
    )
}

// ── Week controls ────────────────────────────────────────────────────────────

function WeekStepButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
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

/** A small action in the advanced tools rows. */
function ToolButton({
    icon,
    disabled = false,
    onClick,
    children,
}: {
    icon: string
    disabled?: boolean
    onClick: () => void
    children: string
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-40"
        >
            <i className={`fa-solid ${icon} text-[11px] text-neutral-400`} aria-hidden="true" />
            {children}
        </button>
    )
}

/** What's on the clipboard, and where "Paste" appears. */
function ClipNote({ clip, working, onClear }: { clip: Clip | null; working: boolean; onClear: () => void }) {
    if (working) return <p className="text-xs text-neutral-500">Working…</p>
    if (!clip) return <p className="text-xs text-neutral-400">Copy a day or a week, then paste it onto another.</p>
    const n = clip.items.length
    return (
        <p className="flex items-center gap-1.5 text-xs text-neutral-600">
            <i className="fa-solid fa-clipboard text-neutral-400" aria-hidden="true" />
            <span className="min-w-0">
                Copied {clip.label} — {n} meal{n === 1 ? '' : 's'}.{' '}
                <span className="text-neutral-400">
                    {clip.kind === 'day' ? 'Paste day is on each other day.' : 'Go to another week to paste.'}
                </span>
            </span>
            <button
                type="button"
                onClick={onClear}
                aria-label="Clear clipboard"
                className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
        </p>
    )
}

// ── The banner ───────────────────────────────────────────────────────────────

/**
 * Today: calories and macros in (eaten only), calories out typed from your
 * watch, and the balance between them.
 */
function DayBanner({
    entries,
    out,
    goals,
    onSaveOut,
}: {
    entries: MealPlanEntry[]
    out: number | null
    goals: MacroGoals | null
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const eaten = sumEatenMacros(entries)
    const pending = sumPendingMacros(entries)

    return (
        <div className="flex flex-col gap-3 rounded-2xl bg-black/15 p-3 sm:p-4">
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
                <OutField out={out} onSave={onSaveOut} dark />
                <NetLine eaten={eaten.calories} out={out} dark />
            </div>
        </div>
    )
}

/** "Calories out" — typed in, saved on blur or Enter, cleared by emptying it. */
function OutField({ out, onSave, dark = false }: { out: number | null; onSave: (value: number | null) => Promise<void>; dark?: boolean }) {
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
            await onSave(next)
        } catch {
            setValue(out === null ? '' : String(out))
        } finally {
            setSaving(false)
        }
    }

    return (
        <label className={`flex items-center gap-2 text-sm font-semibold ${dark ? 'text-white/80' : 'text-neutral-600'}`}>
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
                className={`h-10 w-24 rounded-xl border px-3 text-right text-base font-bold tabular-nums focus:outline-none ${
                    dark
                        ? 'border-white/20 bg-white/10 text-white placeholder:text-white/40 focus:border-white/60'
                        : 'border-neutral-200 bg-white text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-400'
                }`}
            />
        </label>
    )
}

function NetLine({ eaten, out, dark = false }: { eaten: number; out: number | null; dark?: boolean }) {
    const net = out === null ? null : eaten - out
    if (net === null) {
        return <p className={`text-sm font-semibold ${dark ? 'text-white/50' : 'text-neutral-400'}`}>Add calories out to see the balance</p>
    }
    const [under, over, even] = dark
        ? ['text-emerald-300', 'text-amber-300', 'text-white']
        : ['text-emerald-600', 'text-amber-600', 'text-neutral-900']
    const tone = net < 0 ? under : net > 0 ? over : even
    return (
        <p className="text-sm font-semibold tabular-nums">
            <span className={tone}>{signedKcal(net)} kcal</span>
            <span className={`ml-1.5 ${dark ? 'text-white/60' : 'text-neutral-500'}`}>{net < 0 ? 'deficit' : net > 0 ? 'surplus' : 'even'}</span>
        </p>
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
    out,
    onSaveOut,
    tools,
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
    /** Past days only — today's lives in the banner, future days have none yet. */
    out: number | null | undefined
    onSaveOut: (value: number | null) => Promise<void>
    /** Advanced options: copy, paste, clear. */
    tools: ReactNode
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
                        {entries.length === 0
                            ? 'Nothing planned yet'
                            : `${entries.filter((e) => e.status === 'eaten').length} of ${entries.length} meal${entries.length === 1 ? '' : 's'} eaten`}
                    </p>
                </div>
            </button>

            {entries.length > 0 && <DayTotals total={sumMacros(entries)} eaten={eaten} />}

            {tools && <div className="-mt-1 flex flex-wrap gap-1.5">{tools}</div>}

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

            {out !== undefined && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-100 pt-3">
                    <OutField key={out ?? 'none'} out={out} onSave={onSaveOut} />
                    <NetLine eaten={eaten.calories} out={out} />
                </div>
            )}
        </DayCardShell>
    )
}

/** The day's macros added up: everything on it, with what's been eaten beneath. */
function DayTotals({ total, eaten }: { total: Macros; eaten: Macros }) {
    const cells = [
        { label: 'Calories', total: total.calories, eaten: eaten.calories, unit: '' },
        { label: 'Protein', total: total.protein, eaten: eaten.protein, unit: ' g' },
        { label: 'Carbs', total: total.carbs, eaten: eaten.carbs, unit: ' g' },
        { label: 'Fat', total: total.fat, eaten: eaten.fat, unit: ' g' },
    ]
    return (
        <dl className="grid grid-cols-4 divide-x divide-neutral-200/70 rounded-2xl bg-neutral-50 py-2.5">
            {cells.map((c) => {
                const t = Math.round(c.total)
                const e = Math.round(c.eaten)
                return (
                    <div key={c.label} className="min-w-0 px-2 text-center">
                        <dt className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">{c.label}</dt>
                        <dd className="truncate text-sm font-bold tabular-nums text-neutral-900 sm:text-base">
                            {c.label === 'Calories' ? kcal(t) : fmt(t)}
                            <span className="text-xs font-semibold text-neutral-400">{c.unit || ' kcal'}</span>
                        </dd>
                        <dd className={`truncate text-[11px] tabular-nums ${e >= t && t > 0 ? 'text-emerald-600' : 'text-neutral-500'}`}>
                            {e >= t && t > 0 ? 'all eaten' : `${c.label === 'Calories' ? kcal(e) : fmt(e)} eaten`}
                        </dd>
                    </div>
                )
            })}
        </dl>
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
