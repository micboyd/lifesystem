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
    addMonths,
    dateKey,
    daysInMonth,
    parseDateKey,
    formatWeekRange,
    formatMonthYear,
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

// Each plan kind carries its own colour so strength and cardio read apart at a
// glance — coral for strength, sky for conditioning (matching the month chips).
const KIND_TONE: Record<
    FitnessPlanKind,
    { label: string; icon: string; row: string; chip: string }
> = {
    workout: {
        label: 'text-coral-600',
        icon: 'text-coral-500',
        row: 'border-l-2 border-coral-300 bg-coral-50/60',
        chip: 'bg-coral-50 text-coral-700',
    },
    conditioning: {
        label: 'text-sky-600',
        icon: 'text-sky-500',
        row: 'border-l-2 border-sky-300 bg-sky-50/60',
        chip: 'bg-sky-50 text-sky-700',
    },
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

/** First day (YYYY-MM-DD) of the month containing `date`. */
function firstOfMonth(date: string): string {
    const { year, month } = parseDateKey(date)
    return dateKey(year, month, 1)
}

/** Last day (YYYY-MM-DD) of the month containing `date`. */
function lastOfMonth(date: string): string {
    const { year, month } = parseDateKey(date)
    return dateKey(year, month, daysInMonth(year, month))
}

/** True if `date` falls within the same calendar month as `anchor`. */
function inSameMonth(date: string, anchor: string): boolean {
    return date >= firstOfMonth(anchor) && date <= lastOfMonth(anchor)
}

/**
 * The Monday-aligned calendar grid for the month containing `anchor`.
 * Runs from the Monday on/before the 1st through the number of whole weeks
 * needed to cover the month (5 or 6 rows — never a trailing empty week).
 */
function monthGridDays(anchor: string): string[] {
    const { year, month } = parseDateKey(anchor)
    const lead = (new Date(year, month, 1).getDay() + 6) % 7 // Mon-start offset
    const rows = Math.ceil((lead + daysInMonth(year, month)) / 7)
    const start = mondayOf(firstOfMonth(anchor))
    return Array.from({ length: rows * 7 }, (_, i) => addDays(start, i))
}

/** "Jul – Dec 2026" (or spanning years) for the 6 months from `anchor`. */
function sixMonthLabel(anchor: string): string {
    const s = parseDateKey(anchor)
    const e = parseDateKey(addMonths(firstOfMonth(anchor), 5))
    const sm = MONTHS[s.month].slice(0, 3)
    const em = MONTHS[e.month].slice(0, 3)
    return s.year === e.year
        ? `${sm} – ${em} ${e.year}`
        : `${sm} ${s.year} – ${em} ${e.year}`
}

// ─── Views ──────────────────────────────────────────────────────────────────────

type PlannerView = 'week' | 'month' | '6month'

const VIEW_META: { key: PlannerView; label: string }[] = [
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: '6month', label: '6 months' },
]

/** Monday-start weekday headers for the month grid. */
const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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
    const [view, setView] = useState<PlannerView>('week')
    // The anchor is any day inside the range on show; each view derives its own
    // bounds from it (the week's Monday, the anchor's month, six months on).
    const [anchor, setAnchor] = useState(() => todayKey())
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [libLoading, setLibLoading] = useState(true)
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [loading, setLoading] = useState(true)
    // `kind: null` opens a whole-day drawer (from the month grid); a set kind
    // jumps straight to that section's add list (from a week column).
    const [picker, setPicker] = useState<{ date: string; kind: FitnessPlanKind | null } | null>(
        null
    )
    // The planner opens read-only; Edit reveals the add/remove controls.
    const [editing, setEditing] = useState(false)

    const today = todayKey()

    // The date range to fetch — and to tally totals over — for the active view.
    const range = useMemo(() => {
        if (view === 'week') {
            const start = mondayOf(anchor)
            return { start, end: addDays(start, 6) }
        }
        if (view === 'month') {
            const grid = monthGridDays(anchor)
            return { start: grid[0], end: grid[grid.length - 1] }
        }
        return { start: firstOfMonth(anchor), end: lastOfMonth(addMonths(firstOfMonth(anchor), 5)) }
    }, [view, anchor])

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
        // Refetch silently on range change — the grid keeps the previous items
        // until the new ones arrive, so navigation never flashes a spinner.
        let active = true
        listPlanEntries(range.start, range.end)
            .then((rows) => active && setEntries(rows))
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end])

    function goToView(next: PlannerView) {
        setPicker(null)
        setView(next)
    }

    function step(dir: -1 | 1) {
        if (view === 'week') setAnchor((a) => addDays(mondayOf(a), dir * 7))
        else if (view === 'month') setAnchor((a) => addMonths(a, dir))
        else setAnchor((a) => addMonths(a, dir * 6))
    }

    async function handleAdd(date: string, kind: FitnessPlanKind, itemId: string) {
        const entry = await addPlanEntry(date, kind, itemId)
        setEntries((prev) => [...prev, entry])
    }

    async function handleRemove(id: string) {
        setEntries((prev) => prev.filter((e) => e._id !== id))
        await deletePlanEntry(id)
    }

    // Month totals count only the month itself, not the grid's spill-over days.
    const totalsEntries =
        view === 'month' ? entries.filter((e) => inSameMonth(e.date, anchor)) : entries
    const totals = tally(totalsEntries)
    const libraryEmpty = workouts.length === 0 && sessions.length === 0

    const rangeLabel =
        view === 'week'
            ? formatWeekRange(range.start, range.end)
            : view === 'month'
              ? formatMonthYear(anchor)
              : sixMonthLabel(anchor)

    const resetLabel = view === 'week' ? 'This week' : view === 'month' ? 'This month' : 'Today'

    return (
        <div className="flex flex-col gap-6">
            {/* View switch + navigation + totals */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    <ViewSwitch view={view} onChange={goToView} />
                    <div className="flex items-center gap-2">
                        <IconButton
                            label="Previous"
                            icon="fa-solid fa-chevron-left"
                            onClick={() => step(-1)}
                        />
                        <div className="min-w-[10rem] text-center text-sm font-semibold text-neutral-900">
                            {rangeLabel}
                        </div>
                        <IconButton
                            label="Next"
                            icon="fa-solid fa-chevron-right"
                            onClick={() => step(1)}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAnchor(today)}
                            className="ml-1"
                        >
                            {resetLabel}
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {!libraryEmpty && view !== '6month' && (
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
                    <WeekTotals tally={totals} />
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
                    description="Build some workouts or conditioning sessions first, then drop them into the plan."
                />
            ) : view === 'week' ? (
                <WeekView
                    weekStart={range.start}
                    today={today}
                    editing={editing}
                    entries={entries}
                    onAdd={(date, kind) => setPicker({ date, kind })}
                    onRemove={handleRemove}
                />
            ) : view === 'month' ? (
                <MonthView
                    anchor={anchor}
                    today={today}
                    entries={entries}
                    onOpenDay={(date) => setPicker({ date, kind: null })}
                />
            ) : (
                <SixMonthView
                    anchor={anchor}
                    today={today}
                    entries={entries}
                    onOpenMonth={(monthAnchor) => {
                        setAnchor(monthAnchor)
                        setView('month')
                    }}
                />
            )}

            <ItemPicker
                target={picker}
                editable={editing}
                workouts={workouts}
                sessions={sessions}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onRemove={handleRemove}
            />
        </div>
    )
}

// ─── View switch ──────────────────────────────────────────────────────────────

function ViewSwitch({
    view,
    onChange,
}: {
    view: PlannerView
    onChange: (v: PlannerView) => void
}) {
    return (
        <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
            {VIEW_META.map(({ key, label }) => {
                const active = key === view
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                            active
                                ? 'bg-white text-neutral-900 shadow-sm'
                                : 'text-neutral-500 hover:text-neutral-900'
                        }`}
                    >
                        {label}
                    </button>
                )
            })}
        </div>
    )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
    weekStart,
    today,
    editing,
    entries,
    onAdd,
    onRemove,
}: {
    weekStart: string
    today: string
    editing: boolean
    entries: FitnessPlanEntry[]
    onAdd: (date: string, kind: FitnessPlanKind) => void
    onRemove: (id: string) => void
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {days.map((date) => (
                <DayColumn
                    key={date}
                    date={date}
                    isToday={date === today}
                    editable={editing}
                    entries={entries.filter((e) => e.date === date)}
                    onAdd={(kind) => onAdd(date, kind)}
                    onRemove={onRemove}
                />
            ))}
        </div>
    )
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({
    anchor,
    today,
    entries,
    onOpenDay,
}: {
    anchor: string
    today: string
    entries: FitnessPlanEntry[]
    onOpenDay: (date: string) => void
}) {
    const days = monthGridDays(anchor)
    return (
        <Card as="div" flush hover={false} className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-neutral-100 bg-neutral-50">
                {WEEKDAY_HEADERS.map((wd) => (
                    <div
                        key={wd}
                        className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-400"
                    >
                        {wd}
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-7">
                {days.map((date) => (
                    <MonthCell
                        key={date}
                        date={date}
                        inMonth={inSameMonth(date, anchor)}
                        isToday={date === today}
                        entries={entries.filter((e) => e.date === date)}
                        onClick={() => onOpenDay(date)}
                    />
                ))}
            </div>
        </Card>
    )
}

function MonthCell({
    date,
    inMonth,
    isToday,
    entries,
    onClick,
}: {
    date: string
    inMonth: boolean
    isToday: boolean
    entries: FitnessPlanEntry[]
    onClick: () => void
}) {
    const { day } = parseDateKey(date)
    const shown = entries.slice(0, 3)
    const extra = entries.length - shown.length

    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex min-h-[6.5rem] flex-col gap-1 border-b border-r border-neutral-100 p-2 text-left transition-colors hover:bg-neutral-50 ${
                inMonth ? '' : 'bg-neutral-50/50'
            }`}
        >
            <span
                className={`inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${
                    isToday
                        ? 'bg-coral-500 text-white'
                        : inMonth
                          ? 'text-neutral-700'
                          : 'text-neutral-300'
                }`}
            >
                {day}
            </span>
            <div className="flex flex-col gap-1">
                {shown.map((e) => (
                    <MonthChip key={e._id} entry={e} />
                ))}
                {extra > 0 && (
                    <span className="pl-1 text-[10px] font-medium text-neutral-400">
                        +{extra} more
                    </span>
                )}
            </div>
        </button>
    )
}

function MonthChip({ entry }: { entry: FitnessPlanEntry }) {
    const meta = KIND_META[entry.kind]
    const name = entry.kind === 'workout' ? entry.workout?.name : entry.session?.name
    return (
        <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_TONE[entry.kind].chip}`}
        >
            <i className={`${meta.icon} shrink-0 text-[9px]`} aria-hidden="true" />
            <span className="truncate">{name ?? meta.noun}</span>
        </span>
    )
}

// ─── Six-month view ───────────────────────────────────────────────────────────

function SixMonthView({
    anchor,
    today,
    entries,
    onOpenMonth,
}: {
    anchor: string
    today: string
    entries: FitnessPlanEntry[]
    onOpenMonth: (monthAnchor: string) => void
}) {
    const months = Array.from({ length: 6 }, (_, i) => addMonths(firstOfMonth(anchor), i))
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {months.map((m) => (
                <MiniMonth
                    key={m}
                    month={m}
                    today={today}
                    entries={entries.filter((e) => inSameMonth(e.date, m))}
                    onClick={() => onOpenMonth(m)}
                />
            ))}
        </div>
    )
}

function MiniMonth({
    month,
    today,
    entries,
    onClick,
}: {
    month: string
    today: string
    entries: FitnessPlanEntry[]
    onClick: () => void
}) {
    const days = monthGridDays(month)
    const counts = useMemo(() => {
        const m = new Map<string, number>()
        for (const e of entries) m.set(e.date, (m.get(e.date) ?? 0) + 1)
        return m
    }, [entries])
    const t = tally(entries)

    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
        >
            <div className="flex items-baseline justify-between">
                <p className="text-sm font-bold text-neutral-900">{formatMonthYear(month)}</p>
                <span className="text-[11px] text-neutral-400">
                    {t.workouts + t.sessions} planned
                </span>
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days.map((date) => {
                    const outside = !inSameMonth(date, month)
                    const count = counts.get(date) ?? 0
                    return (
                        <span
                            key={date}
                            className={`aspect-square rounded-[3px] ${dotClass(count, outside)} ${
                                date === today ? 'ring-1 ring-coral-500 ring-offset-1' : ''
                            }`}
                        />
                    )
                })}
            </div>

            <div className="flex items-center gap-3 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                <span className="tabular-nums">{t.workouts} workouts</span>
                <span className="text-neutral-300">·</span>
                <span className="tabular-nums">{t.sessions} sessions</span>
                <span className="text-neutral-300">·</span>
                <span className="tabular-nums">{t.minutes} min</span>
            </div>
        </button>
    )
}

/** Heat colour for a mini-calendar day by how many items are planned. */
function dotClass(count: number, outside: boolean): string {
    if (outside) return 'bg-transparent'
    if (count === 0) return 'bg-neutral-100'
    if (count === 1) return 'bg-coral-200'
    if (count === 2) return 'bg-coral-300'
    return 'bg-coral-500'
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
    const tone = KIND_TONE[kind]

    // In view mode an empty slot is just noise — collapse it so the plan reads clean.
    if (!editable && entries.length === 0) return null

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
                <span
                    className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${tone.label}`}
                >
                    <i className={`${meta.icon} text-[10px] ${tone.icon}`} aria-hidden="true" />
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
    const tone = KIND_TONE[entry.kind]
    return (
        <li className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${tone.row}`}>
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
 * The day drawer. Opened from a week column it targets one kind and jumps
 * straight to that add list; opened from the month grid it targets the whole
 * day, with a Workout/Conditioning toggle. In view mode it's a read-only
 * summary of what's planned; in edit mode items can be added and removed here.
 */
function ItemPicker({
    target,
    editable,
    workouts,
    sessions,
    entries,
    onClose,
    onAdd,
    onRemove,
}: {
    target: { date: string; kind: FitnessPlanKind | null } | null
    editable: boolean
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
    // Which library the add list shows. Fixed when the target names a kind
    // (week column); a toggle when it doesn't (month day).
    const [activeKind, setActiveKind] = useState<FitnessPlanKind>('workout')
    useEffect(() => {
        if (target) {
            setView(target)
            setQuery('')
            setActiveKind(target.kind ?? 'workout')
        }
    }, [target])

    const locked = view?.kind != null
    const kind = activeKind
    const meta = KIND_META[kind]

    const title = !editable
        ? 'Day plan'
        : locked
          ? `Add ${KIND_META[view!.kind as FitnessPlanKind].label.toLowerCase()}`
          : 'Edit day'

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
            title={title}
            badge={view ? shortDayLabel(view.date) : undefined}
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div className="flex flex-col gap-4">
                {entries.length > 0 ? (
                    <section className="flex flex-col gap-1.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            On this day
                        </p>
                        <ul className="flex flex-col gap-1">
                            {entries.map((e) => (
                                <PlannedRow
                                    key={e._id}
                                    entry={e}
                                    onRemove={editable ? () => onRemove(e._id) : undefined}
                                />
                            ))}
                        </ul>
                    </section>
                ) : (
                    !editable && (
                        <p className="py-6 text-center text-sm text-neutral-400">
                            Nothing planned — a rest day.
                        </p>
                    )
                )}

                {!editable ? null : (
                  <>
                {!locked && (
                    <div className="inline-flex self-start rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
                        {FITNESS_PLAN_KINDS.map((k) => {
                            const active = k === activeKind
                            return (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => setActiveKind(k)}
                                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                                        active
                                            ? 'bg-white text-neutral-900 shadow-sm'
                                            : 'text-neutral-500 hover:text-neutral-900'
                                    }`}
                                >
                                    {KIND_META[k].label}
                                </button>
                            )
                        })}
                    </div>
                )}

                <Input
                    placeholder={`Search ${meta.noun}s…`}
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
                  </>
                )}
            </div>
        </Drawer>
    )
}
