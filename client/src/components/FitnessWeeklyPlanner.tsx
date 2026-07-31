import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import EmptyState from './EmptyState'
import Drawer from './Drawer'
import DropdownMenu, { type MenuEntry } from './DropdownMenu'
import ConfirmModal from './ConfirmModal'
import { listWorkouts } from '../services/workouts'
import { listSessions } from '../services/conditioning'
import { listRecovery } from '../services/recovery'
import { listExercises } from '../services/exercises'
import {
    listPlanEntries,
    addPlanEntry,
    updatePlanEntry,
    deletePlanEntry,
    copyPlanWeek,
} from '../services/fitnessPlan'
import { FITNESS_PLAN_KINDS, FITNESS_PLAN_PARTS } from '../types'
import type {
    Workout,
    WorkoutExercise,
    Exercise,
    ConditioningSession,
    ConditioningCategory,
    Recovery,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanPart,
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
    recovery: { label: 'Recovery', noun: 'item', icon: 'fa-solid fa-spa' },
}

// The category choices offered when copying a week — each maps to the plan
// kinds it overwrites in the target week. "Everything" clones all three.
const COPY_OPTIONS: { label: string; icon: string; kinds: FitnessPlanKind[] }[] = [
    { label: 'Strength only', icon: 'fa-solid fa-dumbbell', kinds: ['workout'] },
    { label: 'Conditioning only', icon: 'fa-solid fa-heart-pulse', kinds: ['conditioning'] },
    { label: 'Recovery only', icon: 'fa-solid fa-spa', kinds: ['recovery'] },
    { label: 'Everything', icon: 'fa-solid fa-layer-group', kinds: [...FITNESS_PLAN_KINDS] },
]

/** A short lower-case description of a set of kinds, e.g. "strength" or "everything". */
function kindsLabel(kinds: FitnessPlanKind[]): string {
    if (kinds.length >= FITNESS_PLAN_KINDS.length) return 'everything'
    return kinds.map((k) => KIND_META[k].label.toLowerCase()).join(' + ')
}

// Each plan kind carries its own colour so the three categories read apart at a
// glance — coral for strength, sky for conditioning, emerald for recovery
// (matching the chips used elsewhere in Fitness).
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
    recovery: {
        label: 'text-emerald-600',
        icon: 'text-emerald-500',
        row: 'border-l-2 border-emerald-300 bg-emerald-50/60',
        chip: 'bg-emerald-50 text-emerald-700',
    },
}

// The three slots each day splits into, with a label and icon for the header.
const PART_META: Record<FitnessPlanPart, { label: string; icon: string }> = {
    morning: { label: 'Morning', icon: 'fa-solid fa-sun' },
    afternoon: { label: 'Afternoon', icon: 'fa-solid fa-cloud-sun' },
    evening: { label: 'Evening', icon: 'fa-solid fa-moon' },
}

// Solid fills for the mini-calendar slot bands, one per kind (empty slots stay
// neutral). Matches the coral / sky / emerald coding used by the chips.
const KIND_BAND: Record<FitnessPlanKind, string> = {
    workout: 'bg-coral-400',
    conditioning: 'bg-sky-400',
    recovery: 'bg-emerald-400',
}

/** The slot an entry sits in, defaulting legacy entries (no `part`) to morning. */
function partOf(entry: FitnessPlanEntry): FitnessPlanPart {
    return entry.part ?? 'morning'
}

/** The display name of a planned item, whichever library it comes from. */
function planItemName(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?.name
    if (entry.kind === 'conditioning') return entry.session?.name
    return entry.recovery?.name
}

/** Compact "3 × 8-12" / "3 sets" / "8-12 reps" label, or '' when neither is set. */
function formatSetsReps(e: { sets?: number; reps?: string }): string {
    const sets = e.sets && e.sets > 0 ? e.sets : undefined
    const reps = e.reps?.trim() || undefined
    if (sets && reps) return `${sets} × ${reps}`
    if (sets) return `${sets} ${sets === 1 ? 'set' : 'sets'}`
    if (reps) return `${reps} reps`
    return ''
}

// Rough time estimate for a workout — an 8-min warm-up plus working sets
// (~2 min each), or ~6 min per exercise where sets aren't set. Mirrors the
// Strength library's estimate so the same workout reads the same everywhere.
const WARMUP_MIN = 8
const PER_EXERCISE_MIN = 6
const PER_SET_MIN = 2
function estimateWorkoutMinutes(exercises: WorkoutExercise[]): number {
    if (exercises.length === 0) return 0
    const work = exercises.reduce(
        (sum, e) => sum + (e.sets && e.sets > 0 ? e.sets * PER_SET_MIN : PER_EXERCISE_MIN),
        0
    )
    return WARMUP_MIN + work
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
    recovery: number
    /** Total planned conditioning minutes across the range. */
    minutes: number
}

function tally(entries: FitnessPlanEntry[]): WeekTally {
    return entries.reduce<WeekTally>(
        (acc, e) => {
            if (e.kind === 'workout') acc.workouts += 1
            else if (e.kind === 'conditioning') {
                acc.sessions += 1
                acc.minutes += e.session?.duration ?? 0
            } else acc.recovery += 1
            return acc
        },
        { workouts: 0, sessions: 0, recovery: 0, minutes: 0 }
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
    const [recovery, setRecovery] = useState<Recovery[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [libLoading, setLibLoading] = useState(true)
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [loading, setLoading] = useState(true)
    // The picker always targets one day + slot; the type (strength / conditioning /
    // recovery) and the slot are then chosen inside the drawer.
    const [picker, setPicker] = useState<{ date: string; part: FitnessPlanPart } | null>(null)
    // A planned item opened for a read-only look at its full details.
    const [detail, setDetail] = useState<FitnessPlanEntry | null>(null)
    // The planner opens read-only; Edit reveals the add/remove controls.
    const [editing, setEditing] = useState(false)
    // A copied week held for pasting elsewhere: the source Monday plus which
    // categories were copied. Only those categories are overwritten on paste.
    const [clipboard, setClipboard] = useState<{ from: string; kinds: FitnessPlanKind[] } | null>(
        null
    )

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

    // The libraries — loaded once, for the picker, the "is it empty" check and
    // the detail drawer (exercises resolve a workout's exercise names).
    useEffect(() => {
        Promise.all([listWorkouts(), listSessions(), listRecovery(), listExercises()])
            .then(([wk, se, re, ex]) => {
                setWorkouts(wk)
                setSessions(se)
                setRecovery(re)
                setExercises(ex)
            })
            .finally(() => setLibLoading(false))
    }, [])

    // Resolve a workout slot's exercise id → the library exercise, for the detail drawer.
    const exercisesById = useMemo(() => {
        const m = new Map<string, Exercise>()
        for (const ex of exercises) m.set(ex._id, ex)
        return m
    }, [exercises])

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

    async function handleAdd(
        date: string,
        kind: FitnessPlanKind,
        itemId: string,
        part: FitnessPlanPart
    ) {
        const entry = await addPlanEntry(date, kind, itemId, part)
        setEntries((prev) => [...prev, entry])
    }

    async function handleRemove(id: string) {
        setEntries((prev) => prev.filter((e) => e._id !== id))
        await deletePlanEntry(id)
    }

    // Copy the current week's selected categories to the clipboard for pasting.
    function handleCopyWeek(kinds: FitnessPlanKind[]) {
        setClipboard({ from: range.start, kinds })
    }

    // Paste the clipboard onto the current week — overwriting only the copied
    // categories — then refetch so the grid shows the pasted plan.
    async function handlePasteWeek() {
        if (!clipboard) return
        await copyPlanWeek(clipboard.from, range.start, clipboard.kinds)
        const rows = await listPlanEntries(range.start, range.end)
        setEntries(rows)
    }

    // Move a planned item to another slot of its own day (week-view drag-and-drop).
    // Optimistic: the row jumps immediately, then the server records the new slot.
    async function handleMove(id: string, part: FitnessPlanPart) {
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, part } : e)))
        await updatePlanEntry(id, part)
    }

    // Month totals count only the month itself, not the grid's spill-over days.
    const totalsEntries =
        view === 'month' ? entries.filter((e) => inSameMonth(e.date, anchor)) : entries
    const totals = tally(totalsEntries)
    const libraryEmpty = workouts.length === 0 && sessions.length === 0 && recovery.length === 0

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
                    {!libraryEmpty && view === 'week' && (
                        <WeekCopyControls
                            weekStart={range.start}
                            weekEnd={range.end}
                            clipboard={clipboard}
                            onCopy={handleCopyWeek}
                            onPaste={handlePasteWeek}
                            onClearClipboard={() => setClipboard(null)}
                        />
                    )}
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
                    onAdd={(date, part) => setPicker({ date, part })}
                    onOpen={setDetail}
                    onRemove={handleRemove}
                    onMove={handleMove}
                />
            ) : view === 'month' ? (
                <MonthView
                    anchor={anchor}
                    today={today}
                    entries={entries}
                    onOpenDay={(date) => setPicker({ date, part: 'morning' })}
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
                recovery={recovery}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onRemove={handleRemove}
            />

            <PlannedDetailDrawer
                entry={detail}
                exercisesById={exercisesById}
                onClose={() => setDetail(null)}
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

// ─── Copy / paste week ──────────────────────────────────────────────────────────

/**
 * Copy the current week's plan (by category) and paste it onto another week.
 * "Copy week" drops the chosen categories onto a clipboard; navigating to a
 * different week reveals "Paste", which overwrites only those categories there.
 */
function WeekCopyControls({
    weekStart,
    weekEnd,
    clipboard,
    onCopy,
    onPaste,
    onClearClipboard,
}: {
    weekStart: string
    weekEnd: string
    clipboard: { from: string; kinds: FitnessPlanKind[] } | null
    onCopy: (kinds: FitnessPlanKind[]) => void
    onPaste: () => void
    onClearClipboard: () => void
}) {
    const [confirming, setConfirming] = useState(false)
    // The clipboard's source week can't be pasted back onto itself.
    const sameWeek = clipboard?.from === weekStart

    const copyItems: MenuEntry[] = COPY_OPTIONS.map((o) => ({
        label: o.label,
        icon: o.icon,
        onClick: () => onCopy(o.kinds),
    }))

    return (
        <div className="flex items-center gap-2">
            <DropdownMenu
                align="right"
                trigger={
                    <Button variant="secondary" size="sm" icon="fa-solid fa-copy">
                        Copy week
                    </Button>
                }
                items={copyItems}
            />

            {clipboard && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="primary"
                        size="sm"
                        icon="fa-solid fa-paste"
                        disabled={sameWeek}
                        onClick={() => setConfirming(true)}
                        title={
                            sameWeek
                                ? 'This is the week you copied — move to another week to paste'
                                : undefined
                        }
                    >
                        Paste {kindsLabel(clipboard.kinds)}
                    </Button>
                    <IconButton
                        icon="fa-solid fa-xmark"
                        label="Clear copied week"
                        onClick={onClearClipboard}
                    />
                </div>
            )}

            <ConfirmModal
                open={confirming}
                title="Paste week plan?"
                confirmLabel="Paste"
                message={
                    clipboard && (
                        <p className="text-sm text-neutral-600">
                            Replace <span className="font-semibold">{kindsLabel(clipboard.kinds)}</span>{' '}
                            for{' '}
                            <span className="font-semibold">
                                {formatWeekRange(weekStart, weekEnd)}
                            </span>{' '}
                            with the plan copied from{' '}
                            <span className="font-semibold">
                                {formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                            </span>
                            ? Other categories on this week stay as they are.
                        </p>
                    )
                }
                onConfirm={onPaste}
                onClose={() => setConfirming(false)}
            />
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
    onOpen,
    onRemove,
    onMove,
}: {
    weekStart: string
    today: string
    editing: boolean
    entries: FitnessPlanEntry[]
    onAdd: (date: string, part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    onMove: (id: string, part: FitnessPlanPart) => void
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
                    onAdd={(part) => onAdd(date, part)}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    onMove={onMove}
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
    const name = planItemName(entry)
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
    // date → the entries planned in each slot, so every day cell can show its
    // morning / afternoon / evening bands and name the items on hover.
    const byDay = useMemo(() => {
        const m = new Map<string, Record<FitnessPlanPart, FitnessPlanEntry[]>>()
        for (const e of entries) {
            let day = m.get(e.date)
            if (!day) {
                day = { morning: [], afternoon: [], evening: [] }
                m.set(e.date, day)
            }
            day[partOf(e)].push(e)
        }
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
                    {t.workouts + t.sessions + t.recovery} planned
                </span>
            </div>

            <div className="grid grid-cols-7 gap-1">
                {days.map((date) => (
                    <MiniMonthDay
                        key={date}
                        outside={!inSameMonth(date, month)}
                        isToday={date === today}
                        slots={byDay.get(date)}
                    />
                ))}
            </div>

            <div className="flex items-center gap-3 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500">
                <span className="tabular-nums">{t.workouts} strength</span>
                <span className="text-neutral-300">·</span>
                <span className="tabular-nums">{t.sessions} cond.</span>
                <span className="text-neutral-300">·</span>
                <span className="tabular-nums">{t.recovery} recovery</span>
            </div>
        </button>
    )
}

/**
 * A single mini-calendar day, split into three stacked bands (morning /
 * afternoon / evening). Each band fills with its item's colour when something
 * is planned in that slot, and the whole day names its items on hover.
 */
function MiniMonthDay({
    outside,
    isToday,
    slots,
}: {
    outside: boolean
    isToday: boolean
    slots?: Record<FitnessPlanPart, FitnessPlanEntry[]>
}) {
    if (outside) return <span className="aspect-square" />

    const title = slots
        ? FITNESS_PLAN_PARTS.filter((p) => slots[p].length > 0)
              .map(
                  (p) =>
                      `${PART_META[p].label}: ${slots[p]
                          .map((e) => planItemName(e) ?? KIND_META[e.kind].noun)
                          .join(', ')}`
              )
              .join('\n')
        : ''

    return (
        <span
            title={title || undefined}
            className={`flex aspect-square flex-col gap-px overflow-hidden rounded-[3px] bg-neutral-100 ${
                isToday ? 'ring-1 ring-coral-500 ring-offset-1' : ''
            }`}
        >
            {FITNESS_PLAN_PARTS.map((part) => {
                const first = slots?.[part][0]
                return (
                    <span
                        key={part}
                        className={`flex-1 ${first ? KIND_BAND[first.kind] : ''}`}
                    />
                )
            })}
        </span>
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
            <Stat label="Strength" value={tally.workouts} />
            <div className="h-8 w-px bg-neutral-200" />
            <Stat label="Cond." value={tally.sessions} />
            <div className="h-8 w-px bg-neutral-200" />
            <Stat label="Recovery" value={tally.recovery} />
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
    onOpen,
    onRemove,
    onMove,
}: {
    date: string
    isToday: boolean
    editable: boolean
    entries: FitnessPlanEntry[]
    onAdd: (part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    onMove: (id: string, part: FitnessPlanPart) => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const t = tally(entries)
    const total = t.workouts + t.sessions + t.recovery
    const rest = total === 0

    // The entry being dragged within this day. Held per-column so a drag that
    // starts here can only be dropped on another slot of this same day — never
    // on another day's column, whose own state stays null.
    const [dragId, setDragId] = useState<string | null>(null)

    function handleDrop(part: FitnessPlanPart) {
        const dragged = dragId && entries.find((e) => e._id === dragId)
        if (dragged && partOf(dragged) !== part) onMove(dragged._id, part)
        setDragId(null)
    }

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
                {FITNESS_PLAN_PARTS.map((part) => (
                    <SlotSection
                        key={part}
                        part={part}
                        editable={editable}
                        entries={entries.filter((e) => partOf(e) === part)}
                        onAdd={() => onAdd(part)}
                        onOpen={onOpen}
                        onRemove={onRemove}
                        dragActive={dragId !== null}
                        onEntryDragStart={setDragId}
                        onEntryDragEnd={() => setDragId(null)}
                        onDropEntry={() => handleDrop(part)}
                    />
                ))}
            </div>

            <div className="mt-auto flex items-center gap-3 border-t border-neutral-100 pt-3 text-[11px] text-neutral-500">
                {rest ? (
                    <span className="text-neutral-400">Rest day</span>
                ) : (
                    <>
                        <span className="tabular-nums">
                            {total} {total === 1 ? 'item' : 'items'}
                        </span>
                        {t.minutes > 0 && (
                            <>
                                <span className="text-neutral-300">·</span>
                                <span className="tabular-nums">{t.minutes} min cond.</span>
                            </>
                        )}
                    </>
                )}
            </div>
        </Card>
    )
}

/**
 * One slot (morning / afternoon / evening) of a day column. Holds a flat list
 * of items of any category, each carrying its own colour. In view mode an empty
 * slot collapses; in edit mode it shows an add control that opens the picker
 * pre-targeted to this slot.
 */
function SlotSection({
    part,
    editable,
    entries,
    onAdd,
    onOpen,
    onRemove,
    dragActive,
    onEntryDragStart,
    onEntryDragEnd,
    onDropEntry,
}: {
    part: FitnessPlanPart
    editable: boolean
    entries: FitnessPlanEntry[]
    onAdd: () => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    /** True while an item of this day is being dragged, so slots show as drop targets. */
    dragActive: boolean
    onEntryDragStart: (id: string) => void
    onEntryDragEnd: () => void
    onDropEntry: () => void
}) {
    const meta = PART_META[part]
    // Highlighted while a dragged item hovers over this slot.
    const [isOver, setIsOver] = useState(false)

    if (!editable && entries.length === 0) return null

    // A slot only acts as a drop target while a row from this day is in flight.
    const dropProps = dragActive
        ? {
              onDragOver: (e: DragEvent) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (!isOver) setIsOver(true)
              },
              onDragLeave: (e: DragEvent) => {
                  // Ignore bubbling from children; only clear when leaving the slot.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false)
              },
              onDrop: (e: DragEvent) => {
                  e.preventDefault()
                  setIsOver(false)
                  onDropEntry()
              },
          }
        : {}

    return (
        <div
            {...dropProps}
            className={`flex flex-col gap-1.5 rounded-lg transition-colors ${
                isOver ? 'bg-coral-50 ring-1 ring-inset ring-coral-300' : ''
            }`}
        >
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    <i className={`${meta.icon} text-[10px] text-neutral-400`} aria-hidden="true" />
                    {meta.label}
                </span>
                {editable && (
                    <button
                        type="button"
                        aria-label={`Add to ${meta.label.toLowerCase()}`}
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
                            onOpen={() => onOpen(e)}
                            onRemove={editable ? () => onRemove(e._id) : undefined}
                            draggable={editable}
                            onDragStart={() => onEntryDragStart(e._id)}
                            onDragEnd={onEntryDragEnd}
                        />
                    ))}
                </ul>
            ) : (
                <button
                    type="button"
                    onClick={onAdd}
                    className={`rounded-lg border border-dashed py-1.5 text-center text-[11px] transition-colors ${
                        dragActive
                            ? 'border-coral-300 text-coral-400'
                            : 'border-neutral-200 text-neutral-300 hover:border-neutral-300 hover:text-neutral-500'
                    }`}
                >
                    {dragActive ? 'Move here' : 'Add'}
                </button>
            )}
        </div>
    )
}

/** A small pill naming an item's category, so mixed slots stay legible. */
function KindChip({ kind }: { kind: FitnessPlanKind }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${KIND_TONE[kind].chip}`}
        >
            {KIND_META[kind].label}
        </span>
    )
}

function PlannedRow({
    entry,
    onOpen,
    onRemove,
    draggable = false,
    onDragStart,
    onDragEnd,
}: {
    entry: FitnessPlanEntry
    onOpen?: () => void
    onRemove?: () => void
    /** When true the row can be dragged to another slot of its day (week view). */
    draggable?: boolean
    onDragStart?: () => void
    onDragEnd?: () => void
}) {
    const name = planItemName(entry)
    const tone = KIND_TONE[entry.kind]
    const [dragging, setDragging] = useState(false)

    const body = (
        <>
            <p className="truncate text-[13px] font-semibold text-neutral-700">{name}</p>
            {entry.kind === 'workout' && entry.workout ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                    <KindChip kind="workout" />
                    <span className="text-[11px] tabular-nums text-neutral-400">
                        {entry.workout.exercises.length}{' '}
                        {entry.workout.exercises.length === 1 ? 'exercise' : 'exercises'}
                    </span>
                </div>
            ) : entry.kind === 'conditioning' && entry.session ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                    <CategoryChip category={entry.session.category} />
                    <span className="text-[11px] tabular-nums text-neutral-400">
                        {entry.session.duration} min
                    </span>
                </div>
            ) : entry.recovery ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                    <KindChip kind="recovery" />
                    {entry.recovery.duration > 0 && (
                        <span className="text-[11px] tabular-nums text-neutral-400">
                            {entry.recovery.duration} min
                        </span>
                    )}
                </div>
            ) : null}
        </>
    )

    return (
        <li
            draggable={draggable}
            onDragStart={
                draggable
                    ? (e: DragEvent) => {
                          // A payload is required for the drag to start in Firefox.
                          e.dataTransfer.setData('text/plain', entry._id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDragging(true)
                          onDragStart?.()
                      }
                    : undefined
            }
            onDragEnd={
                draggable
                    ? () => {
                          setDragging(false)
                          onDragEnd?.()
                      }
                    : undefined
            }
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${tone.row} ${
                draggable ? 'cursor-grab active:cursor-grabbing' : ''
            } ${dragging ? 'opacity-40' : ''}`}
        >
            {draggable && (
                <i
                    className="fa-solid fa-grip-vertical shrink-0 text-[11px] text-neutral-300"
                    aria-hidden="true"
                />
            )}
            {onOpen ? (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={`View ${name ?? 'item'}`}
                    className="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-400"
                >
                    {body}
                </button>
            ) : (
                <div className="min-w-0 flex-1">{body}</div>
            )}
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
 * The day drawer. It targets one day + slot; inside, a Slot toggle and a Type
 * toggle (Strength / Conditioning / Recovery) choose where an added item lands
 * and which library the add list draws from. In view mode it's a read-only
 * summary grouped by slot; in edit mode items can be added and removed here.
 */
function ItemPicker({
    target,
    editable,
    workouts,
    sessions,
    recovery,
    entries,
    onClose,
    onAdd,
    onRemove,
}: {
    target: { date: string; part: FitnessPlanPart } | null
    editable: boolean
    workouts: Workout[]
    sessions: ConditioningSession[]
    recovery: Recovery[]
    entries: FitnessPlanEntry[]
    onClose: () => void
    onAdd: (
        date: string,
        kind: FitnessPlanKind,
        itemId: string,
        part: FitnessPlanPart
    ) => Promise<void>
    onRemove: (id: string) => void
}) {
    // Retain the last target so the drawer keeps its content while sliding shut.
    const [view, setView] = useState(target)
    const [query, setQuery] = useState('')
    // Which library the add list shows, and which slot an added item lands in.
    const [activeKind, setActiveKind] = useState<FitnessPlanKind>('workout')
    const [activePart, setActivePart] = useState<FitnessPlanPart>('morning')
    useEffect(() => {
        if (target) {
            setView(target)
            setQuery('')
            setActiveKind('workout')
            setActivePart(target.part)
        }
    }, [target])

    const kind = activeKind
    const meta = KIND_META[kind]
    const title = editable ? 'Add to day' : 'Day plan'

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

    const recoveryResults = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q
            ? recovery.filter(
                  (r) =>
                      r.name.toLowerCase().includes(q) ||
                      (r.purpose ?? '').toLowerCase().includes(q)
              )
            : recovery
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [recovery, query])

    // The day's items, grouped by slot for the read-only summary.
    const slots = FITNESS_PLAN_PARTS.map((part) => ({
        part,
        items: entries.filter((e) => partOf(e) === part),
    })).filter((s) => s.items.length > 0)

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
                {slots.length > 0 ? (
                    <section className="flex flex-col gap-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            On this day
                        </p>
                        {slots.map(({ part, items }) => (
                            <div key={part} className="flex flex-col gap-1.5">
                                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                                    <i
                                        className={`${PART_META[part].icon} text-[10px] text-neutral-400`}
                                        aria-hidden="true"
                                    />
                                    {PART_META[part].label}
                                </span>
                                <ul className="flex flex-col gap-1">
                                    {items.map((e) => (
                                        <PlannedRow
                                            key={e._id}
                                            entry={e}
                                            onRemove={editable ? () => onRemove(e._id) : undefined}
                                        />
                                    ))}
                                </ul>
                            </div>
                        ))}
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
                        <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                Slot
                            </p>
                            <div className="inline-flex self-start rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
                                {FITNESS_PLAN_PARTS.map((p) => {
                                    const active = p === activePart
                                    return (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => setActivePart(p)}
                                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                                active
                                                    ? 'bg-white text-neutral-900 shadow-sm'
                                                    : 'text-neutral-500 hover:text-neutral-900'
                                            }`}
                                        >
                                            {PART_META[p].label}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                Type
                            </p>
                            <div className="inline-flex self-start rounded-full border border-neutral-200 bg-neutral-50 p-0.5">
                                {FITNESS_PLAN_KINDS.map((k) => {
                                    const active = k === activeKind
                                    return (
                                        <button
                                            key={k}
                                            type="button"
                                            onClick={() => setActiveKind(k)}
                                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
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
                        </div>

                        <Input
                            placeholder={`Search ${meta.noun}s…`}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />

                        {kind === 'workout' ? (
                            workoutResults.length === 0 ? (
                                <p className="py-6 text-center text-sm text-neutral-400">
                                    No workouts found.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {workoutResults.map((w) => (
                                        <li key={w._id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    view &&
                                                    onAdd(view.date, 'workout', w._id, activePart)
                                                }
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
                                                        {w.exercises.length === 1
                                                            ? 'exercise'
                                                            : 'exercises'}
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
                        ) : kind === 'conditioning' ? (
                            sessionResults.length === 0 ? (
                                <p className="py-6 text-center text-sm text-neutral-400">
                                    No sessions found.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {sessionResults.map((s) => (
                                        <li key={s._id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    view &&
                                                    onAdd(view.date, 'conditioning', s._id, activePart)
                                                }
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
                            )
                        ) : recoveryResults.length === 0 ? (
                            <p className="py-6 text-center text-sm text-neutral-400">
                                No recovery items found.
                            </p>
                        ) : (
                            <ul className="flex flex-col gap-1.5">
                                {recoveryResults.map((r) => (
                                    <li key={r._id}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                view && onAdd(view.date, 'recovery', r._id, activePart)
                                            }
                                            className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                                        >
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-neutral-800">
                                                    {r.name}
                                                </p>
                                                {r.duration > 0 && (
                                                    <p className="text-xs tabular-nums text-neutral-400">
                                                        {r.duration} min
                                                    </p>
                                                )}
                                            </div>
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

// ─── Planned item detail drawer ────────────────────────────────────────────────

/**
 * A read-only look at a planned item, opened by clicking its row in the week
 * view. Renders the full details of whichever library it came from — a
 * workout's exercises, a conditioning session's parts, or a recovery item's
 * notes. All detail data rides along on the populated plan entry; only a
 * workout's exercise *names* need the exercises library (via `exercisesById`).
 */
function PlannedDetailDrawer({
    entry,
    exercisesById,
    onClose,
}: {
    entry: FitnessPlanEntry | null
    exercisesById: Map<string, Exercise>
    onClose: () => void
}) {
    // Retain the last entry while the drawer animates closed.
    const [view, setView] = useState<FitnessPlanEntry | null>(entry)
    useEffect(() => {
        if (entry) setView(entry)
    }, [entry])

    const e = view
    const title = e ? planItemName(e) ?? KIND_META[e.kind].label : 'Details'

    return (
        <Drawer
            open={!!entry}
            onClose={onClose}
            size="xl"
            title={title}
            badge={e ? shortDayLabel(e.date) : undefined}
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            {e &&
                (e.kind === 'workout' && e.workout ? (
                    <WorkoutDetail workout={e.workout} exercisesById={exercisesById} />
                ) : e.kind === 'conditioning' && e.session ? (
                    <SessionDetail session={e.session} />
                ) : e.recovery ? (
                    <RecoveryDetail recovery={e.recovery} />
                ) : null)}
        </Drawer>
    )
}

function DetailChip({ icon, children }: { icon: string; children: ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
            <i className={`${icon} text-neutral-400`} aria-hidden="true" />
            {children}
        </span>
    )
}

function DetailSection({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            {children}
        </section>
    )
}

function WorkoutDetail({
    workout,
    exercisesById,
}: {
    workout: Workout
    exercisesById: Map<string, Exercise>
}) {
    // Pair each workout slot with its resolved library exercise, dropping any
    // that were since deleted from the library.
    const rows = workout.exercises
        .map((item) => ({ item, ex: exercisesById.get(item.exercise) }))
        .filter((r): r is { item: WorkoutExercise; ex: Exercise } => !!r.ex)
    const est = estimateWorkoutMinutes(workout.exercises)

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
                <KindChip kind="workout" />
                <DetailChip icon="fa-solid fa-dumbbell">
                    {rows.length} {rows.length === 1 ? 'exercise' : 'exercises'}
                </DetailChip>
                {rows.length > 0 && <DetailChip icon="fa-regular fa-clock">~{est} min</DetailChip>}
            </div>

            {workout.description && (
                <p className="whitespace-pre-wrap text-sm text-neutral-600">{workout.description}</p>
            )}

            <DetailSection label="Exercises">
                {rows.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-xs text-neutral-400">
                        No exercises in this workout yet.
                    </p>
                ) : (
                    <ol className="flex flex-col gap-3">
                        {rows.map(({ item, ex }, i) => (
                            <li key={`${ex._id}-${i}`} className="flex gap-3 text-sm">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <div className="min-w-0 pt-0.5">
                                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                        <p className="font-semibold text-neutral-900">{ex.name}</p>
                                        {formatSetsReps(item) && (
                                            <span className="text-xs font-medium text-coral-600">
                                                {formatSetsReps(item)}
                                            </span>
                                        )}
                                    </div>
                                    {ex.description && (
                                        <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                            {ex.description}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </DetailSection>
        </div>
    )
}

function SessionDetail({ session }: { session: ConditioningSession }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <CategoryChip category={session.category} />
                <span className="text-sm text-neutral-500">{session.duration} min</span>
            </div>

            {session.purpose && (
                <DetailSection label="Purpose">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{session.purpose}</p>
                </DetailSection>
            )}

            {session.parts.length > 0 && (
                <DetailSection label="Session parts">
                    <ol className="flex flex-col gap-3">
                        {session.parts.map((part, i) => (
                            <li key={i} className="flex gap-3 text-sm">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <div className="min-w-0 pt-0.5">
                                    <p className="font-semibold text-neutral-900">{part.name}</p>
                                    {part.detail && (
                                        <p className="mt-0.5 whitespace-pre-wrap text-neutral-600">
                                            {part.detail}
                                        </p>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ol>
                </DetailSection>
            )}

            {session.howToUse && (
                <DetailSection label="How to use">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{session.howToUse}</p>
                </DetailSection>
            )}
        </div>
    )
}

function RecoveryDetail({ recovery }: { recovery: Recovery }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <KindChip kind="recovery" />
                {recovery.duration > 0 && (
                    <span className="text-sm text-neutral-500">{recovery.duration} min</span>
                )}
            </div>

            {recovery.purpose && (
                <DetailSection label="Purpose">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{recovery.purpose}</p>
                </DetailSection>
            )}

            {recovery.notes && (
                <DetailSection label="Notes">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{recovery.notes}</p>
                </DetailSection>
            )}
        </div>
    )
}
