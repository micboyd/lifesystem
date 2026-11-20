import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import Input from '../Input'
import { ModuleAside } from '../ModuleLayout'
import { ArrowButton, Bar, BarButton, Eyebrow, FigureStrip } from '../Blok'
import Spinner from '../Spinner'
import Button from '../Button'
import EmptyState from '../EmptyState'
import Drawer from '../Drawer'
import ConfirmModal from '../ConfirmModal'
import { type MenuEntry, type MenuItem } from '../DropdownMenu'
import ContextMenu from '../ContextMenu'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { useToast } from '../../context/ToastContext'
import {
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
    BOARD_GRID,
    LARGE_QUERY,
} from '../planner/WeekPlannerUI'
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
    GridCellAdd,
    GridDropHere,
} from '../planner/PlannerParts'
import { BoxParts, CATEGORY, MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal, signedKcal } from './format'
import {
    addPlanEntry,
    addQuickItem,
    addAwayNote,
    deletePlanEntry,
    listPlanEntries,
    setEntryStatus,
    reorderPlanSlot,
    copyPlanWeek,
    clearPlanRange,
} from '../../services/mealPlan'
import { createMeal } from '../../services/meals'
import PlannerLibrary, { type LibraryDrag, type LibraryEntry } from '../planner/PlannerLibrary'
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
import { GARMIN_CALORIES_PULLED, pullGarminCaloriesQuietly } from '../../services/garmin'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { listEvents } from '../../services/events'
import {
    addDays,
    formatWeekRange,
    parseDateKey,
    todayKey,
    WEEKDAYS_LONG,
    MONTHS,
} from '../../lib/calendar'
import { effectiveTargetsFor } from '../../lib/nutritionTargets'
import { listPlanEntries as listFitnessEntries } from '../../services/fitnessPlan'
import { MEAL_TYPES } from '../../types'
import { WeekMacrosButton, WeekMacrosPanel } from './WeekMacros'
import { DayNumbers } from './DayNumbers'
import { AddDrawer, type AddTarget } from './AddDrawer'
import { QuickAddDrawer } from './QuickAddDrawer'
import { dayTotals, weekAverage, weekMacros } from '../../lib/dayTotals'
import type {
    FitnessPlanEntry,
    DailyEnergy,
    EntryStatus,
    Event,
    MacroGoals,
    Macros,
    Meal,
    MealPlanEntry,
    MealType,
    NutritionPhase,
} from '../../types'

/**
 * The nutrition week planner, built from the same parts as the Fitness one and
 * laid out the same way: a week hero with the day strip, a sticky edit bar,
 * and a card per day split into breakfast, lunch, dinner and snacks. Wide
 * screens get the seven days side by side; phones one day at a time.
 *
 * There's one mode: each slot's + adds to it (planned on days ahead, eaten
 * today and before), meals tick off as they're eaten, open for a closer look
 * (and Remove), and drag between slots and days on a wide screen. Copy,
 * paste and clear live in the week's ⋯ menu. Each day carries one set of
 * numbers against its target (lib/dayTotals).
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

/** Every real meal on the day — eaten, skipped and logged extras too. What "clear everything" removes. */
const anyMeal = (e: MealPlanEntry) => !e.away

/** Didn't happen — a miss on the day, red on Your day. */
const isSkipped = (e: MealPlanEntry) => e.status === 'skipped'

/** "At an event, so no meal here" — no numbers, never ticked. */
const isAwayNote = (e: MealPlanEntry) => !!e.away

const isAwayIn = (e: MealPlanEntry, date: string, slot: MealType) => !!e.away && e.date === date && e.slot === slot

/** The one-line summary under a planned meal's name. */
function plannedMeta(entry: MealPlanEntry): string {
    if (isAwayNote(entry)) return 'Away · no meal here'
    if (isSkipped(entry)) return 'Skipped'
    return `${kcal(entry.macros.calories)} kcal · ${fmt(Math.round(entry.macros.protein))} g protein`
}

// ─── Planner ────────────────────────────────────────────────────────────────────

export default function NutritionPlanner({
    meals,
    settingsGoals,
    onMealsChanged,
}: {
    /** A meal was saved to the library from here — reload it. */
    onMealsChanged?: () => void
    meals: Meal[]
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
    // Calendar events across the week, offered when marking a slot as away.
    const [events, setEvents] = useState<Event[]>([])
    // The fitness planner for the week, for Plans that cycle calories by training. Null until read.
    const [fitness, setFitness] = useState<FitnessPlanEntry[] | null>(null)
    const [loading, setLoading] = useState(true)
    // The day drawer: a day + slot to add to, or a day to "Log more" on.
    const [picker, setPicker] = useState<AddTarget | null>(null)
    // The day the quick add (+ on a day) is open for.
    const [quickDate, setQuickDate] = useState<string | null>(null)
    // A planned meal opened for a closer look.
    const [detail, setDetail] = useState<MealPlanEntry | null>(null)
    // A meal copied to paste into another slot or day, and an open right-click menu.
    const [copied, setCopied] = useState<MealPlanEntry | null>(null)
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
    // A copied week held for pasting elsewhere: its Monday and which slots.
    const [clipboard, setClipboard] = useState<{ from: string; slots: MealType[] } | null>(null)
    // Choosing which slots to copy, and confirming a paste that would replace meals.
    const [copying, setCopying] = useState(false)
    const [pasteConfirm, setPasteConfirm] = useState(false)
    // A pending "clear" awaiting confirmation: a single day, or the whole week.
    const [clearTarget, setClearTarget] = useState<{ type: 'day'; date: string } | { type: 'week' } | null>(null)
    // Whether that clear also takes eaten and logged meals.
    const [clearAll, setClearAll] = useState(false)
    // The week's macros panel, open under the chips.
    const [macrosOpen, setMacrosOpen] = useState(false)

    const today = todayKey()
    const toast = useToast()

    const range = useMemo(() => {
        const start = mondayOf(anchor)
        return { start, end: addDays(start, 6) }
    }, [anchor])

    // Garmin fills in the last week's calories out in the background; the
    // week's figures reload when it has.
    const [garminPulls, setGarminPulls] = useState(0)
    useEffect(() => {
        const reload = () => setGarminPulls((n) => n + 1)
        window.addEventListener(GARMIN_CALORIES_PULLED, reload)
        void pullGarminCaloriesQuietly(addDays(today, -7), addDays(today, -1), today)
        return () => window.removeEventListener(GARMIN_CALORIES_PULLED, reload)
    }, [today])

    // …and the finished days of whichever week is open, so an older week shows
    // Garmin's figures too.
    useEffect(() => {
        const lastDone = addDays(today, -1)
        void pullGarminCaloriesQuietly(range.start, range.end < lastDone ? range.end : lastDone, today)
    }, [range.start, range.end, today])

    useEffect(() => {
        // Refetch silently on a week change — the days keep the previous meals
        // until the new ones arrive, so navigation never flashes a spinner.
        let active = true
        Promise.all([
            listPlanEntries(range.start, range.end),
            listDailyEnergy(range.start, range.end).catch(() => [] as DailyEnergy[]),
            listNutritionPhases(range.start, range.end).catch(() => [] as NutritionPhase[]),
            listEvents(range.start, range.end).catch(() => [] as Event[]),
            listFitnessEntries(range.start, range.end).catch(() => null),
        ])
            .then(([rows, en, ph, ev, fit]) => {
                if (!active) return
                setEntries(rows)
                setEnergy(en)
                setPhases(ph)
                setEvents(ev)
                setFitness(fit)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end, garminPulls])

    // A day's target as the Plan sets it — shifted for the day's training when
    // the Plan cycles calories, the same figure Home and Consistency judge by.
    const goalsFor = useCallback(
        (date: string) => effectiveTargetsFor(date, phases, settingsGoals, fitness).goals,
        [phases, settingsGoals, fitness]
    )

    // Each day's numbers against its target — the hero's average day and the
    // week's macros panel both read from these.
    const weekDays = useMemo(
        () =>
            Array.from({ length: 7 }, (_, i) => {
                const date = addDays(range.start, i)
                return {
                    totals: dayTotals(entries.filter((e) => e.date === date), date, today),
                    goals: goalsFor(date),
                }
            }),
        [entries, range.start, today, goalsFor]
    )
    const average = useMemo(() => weekAverage(weekDays), [weekDays])
    const macros = useMemo(() => weekMacros(weekDays), [weekDays])

    // Keep an open detail drawer in step with the row it was opened from.
    const detailEntry = detail ? (entries.find((e) => e._id === detail._id) ?? null) : null
    const mealsById = useMemo(() => new Map(meals.map((m) => [m._id, m])), [meals])

    function step(dir: -1 | 1) {
        setAnchor((a) => addDays(mondayOf(a), dir * 7))
    }

    async function handleAdd(date: string, slot: MealType, mealId: string, extra: boolean, eaten = false) {
        try {
            const entry = await addPlanEntry(date, slot, mealId, extra, eaten)
            setEntries((prev) => [...prev.filter((e) => extra || !isAwayIn(e, date, slot)), entry])
        } catch {
            toast.show('Could not add that meal — please try again.', 'danger')
        }
    }

    /**
     * The + on a day. `save` puts it in the meal library too (for the slot it
     * went in), and the day's entry then points at that meal; otherwise it's a
     * one-off.
     */
    async function handleQuickAdd(date: string, slot: MealType, name: string, macros: Macros, save = false) {
        try {
            let entry: MealPlanEntry
            if (save) {
                const meal = await createMeal({ name, types: [slot], macros })
                onMealsChanged?.()
                entry = await addPlanEntry(date, slot, meal._id, false, date <= today)
            } else {
                entry = await addQuickItem(date, slot, name, macros, date <= today)
            }
            setEntries((prev) => [...prev.filter((e) => !isAwayIn(e, date, slot)), entry])
        } catch {
            toast.show('Could not add that — please try again.', 'danger')
            throw new Error('quick add failed')
        }
    }

    async function handleAddAway(date: string, slot: MealType, name: string) {
        try {
            const { entry, removed } = await addAwayNote(date, slot, name)
            const gone = new Set(removed)
            setEntries((prev) => [...prev.filter((e) => !gone.has(e._id) && !isAwayIn(e, date, slot)), entry])
        } catch {
            toast.show('Could not save that — please try again.', 'danger')
        }
    }

    // Away for the whole day: every slot gets the note.
    async function handleAddAwayDay(date: string, name: string) {
        for (const slot of MEAL_TYPES) await handleAddAway(date, slot, name)
    }

    // Back from being away all day: the day's away notes go.
    async function handleBackFromAway(date: string) {
        for (const e of entries.filter((x) => x.date === date && x.away)) await handleRemove(e._id)
    }

    function copyEntry(entry: MealPlanEntry) {
        setCopied(entry)
        toast.show(`Copied ${entry.name} — right-click a slot, or tap +, to paste it`, 'info')
    }

    // A copied meal into another slot or day — planned ahead, eaten today and
    // before, as the + would. Away notes paste as notes.
    async function pasteInto(date: string, slot: MealType) {
        const src = copied
        if (!src) return
        const eaten = date <= today
        if (src.away) return handleAddAway(date, slot, src.name)
        if (src.meal) return handleAdd(date, slot, src.meal, false, eaten)
        // A one-off (or a meal since gone from the library) goes as its name and macros.
        return handleQuickAdd(date, slot, src.name, src.macros).catch(() => {})
    }

    function openRowMenu(ev: { clientX: number; clientY: number }, entry: MealPlanEntry) {
        setMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: [
                { label: 'Copy', icon: 'fa-solid fa-copy', onClick: () => copyEntry(entry) },
                { label: 'Open', icon: 'fa-solid fa-up-right-from-square', onClick: () => setDetail(entry) },
                ...(entry.away || entry.extra || isEaten(entry)
                    ? []
                    : [
                          {
                              label: isSkipped(entry) ? 'Not skipped' : 'Skipped',
                              icon: isSkipped(entry) ? 'fa-solid fa-rotate-left' : 'fa-solid fa-xmark',
                              onClick: () => void handleSkip(entry),
                          },
                      ]),
                { label: 'Remove', icon: 'fa-solid fa-trash-can', danger: true, onClick: () => void handleRemove(entry._id) },
            ],
        })
    }

    function openSlotMenu(ev: { clientX: number; clientY: number }, date: string, slot: MealType) {
        setMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: [
                ...(copied
                    ? [{ label: `Paste ${copied.name}`, icon: 'fa-solid fa-paste', onClick: () => void pasteInto(date, slot) }]
                    : []),
                {
                    label: `Add to ${CATEGORY[slot].label.toLowerCase()}…`,
                    icon: 'fa-solid fa-plus',
                    onClick: () => setPicker({ date, slot, eaten: date <= today }),
                },
            ],
        })
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
        if (entry.away) return
        await saveStatus(entry, entry.status === 'eaten' ? 'planned' : 'eaten')
    }

    // Skipped, or back to planned.
    async function handleSkip(entry: MealPlanEntry) {
        if (entry.away) return
        await saveStatus(entry, entry.status === 'skipped' ? 'planned' : 'skipped')
    }

    async function saveStatus(entry: MealPlanEntry, next: EntryStatus) {
        setEntries((prev) => prev.map((e) => (e._id === entry._id ? { ...e, status: next } : e)))
        try {
            await setEntryStatus(entry._id, next)
        } catch {
            setEntries((prev) => prev.map((e) => (e._id === entry._id ? entry : e)))
            toast.show('Could not save that — please try again.', 'danger')
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

    // Clear the planned, uneaten meals from a span of days — or, with `all`,
    // every meal including eaten and logged ones. Optimistic.
    async function clearDays(start: string, end: string, all: boolean) {
        const match = all ? anyMeal : clearable
        const removed = entries.filter((e) => e.date >= start && e.date <= end && match(e))
        if (removed.length === 0) return
        const ids = new Set(removed.map((e) => e._id))
        setEntries((prev) => prev.filter((e) => !ids.has(e._id)))
        try {
            await clearPlanRange(start, end, all)
        } catch {
            setEntries((prev) => [...prev, ...removed])
        }
    }

    async function saveOut(date: string, value: number | null) {
        if (value === null) {
            const kept = await deleteDailyEnergy(date)
            setEnergy((prev) => [...prev.filter((e) => e.date !== date), ...(kept ? [kept] : [])])
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
        const inSpan =
            clearTarget.type === 'day'
                ? entries.filter((e) => e.date === clearTarget.date)
                : entries.filter((e) => e.date >= range.start && e.date <= range.end)
        const planned = inSpan.filter(clearable).length
        // Eaten, skipped and logged meals — only gone when "everything" is ticked.
        const logged = inSpan.filter((e) => anyMeal(e) && !clearable(e)).length
        const where = clearTarget.type === 'day' ? shortDayLabel(clearTarget.date) : formatWeekRange(range.start, range.end)
        return { planned, logged, where, scope: clearTarget.type }
    }, [clearTarget, entries, range.start, range.end])
    const clearCount = clearInfo ? clearInfo.planned + (clearAll ? clearInfo.logged : 0) : 0
    function openClear(target: { type: 'day'; date: string } | { type: 'week' }) {
        // Nothing planned left to clear: the only clear that does anything is "everything".
        const inSpan = (e: MealPlanEntry) =>
            target.type === 'day' ? e.date === target.date : e.date >= range.start && e.date <= range.end
        setClearAll(!entries.some((e) => inSpan(e) && clearable(e)))
        setClearTarget(target)
    }

    const libraryEmpty = meals.length === 0

    // The meal library beside the week: drag a meal onto a slot, or click to add.
    const [libDrag, setLibDrag] = useState<LibraryDrag<MealType> | null>(null)
    const [libSlot, setLibSlot] = useState<MealType>('dinner')
    const libraryEntries: LibraryEntry<MealType>[] = useMemo(
        () =>
            meals.map((m) => ({
                kind: m.types[0] ?? 'dinner',
                alsoKinds: m.types.slice(1),
                id: m._id,
                name: m.name,
                meta: `${Math.round(m.macros.calories).toLocaleString('en-GB')} kcal · ${Math.round(m.macros.protein)} g protein`,
                dot: CATEGORY[m.types[0] ?? 'dinner'].solid,
            })),
        [meals]
    )
    const weekHasClearable = entries.some(anyMeal)

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
                onStep={step}
                onSelect={selectDay}
                onPick={setAnchor}
                board={board}
                average={average}
                eyebrow={(() => {
                    const g = goalsFor(today)
                    return g?.calories ? `${kcal(g.calories)} kcal${g.protein ? ` and ${fmt(g.protein)} g protein` : ''} a day` : undefined
                })()}
                menu={[
                    { label: 'Copy week…', icon: 'fa-solid fa-copy', onClick: () => setCopying(true) },
                    ...(clipboard && clipboard.from !== range.start
                        ? [
                              {
                                  label: `Paste ${slotsLabel(clipboard.slots)}`,
                                  icon: 'fa-solid fa-paste',
                                  onClick: () =>
                                      clipboard.slots.some((sl) => weekSlots.has(sl))
                                          ? setPasteConfirm(true)
                                          : void handlePasteWeek(),
                              },
                          ]
                        : []),
                    ...(weekHasClearable
                        ? [
                              'divider' as const,
                              {
                                  label: 'Clear week',
                                  icon: 'fa-solid fa-broom',
                                  danger: true,
                                  onClick: () => openClear({ type: 'week' }),
                              },
                          ]
                        : []),
                ]}
            />

            {clipboard && (
                <WeekClipboardBanner
                    what={slotsLabel(clipboard.slots)}
                    fromLabel={formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                    sameWeek={clipboard.from === range.start}
                    onPaste={() =>
                        clipboard.slots.some((sl) => weekSlots.has(sl))
                            ? setPasteConfirm(true)
                            : void handlePasteWeek()
                    }
                    onForget={() => setClipboard(null)}
                />
            )}

            {copied && (
                <CopiedBanner name={copied.name} forgetLabel="Forget the copied meal" onForget={() => setCopied(null)} />
            )}

            {!loading && board && (
                <WeekFigures
                    weekStart={range.start}
                    today={today}
                    entries={entries}
                    weekDays={weekDays}
                    outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? garminOut(energy.find((e) => e.date === date))}
                />
            )}

            {!loading && !board && (
                <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <WeekMacrosButton open={macrosOpen} onToggle={() => setMacrosOpen((o) => !o)} />
                    </div>
                    {macrosOpen && <WeekMacrosPanel week={macros} />}
                </div>
            )}

            {loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : libraryEmpty && entries.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-calendar-week"
                    title="Nothing to plan with yet"
                    description="Add a meal (or make a batch) in your library first, then drop it into the plan."
                />
            ) : (
                <div className="flex items-start gap-8">
                <div className="min-w-0 flex-1">
                {board ? (
                    <MealGrid
                        weekStart={range.start}
                        today={today}
                        entries={entries}
                        weekDays={weekDays}
                        outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? garminOut(energy.find((e) => e.date === date))}
                        libraryDrag={libDrag}
                        onDropLibrary={(date, slot, item) => {
                            setLibDrag(null)
                            void handleAdd(date, slot, item.id, false, date <= today)
                        }}
                        onAdd={(date, slot) => setPicker({ date, slot, eaten: date <= today })}
                        onOpen={setDetail}
                        onToggle={handleToggle}
                        onRowMenu={openRowMenu}
                        onSlotMenu={openSlotMenu}
                        onReorder={handleReorder}
                    />
                ) : (
                <WeekView
                    libraryDrag={libDrag}
                    onDropLibrary={(date, slot, item) => {
                        setLibDrag(null)
                        void handleAdd(date, slot, item.id, false, date <= today)
                    }}
                    board={board}
                    weekStart={range.start}
                    selected={anchor}
                    today={today}
                    entries={entries}
                    goalsFor={goalsFor}
                    outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? null}
                    garminOutFor={(date) => garminOut(energy.find((e) => e.date === date))}
                    onSelect={setAnchor}
                    // Days ahead are planned; today and before, what's added was eaten.
                    onAdd={(date, slot) => setPicker({ date, slot, eaten: date <= today })}
                    onOpen={setDetail}
                    onToggle={handleToggle}
                    onRowMenu={openRowMenu}
                    onSlotMenu={openSlotMenu}
                    onAwayDay={(date) => setPicker({ date, slot: 'breakfast', eaten: false, awayDay: true })}
                    onQuickAdd={setQuickDate}
                    onBackFromAway={(date) => void handleBackFromAway(date)}
                    onReorder={handleReorder}
                    onClearDay={(date) => openClear({ type: 'day', date })}
                    onSaveOut={saveOut}
                />
                )}
                </div>
                {board && (
                    <ModuleAside>
                    <PlannerLibrary<MealType, MealType>
                        title="Meals"
                        className="min-h-0 flex-1"
                        items={libraryEntries}
                        filters={[
                            { value: 'all', label: 'All' },
                            { value: 'breakfast', label: 'Breakfast' },
                            { value: 'lunch', label: 'Lunch' },
                            { value: 'dinner', label: 'Dinner' },
                            { value: 'snack', label: 'Snack' },
                        ]}
                        target={shortDayLabel(anchor)}
                        parts={[
                            { value: 'breakfast', label: 'Breakfast' },
                            { value: 'lunch', label: 'Lunch' },
                            { value: 'dinner', label: 'Dinner' },
                            { value: 'snack', label: 'Snack' },
                        ]}
                        part={libSlot}
                        onPart={setLibSlot}
                        onAdd={(item) => void handleAdd(anchor, libSlot, item.id, false, anchor <= today)}
                        onDragStart={setLibDrag}
                        onDragEnd={() => setLibDrag(null)}
                    />
                    </ModuleAside>
                )}
                </div>
            )}

            <AddDrawer
                target={picker}
                meals={meals}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                events={picker ? events.filter((ev) => picker.date >= ev.startDate && picker.date <= ev.endDate) : []}
                goalsFor={goalsFor}
                onClose={() => setPicker(null)}
                onAddMeal={(date, slot, id, eaten) => handleAdd(date, slot, id, false, eaten)}
                onAddAway={handleAddAway}
                onAddAwayDay={handleAddAwayDay}
                copied={copied}
                onPaste={pasteInto}
            />

            <QuickAddDrawer
                date={quickDate}
                today={today}
                onClose={() => setQuickDate(null)}
                onAdd={handleQuickAdd}
            />

            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

            <PlannedMealDrawer
                entry={detailEntry}
                meal={detailEntry?.meal ? (mealsById.get(detailEntry.meal) ?? null) : null}
                onCopy={(e) => {
                    setDetail(null)
                    copyEntry(e)
                }}
                onClose={() => setDetail(null)}
                onToggle={handleToggle}
                onSkip={handleSkip}
                onRemove={(id) => {
                    setDetail(null)
                    void handleRemove(id)
                }}
            />

            <CopyWeekDrawer
                open={copying}
                weekLabel={formatWeekRange(range.start, range.end)}
                options={MEAL_TYPES.map((s) => ({ value: s, label: CATEGORY[s].label }))}
                describe={slotsLabel}
                hint="Pick the meals to copy, then go to another week and paste. Only planned meals are replaced there."
                onClose={() => setCopying(false)}
                onCopy={(slots) => {
                    handleCopyWeek(slots)
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
                            Replace the planned <span className="font-semibold">{slotsLabel(clipboard.slots)}</span>{' '}
                            for <span className="font-semibold">{formatWeekRange(range.start, range.end)}</span> with
                            the plan copied from{' '}
                            <span className="font-semibold">
                                {formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                            </span>
                            ? Meals already eaten stay as they are.
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
                                {clearCount} {clearAll ? '' : 'planned '}meal{clearCount !== 1 ? 's' : ''}
                            </span>{' '}
                            from <span className="font-semibold">{clearInfo.where}</span>?
                            {clearAll
                                ? ' That includes meals you’ve eaten and anything you logged.'
                                : ' Meals you’ve eaten and anything you logged stay.'}
                            {clearInfo.logged > 0 && (
                                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-neutral-700">
                                    <input
                                        type="checkbox" className="checkbox"
                                        checked={clearAll}
                                        onChange={(e) => setClearAll(e.target.checked)}
                                    />
                                    <span>
                                        Also clear eaten and logged meals
                                        <span className="block text-xs text-neutral-500">
                                            {clearInfo.logged} meal{clearInfo.logged !== 1 ? 's' : ''} you’ve
                                            ticked off or logged. Away notes stay.
                                        </span>
                                    </span>
                                </label>
                            )}
                        </>
                    ) : (
                        ''
                    )
                }
                confirmLabel="Clear"
                onConfirm={() => {
                    if (!clearTarget) return
                    if (clearTarget.type === 'week') void clearDays(range.start, range.end, clearAll)
                    else void clearDays(clearTarget.date, clearTarget.date, clearAll)
                    setClearTarget(null)
                }}
                onClose={() => setClearTarget(null)}
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
    onStep,
    onSelect,
    onPick,
    board,
    average,
    menu,
    eyebrow,
}: {
    /** The daily target, in words, for the line above the title. */
    eyebrow?: string
    /** The week's options: copy, paste, clear. */
    menu: MenuEntry[]
    /** The average day against the average target (lib/dayTotals). */
    average: ReturnType<typeof weekAverage>
    weekStart: string
    selected: string
    today: string
    rangeLabel: string
    entries: MealPlanEntry[]
    ready: boolean
    onStep: (dir: -1 | 1) => void
    onSelect: (date: string) => void
    onPick: (date: string) => void
    board: boolean
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const planned = entries.filter((e) => !e.extra)
    const eaten = planned.filter(isEaten).length
    const isThisWeek = mondayOf(today) === weekStart

    const facts = [
        rangeLabel,
        ready && planned.length > 0 && `${eaten} of ${planned.length} eaten`,
        ready &&
            average &&
            `${kcal(average.calories)}${
                average.target ? ` / ${kcal(average.target)}` : ''
            } kcal a day`,
        ready && entries.length === 0 && 'nothing planned yet',
    ].filter(Boolean)

    void facts
    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
                <div className="min-w-0">
                    <Eyebrow>{[eyebrow, relativeWeekLabel(weekStart, mondayOf(today))].filter(Boolean).join(' · ')}</Eyebrow>
                    <h1 className="mt-3 text-[36px] font-normal leading-[1.1] tracking-[-0.03em] sm:text-[48px]">{rangeLabel}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {!isThisWeek && (
                        <BarButton onClick={() => onPick(today)} className="!border-neutral-300">
                            This week
                        </BarButton>
                    )}
                    <ArrowButton dir="prev" label="Previous week" onClick={() => onStep(-1)} />
                    <ArrowButton dir="next" label="Next week" onClick={() => onStep(1)} />
                    <HeroMenu items={menu} />
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
        </div>
    )
}

// ─── Week view ────────────────────────────────────────────────────────────────

function WeekView({
    board,
    weekStart,
    selected,
    today,
    entries,
    goalsFor,
    outFor,
    garminOutFor,
    onSelect,
    onAdd,
    onOpen,
    onToggle,
    onRowMenu,
    onSlotMenu,
    onAwayDay,
    onQuickAdd,
    onBackFromAway,
    onReorder,
    onClearDay,
    onSaveOut,
    libraryDrag,
    onDropLibrary,
}: {
    /** A meal being dragged in from the library, for a slot to take. */
    libraryDrag: LibraryDrag<MealType> | null
    onDropLibrary: (date: string, slot: MealType, item: LibraryDrag<MealType>) => void
    /** Lay the seven days side by side across the screen, rather than stacked. */
    board: boolean
    weekStart: string
    /** The focused day — the only one shown on a phone. */
    selected: string
    today: string
    entries: MealPlanEntry[]
    goalsFor: (date: string) => MacroGoals | null
    outFor: (date: string) => number | null
    /** Garmin's calories out for that day, typed over or not — null when it has none. */
    garminOutFor: (date: string) => number | null
    onSelect: (date: string) => void
    onAdd: (date: string, slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, date: string, slot: MealType) => void
    onAwayDay: (date: string) => void
    /** The + on a day: one item with its macros, in any slot. */
    onQuickAdd: (date: string) => void
    onBackFromAway: (date: string) => void
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
        // From the library: plan the meal where it was dropped.
        if (!dragged && libraryDrag && target) {
            onDropLibrary(target.date, target.slot, libraryDrag)
            return
        }
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
            className={board ? BOARD_GRID : 'day-slider flex flex-col gap-3 md:gap-4'}
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
                    entries={entries.filter((e) => e.date === date)}
                    goals={goalsFor(date)}
                    out={outFor(date)}
                    garminOut={garminOutFor(date)}
                    onAdd={(slot) => onAdd(date, slot)}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onRowMenu={onRowMenu}
                    onSlotMenu={(ev, slot) => onSlotMenu(ev, date, slot)}
                    onAwayDay={() => onAwayDay(date)}
                    onQuickAdd={() => onQuickAdd(date)}
                    onBackFromAway={() => onBackFromAway(date)}
                    dragActive={dragId !== null || libraryDrag !== null}
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
            {!board && <SwipeHint />}
        </div>
    )
}

function DayCard({
    date,
    compact = false,
    className = '',
    isToday,
    hasHappened,
    entries,
    goals,
    out,
    garminOut = null,
    onAdd,
    onOpen,
    onToggle,
    onRowMenu,
    onSlotMenu,
    onAwayDay,
    onQuickAdd,
    onBackFromAway,
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
    entries: MealPlanEntry[]
    goals: MacroGoals | null
    /** The day's calories out, from a watch — the whole day's total. */
    out: number | null
    /** Garmin's figure for the day — `out` unless it's been typed over. */
    garminOut?: number | null
    onAdd: (slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, slot: MealType) => void
    onAwayDay: () => void
    onQuickAdd: () => void
    onBackFromAway: () => void
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
    const totals = dayTotals(entries, date, todayKey())

    const slotItems = (slot: MealType) => planned.filter((e) => e.slot === slot).sort((a, b) => a.order - b.order)

    // One set of numbers: the day against its target.
    const summary = <DayNumbers totals={totals} goals={goals} compact={compact} />

    const canClear = entries.some(anyMeal)
    // Every slot marked away: the day is off the plan, and out of the numbers.
    const awayAllDay = MEAL_TYPES.every((s) => planned.some((e) => e.slot === s && e.away))
    const awayName = awayAllDay ? (planned.find((e) => e.away)?.name ?? 'Away') : null
    const dayMenu: MenuEntry[] = [
        awayAllDay
            ? { label: 'Not away after all', icon: 'fa-solid fa-rotate-left', onClick: onBackFromAway }
            : { label: 'Away all day…', icon: 'fa-regular fa-calendar', onClick: onAwayDay },
        ...(canClear
            ? ['divider' as const, { label: 'Clear day', icon: 'fa-solid fa-broom', danger: true, onClick: onClear }]
            : []),
    ]
    const titleRow = (
        <DayTitle
            date={date}
            compact={compact}
            isToday={isToday}
            actions={
                <>
                    {!awayAllDay && (
                        <button
                            type="button"
                            onClick={onQuickAdd}
                            aria-label={`Quick add to ${weekday}`}
                            title="Quick add"
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-plus text-[13px]" aria-hidden="true" />
                        </button>
                    )}
                    <DayMenu label={`${weekday} options`} items={dayMenu} />
                </>
            }
        />
    )

    return (
        <DayCardShell id={dayCardId('meals', date)} isToday={isToday} compact={compact} className={className}>
            <header className="flex flex-col gap-3">
                {titleRow}
                {awayAllDay ? (
                    <p className="text-[13px] text-neutral-500">Away all day — not counted</p>
                ) : (
                    summary
                )}
            </header>

            {awayAllDay ? (
                <div className="flex items-center gap-3 rounded-xl bg-neutral-50 px-3 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-neutral-500 ring-1 ring-neutral-200">
                        <i className="fa-regular fa-calendar text-sm" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-neutral-900">{awayName}</span>
                        <span className="block truncate text-[13px] text-neutral-500">No meals planned here</span>
                    </span>
                    {!compact && (
                        <button
                            type="button"
                            onClick={onBackFromAway}
                            className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-semibold text-neutral-600 hover:bg-white hover:text-neutral-900"
                        >
                            Undo
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex flex-col">
                    {MEAL_TYPES.map((slot) => (
                        <SlotSection
                            key={slot}
                            compact={compact}
                            slot={slot}
                            entries={slotItems(slot)}
                            onAdd={() => onAdd(slot)}
                            onOpen={onOpen}
                            onToggle={onToggle}
                            onRowMenu={onRowMenu}
                            onSlotMenu={(ev) => onSlotMenu(ev, slot)}
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
                        <ExtrasSection compact={compact} entries={extras} onOpen={onOpen} />
                    )}
                </div>
            )}

            {hasHappened && (
                <DayEnergy
                    key={out ?? 'none'}
                    eaten={totals.eaten.calories}
                    out={out}
                    garminOut={garminOut}
                    onSaveOut={onSaveOut}
                />
            )}
        </DayCardShell>
    )
}

/**
 * One meal slot of a day: its name and an add button, beside its meals (or
 * over them in a board column). Meals tick off as they're eaten, open for a
 * closer look, and drag to another slot or day on a wide screen. The whole
 * slot is a drop target while something's being dragged.
 */
function SlotSection({
    compact = false,
    slot,
    entries,
    onAdd,
    onOpen,
    onToggle,
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
    compact?: boolean
    slot: MealType
    entries: MealPlanEntry[]
    onAdd: () => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    /** Right-click on a meal: copy, open, remove. */
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    /** Right-click on the slot: paste a copied meal, or add. */
    onSlotMenu: (ev: { clientX: number; clientY: number }) => void
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
    return (
        <PlanSlot
            compact={compact}
            marker={<span className={`h-2 w-2 shrink-0 rounded-full ${meta.solid}`} aria-hidden="true" />}
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
                    dropId={e._id}
                    onOpen={() => onOpen(e)}
                    onToggle={() => onToggle(e)}
                    onContextMenu={(ev) => {
                        ev.preventDefault()
                        ev.stopPropagation()
                        onRowMenu(ev, e)
                    }}
                    draggable
                    onDragStart={() => onEntryDragStart(e._id)}
                    onDragEnd={onEntryDragEnd}
                    dropEdge={drop && drop.refId === e._id ? (drop.after ? 'bottom' : 'top') : null}
                />
            ))}
        </PlanSlot>
    )
}

/** Whatever was logged with "Log more" — eaten already, so never dragged or ticked. */
function ExtrasSection({
    compact,
    entries,
    onOpen,
}: {
    compact: boolean
    entries: MealPlanEntry[]
    onOpen: (entry: MealPlanEntry) => void
}) {
    return (
        <div
            className={
                compact
                    ? 'flex flex-col gap-1.5 border-t border-hairline py-2.5 first:pt-0 last:pb-0'
                    : 'flex flex-col gap-2 border-t border-hairline py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
            }
        >
            <span className={`flex items-center gap-2 ${compact ? '' : 'sm:pt-1.5'}`}>
                <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-300" aria-hidden="true" />
                <span className="text-[13px] font-medium text-neutral-500">Also ate</span>
            </span>
            <ul className={compact ? 'flex flex-col gap-1.5' : 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3'}>
                {entries.map((e) => (
                    <PlannedRow key={e._id} compact={compact} entry={e} onOpen={() => onOpen(e)} />
                ))}
            </ul>
        </div>
    )
}

function PlannedRow({
    compact = false,
    entry,
    onOpen,
    onToggle,
    draggable = false,
    onDragStart,
    onDragEnd,
    dropId,
    dropEdge = null,
    onContextMenu,
}: {
    /** Right-click on the row. */
    onContextMenu?: (ev: MouseEvent) => void
    compact?: boolean
    entry: MealPlanEntry
    onOpen?: () => void
    /** The tick that marks the meal eaten, or back to planned. */
    onToggle?: () => void
    draggable?: boolean
    onDragStart?: () => void
    onDragEnd?: () => void
    dropId?: string
    /** Which edge to mark as the pending drop spot — an overlay, so the row never shifts. */
    dropEdge?: 'top' | 'bottom' | null
}) {
    const done = isEaten(entry)
    const skipped = isSkipped(entry)
    const size = rowButtonSize(compact)

    const trailing = isAwayNote(entry) ? (
        <span
            className={`grid shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-500 ${
                compact ? 'h-6 w-6' : onToggle ? size : 'h-6 w-6'
            }`}
            title="Away — no meal here"
            aria-hidden="true"
        >
            <i className="fa-regular fa-calendar text-[11px]" />
        </span>
    ) : skipped ? (
        <span
            className={`grid shrink-0 place-items-center rounded-full bg-danger-bg text-danger ${
                compact ? 'h-6 w-6' : onToggle ? size : 'h-6 w-6'
            }`}
            title="Skipped"
            aria-label="Skipped"
        >
            <i className="fa-solid fa-xmark text-[11px]" />
        </span>
    ) : onToggle ? (
        <RowTick
            done={done}
            compact={compact}
            label={done ? `Mark ${entry.name} as not eaten` : `Mark ${entry.name} as eaten`}
            title={done ? 'Eaten' : 'Mark as eaten'}
            onClick={onToggle}
        />
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
    )

    return (
        <PlanRow
            compact={compact}
            bar={entry.extra || entry.away ? 'bg-neutral-300' : CATEGORY[entry.slot].solid}
            tint={entry.extra || entry.away || done || skipped ? 'bg-neutral-50' : CATEGORY[entry.slot].tile}
            title={entry.name}
            titleTone={(done && !entry.extra) || skipped ? 'text-neutral-500' : 'text-neutral-900'}
            meta={plannedMeta(entry)}
            name={entry.name}
            onOpen={onOpen}
            trailing={trailing}
            draggable={draggable}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            dropId={dropId}
            dropEdge={dropEdge}
            onContextMenu={onContextMenu}
        />
    )
}

// ─── Calories in and out ─────────────────────────────────────────────────────

/** Garmin's figure for a stored day — older pulled rows only carry it as caloriesOut. */
function garminOut(row: DailyEnergy | undefined): number | null {
    if (!row) return null
    if (row.garminCaloriesOut !== undefined) return row.garminCaloriesOut
    return row.source === 'garmin' ? row.caloriesOut : null
}

/** A small wristwatch, marking a figure that came from Garmin. */
function WatchIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`inline-block h-3 w-3 shrink-0 ${className}`}
            aria-hidden="true"
        >
            <rect x="6" y="6" width="12" height="12" rx="3" />
            <path d="M9 6l.6-3h4.8L15 6M9 18l.6 3h4.8l.6-3M12 9.5V12l1.5 1.5" />
        </svg>
    )
}

/**
 * Calories in against out, once the day has happened — folded away under one
 * line ("Balance −420 kcal", or a nudge to add calories out). Calories out is
 * the whole day's total: the field holds Garmin's figure by default (marked
 * with a watch); typing over it overrides it, and emptying it goes back to Garmin's.
 */
function DayEnergy({
    eaten,
    out,
    garminOut = null,
    onSaveOut,
}: {
    /** Calories eaten that day. */
    eaten: number
    out: number | null
    /** Garmin's figure for the day, whether or not it's been typed over. */
    garminOut?: number | null
    /** Null clears a typed figure — back to Garmin's, when there is one. */
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const net = out === null ? null : eaten - out
    const fromGarmin = garminOut !== null && out === garminOut

    return (
        <div className="rounded-xl bg-neutral-50">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-left"
            >
                <i className="fa-solid fa-bolt text-[11px] text-neutral-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-600">
                    {net !== null ? (
                        <>
                            Balance{' '}
                            <span
                                className={`font-semibold tabular-nums ${
                                    net < 0 ? 'text-emerald-700' : net > 0 ? 'text-amber-700' : 'text-neutral-900'
                                }`}
                            >
                                {signedKcal(net)}
                            </span>{' '}
                            kcal
                            {fromGarmin && (
                                <span title="Calories out from Garmin">
                                    {' '}
                                    <WatchIcon className="-mt-0.5 align-middle text-neutral-500" />
                                </span>
                            )}
                        </>
                    ) : (
                        'Add calories out'
                    )}
                </span>
                <i
                    className={`fa-solid fa-chevron-down text-[10px] text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            {open && (
                // The balance is on the line above, so this is just the two figures.
                <div className="flex flex-col gap-1 border-t border-neutral-200/70 px-3 pb-3 pt-2">
                    <EnergyRow label="Eaten">
                        {kcal(eaten)}
                        <Unit>kcal</Unit>
                    </EnergyRow>
                    {/* Label over the field, so it fits the narrowest day column. */}
                    <label className="flex flex-col gap-1">
                        <span className="flex items-center justify-between gap-2 text-[13px] text-neutral-500">
                            Calories out
                            {fromGarmin && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
                                    <WatchIcon />
                                    Garmin
                                </span>
                            )}
                        </span>
                        <OutField out={out} placeholder={garminOut} onSave={onSaveOut} />
                    </label>
                </div>
            )}
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

/**
 * Calories out, the whole day's total from a watch — typed straight in, saved
 * on blur or Enter, cleared by emptying it.
 */
function OutField({
    out,
    placeholder = null,
    onSave,
}: {
    out: number | null
    /** Shown when the field is empty — Garmin's figure, which clearing falls back to. */
    placeholder?: number | null
    onSave: (value: number | null) => Promise<void>
}) {
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
            // Cleared: the day goes back to Garmin's figure, so show it.
            if (next === null && placeholder !== null) setValue(String(placeholder))
        } catch {
            setValue(out === null ? '' : String(out))
        } finally {
            setSaving(false)
        }
    }

    return (
        <span className="relative block">
            <Input
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                placeholder={placeholder === null ? '0' : String(placeholder)}
                value={value}
                disabled={saving}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                className="text-right tabular-nums" wrapperClassName="w-full"
            />
            <span
                className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-neutral-500"
                aria-hidden="true"
            >
                kcal
            </span>
        </span>
    )
}

// ─── Planned meal drawer ─────────────────────────────────────────────────────

/** A planned meal opened from its row: its numbers, its notes, and the tick. */
function PlannedMealDrawer({
    entry,
    meal,
    onCopy,
    onClose,
    onToggle,
    onSkip,
    onRemove,
}: {
    /** Copy it, to paste into another slot or day. */
    onCopy: (entry: MealPlanEntry) => void
    entry: MealPlanEntry | null
    /** The library meal it came from, for its notes — gone if it's been deleted. */
    meal: Meal | null
    onClose: () => void
    onToggle: (entry: MealPlanEntry) => void
    /** Skipped, or back to planned. */
    onSkip: (entry: MealPlanEntry) => void
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
    const skipped = !!e && isSkipped(e)
    const skip =
        e &&
        !e.extra &&
        !done &&
        (skipped ? (
            <Button variant="ghost" icon="fa-solid fa-rotate-left" onClick={() => onSkip(e)}>
                Not skipped
            </Button>
        ) : (
            <Button variant="ghost" icon="fa-solid fa-xmark" onClick={() => onSkip(e)}>
                Skipped
            </Button>
        ))

    return (
        <Drawer
            open={!!entry}
            onClose={onClose}
            size="xl"
            title={e?.name ?? 'Meal'}
            footer={
                e && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-3">
                        <div className="mr-auto flex items-center gap-1">
                            <Button variant="ghost" icon="fa-solid fa-trash-can" onClick={() => onRemove(e._id)}>
                                Remove
                            </Button>
                            <Button variant="ghost" icon="fa-solid fa-copy" onClick={() => onCopy(e)}>
                                Copy
                            </Button>
                        </div>
                        {!isAwayNote(e) && skip}
                        {!isAwayNote(e) &&
                            !e.extra &&
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
                    {isAwayNote(e) ? (
                        <NoteBlock icon="fa-regular fa-calendar" title="Away">
                            No {CATEGORY[e.slot].label.toLowerCase()} here. It doesn’t count towards the day’s numbers,
                            and the day’s aim is shared over the other slots. Add a meal to the slot and this note goes.
                        </NoteBlock>
                    ) : (
                    <>
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
                    </>
                    )}
                    {!isAwayNote(e) && (viewMeal?.batchOf ?? 0) > 1 && (viewMeal?.box?.length ?? 0) > 0 && (
                        <BoxParts parts={viewMeal!.box!} />
                    )}
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
    const skipped = isSkipped(entry)
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
            ) : skipped ? (
                <span className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-danger-bg px-2.5 text-xs font-semibold text-danger">
                    <i className="fa-solid fa-circle-xmark" aria-hidden="true" />
                    Skipped
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

// ─── AdminLife 3: the week as a grid ──────────────────────────────────────────

/** The grid's rows, in the order a day is eaten. */
const GRID_SLOTS: MealType[] = ['breakfast', 'lunch', 'snack', 'dinner']
const SLOT_TINT: Record<MealType, { planned: string; eaten: string }> = {
    breakfast: { planned: 'bg-meal-breakfast', eaten: 'bg-meal-breakfast-eaten' },
    lunch: { planned: 'bg-meal-lunch', eaten: 'bg-meal-lunch-eaten' },
    snack: { planned: 'bg-meal-snack', eaten: 'bg-meal-snack-eaten' },
    dinner: { planned: 'bg-meal-dinner', eaten: 'bg-meal-dinner-eaten' },
}

type WeekDayNumbers = { totals: ReturnType<typeof dayTotals>; goals: MacroGoals | null }

/** The week in four figures: average day, average protein, meals planned, balance against what was burned. */
function WeekFigures({
    weekStart,
    today,
    entries,
    weekDays,
    outFor,
}: {
    weekStart: string
    today: string
    entries: MealPlanEntry[]
    weekDays: WeekDayNumbers[]
    outFor: (date: string) => number | null
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const full = weekDays.filter((d) => d.totals.plan.calories > 0)
    const avgKcal = full.length ? full.reduce((s, d) => s + d.totals.plan.calories, 0) / full.length : null
    const avgProtein = full.length ? full.reduce((s, d) => s + d.totals.plan.protein, 0) / full.length : null
    const target = weekDays.find((d) => d.goals?.calories)?.goals
    const filled = days.reduce(
        (n, date) => n + GRID_SLOTS.filter((slot) => entries.some((e) => e.date === date && e.slot === slot && !e.extra)).length,
        0
    )
    const firstOpen = days.flatMap((date) => GRID_SLOTS.filter((slot) => !entries.some((e) => e.date === date && e.slot === slot)).map((slot) => ({ date, slot })))[0]
    let balance = 0
    let balanceDays = 0
    days.forEach((date, i) => {
        const out = outFor(date)
        const inn = weekDays[i].totals.plan.calories
        if (out && inn > 0 && date <= today) {
            balance += inn - out
            balanceDays++
        }
    })
    return (
        <FigureStrip
            size={32}
            figures={[
                {
                    label: 'Average planned',
                    value: avgKcal !== null ? kcal(avgKcal) : '—',
                    unit: 'kcal',
                    note: target?.calories ? `${full.length} day${full.length === 1 ? '' : 's'}, target ${kcal(target.calories)}` : `${full.length} days`,
                },
                {
                    label: 'Average protein',
                    value: avgProtein !== null ? fmt(Math.round(avgProtein)) : '—',
                    unit: 'g',
                    note:
                        target?.protein && avgProtein !== null
                            ? avgProtein >= target.protein
                                ? 'On target'
                                : `${fmt(Math.round(target.protein - avgProtein))} g under target`
                            : 'No target set',
                },
                {
                    label: 'Meals planned',
                    value: String(filled),
                    unit: `of ${days.length * GRID_SLOTS.length}`,
                    note: firstOpen ? `${shortDayLabel(firstOpen.date)} ${CATEGORY[firstOpen.slot].label.toLowerCase()} is open` : 'Every meal planned',
                },
                {
                    label: 'Week balance',
                    value: balanceDays ? `${balance > 0 ? '+' : '−'}${kcal(Math.abs(balance))}` : '—',
                    unit: balanceDays ? 'kcal' : undefined,
                    note: balanceDays ? `${balanceDays} day${balanceDays === 1 ? '' : 's'} so far, about ${(Math.abs(balance) / 7700).toFixed(1)} kg` : 'Needs calories out',
                },
            ]}
        />
    )
}

/** One meal on the grid: its category's tint (lighter once eaten), name, kcal and protein, and the eaten mark. */
function MealTile({
    entry,
    dragging,
    onOpen,
    onToggle,
    onContextMenu,
    onDragStart,
    onDragEnd,
}: {
    entry: MealPlanEntry
    dragging: boolean
    onOpen: () => void
    onToggle: () => void
    onContextMenu: (ev: MouseEvent) => void
    onDragStart: () => void
    onDragEnd: () => void
}) {
    const eaten = isEaten(entry)
    const skipped = isSkipped(entry)
    const away = isAwayNote(entry)
    const bg = away || entry.extra ? 'bg-neutral-100' : skipped ? 'bg-tint-skipped' : eaten ? SLOT_TINT[entry.slot].eaten : SLOT_TINT[entry.slot].planned
    return (
        <div
            draggable={!away}
            onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', entry._id)
                onDragStart()
            }}
            onDragEnd={onDragEnd}
            onContextMenu={onContextMenu}
            className={`relative ${bg} ${skipped || away ? 'text-neutral-600' : 'text-neutral-900'} ${dragging ? 'opacity-40' : ''}`}
        >
            <button type="button" onClick={onOpen} className="flex w-full flex-col gap-1 px-2 pb-2.5 pt-2 text-left text-[14px] leading-[1.25]">
                <span className={`line-clamp-2 font-medium ${skipped ? 'line-through' : ''}`}>{entry.name}</span>
                <span className="block truncate pr-5 text-[12px]">{away ? 'Away' : skipped ? 'Skipped' : `${kcal(entry.macros.calories)} kcal · ${fmt(Math.round(entry.macros.protein))} g`}</span>
            </button>
            {!away && !skipped && (
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={eaten ? `Mark ${entry.name} as not eaten` : `Mark ${entry.name} as eaten`}
                    title={eaten ? 'Eaten' : 'Mark as eaten'}
                    className="absolute bottom-2 right-2 grid h-4 w-4 place-items-center"
                >
                    {eaten ? (
                        <svg role="img" aria-label="Eaten" width="14" height="14" viewBox="0 0 16 16">
                            <rect width="16" height="16" fill="#111111" />
                            <path d="m4 8.3 2.6 2.6L12 5.6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    ) : (
                        <span className="block h-3.5 w-3.5 border border-neutral-900/40 hover:border-neutral-900" />
                    )}
                </button>
            )}
        </div>
    )
}

/** The week as one grid: meals down the side, days across, and each day's totals underneath. */
function MealGrid({
    weekStart,
    today,
    entries,
    weekDays,
    outFor,
    libraryDrag,
    onDropLibrary,
    onAdd,
    onOpen,
    onToggle,
    onRowMenu,
    onSlotMenu,
    onReorder,
}: {
    weekStart: string
    today: string
    entries: MealPlanEntry[]
    weekDays: WeekDayNumbers[]
    outFor: (date: string) => number | null
    libraryDrag: LibraryDrag<MealType> | null
    onDropLibrary: (date: string, slot: MealType, item: LibraryDrag<MealType>) => void
    onAdd: (date: string, slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, date: string, slot: MealType) => void
    onReorder: (date: string, slot: MealType, ids: string[]) => void
}) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
    const [dragId, setDragId] = useState<string | null>(null)
    const [dropAt, setDropAt] = useState<{ date: string; slot: MealType } | null>(null)
    const dragging = dragId !== null || libraryDrag !== null
    const hasExtras = entries.some((e) => e.extra)
    const rows: { key: string; label: string; slot: MealType; extra: boolean }[] = [
        ...GRID_SLOTS.map((slot) => ({ key: slot, label: CATEGORY[slot].label, slot, extra: false })),
        ...(hasExtras ? [{ key: 'extras', label: 'Extras', slot: 'snack' as MealType, extra: true }] : []),
    ]
    const cellItems = (date: string, slot: MealType, extra: boolean) =>
        entries.filter((e) => e.date === date && (extra ? e.extra : !e.extra && e.slot === slot)).sort((a, b) => a.order - b.order)

    function drop() {
        const target = dropAt
        const dragged = dragId ? entries.find((e) => e._id === dragId) : null
        setDragId(null)
        setDropAt(null)
        if (!target) return
        if (!dragged && libraryDrag) return onDropLibrary(target.date, target.slot, libraryDrag)
        if (!dragged || (dragged.date === target.date && dragged.slot === target.slot)) return
        const ids = cellItems(target.date, target.slot, false).map((e) => e._id)
        onReorder(target.date, target.slot, [...ids, dragged._id])
    }

    const SHORT = (n: number, goal?: number) => !!goal && n < goal * 0.9
    const totalRows = [
        {
            label: 'Planned in',
            cell: (i: number) => {
                const v = weekDays[i].totals.plan.calories
                const g = weekDays[i].goals?.calories
                return { text: v > 0 ? kcal(v) : '—', pct: g ? (v / g) * 100 : 0, color: '#8a6440', bold: v > 0 && SHORT(v, g) }
            },
        },
        {
            label: 'Protein',
            cell: (i: number) => {
                const v = weekDays[i].totals.plan.protein
                const g = weekDays[i].goals?.protein
                return { text: v > 0 ? `${fmt(Math.round(v))} g` : '—', pct: g ? (v / g) * 100 : 0, color: '#b08a5e', bold: v > 0 && SHORT(v, g) }
            },
        },
    ]

    return (
        <div className="overflow-x-auto">
            <div role="table" aria-label="Meal plan" className="min-w-[880px]">
                <div role="row" className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] border-b border-neutral-900">
                    <span role="columnheader" className="self-end py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">
                        Meal
                    </span>
                    {days.map((date) => {
                        const isToday = date === today
                        const d = new Date(`${date}T00:00:00`)
                        return (
                            <span role="columnheader" key={date} className={`px-2.5 py-3 font-normal ${isToday ? 'bg-neutral-900 text-white' : ''}`}>
                                <span className="flex items-baseline justify-between">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.12em]">
                                        {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                                    </span>
                                    {isToday && <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-neutral-300">Today</span>}
                                </span>
                                <span className="mt-0.5 block text-[26px] leading-none tracking-[-0.03em]">{d.getDate()}</span>
                            </span>
                        )
                    })}
                </div>
                {rows.map((row) => (
                    <div role="row" key={row.key} className="grid min-h-[100px] grid-cols-[96px_repeat(7,minmax(0,1fr))] border-b border-hairline">
                        <span role="rowheader" className="flex items-start gap-2 py-3.5 pr-2 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">
                            {!row.extra && <span className={`mt-px h-2.5 w-2.5 shrink-0 ${SLOT_TINT[row.slot].planned}`} aria-hidden="true" />}
                            {row.label}
                        </span>
                        {days.map((date) => {
                            const items = cellItems(date, row.slot, row.extra)
                            const isTarget = !row.extra && dropAt?.date === date && dropAt.slot === row.slot
                            return (
                                <div
                                    role="cell"
                                    key={date}
                                    onDragOver={(e) => {
                                        if (!dragging || row.extra) return
                                        e.preventDefault()
                                        if (!isTarget) setDropAt({ date, slot: row.slot })
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault()
                                        drop()
                                    }}
                                    onContextMenu={(e) => {
                                        if (row.extra) return
                                        e.preventDefault()
                                        onSlotMenu(e, date, row.slot)
                                    }}
                                    className={`group/cell flex min-w-0 flex-col gap-1.5 border-l border-[#eeeeee] p-1.5 ${date === today ? 'bg-neutral-50' : ''}`}
                                >
                                    {items.map((entry) => (
                                        <MealTile
                                            key={entry._id}
                                            entry={entry}
                                            dragging={dragId === entry._id}
                                            onOpen={() => onOpen(entry)}
                                            onToggle={() => onToggle(entry)}
                                            onContextMenu={(ev) => {
                                                ev.preventDefault()
                                                ev.stopPropagation()
                                                onRowMenu(ev, entry)
                                            }}
                                            onDragStart={() => setDragId(entry._id)}
                                            onDragEnd={() => {
                                                setDragId(null)
                                                setDropAt(null)
                                            }}
                                        />
                                    ))}
                                    {isTarget ? (
                                        <GridDropHere />
                                    ) : row.extra ? null : (
                                        <GridCellAdd
                                            label={`Add to ${shortDayLabel(date)} ${CATEGORY[row.slot].label.toLowerCase()}`}
                                            onClick={() => onAdd(date, row.slot)}
                                        />
                                    )}
                                </div>
                            )
                        })}
                    </div>
                ))}
                {totalRows.map((r) => (
                    <div role="row" key={r.label} className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] border-b border-hairline">
                        <span role="rowheader" className="py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">
                            {r.label}
                        </span>
                        {days.map((date, i) => {
                            const c = r.cell(i)
                            return (
                                <span role="cell" key={date} className="border-l border-[#eeeeee] px-2.5 py-3">
                                    <span className={`block text-[18px] tracking-[-0.015em] ${c.bold ? 'font-semibold' : ''}`}>{c.text}</span>
                                    <Bar pct={c.pct} color={c.color} className="mt-1.5" />
                                </span>
                            )
                        })}
                    </div>
                ))}
                <div role="row" className="grid grid-cols-[96px_repeat(7,minmax(0,1fr))] border-b border-neutral-900 bg-neutral-50">
                    <span role="rowheader" className="py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-neutral-600">
                        Balance
                    </span>
                    {days.map((date, i) => {
                        const out = outFor(date)
                        const inn = weekDays[i].totals.plan.calories
                        const b = out && inn > 0 ? inn - out : null
                        return (
                            <span role="cell" key={date} className={`border-l border-[#eeeeee] px-2.5 py-3 text-[18px] tracking-[-0.015em] ${b === null ? 'text-neutral-600' : ''}`}>
                                {b === null ? '—' : `${b > 0 ? '+' : '−'}${kcal(Math.abs(b))}`}
                            </span>
                        )
                    })}
                </div>
            </div>
            <p className="mt-4 text-[13px] text-neutral-600">Balance is planned in minus calories out (Garmin, or what you entered).</p>
        </div>
    )
}
