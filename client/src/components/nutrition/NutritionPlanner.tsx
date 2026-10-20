import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import Spinner from '../Spinner'
import Button from '../Button'
import Input from '../Input'
import Pagination from '../Pagination'
import EmptyState from '../EmptyState'
import Drawer from '../Drawer'
import Checkbox from '../Checkbox'
import ConfirmModal from '../ConfirmModal'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { useToast } from '../../context/ToastContext'
import {
    HeroShell,
    HeroIconButton,
    HeroButton,
    DayStrip,
    DayPill,
    EditBar,
    DayCardShell,
    SwipeHint,
    dayCardId,
    isWide,
    scrollToDay,
    relativeWeekLabel,
    useDaySlider,
    useMediaQuery,
    LARGE_QUERY,
} from '../planner/WeekPlannerUI'
import { CATEGORY, MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal, signedKcal } from './format'
import {
    addPlanEntry,
    addPlatePlanEntry,
    updatePlate,
    deletePlanEntry,
    listPlanEntries,
    setEntryStatus,
    reorderPlanSlot,
    copyPlanWeek,
    clearPlanRange,
} from '../../services/mealPlan'
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { addDays, formatWeekRange, parseDateKey, todayKey, WEEKDAYS_LONG, MONTHS } from '../../lib/calendar'
import { sumEatenMacros, sumMacros, targetsFor } from '../../lib/nutrition'
import { MEAL_TYPES } from '../../types'
import { plateTotal } from '../../lib/plates'
import { PlateBuilder, PlateLinesEditor, plateGrams, plateTitle } from './PlateUI'
import type {
    DailyEnergy,
    MacroGoals,
    Macros,
    Meal,
    MealPlanEntry,
    MealType,
    NutritionPhase,
    PlateFood,
    PlateLine,
    PlateLineInput,
} from '../../types'

/**
 * The nutrition week planner, built from the same parts as the Fitness one and
 * laid out the same way: a week hero with the day strip, a sticky edit bar,
 * and a card per day split into breakfast, lunch, dinner and snacks. Wide
 * screens get the seven days side by side; phones one day at a time.
 *
 * Viewing, each meal ticks off as it's eaten and "Log more" adds anything
 * else. Editing adds, removes and drags meals between slots and days, and
 * copies, pastes or clears a week.
 */

// ─── Date helpers ───────────────────────────────────────────────────────────────

/** The Monday (YYYY-MM-DD) that starts the week containing `date`. */
export function mondayOf(date: string): string {
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

// ─── Slot presentation ──────────────────────────────────────────────────────────

/** A short lower-case description of a set of slots, e.g. "lunch + dinner" or "everything". */
function slotsLabel(slots: MealType[]): string {
    if (slots.length >= MEAL_TYPES.length) return 'everything'
    return slots.map((s) => CATEGORY[s].label.toLowerCase()).join(' + ')
}

/** Planned meals still waiting to be eaten — the only ones a clear or a paste replaces. */
const clearable = (e: MealPlanEntry) => !e.extra && e.status === 'planned'

const isEaten = (e: MealPlanEntry) => e.status === 'eaten'

/** The one-line summary under a planned meal's name. */
function plannedMeta(entry: MealPlanEntry): string {
    const grams = plateGrams(entry)
    return `${kcal(entry.macros.calories)} kcal · ${fmt(Math.round(entry.macros.protein))} g protein${grams ? ` · ${grams}` : ''}`
}

// ─── Planner ────────────────────────────────────────────────────────────────────

/** `eaten` is Quick log: added to its slot already ticked, with no need to plan first. */
type PickerTarget = { date: string; slot: MealType; extra: boolean; eaten?: boolean }


export default function NutritionPlanner({
    meals,
    foods,
    settingsGoals,
}: {
    meals: Meal[]
    /** Boxes and plain foods, for weighing out plates. */
    foods: PlateFood[]
    settingsGoals?: MacroGoals
}) {
    // Wide screens get the full-width week board; smaller ones a day feed (one
    // day at a time on a phone).
    const board = useMediaQuery(LARGE_QUERY)
    // Any day inside the week on show; the week's Monday is derived from it.
    const [anchor, setAnchor] = useState(() => todayKey())
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [energy, setEnergy] = useState<DailyEnergy[]>([])
    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [loading, setLoading] = useState(true)
    // The planner opens read-only; Edit reveals the add/remove/drag controls.
    const [editing, setEditing] = useState(false)
    // The day drawer: a day + slot to add to, or a day to "Log more" on.
    const [picker, setPicker] = useState<PickerTarget | null>(null)
    // A planned meal opened for a closer look.
    const [detail, setDetail] = useState<MealPlanEntry | null>(null)
    // A copied week held for pasting elsewhere: its Monday and which slots.
    const [clipboard, setClipboard] = useState<{ from: string; slots: MealType[] } | null>(null)
    // A pending "clear" awaiting confirmation: a single day, or the whole week.
    const [clearTarget, setClearTarget] = useState<{ type: 'day'; date: string } | { type: 'week' } | null>(null)

    const today = todayKey()
    const toast = useToast()

    const range = useMemo(() => {
        const start = mondayOf(anchor)
        return { start, end: addDays(start, 6) }
    }, [anchor])

    useEffect(() => {
        // Refetch silently on a week change — the days keep the previous meals
        // until the new ones arrive, so navigation never flashes a spinner.
        let active = true
        Promise.all([
            listPlanEntries(range.start, range.end),
            listDailyEnergy(range.start, range.end).catch(() => [] as DailyEnergy[]),
            listNutritionPhases(range.start, range.end).catch(() => [] as NutritionPhase[]),
        ])
            .then(([rows, en, ph]) => {
                if (!active) return
                setEntries(rows)
                setEnergy(en)
                setPhases(ph)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end])

    // Keep an open detail drawer in step with the row it was opened from.
    const detailEntry = detail ? (entries.find((e) => e._id === detail._id) ?? null) : null
    const mealsById = useMemo(() => new Map(meals.map((m) => [m._id, m])), [meals])

    function step(dir: -1 | 1) {
        setAnchor((a) => addDays(mondayOf(a), dir * 7))
    }

    function stopEditing() {
        setPicker(null)
        setEditing(false)
    }

    async function handleAdd(date: string, slot: MealType, mealId: string, extra: boolean, eaten = false) {
        try {
            const entry = await addPlanEntry(date, slot, mealId, extra, eaten)
            setEntries((prev) => [...prev, entry])
        } catch {
            toast.show('Could not add that meal — please try again.', 'danger')
        }
    }

    async function handleAddPlate(
        date: string,
        slot: MealType,
        plate: PlateLineInput[],
        extra: boolean,
        eaten = false
    ) {
        try {
            const entry = await addPlatePlanEntry(date, slot, plate, extra, eaten)
            setEntries((prev) => [...prev, entry])
        } catch {
            toast.show('Could not add that plate — please try again.', 'danger')
        }
    }

    // A plate's grams changed at the table. Lines keep their batch, so an eaten
    // plate stays on the cook it came from. Optimistic, reverting on failure.
    async function handleUpdatePlate(entry: MealPlanEntry, lines: PlateLine[]) {
        setEntries((prev) =>
            prev.map((e) => (e._id === entry._id ? { ...e, plate: lines, macros: plateTotal(lines) } : e))
        )
        try {
            const saved = await updatePlate(
                entry._id,
                lines.map((l) => ({ food: l.food, grams: l.grams, ...(l.batch ? { batch: l.batch } : {}) }))
            )
            setEntries((prev) => prev.map((e) => (e._id === saved._id ? { ...saved, status: e.status } : e)))
        } catch {
            setEntries((prev) => prev.map((e) => (e._id === entry._id ? entry : e)))
            toast.show('Could not save those grams — please try again.', 'danger')
        }
    }

    async function handleRemove(id: string) {
        const removed = entries.find((e) => e._id === id)
        setEntries((prev) => prev.filter((e) => e._id !== id))
        try {
            await deletePlanEntry(id)
        } catch {
            if (removed) setEntries((prev) => [...prev, removed])
        }
    }

    // The tick: eaten, or back to planned. Optimistic, reverting on failure.
    async function handleToggle(entry: MealPlanEntry) {
        const next = entry.status === 'eaten' ? 'planned' : 'eaten'
        setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, status: next } : e)))
        try {
            await setEntryStatus(entry._id, next)
        } catch {
            setEntries((prev) => prev.map((e) => (e._id === entry._id ? entry : e)))
            toast.show('Could not save that tick — please try again.', 'danger')
        }
    }

    // Reorder a slot from a drag — and, when the dragged meal came from another
    // slot or day, move it in at the chosen spot. Optimistic, reverting on failure.
    async function handleReorder(date: string, slot: MealType, ids: string[]) {
        const position = new Map(ids.map((id, i) => [id, i]))
        const snapshot = entries
        setEntries((prev) =>
            prev.map((e) => (position.has(e._id) ? { ...e, date, slot, order: position.get(e._id)! } : e))
        )
        try {
            await reorderPlanSlot(date, slot, ids)
        } catch {
            setEntries(snapshot)
        }
    }

    function handleCopyWeek(slots: MealType[]) {
        setClipboard({ from: range.start, slots })
    }

    // Paste the clipboard onto this week — replacing only still-planned meals in
    // the copied slots — then refetch so the days show the pasted plan.
    async function handlePasteWeek() {
        if (!clipboard) return
        try {
            await copyPlanWeek(clipboard.from, range.start, clipboard.slots)
            setEntries(await listPlanEntries(range.start, range.end))
        } catch {
            toast.show('Could not paste that week — please try again.', 'danger')
        }
    }

    // Clear the planned, uneaten meals from a span of days. Optimistic.
    async function clearDays(start: string, end: string) {
        const removed = entries.filter((e) => e.date >= start && e.date <= end && clearable(e))
        if (removed.length === 0) return
        const ids = new Set(removed.map((e) => e._id))
        setEntries((prev) => prev.filter((e) => !ids.has(e._id)))
        try {
            await clearPlanRange(start, end)
        } catch {
            setEntries((prev) => [...prev, ...removed])
        }
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

    // Which slots the week already has planned meals in — a paste only needs
    // confirming when it would replace one of these.
    const weekSlots = useMemo(() => {
        const s = new Set<MealType>()
        for (const e of entries) if (clearable(e)) s.add(e.slot)
        return s
    }, [entries])

    const clearInfo = useMemo(() => {
        if (!clearTarget) return null
        if (clearTarget.type === 'day') {
            const count = entries.filter((e) => e.date === clearTarget.date && clearable(e)).length
            return { count, where: shortDayLabel(clearTarget.date), scope: 'day' as const }
        }
        const count = entries.filter((e) => e.date >= range.start && e.date <= range.end && clearable(e)).length
        return { count, where: formatWeekRange(range.start, range.end), scope: 'week' as const }
    }, [clearTarget, entries, range.start, range.end])

    // Boxes and foods plan just as well as saved meals — plates are weighed from them.
    const libraryEmpty = meals.length === 0 && foods.length === 0
    const weekHasClearable = entries.some(clearable)

    // Picking a day focuses it; on wide screens it also scrolls there.
    function selectDay(date: string) {
        setAnchor(date)
        if (isWide() && date >= range.start && date <= range.end) scrollToDay('meals', date)
    }

    return (
        <div className="flex flex-col gap-6 sm:gap-5">
            <NutritionWeekHero
                weekStart={range.start}
                selected={anchor}
                today={today}
                rangeLabel={formatWeekRange(range.start, range.end)}
                entries={entries}
                ready={!loading}
                editing={editing}
                canEdit={!libraryEmpty}
                onStep={step}
                onSelect={selectDay}
                onPick={setAnchor}
                onStartEditing={() => {
                    setPicker(null)
                    setEditing(true)
                }}
                board={board}
            />

            {editing && (
                // Every change saves as it's made, so there's nothing to cancel.
                <EditBar onDone={stopEditing}>
                    <WeekCopyControls
                        weekStart={range.start}
                        weekEnd={range.end}
                        clipboard={clipboard}
                        presentSlots={weekSlots}
                        onCopy={handleCopyWeek}
                        onPaste={handlePasteWeek}
                        onClearClipboard={() => setClipboard(null)}
                    />
                    {weekHasClearable && (
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
                </EditBar>
            )}

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : libraryEmpty && entries.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-calendar-week"
                    title="Nothing to plan with yet"
                    description="Add a meal or a box to your library first, then drop it into the plan."
                />
            ) : (
                <WeekView
                    board={board}
                    weekStart={range.start}
                    selected={anchor}
                    today={today}
                    editing={editing}
                    entries={entries}
                    goalsFor={(date) => targetsFor(date, phases, settingsGoals).goals}
                    outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? null}
                    onSelect={setAnchor}
                    onAdd={(date, slot) => setPicker({ date, slot, extra: false })}
                    onQuickLog={(date, slot) => setPicker({ date, slot, extra: false, eaten: true })}
                    onOpen={setDetail}
                    onToggle={handleToggle}
                    onRemove={handleRemove}
                    onReorder={handleReorder}
                    onClearDay={(date) => setClearTarget({ type: 'day', date })}
                    onSaveOut={saveOut}
                />
            )}

            <MealPickerDrawer
                target={picker}
                meals={meals}
                foods={foods}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onAddPlate={handleAddPlate}
                onRemove={handleRemove}
            />

            <PlannedMealDrawer
                entry={detailEntry}
                meal={detailEntry?.meal ? (mealsById.get(detailEntry.meal) ?? null) : null}
                onClose={() => setDetail(null)}
                onToggle={handleToggle}
                onUpdatePlate={handleUpdatePlate}
                onRemove={(id) => {
                    setDetail(null)
                    void handleRemove(id)
                }}
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
                                {clearInfo.count} planned meal{clearInfo.count !== 1 ? 's' : ''}
                            </span>{' '}
                            from <span className="font-semibold">{clearInfo.where}</span>? Meals you’ve
                            eaten and anything you logged stay.
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
        </div>
    )
}

// ─── Copy / paste week ──────────────────────────────────────────────────────────

/**
 * Copy this week's plan and paste it onto another. "Copy week" opens a
 * checklist of slots; navigating to a different week reveals "Paste", which
 * replaces only the still-planned meals in those slots there.
 */
function WeekCopyControls({
    weekStart,
    weekEnd,
    clipboard,
    presentSlots,
    onCopy,
    onPaste,
    onClearClipboard,
}: {
    weekStart: string
    weekEnd: string
    clipboard: { from: string; slots: MealType[] } | null
    presentSlots: Set<MealType>
    onCopy: (slots: MealType[]) => void
    onPaste: () => void
    onClearClipboard: () => void
}) {
    const [confirming, setConfirming] = useState(false)
    const [open, setOpen] = useState(false)
    const [selected, setSelected] = useState<Set<MealType>>(() => new Set(MEAL_TYPES))
    const panelRef = useRef<HTMLDivElement>(null)

    // Close the checklist on an outside click.
    useEffect(() => {
        if (!open) return
        function handle(e: MouseEvent) {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open])

    const sameWeek = clipboard?.from === weekStart
    const wouldReplace = clipboard?.slots.some((s) => presentSlots.has(s)) ?? false
    const chosen = MEAL_TYPES.filter((s) => selected.has(s))
    const allSelected = chosen.length === MEAL_TYPES.length

    function toggle(slot: MealType) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(slot)) next.delete(slot)
            else next.add(slot)
            return next
        })
    }

    return (
        <div className="flex items-center gap-2">
            <div ref={panelRef} className="inline-block sm:relative">
                <Button variant="secondary" size="sm" icon="fa-solid fa-copy" onClick={() => setOpen((o) => !o)}>
                    Copy week
                </Button>
                {open && (
                    // On a phone the panel spans the edit bar so it can't open
                    // off-screen; from sm up it hangs under the button.
                    <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-xl border border-neutral-100 bg-white p-3 shadow-lg sm:inset-x-auto sm:right-0 sm:top-auto sm:min-w-56">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                Copy which meals
                            </p>
                            <button
                                type="button"
                                onClick={() => setSelected(allSelected ? new Set() : new Set(MEAL_TYPES))}
                                className="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900"
                            >
                                {allSelected ? 'Clear' : 'All'}
                            </button>
                        </div>
                        <div className="flex flex-col gap-0.5">
                            {MEAL_TYPES.map((s) => (
                                <Checkbox
                                    key={s}
                                    checked={selected.has(s)}
                                    onChange={() => toggle(s)}
                                    label={CATEGORY[s].label}
                                    className="rounded-lg px-1.5 py-1 hover:bg-neutral-50"
                                />
                            ))}
                        </div>
                        <Button
                            variant="primary"
                            size="sm"
                            icon="fa-solid fa-copy"
                            onClick={() => {
                                if (chosen.length === 0) return
                                onCopy(chosen)
                                setOpen(false)
                            }}
                            disabled={chosen.length === 0}
                            className="mt-3 w-full justify-center"
                        >
                            Copy {chosen.length ? slotsLabel(chosen) : ''}
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
                        title={sameWeek ? 'This is the week you copied — move to another week to paste' : undefined}
                    >
                        Paste {slotsLabel(clipboard.slots)}
                    </Button>
                    <IconButton icon="fa-solid fa-xmark" label="Clear copied week" onClick={onClearClipboard} />
                </div>
            )}

            <ConfirmModal
                open={confirming}
                title="Paste week plan?"
                confirmLabel="Paste"
                message={
                    clipboard && (
                        <p className="text-sm text-neutral-600">
                            Replace the planned{' '}
                            <span className="font-semibold">{slotsLabel(clipboard.slots)}</span> for{' '}
                            <span className="font-semibold">{formatWeekRange(weekStart, weekEnd)}</span> with
                            the plan copied from{' '}
                            <span className="font-semibold">
                                {formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                            </span>
                            ? Meals already eaten stay as they are.
                        </p>
                    )
                }
                onConfirm={onPaste}
                onClose={() => setConfirming(false)}
            />
        </div>
    )
}

// ─── Week hero ────────────────────────────────────────────────────────────────

/** The slots a list of entries has meals in, in canonical order. */
function slotsIn(entries: MealPlanEntry[]): MealType[] {
    const present = new Set(entries.map((e) => e.slot))
    return MEAL_TYPES.filter((s) => present.has(s))
}

/**
 * The top of the planner: which week it is, how much of it has been eaten,
 * and a strip of the seven days — the day switcher on a phone and a
 * jump-to-day on wider screens.
 */
function NutritionWeekHero({
    weekStart,
    selected,
    today,
    rangeLabel,
    entries,
    ready,
    editing,
    canEdit,
    onStep,
    onSelect,
    onPick,
    onStartEditing,
    board,
}: {
    weekStart: string
    selected: string
    today: string
    rangeLabel: string
    entries: MealPlanEntry[]
    ready: boolean
    editing: boolean
    canEdit: boolean
    onStep: (dir: -1 | 1) => void
    onSelect: (date: string) => void
    onPick: (date: string) => void
    onStartEditing: () => void
    board: boolean
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const planned = entries.filter((e) => !e.extra)
    const eaten = planned.filter(isEaten).length
    // Average planned calories over the days that have anything on them.
    const daysWithMeals = days.filter((d) => entries.some((e) => e.date === d))
    const avgKcal = daysWithMeals.length ? sumMacros(entries).calories / daysWithMeals.length : 0
    const isThisWeek = mondayOf(today) === weekStart

    const facts = [
        rangeLabel,
        ready && planned.length > 0 && `${eaten} of ${planned.length} eaten`,
        ready && avgKcal > 0 && `~${kcal(avgKcal)} kcal a day`,
        ready && entries.length === 0 && 'nothing planned yet',
    ].filter(Boolean)

    const arrows = (
        <div className="flex shrink-0 items-center gap-2 sm:gap-1">
            <HeroIconButton label="Previous week" icon="fa-solid fa-chevron-left" onClick={() => onStep(-1)} />
            <HeroIconButton label="Next week" icon="fa-solid fa-chevron-right" onClick={() => onStep(1)} />
        </div>
    )

    // Phones: the week's title gets a row to itself, the controls a row under
    // it. From `sm` up it all sits on one line — the same as the Fitness planner.
    return (
        <HeroShell tone="soft">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="hidden sm:block">{arrows}</div>
                    <div className="min-w-0 flex-1">
                        <h2 className="truncate text-xl font-semibold tracking-tight sm:text-lg">
                            {relativeWeekLabel(weekStart, mondayOf(today))}
                        </h2>
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
                    {canEdit && !editing && (
                        <div className="ml-auto">
                            <HeroButton primary icon="fa-solid fa-pen" onClick={onStartEditing}>
                                Edit plan
                            </HeroButton>
                        </div>
                    )}
                </div>
            </div>

            {!board && (
                <DayStrip>
                    {days.map((date) => {
                        const dayEntries = entries.filter((e) => e.date === date)
                        const dayPlanned = dayEntries.filter((e) => !e.extra)
                        return (
                            <DayPill
                                key={date}
                                date={date}
                                active={date === selected}
                                isToday={date === today}
                                dots={ready ? slotsIn(dayPlanned).map((s) => CATEGORY[s].solid) : []}
                                allDone={ready && dayPlanned.length > 0 && dayPlanned.every(isEaten)}
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
    editing,
    entries,
    goalsFor,
    outFor,
    onSelect,
    onAdd,
    onQuickLog,
    onOpen,
    onToggle,
    onRemove,
    onReorder,
    onClearDay,
    onSaveOut,
}: {
    /** Lay the seven days side by side across the screen, rather than stacked. */
    board: boolean
    weekStart: string
    /** The focused day — the only one shown on a phone. */
    selected: string
    today: string
    editing: boolean
    entries: MealPlanEntry[]
    goalsFor: (date: string) => MacroGoals | null
    outFor: (date: string) => number | null
    onSelect: (date: string) => void
    onAdd: (date: string, slot: MealType) => void
    /** Log what was eaten into a slot, planned or not. */
    onQuickLog: (date: string, slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRemove: (id: string) => void
    onReorder: (date: string, slot: MealType, ids: string[]) => void
    onClearDay: (date: string) => void
    onSaveOut: (date: string, value: number | null) => Promise<void>
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

    // Drag-and-drop state, held here so a meal can be dragged across days.
    // `dropAt` is where it would land: a day + slot and the row to drop before
    // (`refId`, or null to append).
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropAt, setDropAt] = useState<{
        date: string
        slot: MealType
        refId: string | null
        after: boolean
    } | null>(null)

    const { sliderProps, dayClass } = useDaySlider(selected, (dir) => onSelect(addDays(selected, dir)))

    const slotItems = (date: string, slot: MealType) =>
        entries.filter((e) => e.date === date && e.slot === slot && !e.extra).sort((a, b) => a.order - b.order)

    function resetDrag() {
        setDragId(null)
        setDropAt(null)
    }

    function handleDrop() {
        const dragged = dragId ? entries.find((e) => e._id === dragId) : null
        const target = dropAt
        resetDrag()
        if (!dragged || !target) return

        const display = slotItems(target.date, target.slot).map((e) => e._id)
        const ids = display.filter((id) => id !== dragged._id)
        let pos = ids.length
        if (target.refId !== null) {
            const ri = ids.indexOf(target.refId)
            if (ri !== -1) pos = target.after ? ri + 1 : ri
        }
        ids.splice(pos, 0, dragged._id)

        if (dragged.date === target.date && dragged.slot === target.slot && ids.join() === display.join()) return
        onReorder(target.date, target.slot, ids)
    }

    return (
        <div
            {...(board ? {} : sliderProps)}
            className={board ? 'grid grid-cols-7 items-stretch gap-2 xl:gap-3' : 'day-slider flex flex-col gap-3 md:gap-4'}
        >
            {days.map((date) => (
                <DayCard
                    key={date}
                    date={date}
                    compact={board}
                    className={board ? 'flex' : dayClass(date)}
                    isToday={date === today}
                    // Calories out only make sense once the day has happened.
                    hasHappened={date <= today}
                    editable={editing}
                    entries={entries.filter((e) => e.date === date)}
                    goals={goalsFor(date)}
                    out={outFor(date)}
                    onAdd={(slot) => onAdd(date, slot)}
                    onQuickLog={(slot) => onQuickLog(date, slot)}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onRemove={onRemove}
                    dragActive={dragId !== null}
                    draggedId={dragId}
                    dropForDay={dropAt && dropAt.date === date ? dropAt : null}
                    onEntryDragStart={setDragId}
                    onEntryDragEnd={resetDrag}
                    onTarget={(slot, refId, after) => setDropAt({ date, slot, refId, after })}
                    onClearTarget={(slot) => setDropAt((d) => (d && d.date === date && d.slot === slot ? null : d))}
                    onDropEntry={handleDrop}
                    onClear={() => onClearDay(date)}
                    onSaveOut={(v) => onSaveOut(date, v)}
                />
            ))}
            {!editing && !board && <SwipeHint />}
        </div>
    )
}

function IconButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-neutral-200 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
            <i className={icon} aria-hidden="true" />
        </button>
    )
}

function DayCard({
    date,
    compact = false,
    className = '',
    isToday,
    hasHappened,
    editable,
    entries,
    goals,
    out,
    onAdd,
    onQuickLog,
    onOpen,
    onToggle,
    onRemove,
    dragActive,
    draggedId,
    dropForDay,
    onEntryDragStart,
    onEntryDragEnd,
    onTarget,
    onClearTarget,
    onDropEntry,
    onClear,
    onSaveOut,
}: {
    date: string
    compact?: boolean
    className?: string
    isToday: boolean
    /** Today or earlier — the day gets its calories-out line. */
    hasHappened: boolean
    editable: boolean
    entries: MealPlanEntry[]
    goals: MacroGoals | null
    out: number | null
    onAdd: (slot: MealType) => void
    onQuickLog: (slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRemove: (id: string) => void
    dragActive: boolean
    draggedId: string | null
    dropForDay: { slot: MealType; refId: string | null; after: boolean } | null
    onEntryDragStart: (id: string) => void
    onEntryDragEnd: () => void
    onTarget: (slot: MealType, refId: string | null, after: boolean) => void
    onClearTarget: (slot: MealType) => void
    onDropEntry: () => void
    onClear: () => void
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const planned = entries.filter((e) => !e.extra)
    const extras = entries.filter((e) => e.extra).sort((a, b) => a.order - b.order)
    const total = planned.length
    const eatenCount = planned.filter(isEaten).length
    const plannedKcal = sumMacros(planned).calories

    const slotItems = (slot: MealType) => planned.filter((e) => e.slot === slot).sort((a, b) => a.order - b.order)

    // What the day holds, with a thin bar filling as meals are eaten.
    const summary =
        total === 0 ? (
            <p className="text-[13px] text-neutral-500">
                {extras.length > 0 ? `${extras.length} logged` : 'Nothing planned'}
            </p>
        ) : (
            <div className="flex flex-col gap-1.5">
                <p className="text-[13px] text-neutral-500">
                    {total} {total === 1 ? 'meal' : 'meals'}
                    {plannedKcal > 0 && ` · ${kcal(plannedKcal)} kcal`}
                    {eatenCount > 0 && <span className="text-emerald-700"> · {eatenCount} eaten</span>}
                    {extras.length > 0 && ` · ${extras.length} logged`}
                </p>
                <div className="h-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
                        style={{ width: `${(eatenCount / total) * 100}%` }}
                    />
                </div>
            </div>
        )

    const canClear = editable && planned.some(clearable)
    const actions = canClear && (
        <button
            type="button"
            onClick={onClear}
            aria-label={`Clear ${weekday}`}
            title="Clear day"
            className="-my-1.5 ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500"
        >
            <i className="fa-solid fa-broom text-[12px]" aria-hidden="true" />
        </button>
    )

    const titleRow = (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={`font-semibold tracking-tight text-neutral-900 ${compact ? 'text-base' : 'text-lg'}`}>
                {compact ? weekday.slice(0, 3) : weekday}
            </h3>
            <span className="text-sm text-neutral-500">
                {day} {compact ? MONTHS[month].slice(0, 3) : MONTHS[month]}
            </span>
            {isToday && <span className="text-sm font-medium text-coral-600">Today</span>}
            {actions}
        </div>
    )

    return (
        <DayCardShell id={dayCardId('meals', date)} isToday={isToday} compact={compact} className={className}>
            <header className="flex flex-col gap-2">
                {titleRow}
                {summary}
            </header>

            {
                <div
                    className={
                        editable
                            ? compact
                                ? 'flex flex-col gap-3'
                                : 'grid gap-3 lg:grid-cols-2 2xl:grid-cols-4'
                            : 'flex flex-col divide-y divide-neutral-100'
                    }
                >
                    {MEAL_TYPES.map((slot) => (
                        <SlotSection
                            key={slot}
                            compact={compact}
                            slot={slot}
                            editable={editable}
                            entries={slotItems(slot)}
                            onAdd={() => onAdd(slot)}
                            onQuickLog={() => onQuickLog(slot)}
                            onOpen={onOpen}
                            onToggle={onToggle}
                            onRemove={onRemove}
                            dragActive={dragActive}
                            draggedId={draggedId}
                            drop={dropForDay && dropForDay.slot === slot ? dropForDay : null}
                            onEntryDragStart={onEntryDragStart}
                            onEntryDragEnd={onEntryDragEnd}
                            onTarget={(refId, after) => onTarget(slot, refId, after)}
                            onClearTarget={() => onClearTarget(slot)}
                            onDropEntry={onDropEntry}
                        />
                    ))}
                    {extras.length > 0 && (
                        <ExtrasSection
                            compact={compact}
                            editable={editable}
                            entries={extras}
                            onOpen={onOpen}
                            onRemove={onRemove}
                        />
                    )}
                </div>
            }

            {hasHappened && !editable && (
                <DayEnergy
                    key={out ?? 'none'}
                    compact={compact}
                    eaten={sumEatenMacros(entries)}
                    goals={goals}
                    out={out}
                    onSaveOut={onSaveOut}
                />
            )}
        </DayCardShell>
    )
}

/**
 * One meal slot of a day. Viewing, it's a label beside its meals (or over them
 * in a board column); editing, it becomes a lane — an add button and a drop
 * target, shown even when empty.
 */
function SlotSection({
    compact = false,
    slot,
    editable,
    entries,
    onAdd,
    onQuickLog,
    onOpen,
    onToggle,
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
    compact?: boolean
    slot: MealType
    editable: boolean
    entries: MealPlanEntry[]
    onAdd: () => void
    onQuickLog: () => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRemove: (id: string) => void
    dragActive: boolean
    draggedId: string | null
    drop: { refId: string | null; after: boolean } | null
    onEntryDragStart: (id: string) => void
    onEntryDragEnd: () => void
    onTarget: (refId: string | null, after: boolean) => void
    onClearTarget: () => void
    onDropEntry: () => void
}) {
    const meta = CATEGORY[slot]
    const listRef = useRef<HTMLUListElement>(null)

    // The whole slot is one drop target: the insertion point comes from the
    // cursor's Y against each row's midpoint, skipping the row in flight.
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
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) onClearTarget()
              },
              onDrop: (e: DragEvent) => {
                  e.preventDefault()
                  onDropEntry()
              },
          }
        : {}

    const label = <span className="text-[13px] font-medium text-neutral-500">{meta.label}</span>

    const rows = entries.map((e) => (
        <PlannedRow
            key={e._id}
            compact={compact}
            entry={e}
            dropId={e._id}
            onOpen={() => onOpen(e)}
            onToggle={editable ? undefined : () => onToggle(e)}
            onRemove={editable ? () => onRemove(e._id) : undefined}
            draggable={editable}
            onDragStart={() => onEntryDragStart(e._id)}
            onDragEnd={onEntryDragEnd}
            dropEdge={drop && drop.refId === e._id ? (drop.after ? 'bottom' : 'top') : null}
        />
    ))

    if (!editable) {
        const logButton = (
            <button
                type="button"
                onClick={onQuickLog}
                aria-label={`Quick log ${meta.label.toLowerCase()}`}
                title="Quick log"
                className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold text-neutral-600 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white hover:ring-neutral-900 ${
                    compact ? 'h-6 w-6 text-[10px]' : 'h-9 px-3 text-xs sm:h-8'
                }`}
            >
                <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
                {!compact && <span>Log</span>}
            </button>
        )
        return (
            <div
                className={
                    compact
                        ? 'flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0'
                        : // Phones: the slot's name over its meals, so rows get the full width.
                          'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
                }
            >
                <div
                    className={`flex items-center justify-between gap-2 ${
                        compact ? '' : 'sm:flex-col sm:items-start sm:pt-1.5'
                    }`}
                >
                    <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.solid}`} aria-hidden="true" />
                        {label}
                    </span>
                    {logButton}
                </div>
                {entries.length > 0 ? (
                    <ul className={compact ? 'flex flex-col gap-1.5' : 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3'}>
                        {rows}
                    </ul>
                ) : (
                    <button type="button" onClick={onQuickLog} className="group block w-full text-left">
                        <EmptySlotTile
                            compact={compact}
                            title="Nothing yet"
                            detail={compact ? 'Tap to log' : 'Tap to log what you ate'}
                        />
                    </button>
                )}
            </div>
        )
    }

    return (
        <div
            {...containerDropProps}
            className={`flex flex-col gap-2 rounded-2xl transition-colors ${compact ? 'p-1.5' : 'p-2.5'} ${
                drop ? 'bg-coral-50 ring-2 ring-inset ring-coral-200' : 'bg-neutral-50'
            }`}
        >
            <div className="flex items-center justify-between pl-1">
                {label}
                <button
                    type="button"
                    aria-label={`Add to ${meta.label.toLowerCase()}`}
                    onClick={onAdd}
                    className="grid h-8 w-8 place-items-center rounded-[10px] bg-white text-neutral-500 shadow-sm ring-1 ring-neutral-900/[0.06] transition-colors hover:bg-neutral-900 hover:text-white"
                >
                    <i className="fa-solid fa-plus text-[11px]" aria-hidden="true" />
                </button>
            </div>
            {entries.length > 0 ? (
                <ul ref={listRef} className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>
                    {rows}
                    {drop && drop.refId === null && <DropLine />}
                </ul>
            ) : (
                <button type="button" onClick={onAdd} className="group block w-full text-left">
                    <EmptySlotTile
                        compact={compact}
                        active={dragActive}
                        title={dragActive ? 'Move here' : `Add to ${meta.label.toLowerCase()}`}
                        detail={dragActive ? 'Drop to move it' : 'Pick a meal'}
                    />
                </button>
            )}
        </div>
    )
}

/** Whatever was logged with "Log more" — eaten already, so never dragged or ticked. */
function ExtrasSection({
    compact,
    editable,
    entries,
    onOpen,
    onRemove,
}: {
    compact: boolean
    editable: boolean
    entries: MealPlanEntry[]
    onOpen: (entry: MealPlanEntry) => void
    onRemove: (id: string) => void
}) {
    const label = <span className="text-[13px] font-medium text-neutral-500">Also ate</span>
    const rows = entries.map((e) => (
        <PlannedRow
            key={e._id}
            compact={compact}
            entry={e}
            onOpen={() => onOpen(e)}
            onRemove={editable ? () => onRemove(e._id) : undefined}
            draggable={false}
            lane={editable}
        />
    ))
    if (editable) {
        return (
            <div className={`flex flex-col gap-2 rounded-2xl bg-neutral-50 ${compact ? 'p-1.5' : 'p-2.5'}`}>
                <div className="flex h-8 items-center pl-1">{label}</div>
                <ul className={`flex flex-col ${compact ? 'gap-1.5' : 'gap-2'}`}>{rows}</ul>
            </div>
        )
    }
    return (
        <div
            className={
                compact
                    ? 'flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0'
                    : 'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
            }
        >
            <span className={`flex items-center gap-2 ${compact ? '' : 'sm:pt-1.5'}`}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300" aria-hidden="true" />
                {label}
            </span>
            <ul className={compact ? 'flex flex-col gap-1.5' : 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3'}>{rows}</ul>
        </div>
    )
}

/** A slot with nothing in it, built like a planned row so it stands as tall as one. */
function EmptySlotTile({
    compact = false,
    active = false,
    title,
    detail,
}: {
    compact?: boolean
    active?: boolean
    title: string
    detail: string
}) {
    return (
        <span
            className={`flex items-center rounded-xl outline-1 -outline-offset-1 outline-dashed transition-colors ${
                compact ? 'p-2' : 'px-2.5 py-2'
            } ${
                active
                    ? 'bg-coral-50 text-coral-600 outline-coral-300'
                    : 'text-neutral-400 outline-neutral-200 group-hover:text-neutral-600 group-hover:outline-neutral-300'
            }`}
        >
            <span className="flex min-w-0 items-stretch gap-2.5">
                <span className="w-1 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 py-0.5">
                    <span className="block truncate text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block truncate text-[13px] opacity-80">{detail}</span>
                </span>
            </span>
        </span>
    )
}

/** The coral marker showing where a dragged row will drop within a slot. */
function DropLine() {
    return <li aria-hidden="true" className="h-0.5 rounded-full bg-coral-500" />
}

function PlannedRow({
    compact = false,
    entry,
    onOpen,
    onToggle,
    onRemove,
    draggable = false,
    lane = draggable,
    onDragStart,
    onDragEnd,
    dropId,
    dropEdge = null,
}: {
    compact?: boolean
    entry: MealPlanEntry
    onOpen?: () => void
    /** Viewing: the tick that marks the meal eaten, or back to planned. */
    onToggle?: () => void
    onRemove?: () => void
    draggable?: boolean
    /** Sits in a grey edit lane, so it stands off it in white. */
    lane?: boolean
    onDragStart?: () => void
    onDragEnd?: () => void
    dropId?: string
    /** Which edge to mark as the pending drop spot — an overlay, so the row never shifts. */
    dropEdge?: 'top' | 'bottom' | null
}) {
    const done = isEaten(entry)
    const [dragging, setDragging] = useState(false)

    const body = (
        <span className="flex min-w-0 items-stretch gap-2.5">
            <span
                className={`w-1 shrink-0 rounded-full ${entry.extra ? 'bg-neutral-300' : CATEGORY[entry.slot].solid}`}
                aria-hidden="true"
            />
            <span className="min-w-0 flex-1 py-0.5">
                <span
                    className={`block truncate font-medium ${compact ? 'text-sm' : 'text-[15px] sm:text-sm'} ${
                        done && !entry.extra ? 'text-neutral-500' : 'text-neutral-900'
                    }`}
                >
                    {plateTitle(entry)}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{plannedMeta(entry)}</span>
            </span>
        </span>
    )

    const tickSize = compact ? 'h-6 w-6' : 'h-10 w-10 sm:h-8 sm:w-8'

    return (
        <li
            draggable={draggable}
            onDragStart={
                draggable
                    ? (e: DragEvent) => {
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
            className={`group relative flex items-center rounded-xl transition-colors ${
                compact ? 'gap-1 p-2' : 'min-h-14 gap-2 px-3 py-2 sm:min-h-0 sm:px-2.5'
            } ${lane ? 'bg-white ring-1 ring-neutral-900/[0.06]' : 'bg-neutral-50'} ${
                onOpen ? (lane ? 'hover:ring-neutral-900/[0.12]' : 'hover:bg-neutral-100') : ''
            } ${draggable ? 'md:cursor-grab md:active:cursor-grabbing' : ''} ${dragging ? 'opacity-40' : ''}`}
        >
            {dropEdge && (
                <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-coral-500 ${
                        dropEdge === 'top' ? '-top-[5px]' : '-bottom-[5px]'
                    }`}
                />
            )}
            {draggable && !compact && (
                <i
                    className="fa-solid fa-grip-vertical hidden shrink-0 pl-1 text-[11px] text-neutral-300 md:inline"
                    aria-hidden="true"
                />
            )}
            {onOpen ? (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={`View ${entry.name}`}
                    className="min-w-0 flex-1 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-300"
                >
                    {body}
                </button>
            ) : (
                <div className="min-w-0 flex-1">{body}</div>
            )}
            {onToggle ? (
                <button
                    type="button"
                    aria-pressed={done}
                    aria-label={done ? `Mark ${entry.name} as not eaten` : `Mark ${entry.name} as eaten`}
                    title={done ? 'Eaten' : 'Mark as eaten'}
                    onClick={onToggle}
                    className={`grid shrink-0 place-items-center rounded-full transition-colors ${tickSize} ${
                        done
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-white text-neutral-300 ring-1 ring-inset ring-neutral-200 hover:text-emerald-600 hover:ring-emerald-300'
                    }`}
                >
                    <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
                </button>
            ) : (
                done &&
                !entry.extra && (
                    <span
                        className={`grid shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 ${
                            compact ? 'h-5 w-5' : 'h-6 w-6'
                        }`}
                        aria-label="Eaten"
                        title="Eaten"
                    >
                        <i className="fa-solid fa-check text-[11px]" aria-hidden="true" />
                    </span>
                )
            )}
            {onRemove && (
                <button
                    type="button"
                    aria-label={`Remove ${entry.name}`}
                    onClick={onRemove}
                    className={`grid shrink-0 place-items-center rounded-full text-neutral-300 transition-colors hover:bg-red-50 hover:text-red-500 ${
                        compact ? 'h-6 w-6' : 'h-8 w-8'
                    }`}
                >
                    <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                </button>
            )}
        </li>
    )
}

// ─── Calories in and out ─────────────────────────────────────────────────────

/**
 * The day's balance, once it's happened: what's been eaten against the
 * target, calories out typed from a watch, and the difference.
 */
function DayEnergy({
    compact,
    eaten,
    goals,
    out,
    onSaveOut,
}: {
    compact: boolean
    eaten: Macros
    goals: MacroGoals | null
    out: number | null
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const net = out === null ? null : eaten.calories - out
    const macros = [
        { label: 'Protein', value: eaten.protein, goal: goals?.protein, bar: 'bg-brand-600' },
        { label: 'Carbs', value: eaten.carbs, goal: goals?.carbs, bar: 'bg-marigold' },
        { label: 'Fat', value: eaten.fat, goal: goals?.fat, bar: 'bg-coral-300' },
    ]
    // On a narrow board column only protein fits beside the calories.
    const shown = compact ? macros.slice(0, 1) : macros

    return (
        <div className={`flex flex-col rounded-2xl bg-neutral-50 ${compact ? 'gap-2.5 p-2.5' : 'gap-3 p-3.5 sm:p-4'}`}>
            <div className="flex flex-col gap-1.5">
                <EnergyRow label="Eaten">
                    {kcal(eaten.calories)}
                    {goals?.calories ? <span className="font-normal text-neutral-500"> / {kcal(goals.calories)}</span> : null}
                    <Unit>kcal</Unit>
                </EnergyRow>
                {goals?.calories ? <Meter value={eaten.calories} goal={goals.calories} bar="bg-neutral-900" /> : null}
            </div>

            <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {shown.map((m) => (
                    <div key={m.label} className="flex min-w-0 flex-col gap-1">
                        <span className="text-[13px] text-neutral-500">{m.label}</span>
                        <span className="truncate text-sm font-semibold tabular-nums text-neutral-900">
                            {fmt(Math.round(m.value))}
                            {m.goal ? <span className="font-normal text-neutral-500"> / {fmt(m.goal)}</span> : null}
                            <Unit>g</Unit>
                        </span>
                        {m.goal ? <Meter value={m.value} goal={m.goal} bar={m.bar} /> : null}
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-2 border-t border-neutral-200/70 pt-3">
                <EnergyRow label="Burned">
                    <OutField out={out} onSave={onSaveOut} />
                    <Unit>kcal</Unit>
                </EnergyRow>
                {/* Only once burned is in — there's no balance without it. */}
                {net !== null && (
                    <EnergyRow label="Balance">
                        <span className={net < 0 ? 'text-emerald-700' : net > 0 ? 'text-amber-700' : ''}>
                            {signedKcal(net)}
                        </span>
                        <Unit>kcal {net < 0 ? 'deficit' : net > 0 ? 'surplus' : 'even'}</Unit>
                    </EnergyRow>
                )}
            </div>
        </div>
    )
}

/** One line of the day's balance: what it is on the left, the figure on the right. */
function EnergyRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex min-h-8 items-center justify-between gap-3">
            <span className="text-[13px] text-neutral-500">{label}</span>
            {/* Plain inline text, not flex — flex would swallow the spaces in "0 / 2,850". */}
            <span className="min-w-0 whitespace-nowrap text-right text-sm font-semibold tabular-nums text-neutral-900">
                {children}
            </span>
        </div>
    )
}

function Unit({ children }: { children: ReactNode }) {
    return <span className="ml-1 whitespace-nowrap font-normal text-neutral-500">{children}</span>
}

/** A thin bar filling toward a target — never past full. */
function Meter({ value, goal, bar }: { value: number; goal: number; bar: string }) {
    const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0
    return (
        <div className="h-1 overflow-hidden rounded-full bg-neutral-200/80">
            <div className={`h-full rounded-full transition-[width] duration-500 ${bar}`} style={{ width: `${pct}%` }} />
        </div>
    )
}

/** Calories out, typed straight into the figure — saved on blur or Enter, cleared by emptying it. */
function OutField({ out, onSave }: { out: number | null; onSave: (value: number | null) => Promise<void> }) {
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
        <input
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            aria-label="Calories out"
            placeholder="0"
            value={value}
            disabled={saving}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            className="h-8 w-20 rounded-lg bg-white px-2 align-middle text-right text-sm font-semibold tabular-nums text-neutral-900 outline-none ring-1 ring-inset ring-neutral-200 transition-shadow placeholder:font-normal placeholder:text-neutral-400 hover:ring-neutral-300 focus:ring-2 focus:ring-neutral-900"
        />
    )
}

// ─── Day drawer: add a meal / log more ───────────────────────────────────────

/** How many library meals the add list lays out at a time. */
const PICKER_PAGE_SIZE = 10

/**
 * The day drawer. Planning, it targets a day + slot: the slot toggle picks
 * where an added meal lands and narrows the list to meals tagged for it (a
 * search reaches the whole library). "Log more" uses the same drawer, but
 * what's added goes straight in as eaten.
 */
function MealPickerDrawer({
    target,
    meals,
    foods,
    entries,
    onClose,
    onAdd,
    onAddPlate,
    onRemove,
}: {
    target: PickerTarget | null
    meals: Meal[]
    foods: PlateFood[]
    entries: MealPlanEntry[]
    onClose: () => void
    onAdd: (date: string, slot: MealType, mealId: string, extra: boolean, eaten: boolean) => Promise<void>
    onAddPlate: (date: string, slot: MealType, plate: PlateLineInput[], extra: boolean, eaten: boolean) => Promise<void>
    onRemove: (id: string) => void
}) {
    // A saved meal, or a plate weighed out from boxes and foods.
    const [mode, setMode] = useState<'meal' | 'plate'>('meal')
    // Retain the last target so the drawer keeps its content while sliding shut.
    const [view, setView] = useState(target)
    const [query, setQuery] = useState('')
    const [activeSlot, setActiveSlot] = useState<MealType>('breakfast')
    const [page, setPage] = useState(1)
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (target) {
            setView(target)
            setQuery('')
            setActiveSlot(target.slot)
            setPage(1)
            // Lunch and dinner are usually plated from the pantry — and with no
            // saved meals, plating is the only way to fill any slot.
            const plated = meals.length === 0 || target.slot === 'lunch' || target.slot === 'dinner'
            const plateable = foods.some((f) => f.kind === 'plain' || f.open.length > 0)
            setMode(plateable && plated ? 'plate' : 'meal')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target])

    useEffect(() => {
        setPage(1)
    }, [activeSlot, query])

    const extra = view?.extra ?? false
    const eaten = view?.eaten ?? false
    const title = extra ? 'Log more' : eaten ? 'Quick log' : 'Add to day'

    const results = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = q ? meals.filter((m) => m.name.toLowerCase().includes(q)) : meals.filter((m) => m.types.includes(activeSlot))
        return [...base].sort((a, b) => a.name.localeCompare(b.name))
    }, [meals, query, activeSlot])

    const total = results.length
    const pageCount = Math.max(1, Math.ceil(total / PICKER_PAGE_SIZE))
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])
    const from = (page - 1) * PICKER_PAGE_SIZE
    const to = from + PICKER_PAGE_SIZE

    // The day's meals, grouped by slot: what's planned, or — logging — what's
    // been logged so far.
    const slots = MEAL_TYPES.map((slot) => ({
        slot,
        items: entries.filter((e) => e.slot === slot && e.extra === extra).sort((a, b) => a.order - b.order),
    })).filter((s) => s.items.length > 0)

    async function add(meal: Meal) {
        if (!view || busy) return
        setBusy(true)
        try {
            await onAdd(view.date, activeSlot, meal._id, extra, eaten)
        } finally {
            setBusy(false)
        }
    }

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
                {slots.length > 0 && (
                    <section className="flex flex-col gap-3">
                        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                            {extra ? 'Logged on this day' : 'On this day'}
                        </p>
                        {slots.map(({ slot, items }) => (
                            <div key={slot} className="flex flex-col gap-1.5">
                                <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                    <i className={`${CATEGORY[slot].icon} text-[11px] text-neutral-500`} aria-hidden="true" />
                                    {CATEGORY[slot].label}
                                </span>
                                <ul className="flex flex-col gap-1">
                                    {items.map((e) => (
                                        <PlannedRow key={e._id} entry={e} onRemove={() => onRemove(e._id)} />
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </section>
                )}

                <div className="flex flex-col gap-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">Slot</p>
                    <div className="inline-flex flex-wrap self-start gap-1 rounded-xl bg-neutral-100 p-1">
                        {MEAL_TYPES.map((s) => {
                            const active = s === activeSlot
                            return (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setActiveSlot(s)}
                                    className={`h-8 rounded-[9px] px-3 text-[13px] font-medium transition-all duration-200 ${
                                        active
                                            ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                                            : 'text-neutral-500 hover:text-neutral-900'
                                    }`}
                                >
                                    {CATEGORY[s].label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
                    {(
                        [
                            ['meal', 'Saved meal', 'fa-solid fa-bowl-food'],
                            ['plate', 'Plate by weight', 'fa-solid fa-scale-balanced'],
                        ] as const
                    ).map(([m, label, icon]) => (
                        <button
                            key={m}
                            type="button"
                            onClick={() => setMode(m)}
                            aria-pressed={mode === m}
                            className={`inline-flex h-10 items-center justify-center gap-2 rounded-[9px] text-[13px] font-semibold transition-all ${
                                mode === m
                                    ? 'bg-white text-neutral-900 shadow-sm ring-1 ring-neutral-900/[0.04]'
                                    : 'text-neutral-500 hover:text-neutral-900'
                            }`}
                        >
                            <i className={`${icon} text-xs`} aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                </div>

                {mode === 'plate' ? (
                    <PlateBuilder
                        foods={foods}
                        busy={busy}
                        actionLabel={extra || eaten ? 'Log plate' : 'Add plate'}
                        onAdd={async (plate) => {
                            if (!view) return
                            setBusy(true)
                            try {
                                await onAddPlate(view.date, activeSlot, plate, extra, eaten)
                            } finally {
                                setBusy(false)
                            }
                        }}
                    />
                ) : (
                <>
                <Input
                    icon="fa-solid fa-magnifying-glass"
                    type="search"
                    placeholder="Search every meal…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                {total > 0 && (
                    <p className="text-xs text-neutral-500">
                        {query.trim()
                            ? `${total} matching meal${total === 1 ? '' : 's'}`
                            : `${total} ${CATEGORY[activeSlot].label.toLowerCase()} meal${total === 1 ? '' : 's'}`}
                        {total > PICKER_PAGE_SIZE && ` — showing ${from + 1}–${Math.min(to, total)}`}
                    </p>
                )}

                {results.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-500">
                        {meals.length === 0
                            ? 'Your library is empty — add meals in the Library tab.'
                            : query.trim()
                              ? 'No meals found.'
                              : `No meals tagged ${CATEGORY[activeSlot].label.toLowerCase()} — search to find any meal.`}
                    </p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {results.slice(from, to).map((m) => (
                            <li key={m._id}>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void add(m)}
                                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50 disabled:opacity-60"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-neutral-800">{m.name}</p>
                                        <p className="text-xs tabular-nums text-neutral-500">
                                            {kcal(m.macros.calories)} kcal · {fmt(Math.round(m.macros.protein))} g protein
                                        </p>
                                    </div>
                                    <i className="fa-solid fa-plus text-xs text-neutral-500" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <Pagination page={page} pageCount={pageCount} onChange={setPage} />
                </>
                )}
            </div>
        </Drawer>
    )
}

// ─── Planned meal drawer ─────────────────────────────────────────────────────

/** A planned meal opened from its row: its numbers, its notes, and the tick. */
function PlannedMealDrawer({
    entry,
    meal,
    onClose,
    onToggle,
    onUpdatePlate,
    onRemove,
}: {
    entry: MealPlanEntry | null
    /** The library meal it came from, for its notes — gone if it's been deleted. */
    meal: Meal | null
    onClose: () => void
    onToggle: (entry: MealPlanEntry) => void
    onUpdatePlate: (entry: MealPlanEntry, lines: PlateLine[]) => void
    onRemove: (id: string) => void
}) {
    // Retain the last entry while the drawer animates closed.
    const [view, setView] = useState<MealPlanEntry | null>(entry)
    const [viewMeal, setViewMeal] = useState<Meal | null>(meal)
    useEffect(() => {
        if (entry) {
            setView(entry)
            setViewMeal(meal)
        }
    }, [entry, meal])

    const e = view
    const done = !!e && isEaten(e)

    return (
        <Drawer
            open={!!entry}
            onClose={onClose}
            size="xl"
            title={e?.name ?? 'Meal'}
            footer={
                e && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-3">
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            className="mr-auto"
                            onClick={() => onRemove(e._id)}
                        >
                            Remove
                        </Button>
                        {!e.extra &&
                            (done ? (
                                <Button variant="ghost" icon="fa-solid fa-rotate-left" onClick={() => onToggle(e)}>
                                    Mark as not eaten
                                </Button>
                            ) : (
                                <Button icon="fa-solid fa-check" onClick={() => onToggle(e)}>
                                    Mark as eaten
                                </Button>
                            ))}
                    </div>
                )
            }
        >
            {e && (
                <div className="flex flex-col gap-6">
                    <PlannedContext entry={e} />
                    {e.plate?.length ? (
                        <PlateLinesEditor key={e._id} lines={e.plate} onChange={(lines) => onUpdatePlate(e, lines)} />
                    ) : null}
                    <StatStrip
                        stats={[
                            { icon: 'fa-solid fa-fire', label: 'Calories', value: `${kcal(e.macros.calories)} kcal` },
                            { icon: 'fa-solid fa-drumstick-bite', label: 'Protein', value: `${fmt(e.macros.protein)} g` },
                            { icon: 'fa-solid fa-wheat-awn', label: 'Carbs', value: `${fmt(e.macros.carbs)} g` },
                            { icon: 'fa-solid fa-droplet', label: 'Fat', value: `${fmt(e.macros.fat)} g` },
                        ]}
                    />
                    <div className="flex flex-col gap-2">
                        <MacroBar macros={e.macros} thick />
                        <MacroLegend macros={e.macros} />
                    </div>
                    {viewMeal?.notes && (
                        <NoteBlock icon="fa-regular fa-note-sticky" title="Notes">
                            {viewMeal.notes}
                        </NoteBlock>
                    )}
                    {e.meal && !viewMeal && (
                        <p className="text-xs text-neutral-500">
                            This meal has since left your library — the day keeps its numbers.
                        </p>
                    )}
                </div>
            )}
        </Drawer>
    )
}

/** The slot, day and status a planned meal sits in. */
function PlannedContext({ entry }: { entry: MealPlanEntry }) {
    const c = CATEGORY[entry.slot]
    const done = isEaten(entry)
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${c.tile} ${c.text}`}>
                <i className={`${c.icon} text-[11px]`} aria-hidden="true" />
                {c.label}
            </span>
            <span className="text-sm text-neutral-500">{shortDayLabel(entry.date)}</span>
            {entry.extra ? (
                <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 text-xs font-semibold text-neutral-600">
                    <i className="fa-solid fa-plus" aria-hidden="true" />
                    Logged
                </span>
            ) : (
                done && (
                    <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">
                        <i className="fa-solid fa-circle-check" aria-hidden="true" />
                        Eaten
                    </span>
                )
            )}
        </div>
    )
}
