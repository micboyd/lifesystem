import { useEffect, useState } from 'react'
import { Card, CardAction, CardHeader, CardTitle } from '../Card'
import Spinner from '../Spinner'
import { listPlanEntries } from '../../services/fitnessPlan'
import { addDays, parseDateKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'
import type { FitnessPlanEntry, FitnessPlanKind, ConditioningCategory } from '../../types'

// ── Presentation ────────────────────────────────────────────────────────────────

const KIND_META: Record<FitnessPlanKind, { noun: string; icon: string }> = {
    workout: { noun: 'workout', icon: 'fa-solid fa-dumbbell' },
    conditioning: { noun: 'session', icon: 'fa-solid fa-heart-pulse' },
    mobility: { noun: 'routine', icon: 'fa-solid fa-person-walking' },
    recovery: { noun: 'item', icon: 'fa-solid fa-spa' },
}

const CATEGORY_CHIP: Record<ConditioningCategory, string> = {
    HIIT: 'bg-rose-50 text-rose-700 ring-rose-600/20',
    Cardio: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    Endurance: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    Mobility: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    Recovery: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
}

function CategoryChip({ category }: { category: ConditioningCategory }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${CATEGORY_CHIP[category]}`}
        >
            {category}
        </span>
    )
}

/** Name + a one-line detail for a single planned item. */
function planName(entry: FitnessPlanEntry): string {
    const name =
        entry.kind === 'workout'
            ? entry.workout?.name
            : entry.kind === 'conditioning'
              ? entry.session?.name
              : entry.kind === 'mobility'
                ? entry.mobility?.name
                : entry.recovery?.name
    return name ?? 'Untitled'
}

/** One planned workout or conditioning session, as a row. */
function PlanRow({ entry }: { entry: FitnessPlanEntry }) {
    const meta = KIND_META[entry.kind]
    return (
        <li className="flex items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-100 text-sm text-neutral-500">
                <i className={meta.icon} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">{planName(entry)}</p>
                {entry.kind === 'workout' && entry.workout ? (
                    <p className="text-xs tabular-nums text-neutral-400">
                        {entry.workout.exercises.length}{' '}
                        {entry.workout.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </p>
                ) : entry.kind === 'conditioning' && entry.session ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <CategoryChip category={entry.session.category} />
                        <span className="text-xs tabular-nums text-neutral-400">
                            {entry.session.duration} min
                        </span>
                    </div>
                ) : entry.kind === 'mobility' && entry.mobility ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Mobility
                        </span>
                        {entry.mobility.duration > 0 && (
                            <span className="text-xs tabular-nums text-neutral-400">
                                {entry.mobility.duration} min
                            </span>
                        )}
                    </div>
                ) : entry.recovery ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            Recovery
                        </span>
                        {entry.recovery.duration > 0 && (
                            <span className="text-xs tabular-nums text-neutral-400">
                                {entry.recovery.duration} min
                            </span>
                        )}
                    </div>
                ) : null}
            </div>
        </li>
    )
}

// ── Today ─────────────────────────────────────────────────────────────────────

function TodayFitness({ date }: { date: string }) {
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let active = true
        setLoading(true)
        listPlanEntries(date, date)
            .then((rows) => active && setEntries(rows))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [date])

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Today&apos;s training</CardTitle>
                <CardAction to="/fitness">Planner</CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : entries.length === 0 ? (
                <div className="flex items-center gap-3 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm text-emerald-600">
                        <i className="fa-solid fa-mug-hot" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-neutral-900">Rest day</p>
                        <p className="text-xs text-neutral-400">Nothing scheduled — recover well.</p>
                    </div>
                </div>
            ) : (
                <ul className="flex flex-col gap-3">
                    {entries.map((e) => (
                        <PlanRow key={e._id} entry={e} />
                    ))}
                </ul>
            )}
        </Card>
    )
}

// ── Week ahead ────────────────────────────────────────────────────────────────

/** Number of days after today the "week ahead" looks forward. */
const AHEAD_DAYS = 7

/** "Tomorrow", or "Tue 5 Aug" for days further out. */
function dayLabel(date: string, from: string): string {
    if (date === addDays(from, 1)) return 'Tomorrow'
    const { year, month, day } = parseDateKey(date)
    const wd = WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)
    return `${wd} ${day} ${MONTHS[month].slice(0, 3)}`
}

function WeekAheadFitness({ date }: { date: string }) {
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [loading, setLoading] = useState(true)

    const start = addDays(date, 1)
    const end = addDays(date, AHEAD_DAYS)

    useEffect(() => {
        let active = true
        setLoading(true)
        listPlanEntries(start, end)
            .then((rows) => active && setEntries(rows))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [start, end])

    // Group by day, in date order, skipping empty days.
    const days = Array.from({ length: AHEAD_DAYS }, (_, i) => addDays(start, i))
        .map((d) => ({ date: d, items: entries.filter((e) => e.date === d) }))
        .filter((g) => g.items.length > 0)

    return (
        <Card>
            <CardHeader className="flex items-center justify-between gap-4">
                <CardTitle>Training week</CardTitle>
                <CardAction to="/fitness">Planner</CardAction>
            </CardHeader>

            {loading ? (
                <div className="grid place-items-center py-8">
                    <Spinner />
                </div>
            ) : days.length === 0 ? (
                <div className="flex items-center gap-3 py-2">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm text-emerald-600">
                        <i className="fa-solid fa-mug-hot" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-neutral-900">No training scheduled</p>
                        <p className="text-xs text-neutral-400">The week ahead is clear.</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-4">
                    {days.map((g) => (
                        <div key={g.date} className="flex flex-col gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                {dayLabel(g.date, date)}
                            </p>
                            <ul className="flex flex-col gap-3">
                                {g.items.map((e) => (
                                    <PlanRow key={e._id} entry={e} />
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}

// ── Entry point ────────────────────────────────────────────────────────────────

export default function FitnessWidget({
    date,
    cadence,
}: {
    date: string
    cadence: 'today' | 'week'
}) {
    return cadence === 'today' ? <TodayFitness date={date} /> : <WeekAheadFitness date={date} />
}
