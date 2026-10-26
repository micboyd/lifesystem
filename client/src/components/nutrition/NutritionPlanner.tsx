import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react'
import Spinner from '../Spinner'
import Button from '../Button'
import EmptyState from '../EmptyState'
import Drawer from '../Drawer'
import Checkbox from '../Checkbox'
import ConfirmModal from '../ConfirmModal'
import DropdownMenu, { type MenuEntry, type MenuItem } from '../DropdownMenu'
import ContextMenu from '../ContextMenu'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { useToast } from '../../context/ToastContext'
import { Link } from 'react-router-dom'
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
import { CATEGORY, MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal, signedKcal } from './format'
import {
    addPlanEntry,
    addPlatePlanEntry,
    addBoxNotes,
    addAwayNote,
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
import { expectedPer100, plateTotal } from '../../lib/plates'
import { PlateLinesEditor, plateGrams, plateTitle } from './PlateUI'
import { projectBoxNotes, type BoxProjection } from '../../lib/plateSuggest'
import { weekStock } from '../../lib/weekStock'
import { WeekStock } from './WeekStock'
import { DayNumbers } from './DayNumbers'
import { WeighOutDrawer } from './WeighOutDrawer'
import { AddDrawer, type AddTarget } from './AddDrawer'
import { dayTotals, weekAverage } from '../../lib/dayTotals'
import { totalOut } from '../../lib/energy'
import type {
    DailyEnergy,
    Event,
    MacroGoals,
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

/** "Eating from this box" planned ahead — no grams, no numbers, weighed out when eaten. */
const isBoxNote = (e: MealPlanEntry) => !!e.box

/** "At an event, so no meal here" — no numbers, never ticked. */
const isAwayNote = (e: MealPlanEntry) => !!e.away

const isAwayIn = (e: MealPlanEntry, date: string, slot: MealType) => !!e.away && e.date === date && e.slot === slot

/** Box notes' projected plates, by entry id — estimates only, never counted as planned. */
type Projections = Map<string, BoxProjection>

/** The one-line summary under a planned meal's name. */
function plannedMeta(entry: MealPlanEntry, projection?: BoxProjection): string {
    if (isAwayNote(entry)) return 'Away · no meal here'
    if (isBoxNote(entry)) {
        const grams = projection?.lines.map((l) => `${fmt(l.grams)} g`).join(' + ')
        return projection
            ? `~${grams} · ~${kcal(projection.macros.calories)} kcal · ~${fmt(Math.round(projection.macros.protein))} g protein`
            : 'From the box · weigh it when you eat'
    }
    const grams = plateGrams(entry)
    return `${kcal(entry.macros.calories)} kcal · ${fmt(Math.round(entry.macros.protein))} g protein${grams ? ` · ${grams}` : ''}`
}

// ─── Planner ────────────────────────────────────────────────────────────────────

export default function NutritionPlanner({
    meals,
    foods,
    settingsGoals,
    bmrFor,
    onOpenPantry,
}: {
    /** Switch to the Pantry tab. */
    onOpenPantry?: () => void
    meals: Meal[]
    /** Boxes and plain foods, for weighing out plates. */
    foods: PlateFood[]
    settingsGoals?: MacroGoals
    /** The BMR worked out for a day (lib/bmr.ts), or null until it can be. */
    bmrFor: (date: string) => number | null
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
    // A planned meal opened for a closer look.
    const [detail, setDetail] = useState<MealPlanEntry | null>(null)
    // A meal copied to paste into another slot or day, and an open right-click menu.
    const [copied, setCopied] = useState<MealPlanEntry | null>(null)
    const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
    // A box meal being eaten: its suggested grams, ready to confirm.
    const [weighing, setWeighing] = useState<MealPlanEntry | null>(null)
    // A copied week held for pasting elsewhere: its Monday and which slots.
    const [clipboard, setClipboard] = useState<{ from: string; slots: MealType[] } | null>(null)
    // Choosing which slots to copy, and confirming a paste that would replace meals.
    const [copying, setCopying] = useState(false)
    const [pasteConfirm, setPasteConfirm] = useState(false)
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

    // What each box note would come to at the suggested grams: the newest open
    // batch's figures, else the last cook's (frozen or finished), else — never
    // cooked — the recipe's, so a box can be planned before it's made.
    const projections = useMemo<Projections>(() => {
        const per100For = (id: string) => {
            const f = foods.find((x) => x._id === id)
            return (f && expectedPer100(f)?.per100) ?? null
        }
        const all: Projections = new Map()
        if (!entries.some(isBoxNote)) return all
        for (let i = 0; i < 7; i++) {
            const date = addDays(range.start, i)
            const day = entries.filter((e) => e.date === date)
            if (!day.some(isBoxNote)) continue
            const goals = targetsFor(date, phases, settingsGoals).goals
            for (const [id, p] of projectBoxNotes(day, goals, per100For)) all.set(id, p)
        }
        return all
    }, [entries, foods, phases, settingsGoals, range.start])

    // Whether the pantry covers what's still to eat this week, today onwards.
    const stock = useMemo(
        () =>
            weekStock(
                entries.filter((e) => e.date <= range.end),
                foods,
                (id) => projections.get(id)?.lines ?? null,
                today > range.start ? today : range.start
            ),
        [entries, foods, projections, today, range.start, range.end]
    )

    // The week's average day against its target, for the hero.
    const average = useMemo(
        () =>
            weekAverage(
                Array.from({ length: 7 }, (_, i) => {
                    const date = addDays(range.start, i)
                    return {
                        totals: dayTotals(
                            entries.filter((e) => e.date === date),
                            (e) => projections.get(e._id)?.macros ?? null,
                            date,
                            today
                        ),
                        goals: targetsFor(date, phases, settingsGoals).goals,
                    }
                })
            ),
        [entries, projections, range.start, today, phases, settingsGoals]
    )

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

    async function handleAddPlate(
        date: string,
        slot: MealType,
        plate: PlateLineInput[],
        extra: boolean,
        eaten = false
    ) {
        try {
            const entry = await addPlatePlanEntry(date, slot, plate, extra, eaten)
            // The server drops a box note once that box is weighed into its slot.
            const plated = new Set(plate.map((l) => l.food))
            // Likewise an away note, once anything is put in the slot after all.
            setEntries((prev) => [
                ...prev.filter(
                    (e) =>
                        !(e.box && e.date === date && e.slot === slot && plated.has(e.box)) &&
                        (extra || !isAwayIn(e, date, slot))
                ),
                entry,
            ])
        } catch {
            toast.show('Could not add that plate — please try again.', 'danger')
        }
    }

    async function handleAddBox(box: string, slot: MealType, dates: string[], sides: string[]) {
        try {
            const created = await addBoxNotes(box, slot, dates, sides)
            setEntries((prev) => [...prev, ...created])
        } catch {
            toast.show('Could not plan that box — please try again.', 'danger')
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
        toast.show(`Copied ${entry.name} — right-click a slot, or tap +, to paste it`)
    }

    // A copied meal into another slot or day — planned ahead, eaten today and
    // before, as the + would. Box meals and away notes paste as notes.
    async function pasteInto(date: string, slot: MealType) {
        const src = copied
        if (!src) return
        const eaten = date <= today
        if (src.away) return handleAddAway(date, slot, src.name)
        if (src.box) return handleAddBox(src.box, slot, [date], src.sides ?? [])
        if (src.plate?.length)
            // Each line draws from whichever batch is current there.
            return handleAddPlate(date, slot, src.plate.map((l) => ({ food: l.food, grams: l.grams })), false, eaten)
        if (src.meal) return handleAdd(date, slot, src.meal, false, eaten)
        toast.show('That meal has left your library, so it can’t be pasted.', 'danger')
    }

    function openRowMenu(ev: { clientX: number; clientY: number }, entry: MealPlanEntry) {
        setMenu({
            x: ev.clientX,
            y: ev.clientY,
            items: [
                { label: 'Copy', icon: 'fa-solid fa-copy', onClick: () => copyEntry(entry) },
                { label: 'Open', icon: 'fa-solid fa-up-right-from-square', onClick: () => setDetail(entry) },
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
        if (entry.away) return
        // A box note is eaten by confirming its grams — suggested ones filled in.
        if (entry.box) {
            setDetail(null)
            setWeighing(entry)
            return
        }
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
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm text-white">
                    <i className="fa-solid fa-copy text-xs text-white/60" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                        Copied {slotsLabel(clipboard.slots)} from{' '}
                        {formatWeekRange(clipboard.from, addDays(clipboard.from, 6))}
                        {clipboard.from === range.start && (
                            <span className="text-white/60"> — go to another week to paste</span>
                        )}
                    </span>
                    {clipboard.from !== range.start && (
                        <button
                            type="button"
                            onClick={() =>
                                clipboard.slots.some((sl) => weekSlots.has(sl))
                                    ? setPasteConfirm(true)
                                    : void handlePasteWeek()
                            }
                            className="h-8 rounded-full bg-white px-3 text-[13px] font-semibold text-neutral-900"
                        >
                            Paste here
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label="Forget the copied week"
                        onClick={() => setClipboard(null)}
                        className="grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
            )}

            {copied && (
                <div className="flex items-center gap-3 rounded-2xl bg-neutral-100 px-4 py-2 text-[13px] text-neutral-700">
                    <i className="fa-solid fa-paste text-xs text-neutral-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">
                        <span className="font-semibold text-neutral-900">{copied.name}</span> copied — right-click a slot,
                        or tap +, to paste it
                    </span>
                    <button
                        type="button"
                        aria-label="Forget the copied meal"
                        onClick={() => setCopied(null)}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-white hover:text-neutral-900"
                    >
                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                    </button>
                </div>
            )}

            {!loading && <WeekStock rows={stock} onOpenPantry={onOpenPantry} />}

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
                    entries={entries}
                    projections={projections}
                    goalsFor={(date) => targetsFor(date, phases, settingsGoals).goals}
                    outFor={(date) => energy.find((e) => e.date === date)?.caloriesOut ?? null}
                    bmrFor={bmrFor}
                    onSelect={setAnchor}
                    // Days ahead are planned; today and before, what's added was eaten.
                    onAdd={(date, slot) => setPicker({ date, slot, eaten: date <= today })}
                    onOpen={setDetail}
                    onToggle={handleToggle}
                    onRowMenu={openRowMenu}
                    onSlotMenu={openSlotMenu}
                    onAwayDay={(date) => setPicker({ date, slot: 'breakfast', eaten: false, awayDay: true })}
                    onBackFromAway={(date) => void handleBackFromAway(date)}
                    onReorder={handleReorder}
                    onClearDay={(date) => setClearTarget({ type: 'day', date })}
                    onSaveOut={saveOut}
                />
            )}

            <AddDrawer
                target={picker}
                meals={meals}
                foods={foods}
                entries={picker ? entries.filter((e) => e.date === picker.date) : []}
                projections={projections}
                events={picker ? events.filter((ev) => picker.date >= ev.startDate && picker.date <= ev.endDate) : []}
                goalsFor={(date) => targetsFor(date, phases, settingsGoals).goals}
                onClose={() => setPicker(null)}
                onAddMeal={(date, slot, id, eaten) => handleAdd(date, slot, id, false, eaten)}
                onAddPlate={(date, slot, plate, eaten) => handleAddPlate(date, slot, plate, false, eaten)}
                onAddBox={handleAddBox}
                onAddAway={handleAddAway}
                onAddAwayDay={handleAddAwayDay}
                copied={copied}
                onPaste={pasteInto}
            />

            {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

            <PlannedMealDrawer
                entry={detailEntry}
                projection={detailEntry ? projections.get(detailEntry._id) : undefined}
                foodName={(id) => foods.find((f) => f._id === id)?.name ?? 'Food'}
                fromRecipe={(() => {
                    const f = detailEntry?.box ? foods.find((x) => x._id === detailEntry.box) : undefined
                    return !!(f && expectedPer100(f)?.fromRecipe)
                })()}
                meal={detailEntry?.meal ? (mealsById.get(detailEntry.meal) ?? null) : null}
                onCopy={(e) => {
                    setDetail(null)
                    copyEntry(e)
                }}
                onClose={() => setDetail(null)}
                onToggle={handleToggle}
                onUpdatePlate={handleUpdatePlate}
                onRemove={(id) => {
                    setDetail(null)
                    void handleRemove(id)
                }}
            />

            <CopyWeekDrawer
                open={copying}
                weekLabel={formatWeekRange(range.start, range.end)}
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

            <WeighOutDrawer
                entry={weighing}
                projection={weighing ? projections.get(weighing._id) : undefined}
                foods={foods}
                onClose={() => setWeighing(null)}
                onLog={(plate) =>
                    weighing ? handleAddPlate(weighing.date, weighing.slot, plate, false, true) : Promise.resolve()
                }
                onMore={() => {
                    const e = weighing
                    setWeighing(null)
                    if (e) setPicker({ date: e.date, slot: e.slot, eaten: true })
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

/** Copy this week's plan — every slot, or just some — to paste onto another week. */
function CopyWeekDrawer({
    open,
    weekLabel,
    onClose,
    onCopy,
}: {
    open: boolean
    weekLabel: string
    onClose: () => void
    onCopy: (slots: MealType[]) => void
}) {
    const [selected, setSelected] = useState<Set<MealType>>(() => new Set(MEAL_TYPES))
    const chosen = MEAL_TYPES.filter((s) => selected.has(s))

    function toggle(slot: MealType) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(slot)) next.delete(slot)
            else next.add(slot)
            return next
        })
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title="Copy week"
            badge={weekLabel}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        icon="fa-solid fa-copy"
                        disabled={chosen.length === 0}
                        onClick={() => chosen.length > 0 && onCopy(chosen)}
                    >
                        Copy {chosen.length ? slotsLabel(chosen) : ''}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Pick the meals to copy, then go to another week and paste. Only planned meals are replaced there.
                </p>
                <div className="flex flex-col gap-0.5">
                    {MEAL_TYPES.map((s) => (
                        <Checkbox
                            key={s}
                            checked={selected.has(s)}
                            onChange={() => toggle(s)}
                            label={CATEGORY[s].label}
                            className="rounded-lg px-1.5 py-2 hover:bg-neutral-50"
                        />
                    ))}
                </div>
            </div>
        </Drawer>
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
            `${average.estimated ? '~' : ''}${kcal(average.calories)}${
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
                    <div className="ml-auto">
                        <DropdownMenu
                            align="right"
                            size="medium"
                            items={menu}
                            trigger={<HeroIconButton icon="fa-solid fa-ellipsis" label="Week options" onClick={() => {}} />}
                        />
                    </div>
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
    projections,
    goalsFor,
    outFor,
    bmrFor,
    onSelect,
    onAdd,
    onOpen,
    onToggle,
    onRowMenu,
    onSlotMenu,
    onAwayDay,
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
    projections: Projections
    goalsFor: (date: string) => MacroGoals | null
    outFor: (date: string) => number | null
    bmrFor: (date: string) => number | null
    onSelect: (date: string) => void
    onAdd: (date: string, slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, date: string, slot: MealType) => void
    onAwayDay: (date: string) => void
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
                    projections={projections}
                    goals={goalsFor(date)}
                    out={outFor(date)}
                    bmr={bmrFor(date)}
                    onAdd={(slot) => onAdd(date, slot)}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onRowMenu={onRowMenu}
                    onSlotMenu={(ev, slot) => onSlotMenu(ev, date, slot)}
                    onAwayDay={() => onAwayDay(date)}
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
    projections,
    goals,
    out,
    bmr,
    onAdd,
    onOpen,
    onToggle,
    onRowMenu,
    onSlotMenu,
    onAwayDay,
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
    projections: Projections
    goals: MacroGoals | null
    out: number | null
    /** That day's worked-out BMR, or null until the profile is filled in. */
    bmr: number | null
    onAdd: (slot: MealType) => void
    onOpen: (entry: MealPlanEntry) => void
    onToggle: (entry: MealPlanEntry) => void
    onRowMenu: (ev: { clientX: number; clientY: number }, entry: MealPlanEntry) => void
    onSlotMenu: (ev: { clientX: number; clientY: number }, slot: MealType) => void
    onAwayDay: () => void
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
    const totals = dayTotals(entries, (e) => projections.get(e._id)?.macros ?? null, date, todayKey())

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
    const actions = (
        <DropdownMenu
            align="right"
            className="-my-1.5 ml-auto"
            items={dayMenu}
            trigger={
                <button
                    type="button"
                    aria-label={`${weekday} options`}
                    title="Day options"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <i className="fa-solid fa-ellipsis text-[13px]" aria-hidden="true" />
                </button>
            }
        />
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
                            projections={projections}
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
                    bmr={bmr}
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
    projections,
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
    projections: Projections
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
    const listRef = useRef<HTMLUListElement>(null)

    // The insertion point comes from the cursor's Y against each row's
    // midpoint, skipping the row in flight.
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

    const dropProps = dragActive
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

    const rows = entries.map((e) => (
        <PlannedRow
            key={e._id}
            compact={compact}
            entry={e}
            projection={projections.get(e._id)}
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
    ))

    const addButton = (
        <button
            type="button"
            onClick={onAdd}
            aria-label={`Add to ${meta.label.toLowerCase()}`}
            title={`Add to ${meta.label.toLowerCase()}`}
            className={`grid shrink-0 place-items-center rounded-full text-neutral-500 ring-1 ring-inset ring-neutral-200 transition-colors hover:bg-neutral-900 hover:text-white hover:ring-neutral-900 ${
                compact ? 'h-6 w-6' : 'h-9 w-9 sm:h-8 sm:w-8'
            }`}
        >
            <i className="fa-solid fa-plus text-[10px]" aria-hidden="true" />
        </button>
    )

    return (
        <div
            {...dropProps}
            onContextMenu={(ev) => {
                ev.preventDefault()
                onSlotMenu(ev)
            }}
            className={`${
                compact
                    ? 'flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0'
                    : // Phones: the slot's name over its meals, so rows get the full width.
                      'flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:items-start sm:gap-3'
            } ${drop ? '-mx-1.5 rounded-xl bg-coral-50 px-1.5 ring-2 ring-inset ring-coral-200' : ''}`}
        >
            <div className={`flex items-center justify-between gap-2 ${compact ? '' : 'sm:flex-col sm:items-start sm:pt-1.5'}`}>
                <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${meta.solid}`} aria-hidden="true" />
                    <span className="text-[13px] font-medium text-neutral-500">{meta.label}</span>
                </span>
                {addButton}
            </div>
            {entries.length > 0 ? (
                <ul ref={listRef} className={compact ? 'flex flex-col gap-1.5' : 'grid gap-2 sm:grid-cols-2 2xl:grid-cols-3'}>
                    {rows}
                    {drop && drop.refId === null && <DropLine />}
                </ul>
            ) : (
                <button type="button" onClick={onAdd} className="group block w-full text-left">
                    <EmptySlotTile
                        compact={compact}
                        active={dragActive}
                        title={dragActive ? 'Move here' : 'Nothing yet'}
                        detail={dragActive ? 'Drop to move it' : 'Tap to add'}
                    />
                </button>
            )}
        </div>
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
    projection,
    onOpen,
    onToggle,
    onRemove,
    draggable = false,
    lane = draggable,
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
    /** A box note's projected plate, when its box has figures and the day has targets. */
    projection?: BoxProjection
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
                className={`w-1 shrink-0 rounded-full ${entry.extra || entry.away ? 'bg-neutral-300' : CATEGORY[entry.slot].solid}`}
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
                <span className="mt-0.5 block truncate text-[13px] text-neutral-500">{plannedMeta(entry, projection)}</span>
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
            onContextMenu={onContextMenu}
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
                    className="fa-solid fa-grip-vertical hidden shrink-0 pl-1 text-[11px] text-neutral-300 md:invisible md:inline md:group-hover:visible"
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
            {isAwayNote(entry) ? (
                <span
                    className={`grid shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-400 ${
                        compact ? 'h-6 w-6' : onToggle ? tickSize : 'h-6 w-6'
                    }`}
                    title="Away — no meal here"
                    aria-hidden="true"
                >
                    <i className="fa-regular fa-calendar text-[11px]" />
                </span>
            ) : onToggle ? (
                isBoxNote(entry) ? (
                    <button
                        type="button"
                        aria-label={`Weigh out ${entry.name}`}
                        title="Weigh it out"
                        onClick={onToggle}
                        className={`grid shrink-0 place-items-center rounded-full bg-white text-neutral-400 ring-1 ring-inset ring-neutral-200 transition-colors hover:text-neutral-900 hover:ring-neutral-400 ${tickSize}`}
                    >
                        <i className="fa-solid fa-scale-balanced text-[11px]" aria-hidden="true" />
                    </button>
                ) : (
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
                )
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
 * Calories in against out, once the day has happened — folded away under one
 * line ("Balance −420 kcal", or a nudge to add what was burned). Burned is
 * typed from a watch; BMR comes from the body profile and trend weight.
 */
function DayEnergy({
    eaten,
    out,
    bmr,
    onSaveOut,
}: {
    /** Calories eaten that day. */
    eaten: number
    out: number | null
    /** That day's worked-out BMR, or null until the profile is filled in. */
    bmr: number | null
    onSaveOut: (value: number | null) => Promise<void>
}) {
    const [open, setOpen] = useState(false)
    const totalOutKcal = totalOut(out, bmr)
    const net = totalOutKcal === null ? null : eaten - totalOutKcal

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
                        'Add calories burned'
                    )}
                </span>
                <i
                    className={`fa-solid fa-chevron-down text-[10px] text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                />
            </button>
            {open && (
                <div className="flex flex-col gap-1 border-t border-neutral-200/70 px-3 pb-2.5 pt-2">
                    <EnergyRow label="Eaten">
                        {kcal(eaten)}
                        <Unit>kcal</Unit>
                    </EnergyRow>
                    <EnergyRow label="Burned">
                        <OutField out={out} onSave={onSaveOut} />
                        <Unit>kcal</Unit>
                    </EnergyRow>
                    <EnergyRow label="BMR">
                        {bmr !== null ? (
                            <>
                                {kcal(bmr)}
                                <Unit>kcal</Unit>
                            </>
                        ) : (
                            <Link to="/profile" className="font-medium text-coral-600 hover:underline">
                                Set up in Profile
                            </Link>
                        )}
                    </EnergyRow>
                    {net !== null && (
                        <EnergyRow label="Balance">
                            <span className={net < 0 ? 'text-emerald-700' : net > 0 ? 'text-amber-700' : ''}>
                                {signedKcal(net)}
                            </span>
                            <Unit>kcal {net < 0 ? 'deficit' : net > 0 ? 'surplus' : 'even'}</Unit>
                        </EnergyRow>
                    )}
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

/** Calories out, typed straight into the figure — saved on blur or Enter, cleared by emptying it. */
function OutField({
    out,
    onSave,
    label = 'Calories out',
}: {
    out: number | null
    onSave: (value: number | null) => Promise<void>
    label?: string
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
            aria-label={label}
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

// ─── Planned meal drawer ─────────────────────────────────────────────────────

/** A planned meal opened from its row: its numbers, its notes, and the tick. */
function PlannedMealDrawer({
    entry,
    projection,
    foodName,
    fromRecipe,
    meal,
    onCopy,
    onClose,
    onToggle,
    onUpdatePlate,
    onRemove,
}: {
    /** Copy it, to paste into another slot or day. */
    onCopy: (entry: MealPlanEntry) => void
    entry: MealPlanEntry | null
    /** A box note's projected plate at the suggested grams. */
    projection?: BoxProjection
    /** A food's name, for a projection's lines. */
    foodName: (id: string) => string
    /** The box hasn't been cooked yet, so the projection is off its raw recipe. */
    fromRecipe?: boolean
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
                        <div className="mr-auto flex items-center gap-1">
                            <Button variant="ghost" icon="fa-solid fa-trash-can" onClick={() => onRemove(e._id)}>
                                Remove
                            </Button>
                            <Button variant="ghost" icon="fa-solid fa-copy" onClick={() => onCopy(e)}>
                                Copy
                            </Button>
                        </div>
                        {isAwayNote(e) ? null : isBoxNote(e) ? (
                            <Button icon="fa-solid fa-scale-balanced" onClick={() => onToggle(e)}>
                                Weigh it out
                            </Button>
                        ) : !e.extra &&
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
                    ) : isBoxNote(e) ? (
                        <>
                            {projection && (
                                <div className="flex flex-col gap-3">
                                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                                        Projected at ~{fmt(projection.grams)} g
                                    </p>
                                    <StatStrip
                                        stats={[
                                            { icon: 'fa-solid fa-fire', label: 'Calories', value: `~${kcal(projection.macros.calories)} kcal` },
                                            { icon: 'fa-solid fa-drumstick-bite', label: 'Protein', value: `~${fmt(Math.round(projection.macros.protein))} g` },
                                            { icon: 'fa-solid fa-wheat-awn', label: 'Carbs', value: `~${fmt(Math.round(projection.macros.carbs))} g` },
                                            { icon: 'fa-solid fa-droplet', label: 'Fat', value: `~${fmt(Math.round(projection.macros.fat))} g` },
                                        ]}
                                    />
                                    {projection.lines.length > 1 && (
                                        <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                                            {projection.lines.map((l) => (
                                                <li key={l.food} className="flex items-center gap-3 px-3 py-2 text-sm">
                                                    <span className="min-w-0 flex-1 truncate text-neutral-800">
                                                        {foodName(l.food)}
                                                    </span>
                                                    <span className="shrink-0 tabular-nums text-neutral-500">
                                                        ~{fmt(l.grams)} g
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {fromRecipe && (
                                        <p className="text-xs text-neutral-500">
                                            Not cooked yet, so this is worked out from the recipe. It firms up once
                                            you’ve cooked and weighed a batch.
                                        </p>
                                    )}
                                </div>
                            )}
                            <NoteBlock icon="fa-solid fa-box" title="Eating from the box">
                                {projection
                                    ? 'An estimate: a portion that fills this slot’s share of the day until the first macro (usually protein) reaches it — anything left is room for sides. Lunch and dinner get the same. It shows in the day’s projection but not in its planned numbers. When you eat, weigh it out and the plate takes its place.'
                                    : 'Planned without amounts, so it doesn’t count towards the day’s numbers. When you eat, weigh it out and the plate takes its place.'}
                            </NoteBlock>
                        </>
                    ) : (
                    <>
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
