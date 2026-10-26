import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Spinner from './Spinner'
import Button from './Button'
import Input from './Input'
import Pagination from './Pagination'
import EmptyState from './EmptyState'
import Drawer from './Drawer'
import BottomSheet from './BottomSheet'
import Textarea from './Textarea'
import ConfirmModal from './ConfirmModal'
import Modal from './Modal'
import ContextMenu from './ContextMenu'
import { type MenuEntry, type MenuItem } from './DropdownMenu'
import ConditioningSessionDetail from './ConditioningSessionDetail'
import { clearTicks, useStepTicks, workoutStepsKey } from './session/SessionUI'
import WorkoutDetail from './session/WorkoutDetail'
import { WorkoutLogSummary } from './WorkoutsLog'
import { conditioningPayload } from './useConditioningLog'
import { listWorkouts } from '../services/workouts'
import { listSessions } from '../services/conditioning'
import { listExercises } from '../services/exercises'
import {
    createLog as createWorkoutLog,
    listLogs as listWorkoutLogs,
    deleteLog as deleteWorkoutLog,
    type WorkoutLogInput,
} from '../services/workoutLogs'
import WorkoutLogWeightsDrawer from './WorkoutLogWeightsDrawer'
import PlannerExportDrawer from './PlannerExportDrawer'
import {
    listLogs as listConditioningLogs,
    createLog as createConditioningLog,
    deleteLog as deleteConditioningLog,
} from '../services/conditioningLogs'
import ConditioningLogDrawer, { type ConditioningLogTarget } from './ConditioningLogDrawer'
import { ConditioningLogSummary } from './ConditioningSessionsLog'
import { clearTaps, EMPTY_TAPS } from '../lib/sessionPace'
import { clearDraft } from '../lib/workoutLogDraft'
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
} from '../services/fitnessPlan'
import { FITNESS_PLAN_KINDS, FITNESS_PLAN_PARTS, FITNESS_FLAG_COLORS } from '../types'
import type {
    WorkoutLog,
    ConditioningLog,
    Workout,
    Exercise,
    ConditioningSession,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanPart,
    FitnessPlanNote,
    FitnessNoteScope,
    FitnessFlagColor,
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
import {
    HeroShell,
    HeroIconButton,
    HeroButton,
    DayStrip,
    DayPill,
    DayCardShell,
    SwipeHint,
    dayCardId,
    isWide,
    scrollToDay,
    relativeWeekLabel,
    useDaySlider,
    useMediaQuery,
    LARGE_QUERY,
} from './planner/WeekPlannerUI'
import {
    HeroMenu,
    DayMenu,
    DayTitle,
    PlanSlot,
    PlanRow,
    RowTick,
    rowButtonSize,
    WeekClipboardBanner,
    CopiedBanner,
    CopyWeekDrawer,
    Segmented,
    PickRow,
    PICK_LABEL,
} from './planner/PlannerParts'
import { estimateWorkoutMinutes } from '../lib/phases'
import { restDayNote } from '../lib/restDayMessage'

// ─── Kind presentation ────────────────────────────────────────────────────────

const KIND_META: Record<FitnessPlanKind, { label: string; noun: string; icon: string }> = {
    workout: { label: 'Strength', noun: 'workout', icon: 'fa-solid fa-dumbbell' },
    conditioning: { label: 'Conditioning', noun: 'session', icon: 'fa-solid fa-heart-pulse' },
}

/** A short lower-case description of a set of kinds, e.g. "strength" or "everything". */
function kindsLabel(kinds: FitnessPlanKind[]): string {
    if (kinds.length >= FITNESS_PLAN_KINDS.length) return 'everything'
    return kinds.map((k) => KIND_META[k].label.toLowerCase()).join(' + ')
}

// Each plan kind carries its own colour so the categories read apart at a
// glance — coral for strength, sky for conditioning (matching the chips used
// elsewhere in Fitness).
const KIND_TONE: Record<
    FitnessPlanKind,
    { label: string; icon: string; row: string; chip: string; tile: string; dot: string }
> = {
    workout: {
        label: 'text-coral-600',
        icon: 'text-coral-500',
        row: 'border-l-2 border-coral-300 bg-coral-50/60',
        chip: 'bg-coral-50 text-coral-700',
        tile: 'bg-coral-50 text-coral-500',
        dot: 'bg-coral-500',
    },
    conditioning: {
        label: 'text-sky-600',
        icon: 'text-sky-500',
        row: 'border-l-2 border-sky-300 bg-sky-50/60',
        chip: 'bg-sky-50 text-sky-700',
        tile: 'bg-sky-50 text-sky-500',
        dot: 'bg-sky-500',
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
    return entry.session?.name
}

// ─── Completion (done) tracking ────────────────────────────────────────────────

/**
 * A planned item is "done" once a matching log exists for its library item on its
 * day. Logs are keyed by kind + library id + date so a tick can be shown on the
 * planned row.
 */
function doneKey(kind: FitnessPlanKind, libId: string, date: string): string {
    return `${kind}:${libId}:${date}`
}

/** The library item id behind a planned entry, whichever category it is. */
function entryLibId(entry: FitnessPlanEntry): string | undefined {
    if (entry.kind === 'workout') return entry.workout?._id
    return entry.session?._id
}

/** The done-key for a planned entry, or null when its library item is missing. */
function entryDoneKey(entry: FitnessPlanEntry): string | null {
    const id = entryLibId(entry)
    return id ? doneKey(entry.kind, id, entry.date) : null
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
    /**
     * True once the clash has been accepted on the entry (`ignoreClash`). It stays
     * in the list so it can be taken back, but stops counting as a live warning.
     */
    acknowledged: boolean
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

/** Why a slot can't take a clashing item — or null when it's free to move into. */
type SlotBlock = 'busy' | 'full' | null

/** One of the entry's own day's other slots, and whether it could move there. */
interface SlotOption {
    part: FitnessPlanPart
    blocked: SlotBlock
    /** The events occupying it, when `blocked` is 'busy' — named in the tooltip. */
    events: Event[]
}

/**
 * Where a clashing item could go instead: every other slot of its own day, in
 * natural order — morning → afternoon → evening — each marked with what stands
 * in its way. A slot is 'full' once two sessions share it, and 'busy' when an
 * event covers it (an all-day event covers every slot). Both are offered rather
 * than hidden, so the reason a slot is out is visible instead of implied; when
 * every one is blocked the clash simply has no resolution.
 */
function resolutionSlots(
    entry: FitnessPlanEntry,
    dayEntries: FitnessPlanEntry[],
    events: Event[]
): SlotOption[] {
    const current = partOf(entry)
    return FITNESS_PLAN_PARTS.filter((part) => part !== current).map((part) => {
        const covering = events.filter(
            (e) =>
                !e.ignoreClash &&
                (eventCoversAllDay(e, entry.date) || eventCoversSlot(e, entry.date, part))
        )
        // Slot capacity: at most two planned sessions share a slot.
        const full = dayEntries.filter((e) => partOf(e) === part).length >= 2
        return {
            part,
            blocked: covering.length > 0 ? 'busy' : full ? 'full' : null,
            events: covering,
        }
    })
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

/**
 * A day's overloaded slot as the planner shows it: the slot itself, plus whether
 * its load has been accepted. An accepted one stays in the list so it can be
 * taken back, but stops counting as a live warning.
 */
interface SlotOverload extends DayOverload {
    acknowledged: boolean
}

/** The slots of one day holding more than one hard session, in slot order. */
function overloadsIn(dayEntries: FitnessPlanEntry[]): DayOverload[] {
    return findOverloads([...dayEntries].sort((a, b) => a.order - b.order))
}

/**
 * Whether a slot's load has been accepted. Every session sharing the slot has to
 * carry the flag: a session moved in afterwards hasn't been weighed against the
 * others, so it brings the warning back with it.
 */
function overloadAcknowledged(overload: DayOverload): boolean {
    return overload.entries.every((e) => e.ignoreOverload === true)
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

/**
 * The fitness week planner, built from the same parts as the Nutrition one and
 * laid out the same way: a week hero with the day strip, and a card per day
 * split into morning, afternoon and evening. Wide screens get the seven days
 * side by side; phones one day at a time.
 *
 * There's one mode: each slot's + adds to it, sessions tick off as they're
 * done (a quick log — the logger is a tap away in the session's drawer), open
 * for a closer look (and Remove), and drag between slots and days on a wide
 * screen. Copy, paste, flags, export and clear live in the ⋯ menus.
 */
export default function FitnessWeeklyPlanner({ startOn }: { startOn?: string }) {
    // Wide screens always get the full-width week board; smaller ones a day feed
    // (one day at a time on a phone).
    const board = useMediaQuery(LARGE_QUERY)
    // The anchor is any day inside the week on show; the week's Monday is derived
    // from it. Planning is week by week — one calendar week at a time. `startOn`
    // opens on a different week — applying a plan whose first session is next
    // month should land there, not on an empty view of this week.
    const [anchor, setAnchor] = useState(() => startOn ?? todayKey())
    const [workouts, setWorkouts] = useState<Workout[]>([])
    const [sessions, setSessions] = useState<ConditioningSession[]>([])
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [libLoading, setLibLoading] = useState(true)
    const [entries, setEntries] = useState<FitnessPlanEntry[]>([])
    const [notes, setNotes] = useState<FitnessPlanNote[]>([])
    // Calendar events across the displayed week, used to flag slot clashes.
    const [events, setEvents] = useState<Event[]>([])
    // Completed items in the displayed week: kind:libId:date → the id of the log
    // that completed it, so a planned row can show a tick once its matching log
    // exists — and undo it by deleting that log again.
    const [doneLogs, setDoneLogs] = useState<Map<string, string>>(new Map())
    // Rows whose tick is being saved, so a double tap can't log twice.
    const [ticking, setTicking] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(true)
    // The add drawer: a day + slot to add to (the slot and type can change inside).
    const [picker, setPicker] = useState<{ date: string; part: FitnessPlanPart } | null>(null)
    // A day or week whose flag+label is being edited (opens the flag editor).
    const [flagTarget, setFlagTarget] = useState<{
        scope: FitnessNoteScope
        date: string
    } | null>(null)
    // A planned item opened for a closer look.
    const [detail, setDetail] = useState<FitnessPlanEntry | null>(null)
    // A planned strength workout being logged with per-set weights, and the day
    // it's dated to (opened from the detail drawer).
    const [logTarget, setLogTarget] = useState<{ workout: Workout; date: string } | null>(null)
    // A planned conditioning session open in the session logger.
    const [sessionTarget, setSessionTarget] = useState<ConditioningLogTarget | null>(null)
    // The planner export drawer — writes the weeks out as JSON, as they stand.
    const [exportOpen, setExportOpen] = useState(false)
    // A session copied to paste into another slot or day, and an open right-click menu.
    const [copied, setCopied] = useState<FitnessPlanEntry | null>(null)
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
    // A done session whose tick was tapped — un-ticking deletes its log, so it asks first.
    const [unlogTarget, setUnlogTarget] = useState<FitnessPlanEntry | null>(null)
    // A copied week held for pasting elsewhere: the source Monday plus which
    // categories were copied. Only those categories are overwritten on paste.
    const [clipboard, setClipboard] = useState<{ from: string; kinds: FitnessPlanKind[] } | null>(
        null
    )
    // Choosing which categories to copy, and confirming a paste that would replace sessions.
    const [copying, setCopying] = useState(false)
    const [pasteConfirm, setPasteConfirm] = useState(false)
    // A pending "clear" awaiting confirmation: a single day, or the whole week.
    const [clearTarget, setClearTarget] = useState<
        { type: 'day'; date: string } | { type: 'week' } | null
    >(null)
    // The day whose calendar clashes are open in the clash modal, if any.
    const [clashDate, setClashDate] = useState<string | null>(null)
    // A day whose calendar events are open in the sheet.
    const [eventsDate, setEventsDate] = useState<string | null>(null)
    // The day whose overloaded slots are open in the overload modal, if any.
    const [overloadDate, setOverloadDate] = useState<string | null>(null)

    const today = todayKey()
    const toast = useToast()

    // Whether a planned item has a matching completion log on its day.
    const isDone = (entry: FitnessPlanEntry) => {
        const k = entryDoneKey(entry)
        return k ? doneLogs.has(k) : false
    }

    // The id of the log that completed a planned item, when there is one.
    const doneLogIdOf = (entry: FitnessPlanEntry) => {
        const k = entryDoneKey(entry)
        return (k ? doneLogs.get(k) : undefined) ?? null
    }

    // Sessions still to do — the only ones a clear or a paste replaces.
    const clearable = (entry: FitnessPlanEntry) => !isDone(entry)

    // Mark a kind's library item as done on a date, so its planned rows tick.
    function markDoneKey(kind: FitnessPlanKind, libId: string, date: string, logId: string) {
        setDoneLogs((prev) => new Map(prev).set(doneKey(kind, libId, date), logId))
    }

    // Untick a planned item — its completion log has just been deleted.
    function clearDoneKey(kind: FitnessPlanKind, libId: string, date: string) {
        setDoneLogs((prev) => {
            const next = new Map(prev)
            next.delete(doneKey(kind, libId, date))
            return next
        })
    }

    // A planned session ticked off without going through the logger: its
    // library item is logged as it stands, dated to the planned day — the same
    // as the Done buttons in each category's log.
    async function markDone(entry: FitnessPlanEntry) {
        try {
            let logId: string
            if (entry.kind === 'workout' && entry.workout) {
                logId = (await createWorkoutLog({ workout: entry.workout._id, date: entry.date }))._id
            } else if (entry.kind === 'conditioning' && entry.session) {
                logId = (
                    await createConditioningLog(
                        conditioningPayload(entry.session, entry.date, EMPTY_TAPS)
                    )
                )._id
            } else return
            const libId = entryLibId(entry)
            if (libId) markDoneKey(entry.kind, libId, entry.date, logId)
            toast.show(`Logged “${planItemName(entry)}”.`, 'success')
        } catch {
            toast.show('Could not log that — please try again.', 'danger')
            throw new Error('log failed')
        }
    }

    // Undo a completion: delete the log behind it, in whichever category's log it
    // was recorded, then untick the row. Marking done can always be redone.
    async function unmarkDone(entry: FitnessPlanEntry) {
        const logId = doneLogIdOf(entry)
        const libId = entryLibId(entry)
        if (!logId || !libId) return
        try {
            if (entry.kind === 'workout') await deleteWorkoutLog(logId)
            else await deleteConditioningLog(logId)
        } catch {
            toast.show('Could not undo that — please try again.', 'danger')
            throw new Error('unlog failed')
        }
        clearDoneKey(entry.kind, libId, entry.date)
        // Start over: nothing from the undone session stays ticked on this
        // device — sub-list steps, a strength draft, conditioning presses.
        const ticksKey = stepTicksKey(entry)
        if (ticksKey) clearTicks(ticksKey)
        if (entry.kind === 'workout' && entry.workout) clearDraft(entry.workout._id)
        if (entry.kind === 'conditioning') clearTaps(entry._id)
        toast.show(`“${planItemName(entry) ?? 'Item'}” is no longer marked done.`, 'success')
    }

    // The row's tick: a quick log, or — on a done session — the way back, after
    // asking, since it deletes the log and anything recorded on it.
    function handleTick(entry: FitnessPlanEntry) {
        if (ticking.has(entry._id)) return
        if (isDone(entry)) {
            setUnlogTarget(entry)
            return
        }
        setTicking((prev) => new Set(prev).add(entry._id))
        markDone(entry)
            .catch(() => {})
            .finally(() =>
                setTicking((prev) => {
                    const next = new Set(prev)
                    next.delete(entry._id)
                    return next
                })
            )
    }

    // Log a planned workout with the per-set weights entered in the weight drawer.
    async function handleLogWeights(workout: Workout, fields: WorkoutLogInput) {
        const log = await createWorkoutLog(fields)
        markDoneKey('workout', workout._id, fields.date, log._id)
        toast.show(`Logged “${workout.name}”.`, 'success')
        // Handed back so the drawer can keep saving into this log as the session runs.
        return log
    }

    // The week to fetch — and to tally totals over. Planning is week by week.
    const range = useMemo(() => {
        const start = mondayOf(anchor)
        return { start, end: addDays(start, 6) }
    }, [anchor])

    // The libraries — loaded once, for the add drawer, the "is it empty" check
    // and the detail drawer (exercises resolve a workout's exercise names).
    useEffect(() => {
        Promise.all([listWorkouts(), listSessions(), listExercises()])
            .then(([wk, se, ex]) => {
                setWorkouts(wk)
                setSessions(se)
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
        ])
            .then(([rows, noteRows, eventRows, wLogs, cLogs]) => {
                if (!active) return
                setEntries(rows)
                setNotes(noteRows)
                setEvents(eventRows)
                // Build the week's completion keys from each kind's logs. Logs with
                // no library link (their item was deleted) can't match a plan row.
                const keys = new Map<string, string>()
                for (const l of wLogs)
                    if (l.workout && inRange(l.date))
                        keys.set(doneKey('workout', l.workout, l.date), l._id)
                for (const l of cLogs)
                    if (l.session && inRange(l.date))
                        keys.set(doneKey('conditioning', l.session, l.date), l._id)
                setDoneLogs(keys)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end])

    function step(dir: -1 | 1) {
        setAnchor((a) => addDays(mondayOf(a), dir * 7))
    }

    async function handleAdd(
        date: string,
        kind: FitnessPlanKind,
        itemId: string,
        part: FitnessPlanPart
    ) {
        try {
            const entry = await addPlanEntry(date, kind, itemId, part)
            setEntries((prev) => [...prev, entry])
        } catch {
            toast.show('Could not add that — please try again.', 'danger')
        }
    }

    // Optimistic, putting the row back if the delete fails.
    async function handleRemove(id: string) {
        const removed = entries.find((e) => e._id === id)
        setEntries((prev) => prev.filter((e) => e._id !== id))
        try {
            await deletePlanEntry(id)
        } catch {
            if (removed) setEntries((prev) => [...prev, removed])
            toast.show('Could not remove that — please try again.', 'danger')
        }
    }

    function copyEntry(entry: FitnessPlanEntry) {
        setCopied(entry)
        toast.show(`Copied ${planItemName(entry) ?? 'session'} — right-click a slot, or tap +, to paste it`, 'info')
    }

    // A copied session into another slot or day.
    async function pasteInto(date: string, part: FitnessPlanPart) {
        const src = copied
        if (!src) return
        const item = entryLibId(src)
        if (!item) {
            toast.show('That session has left your library, so it can’t be pasted.', 'danger')
            return
        }
        await handleAdd(date, src.kind, item, part)
    }

    function openRowMenu(ev: { clientX: number; clientY: number }, entry: FitnessPlanEntry) {
        setMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: [
                { label: 'Copy', icon: 'fa-solid fa-copy', onClick: () => copyEntry(entry) },
                { label: 'Open', icon: 'fa-solid fa-up-right-from-square', onClick: () => setDetail(entry) },
                {
                    label: 'Remove',
                    icon: 'fa-solid fa-trash-can',
                    danger: true,
                    onClick: () => void handleRemove(entry._id),
                },
            ],
        })
    }

    function openSlotMenu(
        ev: { clientX: number; clientY: number },
        date: string,
        part: FitnessPlanPart
    ) {
        setMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: [
                ...(copied
                    ? [
                          {
                              label: `Paste ${planItemName(copied) ?? 'session'}`,
                              icon: 'fa-solid fa-paste',
                              onClick: () => void pasteInto(date, part),
                          },
                      ]
                    : []),
                {
                    label: `Add to ${PART_META[part].label.toLowerCase()}…`,
                    icon: 'fa-solid fa-plus',
                    onClick: () => setPicker({ date, part }),
                },
            ],
        })
    }

    // Copy the current week's selected categories to the clipboard for pasting.
    function handleCopyWeek(kinds: FitnessPlanKind[]) {
        setClipboard({ from: range.start, kinds })
    }

    // Paste the clipboard onto the current week — replacing only the copied
    // categories' sessions still to do — then refetch so the grid shows the
    // pasted plan.
    async function handlePasteWeek() {
        if (!clipboard) return
        const keep = entries
            .filter((e) => e.date >= range.start && e.date <= range.end && isDone(e))
            .map((e) => e._id)
        try {
            await copyPlanWeek(clipboard.from, range.start, clipboard.kinds, keep)
            setEntries(await listPlanEntries(range.start, range.end))
        } catch {
            toast.show('Could not paste that week — please try again.', 'danger')
        }
    }

    // Clear the sessions still to do from a span of days — done ones stay.
    // Optimistic, reverting on failure.
    async function clearDays(start: string, end: string) {
        const inRange = entries.filter((e) => e.date >= start && e.date <= end)
        const removed = inRange.filter(clearable)
        if (removed.length === 0) return
        const ids = new Set(removed.map((e) => e._id))
        setEntries((prev) => prev.filter((e) => !ids.has(e._id)))
        try {
            await clearPlanRange(
                start,
                end,
                inRange.filter(isDone).map((e) => e._id)
            )
        } catch {
            setEntries((prev) => [...prev, ...removed])
            toast.show('Could not clear that — please try again.', 'danger')
        }
    }

    // Move a planned item to another slot of its own day (from the warnings).
    // Optimistic: the row jumps immediately, then the server records the new slot.
    async function handleMove(id: string, part: FitnessPlanPart) {
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, part } : e)))
        await updatePlanEntry(id, { part })
    }

    // Accept a planned item's calendar clash, or think better of it. Optimistic:
    // the warning goes quiet at once, then the server records the decision. A
    // failed save puts the flag back, so the warning can't be lost to a dropped
    // request — a clash silenced only on screen is worse than one still showing.
    async function handleOverrideClash(id: string, ignoreClash: boolean) {
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, ignoreClash } : e)))
        try {
            await updatePlanEntry(id, { ignoreClash })
        } catch {
            setEntries((prev) =>
                prev.map((e) => (e._id === id ? { ...e, ignoreClash: !ignoreClash } : e))
            )
            toast.show('Could not save that — the clash warning is back.', 'danger')
        }
    }

    // Accept an overloaded slot's load, or think better of it. The decision is
    // the slot's rather than one session's, so it's written to every session
    // sharing it: keeping one of a pair silenced would leave the slot warning on
    // half its contents. Optimistic, and a failed save puts every flag back.
    async function handleOverrideOverload(ids: string[], ignoreOverload: boolean) {
        const flip = (on: boolean) =>
            setEntries((prev) =>
                prev.map((e) => (ids.includes(e._id) ? { ...e, ignoreOverload: on } : e))
            )
        flip(ignoreOverload)
        try {
            await Promise.all(ids.map((id) => updatePlanEntry(id, { ignoreOverload })))
        } catch {
            flip(!ignoreOverload)
            toast.show('Could not save that — the overload warning is back.', 'danger')
        }
    }

    // Skip a planned session (with an optional reason), or take the skip back.
    // Optimistic, and a failed save puts the row back as it was.
    async function handleSkip(entry: FitnessPlanEntry, skipped: boolean, skipReason = '') {
        const before = { skipped: entry.skipped, skipReason: entry.skipReason }
        const after = { skipped, skipReason: skipped ? skipReason.trim() : '' }
        const apply = (patch: Partial<FitnessPlanEntry>) =>
            setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, ...patch } : e)))
        apply(after)
        try {
            await updatePlanEntry(entry._id, after)
            const name = planItemName(entry) ?? 'Session'
            toast.show(skipped ? `Skipped “${name}”.` : `“${name}” is back on.`, 'success')
        } catch {
            apply(before)
            toast.show('Could not save that — please try again.', 'danger')
            throw new Error('skip failed')
        }
    }

    // Reorder a slot from a drag — and, when the dragged item came from another
    // slot or day, move it in at the chosen spot. `ids` is the target slot's new
    // top-to-bottom order. Optimistic, reverting to the snapshot if the save fails.
    async function handleReorder(date: string, part: FitnessPlanPart, ids: string[]) {
        const position = new Map(ids.map((id, i) => [id, i]))
        const snapshot = entries
        setEntries((prev) =>
            prev.map((e) =>
                position.has(e._id) ? { ...e, date, part, order: position.get(e._id)! } : e
            )
        )
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
    }

    async function handleRemoveFlag(id: string) {
        setNotes((prev) => prev.filter((n) => n._id !== id))
        setFlagTarget(null)
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

    // What's on the calendar each day, in the morning, afternoon or evening — an
    // all-day event covers all three; "Other" events (no slot) are left out.
    const calendarByDate = useMemo(() => {
        const m = new Map<string, Event[]>()
        for (let i = 0; i < 7; i++) {
            const date = addDays(range.start, i)
            const on = events.filter((e) =>
                FITNESS_PLAN_PARTS.some((part) => eventCoversSlot(e, date, part))
            )
            if (on.length) m.set(date, on)
        }
        return m
    }, [events, range.start])

    // Clashes keyed by day: each planned item that overlaps a calendar event in
    // its slot (or any all-day event). Days with no clash are absent from the map.
    // Accepted clashes stay in the map, marked, so they can still be taken back —
    // it's the day's badge that stops sounding the alarm for them, not this.
    const clashesByDate = useMemo(() => {
        const m = new Map<string, Clash[]>()
        for (const entry of entries) {
            const clashing = eventsClashingWith(entry, events)
            if (clashing.length === 0) continue
            const list = m.get(entry.date)
            const clash: Clash = {
                entry,
                events: clashing,
                acknowledged: entry.ignoreClash === true,
            }
            if (list) list.push(clash)
            else m.set(entry.date, [clash])
        }
        return m
    }, [entries, events])

    // Overloaded slots keyed by day: each slot holding two hard sessions.
    // Days with nothing doubled up are absent from the map. Accepted slots stay
    // in the map, marked, so they can still be taken back.
    const overloadsByDate = useMemo(() => {
        const m = new Map<string, SlotOverload[]>()
        for (const overload of overloadsIn(entries)) {
            const list = m.get(overload.date)
            const slot: SlotOverload = { ...overload, acknowledged: overloadAcknowledged(overload) }
            if (list) list.push(slot)
            else m.set(overload.date, [slot])
        }
        return m
    }, [entries])

    const libraryEmpty = workouts.length === 0 && sessions.length === 0
    const weekHasClearable = entries.some(clearable)

    // Which categories the displayed week still has sessions to do in — a paste
    // only needs confirming when it would replace one of these.
    const weekKinds = new Set(entries.filter(clearable).map((e) => e.kind))

    const rangeLabel = formatWeekRange(range.start, range.end)

    // Count and label the items a pending clear would remove, for the confirm dialog.
    const clearInfo = (() => {
        if (!clearTarget) return null
        if (clearTarget.type === 'day') {
            const count = entries.filter((e) => e.date === clearTarget.date && clearable(e)).length
            return { count, where: shortDayLabel(clearTarget.date), scope: 'day' as const }
        }
        const count = entries.filter(
            (e) => e.date >= range.start && e.date <= range.end && clearable(e)
        ).length
        return { count, where: rangeLabel, scope: 'week' as const }
    })()

    // Days with a warning still standing, for the hero's week strip.
    const alertDates = new Set<string>()
    for (const [date, list] of clashesByDate)
        if (list.some((c) => !c.acknowledged)) alertDates.add(date)
    for (const [date, list] of overloadsByDate)
        if (list.some((o) => !o.acknowledged)) alertDates.add(date)

    // Keep an open detail drawer in step with the row it was opened from.
    const detailEntry = detail ? (entries.find((e) => e._id === detail._id) ?? null) : null

    // Picking a day focuses it; on wide screens, where every day is on show, it
    // also scrolls there.
    function selectDay(date: string) {
        setAnchor(date)
        if (isWide() && date >= range.start && date <= range.end) scrollToDay('plan', date)
    }

    function requestPaste() {
        if (!clipboard) return
        if (clipboard.kinds.some((k) => weekKinds.has(k))) setPasteConfirm(true)
        else void handlePasteWeek()
    }

    const weekMenu: MenuEntry[] = [
        ...(libraryEmpty
            ? []
            : [{ label: 'Copy week…', icon: 'fa-solid fa-copy', onClick: () => setCopying(true) }]),
        ...(clipboard && clipboard.from !== range.start
            ? [
                  {
                      label: `Paste ${kindsLabel(clipboard.kinds)}`,
                      icon: 'fa-solid fa-paste',
                      onClick: requestPaste,
                  },
              ]
            : []),
        {
            label: weekNote ? 'Edit week flag…' : 'Flag week…',
            icon: 'fa-solid fa-flag',
            onClick: () => setFlagTarget({ scope: 'week', date: range.start }),
        },
        { label: 'Export…', icon: 'fa-solid fa-file-export', onClick: () => setExportOpen(true) },
        ...(weekHasClearable
            ? [
                  'divider' as const,
                  {
                      label: 'Clear week',
                      icon: 'fa-solid fa-broom',
                      danger: true,
                      onClick: () => setClearTarget({ type: 'week' }),
                  },
              ]
            : []),
    ]

    return (
        <div className="flex flex-col gap-6 sm:gap-5">
            <FitnessWeekHero
                weekStart={range.start}
                selected={anchor}
                today={today}
                rangeLabel={rangeLabel}
                entries={entries}
                ready={!(libLoading || loading)}
                isDone={isDone}
                alertDates={alertDates}
                weekNote={weekNote}
                menu={weekMenu}
                onStep={step}
                onSelect={selectDay}
                onPick={setAnchor}
                onEditFlag={() => setFlagTarget({ scope: 'week', date: range.start })}
                board={board}
            />

            {clipboard && (
                <WeekClipboardBanner
                    what={kindsLabel(clipboard.kinds)}
                    fromLabel={formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                    sameWeek={clipboard.from === range.start}
                    onPaste={requestPaste}
                    onForget={() => setClipboard(null)}
                />
            )}

            {copied && (
                <CopiedBanner
                    name={planItemName(copied) ?? 'Session'}
                    forgetLabel="Forget the copied session"
                    onForget={() => setCopied(null)}
                />
            )}

            {libLoading || loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : libraryEmpty && entries.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-calendar-week"
                    title="Nothing to plan with yet"
                    description="Build some workouts or conditioning sessions first, then drop them into the plan."
                />
            ) : (
                <WeekView
                    board={board}
                    weekStart={range.start}
                    selected={anchor}
                    today={today}
                    entries={entries}
                    dayNotes={dayNotes}
                    clashesByDate={clashesByDate}
                    overloadsByDate={overloadsByDate}
                    isDone={(e) => isDone(e) || ticking.has(e._id)}
                    clearable={clearable}
                    onSelect={setAnchor}
                    onAdd={(date, part) => setPicker({ date, part })}
                    onOpen={setDetail}
                    onTick={handleTick}
                    onRowMenu={openRowMenu}
                    onSlotMenu={openSlotMenu}
                    onReorder={handleReorder}
                    onEditFlag={(scope, date) => setFlagTarget({ scope, date })}
                    onClearDay={(date) => setClearTarget({ type: 'day', date })}
                    onShowClashes={setClashDate}
                    onShowOverloads={setOverloadDate}
                    calendarByDate={calendarByDate}
                    onShowEvents={setEventsDate}
                />
            )}

            <AddDrawer
                target={picker}
                workouts={workouts}
                sessions={sessions}
                copied={copied}
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onPaste={pasteInto}
            />

            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

            <PlannedDetailDrawer
                entry={detailEntry}
                exercisesById={exercisesById}
                done={detailEntry ? isDone(detailEntry) : false}
                doneLogId={detailEntry ? doneLogIdOf(detailEntry) : null}
                onClose={() => setDetail(null)}
                onMarkDone={markDone}
                onUnlog={unmarkDone}
                onSkip={handleSkip}
                onCopy={(e) => {
                    setDetail(null)
                    copyEntry(e)
                }}
                onRemove={(id) => {
                    setDetail(null)
                    void handleRemove(id)
                }}
                onLogWeights={(workout, date) => {
                    setDetail(null)
                    setLogTarget({ workout, date })
                }}
                onStartSession={(entry, logId, notes) => {
                    if (!entry.session) return
                    setDetail(null)
                    setSessionTarget({
                        session: entry.session,
                        date: entry.date,
                        tapsKey: entry._id,
                        stepsKey: stepTicksKey(entry)!,
                        existingLogId: logId,
                        notes,
                    })
                }}
            />

            <ConditioningLogDrawer
                target={sessionTarget}
                onClose={() => setSessionTarget(null)}
                onLogged={(logId, date) => {
                    if (!sessionTarget) return
                    const id = sessionTarget.session._id
                    // Re-dated in the wrap-up: the tick moves with it.
                    if (date !== sessionTarget.date)
                        clearDoneKey('conditioning', id, sessionTarget.date)
                    markDoneKey('conditioning', id, date, logId)
                }}
            />

            <WorkoutLogWeightsDrawer
                workout={logTarget?.workout ?? null}
                byId={exercisesById}
                defaultDate={logTarget?.date}
                onClose={() => setLogTarget(null)}
                onExerciseCreated={(exercise) => setExercises((prev) => [...prev, exercise])}
                onSubmit={handleLogWeights}
            />

            <FlagEditorDrawer
                target={flagTarget}
                note={flagNote}
                onClose={() => setFlagTarget(null)}
                onSave={handleSaveFlag}
                onRemove={handleRemoveFlag}
            />

            <CopyWeekDrawer
                open={copying}
                weekLabel={rangeLabel}
                options={FITNESS_PLAN_KINDS.map((k) => ({ value: k, label: KIND_META[k].label }))}
                describe={kindsLabel}
                hint="Pick what to copy, then go to another week and paste. Sessions you’ve already done there stay as they are."
                onClose={() => setCopying(false)}
                onCopy={(kinds) => {
                    handleCopyWeek(kinds)
                    setCopying(false)
                }}
            />

            <ConfirmModal
                open={pasteConfirm}
                title="Paste week plan?"
                confirmLabel="Paste"
                message={
                    clipboard && (
                        <p className="text-sm text-neutral-600">
                            Replace the planned{' '}
                            <span className="font-semibold">{kindsLabel(clipboard.kinds)}</span> for{' '}
                            <span className="font-semibold">{rangeLabel}</span> with the plan copied
                            from{' '}
                            <span className="font-semibold">
                                {formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                            </span>
                            ? Sessions you’ve done stay as they are.
                        </p>
                    )
                }
                onConfirm={() => void handlePasteWeek()}
                onClose={() => setPasteConfirm(false)}
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
                                {clearInfo.count} planned session{clearInfo.count !== 1 ? 's' : ''}
                            </span>{' '}
                            from <span className="font-semibold">{clearInfo.where}</span>? Sessions
                            you’ve done and flags stay.
                        </>
                    ) : (
                        ''
                    )
                }
                confirmLabel="Clear"
                onConfirm={() => {
                    if (!clearTarget) return
                    if (clearTarget.type === 'week') void clearDays(range.start, range.end)
                    else void clearDays(clearTarget.date, clearTarget.date)
                    setClearTarget(null)
                }}
                onClose={() => setClearTarget(null)}
            />

            <UndoDoneConfirm
                entry={unlogTarget}
                onConfirm={() => {
                    if (unlogTarget) void unmarkDone(unlogTarget).catch(() => {})
                }}
                onClose={() => setUnlogTarget(null)}
            />

            <DayEventsSheet
                date={eventsDate}
                events={eventsDate ? (calendarByDate.get(eventsDate) ?? []) : []}
                onClose={() => setEventsDate(null)}
            />

            <ClashModal
                date={clashDate}
                clashes={clashDate ? (clashesByDate.get(clashDate) ?? []) : []}
                dayEntries={clashDate ? entries.filter((e) => e.date === clashDate) : []}
                events={events}
                onMove={handleMove}
                onOverride={handleOverrideClash}
                onClose={() => setClashDate(null)}
            />

            <OverloadModal
                date={overloadDate}
                overloads={overloadDate ? (overloadsByDate.get(overloadDate) ?? []) : []}
                dayEntries={overloadDate ? entries.filter((e) => e.date === overloadDate) : []}
                events={events}
                onMove={handleMove}
                onOverride={handleOverrideOverload}
                onClose={() => setOverloadDate(null)}
            />

            <PlannerExportDrawer
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                weekStart={range.start}
            />
        </div>
    )
}

/** "Mark as not done?" — un-ticking a session deletes the log it wrote. */
function UndoDoneConfirm({
    entry,
    onConfirm,
    onClose,
}: {
    entry: FitnessPlanEntry | null
    onConfirm: () => void
    onClose: () => void
}) {
    // Keep the last session's words while the modal closes.
    const [shown, setShown] = useState(entry)
    if (entry && entry !== shown) setShown(entry)
    return (
        <ConfirmModal
            open={!!entry}
            danger
            title="Mark as not done?"
            message={
                <>
                    The log this wrote to your{' '}
                    <span className="font-semibold">{shown ? KIND_META[shown.kind].label : ''}</span>{' '}
                    history on{' '}
                    <span className="font-semibold">{shown ? shortDayLabel(shown.date) : ''}</span> will
                    be deleted, along with anything recorded on it. The session stays in the plan and
                    can be marked done again.
                </>
            }
            confirmLabel="Mark as not done"
            onConfirm={onConfirm}
            onClose={onClose}
        />
    )
}

// ─── Clash modal ──────────────────────────────────────────────────────────────

/**
 * Lists a day's schedule clashes: each planned item that overlaps a calendar
 * event, shown alongside the event(s) it collides with and when they fall.
 *
 * Each one offers the two ways out. Move it: the day's other slots are laid out
 * with whatever stands in each one's way, so the choice of where it goes is the
 * user's rather than the first slot that happens to be free. Or accept it: the
 * clash is real but fine, and the warning goes quiet for that item until it's
 * taken back — which the accepted list below keeps within reach.
 */
/**
 * What's on the calendar on one day, in its morning, afternoon or evening —
 * opened from the calendar icon on a day card. A sheet from the bottom, so
 * it's a thumb's reach on a phone.
 */
function DayEventsSheet({
    date,
    events,
    onClose,
}: {
    date: string | null
    events: Event[]
    onClose: () => void
}) {
    // Keep the last day while the sheet animates closed.
    const [shown, setShown] = useState<{ date: string; events: Event[] } | null>(null)
    useEffect(() => {
        if (date) setShown({ date, events })
    }, [date, events])

    return (
        <BottomSheet
            open={!!date}
            onClose={onClose}
            title={shown ? `On the calendar · ${shortDayLabel(shown.date)}` : 'On the calendar'}
        >
            {shown && (
                <ul className="flex flex-col gap-2 pb-2">
                    {shown.events.map((event) => (
                        <li
                            key={event._id}
                            className="flex items-start gap-3 rounded-2xl border border-neutral-200 px-3 py-3"
                        >
                            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-600">
                                <i className="fa-regular fa-calendar text-xs" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-neutral-900">{event.title}</p>
                                <p className="mt-0.5 text-xs text-neutral-500">
                                    {eventWhenLabel(event, shown.date)}
                                    {event.location && ` · ${event.location}`}
                                </p>
                                {event.notes && (
                                    <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-500">
                                        {event.notes}
                                    </p>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </BottomSheet>
    )
}

function ClashModal({
    date,
    clashes,
    dayEntries,
    events,
    onMove,
    onOverride,
    onClose,
}: {
    date: string | null
    clashes: Clash[]
    /** Every planned item on this day — used to gauge each slot's spare capacity. */
    dayEntries: FitnessPlanEntry[]
    /** The week's calendar events, to tell which slots an event already blocks. */
    events: Event[]
    onMove: (id: string, part: FitnessPlanPart) => void
    /** Accept an item's clash (or take that back), silencing its warning. */
    onOverride: (id: string, ignoreClash: boolean) => void
    onClose: () => void
}) {
    const live = clashes.filter((c) => !c.acknowledged)
    const accepted = clashes.filter((c) => c.acknowledged)

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
            {date && live.length > 0 && (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-neutral-500">
                        On{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        {live.length === 1
                            ? 'a planned session overlaps'
                            : 'planned sessions overlap'}{' '}
                        with what&apos;s already on your calendar.
                    </p>
                    <ul className="flex flex-col gap-3">
                        {live.map((clash) => {
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
                                        <span className="ml-auto flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                            <i
                                                className={`${PART_META[part].icon} text-[11px]`}
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
                                                    className="fa-regular fa-calendar shrink-0 text-xs text-neutral-500"
                                                    aria-hidden="true"
                                                />
                                                <span className="min-w-0 flex-1 truncate font-medium text-neutral-700">
                                                    {event.title}
                                                </span>
                                                <span className="shrink-0 text-xs text-neutral-500">
                                                    {eventWhenLabel(event, date)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-amber-200/70 pt-2">
                                        <SlotChoices
                                            slots={resolutionSlots(clash.entry, dayEntries, events)}
                                            date={date}
                                            onPick={(part) => onMove(clash.entry._id, part)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onOverride(clash.entry._id, true)}
                                            title="Keep it where it is and stop warning about this clash"
                                            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                                        >
                                            <i
                                                className="fa-solid fa-bell-slash text-[11px]"
                                                aria-hidden="true"
                                            />
                                            Keep anyway
                                        </button>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
            {date && accepted.length > 0 && (
                <div className={`flex flex-col gap-2 ${live.length > 0 ? 'mt-5' : ''}`}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        Accepted on this day
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {accepted.map((clash) => (
                            <li
                                key={clash.entry._id}
                                className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
                            >
                                <i
                                    className={`${KIND_META[clash.entry.kind].icon} shrink-0 text-[11px] text-neutral-500`}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-neutral-600">
                                        {planItemName(clash.entry) ??
                                            KIND_META[clash.entry.kind].noun}
                                    </p>
                                    <p className="truncate text-[11px] text-neutral-500">
                                        Clashes with {clash.events.map((e) => e.title).join(', ')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => onOverride(clash.entry._id, false)}
                                    className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800"
                                >
                                    Warn again
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Modal>
    )
}

/**
 * The slots a clashing item could move to, one button each. A blocked slot stays
 * on show but disabled, saying what's in the way — a slot missing entirely reads
 * as a bug, whereas "Afternoon · busy" reads as an answer. When nothing on the
 * day can take it, the row says so rather than offering an empty choice.
 */
function SlotChoices({
    slots,
    date,
    onPick,
}: {
    slots: SlotOption[]
    /** The day being resolved, for naming the events that block a slot. */
    date: string
    onPick: (part: FitnessPlanPart) => void
}) {
    if (slots.every((s) => s.blocked !== null)) {
        return (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <i className="fa-solid fa-ban text-[11px]" aria-hidden="true" />
                Nowhere free on this day
            </span>
        )
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-neutral-500">Move to</span>
            {slots.map(({ part, blocked, events }) => (
                <button
                    key={part}
                    type="button"
                    disabled={blocked !== null}
                    onClick={() => onPick(part)}
                    title={
                        blocked === 'busy'
                            ? `${PART_META[part].label} — ${events
                                  .map((e) => `${e.title} (${eventWhenLabel(e, date)})`)
                                  .join(', ')}`
                            : blocked === 'full'
                              ? `${PART_META[part].label} — already holds two sessions`
                              : `Move to ${PART_META[part].label.toLowerCase()}`
                    }
                    className={[
                        'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
                        blocked === null
                            ? 'bg-amber-500 text-white hover:bg-amber-600'
                            : 'cursor-not-allowed border border-neutral-200 bg-white text-neutral-300',
                    ].join(' ')}
                >
                    <i className={`${PART_META[part].icon} text-[11px]`} aria-hidden="true" />
                    {PART_META[part].label}
                    {blocked && (
                        <span className="font-normal">
                            · {blocked === 'busy' ? 'busy' : 'full'}
                        </span>
                    )}
                </button>
            ))}
        </div>
    )
}

// ─── Overload modal ───────────────────────────────────────────────────────────

/**
 * Lists a day's overloaded slots: each slot asking for two hard sessions back to
 * back, with a one-press move of either session to the nearest slot of the day
 * that's free to take it.
 *
 * As with a calendar clash, the load can also simply be accepted — some days two
 * hard sessions in a row is the plan — and the warning goes quiet for that slot
 * until it's taken back, which the accepted list below keeps within reach.
 */
function OverloadModal({
    date,
    overloads,
    dayEntries,
    events,
    onMove,
    onOverride,
    onClose,
}: {
    date: string | null
    overloads: SlotOverload[]
    /** Every planned item on this day — used to gauge each slot's spare capacity. */
    dayEntries: FitnessPlanEntry[]
    /** The week's calendar events, so a session is never moved into a busy slot. */
    events: Event[]
    onMove: (id: string, part: FitnessPlanPart) => void
    /** Accept a slot's load (or take that back) across every session sharing it. */
    onOverride: (ids: string[], ignoreOverload: boolean) => void
    onClose: () => void
}) {
    const live = overloads.filter((o) => !o.acknowledged)
    const accepted = overloads.filter((o) => o.acknowledged)

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
            {date && live.length > 0 && (
                <div className="flex flex-col gap-4">
                    <p className="text-sm text-neutral-500">
                        On{' '}
                        <span className="font-semibold text-neutral-700">
                            {shortDayLabel(date)}
                        </span>{' '}
                        {live.length === 1 ? 'a slot stacks' : 'slots stack'} two hard sessions
                        together. Move one to another slot to spread the load.
                    </p>
                    <ul className="flex flex-col gap-3">
                        {live.map((overload) => (
                            <li
                                key={overload.part}
                                className="rounded-xl border border-violet-200 bg-violet-50/50 p-3"
                            >
                                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-violet-500">
                                    <i
                                        className={`${PART_META[overload.part].icon} text-[11px]`}
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
                                                    <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-neutral-500">
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
                                <div className="mt-2 flex items-center border-t border-violet-200/70 pt-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onOverride(
                                                overload.entries.map((e) => e._id),
                                                true
                                            )
                                        }
                                        title="Keep both sessions in this slot and stop warning about the load"
                                        className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-violet-300 px-3 py-1 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100"
                                    >
                                        <i
                                            className="fa-solid fa-bell-slash text-[11px]"
                                            aria-hidden="true"
                                        />
                                        Keep anyway
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {date && accepted.length > 0 && (
                <div className={`flex flex-col gap-2 ${live.length > 0 ? 'mt-5' : ''}`}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        Accepted on this day
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {accepted.map((overload) => (
                            <li
                                key={overload.part}
                                className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
                            >
                                <i
                                    className={`${PART_META[overload.part].icon} shrink-0 text-xs text-neutral-500`}
                                    aria-hidden="true"
                                />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-neutral-600">
                                        {PART_META[overload.part].label}
                                    </p>
                                    <p className="truncate text-xs text-neutral-500">
                                        {overload.entries
                                            .map((e) => planItemName(e) ?? KIND_META[e.kind].noun)
                                            .join(' + ')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onOverride(
                                            overload.entries.map((e) => e._id),
                                            false
                                        )
                                    }
                                    className="shrink-0 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs font-semibold text-neutral-500 transition-colors hover:border-neutral-300 hover:text-neutral-800"
                                >
                                    Warn again
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Modal>
    )
}

// ─── Week hero ────────────────────────────────────────────────────────────────

/** The kinds a list of entries holds, in canonical order. */
function kindsIn(entries: FitnessPlanEntry[]): FitnessPlanKind[] {
    const present = new Set(entries.map((e) => e.kind))
    return FITNESS_PLAN_KINDS.filter((k) => present.has(k))
}

/**
 * The top of the planner: which week it is, how much of it is done, what it's
 * made of, and a strip of the seven days. The strip is the day switcher on a
 * phone (one day shows at a time) and a jump-to-day on wider screens.
 */
function FitnessWeekHero({
    weekStart,
    selected,
    today,
    rangeLabel,
    entries,
    ready,
    isDone,
    alertDates,
    weekNote,
    menu,
    onStep,
    onSelect,
    onPick,
    onEditFlag,
    board,
}: {
    weekStart: string
    /** The focused day (the planner's anchor). */
    selected: string
    today: string
    rangeLabel: string
    entries: FitnessPlanEntry[]
    /** False while the week is loading — the numbers would be stale. */
    ready: boolean
    isDone: (entry: FitnessPlanEntry) => boolean
    /** Days with an unaccepted clash or overload warning. */
    alertDates: Set<string>
    weekNote: FitnessPlanNote | null
    /** The week's options: copy, paste, flag, export, clear. */
    menu: MenuEntry[]
    onStep: (dir: -1 | 1) => void
    onSelect: (date: string) => void
    onPick: (date: string) => void
    onEditFlag: () => void
    /** The full-width week board is showing — it does the strip's job. */
    board: boolean
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const t = tally(entries)
    const total = entries.length
    const done = entries.filter(isDone).length
    const skipped = entries.filter((e) => e.skipped && !isDone(e)).length
    const flag = weekNote ? FLAG_TONE[weekNote.color] : null
    const isThisWeek = mondayOf(today) === weekStart

    // Everything about the week in one line of text, rather than a row of chips.
    const facts = [
        rangeLabel,
        ready && total > 0 && `${done} of ${total - skipped} done`,
        ready && skipped > 0 && `${skipped} skipped`,
        ready && t.workouts > 0 && `${t.workouts} strength`,
        ready && t.sessions > 0 && `${t.sessions} conditioning`,
        ready && t.minutes > 0 && `${t.minutes} min cardio`,
        ready && total === 0 && 'nothing planned yet',
    ].filter(Boolean)

    const arrows = (
        <div className="flex shrink-0 items-center gap-2 sm:gap-1">
            <HeroIconButton
                label="Previous week"
                icon="fa-solid fa-chevron-left"
                onClick={() => onStep(-1)}
            />
            <HeroIconButton
                label="Next week"
                icon="fa-solid fa-chevron-right"
                onClick={() => onStep(1)}
            />
        </div>
    )

    // Phones: the week's title gets a row to itself, the controls a row under
    // it. From `sm` up it all sits on one line — the same as the Nutrition planner.
    return (
        <HeroShell tone="soft">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="hidden sm:block">{arrows}</div>
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-xl font-semibold tracking-tight sm:text-lg">
                                {relativeWeekLabel(weekStart, mondayOf(today))}
                            </h2>
                            {weekNote && flag && (
                                <button
                                    type="button"
                                    onClick={onEditFlag}
                                    aria-label="Edit week flag"
                                    className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-neutral-900 ring-1 ring-inset ring-neutral-900/[0.06] transition-opacity hover:opacity-80"
                                >
                                    <span className={`h-1.5 w-1.5 rounded-full ${flag.dot}`} aria-hidden="true" />
                                    <span className="truncate">{weekNote.label || 'Flagged week'}</span>
                                </button>
                            )}
                        </div>
                        <p className="mt-0.5 text-[13px] leading-snug text-neutral-500 sm:mt-0 sm:truncate">
                            {facts.join(' · ')}
                        </p>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:ml-auto sm:gap-2">
                    <div className="sm:hidden">{arrows}</div>
                    {!isThisWeek && (
                        <HeroButton icon="fa-solid fa-calendar-day" onClick={() => onPick(today)} iconOnlyOnPhone>
                            Today
                        </HeroButton>
                    )}
                    <HeroMenu items={menu} />
                </div>
            </div>

            {!board && (
                <DayStrip>
                    {days.map((date) => {
                        const dayEntries = entries.filter((e) => e.date === date)
                        return (
                            <DayPill
                                key={date}
                                date={date}
                                active={date === selected}
                                isToday={date === today}
                                dots={ready ? kindsIn(dayEntries).map((k) => KIND_TONE[k].dot) : []}
                                allDone={
                                    ready &&
                                    dayEntries.some(isDone) &&
                                    dayEntries.every((e) => isDone(e) || e.skipped)
                                }
                                alert={ready && alertDates.has(date)}
                                onClick={() => onSelect(date)}
                            />
                        )
                    })}
                </DayStrip>
            )}
        </HeroShell>
    )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
    board,
    weekStart,
    selected,
    today,
    entries,
    dayNotes,
    clashesByDate,
    overloadsByDate,
    isDone,
    clearable,
    onSelect,
    onAdd,
    onOpen,
    onTick,
    onRowMenu,
    onSlotMenu,
    onReorder,
    onEditFlag,
    onClearDay,
    onShowClashes,
    onShowOverloads,
    calendarByDate,
    onShowEvents,
}: {
    /** Lay the seven days side by side across the screen, rather than stacked. */
    board: boolean
    weekStart: string
    /** The focused day — the only one shown on a phone. */
    selected: string
    today: string
    entries: FitnessPlanEntry[]
    dayNotes: Map<string, FitnessPlanNote>
    clashesByDate: Map<string, Clash[]>
    overloadsByDate: Map<string, SlotOverload[]>
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    /** Whether a clear would take it — sessions still to do. */
    clearable: (entry: FitnessPlanEntry) => boolean
    onSelect: (date: string) => void
    onAdd: (date: string, part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onTick: (entry: FitnessPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: FitnessPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, date: string, part: FitnessPlanPart) => void
    onReorder: (date: string, part: FitnessPlanPart, ids: string[]) => void
    onEditFlag: (scope: FitnessNoteScope, date: string) => void
    onClearDay: (date: string) => void
    onShowClashes: (date: string) => void
    onShowOverloads: (date: string) => void
    /** Each day's calendar events in a morning, afternoon or evening slot. */
    calendarByDate: Map<string, Event[]>
    onShowEvents: (date: string) => void
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

    // Drag-and-drop state, held here so a row can be dragged across days — not
    // just between the slots of its own day. `dragId` is the item in flight;
    // `dropAt` is where it would land: a day + slot, the row to drop before
    // (`refId`, or null to append) and which half of that row the cursor is in.
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropAt, setDropAt] = useState<{
        date: string
        part: FitnessPlanPart
        refId: string | null
        after: boolean
    } | null>(null)

    // Swipe left/right on a phone to move a day — crossing Sunday or Monday
    // carries on into the next or previous week.
    const { sliderProps, dayClass } = useDaySlider(selected, (dir) =>
        onSelect(addDays(selected, dir))
    )

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

    return (
        <div
            {...(board ? {} : sliderProps)}
            className={
                board
                    ? 'grid grid-cols-7 items-stretch gap-2 xl:gap-3'
                    : 'day-slider flex flex-col gap-3 md:gap-4'
            }
        >
            {days.map((date) => (
                <DayCard
                    key={date}
                    date={date}
                    compact={board}
                    // Only the focused day on a phone; every day from md up.
                    className={board ? 'flex' : dayClass(date)}
                    isToday={date === today}
                    entries={entries.filter((e) => e.date === date)}
                    note={dayNotes.get(date) ?? null}
                    clashCount={
                        (clashesByDate.get(date) ?? []).filter((c) => !c.acknowledged).length
                    }
                    acceptedClashCount={
                        (clashesByDate.get(date) ?? []).filter((c) => c.acknowledged).length
                    }
                    overloadCount={
                        (overloadsByDate.get(date) ?? []).filter((o) => !o.acknowledged).length
                    }
                    acceptedOverloadCount={
                        (overloadsByDate.get(date) ?? []).filter((o) => o.acknowledged).length
                    }
                    isDone={isDone}
                    clearable={clearable}
                    onAdd={(part) => onAdd(date, part)}
                    onOpen={onOpen}
                    onTick={onTick}
                    onRowMenu={onRowMenu}
                    onSlotMenu={(ev, part) => onSlotMenu(ev, date, part)}
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
                    calendarEvents={calendarByDate.get(date) ?? []}
                    onShowEvents={() => onShowEvents(date)}
                />
            ))}
            {!board && <SwipeHint />}
        </div>
    )
}

/** A small round warning / status button in a day card's header. */
function DayAlertButton({
    tone,
    icon,
    label,
    count,
    onClick,
}: {
    tone: 'amber' | 'violet' | 'sky' | 'quiet'
    icon: string
    label: string
    count?: number
    onClick: () => void
}) {
    const cls =
        tone === 'amber'
            ? 'bg-amber-50 text-amber-600 hover:bg-amber-100'
            : tone === 'violet'
              ? 'bg-violet-50 text-violet-600 hover:bg-violet-100'
              : tone === 'sky'
                ? 'bg-sky-50 text-sky-600 hover:bg-sky-100'
                : 'text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500'
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            title={label}
            className={`inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-lg px-1.5 text-xs font-semibold transition-colors ${cls}`}
        >
            <i className={`${icon} text-[11px]`} aria-hidden="true" />
            {count !== undefined && count > 1 && <span>{count}</span>}
        </button>
    )
}

function DayCard({
    date,
    compact = false,
    className = '',
    isToday,
    entries,
    note,
    clashCount,
    acceptedClashCount,
    overloadCount,
    acceptedOverloadCount,
    isDone,
    clearable,
    onAdd,
    onOpen,
    onTick,
    onRowMenu,
    onSlotMenu,
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
    calendarEvents,
    onShowEvents,
}: {
    date: string
    /** A narrow column in the week board: stacked header, slots one under another. */
    compact?: boolean
    className?: string
    isToday: boolean
    entries: FitnessPlanEntry[]
    note: FitnessPlanNote | null
    /** How many of this day's planned items clash with a calendar event, unaccepted. */
    clashCount: number
    /** How many of its clashes have been accepted, so they no longer warn. */
    acceptedClashCount: number
    /** How many of this day's slots stack two hard sessions together, unaccepted. */
    overloadCount: number
    /** How many of its overloaded slots have been accepted, so they no longer warn. */
    acceptedOverloadCount: number
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    clearable: (entry: FitnessPlanEntry) => boolean
    onAdd: (part: FitnessPlanPart) => void
    onOpen: (entry: FitnessPlanEntry) => void
    onTick: (entry: FitnessPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: FitnessPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, part: FitnessPlanPart) => void
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
    /** The calendar events in this day's morning, afternoon or evening. */
    calendarEvents: Event[]
    onShowEvents: () => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const total = entries.length
    const doneCount = entries.filter(isDone).length
    // Skipped sessions drop out of what the day is measured against.
    const skippedCount = entries.filter((e) => e.skipped && !isDone(e)).length
    const toDo = total - skippedCount
    const rest = total === 0
    const calendarCount = calendarEvents.length
    // On a rest day, what the calendar says you're doing instead.
    const restNote = rest ? restDayNote(calendarEvents, date) : null
    const tone = note ? FLAG_TONE[note.color] : null

    // Minutes across the day: sessions carry a duration; workouts use the same
    // estimate as their detail view.
    const minutes = entries.reduce((sum, e) => {
        if (e.kind === 'workout') return sum + (e.workout ? estimateWorkoutMinutes(e.workout) : 0)
        return sum + (e.session?.duration ?? 0)
    }, 0)

    // A slot's items in display (order) sequence.
    const slotItems = (part: FitnessPlanPart) =>
        entries.filter((e) => partOf(e) === part).sort((a, b) => a.order - b.order)

    // What the day holds, with a thin bar filling as sessions are logged.
    const summary = rest ? (
        <p className="text-[13px] text-neutral-500">
            Rest day
            {restNote && (
                <>
                    {' · '}
                    <button
                        type="button"
                        onClick={onShowEvents}
                        className="text-left text-sky-700 hover:underline"
                    >
                        {restNote.text}
                    </button>
                </>
            )}
        </p>
    ) : (
        <div className="flex flex-col gap-1.5">
            <p className="text-[13px] text-neutral-500">
                {total} {total === 1 ? 'session' : 'sessions'}
                {minutes > 0 && ` · about ${minutes} min`}
                {doneCount > 0 && <span className="text-emerald-700"> · {doneCount} done</span>}
                {skippedCount > 0 && <span> · {skippedCount} skipped</span>}
            </p>
            <div className="h-1 overflow-hidden rounded-full bg-neutral-100">
                <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                    style={{ width: `${toDo > 0 ? (doneCount / toDo) * 100 : 0}%` }}
                />
            </div>
        </div>
    )

    // The day's ⋯ menu: its flag, warnings that have been accepted (so they can
    // be taken back), and clearing what's still to do.
    const canClear = entries.some(clearable)
    const dayMenu: MenuEntry[] = [
        {
            label: note ? 'Edit flag…' : 'Flag day…',
            icon: 'fa-solid fa-flag',
            onClick: onEditFlag,
        },
        ...(clashCount === 0 && acceptedClashCount > 0
            ? [
                  {
                      label: `Accepted clash${acceptedClashCount === 1 ? '' : 'es'}…`,
                      icon: 'fa-solid fa-calendar-check',
                      onClick: onShowClashes,
                  },
              ]
            : []),
        ...(overloadCount === 0 && acceptedOverloadCount > 0
            ? [
                  {
                      label: `Accepted overload${acceptedOverloadCount === 1 ? '' : 's'}…`,
                      icon: 'fa-solid fa-gauge-high',
                      onClick: onShowOverloads,
                  },
              ]
            : []),
        ...(canClear
            ? [
                  'divider' as const,
                  { label: 'Clear day', icon: 'fa-solid fa-broom', danger: true, onClick: onClear },
              ]
            : []),
    ]

    const actions = (
        <>
            {/* Something on the calendar in one of the day's slots — a heads-up
                whether or not it clashes with anything planned. */}
            {calendarCount > 0 && (
                <DayAlertButton
                    tone="sky"
                    icon="fa-regular fa-calendar"
                    count={calendarCount}
                    label={`${calendarCount} calendar event${calendarCount === 1 ? '' : 's'} on ${weekday} — view`}
                    onClick={onShowEvents}
                />
            )}
            {clashCount > 0 && (
                <DayAlertButton
                    tone="amber"
                    icon="fa-solid fa-triangle-exclamation"
                    count={clashCount}
                    label={`${clashCount} calendar clash${clashCount === 1 ? '' : 'es'} — view`}
                    onClick={onShowClashes}
                />
            )}
            {overloadCount > 0 && (
                <DayAlertButton
                    tone="violet"
                    icon="fa-solid fa-gauge-high"
                    count={overloadCount}
                    label={`${overloadCount} overloaded slot${overloadCount === 1 ? '' : 's'} — view`}
                    onClick={onShowOverloads}
                />
            )}
            <DayMenu label={`${weekday} options`} items={dayMenu} />
        </>
    )

    return (
        <DayCardShell
            id={dayCardId('plan', date)}
            isToday={isToday}
            compact={compact}
            className={className}
        >
            {/* A flagged day wears a coloured strip down its left edge. */}
            {tone && (
                <span className={`absolute inset-y-0 left-0 w-1 ${tone.bar}`} aria-hidden="true" />
            )}

            <header className="flex flex-col gap-2">
                <DayTitle date={date} compact={compact} isToday={isToday} actions={actions}>
                    {note && tone && (
                        <button
                            type="button"
                            onClick={onEditFlag}
                            aria-label="Edit day flag"
                            className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 ${tone.chip}`}
                        >
                            <i className="fa-solid fa-flag text-[9px]" aria-hidden="true" />
                            <span className="truncate">{note.label || 'Flagged'}</span>
                        </button>
                    )}
                </DayTitle>
                {summary}
            </header>

            <div className="flex flex-col divide-y divide-neutral-100">
                {FITNESS_PLAN_PARTS.map((part) => (
                    <SlotSection
                        key={part}
                        compact={compact}
                        part={part}
                        entries={slotItems(part)}
                        isDone={isDone}
                        onAdd={() => onAdd(part)}
                        onOpen={onOpen}
                        onTick={onTick}
                        onRowMenu={onRowMenu}
                        onSlotMenu={(ev) => onSlotMenu(ev, part)}
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
        </DayCardShell>
    )
}

/**
 * One slot (morning / afternoon / evening) of a day: its name and a + beside
 * its sessions (or over them in a board column). Sessions of any category sit
 * together, each in its own colour; they tick off as they're done, open for a
 * closer look, and drag to another slot or day on a wide screen.
 */
function SlotSection({
    compact = false,
    part,
    entries,
    isDone,
    onAdd,
    onOpen,
    onTick,
    onRowMenu,
    onSlotMenu,
    dragActive,
    draggedId,
    drop,
    onEntryDragStart,
    onEntryDragEnd,
    onTarget,
    onClearTarget,
    onDropEntry,
}: {
    /** A narrow board column: rows one under another, never side by side. */
    compact?: boolean
    part: FitnessPlanPart
    entries: FitnessPlanEntry[]
    /** Whether a planned item has a matching completion log on its day. */
    isDone: (entry: FitnessPlanEntry) => boolean
    onAdd: () => void
    onOpen: (entry: FitnessPlanEntry) => void
    onTick: (entry: FitnessPlanEntry) => void
    /** Right-click on a session: copy, open, remove. */
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: FitnessPlanEntry) => void
    /** Right-click on the slot: paste a copied session, or add. */
    onSlotMenu: (ev: { clientX: number; clientY: number }) => void
    /** True while an item is being dragged, so slots show as drop targets. */
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
    return (
        <PlanSlot
            compact={compact}
            marker={
                <i
                    className={`${meta.icon} w-3 shrink-0 text-center text-[11px] text-neutral-400`}
                    aria-hidden="true"
                />
            }
            label={meta.label}
            empty={entries.length === 0}
            onAdd={onAdd}
            onContextMenu={onSlotMenu}
            dragActive={dragActive}
            draggedId={draggedId}
            drop={drop}
            onTarget={onTarget}
            onClearTarget={onClearTarget}
            onDrop={onDropEntry}
        >
            {entries.map((e) => (
                <PlannedRow
                    key={e._id}
                    compact={compact}
                    entry={e}
                    done={isDone(e)}
                    onOpen={() => onOpen(e)}
                    onTick={() => onTick(e)}
                    onContextMenu={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        onRowMenu(ev, e)
                    }}
                    onDragStart={() => onEntryDragStart(e._id)}
                    onDragEnd={onEntryDragEnd}
                    dropEdge={drop && drop.refId === e._id ? (drop.after ? 'bottom' : 'top') : null}
                />
            ))}
        </PlanSlot>
    )
}

/** The one-line summary under a planned item's name. */
function plannedMeta(entry: FitnessPlanEntry): string {
    if (entry.kind === 'workout' && entry.workout) {
        const n = entry.workout.main.length
        const mins = estimateWorkoutMinutes(entry.workout)
        return [`${n} ${n === 1 ? 'exercise' : 'exercises'}`, mins > 0 ? `~${mins} min` : '']
            .filter(Boolean)
            .join(' · ')
    }
    if (entry.kind === 'conditioning' && entry.session)
        return `${entry.session.category} · ${entry.session.duration} min`
    return KIND_META[entry.kind].label
}

function PlannedRow({
    compact = false,
    entry,
    done = false,
    onOpen,
    onTick,
    onDragStart,
    onDragEnd,
    dropEdge = null,
    onContextMenu,
}: {
    /** Tighter, for a narrow board column: smaller tick, no drag grip. */
    compact?: boolean
    entry: FitnessPlanEntry
    /** When true the item has a matching completion log — the tick shows green. */
    done?: boolean
    onOpen: () => void
    /** The tick: a quick log, or the way back from one. */
    onTick: () => void
    onDragStart: () => void
    onDragEnd: () => void
    /** Which edge to mark as the pending drop spot — an overlay, so the row never shifts. */
    dropEdge?: 'top' | 'bottom' | null
    /** Right-click on the row. */
    onContextMenu: (ev: MouseEvent) => void
}) {
    const name = planItemName(entry) ?? KIND_META[entry.kind].noun
    // A logged session counts as done even if it was skipped first.
    const skipped = !done && entry.skipped === true

    const trailing = skipped ? (
        <span
            className={`grid shrink-0 place-items-center rounded-full bg-red-50 text-red-500 ${rowButtonSize(compact)}`}
            aria-label="Skipped"
            title={entry.skipReason ? `Skipped — ${entry.skipReason}` : 'Skipped'}
        >
            <i className="fa-solid fa-ban text-[11px]" aria-hidden="true" />
        </span>
    ) : (
        <RowTick
            done={done}
            compact={compact}
            label={done ? `Mark ${name} as not done` : `Mark ${name} as done`}
            title={done ? 'Done' : 'Mark as done'}
            onClick={onTick}
        />
    )

    return (
        <PlanRow
            compact={compact}
            bar={skipped ? 'bg-neutral-300' : KIND_TONE[entry.kind].dot}
            title={name}
            titleTone={
                skipped
                    ? 'text-neutral-400 line-through decoration-neutral-300'
                    : done
                      ? 'text-neutral-500'
                      : 'text-neutral-900'
            }
            meta={
                skipped
                    ? entry.skipReason
                        ? `Skipped · ${entry.skipReason}`
                        : 'Skipped'
                    : plannedMeta(entry)
            }
            name={name}
            onOpen={onOpen}
            trailing={trailing}
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            dropId={entry._id}
            dropEdge={dropEdge}
            onContextMenu={onContextMenu}
        />
    )
}

/** Quick reasons offered when skipping a session. */
const SKIP_SUGGESTIONS = ['Injured', 'Ill', 'Tired', 'Too busy', 'Travelling', 'Weather']

/** How many library items the add drawer lays out at a time. */
const PICKER_PAGE_SIZE = 10

/**
 * Adding to a day — laid out like the Nutrition one. The slot and the type
 * (Strength / Conditioning) at the top, then search, the copied session to
 * paste, pinned workouts, and the library a page at a time (it grows into the
 * hundreds). Picking one adds it and closes.
 */
function AddDrawer({
    target,
    workouts,
    sessions,
    copied,
    onClose,
    onAdd,
    onPaste,
}: {
    target: { date: string; part: FitnessPlanPart } | null
    workouts: Workout[]
    sessions: ConditioningSession[]
    /** A session copied elsewhere, offered first so it can be pasted here. */
    copied: FitnessPlanEntry | null
    onClose: () => void
    onAdd: (date: string, kind: FitnessPlanKind, itemId: string, part: FitnessPlanPart) => Promise<void>
    onPaste: (date: string, part: FitnessPlanPart) => Promise<void>
}) {
    // The last target stays on show while the drawer slides shut.
    const [view, setView] = useState(target)
    const [part, setPart] = useState<FitnessPlanPart>('morning')
    const [kind, setKind] = useState<FitnessPlanKind>('workout')
    const [query, setQuery] = useState('')
    const [page, setPage] = useState(1)
    const [busy, setBusy] = useState(false)

    // Opened on a slot: start fresh from it.
    if (target && target !== view) {
        setView(target)
        setPart(target.part)
        setKind('workout')
        setQuery('')
        setPage(1)
        setBusy(false)
    }

    async function run(fn: () => Promise<void>) {
        if (busy) return
        setBusy(true)
        try {
            await fn()
            onClose()
        } finally {
            setBusy(false)
        }
    }

    const q = query.trim().toLowerCase()
    const meta = KIND_META[kind]

    const workoutResults = useMemo(() => {
        const base = q
            ? workouts.filter(
                  (w) =>
                      w.name.toLowerCase().includes(q) ||
                      (w.description ?? '').toLowerCase().includes(q)
              )
            : workouts
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [workouts, q])

    const sessionResults = useMemo(() => {
        const base = q
            ? sessions.filter(
                  (s) =>
                      s.name.toLowerCase().includes(q) ||
                      (s.purpose ?? '').toLowerCase().includes(q)
              )
            : sessions
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [sessions, q])

    // Workouts pinned to the planner (showInPlanner), offered first.
    const pinned = kind === 'workout' && !q ? workoutResults.filter((w) => w.showInPlanner) : []

    const total = kind === 'workout' ? workoutResults.length : sessionResults.length
    const pageCount = Math.max(1, Math.ceil(total / PICKER_PAGE_SIZE))
    const current = Math.min(page, pageCount)
    const from = (current - 1) * PICKER_PAGE_SIZE
    const to = from + PICKER_PAGE_SIZE

    const date = view?.date ?? todayKey()
    const add = (id: string) => run(() => onAdd(date, kind, id, part))

    const workoutDetail = (w: Workout) => {
        const mins = estimateWorkoutMinutes(w)
        return [
            `${w.main.length} ${w.main.length === 1 ? 'exercise' : 'exercises'}`,
            mins > 0 ? `~${mins} min` : '',
        ]
            .filter(Boolean)
            .join(' · ')
    }

    const empty =
        kind === 'workout'
            ? workouts.length === 0
                ? 'No workouts yet — build some in Strength.'
                : 'No workouts found.'
            : sessions.length === 0
              ? 'No sessions yet — build some in Conditioning.'
              : 'No sessions found.'

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            title={`Add to ${PART_META[part].label.toLowerCase()}`}
            badge={view ? shortDayLabel(view.date) : undefined}
        >
            {view && (
                <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented
                            value={part}
                            options={FITNESS_PLAN_PARTS.map(
                                (p) => [p, PART_META[p].label] as [FitnessPlanPart, string]
                            )}
                            onChange={setPart}
                        />
                        <Segmented
                            value={kind}
                            options={FITNESS_PLAN_KINDS.map(
                                (k) => [k, KIND_META[k].label] as [FitnessPlanKind, string]
                            )}
                            onChange={(k) => {
                                setKind(k)
                                setPage(1)
                            }}
                        />
                    </div>

                    <div className="flex flex-col gap-5">
                        <Input
                            icon="fa-solid fa-magnifying-glass"
                            type="search"
                            placeholder={`Search ${meta.noun}s…`}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value)
                                setPage(1)
                            }}
                        />

                        {copied && !q && (
                            <ul>
                                <PickRow
                                    title={`Paste ${planItemName(copied) ?? 'session'}`}
                                    detail="The session you copied"
                                    icon="fa-solid fa-paste"
                                    disabled={busy}
                                    onClick={() => run(() => onPaste(date, part))}
                                />
                            </ul>
                        )}

                        {pinned.length > 0 && (
                            <section className="flex flex-col gap-2">
                                <p className={PICK_LABEL}>Pinned</p>
                                <ul className="flex flex-col gap-1.5">
                                    {pinned.map((w) => (
                                        <PickRow
                                            key={w._id}
                                            title={w.name}
                                            detail={workoutDetail(w)}
                                            icon="fa-solid fa-plus"
                                            disabled={busy}
                                            onClick={() => add(w._id)}
                                        />
                                    ))}
                                </ul>
                            </section>
                        )}

                        <section className="flex flex-col gap-2">
                            <p className={PICK_LABEL}>
                                {q ? `${meta.label} results` : kind === 'workout' ? 'All workouts' : 'All sessions'}
                            </p>
                            {total === 0 ? (
                                <p className="rounded-xl bg-neutral-50 px-3 py-3 text-center text-sm text-neutral-500">
                                    {empty}
                                </p>
                            ) : (
                                <ul className="flex flex-col gap-1.5">
                                    {kind === 'workout'
                                        ? workoutResults.slice(from, to).map((w) => (
                                              <PickRow
                                                  key={w._id}
                                                  title={w.name}
                                                  detail={workoutDetail(w)}
                                                  icon="fa-solid fa-plus"
                                                  disabled={busy}
                                                  onClick={() => add(w._id)}
                                              />
                                          ))
                                        : sessionResults.slice(from, to).map((s) => (
                                              <PickRow
                                                  key={s._id}
                                                  title={s.name}
                                                  detail={`${s.category} · ${s.duration} min`}
                                                  icon="fa-solid fa-plus"
                                                  disabled={busy}
                                                  onClick={() => add(s._id)}
                                              />
                                          ))}
                                </ul>
                            )}
                            <Pagination page={current} pageCount={pageCount} onChange={setPage} />
                        </section>
                    </div>
                </div>
            )}
        </Drawer>
    )
}

// ─── Planned item detail drawer ────────────────────────────────────────────────

/**
 * A planned item opened from its row: the full details of whichever library it
 * came from — a workout's exercises, or a conditioning session's parts — and
 * what can be done with it (start, mark done, skip, copy, remove). All detail
 * data rides along on the populated plan entry; only a workout's exercise
 * *names* need the exercises library (via `exercisesById`).
 */
function PlannedDetailDrawer({
    entry,
    exercisesById,
    done,
    doneLogId,
    onClose,
    onMarkDone,
    onUnlog,
    onSkip,
    onCopy,
    onRemove,
    onLogWeights,
    onStartSession,
}: {
    entry: FitnessPlanEntry | null
    exercisesById: Map<string, Exercise>
    /** Whether this item already has a completion log on its day. */
    done: boolean
    /** The id of the log that completed it, when the tick can be undone. */
    doneLogId: string | null
    onClose: () => void
    /** Log the item as it stands, dated to its day, so its row ticks. */
    onMarkDone: (entry: FitnessPlanEntry) => Promise<void>
    /** Delete the completion log behind a ticked item, so it counts as not done. */
    onUnlog: (entry: FitnessPlanEntry) => Promise<void>
    /** Skip the item (with an optional reason), or put a skipped one back on. */
    onSkip: (entry: FitnessPlanEntry, skipped: boolean, reason?: string) => Promise<void>
    /** Copy it, to paste into another slot or day. */
    onCopy: (entry: FitnessPlanEntry) => void
    /** Take it off the plan. Any log it wrote stays in the history. */
    onRemove: (id: string) => void
    /** Open the per-set weight logger for a planned workout, dated to its day. */
    onLogWeights: (workout: Workout, date: string) => void
    /** Open the session logger for a planned conditioning session — fresh, or
     *  picking its log back up. */
    onStartSession: (entry: FitnessPlanEntry, logId: string | null, notes?: string) => void
}) {
    // Retain the last entry while the drawer animates closed.
    const [view, setView] = useState<FitnessPlanEntry | null>(entry)
    useEffect(() => {
        if (entry) setView(entry)
    }, [entry])

    const [logging, setLogging] = useState(false)
    // An undo of "Mark as done" awaiting confirmation — it deletes the log.
    const [confirmUndo, setConfirmUndo] = useState(false)
    // The skip form: open while a reason is being written, closed on each new item.
    const [skipping, setSkipping] = useState(false)
    const [skipReason, setSkipReason] = useState('')
    const [skipFor, setSkipFor] = useState<string | null>(null)
    if (entry && entry._id !== skipFor) {
        setSkipFor(entry._id)
        setSkipping(false)
        setSkipReason('')
    }

    const e = view
    const title = e ? (planItemName(e) ?? KIND_META[e.kind].label) : 'Details'
    const isSession = !!e && e.kind === 'conditioning' && !!e.session
    // Sub-list steps ticked off on this device, whatever the kind.
    const steps = useStepTicks(stepTicksKey(e))

    // A done item reads as its log — the same read-out its category's log opens —
    // rather than the plan. Fetched fresh on each open so edits made in the
    // logger show; marking it not done drops back to the plan view.
    // `done` drops to false as the drawer closes, so the log id is retained
    // while it slides shut, like the entry is.
    const [logId, setLogId] = useState<string | null>(null)
    const nextLogId = entry ? (done ? doneLogId : null) : logId
    if (nextLogId !== logId) setLogId(nextLogId)
    const logKind = e?.kind
    const [doneLog, setDoneLog] = useState<
        { kind: 'workout'; log: WorkoutLog } | { kind: 'conditioning'; log: ConditioningLog } | null
    >(null)
    useEffect(() => {
        if (!entry || !logId) return
        let live = true
        const load =
            logKind === 'workout'
                ? listWorkoutLogs().then((logs) => {
                      const log = logs.find((l) => l._id === logId)
                      return log ? { kind: 'workout' as const, log } : null
                  })
                : logKind === 'conditioning'
                  ? listConditioningLogs().then((logs) => {
                        const log = logs.find((l) => l._id === logId)
                        return log ? { kind: 'conditioning' as const, log } : null
                    })
                  : Promise.resolve(null)
        load.then((found) => {
            if (live) setDoneLog(found)
        }).catch(() => {})
        return () => {
            live = false
        }
    }, [entry, logId, logKind])
    const showLog = !!logId && doneLog?.log._id === logId
    const loadingLog = !!logId && !showLog

    // Any planned item can be logged straight from the planner — "Mark as done"
    // snapshots the library item into a completed record dated to the planned day,
    // mirroring the Done buttons in each category's log.
    const skipped = !!e && !done && e.skipped === true
    const canMarkDone =
        !!e &&
        !done &&
        !skipped &&
        ((e.kind === 'workout' && !!e.workout) || (e.kind === 'conditioning' && !!e.session))

    async function markDone() {
        if (!e) return
        setLogging(true)
        try {
            await onMarkDone(e)
            onClose()
        } catch {
            // The planner has already said it failed.
        } finally {
            setLogging(false)
        }
    }

    async function confirmSkip() {
        if (!e) return
        setLogging(true)
        try {
            await onSkip(e, true, skipReason)
            setSkipping(false)
            setSkipReason('')
        } catch {
            // The planner has already said it failed; keep the form open to retry.
        } finally {
            setLogging(false)
        }
    }

    async function unskip() {
        if (!e) return
        setLogging(true)
        try {
            await onSkip(e, false)
        } catch {
            // Reported by the planner.
        } finally {
            setLogging(false)
        }
    }

    // The other direction: a tick put on by mistake — an item marked done that
    // wasn't, or a future day tapped early — is undone by deleting the log it
    // wrote, which is what the tick is read from in the first place. The drawer
    // stays open on the plan view, ready to start again.
    async function undoDone() {
        if (!e || !doneLogId) return
        setLogging(true)
        try {
            await onUnlog(e)
            // The planner forgot the device's ticks; forget the ones on show too.
            steps.reset()
        } catch {
            // Reported by the planner.
        } finally {
            setLogging(false)
        }
    }

    return (
        <>
            <Drawer
                open={!!entry}
                onClose={onClose}
                size="2xl"
                title={title}
                footer={
                    skipping ? (
                        <div className="flex w-full flex-wrap items-center justify-end gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => setSkipping(false)}
                                disabled={logging}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="danger"
                                icon="fa-solid fa-ban"
                                onClick={confirmSkip}
                                disabled={logging}
                            >
                                {logging ? 'Saving…' : 'Skip session'}
                            </Button>
                        </div>
                    ) : (
                        e && (
                        <div className="flex w-full flex-wrap items-center justify-end gap-3">
                            <div className="mr-auto flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    icon="fa-solid fa-trash-can"
                                    onClick={() => onRemove(e._id)}
                                    disabled={logging}
                                >
                                    Remove
                                </Button>
                                <Button variant="ghost" icon="fa-solid fa-copy" onClick={() => onCopy(e)}>
                                    Copy
                                </Button>
                                {canMarkDone && (
                                    <Button
                                        variant="ghost"
                                        icon="fa-solid fa-ban"
                                        onClick={() => {
                                            setSkipReason('')
                                            setSkipping(true)
                                        }}
                                        disabled={logging}
                                    >
                                        Skip
                                    </Button>
                                )}
                            </div>
                            {skipped && (
                                <Button
                                    variant="secondary"
                                    icon="fa-solid fa-rotate-left"
                                    onClick={unskip}
                                    disabled={logging}
                                >
                                    {logging ? 'Saving…' : 'Unskip'}
                                </Button>
                            )}
                            {done && doneLogId && (
                                <Button
                                    variant="ghost"
                                    icon="fa-solid fa-rotate-left"
                                    onClick={() => setConfirmUndo(true)}
                                    disabled={logging}
                                >
                                    Mark as not done
                                </Button>
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
                            {!skipped && e.kind === 'workout' && e.workout && (
                                <Button
                                    icon={done ? 'fa-solid fa-pen' : 'fa-solid fa-play'}
                                    onClick={() => e.workout && onLogWeights(e.workout, e.date)}
                                >
                                    {done ? 'Open log' : 'Start workout'}
                                </Button>
                            )}
                            {!skipped && isSession && (
                                <Button
                                    icon={done ? 'fa-solid fa-pen' : 'fa-solid fa-play'}
                                    onClick={() =>
                                        onStartSession(
                                            e,
                                            done ? doneLogId : null,
                                            doneLog?.kind === 'conditioning'
                                                ? doneLog.log.notes
                                                : undefined
                                        )
                                    }
                                >
                                    {done ? 'Open log' : 'Start session'}
                                </Button>
                            )}
                        </div>
                        )
                    )
                }
            >
                {e && (
                    <div className="flex flex-col gap-6">
                        <PlannedContext entry={e} done={done} />
                        {skipping && (
                            <div className="flex flex-col gap-3 rounded-2xl bg-neutral-50 p-4">
                                <Textarea
                                    label="Why are you skipping it?"
                                    hint="Optional — it shows on the plan beside the no-entry sign."
                                    rows={2}
                                    maxLength={280}
                                    autoFocus
                                    value={skipReason}
                                    onChange={(ev) => setSkipReason(ev.target.value)}
                                    placeholder="e.g. Sore hamstring, rest instead"
                                />
                                <div className="flex flex-wrap gap-2">
                                    {SKIP_SUGGESTIONS.map((r) => (
                                        <button
                                            key={r}
                                            type="button"
                                            onClick={() => setSkipReason(r)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                                                skipReason === r
                                                    ? 'bg-neutral-900 text-white ring-neutral-900'
                                                    : 'bg-white text-neutral-600 ring-neutral-900/[0.08] hover:text-neutral-900'
                                            }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {skipped && !skipping && (
                            <div className="flex items-start gap-3 rounded-2xl bg-red-50/60 p-4">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-red-500 ring-1 ring-inset ring-red-500/15">
                                    <i className="fa-solid fa-ban text-sm" aria-hidden="true" />
                                </span>
                                <div className="min-w-0 pt-1">
                                    <p className="text-sm font-semibold text-neutral-900">
                                        Skipped
                                    </p>
                                    <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-600">
                                        {e.skipReason || 'No reason given.'}
                                    </p>
                                </div>
                            </div>
                        )}
                        {showLog && doneLog ? (
                            doneLog.kind === 'workout' ? (
                                <WorkoutLogSummary log={doneLog.log} />
                            ) : (
                                <ConditioningLogSummary
                                    log={doneLog.log}
                                    session={e.session ?? null}
                                />
                            )
                        ) : loadingLog ? (
                            <div className="grid place-items-center py-16">
                                <Spinner />
                            </div>
                        ) : e.kind === 'workout' && e.workout ? (
                            <WorkoutDetail
                                workout={e.workout}
                                exercisesById={exercisesById}
                                packKey={e._id}
                                stepTicks={steps.ticks}
                                onToggleStep={steps.toggle}
                            />
                        ) : e.kind === 'conditioning' && e.session ? (
                            <ConditioningSessionDetail session={e.session} overview />
                        ) : null}
                    </div>
                )}
            </Drawer>

            <UndoDoneConfirm
                entry={confirmUndo ? e : null}
                onConfirm={() => void undoDone()}
                onClose={() => setConfirmUndo(false)}
            />
        </>
    )
}

/**
 * Where the step ticks of a planned item are kept on the device. A workout's
 * are keyed by workout and day rather than plan entry, so the strength logger
 * (which only knows the workout and the day) picks up the same ticks.
 */
function stepTicksKey(entry: FitnessPlanEntry | null): string | null {
    if (!entry) return null
    if (entry.kind === 'workout' && entry.workout)
        return workoutStepsKey(entry.workout._id, entry.date)
    return `entry:${entry._id}`
}

/** The kind, day and slot a planned item sits in, and whether it's done. */
function PlannedContext({ entry, done }: { entry: FitnessPlanEntry; done: boolean }) {
    const tone = KIND_TONE[entry.kind]
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span
                className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${tone.chip}`}
            >
                <i className={`${KIND_META[entry.kind].icon} text-[11px]`} aria-hidden="true" />
                {KIND_META[entry.kind].label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
                <i className={`${PART_META[entry.part].icon} text-[11px]`} aria-hidden="true" />
                {shortDayLabel(entry.date)} · {PART_META[entry.part].label}
            </span>
            {done && (
                <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">
                    <i className="fa-solid fa-circle-check" aria-hidden="true" />
                    Done
                </span>
            )}
            {!done && entry.skipped && (
                <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-red-50 px-2.5 text-xs font-semibold text-red-600">
                    <i className="fa-solid fa-ban" aria-hidden="true" />
                    Skipped
                </span>
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
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
                                            : 'ring-1 ring-inset ring-neutral-900/10'
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
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
