import { useEffect, useMemo, useState } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import EmptyState from './EmptyState'
import Drawer from './Drawer'
import { listWorkouts } from '../services/workouts'
import { listSessions } from '../services/conditioning'
import { listPlanEntries, addPlanEntry, deletePlanEntry } from '../services/fitnessPlan'
import { FITNESS_PLAN_KINDS } from '../types'
import type {
    Workout,
    ConditioningSession,
    ConditioningCategory,
    FitnessPlanEntry,
    FitnessPlanKind,
} from '../types'
import {
    todayKey,
    addDays,
    parseDateKey,
    formatWeekRange,
    WEEKDAYS_LONG,
    MONTHS,
} from '../lib/calendar'

// ─── Kind presentation ────────────────────────────────────────────────────────

const KIND_META: Record<
    FitnessPlanKind,
    { label: string; noun: string; icon: string }
> = {
    workout: { label: 'Strength', noun: 'workout', icon: 'fa-solid fa-dumbbell' },
    conditioning: { label: 'Conditioning', noun: 'session', icon: 'fa-solid fa-heart-pulse' },
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

// ─── Date helpers ───────────────────────────────────────────────────────────────

/** The Monday (YYYY-MM-DD) that starts the week containing `date`. */
function mondayOf(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const dow = new Date(year, month, day).getDay() // 0 Sun … 6 Sat
    return addDays(date, -((dow + 6) % 7))
}

/** "Mon 4 Aug" — a compact label for a single day. */
function shortDayLabel(date: string): string {
    const { year, month, day } = parseDateKey(date)
    const wd = WEEKDAYS_LONG[new Date(year, month, day).getDay()].slice(0, 3)
    return `${wd} ${day} ${MONTHS[month].slice(0, 3)}`
}

// ─── Week tallies ───────────────────────────────────────────────────────────────

interface WeekTally {
    workouts: number
    sessions: number
    /** Total planned conditioning minutes across the range. */
    minutes: number
}

function tally(entries: FitnessPlanEntry[]): WeekTally {
    return entries.reduce<WeekTally>(
        (acc, e) => {
            if (e.kind === 'workout') acc.workouts += 1
            else {
                acc.sessions += 1
                acc.minutes += e.session?.duration ?? 0
            }
            return acc
        },
        { workouts: 0, sessions: 0, minutes: 0 }
    )
}

// ─── Planner ────────────────────────────────────────────────────────────────────

export default function FitnessWeeklyPlanner() {
    const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey()))
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [libLoading, setLibLoading] = useState(true)
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [picker, setPicker] = useState<{ date: string; kind: FitnessPlanKind } | null>(null)
    // The planner opens read-only; Edit reveals the add/remove controls.
    const [editing, setEditing] = useState(false)

    const weekEnd = addDays(weekStart, 6)
    const today = todayKey()

    // The two libraries — loaded once, for the picker and the "is it empty" check.
    useEffect(() => {
        Promise.all([listWorkouts(), listSessions()])
            .then(([wk, se]) => {
                setWorkouts(wk)
                setSessions(se)
            })
            .finally(() => setLibLoading(false))
    }, [])

    useEffect(() => {
        // Refetch silently on week change — the grid keeps the previous week's
        // items until the new ones arrive, so navigation never flashes a spinner.
        let active = true
        listPlanEntries(weekStart, weekEnd)
            .then((rows) => active && setEntries(rows))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [weekStart, weekEnd])

    const days = useMemo(
        () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    )

    async function handleAdd(date: string, kind: FitnessPlanKind, itemId: string) {
        const entry = await addPlanEntry(date, kind, itemId)
        setEntries((prev) => [...prev, entry])
    }

    async function handleRemove(id: string) {
        setEntries((prev) => prev.filter((e) => e._id !== id))
        await deletePlanEntry(id)
    }

    const week = tally(entries)
    const libraryEmpty = workouts.length === 0 && sessions.length === 0

    return (
        <div className="flex flex-col gap-6">
            {/* Week navigation + totals */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-2">
                    <IconButton
                        label="Previous week"
                        icon="fa-solid fa-chevron-left"
                        onClick={() => setWeekStart(addDays(weekStart, -7))}
                    />
                    <div className="min-w-[10rem] text-center text-sm font-semibold text-neutral-900">
                        {formatWeekRange(weekStart, weekEnd)}
                    </div>
                    <IconButton
                        label="Next week"
                        icon="fa-solid fa-chevron-right"
                        onClick={() => setWeekStart(addDays(weekStart, 7))}
                    />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setWeekStart(mondayOf(today))}
                        className="ml-1"
                    >
                        This week
                    </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {!libraryEmpty && (
                        <Button
                            variant={editing ? 'primary' : 'secondary'}
                            size="sm"
                            icon={editing ? 'fa-solid fa-check' : 'fa-solid fa-pen'}
                            onClick={() => {
                                setPicker(null)
                                setEditing((e) => !e)
                            }}
                        >
                            {editing ? 'Done' : 'Edit plan'}
                        </Button>
                    )}
                    <WeekTotals tally={week} />
                </div>
            </div>

            {libLoading || loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : libraryEmpty ? (
                <EmptyState
                    icon="fa-solid fa-calendar-week"
                    title="Nothing to plan with yet"
                    description="Build some workouts or conditioning sessions first, then drop them into the week."
                />
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    {days.map((date) => (
                        <DayColumn
                            key={date}
                            date={date}
                            isToday={date === today}
                            editable={editing}
                            entries={entries.filter((e) => e.date === date)}
                            onAdd={(kind) => setPicker({ date, kind })}
                            onRemove={handleRemove}
                        />
                    ))}
                </div>
            )}

            <ItemPicker
                target={picker}
                workouts={workouts}
                sessions={sessions}
                entries={
                    picker
                        ? entries.filter((e) => e.date === picker.date && e.kind === picker.kind)
                        : []
                }
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onRemove={handleRemove}
            />
        </div>
    )
}

function IconButton({
    icon,
    label,
    onClick,
    disabled = false,
}: {
    icon: string
    label: string
    onClick: () => void
    disabled?: boolean
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-neutral-500"
        >
            <i className={icon} aria-hidden="true" />
        </button>
    )
}

/** Week-total headline: workouts, sessions and total conditioning minutes. */
function WeekTotals({ tally }: { tally: WeekTally }) {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5">
            <Stat label="Workouts" value={tally.workouts} />
            <div className="h-8 w-px bg-neutral-200" />
            <Stat label="Sessions" value={tally.sessions} />
            <div className="h-8 w-px bg-neutral-200" />
            <Stat label="Cond. min" value={tally.minutes} />
        </div>
    )
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className="text-lg font-bold tabular-nums text-neutral-900">{value}</p>
        </div>
    )
}

function DayColumn({
    date,
    isToday,
    editable,
    entries,
    onAdd,
    onRemove,
}: {
    date: string
    isToday: boolean
    editable: boolean
    entries: FitnessPlanEntry[]
    onAdd: (kind: FitnessPlanKind) => void
    onRemove: (id: string) => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const t = tally(entries)
    const rest = entries.length === 0

    return (
        <Card as="div" flush hover={false} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between">
                <div>
                    <p
                        className={`text-sm font-bold ${
                            isToday ? 'text-coral-600' : 'text-neutral-900'
                        }`}
                    >
                        {weekday}
                    </p>
                    <p className="text-xs text-neutral-400">
                        {day} {MONTHS[month].slice(0, 3)}
                    </p>
                </div>
                {isToday && (
                    <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[10px] font-semibold text-coral-600">
                        Today
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-3">
                {FITNESS_PLAN_KINDS.map((kind) => (
                    <KindSection
                        key={kind}
                        kind={kind}
                        editable={editable}
                        entries={entries.filter((e) => e.kind === kind)}
                        onAdd={() => onAdd(kind)}
                        onRemove={onRemove}
                    />
                ))}
            </div>

            <div className="mt-auto flex items-center gap-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
                {rest ? (
                    <span className="text-neutral-400">Rest day</span>
                ) : (
                    <>
                        <span className="tabular-nums">
                            {t.workouts} {t.workouts === 1 ? 'workout' : 'workouts'}
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span className="tabular-nums">{t.minutes} min cond.</span>
                    </>
                )}
            </div>
        </Card>
    )
}

function KindSection({
    kind,
    editable,
    entries,
    onAdd,
    onRemove,
}: {
    kind: FitnessPlanKind
    editable: boolean
    entries: FitnessPlanEntry[]
    onAdd: () => void
    onRemove: (id: string) => void
}) {
    const meta = KIND_META[kind]

    // In view mode an empty slot is just noise — collapse it so the plan reads clean.
    if (!editable && entries.length === 0) return null

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {meta.label}
                </span>
                {editable && (
                    <button
                        type="button"
                        aria-label={`Add ${meta.noun}`}
                        onClick={onAdd}
                        className="grid h-6 w-6 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                    </button>
                )}
            </div>
            {entries.length > 0 ? (
                <ul className="flex flex-col gap-1">
                    {entries.map((e) => (
                        <PlannedRow
                            key={e._id}
                            entry={e}
                            onRemove={editable ? () => onRemove(e._id) : undefined}
                        />
                    ))}
                </ul>
            ) : (
                <button
                    type="button"
                    onClick={onAdd}
                    className="rounded-lg border border-dashed border-neutral-200 py-1.5 text-center text-[11px] text-neutral-300 transition-colors hover:border-neutral-300 hover:text-neutral-500"
                >
                    Add
                </button>
            )}
        </div>
    )
}

function PlannedRow({ entry, onRemove }: { entry: FitnessPlanEntry; onRemove?: () => void }) {
    const name = entry.kind === 'workout' ? entry.workout?.name : entry.session?.name
    return (
        <li className="flex items-center gap-1.5 rounded-lg bg-neutral-50 px-2 py-1.5">
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-neutral-700">{name}</p>
                {entry.kind === 'workout' && entry.workout ? (
                    <p className="text-[10px] tabular-nums text-neutral-400">
                        {entry.workout.exercises.length}{' '}
                        {entry.workout.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </p>
                ) : entry.session ? (
                    <div className="mt-0.5 flex items-center gap-1.5">
                        <CategoryChip category={entry.session.category} />
                        <span className="text-[10px] tabular-nums text-neutral-400">
                            {entry.session.duration} min
                        </span>
                    </div>
                ) : null}
            </div>
            {onRemove && (
                <button
                    type="button"
                    aria-label={`Remove ${name ?? 'item'}`}
                    onClick={onRemove}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-neutral-200 hover:text-red-600"
                >
                    <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                </button>
            )}
        </li>
    )
}

/**
 * The add drawer for a single day + kind. Clicking an item adds it and keeps the
 * drawer open so several can be added in a row; what's already on the day is
 * listed at the top and can be removed here too.
 */
function ItemPicker({
    target,
    workouts,
    sessions,
    entries,
    onClose,
    onAdd,
    onRemove,
}: {
    target: { date: string; kind: FitnessPlanKind } | null
    workouts: Workout[]
    sessions: ConditioningSession[]
    entries: FitnessPlanEntry[]
    onClose: () => void
    onAdd: (date: string, kind: FitnessPlanKind, itemId: string) => Promise<void>
    onRemove: (id: string) => void
}) {
    // Retain the last target so the drawer keeps its content while sliding shut.
    const [view, setView] = useState(target)
    const [query, setQuery] = useState('')
    useEffect(() => {
        if (target) {
            setView(target)
            setQuery('')
        }
    }, [target])

    const kind = view?.kind
    const meta = kind ? KIND_META[kind] : null

    const workoutResults = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q
            ? workouts.filter(
                  (w) =>
                      w.name.toLowerCase().includes(q) ||
                      (w.description ?? '').toLowerCase().includes(q)
              )
            : workouts
        // Pinned workouts (showInPlanner) bubble to the top as suggestions.
        return [...base].sort(
            (a, b) => Number(b.showInPlanner) - Number(a.showInPlanner) || a.name.localeCompare(b.name)
        )
    }, [workouts, query])

    const sessionResults = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q
            ? sessions.filter(
                  (s) =>
                      s.name.toLowerCase().includes(q) ||
                      (s.purpose ?? '').toLowerCase().includes(q)
              )
            : sessions
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [sessions, query])

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            title={meta ? `Add ${meta.label.toLowerCase()}` : 'Add to day'}
            badge={view ? shortDayLabel(view.date) : undefined}
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                {entries.length > 0 && (
                    <section className="flex flex-col gap-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            On this day
                        </p>
                        <ul className="flex flex-col gap-1">
                            {entries.map((e) => (
                                <PlannedRow key={e._id} entry={e} onRemove={() => onRemove(e._id)} />
                            ))}
                        </ul>
                    </section>
                )}

                <Input
                    placeholder={`Search ${meta ? meta.noun + 's' : ''}…`}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                {kind === 'workout' ? (
                    workoutResults.length === 0 ? (
                        <p className="py-6 text-center text-sm text-neutral-400">No workouts found.</p>
                    ) : (
                        <ul className="flex flex-col gap-1.5">
                            {workoutResults.map((w) => (
                                <li key={w._id}>
                                    <button
                                        type="button"
                                        onClick={() => view && onAdd(view.date, 'workout', w._id)}
                                        className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <p className="truncate text-sm font-medium text-neutral-800">
                                                    {w.name}
                                                </p>
                                                {w.showInPlanner && (
                                                    <i
                                                        className="fa-solid fa-thumbtack shrink-0 text-[10px] text-coral-500"
                                                        aria-hidden="true"
                                                        title="Pinned"
                                                    />
                                                )}
                                            </div>
                                            <p className="text-xs tabular-nums text-neutral-400">
                                                {w.exercises.length}{' '}
                                                {w.exercises.length === 1 ? 'exercise' : 'exercises'}
                                            </p>
                                        </div>
                                        <i
                                            className="fa-solid fa-plus text-xs text-neutral-400"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )
                ) : sessionResults.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-400">No sessions found.</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {sessionResults.map((s) => (
                            <li key={s._id}>
                                <button
                                    type="button"
                                    onClick={() => view && onAdd(view.date, 'conditioning', s._id)}
                                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-neutral-800">
                                            {s.name}
                                        </p>
                                        <p className="text-xs tabular-nums text-neutral-400">
                                            {s.duration} min
                                        </p>
                                    </div>
                                    <CategoryChip category={s.category} />
                                    <i
                                        className="fa-solid fa-plus text-xs text-neutral-400"
                                        aria-hidden="true"
                                    />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Drawer>
    )
}
