import { useEffect, useMemo, useState } from 'react'
import Spinner from '../Spinner'
import StatTile from '../StatTile'
import PillToggle from '../PillToggle'
import Select from '../Select'
import { fmt, kcal, signedKcal, signedKg } from './format'
import { mondayOf } from './NutritionPlanner'
import { listPlanEntries } from '../../services/mealPlan'
import { listDailyEnergy } from '../../services/dailyEnergy'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { addDays, addMonths, formatMonthYear, formatWeekRange, parseDateKey, todayKey, MONTHS } from '../../lib/calendar'
import { sumEatenMacros } from '../../lib/nutrition'
import type { DailyEnergy, Macros, MealPlanEntry, NutritionPhase } from '../../types'

type Range = 'week' | 'month' | 'phase'

/** Roughly what a kilogram of body weight is worth in calories. */
const KCAL_PER_KG = 7700

interface Day {
    date: string
    eaten: Macros | null
    out: number | null
}

function monthBounds(anchor: string): [string, string] {
    const { year, month } = parseDateKey(anchor)
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
    return [start, addDays(addMonths(start, 1), -1)]
}

function shortDay(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(year, month, day).getDay()]
    return `${wd} ${day} ${MONTHS[month].slice(0, 3)}`
}

/**
 * How it's going over a week, a month or a phase: average intake on days you
 * logged, average burn on days you entered it, and the balance across the days
 * that have both.
 */
export default function NutritionStats() {
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

    const days: Day[] = useMemo(() => {
        const out: Day[] = []
        for (let d = start; d <= last; d = addDays(d, 1)) {
            const eatenList = entries.filter((e) => e.date === d && e.status === 'eaten')
            out.push({
                date: d,
                eaten: eatenList.length ? sumEatenMacros(eatenList) : null,
                out: energy.find((x) => x.date === d)?.caloriesOut ?? null,
            })
        }
        return out.reverse()
    }, [start, last, entries, energy])

    const logged = days.filter((d) => d.eaten)
    const withOut = days.filter((d) => d.out !== null)
    const both = days.filter((d) => d.eaten && d.out !== null)
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    const avgIn = avg(logged.map((d) => d.eaten!.calories))
    const avgP = avg(logged.map((d) => d.eaten!.protein))
    const avgC = avg(logged.map((d) => d.eaten!.carbs))
    const avgF = avg(logged.map((d) => d.eaten!.fat))
    const avgOut = avg(withOut.map((d) => d.out!))
    const totalNet = both.length ? both.reduce((a, d) => a + d.eaten!.calories - d.out!, 0) : null

    const title =
        range === 'week' ? formatWeekRange(start, end) : range === 'month' ? formatMonthYear(start) : (phase?.name ?? 'No phases yet')

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
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
                    <div className="flex w-full items-center gap-1 sm:w-auto">
                        <button
                            type="button"
                            aria-label="Previous"
                            onClick={() => setAnchor(range === 'week' ? addDays(anchor, -7) : addMonths(anchor, -1))}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100"
                        >
                            <i className="fa-solid fa-chevron-left text-sm" aria-hidden="true" />
                        </button>
                        <p className="min-w-0 flex-1 truncate text-center text-sm font-bold text-neutral-900 sm:min-w-[11rem]">{title}</p>
                        <button
                            type="button"
                            aria-label="Next"
                            onClick={() => setAnchor(range === 'week' ? addDays(anchor, 7) : addMonths(anchor, 1))}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100"
                        >
                            <i className="fa-solid fa-chevron-right text-sm" aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>

            {range === 'phase' && !phase ? (
                <p className="rounded-3xl border border-dashed border-neutral-200 py-10 text-center text-sm text-neutral-500">
                    No phases yet — set one up in the Phases tab.
                </p>
            ) : loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <StatTile
                            label="Calories in / day"
                            value={avgIn === null ? '—' : kcal(avgIn)}
                            sub={`${logged.length} of ${days.length} days logged`}
                        />
                        <StatTile label="Calories out / day" value={avgOut === null ? '—' : kcal(avgOut)} sub={`${withOut.length} days entered`} />
                        <StatTile
                            label="Balance"
                            value={totalNet === null ? '—' : `${signedKcal(totalNet)}`}
                            sub={
                                totalNet === null
                                    ? 'Needs days with both in and out'
                                    : `≈ ${signedKg(totalNet / KCAL_PER_KG)} over ${both.length} days`
                            }
                            tone={totalNet === null ? 'neutral' : totalNet < 0 ? 'good' : 'warn'}
                        />
                        <StatTile
                            label="Protein / day"
                            value={avgP === null ? '—' : `${fmt(Math.round(avgP))} g`}
                            sub={avgC === null ? undefined : `Carbs ${fmt(Math.round(avgC))} g · Fat ${fmt(Math.round(avgF!))} g`}
                        />
                    </div>

                    <section className="rounded-3xl bg-white p-3 ring-1 ring-black/[0.06] sm:p-4">
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-2 pb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-400 sm:gap-x-8">
                            <span>Day</span>
                            <span className="text-right">In</span>
                            <span className="text-right">Out</span>
                            <span className="w-16 text-right">Balance</span>
                        </div>
                        <ul className="flex flex-col divide-y divide-neutral-100">
                            {days.map((d) => {
                                const net = d.eaten && d.out !== null ? d.eaten.calories - d.out : null
                                return (
                                    <li key={d.date} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 px-2 py-2.5 text-sm tabular-nums sm:gap-x-8">
                                        <span className="min-w-0 truncate font-medium text-neutral-800">
                                            {shortDay(d.date)}
                                            {d.eaten && (
                                                <span className="ml-2 text-xs font-normal text-neutral-400">{fmt(Math.round(d.eaten.protein))} g P</span>
                                            )}
                                        </span>
                                        <span className="text-right text-neutral-900">{d.eaten ? kcal(d.eaten.calories) : '—'}</span>
                                        <span className="text-right text-neutral-500">{d.out !== null ? kcal(d.out) : '—'}</span>
                                        <span
                                            className={`w-16 text-right font-semibold ${
                                                net === null ? 'text-neutral-300' : net < 0 ? 'text-emerald-600' : 'text-amber-600'
                                            }`}
                                        >
                                            {net === null ? '—' : signedKcal(net)}
                                        </span>
                                    </li>
                                )
                            })}
                            {days.length === 0 && <li className="py-6 text-center text-sm text-neutral-400">Nothing to show yet.</li>}
                        </ul>
                    </section>
                </>
            )}
        </div>
    )
}
