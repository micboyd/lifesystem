import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listPlanEntries } from '../../services/mealPlan'
import { addDays, parseDateKey, formatWeekRange, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'
import { MEAL_TYPES } from '../../types'
import { sumMacros } from '../../lib/nutrition'
import type { Macros, MealPlanEntry, MealType } from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Whole numbers plain, decimals to one place. */
function fmt(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0'
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/** The Monday (YYYY-MM-DD) that starts the week containing `date` — matches the planner. */
function mondayOf(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const dow = new Date(year, month, day).getDay() // 0 Sun … 6 Sat
    return addDays(date, -((dow + 6) % 7))
}

/** "Mon" — the short weekday name for a day key. */
function weekdayShort(date: string): string {
    const { year, month, day } = parseDateKey(date)
    return WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)
}

/** "4 Aug" — a compact day-and-month label. */
function dayMonthLabel(date: string): string {
    const { month, day } = parseDateKey(date)
    return `${day} ${MONTHS[month].slice(0, 3)}`
}

const SLOT_META: Record<MealType, { label: string; dot: string }> = {
    breakfast: { label: 'Breakfast', dot: 'bg-amber-400' },
    lunch: { label: 'Lunch', dot: 'bg-emerald-400' },
    dinner: { label: 'Dinner', dot: 'bg-indigo-400' },
    snack: { label: 'Snack', dot: 'bg-rose-400' },
}

/** A P/C/F trio of compact pills. */
function MacroPills({ macros }: { macros: Macros }) {
    const items: [string, number][] = [
        ['P', macros.protein],
        ['C', macros.carbs],
        ['F', macros.fat],
    ]
    return (
        <div className="flex gap-1.5 text-xs tabular-nums text-neutral-500">
            {items.map(([label, value]) => (
                <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-1.5 py-0.5"
                >
                    <span className="font-semibold text-neutral-400">{label}</span>
                    <span className="font-semibold text-neutral-700">{fmt(value)}g</span>
                </span>
            ))}
        </div>
    )
}

// ── Today's meals ─────────────────────────────────────────────────────────────

function TodayView({ entries }: { entries: MealPlanEntry[] }) {
    const totals = sumMacros(entries)
    // Group by slot, keeping the canonical breakfast → snack order.
    const bySlot = MEAL_TYPES.map((slot) => ({
        slot,
        meals: entries.filter((e) => e.slot === slot),
    })).filter((g) => g.meals.length > 0)

    return (
        <div className="flex flex-col gap-4">
            {/* Day macro headline */}
            <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                            Calories today
                        </p>
                        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-neutral-900">
                            {fmt(totals.calories)}
                            <span className="ml-1 text-base font-normal text-neutral-400">kcal</span>
                        </p>
                    </div>
                    <MacroPills macros={totals} />
                </div>
            </div>

            {/* Meals by slot */}
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-2xl ring-1 ring-black/[0.06]">
                {bySlot.map(({ slot, meals }) =>
                    meals.map((entry, i) => (
                        <li
                            key={entry._id}
                            className="flex items-center gap-3 px-4 py-3"
                        >
                            <span
                                className={`h-2 w-2 shrink-0 rounded-full ${SLOT_META[slot].dot}`}
                                aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                                {/* Only the first meal of a slot shows the slot label. */}
                                {i === 0 && (
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                                        {SLOT_META[slot].label}
                                    </p>
                                )}
                                <p className="truncate text-sm font-semibold text-neutral-800">
                                    {entry.meal?.name ?? 'Meal'}
                                </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-500">
                                {fmt(entry.meal?.macros.calories ?? 0)}
                                <span className="ml-0.5 text-[10px] font-normal text-neutral-400">
                                    kcal
                                </span>
                            </span>
                        </li>
                    ))
                )}
            </ul>
        </div>
    )
}

// ── The week ahead ────────────────────────────────────────────────────────────

function WeekView({ weekStart, entries }: { weekStart: string; entries: MealPlanEntry[] }) {
    const totals = sumMacros(entries)
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const perDay = days.map((date) => {
        const dayEntries = entries.filter((e) => e.date === date)
        return { date, count: dayEntries.length, calories: sumMacros(dayEntries).calories }
    })
    const maxCalories = Math.max(1, ...perDay.map((d) => d.calories))

    return (
        <div className="flex flex-col gap-4">
            {/* Week macro headline */}
            <div className="rounded-2xl bg-white p-5 ring-1 ring-black/[0.06]">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-coral-600">
                            Week total
                        </p>
                        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-neutral-900">
                            {fmt(totals.calories)}
                            <span className="ml-1 text-base font-normal text-neutral-400">kcal</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-semibold text-neutral-400">
                            {fmt(totals.calories / 7)} kcal / day avg
                        </p>
                    </div>
                    <MacroPills macros={totals} />
                </div>
            </div>

            {/* Per-day glance */}
            <ul className="flex flex-col divide-y divide-neutral-100 rounded-2xl ring-1 ring-black/[0.06]">
                {perDay.map((d) => (
                    <li key={d.date} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-16 shrink-0">
                            <p className="text-sm font-semibold text-neutral-800">
                                {weekdayShort(d.date)}
                            </p>
                            <p className="text-[10px] tabular-nums text-neutral-400">
                                {dayMonthLabel(d.date)}
                            </p>
                        </div>
                        {d.count === 0 ? (
                            <p className="flex-1 text-xs text-neutral-300">Nothing planned</p>
                        ) : (
                            <>
                                <div className="flex-1">
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                                        <div
                                            className="h-full rounded-full bg-coral-400 transition-all duration-300"
                                            style={{ width: `${(d.calories / maxCalories) * 100}%` }}
                                        />
                                    </div>
                                    <p className="mt-1 text-[10px] text-neutral-400">
                                        {d.count} meal{d.count !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold tabular-nums text-neutral-500">
                                    {fmt(d.calories)}
                                    <span className="ml-0.5 text-[10px] font-normal text-neutral-400">
                                        kcal
                                    </span>
                                </span>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    )
}

// ── Main widget ───────────────────────────────────────────────────────────────

/**
 * `cadence` picks the lens: 'today' lists the day's planned meals with the day's
 * macro tally; 'week' gives a per-day glance across the Monday-based week with
 * the week's totals. Splitting them lets the dashboard show today's meals up top
 * and the week ahead lower down — mirroring the budget widgets.
 */
export default function NutritionWidget({
    date,
    cadence = 'today',
}: {
    date: string
    cadence?: 'today' | 'week'
}) {
    const isWeek = cadence === 'week'
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    // Derive loading from which range finished loading — avoids a synchronous
    // setState inside the fetch effect.
    const [loadedKey, setLoadedKey] = useState<string | null>(null)

    const weekStart = mondayOf(date)
    const start = isWeek ? weekStart : date
    const end = isWeek ? addDays(weekStart, 6) : date
    const rangeKey = `${start}:${end}`
    const loading = loadedKey !== rangeKey

    useEffect(() => {
        let active = true
        listPlanEntries(start, end)
            .then((rows) => {
                if (active) setEntries(rows)
            })
            .finally(() => {
                if (active) setLoadedKey(rangeKey)
            })
        return () => {
            active = false
        }
    }, [start, end, rangeKey])

    return (
        <Card>
            <CardHeader className="flex items-start justify-between gap-4">
                <div>
                    <CardTitle>{isWeek ? 'Meals this week' : 'Meals today'}</CardTitle>
                    <p className="mt-0.5 text-sm text-neutral-400">
                        {isWeek
                            ? formatWeekRange(weekStart, addDays(weekStart, 6))
                            : entries.length > 0
                              ? `${entries.length} meal${entries.length !== 1 ? 's' : ''} planned`
                              : 'What’s on the menu'}
                    </p>
                </div>
                <CardAction to="/nutrition" className="mt-1">
                    Nutrition
                </CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-6">
                    <Spinner />
                </div>
            ) : entries.length === 0 ? (
                <p className="py-4 text-sm text-neutral-400">
                    {isWeek ? 'No meals planned this week yet.' : 'No meals planned for today.'}{' '}
                    <Link
                        to="/nutrition"
                        className="font-semibold text-neutral-600 underline underline-offset-2"
                    >
                        Plan meals on the Nutrition tab.
                    </Link>
                </p>
            ) : isWeek ? (
                <WeekView weekStart={weekStart} entries={entries} />
            ) : (
                <TodayView entries={entries} />
            )}
        </Card>
    )
}
