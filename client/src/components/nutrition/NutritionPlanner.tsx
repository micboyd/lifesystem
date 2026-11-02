import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
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
} from '../planner/PlannerParts'
import { CATEGORY, MacroBar, MacroLegend } from './mealUi'
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
import { listDailyEnergy, saveDailyEnergy, deleteDailyEnergy } from '../../services/dailyEnergy'
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
import { targetsFor } from '../../lib/nutrition'
import { MEAL_TYPES } from '../../types'
import { WeekMacrosButton, WeekMacrosPanel } from './WeekMacros'
import { DayNumbers } from './DayNumbers'
import { AddDrawer, type AddTarget } from './AddDrawer'
import { QuickAddDrawer } from './QuickAddDrawer'
import { dayTotals, weekAverage, weekMacros } from '../../lib/dayTotals'
import type {
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
    // The week's macros panel, open under the chips.
    const [macrosOpen, setMacrosOpen] = useState(false)

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
            listEvents(range.start, range.end).catch(() => [] as Event[]),
        ])
            .then(([rows, en, ph, ev]) => {
                if (!active) return
                setEntries(rows)
                setEnergy(en)
                setPhases(ph)
                setEvents(ev)
            })
            .finally(() => active && setLoading(false))
        return () => {
            active = false
        }
    }, [range.start, range.end])

    // Each day's numbers against its target — the hero's average day and the
    // week's macros panel both read from these.
    const weekDays = useMemo(
        () =>
            Array.from({ length: 7 }, (_, i) => {
                const date = addDays(range.start, i)
                return {
                    totals: dayTotals(entries.filter((e) => e.date === date), date, today),
                    goals: targetsFor(date, phases, settingsGoals).goals,
                }
            }),
        [entries, range.start, today, phases, settingsGoals]
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

    const libraryEmpty = meals.length === 0
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
                onStep={step}
                onSelect={selectDay}
                onPick={setAnchor}
                board={board}
                average={average}
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
                                  onClick: () => setClearTarget({ type: 'week' }),
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

            {!loading && (
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
                <WeekView
                    board={board}
                    weekStart={range.start}
                    selected={anchor}
                    today={today}
                    entries={entries}
                    goalsFor={(date) => targetsFor(date, phases, settingsGoals).goals}
                    outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? null}
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
                    onClearDay={(date) => setClearTarget({ type: 'day', date })}
                    onSaveOut={saveOut}
                />
            )}

            <AddDrawer
                target={picker}
                meals={meals}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                events={picker ? events.filter((ev) => picker.date >= ev.startDate && picker.date <= ev.endDate) : []}
                goalsFor={(date) => targetsFor(date, phases, settingsGoals).goals}
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
}: {
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
    goalsFor,
    outFor,
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
}: {
    /** Lay the seven days side by side across the screen, rather than stacked. */
    board: boolean
    weekStart: string
    /** The focused day — the only one shown on a phone. */
    selected: string
    today: string
    entries: MealPlanEntry[]
    goalsFor: (date: string) => MacroGoals | null
    outFor: (date: string) => number | null
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
                    entries={entries.filter((e) => e.date === date)}
                    goals={goalsFor(date)}
                    out={outFor(date)}
                    onAdd={(slot) => onAdd(date, slot)}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onRowMenu={onRowMenu}
                    onSlotMenu={(ev, slot) => onSlotMenu(ev, date, slot)}
                    onAwayDay={() => onAwayDay(date)}
                    onQuickAdd={() => onQuickAdd(date)}
                    onBackFromAway={() => onBackFromAway(date)}
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

    const canClear = planned.some((e) => clearable(e) && !e.away)
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
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
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
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-neutral-400 ring-1 ring-neutral-200">
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
                <div className="flex flex-col divide-y divide-neutral-100">
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
                    ? 'flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0'
                    : 'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
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
            className={`grid shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-400 ${
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

/**
 * Calories in against out, once the day has happened — folded away under one
 * line ("Balance −420 kcal", or a nudge to add calories out). Calories out is
 * the whole day's total, typed from a watch.
 */
function DayEnergy({
    eaten,
    out,
    onSaveOut,
}: {
    /** Calories eaten that day. */
    eaten: number
    out: number | null
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const net = out === null ? null : eaten - out

    return (
        <div className="rounded-2xl bg-neutral-50">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-left"
            >
                <i className="fa-solid fa-bolt text-[11px] text-neutral-400" aria-hidden="true" />
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
                        </>
                    ) : (
                        'Add calories out'
                    )}
                </span>
                <i
                    className={`fa-solid fa-chevron-down text-[10px] text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
                        <span className="text-[13px] text-neutral-500">Calories out</span>
                        <OutField out={out} onSave={onSaveOut} />
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
        <span className="relative block">
            <input
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                placeholder="0"
                value={value}
                disabled={saving}
                onChange={(e) => setValue(e.target.value)}
                onBlur={() => void commit()}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                className="h-9 w-full rounded-lg bg-white pl-2 pr-10 text-right text-sm font-semibold tabular-nums text-neutral-900 outline-none ring-1 ring-inset ring-neutral-200 transition-shadow placeholder:font-normal placeholder:text-neutral-400 hover:ring-neutral-300 focus:ring-2 focus:ring-neutral-900"
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
