import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Card } from './Card'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import EmptyState from './EmptyState'
import Drawer from './Drawer'
import Checkbox from './Checkbox'
import ConfirmModal from './ConfirmModal'
import Modal from './Modal'
import ConditioningSessionDetail from './ConditioningSessionDetail'
import { listWorkouts } from '../services/workouts'
import { listSessions } from '../services/conditioning'
import { listRecovery } from '../services/recovery'
import { listMobility } from '../services/mobility'
import { listExercises } from '../services/exercises'
import {
    createLog as createWorkoutLog,
    listLogs as listWorkoutLogs,
    type WorkoutLogInput,
} from '../services/workoutLogs'
import WorkoutLogWeightsDrawer from './WorkoutLogWeightsDrawer'
import {
    createLog as createConditioningLog,
    listLogs as listConditioningLogs,
} from '../services/conditioningLogs'
import {
    createLog as createMobilityLog,
    listLogs as listMobilityLogs,
} from '../services/mobilityLogs'
import {
    createLog as createRecoveryLog,
    listLogs as listRecoveryLogs,
} from '../services/recoveryLogs'
import { useToast } from '../context/ToastContext'
import { listEvents } from '../services/events'
import {
    listPlanEntries,
    addPlanEntry,
    updatePlanEntry,
    reorderPlanSlot,
    deletePlanEntry,
    copyPlanWeek,
    clearPlanRange,
    listPlanNotes,
    savePlanNote,
    deletePlanNote,
    restorePlanWeek,
    type PlanWeekSnapshot,
} from '../services/fitnessPlan'
import { FITNESS_PLAN_KINDS, FITNESS_PLAN_PARTS, FITNESS_FLAG_COLORS } from '../types'
import type {
    Workout,
    WorkoutExercise,
    Exercise,
    ConditioningSession,
    ConditioningCategory,
    Recovery,
    Mobility,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanPart,
    FitnessPlanNote,
    FitnessNoteScope,
    FitnessFlagColor,
    RoundProgress,
    Event,
} from '../types'
import {
    todayKey,
    addDays,
    parseDateKey,
    formatWeekRange,
    WEEKDAYS_LONG,
    MONTHS,
    eventCoversSlot,
    eventCoversAllDay,
} from '../lib/calendar'
import { findOverloads, findFreeSlot, type Overload } from '../lib/overload'

// ─── Kind presentation ────────────────────────────────────────────────────────

const KIND_META: Record<FitnessPlanKind, { label: string; noun: string; icon: string }> = {
    workout: { label: 'Strength', noun: 'workout', icon: 'fa-solid fa-dumbbell' },
    conditioning: { label: 'Conditioning', noun: 'session', icon: 'fa-solid fa-heart-pulse' },
    mobility: { label: 'Mobility', noun: 'routine', icon: 'fa-solid fa-person-walking' },
    recovery: { label: 'Recovery', noun: 'item', icon: 'fa-solid fa-spa' },
}

/** A short lower-case description of a set of kinds, e.g. "strength" or "everything". */
function kindsLabel(kinds: FitnessPlanKind[]): string {
    if (kinds.length >= FITNESS_PLAN_KINDS.length) return 'everything'
    return kinds.map((k) => KIND_META[k].label.toLowerCase()).join(' + ')
}

// Each plan kind carries its own colour so the categories read apart at a
// glance — coral for strength, sky for conditioning, amber for mobility,
// emerald for recovery (matching the chips used elsewhere in Fitness).
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
    mobility: {
        label: 'text-amber-600',
        icon: 'text-amber-500',
        row: 'border-l-2 border-amber-300 bg-amber-50/60',
        chip: 'bg-amber-50 text-amber-700',
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

// ─── Flag presentation ─────────────────────────────────────────────────────────

// Each flag colour maps to the classes used to render it: a solid swatch (for
// the picker + dot), a soft chip (day header), a full-width banner (week) and a
// left accent bar (flagged day card). Names label the swatches in the editor.
const FLAG_TONE: Record<
    FitnessFlagColor,
    { name: string; dot: string; chip: string; banner: string; bar: string }
> = {
    coral: {
        name: 'Coral',
        dot: 'bg-coral-500',
        chip: 'bg-coral-50 text-coral-700',
        banner: 'border-coral-200 bg-coral-50 text-coral-700',
        bar: 'bg-coral-500',
    },
    amber: {
        name: 'Amber',
        dot: 'bg-amber-500',
        chip: 'bg-amber-50 text-amber-700',
        banner: 'border-amber-200 bg-amber-50 text-amber-700',
        bar: 'bg-amber-500',
    },
    emerald: {
        name: 'Emerald',
        dot: 'bg-emerald-500',
        chip: 'bg-emerald-50 text-emerald-700',
        banner: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        bar: 'bg-emerald-500',
    },
    sky: {
        name: 'Sky',
        dot: 'bg-sky-500',
        chip: 'bg-sky-50 text-sky-700',
        banner: 'border-sky-200 bg-sky-50 text-sky-700',
        bar: 'bg-sky-500',
    },
    violet: {
        name: 'Violet',
        dot: 'bg-violet-500',
        chip: 'bg-violet-50 text-violet-700',
        banner: 'border-violet-200 bg-violet-50 text-violet-700',
        bar: 'bg-violet-500',
    },
    slate: {
        name: 'Slate',
        dot: 'bg-slate-500',
        chip: 'bg-slate-100 text-slate-700',
        banner: 'border-slate-200 bg-slate-50 text-slate-700',
        bar: 'bg-slate-500',
    },
}

// A default flag colour for a fresh flag, and quick-fill label suggestions
// offered in the editor (tailored to whether a day or a week is being flagged).
const DEFAULT_FLAG_COLOR: FitnessFlagColor = 'coral'
const FLAG_SUGGESTIONS: Record<FitnessNoteScope, string[]> = {
    day: ['Key session', 'Deload', 'Test day', 'Race', 'Rest', 'Travel'],
    week: ['Build', 'Deload', 'Race week', 'Recovery', 'Taper', 'Test week'],
}

/** The slot an entry sits in, defaulting legacy entries (no `part`) to morning. */
function partOf(entry: FitnessPlanEntry): FitnessPlanPart {
    return entry.part ?? 'morning'
}

/** The display name of a planned item, whichever library it comes from. */
function planItemName(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?.name
    if (entry.kind === 'conditioning') return entry.session?.name
    if (entry.kind === 'mobility') return entry.mobility?.name
    return entry.recovery?.name
}

// ─── Completion (done) tracking ────────────────────────────────────────────────

/**
 * A planned item is "done" once a matching log exists for its library item on its
 * day. Logs are keyed by kind + library id + date so a tick can be shown on the
 * planned row. Strength and conditioning always logged this way; mobility and
 * recovery now log the same, giving every category a completion record.
 */
function doneKey(kind: FitnessPlanKind, libId: string, date: string): string {
    return `${kind}:${libId}:${date}`
}

/** The library item id behind a planned entry, whichever category it is. */
function entryLibId(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?._id
    if (entry.kind === 'conditioning') return entry.session?._id
    if (entry.kind === 'mobility') return entry.mobility?._id
    return entry.recovery?._id
}

/**
 * A week reduced to what putting it back needs: each entry's library item by id
 * rather than its populated document, plus the flags on those days. Entries whose
 * library item has been deleted are left out — they can't be rebuilt, and the
 * list endpoint drops them anyway, so they were never on screen.
 */
function snapshotWeek(
    start: string,
    end: string,
    entries: FitnessPlanEntry[],
    notes: FitnessPlanNote[]
): PlanWeekSnapshot {
    return {
        start,
        end,
        entries: entries.flatMap((e) => {
            const item = entryLibId(e)
            if (!item) return []
            return [
                {
                    date: e.date,
                    part: e.part,
                    kind: e.kind,
                    item,
                    plan: e.plan,
                    order: e.order,
                },
            ]
        }),
        notes: notes.map((n) => ({
            scope: n.scope,
            date: n.date,
            color: n.color,
            label: n.label,
        })),
    }
}

/** The done-key for a planned entry, or null when its library item is missing. */
function entryDoneKey(entry: FitnessPlanEntry): string | null {
    const id = entryLibId(entry)
    return id ? doneKey(entry.kind, id, entry.date) : null
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

// ─── Calendar clashes ─────────────────────────────────────────────────────────

/**
 * A planned item that collides with one or more calendar events, because they
 * share the same day + slot (or the event runs all day). One clash per planned
 * item, carrying every event it overlaps.
 */
interface Clash {
    entry: FitnessPlanEntry
    events: Event[]
}

/** The events that occupy the same slot as `entry` — an all-day event clashes with any slot. */
function eventsClashingWith(entry: FitnessPlanEntry, events: Event[]): Event[] {
    const part = partOf(entry)
    return events.filter(
        (e) =>
            !e.ignoreClash &&
            (eventCoversAllDay(e, entry.date) || eventCoversSlot(e, entry.date, part))
    )
}

/**
 * A slot on the entry's own day it could move to, to escape its calendar clash:
 * one holding fewer than two planned items and with no event covering it (an
 * all-day event covers every slot). Slots are tried in natural order — morning →
 * afternoon → evening — skipping the entry's current slot. Returns null when
 * every other slot is either full (two sessions) or itself blocked by an event,
 * i.e. the clash has no resolution.
 */
function findResolutionSlot(
    entry: FitnessPlanEntry,
    dayEntries: FitnessPlanEntry[],
    events: Event[]
): FitnessPlanPart | null {
    const current = partOf(entry)
    for (const part of FITNESS_PLAN_PARTS) {
        if (part === current) continue
        // Slot capacity: at most two planned sessions share a slot.
        if (dayEntries.filter((e) => partOf(e) === part).length >= 2) continue
        // A free slot has no non-ignored event covering it (all-day counts).
        const blocked = events.some(
            (e) =>
                !e.ignoreClash &&
                (eventCoversAllDay(e, entry.date) || eventCoversSlot(e, entry.date, part))
        )
        if (blocked) continue
        return part
    }
    return null
}

/** A short "when" label for an event on `date` — "All day", a clock time, or the slots it spans. */
function eventWhenLabel(event: Event, date: string): string {
    if (event.allDay || event.startPart === 'na') return 'All day'
    const parts = (['morning', 'afternoon', 'evening'] as FitnessPlanPart[])
        .filter((p) => eventCoversSlot(event, date, p))
        .map((p) => PART_META[p].label)
        .join(', ')
    return event.time ? `${parts} · ${event.time}` : parts
}

// ─── Overloaded slots ─────────────────────────────────────────────────────────

/**
 * A slot of this week stacking two hard sessions on top of each other. The rule
 * itself lives in `lib/overload`, shared with the plans tab; this is the week
 * planner's view of it — one day's worth, keyed off the day column it warns on.
 */
type DayOverload = Overload<FitnessPlanEntry>

/** The slots of one day holding more than one hard session, in slot order. */
function overloadsIn(dayEntries: FitnessPlanEntry[]): DayOverload[] {
    return findOverloads([...dayEntries].sort((a, b) => a.order - b.order))
}

/**
 * Where a clashing item could go instead — as `findFreeSlot`, but also refusing
 * any slot a calendar event covers, since there's no point trading an overload
 * for a clash.
 */
function findFreeSlotAround(
    entry: FitnessPlanEntry,
    dayEntries: FitnessPlanEntry[],
    events: Event[]
): FitnessPlanPart | null {
    return findFreeSlot(entry, dayEntries, (part) =>
        events.some(
            (e) =>
                !e.ignoreClash &&
                (eventCoversAllDay(e, entry.date) || eventCoversSlot(e, entry.date, part))
        )
    )
}

// ─── Week tallies ───────────────────────────────────────────────────────────────

interface WeekTally {
    workouts: number
    sessions: number
    mobility: number
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
            } else if (e.kind === 'mobility') acc.mobility += 1
            else acc.recovery += 1
            return acc
        },
        { workouts: 0, sessions: 0, mobility: 0, recovery: 0, minutes: 0 }
    )
}

// ─── Planner ────────────────────────────────────────────────────────────────────

export default function FitnessWeeklyPlanner({ startOn }: { startOn?: string }) {
    // The anchor is any day inside the week on show; the week's Monday is derived
    // from it. Planning is week by week — one calendar week at a time. `startOn`
    // opens on a different week — applying a plan whose first session is next
    // month should land there, not on an empty view of this week.
    const [anchor, setAnchor] = useState(() => startOn ?? todayKey())
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [recovery, setRecovery] = useState<Recovery[]>([])
    const [mobility, setMobility] = useState<Mobility[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [libLoading, setLibLoading] = useState(true)
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [notes, setNotes] = useState<FitnessPlanNote[]>([])
    // Calendar events across the displayed week, used to flag slot clashes.
    const [events, setEvents] = useState<Event[]>([])
    // Keys (kind:libId:date) of completed items in the displayed week, so a
    // planned row can show a tick once its matching log exists.
    const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    // The picker always targets one day + slot; the type (strength / conditioning /
    // recovery) and the slot are then chosen inside the drawer.
    const [picker, setPicker] = useState<{ date: string; part: FitnessPlanPart } | null>(null)
    // A day or week whose flag+label is being edited (opens the flag editor).
    const [flagTarget, setFlagTarget] = useState<{
        scope: FitnessNoteScope
        date: string
    } | null>(null)
    // A planned item opened for a read-only look at its full details.
    const [detail, setDetail] = useState<FitnessPlanEntry | null>(null)
    // A planned strength workout being logged with per-set weights, and the day
    // it's dated to (opened from the detail drawer).
    const [logTarget, setLogTarget] = useState<{ workout: Workout; date: string } | null>(null)
    // The planner opens read-only; Edit reveals the add/remove controls.
    const [editing, setEditing] = useState(false)
    // Every change saves as it's made, so cancelling can't unwind a queue of
    // writes. Instead each week touched since editing began is kept as it was,
    // keyed by its Monday, and Cancel hands those back to be put in place.
    const baseline = useRef(new Map<string, PlanWeekSnapshot>())
    // Whether anything has actually been changed, so Cancel can bow out quietly
    // when nothing has — and warn before throwing work away when something has.
    const [dirty, setDirty] = useState(false)
    const [confirmDiscard, setConfirmDiscard] = useState(false)
    const [discarding, setDiscarding] = useState(false)
    // The week the loaded entries belong to. The grid deliberately keeps the old
    // week on screen while the next one loads, so this is what says the rows in
    // hand really are this week's — and are safe to snapshot.
    const [loadedWeek, setLoadedWeek] = useState<string | null>(null)
    // A copied week held for pasting elsewhere: the source Monday plus which
    // categories were copied. Only those categories are overwritten on paste.
    const [clipboard, setClipboard] = useState<{ from: string; kinds: FitnessPlanKind[] } | null>(
        null
    )
    // A pending "clear" awaiting confirmation: a single day, or the whole week.
    const [clearTarget, setClearTarget] = useState<
        { type: 'day'; date: string } | { type: 'week' } | null
    >(null)
    // The day whose calendar clashes are open in the clash modal, if any.
    const [clashDate, setClashDate] = useState<string | null>(null)
    // The day whose overloaded slots are open in the overload modal, if any.
    const [overloadDate, setOverloadDate] = useState<string | null>(null)

    const today = todayKey()
    const toast = useToast()

    // Mark a kind's library item as done on a date, so its planned rows tick.
    function markDoneKey(kind: FitnessPlanKind, libId: string, date: string) {
        setDoneKeys((prev) => {
            const next = new Set(prev)
            next.add(doneKey(kind, libId, date))
            return next
        })
    }

    // Log a planned workout with the per-set weights entered in the weight drawer.
    async function handleLogWeights(workout: Workout, fields: WorkoutLogInput) {
        await createWorkoutLog(fields)
        markDoneKey('workout', workout._id, fields.date)
        toast.show(`Logged “${workout.name}”.`, 'success')
    }

    // The week to fetch — and to tally totals over. Planning is week by week.
    const range = useMemo(() => {
        const start = mondayOf(anchor)
        return { start, end: addDays(start, 6) }
    }, [anchor])

    // The libraries — loaded once, for the picker, the "is it empty" check and
    // the detail drawer (exercises resolve a workout's exercise names).
    useEffect(() => {
        Promise.all([
            listWorkouts(),
            listSessions(),
            listRecovery(),
            listMobility(),
            listExercises(),
        ])
            .then(([wk, se, re, mo, ex]) => {
                setWorkouts(wk)
                setSessions(se)
                setRecovery(re)
                setMobility(mo)
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
        // A log falls in the displayed week when its date sits in the range.
        const inRange = (date: string) => date >= range.start && date <= range.end
        Promise.all([
            listPlanEntries(range.start, range.end),
            listPlanNotes(range.start, range.end),
            listEvents(range.start, range.end).catch(() => [] as Event[]),
            listWorkoutLogs().catch(() => []),
            listConditioningLogs().catch(() => []),
            listMobilityLogs().catch(() => []),
            listRecoveryLogs().catch(() => []),
        ])
            .then(([rows, noteRows, eventRows, wLogs, cLogs, mLogs, rLogs]) => {
                if (!active) return
                setEntries(rows)
                setNotes(noteRows)
                setEvents(eventRows)
                setLoadedWeek(range.start)
                // Build the week's completion keys from each kind's logs. Logs with
                // no library link (their item was deleted) can't match a plan row.
                const keys = new Set<string>()
                for (const l of wLogs)
                    if (l.workout && inRange(l.date))
                        keys.add(doneKey('workout', l.workout, l.date))
                for (const l of cLogs)
                    if (l.session && inRange(l.date))
                        keys.add(doneKey('conditioning', l.session, l.date))
                for (const l of mLogs)
                    if (l.mobility && inRange(l.date))
                        keys.add(doneKey('mobility', l.mobility, l.date))
                for (const l of rLogs)
                    if (l.recovery && inRange(l.date))
                        keys.add(doneKey('recovery', l.recovery, l.date))
                setDoneKeys(keys)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end])

    // Snapshot each week the first time it's seen in edit mode — the one on show
    // when Edit was pressed, and any navigated to afterwards. Later runs are no-ops
    // thanks to the `has` guard, so a snapshot is always the week untouched.
    useEffect(() => {
        if (!editing || loadedWeek !== range.start) return
        if (baseline.current.has(range.start)) return
        baseline.current.set(range.start, snapshotWeek(range.start, range.end, entries, notes))
    }, [editing, loadedWeek, range.start, range.end, entries, notes])

    function step(dir: -1 | 1) {
        setAnchor((a) => addDays(mondayOf(a), dir * 7))
    }

    /** Note that the week on screen no longer matches its snapshot. */
    function markDirty() {
        setDirty(true)
    }

    /** Leave edit mode, keeping everything as it now stands. */
    function stopEditing() {
        setPicker(null)
        baseline.current.clear()
        setDirty(false)
        setEditing(false)
    }

    /**
     * Put every week touched since editing began back as it was, then leave edit
     * mode. The week on show is refetched afterwards either way, so a restore that
     * fails part-way still leaves the grid showing what is actually saved.
     */
    async function discardChanges() {
        setConfirmDiscard(false)
        setDiscarding(true)
        let failed = false
        for (const snapshot of baseline.current.values()) {
            try {
                await restorePlanWeek(snapshot)
            } catch {
                failed = true
            }
        }
        try {
            const [rows, noteRows] = await Promise.all([
                listPlanEntries(range.start, range.end),
                listPlanNotes(range.start, range.end),
            ])
            setEntries(rows)
            setNotes(noteRows)
        } catch {
            failed = true
        }
        setDiscarding(false)
        stopEditing()
        toast.show(
            failed ? 'Some changes could not be undone.' : 'Changes undone.',
            failed ? 'warning' : 'success'
        )
    }

    async function handleAdd(
        date: string,
        kind: FitnessPlanKind,
        itemId: string,
        part: FitnessPlanPart
    ) {
        const entry = await addPlanEntry(date, kind, itemId, part)
        setEntries((prev) => [...prev, entry])
        markDirty()
    }

    async function handleRemove(id: string) {
        setEntries((prev) => prev.filter((e) => e._id !== id))
        markDirty()
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
        markDirty()
    }

    // Clear every planned item from a single day. Optimistic, reverting on failure.
    async function handleClearDay(date: string) {
        const removed = entries.filter((e) => e.date === date)
        if (removed.length === 0) return
        setEntries((prev) => prev.filter((e) => e.date !== date))
        markDirty()
        try {
            await clearPlanRange(date, date)
        } catch {
            setEntries((prev) => [...prev, ...removed])
        }
    }

    // Clear every planned item from the displayed week. Optimistic, reverting on failure.
    async function handleClearWeek() {
        const { start, end } = range
        const removed = entries.filter((e) => e.date >= start && e.date <= end)
        if (removed.length === 0) return
        setEntries((prev) => prev.filter((e) => !(e.date >= start && e.date <= end)))
        markDirty()
        try {
            await clearPlanRange(start, end)
        } catch {
            setEntries((prev) => [...prev, ...removed])
        }
    }

    // Move a planned item to another slot of its own day (week-view drag-and-drop).
    // Optimistic: the row jumps immediately, then the server records the new slot.
    async function handleMove(id: string, part: FitnessPlanPart) {
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, part } : e)))
        markDirty()
        await updatePlanEntry(id, part)
    }

    // Reorder a slot from a week-view drag — and, when the dragged item came from
    // another slot or day, move it in at the chosen spot. `ids` is the target
    // slot's new top-to-bottom order. Optimistic: rewrite the listed entries' date,
    // part + order, reverting to the snapshot if the save fails.
    async function handleReorder(date: string, part: FitnessPlanPart, ids: string[]) {
        const position = new Map(ids.map((id, i) => [id, i]))
        const snapshot = entries
        setEntries((prev) =>
            prev.map((e) =>
                position.has(e._id) ? { ...e, date, part, order: position.get(e._id)! } : e
            )
        )
        markDirty()
        try {
            await reorderPlanSlot(date, part, ids)
        } catch {
            setEntries(snapshot)
        }
    }

    // Save (create or update) a day or week flag, then merge it into state so the
    // planner reflects it without a refetch.
    async function handleSaveFlag(
        scope: FitnessNoteScope,
        date: string,
        color: FitnessFlagColor,
        label: string
    ) {
        const saved = await savePlanNote(scope, date, color, label)
        setNotes((prev) => {
            const rest = prev.filter((n) => !(n.scope === saved.scope && n.date === saved.date))
            return [...rest, saved]
        })
        setFlagTarget(null)
        markDirty()
    }

    async function handleRemoveFlag(id: string) {
        setNotes((prev) => prev.filter((n) => n._id !== id))
        setFlagTarget(null)
        markDirty()
        await deletePlanNote(id)
    }

    // Day flags keyed by day; the week flag is the note on the displayed Monday.
    const dayNotes = useMemo(() => {
        const m = new Map<string, FitnessPlanNote>()
        for (const n of notes) if (n.scope === 'day') m.set(n.date, n)
        return m
    }, [notes])
    const weekNote = useMemo(
        () => notes.find((n) => n.scope === 'week' && n.date === range.start) ?? null,
        [notes, range.start]
    )
    // The note the editor is currently working on (undefined for a brand-new flag).
    const flagNote = flagTarget
        ? (notes.find((n) => n.scope === flagTarget.scope && n.date === flagTarget.date) ?? null)
        : null

    const totals = tally(entries)

    // Clashes keyed by day: each planned item that overlaps a calendar event in
    // its slot (or any all-day event). Days with no clash are absent from the map.
    const clashesByDate = useMemo(() => {
        const m = new Map<string, Clash[]>()
        for (const entry of entries) {
            const clashing = eventsClashingWith(entry, events)
            if (clashing.length === 0) continue
            const list = m.get(entry.date)
            const clash: Clash = { entry, events: clashing }
            if (list) list.push(clash)
            else m.set(entry.date, [clash])
        }
        return m
    }, [entries, events])

    // Overloaded slots keyed by day: each slot holding two hard sessions.
    // Days with nothing doubled up are absent from the map.
    const overloadsByDate = useMemo(() => {
        const m = new Map<string, DayOverload[]>()
        for (const overload of overloadsIn(entries)) {
            const list = m.get(overload.date)
            if (list) list.push(overload)
            else m.set(overload.date, [overload])
        }
        return m
    }, [entries])

    const libraryEmpty =
        workouts.length === 0 &&
        sessions.length === 0 &&
        recovery.length === 0 &&
        mobility.length === 0

    // Which categories the displayed week already holds — a paste only needs
    // confirmation when it would overwrite one of these.
    const weekKinds = useMemo(() => {
        const s = new Set<FitnessPlanKind>()
        for (const e of entries) s.add(e.kind)
        return s
    }, [entries])

    const rangeLabel = formatWeekRange(range.start, range.end)

    // Whether a planned item has a matching completion log on its day.
    const isDone = (entry: FitnessPlanEntry) => {
        const k = entryDoneKey(entry)
        return k ? doneKeys.has(k) : false
    }

    // Count and label the items a pending clear would remove, for the confirm dialog.
    const clearInfo = useMemo(() => {
        if (!clearTarget) return null
        if (clearTarget.type === 'day') {
            const count = entries.filter((e) => e.date === clearTarget.date).length
            return { count, where: shortDayLabel(clearTarget.date), scope: 'day' as const }
        }
        const count = entries.filter((e) => e.date >= range.start && e.date <= range.end).length
        return { count, where: formatWeekRange(range.start, range.end), scope: 'week' as const }
    }, [clearTarget, entries, range.start, range.end])

    return (
        <div className="flex flex-col gap-6">
            {/* View switch + navigation + totals */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Full-width on phones with a shrinkable label: the arrows,
                        the 10rem range label and "This week" don't fit side by
                        side, and the button was breaking mid-word. */}
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                        <IconButton
                            label="Previous week"
                            icon="fa-solid fa-chevron-left"
                            onClick={() => step(-1)}
                        />
                        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-neutral-900 sm:min-w-[10rem] sm:flex-none">
                            {rangeLabel}
                        </div>
                        <IconButton
                            label="Next week"
                            icon="fa-solid fa-chevron-right"
                            onClick={() => step(1)}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAnchor(today)}
                            className="ml-1 shrink-0 whitespace-nowrap"
                        >
                            This week
                        </Button>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {!libraryEmpty && editing && (
                        <WeekCopyControls
                            weekStart={range.start}
                            weekEnd={range.end}
                            clipboard={clipboard}
                            presentKinds={weekKinds}
                            onCopy={handleCopyWeek}
                            onPaste={handlePasteWeek}
                            onClearClipboard={() => setClipboard(null)}
                        />
                    )}
                    {editing && entries.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="fa-solid fa-broom"
                            onClick={() => setClearTarget({ type: 'week' })}
                            className="text-red-500 hover:bg-red-50 hover:text-red-600"
                        >
                            Clear week
                        </Button>
                    )}
                    {editing && (
                        <Button
                            variant="ghost"
                            size="sm"
                            icon="fa-solid fa-rotate-left"
                            disabled={discarding}
                            // Nothing changed means nothing to warn about — just
                            // drop back out of edit mode.
                            onClick={() => (dirty ? setConfirmDiscard(true) : stopEditing())}
                        >
                            {discarding ? 'Undoing…' : 'Cancel'}
                        </Button>
                    )}
                    {!libraryEmpty && (
                        <Button
                            variant={editing ? 'primary' : 'secondary'}
                            size="sm"
                            icon={editing ? 'fa-solid fa-check' : 'fa-solid fa-pen'}
                            disabled={discarding}
                            onClick={() => {
                                if (editing) {
                                    stopEditing()
                                    return
                                }
                                setPicker(null)
                                baseline.current.clear()
                                setDirty(false)
                                setEditing(true)
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
            ) : (
                <WeekView
                    weekStart={range.start}
                    today={today}
                    editing={editing}
                    entries={entries}
                    weekNote={weekNote}
                    dayNotes={dayNotes}
                    clashesByDate={clashesByDate}
                    overloadsByDate={overloadsByDate}
                    isDone={isDone}
                    onAdd={(date, part) => setPicker({ date, part })}
                    onOpen={setDetail}
                    onRemove={handleRemove}
                    onReorder={handleReorder}
                    onEditFlag={(scope, date) => setFlagTarget({ scope, date })}
                    onClearDay={(date) => setClearTarget({ type: 'day', date })}
                    onShowClashes={setClashDate}
                    onShowOverloads={setOverloadDate}
                />
            )}

            <ItemPicker
                target={picker}
                editable={editing}
                workouts={workouts}
                sessions={sessions}
                recovery={recovery}
                mobility={mobility}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                isDone={isDone}
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onRemove={handleRemove}
            />

            <PlannedDetailDrawer
                entry={detail}
                exercisesById={exercisesById}
                done={detail ? isDone(detail) : false}
                onClose={() => setDetail(null)}
                onLogged={(entry) => {
                    const id = entryLibId(entry)
                    if (id) markDoneKey(entry.kind, id, entry.date)
                }}
                onLogWeights={(workout, date) => {
                    setDetail(null)
                    setLogTarget({ workout, date })
                }}
            />

            <WorkoutLogWeightsDrawer
                workout={logTarget?.workout ?? null}
                byId={exercisesById}
                defaultDate={logTarget?.date}
                onClose={() => setLogTarget(null)}
                onSubmit={handleLogWeights}
            />

            <FlagEditorDrawer
                target={flagTarget}
                note={flagNote}
                onClose={() => setFlagTarget(null)}
                onSave={handleSaveFlag}
                onRemove={handleRemoveFlag}
            />

            <ConfirmModal
                open={clearTarget !== null}
                danger
                title={clearInfo?.scope === 'week' ? 'Clear this week?' : 'Clear this day?'}
                message={
                    clearInfo ? (
                        <>
                            Remove{' '}
                            <span className="font-semibold">
                                {clearInfo.count} planned item{clearInfo.count !== 1 ? 's' : ''}
                            </span>{' '}
                            from <span className="font-semibold">{clearInfo.where}</span>? Flags
                            stay in place. This can’t be undone.
                        </>
                    ) : (
                        ''
                    )
                }
                confirmLabel="Clear"
                onConfirm={() => {
                    if (!clearTarget) return
                    if (clearTarget.type === 'week') handleClearWeek()
                    else handleClearDay(clearTarget.date)
                    setClearTarget(null)
                }}
                onClose={() => setClearTarget(null)}
            />

            <ConfirmModal
                open={confirmDiscard}
                danger
                title="Undo your changes?"
                message={
                    <>
                        Everything you have added, removed, moved or flagged since pressing{' '}
                        <span className="font-semibold">Edit plan</span> will be put back as it was
                        {baseline.current.size > 1 && ', across every week you have edited'}. This
                        can’t itself be undone.
                    </>
                }
                confirmLabel="Undo changes"
                onConfirm={discardChanges}
                onClose={() => setConfirmDiscard(false)}
            />

            <ClashModal
                date={clashDate}
                clashes={clashDate ? (clashesByDate.get(clashDate) ?? []) : []}
                dayEntries={clashDate ? entries.filter((e) => e.date === clashDate) : []}
                events={events}
                onMove={handleMove}
                onClose={() => setClashDate(null)}
            />

            <OverloadModal
                date={overloadDate}
                overloads={overloadDate ? (overloadsByDate.get(overloadDate) ?? []) : []}
                dayEntries={overloadDate ? entries.filter((e) => e.date === overloadDate) : []}
                events={events}
                onMove={handleMove}
                onClose={() => setOverloadDate(null)}
            />
        </div>
    )
}

// ─── Clash modal ──────────────────────────────────────────────────────────────

/**
 * Lists a day's schedule clashes: each planned item that overlaps a calendar
 * event, shown alongside the event(s) it collides with and when they fall.
 */
function ClashModal({
    date,
    clashes,
    dayEntries,
    events,
    onMove,
    onClose,
}: {
    date: string | null
    clashes: Clash[]
    /** Every planned item on this day — used to gauge each slot's spare capacity. */
    dayEntries: FitnessPlanEntry[]
    /** The week's calendar events, to tell which slots an event already blocks. */
    events: Event[]
    onMove: (id: string, part: FitnessPlanPart) => void
    onClose: () => void
}) {
    // Entries whose Resolve found nowhere free to go, so we show "No resolution".
    const [unresolved, setUnresolved] = useState<Set<string>>(new Set())

    // Forget any "No resolution" flags when the modal switches to another day.
    useEffect(() => {
        setUnresolved(new Set())
    }, [date])

    // Try to move a clashing item to a free slot of the same day. On success it
    // lands there and drops out of the clash list; on failure it's flagged as
    // having no resolution.
    function handleResolve(entry: FitnessPlanEntry) {
        const slot = findResolutionSlot(entry, dayEntries, events)
        if (slot) {
            onMove(entry._id, slot)
            setUnresolved((prev) => {
                if (!prev.has(entry._id)) return prev
                const next = new Set(prev)
                next.delete(entry._id)
                return next
            })
        } else {
            setUnresolved((prev) => new Set(prev).add(entry._id))
        }
    }

    return (
        <Modal
            open={date !== null}
            onClose={onClose}
            title="Schedule clash"
            size="md"
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            {date && clashes.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <i
                        className="fa-solid fa-circle-check text-2xl text-emerald-500"
                        aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-neutral-700">Nothing clashing</p>
                    <p className="text-sm text-neutral-500">
                        Every session on{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        sits in a clear slot.
                    </p>
                </div>
            )}
            {date && clashes.length > 0 && (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-neutral-500">
                        On{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        {clashes.length === 1
                            ? 'a planned session overlaps'
                            : 'planned sessions overlap'}{' '}
                        with what&apos;s already on your calendar.
                    </p>
                    <ul className="flex flex-col gap-3">
                        {clashes.map((clash) => {
                            const tone = KIND_TONE[clash.entry.kind]
                            const part = partOf(clash.entry)
                            return (
                                <li
                                    key={clash.entry._id}
                                    className="rounded-xl border border-amber-200 bg-amber-50/50 p-3"
                                >
                                    <div className="flex items-center gap-2">
                                        <i
                                            className={`${KIND_META[clash.entry.kind].icon} text-xs ${tone.icon}`}
                                            aria-hidden="true"
                                        />
                                        <span className="text-sm font-semibold text-neutral-800">
                                            {planItemName(clash.entry) ??
                                                KIND_META[clash.entry.kind].noun}
                                        </span>
                                        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                                            <i
                                                className={`${PART_META[part].icon} text-[10px]`}
                                                aria-hidden="true"
                                            />
                                            {PART_META[part].label}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex flex-col gap-1.5 border-t border-amber-200/70 pt-2">
                                        {clash.events.map((event) => (
                                            <div
                                                key={event._id}
                                                className="flex items-center gap-2 text-sm text-neutral-600"
                                            >
                                                <i
                                                    className="fa-regular fa-calendar shrink-0 text-xs text-neutral-400"
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1 truncate font-medium text-neutral-700">
                                                    {event.title}
                                                </span>
                                                <span className="shrink-0 text-xs text-neutral-400">
                                                    {eventWhenLabel(event, date)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex items-center justify-end gap-2 border-t border-amber-200/70 pt-2">
                                        {unresolved.has(clash.entry._id) ? (
                                            <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-400">
                                                <i
                                                    className="fa-solid fa-ban text-[11px]"
                                                    aria-hidden="true"
                                                />
                                                No resolution
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => handleResolve(clash.entry)}
                                                className="flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-600"
                                            >
                                                <i
                                                    className="fa-solid fa-wand-magic-sparkles text-[11px]"
                                                    aria-hidden="true"
                                                />
                                                Resolve
                                            </button>
                                        )}
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
        </Modal>
    )
}

// ─── Overload modal ───────────────────────────────────────────────────────────

/**
 * Lists a day's overloaded slots: each slot asking for two hard sessions back to
 * back, with a one-press move of either session to the nearest slot of the day
 * that's free to take it.
 */
function OverloadModal({
    date,
    overloads,
    dayEntries,
    events,
    onMove,
    onClose,
}: {
    date: string | null
    overloads: DayOverload[]
    /** Every planned item on this day — used to gauge each slot's spare capacity. */
    dayEntries: FitnessPlanEntry[]
    /** The week's calendar events, so a session is never moved into a busy slot. */
    events: Event[]
    onMove: (id: string, part: FitnessPlanPart) => void
    onClose: () => void
}) {
    return (
        <Modal
            open={date !== null}
            onClose={onClose}
            title="Overloaded slot"
            size="md"
            footer={
                <Button variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            {date && overloads.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                    <i
                        className="fa-solid fa-circle-check text-2xl text-emerald-500"
                        aria-hidden="true"
                    />
                    <p className="text-sm font-semibold text-neutral-700">Nicely spread out</p>
                    <p className="text-sm text-neutral-500">
                        No slot on{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        doubles up on hard sessions.
                    </p>
                </div>
            )}
            {date && overloads.length > 0 && (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-neutral-500">
                        On{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        {overloads.length === 1 ? 'a slot stacks' : 'slots stack'} two hard sessions
                        together. Move one to another slot to spread the load.
                    </p>
                    <ul className="flex flex-col gap-3">
                        {overloads.map((overload) => (
                            <li
                                key={overload.part}
                                className="rounded-xl border border-violet-200 bg-violet-50/50 p-3"
                            >
                                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-500">
                                    <i
                                        className={`${PART_META[overload.part].icon} text-[10px]`}
                                        aria-hidden="true"
                                    />
                                    {PART_META[overload.part].label}
                                </div>
                                <div className="mt-2 flex flex-col gap-2 border-t border-violet-200/70 pt-2">
                                    {overload.entries.map((entry) => {
                                        const tone = KIND_TONE[entry.kind]
                                        const target = findFreeSlotAround(entry, dayEntries, events)
                                        return (
                                            <div
                                                key={entry._id}
                                                className="flex items-center gap-2 text-sm"
                                            >
                                                <i
                                                    className={`${KIND_META[entry.kind].icon} shrink-0 text-xs ${tone.icon}`}
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1 truncate font-semibold text-neutral-800">
                                                    {planItemName(entry) ??
                                                        KIND_META[entry.kind].noun}
                                                </span>
                                                {target ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onMove(entry._id, target)}
                                                        className="flex shrink-0 items-center gap-1.5 rounded-full bg-violet-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-600"
                                                    >
                                                        <i
                                                            className="fa-solid fa-arrow-right-long text-[11px]"
                                                            aria-hidden="true"
                                                        />
                                                        Move to {PART_META[target].label}
                                                    </button>
                                                ) : (
                                                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-400">
                                                        <i
                                                            className="fa-solid fa-ban text-[11px]"
                                                            aria-hidden="true"
                                                        />
                                                        No free slot
                                                    </span>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Modal>
    )
}

// ─── Copy / paste week ──────────────────────────────────────────────────────────

/**
 * Copy the current week's plan and paste it onto another week. "Copy week"
 * opens a checklist of categories (tick one, several or all); copying drops the
 * ticked categories onto a clipboard, and navigating to a different week reveals
 * "Paste", which overwrites only those categories there. Only shown in edit mode.
 */
function WeekCopyControls({
    weekStart,
    weekEnd,
    clipboard,
    presentKinds,
    onCopy,
    onPaste,
    onClearClipboard,
}: {
    weekStart: string
    weekEnd: string
    clipboard: { from: string; kinds: FitnessPlanKind[] } | null
    presentKinds: Set<FitnessPlanKind>
    onCopy: (kinds: FitnessPlanKind[]) => void
    onPaste: () => void
    onClearClipboard: () => void
}) {
    const [confirming, setConfirming] = useState(false)
    const [open, setOpen] = useState(false)
    // Which categories to copy — defaults to all; the checklist can narrow it.
    const [selected, setSelected] = useState<Set<FitnessPlanKind>>(
        () => new Set(FITNESS_PLAN_KINDS)
    )
    const panelRef = useRef<HTMLDivElement>(null)

    // Close the copy checklist on an outside click.
    useEffect(() => {
        if (!open) return
        function handle(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    // The clipboard's source week can't be pasted back onto itself.
    const sameWeek = clipboard?.from === weekStart
    // A paste only overwrites — and so only needs confirming — when this week
    // already holds one of the categories being pasted. Otherwise paste straight.
    const wouldReplace = clipboard?.kinds.some((k) => presentKinds.has(k)) ?? false

    // The ticked categories, always in canonical order.
    const chosen = FITNESS_PLAN_KINDS.filter((k) => selected.has(k))
    const allSelected = chosen.length === FITNESS_PLAN_KINDS.length

    function toggle(kind: FitnessPlanKind) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(kind)) next.delete(kind)
            else next.add(kind)
            return next
        })
    }

    function handleCopyClick() {
        if (chosen.length === 0) return
        onCopy(chosen)
        setOpen(false)
    }

    return (
        <div className="flex items-center gap-2">
            <div ref={panelRef} className="relative inline-block">
                <Button
                    variant="secondary"
                    size="sm"
                    icon="fa-solid fa-copy"
                    onClick={() => setOpen((o) => !o)}
                >
                    Copy week
                </Button>
                {open && (
                    <div className="absolute right-0 z-50 mt-2 min-w-56 rounded-xl border border-neutral-100 bg-white p-3 shadow-lg">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Copy which categories
                            </p>
                            <button
                                type="button"
                                onClick={() =>
                                    setSelected(
                                        allSelected ? new Set() : new Set(FITNESS_PLAN_KINDS)
                                    )
                                }
                                className="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                            >
                                {allSelected ? 'Clear' : 'All'}
                            </button>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {FITNESS_PLAN_KINDS.map((k) => (
                                <Checkbox
                                    key={k}
                                    checked={selected.has(k)}
                                    onChange={() => toggle(k)}
                                    label={KIND_META[k].label}
                                    className="rounded-lg px-1.5 py-1 hover:bg-neutral-50"
                                />
                            ))}
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            icon="fa-solid fa-copy"
                            onClick={handleCopyClick}
                            disabled={chosen.length === 0}
                            className="mt-3 w-full justify-center"
                        >
                            Copy {chosen.length ? kindsLabel(chosen) : ''}
                        </Button>
                    </div>
                )}
            </div>

            {clipboard && (
                <div className="flex items-center gap-1">
                    <Button
                        variant="primary"
                        size="sm"
                        icon="fa-solid fa-paste"
                        disabled={sameWeek}
                        onClick={() => (wouldReplace ? setConfirming(true) : onPaste())}
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
                            Replace{' '}
                            <span className="font-semibold">{kindsLabel(clipboard.kinds)}</span> for{' '}
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
    weekNote,
    dayNotes,
    clashesByDate,
    overloadsByDate,
    isDone,
    onAdd,
    onOpen,
    onRemove,
    onReorder,
    onEditFlag,
    onClearDay,
    onShowClashes,
    onShowOverloads,
}: {
    weekStart: string
    today: string
    editing: boolean
    entries: FitnessPlanEntry[]
    weekNote: FitnessPlanNote | null
    dayNotes: Map<string, FitnessPlanNote>
    clashesByDate: Map<string, Clash[]>
    overloadsByDate: Map<string, DayOverload[]>
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    onAdd: (date: string, part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    onReorder: (date: string, part: FitnessPlanPart, ids: string[]) => void
    onEditFlag: (scope: FitnessNoteScope, date: string) => void
    onClearDay: (date: string) => void
    onShowClashes: (date: string) => void
    onShowOverloads: (date: string) => void
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

    // Drag-and-drop state, held here so a row can be dragged across day columns —
    // not just between the slots of its own day. `dragId` is the item in flight;
    // `dropAt` is where it would land: a day + slot, the row to drop before
    // (`refId`, or null to append) and which half of that row the cursor is in.
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropAt, setDropAt] = useState<{
        date: string
        part: FitnessPlanPart
        refId: string | null
        after: boolean
    } | null>(null)

    // A slot's items (any day) in display (order) sequence.
    const slotItems = (date: string, part: FitnessPlanPart) =>
        entries
            .filter((e) => e.date === date && partOf(e) === part)
            .sort((a, b) => a.order - b.order)

    function resetDrag() {
        setDragId(null)
        setDropAt(null)
    }

    // Land the dragged item at the pending drop spot, then persist the target
    // slot's new order. Skips a no-op (dropping back where it already sat).
    function handleDrop() {
        const dragged = dragId ? entries.find((e) => e._id === dragId) : null
        const target = dropAt
        resetDrag()
        if (!dragged || !target) return

        const display = slotItems(target.date, target.part).map((e) => e._id)
        const ids = display.filter((id) => id !== dragged._id)
        let pos = ids.length
        if (target.refId !== null) {
            const ri = ids.indexOf(target.refId)
            if (ri !== -1) pos = target.after ? ri + 1 : ri
        }
        ids.splice(pos, 0, dragged._id)

        // Same day, same slot and unchanged order → nothing to do.
        if (
            dragged.date === target.date &&
            partOf(dragged) === target.part &&
            ids.join() === display.join()
        )
            return
        onReorder(target.date, target.part, ids)
    }

    const renderDay = (date: string) => (
        <DayColumn
            key={date}
            date={date}
            isToday={date === today}
            editable={editing}
            entries={entries.filter((e) => e.date === date)}
            note={dayNotes.get(date) ?? null}
            clashCount={clashesByDate.get(date)?.length ?? 0}
            overloadCount={overloadsByDate.get(date)?.length ?? 0}
            isDone={isDone}
            onAdd={(part) => onAdd(date, part)}
            onOpen={onOpen}
            onRemove={onRemove}
            dragActive={dragId !== null}
            draggedId={dragId}
            dropForDay={dropAt && dropAt.date === date ? dropAt : null}
            onEntryDragStart={setDragId}
            onEntryDragEnd={resetDrag}
            onTarget={(part, refId, after) => setDropAt({ date, part, refId, after })}
            onClearTarget={(part) =>
                setDropAt((d) => (d && d.date === date && d.part === part ? null : d))
            }
            onDropEntry={handleDrop}
            onEditFlag={() => onEditFlag('day', date)}
            onClear={() => onClearDay(date)}
            onShowClashes={() => onShowClashes(date)}
            onShowOverloads={() => onShowOverloads(date)}
        />
    )

    return (
        <div className="flex flex-col gap-4">
            <WeekFlagBanner
                weekStart={weekStart}
                note={weekNote}
                editable={editing}
                onEdit={() => onEditFlag('week', weekStart)}
            />
            {/* Mon–Fri on one row, the weekend on its own below it. Both rows use
                the same column template so the weekend days keep the weekday width. */}
            <div className={WEEK_ROW_GRID}>{days.slice(0, 5).map(renderDay)}</div>
            <div className={WEEK_ROW_GRID}>{days.slice(5).map(renderDay)}</div>
        </div>
    )
}

/** Shared column template for the weekday and weekend rows of the planner grid. */
const WEEK_ROW_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'

/**
 * The week's flag + label, shown above the day grid. When a flag is set it reads
 * as a coloured banner; in edit mode it also exposes a button to set or change
 * it. With no flag it only appears in edit mode, as a subtle "Flag week" prompt.
 */
function WeekFlagBanner({
    weekStart,
    note,
    editable,
    onEdit,
}: {
    weekStart: string
    note: FitnessPlanNote | null
    editable: boolean
    onEdit: () => void
}) {
    if (!note && !editable) return null

    if (!note) {
        return (
            <button
                type="button"
                onClick={onEdit}
                className="flex items-center gap-2 self-start rounded-full border border-dashed border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-600"
            >
                <i className="fa-solid fa-flag text-[11px]" aria-hidden="true" />
                Flag week
            </button>
        )
    }

    const tone = FLAG_TONE[note.color]
    return (
        <div className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 ${tone.banner}`}>
            <i className="fa-solid fa-flag text-xs" aria-hidden="true" />
            <span className="text-sm font-semibold">{note.label || 'Flagged week'}</span>
            <span className="text-xs opacity-70">
                · {formatWeekRange(weekStart, addDays(weekStart, 6))}
            </span>
            {editable && (
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label="Edit week flag"
                    className="ml-auto grid h-7 w-7 place-items-center rounded-full opacity-70 transition-colors hover:bg-white/50 hover:opacity-100"
                >
                    <i className="fa-solid fa-pen text-[11px]" aria-hidden="true" />
                </button>
            )}
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
        // Five labelled stats plus dividers come to ~454px, so on a phone this
        // becomes a swipeable strip rather than pushing the page sideways.
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-none rounded-2xl border border-neutral-200 bg-white px-4 py-2.5 sm:gap-4">
            <Stat label="Strength" value={tally.workouts} />
            <div className="h-8 w-px shrink-0 bg-neutral-200" />
            <Stat label="Cond." value={tally.sessions} />
            <div className="h-8 w-px shrink-0 bg-neutral-200" />
            <Stat label="Mobility" value={tally.mobility} />
            <div className="h-8 w-px shrink-0 bg-neutral-200" />
            <Stat label="Recovery" value={tally.recovery} />
            <div className="h-8 w-px shrink-0 bg-neutral-200" />
            <Stat label="Cond. min" value={tally.minutes} />
        </div>
    )
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="shrink-0">
            <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
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
    note,
    clashCount,
    overloadCount,
    isDone,
    onAdd,
    onOpen,
    onRemove,
    dragActive,
    draggedId,
    dropForDay,
    onEntryDragStart,
    onEntryDragEnd,
    onTarget,
    onClearTarget,
    onDropEntry,
    onEditFlag,
    onClear,
    onShowClashes,
    onShowOverloads,
}: {
    date: string
    isToday: boolean
    editable: boolean
    entries: FitnessPlanEntry[]
    note: FitnessPlanNote | null
    /** How many of this day's planned items clash with a calendar event. */
    clashCount: number
    /** How many of this day's slots stack two hard sessions together. */
    overloadCount: number
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    onAdd: (part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    /** True while any row (this day's or another's) is being dragged. */
    dragActive: boolean
    /** The id of the row in flight, so it never targets itself. */
    draggedId: string | null
    /** Where the drop would land in this day, or null when it targets elsewhere. */
    dropForDay: { part: FitnessPlanPart; refId: string | null; after: boolean } | null
    onEntryDragStart: (id: string) => void
    onEntryDragEnd: () => void
    /** Pin the drop before/after `refId` in this day's `part` (null appends). */
    onTarget: (part: FitnessPlanPart, refId: string | null, after: boolean) => void
    onClearTarget: (part: FitnessPlanPart) => void
    onDropEntry: () => void
    onEditFlag: () => void
    onClear: () => void
    onShowClashes: () => void
    onShowOverloads: () => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const t = tally(entries)
    const total = t.workouts + t.sessions + t.mobility + t.recovery
    const rest = total === 0
    const tone = note ? FLAG_TONE[note.color] : null

    // A slot's items in display (order) sequence.
    const slotItems = (part: FitnessPlanPart) =>
        entries.filter((e) => partOf(e) === part).sort((a, b) => a.order - b.order)

    return (
        <Card as="div" flush hover={false} className="flex flex-col gap-3 overflow-hidden p-4">
            {/* A flagged day wears a coloured strip along its top edge. */}
            {tone && <span className={`-mx-4 -mt-4 h-1 ${tone.bar}`} aria-hidden="true" />}
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
                <div className="flex items-center gap-1.5">
                    {clashCount > 0 && (
                        <button
                            type="button"
                            onClick={onShowClashes}
                            aria-label={`${clashCount} calendar clash${clashCount === 1 ? '' : 'es'} — view`}
                            title={`${clashCount} calendar clash${clashCount === 1 ? '' : 'es'}`}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-amber-500 transition-colors hover:bg-amber-50 hover:text-amber-600"
                        >
                            <i
                                className="fa-solid fa-triangle-exclamation text-[13px]"
                                aria-hidden="true"
                            />
                        </button>
                    )}
                    {overloadCount > 0 && (
                        <button
                            type="button"
                            onClick={onShowOverloads}
                            aria-label={`${overloadCount} overloaded slot${overloadCount === 1 ? '' : 's'} — view`}
                            title={`${overloadCount} overloaded slot${overloadCount === 1 ? '' : 's'}`}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-violet-500 transition-colors hover:bg-violet-50 hover:text-violet-600"
                        >
                            <i className="fa-solid fa-gauge-high text-[13px]" aria-hidden="true" />
                        </button>
                    )}
                    {isToday && (
                        <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[10px] font-semibold text-coral-600">
                            Today
                        </span>
                    )}
                    {editable && total > 0 && (
                        <button
                            type="button"
                            onClick={onClear}
                            aria-label={`Clear ${weekday}`}
                            title="Clear day"
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
                        >
                            <i className="fa-solid fa-broom text-[11px]" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            {/* The day's flag: a coloured label chip, or a prompt to add one in edit mode. */}
            {note && tone ? (
                <button
                    type="button"
                    onClick={editable ? onEditFlag : undefined}
                    aria-label={editable ? 'Edit day flag' : undefined}
                    className={`flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.chip} ${
                        editable ? 'transition-opacity hover:opacity-80' : 'cursor-default'
                    }`}
                >
                    <i className="fa-solid fa-flag text-[9px]" aria-hidden="true" />
                    <span className="truncate">{note.label || 'Flagged'}</span>
                </button>
            ) : (
                editable && (
                    <button
                        type="button"
                        onClick={onEditFlag}
                        className="flex items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] font-semibold text-neutral-300 transition-colors hover:text-neutral-500"
                    >
                        <i className="fa-solid fa-flag text-[9px]" aria-hidden="true" />
                        Flag day
                    </button>
                )
            )}

            <div className="flex flex-col gap-3">
                {FITNESS_PLAN_PARTS.map((part) => (
                    <SlotSection
                        key={part}
                        part={part}
                        editable={editable}
                        entries={slotItems(part)}
                        isDone={isDone}
                        onAdd={() => onAdd(part)}
                        onOpen={onOpen}
                        onRemove={onRemove}
                        dragActive={dragActive}
                        draggedId={draggedId}
                        drop={dropForDay && dropForDay.part === part ? dropForDay : null}
                        onEntryDragStart={onEntryDragStart}
                        onEntryDragEnd={onEntryDragEnd}
                        onTarget={(refId, after) => onTarget(part, refId, after)}
                        onClearTarget={() => onClearTarget(part)}
                        onDropEntry={onDropEntry}
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
 * of items of any category, each carrying its own colour. Every slot is always
 * shown, so a day reads the same shape throughout: an empty one says "Nothing
 * this morning" in view mode, and in edit mode offers an add control that opens
 * the picker pre-targeted to this slot.
 */
function SlotSection({
    part,
    editable,
    entries,
    isDone,
    onAdd,
    onOpen,
    onRemove,
    dragActive,
    draggedId,
    drop,
    onEntryDragStart,
    onEntryDragEnd,
    onTarget,
    onClearTarget,
    onDropEntry,
}: {
    part: FitnessPlanPart
    editable: boolean
    entries: FitnessPlanEntry[]
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    onAdd: () => void
    onOpen: (entry: FitnessPlanEntry) => void
    onRemove: (id: string) => void
    /** True while an item of this day is being dragged, so slots show as drop targets. */
    dragActive: boolean
    /** The id of the row in flight, if any — it never acts as its own drop target. */
    draggedId: string | null
    /** Where the drop would land in this slot, or null when it targets elsewhere. */
    drop: { refId: string | null; after: boolean } | null
    onEntryDragStart: (id: string) => void
    onEntryDragEnd: () => void
    /** Pin the drop before/after `refId` (null appends to the slot's end). */
    onTarget: (refId: string | null, after: boolean) => void
    onClearTarget: () => void
    onDropEntry: () => void
}) {
    const meta = PART_META[part]
    const listRef = useRef<HTMLUListElement>(null)

    // The whole slot is one continuous drop target: rather than hit-testing
    // individual rows (which leaves dead gaps between them), we pick the insertion
    // point from the cursor's Y against each row's midpoint. That makes every
    // "between items" zone span from one row's middle to the next — a large,
    // forgiving target with no seams. Skips the row in flight so its own space
    // merges into its neighbours' zones instead of showing a self-drop.
    const targetForY = (clientY: number): { refId: string | null; after: boolean } => {
        const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-plan-row]')
        if (rows) {
            for (const row of Array.from(rows)) {
                const id = row.getAttribute('data-plan-row')
                if (id === draggedId) continue
                const rect = row.getBoundingClientRect()
                if (clientY < rect.top + rect.height / 2) return { refId: id, after: false }
            }
        }
        return { refId: null, after: false }
    }

    const containerDropProps = dragActive
        ? {
              onDragOver: (e: DragEvent) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  const t = targetForY(e.clientY)
                  onTarget(t.refId, t.after)
              },
              onDragLeave: (e: DragEvent) => {
                  // Ignore bubbling from children; only clear when leaving the slot.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) onClearTarget()
              },
              onDrop: (e: DragEvent) => {
                  e.preventDefault()
                  onDropEntry()
              },
          }
        : {}

    return (
        <div
            {...containerDropProps}
            className={`flex flex-col gap-1.5 rounded-lg transition-colors ${
                drop ? 'bg-coral-50 ring-1 ring-inset ring-coral-300' : ''
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
                <ul ref={listRef} className="flex flex-col gap-2">
                    {entries.map((e) => (
                        <PlannedRow
                            key={e._id}
                            entry={e}
                            done={isDone(e)}
                            dropId={e._id}
                            onOpen={() => onOpen(e)}
                            onRemove={editable ? () => onRemove(e._id) : undefined}
                            draggable={editable}
                            onDragStart={() => onEntryDragStart(e._id)}
                            onDragEnd={onEntryDragEnd}
                            dropEdge={
                                drop && drop.refId === e._id
                                    ? drop.after
                                        ? 'bottom'
                                        : 'top'
                                    : null
                            }
                        />
                    ))}
                    {drop && drop.refId === null && <DropLine />}
                </ul>
            ) : editable ? (
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
            ) : (
                <p className="py-1 text-[11px] italic text-neutral-300">
                    Nothing this {meta.label.toLowerCase()}
                </p>
            )}
        </div>
    )
}

/** The coral marker showing where a dragged row will drop within a slot. */
function DropLine() {
    return <li aria-hidden="true" className="h-0.5 rounded-full bg-coral-400" />
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
    done = false,
    onOpen,
    onRemove,
    draggable = false,
    onDragStart,
    onDragEnd,
    dropId,
    dropEdge = null,
}: {
    entry: FitnessPlanEntry
    /** When true the item has a matching completion log — shows a green tick. */
    done?: boolean
    onOpen?: () => void
    onRemove?: () => void
    /** When true the row can be dragged to another slot of its day (week view). */
    draggable?: boolean
    onDragStart?: () => void
    onDragEnd?: () => void
    /** Marks the row for the slot's geometry-based drop targeting (`data-plan-row`). */
    dropId?: string
    /**
     * Which edge to mark as the pending drop spot, or null for none. Drawn as an
     * overlay so it never shifts the row's box — otherwise the row would slide out
     * from under the cursor mid-drag and the target would flicker.
     */
    dropEdge?: 'top' | 'bottom' | null
}) {
    const name = planItemName(entry)
    const tone = KIND_TONE[entry.kind]
    const [dragging, setDragging] = useState(false)

    const body = (
        <>
            <div className="flex items-center gap-1.5">
                {done && (
                    <i
                        className="fa-solid fa-circle-check shrink-0 text-[12px] text-emerald-500"
                        aria-label="Done"
                        title="Completed"
                    />
                )}
                <p className="truncate text-[13px] font-semibold text-neutral-700">{name}</p>
            </div>
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
            ) : entry.kind === 'mobility' && entry.mobility ? (
                <div className="mt-0.5 flex items-center gap-1.5">
                    <KindChip kind="mobility" />
                    {entry.mobility.duration > 0 && (
                        <span className="text-[11px] tabular-nums text-neutral-400">
                            {entry.mobility.duration} min
                        </span>
                    )}
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
            data-plan-row={dropId}
            className={`relative flex items-center gap-1.5 rounded-xl px-2.5 py-2 ${tone.row} ${
                draggable ? 'cursor-grab active:cursor-grabbing' : ''
            } ${dragging ? 'opacity-40' : ''}`}
        >
            {dropEdge && (
                <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-coral-400 ${
                        dropEdge === 'top' ? '-top-[5px]' : '-bottom-[5px]'
                    }`}
                />
            )}
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
    mobility,
    entries,
    isDone,
    onClose,
    onAdd,
    onRemove,
}: {
    target: { date: string; part: FitnessPlanPart } | null
    editable: boolean
    workouts: Workout[]
    sessions: ConditioningSession[]
    recovery: Recovery[]
    mobility: Mobility[]
    entries: FitnessPlanEntry[]
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
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
            (a, b) =>
                Number(b.showInPlanner) - Number(a.showInPlanner) || a.name.localeCompare(b.name)
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

    const mobilityResults = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q
            ? mobility.filter(
                  (m) =>
                      m.name.toLowerCase().includes(q) ||
                      (m.purpose ?? '').toLowerCase().includes(q)
              )
            : mobility
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [mobility, query])

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
                                            done={isDone(e)}
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
                                                    onAdd(
                                                        view.date,
                                                        'conditioning',
                                                        s._id,
                                                        activePart
                                                    )
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
                        ) : kind === 'mobility' ? (
                            mobilityResults.length === 0 ? (
                                <p className="py-6 text-center text-sm text-neutral-400">
                                    No mobility routines found.
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {mobilityResults.map((m) => (
                                        <li key={m._id}>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    view &&
                                                    onAdd(view.date, 'mobility', m._id, activePart)
                                                }
                                                className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-neutral-800">
                                                        {m.name}
                                                    </p>
                                                    <p className="text-xs tabular-nums text-neutral-400">
                                                        {m.duration} min
                                                        {m.parts.length > 0
                                                            ? ` · ${m.parts.length} ${m.parts.length === 1 ? 'part' : 'parts'}`
                                                            : ''}
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
                                                view &&
                                                onAdd(view.date, 'recovery', r._id, activePart)
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
    done,
    onClose,
    onLogged,
    onLogWeights,
}: {
    entry: FitnessPlanEntry | null
    exercisesById: Map<string, Exercise>
    /** Whether this item already has a completion log on its day. */
    done: boolean
    onClose: () => void
    /** Called after an item is logged, so the planner can tick its row. */
    onLogged: (entry: FitnessPlanEntry) => void
    /** Open the per-set weight logger for a planned workout, dated to its day. */
    onLogWeights: (workout: Workout, date: string) => void
}) {
    // Retain the last entry while the drawer animates closed.
    const [view, setView] = useState<FitnessPlanEntry | null>(entry)
    useEffect(() => {
        if (entry) setView(entry)
    }, [entry])

    const toast = useToast()
    const [logging, setLogging] = useState(false)

    // Completed-round tallies for a conditioning session, keyed by part index.
    // Reset whenever a different entry opens; snapshotted into the log on "done".
    const [counts, setCounts] = useState<Record<number, number>>({})
    useEffect(() => {
        if (entry) setCounts({})
    }, [entry])

    const e = view
    const title = e ? (planItemName(e) ?? KIND_META[e.kind].label) : 'Details'

    // Any planned item can be logged straight from the planner — "Mark as done"
    // snapshots the library item into a completed record dated to the planned day,
    // mirroring the Done buttons in each category's log. Already-done items show a
    // static "Done" chip instead.
    const canMarkDone =
        !!e &&
        !done &&
        ((e.kind === 'workout' && !!e.workout) ||
            (e.kind === 'conditioning' && !!e.session) ||
            (e.kind === 'mobility' && !!e.mobility) ||
            (e.kind === 'recovery' && !!e.recovery))

    async function markDone() {
        if (!e) return
        setLogging(true)
        try {
            if (e.kind === 'workout' && e.workout) {
                await createWorkoutLog({ workout: e.workout._id, date: e.date })
                toast.show(`Logged “${e.workout.name}”.`, 'success')
            } else if (e.kind === 'conditioning' && e.session) {
                // Snapshot the tapped-out rounds for each counted part.
                const rounds: RoundProgress[] = e.session.parts
                    .map((part, i) =>
                        part.rounds
                            ? { name: part.name, done: counts[i] ?? 0, target: part.rounds }
                            : null
                    )
                    .filter((r): r is RoundProgress => r !== null)
                await createConditioningLog({
                    session: e.session._id,
                    date: e.date,
                    duration: e.session.duration,
                    rounds: rounds.length > 0 ? rounds : undefined,
                })
                toast.show(`Logged “${e.session.name}”.`, 'success')
            } else if (e.kind === 'mobility' && e.mobility) {
                await createMobilityLog({
                    mobility: e.mobility._id,
                    date: e.date,
                    duration: e.mobility.duration,
                })
                toast.show(`Logged “${e.mobility.name}”.`, 'success')
            } else if (e.kind === 'recovery' && e.recovery) {
                await createRecoveryLog({
                    recovery: e.recovery._id,
                    date: e.date,
                    duration: e.recovery.duration,
                })
                toast.show(`Logged “${e.recovery.name}”.`, 'success')
            }
            onLogged(e)
            onClose()
        } catch {
            toast.show('Could not log that — please try again.', 'danger')
        } finally {
            setLogging(false)
        }
    }

    return (
        <Drawer
            open={!!entry}
            onClose={onClose}
            size="xl"
            title={title}
            badge={e ? shortDayLabel(e.date) : undefined}
            footer={
                <>
                    <Button variant="ghost" className="mr-auto" onClick={onClose}>
                        Close
                    </Button>
                    {done && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
                            <i className="fa-solid fa-circle-check" aria-hidden="true" />
                            Done
                        </span>
                    )}
                    {canMarkDone && (
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-check"
                            onClick={markDone}
                            disabled={logging}
                        >
                            {logging ? 'Logging…' : 'Mark as done'}
                        </Button>
                    )}
                    {e?.kind === 'workout' && e.workout && (
                        <Button
                            icon="fa-solid fa-dumbbell"
                            onClick={() => e.workout && onLogWeights(e.workout, e.date)}
                        >
                            Log sets
                        </Button>
                    )}
                </>
            }
        >
            {e &&
                (e.kind === 'workout' && e.workout ? (
                    <WorkoutDetail workout={e.workout} exercisesById={exercisesById} />
                ) : e.kind === 'conditioning' && e.session ? (
                    <ConditioningSessionDetail
                        session={e.session}
                        counts={counts}
                        onCount={(i, next) => setCounts((c) => ({ ...c, [i]: next }))}
                    />
                ) : e.kind === 'mobility' && e.mobility ? (
                    <MobilityDetail mobility={e.mobility} />
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
                <p className="whitespace-pre-wrap text-sm text-neutral-600">
                    {workout.description}
                </p>
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

function MobilityDetail({ mobility }: { mobility: Mobility }) {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <KindChip kind="mobility" />
                {mobility.duration > 0 && (
                    <span className="text-sm text-neutral-500">{mobility.duration} min</span>
                )}
            </div>

            {mobility.purpose && (
                <DetailSection label="Purpose">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">
                        {mobility.purpose}
                    </p>
                </DetailSection>
            )}

            {mobility.parts.length > 0 && (
                <DetailSection label="Routine parts">
                    <ol className="flex flex-col gap-3">
                        {mobility.parts.map((part, i) => (
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

            {mobility.howToUse && (
                <DetailSection label="How to use">
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">
                        {mobility.howToUse}
                    </p>
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
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">
                        {recovery.purpose}
                    </p>
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

// ─── Flag editor drawer ─────────────────────────────────────────────────────────

/**
 * The editor for a day or week flag: pick a colour, give it a short label (with
 * quick suggestions), and save. Editing an existing flag also offers Remove.
 * `target` decides the scope + date; the drawer keeps its content while closing.
 */
function FlagEditorDrawer({
    target,
    note,
    onClose,
    onSave,
    onRemove,
}: {
    target: { scope: FitnessNoteScope; date: string } | null
    note: FitnessPlanNote | null
    onClose: () => void
    onSave: (
        scope: FitnessNoteScope,
        date: string,
        color: FitnessFlagColor,
        label: string
    ) => Promise<void>
    onRemove: (id: string) => void
}) {
    // Retain the last target so the drawer keeps its content while sliding shut.
    const [view, setView] = useState(target)
    const [color, setColor] = useState<FitnessFlagColor>(DEFAULT_FLAG_COLOR)
    const [label, setLabel] = useState('')
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (target) {
            setView(target)
            setColor(note?.color ?? DEFAULT_FLAG_COLOR)
            setLabel(note?.label ?? '')
        }
    }, [target, note])

    const scope = view?.scope ?? 'day'
    const title = scope === 'week' ? 'Flag week' : 'Flag day'
    const badge = view
        ? scope === 'week'
            ? formatWeekRange(view.date, addDays(view.date, 6))
            : shortDayLabel(view.date)
        : undefined

    async function handleSave() {
        if (!view) return
        setSaving(true)
        try {
            await onSave(view.scope, view.date, color, label.trim())
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            title={title}
            badge={badge}
            footer={
                <div className="flex w-full items-center justify-between">
                    {note ? (
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash"
                            onClick={() => onRemove(note._id)}
                            className="text-red-600 hover:bg-red-50"
                        >
                            Remove
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" onClick={handleSave} disabled={saving}>
                            {note ? 'Save' : 'Add flag'}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Colour
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {FITNESS_FLAG_COLORS.map((c) => {
                            const active = c === color
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    aria-label={FLAG_TONE[c].name}
                                    title={FLAG_TONE[c].name}
                                    onClick={() => setColor(c)}
                                    className={`grid h-8 w-8 place-items-center rounded-full ${FLAG_TONE[c].dot} transition-transform hover:scale-105 ${
                                        active
                                            ? 'ring-2 ring-neutral-900 ring-offset-2'
                                            : 'ring-1 ring-inset ring-black/10'
                                    }`}
                                >
                                    {active && (
                                        <i
                                            className="fa-solid fa-check text-[11px] text-white"
                                            aria-hidden="true"
                                        />
                                    )}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Label
                    </p>
                    <Input
                        placeholder={scope === 'week' ? 'e.g. Deload week' : 'e.g. Key session'}
                        value={label}
                        maxLength={80}
                        onChange={(e) => setLabel(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {FLAG_SUGGESTIONS[scope].map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setLabel(s)}
                                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </Drawer>
    )
}
