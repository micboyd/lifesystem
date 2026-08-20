import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Container from '../components/Container'
import { Card } from '../components/Card'
import Spinner from '../components/Spinner'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import EmptyState from '../components/EmptyState'
import DropdownMenu from '../components/DropdownMenu'
import Drawer from '../components/Drawer'
import DatePicker from '../components/DatePicker'
import Modal from '../components/Modal'
import ConfirmModal from '../components/ConfirmModal'
import Switch from '../components/Switch'
import Tabs from '../components/Tabs'
import Select from '../components/Select'
import LineIcon from '../components/LineIcon'
import {
    listMeals,
    listMealsPage,
    createMeal,
    updateMeal,
    deleteMeal,
    mealsToExportJson,
    type MealInput,
    type MealSort,
} from '../services/meals'
import {
    listPlanEntries,
    addPlanEntry,
    addAdhocEntry,
    setEntryStatus,
    setEntryServings,
    copyPlanEntries,
    clearPlanRange,
    deletePlanEntry,
} from '../services/mealPlan'
import { createTask } from '../services/tasks'
import { estimatePrepTime, formatDuration, DEFAULT_PREP_OVERHEAD } from '../lib/prepTime'
import { entryMacros, entryName, isCounted, sumMacros, normGoals } from '../lib/nutrition'
import TodayTab from '../components/nutrition/TodayTab'
import { useAuth } from '../context/AuthContext'
import { MEAL_TYPES } from '../types'
import type {
    Meal,
    MealType,
    Ingredient,
    Macros,
    MacroGoals,
    MealPlanEntry,
    EntryStatus,
} from '../types'
import {
    todayKey,
    addDays,
    parseDateKey,
    formatWeekRange,
    formatDateLong,
    WEEKDAYS_LONG,
    MONTHS,
} from '../lib/calendar'

// ─── Meal-type presentation ───────────────────────────────────────────────────

const TYPE_META: Record<
    MealType,
    { label: string; chip: string; block: string; name: string; sub: string }
> = {
    breakfast: {
        label: 'Breakfast',
        chip: 'bg-amber-50 text-amber-700 ring-amber-600/20',
        block: 'bg-amber-50 hover:bg-amber-100/70 ring-1 ring-inset ring-amber-600/15',
        name: 'text-amber-900',
        sub: 'text-amber-700/70',
    },
    lunch: {
        label: 'Lunch',
        chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
        block: 'bg-emerald-50 hover:bg-emerald-100/70 ring-1 ring-inset ring-emerald-600/15',
        name: 'text-emerald-900',
        sub: 'text-emerald-700/70',
    },
    dinner: {
        label: 'Dinner',
        chip: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
        block: 'bg-indigo-50 hover:bg-indigo-100/70 ring-1 ring-inset ring-indigo-600/15',
        name: 'text-indigo-900',
        sub: 'text-indigo-700/70',
    },
    snack: {
        label: 'Snack',
        chip: 'bg-rose-50 text-rose-700 ring-rose-600/20',
        block: 'bg-rose-50 hover:bg-rose-100/70 ring-1 ring-inset ring-rose-600/15',
        name: 'text-rose-900',
        sub: 'text-rose-700/70',
    },
}

const FILTERS = ['All', "This Week's Plan", 'Breakfast', 'Lunch', 'Dinner', 'Snack'] as const
type Filter = (typeof FILTERS)[number]

const WEEK_FILTER: Filter = "This Week's Plan"

/** Sort options for the library grid, in the order they appear in the dropdown. */
const SORT_OPTIONS: { label: string; value: MealSort }[] = [
    { label: 'Library order', value: 'default' },
    { label: 'Recently added', value: 'recent' },
    { label: 'Highest protein', value: 'protein' },
]

/**
 * Sort meals client-side to match the server's ordering — used for the week
 * filter, which is derived in the browser rather than fetched as a server page.
 * Returns a new array; ties fall back to the manual library order.
 */
function sortMeals(meals: Meal[], sort: MealSort): Meal[] {
    const byOrder = (a: Meal, b: Meal) => a.order - b.order
    const copy = [...meals]
    switch (sort) {
        case 'recent':
            return copy.sort(
                (a, b) => b.createdAt.localeCompare(a.createdAt) || b.order - a.order
            )
        case 'protein':
            return copy.sort(
                (a, b) => (b.macros.protein ?? 0) - (a.macros.protein ?? 0) || byOrder(a, b)
            )
        default:
            return copy.sort(byOrder)
    }
}

function TypeChip({ type }: { type: MealType }) {
    const meta = TYPE_META[type]
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${meta.chip}`}
        >
            {meta.label}
        </span>
    )
}

function fmt(n: number): string {
    const v = Number(n)
    if (!Number.isFinite(v)) return '0'
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

/**
 * Scale the numeric part of an ingredient quantity string by `factor`, leaving
 * any trailing text intact. Handles plain numbers ("200"), decimals ("1.5"),
 * fractions ("1/2") and mixed fractions ("1 1/2"). Non-numeric quantities
 * (e.g. "a pinch") are returned unchanged.
 */
function scaleQty(quantity: string, factor: number): string {
    if (factor === 1) return quantity
    const match = quantity.trim().match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+)(.*)$/)
    if (!match) return quantity
    const [, numStr, rest] = match
    const mixed = numStr.match(/^(\d+)\s+(\d+)\/(\d+)$/)
    const frac = numStr.match(/^(\d+)\/(\d+)$/)
    const value = mixed
        ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
        : frac
          ? Number(frac[1]) / Number(frac[2])
          : parseFloat(numStr)
    if (!Number.isFinite(value)) return quantity
    return fmtQty(value * factor) + rest
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** Drawer state: viewing a meal, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; meal: Meal; fromPlanner?: boolean }
    | { mode: 'create' }
    | { mode: 'edit'; meal: Meal }
    | null

// Today first: the week is where a plan gets designed, but the day is what you
// actually come here to settle.
const TOP_TABS = ['Today', 'Weekly Planner', 'Meals'] as const
type TopTab = (typeof TOP_TABS)[number]

const SUBTITLE: Record<TopTab, string> = {
    Today: 'Calories in against calories out, read through the phase you are in.',
    Meals: 'Your meal library — macros, ingredients and method for every recipe.',
    'Weekly Planner': 'Plan your week — breakfast, lunch, dinner and snacks, with macros tallied.',
}

export default function Nutrition() {
    const { user } = useAuth()
    const goals = useMemo(() => normGoals(user?.settings?.macroGoals), [user?.settings?.macroGoals])

    const [tab, setTab] = useState<TopTab>('Today')
    const [drawer, setDrawer] = useState<Drawered>(null)

    // The full library — for the planner's picker and the "is it empty" check.
    const [allMeals, setAllMeals] = useState<Meal[]>([])
    const [allLoading, setAllLoading] = useState(true)

    // The library grid is paginated server-side (18 per page), filtered by type
    // and by a name search that queries the server.
    const [filter, setFilter] = useState<Filter>('All')
    const [sort, setSort] = useState<MealSort>('default')
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [page, setPage] = useState(1)
    const [lib, setLib] = useState<{ meals: Meal[]; pages: number }>({ meals: [], pages: 1 })
    const [libLoading, setLibLoading] = useState(true)

    // Debounce the search box so we query the server ~300ms after typing stops.
    // A new term resets to page 1 so results aren't hidden past the end.
    useEffect(() => {
        const id = setTimeout(() => {
            setDebouncedSearch(search.trim())
            setPage(1)
        }, 300)
        return () => clearTimeout(id)
    }, [search])

    const reloadAll = useCallback(
        () =>
            listMeals()
                .then(setAllMeals)
                .finally(() => setAllLoading(false)),
        []
    )
    useEffect(() => {
        reloadAll()
    }, [reloadAll])

    // Meal ids planned somewhere in the current week — drives the
    // "This Week's Plan" filter. Kept as a Set for O(1) membership checks.
    const [weekMealIds, setWeekMealIds] = useState<Set<string>>(new Set())
    const reloadWeek = useCallback(() => {
        const start = mondayOf(todayKey())
        return listPlanEntries(start, addDays(start, 6))
            .then((entries) => {
                const ids = entries.map((e) => e.meal?._id).filter(Boolean) as string[]
                setWeekMealIds(new Set(ids))
            })
            .catch(() => {})
    }, [])
    useEffect(() => {
        reloadWeek()
    }, [reloadWeek])

    const reloadLibrary = useCallback(() => {
        // The week filter is derived client-side from `allMeals` + the week's
        // plan, so there's no server page to fetch.
        if (filter === WEEK_FILTER) return Promise.resolve()
        // No spinner on refetch — the grid keeps the current cards until the new
        // page arrives, so paging and filtering never flash. The first paint is
        // covered by `libLoading` starting true.
        const type = filter === 'All' ? undefined : (filter.toLowerCase() as MealType)
        return listMealsPage(page, type, debouncedSearch, sort)
            .then((r) => {
                setLib({ meals: r.meals, pages: r.pages })
                // A page can fall past the end after deletes — step back onto a real one.
                if (page > r.pages) setPage(r.pages)
            })
            .finally(() => setLibLoading(false))
    }, [page, filter, debouncedSearch, sort])
    useEffect(() => {
        reloadLibrary()
    }, [reloadLibrary])

    function changeFilter(f: Filter) {
        setFilter(f)
        setPage(1)
        // Re-sync the week's plan on entry so edits made in the planner show up.
        if (f === WEEK_FILTER) reloadWeek()
    }

    function changeSort(s: MealSort) {
        setSort(s)
        // A new order can shorten the visible range, so start from the top.
        setPage(1)
    }

    const isWeekFilter = filter === WEEK_FILTER
    // For the week filter, derive the grid from the full library intersected
    // with this week's plan, honouring the search box and sort client-side
    // (the week list isn't a server page, so it can't lean on the API sort).
    const weekMeals = useMemo(() => {
        const q = debouncedSearch.toLowerCase()
        const filtered = allMeals
            .filter((m) => weekMealIds.has(m._id))
            .filter((m) => !q || m.name.toLowerCase().includes(q))
        return sortMeals(filtered, sort)
    }, [allMeals, weekMealIds, debouncedSearch, sort])
    const displayMeals = isWeekFilter ? weekMeals : lib.meals

    async function handleAdd(fields: MealInput) {
        await createMeal(fields)
        await Promise.all([reloadLibrary(), reloadAll()])
    }

    async function handleSave(id: string, fields: MealInput) {
        const updated = await updateMeal(id, fields)
        // Keep an open view drawer in sync with the saved data.
        setDrawer((d) => (d && d.mode === 'view' && d.meal._id === id ? { ...d, meal: updated } : d))
        await Promise.all([reloadLibrary(), reloadAll()])
    }

    async function handleDelete(id: string) {
        setDrawer((d) => (d && 'meal' in d && d.meal._id === id ? null : d))
        await deleteMeal(id)
        await Promise.all([reloadLibrary(), reloadAll()])
    }

    // Download the whole library as import-ready JSON.
    function handleExport() {
        const json = mealsToExportJson(allMeals)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `meals-${todayKey()}.json`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <main className="py-10">
            <Container>
                <header className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-950">Nutrition</h1>
                    <p className="mt-1 text-sm text-neutral-500">{SUBTITLE[tab]}</p>
                </header>

                <div className={tab === 'Weekly Planner' ? '' : 'mb-8'}>
                    <Tabs tabs={[...TOP_TABS]} value={tab} onChange={(t) => setTab(t as TopTab)} />
                </div>
            </Container>

            {tab === 'Today' ? (
                <Container className="mt-2">
                    <TodayTab settingsGoals={user?.settings?.macroGoals} />
                </Container>
            ) : tab === 'Weekly Planner' ? (
                <Container fluid className="mt-8">
                    <WeeklyPlanner
                        meals={allMeals}
                        mealsLoading={allLoading}
                        goals={goals}
                        onViewMeal={(meal) => setDrawer({ mode: 'view', meal, fromPlanner: true })}
                    />
                </Container>
            ) : (
                <Container>
                    <div className="mb-6 flex items-center justify-end gap-2">
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-file-export"
                            onClick={handleExport}
                            disabled={allMeals.length === 0}
                        >
                            Export
                        </Button>
                        <Link to="/nutrition/import">
                            <Button variant="secondary" icon="fa-solid fa-file-import">
                                Import
                            </Button>
                        </Link>
                        <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                            Add meal
                        </Button>
                    </div>

                    {allLoading ? (
                        <div className="grid place-items-center py-16">
                            <Spinner />
                        </div>
                    ) : allMeals.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-bowl-food"
                            title="No meals yet"
                            description="Add your first meal to start building a library of recipes and their macros."
                            action={
                                <Button icon="fa-solid fa-plus" onClick={() => setDrawer({ mode: 'create' })}>
                                    Add meal
                                </Button>
                            }
                        />
                    ) : (
                        <div className="flex flex-col gap-6">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <Tabs
                                    tabs={[...FILTERS]}
                                    value={filter}
                                    onChange={(t) => changeFilter(t as Filter)}
                                    className="self-start"
                                />
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                                    <div className="w-full sm:w-44">
                                        <Select
                                            icon="fa-solid fa-arrow-down-wide-short"
                                            options={SORT_OPTIONS}
                                            value={sort}
                                            onChange={(v) => changeSort(v as MealSort)}
                                        />
                                    </div>
                                    <div className="w-full sm:w-64">
                                        <Input
                                            icon="fa-solid fa-magnifying-glass"
                                            type="search"
                                            placeholder="Search meals…"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {!isWeekFilter && libLoading && lib.meals.length === 0 ? (
                                <div className="grid place-items-center py-16">
                                    <Spinner />
                                </div>
                            ) : displayMeals.length === 0 ? (
                                <p className="py-8 text-center text-sm text-neutral-400">
                                    {debouncedSearch
                                        ? `No meals match “${debouncedSearch}”.`
                                        : isWeekFilter
                                          ? 'No meals planned for this week yet.'
                                          : `No ${filter.toLowerCase()} meals yet.`}
                                </p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                        {displayMeals.map((meal) => (
                                            <MealCard
                                                key={meal._id}
                                                meal={meal}
                                                onOpen={() => setDrawer({ mode: 'view', meal })}
                                                onEdit={() => setDrawer({ mode: 'edit', meal })}
                                                onDelete={() => handleDelete(meal._id)}
                                            />
                                        ))}
                                    </div>
                                    {!isWeekFilter && lib.pages > 1 && (
                                        <Pagination page={page} pages={lib.pages} onChange={setPage} />
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </Container>
            )}

            <MealViewDrawer
                meal={drawer?.mode === 'view' ? drawer.meal : null}
                fromPlanner={drawer?.mode === 'view' ? drawer.fromPlanner ?? false : false}
                onClose={() => setDrawer(null)}
                onEdit={(meal) => setDrawer({ mode: 'edit', meal })}
                onDelete={handleDelete}
            />

            <MealFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />
        </main>
    )
}

// ─── Meal card ────────────────────────────────────────────────────────────────

function MealCard({
    meal,
    onOpen,
    onEdit,
    onDelete,
}: {
    meal: Meal
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const { macros } = meal
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            {/* Stretched overlay: clicking anywhere on the card opens the meal.
                Interactive children (the actions menu) sit above it via z-index. */}
            <button
                type="button"
                aria-label={`View ${meal.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{meal.name}</p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                        {meal.servings} {meal.servings === 1 ? 'serving' : 'servings'}
                        {meal.servingLabel ? ` · ${meal.servingLabel}` : ''}
                        {meal.prepTime != null && meal.prepTime > 0
                            ? ` · ${formatDuration(meal.prepTime)} prep`
                            : ''}
                    </p>
                </div>
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Meal actions"
                            className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            {meal.types.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {meal.types.map((t) => (
                        <TypeChip key={t} type={t} />
                    ))}
                </div>
            )}

            <MacroRow macros={macros} />
        </Card>
    )
}

/** Compact per-serving macro readout: calories headline + P/C/F. */
function MacroRow({ macros }: { macros: Meal['macros'] }) {
    return (
        <div className="mt-auto flex items-center gap-3 border-t border-neutral-100 pt-3">
            <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums text-neutral-900">
                    {fmt(macros.calories)}
                </span>
                <span className="text-xs text-neutral-400">kcal</span>
            </div>
            <div className="ml-auto flex gap-2 text-xs tabular-nums text-neutral-500">
                <MacroPill label="P" value={macros.protein} />
                <MacroPill label="C" value={macros.carbs} />
                <MacroPill label="F" value={macros.fat} />
            </div>
        </div>
    )
}

function MacroPill({ label, value, goal }: { label: string; value: number; goal?: number }) {
    // With a goal, the pill reads "value/goal" and turns emerald once the target is met.
    const met = goal != null && value >= goal
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                met ? 'bg-emerald-50' : 'bg-neutral-50'
            }`}
        >
            <span className={`font-semibold ${met ? 'text-emerald-500' : 'text-neutral-400'}`}>
                {label}
            </span>
            <span className={`font-semibold ${met ? 'text-emerald-700' : 'text-neutral-700'}`}>
                {fmt(value)}
                {goal != null ? `/${fmt(goal)}` : ''}g
            </span>
        </span>
    )
}

// ─── View drawer ──────────────────────────────────────────────────────────────

function MealViewDrawer({
    meal,
    fromPlanner = false,
    onClose,
    onEdit,
    onDelete,
}: {
    meal: Meal | null
    fromPlanner?: boolean
    onClose: () => void
    onEdit: (meal: Meal) => void
    onDelete: (id: string) => void
}) {
    // Retain the last meal while the drawer animates closed.
    const [view, setView] = useState<Meal | null>(meal)
    // Servings the user wants to scale the recipe to; resets to the meal's own
    // yield each time a different meal is opened.
    const [servings, setServings] = useState<number>(meal?.servings ?? 1)
    // "Week servings": the selected week drives the serving count — servings
    // reflects how many times this meal appears in that week's plan. Defaults
    // to the current week when a meal is opened.
    const [weekDate, setWeekDate] = useState('')
    const [weekMsg, setWeekMsg] = useState<string | null>(null)
    useEffect(() => {
        if (meal) {
            setView(meal)
            const today = todayKey()
            setWeekDate(today)
            // Opened from an individual planner item: start the scaler at the
            // meal's own yield and load the week's context without overwriting it.
            // From the library, the week's planned count drives the count as before.
            if (fromPlanner) setServings(meal.servings ?? 1)
            applyWeek(today, meal, !fromPlanner)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meal])

    const m = view
    const factor = m && m.servings ? servings / m.servings : 1

    async function applyWeek(date: string, forMeal: Meal | null = m, overrideServings = true) {
        setWeekDate(date)
        setWeekMsg(null)
        if (!date || !forMeal) return
        const start = mondayOf(date)
        try {
            const entries = await listPlanEntries(start, addDays(start, 6))
            const count = entries.filter((e) => e.meal?._id === forMeal._id).length
            if (overrideServings) setServings(count)
            setWeekMsg(count > 0 ? `Planned ${count}× that week` : 'Not planned that week')
        } catch {
            setWeekMsg('Could not load that week')
        }
    }
    return (
        <Drawer
            open={!!meal}
            onClose={onClose}
            title={m?.name ?? 'Meal'}
            size="xl"
            footer={
                m && (
                    <>
                        <Button
                            variant="ghost"
                            icon="fa-solid fa-trash-can"
                            onClick={() => onDelete(m._id)}
                        >
                            Delete
                        </Button>
                        <Button icon="fa-solid fa-pen" onClick={() => onEdit(m)}>
                            Edit
                        </Button>
                    </>
                )
            }
        >
            {m && (
                <div className="flex flex-col gap-6">
                    {m.types.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {m.types.map((t) => (
                                <TypeChip key={t} type={t} />
                            ))}
                        </div>
                    )}

                    {/* Macros */}
                    <section>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Per serving
                            {m.servingLabel ? ` · ${m.servingLabel}` : ''}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                            <MacroStat label="Calories" value={`${fmt(m.macros.calories)}`} unit="kcal" />
                            <MacroStat label="Protein" value={fmt(m.macros.protein)} unit="g" />
                            <MacroStat label="Carbs" value={fmt(m.macros.carbs)} unit="g" />
                            <MacroStat label="Fat" value={fmt(m.macros.fat)} unit="g" />
                        </div>
                        <p className="mt-2 text-xs text-neutral-400">
                            Makes {m.servings} {m.servings === 1 ? 'serving' : 'servings'}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-300">
                            Macros are per serving and don&rsquo;t change with the scale below.
                        </p>
                    </section>

                    {/* Prep time */}
                    {m.prepTime != null && m.prepTime > 0 && (
                        <section className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                            <div className="flex items-center gap-2.5">
                                <i className="fa-regular fa-clock text-neutral-400" aria-hidden="true" />
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                        Est. prep time
                                    </p>
                                    <p className="text-xs text-neutral-400">
                                        {formatDuration(m.prepTime)} for 1 · scales with servings
                                    </p>
                                </div>
                            </div>
                            <span className="text-lg font-semibold tabular-nums text-neutral-800">
                                {formatDuration(
                                    estimatePrepTime(m.prepTime, servings, m.prepOverhead) ?? m.prepTime
                                )}
                            </span>
                        </section>
                    )}

                    {/* Ingredients */}
                    {m.ingredients.length > 0 && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Ingredients
                            </p>
                            <div className="mb-3 flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold text-neutral-700">
                                        Servings
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setServings((s) => Math.max(1, s - 1))}
                                            disabled={servings <= 1}
                                            aria-label="Reduce servings"
                                            className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <i className="fa-solid fa-minus text-sm" aria-hidden="true" />
                                        </button>
                                        <span className="min-w-[7rem] text-center text-base font-semibold tabular-nums text-neutral-800">
                                            {servings} {servings === 1 ? 'serving' : 'servings'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setServings((s) => s + 1)}
                                            aria-label="Add serving"
                                            className="grid h-10 w-10 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100"
                                        >
                                            <i className="fa-solid fa-plus text-sm" aria-hidden="true" />
                                        </button>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 border-t border-neutral-200 pt-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-semibold text-neutral-700">
                                            Week servings
                                        </span>
                                        {weekMsg && (
                                            <span className="text-xs text-neutral-400">{weekMsg}</span>
                                        )}
                                    </div>
                                    <DatePicker
                                        mode="single"
                                        value={weekDate}
                                        onChange={(v) => applyWeek(typeof v === 'string' ? v : '')}
                                        placeholder="Pick a week to match its plan"
                                    />
                                </div>
                            </div>
                            <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                                {m.ingredients.map((ing, i) => {
                                    const qty = ing.quantity ? scaleQty(ing.quantity, factor) : ''
                                    return (
                                        <li
                                            key={i}
                                            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                        >
                                            <span className="text-neutral-700">{ing.name}</span>
                                            {(qty || ing.unit) && (
                                                <span className="shrink-0 tabular-nums text-neutral-500">
                                                    {[qty, ing.unit].filter(Boolean).join(' ')}
                                                </span>
                                            )}
                                        </li>
                                    )
                                })}
                            </ul>
                        </section>
                    )}

                    {/* Method */}
                    {m.method.length > 0 && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Method
                            </p>
                            <ol className="flex flex-col gap-3">
                                {m.method.map((step, i) => (
                                    <li key={i} className="flex gap-3 text-sm text-neutral-700">
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                            {i + 1}
                                        </span>
                                        <span className="whitespace-pre-wrap pt-0.5">{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </section>
                    )}

                    {m.notes && (
                        <section>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                Notes
                            </p>
                            <p className="whitespace-pre-wrap text-sm text-neutral-600">{m.notes}</p>
                        </section>
                    )}

                    {m.link && (
                        <a
                            href={m.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                        >
                            <LineIcon name="external-link" className="h-3.5 w-3.5" />
                            Open link
                        </a>
                    )}
                </div>
            )}
        </Drawer>
    )
}

function MacroStat({ label, value, unit }: { label: string; value: string; unit: string }) {
    return (
        <div className="rounded-xl border border-neutral-200 bg-white px-2 py-2.5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                {label}
            </p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-neutral-900">
                {value}
                <span className="ml-0.5 text-[10px] font-medium text-neutral-400">{unit}</span>
            </p>
        </div>
    )
}

// ─── Add / edit drawer ────────────────────────────────────────────────────────

type FormState = { mode: 'create' } | { mode: 'edit'; meal: Meal }

/** A method step / ingredient row carries a stable key for React list editing. */
interface IngredientRow extends Ingredient {
    key: string
}
interface MethodRow {
    key: string
    text: string
}

let rowSeq = 0
const nextKey = () => `row-${rowSeq++}`

/**
 * A live read-out under the prep-time inputs: the estimated time to cook a few
 * batch sizes, so the effect of the setup % is obvious while editing.
 */
function PrepEstimatePreview({ prepTime, overheadPct }: { prepTime: string; overheadPct: string }) {
    const t = Number(prepTime)
    if (!Number.isFinite(t) || t <= 0) {
        return (
            <p className="text-xs text-neutral-400">
                Add a 1-serving time to estimate how long larger batches take. Setup % is the share
                that&rsquo;s one-time (preheating, chopping setup, cleanup) — higher means batches scale
                more gently. Leave it blank to use the {Math.round(DEFAULT_PREP_OVERHEAD * 100)}% default.
            </p>
        )
    }
    const pct = Number(overheadPct)
    const overhead = overheadPct.trim() === '' || !Number.isFinite(pct) ? undefined : pct / 100
    const rows = [2, 4, 6].map((n) => ({
        n,
        est: estimatePrepTime(t, n, overhead),
    }))
    return (
        <p className="text-xs text-neutral-500">
            <span className="font-semibold text-neutral-600">Estimated:</span>{' '}
            {rows.map((r, i) => (
                <span key={r.n}>
                    {i > 0 ? ' · ' : ''}
                    {r.n}× {r.est != null ? formatDuration(r.est) : '—'}
                </span>
            ))}
        </p>
    )
}

function MealFormDrawer({
    form,
    onClose,
    onAdd,
    onSave,
}: {
    form: FormState | null
    onClose: () => void
    onAdd: (fields: MealInput) => Promise<void>
    onSave: (id: string, fields: MealInput) => Promise<void>
}) {
    const [view, setView] = useState<FormState | null>(form)
    useEffect(() => {
        if (form) setView(form)
    }, [form])

    const editing = view?.mode === 'edit' ? view.meal : undefined

    const [name, setName] = useState('')
    const [types, setTypes] = useState<MealType[]>([])
    const [servings, setServings] = useState('1')
    const [servingLabel, setServingLabel] = useState('')
    const [prepTime, setPrepTime] = useState('')
    // Per-meal overhead override, entered as a percentage (blank = global default).
    const [prepOverheadPct, setPrepOverheadPct] = useState('')
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fat, setFat] = useState('')
    const [ingredients, setIngredients] = useState<IngredientRow[]>([])
    const [method, setMethod] = useState<MethodRow[]>([])
    const [notes, setNotes] = useState('')
    const [link, setLink] = useState('')
    const [saving, setSaving] = useState(false)

    // Reset all fields whenever the drawer opens for a different meal.
    useEffect(() => {
        setName(editing?.name ?? '')
        setTypes(editing?.types ?? [])
        setServings(editing?.servings != null ? String(editing.servings) : '1')
        setServingLabel(editing?.servingLabel ?? '')
        setPrepTime(editing?.prepTime != null ? String(editing.prepTime) : '')
        setPrepOverheadPct(
            editing?.prepOverhead != null ? String(Math.round(editing.prepOverhead * 100)) : ''
        )
        setCalories(editing?.macros.calories ? String(editing.macros.calories) : '')
        setProtein(editing?.macros.protein ? String(editing.macros.protein) : '')
        setCarbs(editing?.macros.carbs ? String(editing.macros.carbs) : '')
        setFat(editing?.macros.fat ? String(editing.macros.fat) : '')
        setIngredients((editing?.ingredients ?? []).map((i) => ({ ...i, key: nextKey() })))
        setMethod((editing?.method ?? []).map((text) => ({ text, key: nextKey() })))
        setNotes(editing?.notes ?? '')
        setLink(editing?.link ?? '')
        setSaving(false)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const valid = name.trim() !== ''

    function toggleType(t: MealType) {
        setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
    }

    function num(s: string): number {
        const n = Number(s)
        return Number.isFinite(n) && n >= 0 ? n : 0
    }

    async function submit() {
        if (!view || !valid) return
        const fields: MealInput = {
            name: name.trim(),
            types,
            servings: Math.max(1, num(servings) || 1),
            servingLabel: servingLabel.trim() || undefined,
            prepTime: prepTime.trim() === '' ? undefined : num(prepTime),
            prepOverhead:
                prepOverheadPct.trim() === ''
                    ? undefined
                    : Math.min(1, Math.max(0, num(prepOverheadPct) / 100)),
            macros: {
                calories: num(calories),
                protein: num(protein),
                carbs: num(carbs),
                fat: num(fat),
            },
            ingredients: ingredients
                .map((i) => ({
                    name: i.name.trim(),
                    quantity: i.quantity?.trim() || undefined,
                    unit: i.unit?.trim() || undefined,
                }))
                .filter((i) => i.name !== ''),
            method: method.map((m) => m.text.trim()).filter(Boolean),
            notes: notes.trim() || undefined,
            link: link.trim() || undefined,
        }
        setSaving(true)
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.meal._id, fields)
            onClose()
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.mode === 'edit' ? 'Edit meal' : 'Add meal'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : view?.mode === 'edit' ? 'Save' : 'Add'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <Input
                    label="Meal name"
                    autoFocus
                    placeholder="e.g. Chicken & rice bowl"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

                {/* Meal types (multi-select) */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Meal type
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {MEAL_TYPES.map((t) => {
                            const active = types.includes(t)
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => toggleType(t)}
                                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                        active
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                                >
                                    {TYPE_META[t].label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Servings */}
                <div className="flex gap-3">
                    <Input
                        label="Servings"
                        type="number"
                        min={1}
                        step="any"
                        value={servings}
                        onChange={(e) => setServings(e.target.value)}
                    />
                    <Input
                        label="Serving label (optional)"
                        placeholder="e.g. 1 bowl"
                        value={servingLabel}
                        onChange={(e) => setServingLabel(e.target.value)}
                    />
                </div>

                {/* Prep time + batch scaling */}
                <div className="flex flex-col gap-2">
                    <div className="flex gap-3">
                        <Input
                            label="Prep time — 1 serving (min)"
                            type="number"
                            min={0}
                            step="any"
                            placeholder="e.g. 20"
                            value={prepTime}
                            onChange={(e) => setPrepTime(e.target.value)}
                        />
                        <Input
                            label="Setup % (optional)"
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            placeholder={`${Math.round(DEFAULT_PREP_OVERHEAD * 100)}`}
                            value={prepOverheadPct}
                            onChange={(e) => setPrepOverheadPct(e.target.value)}
                        />
                    </div>
                    <PrepEstimatePreview prepTime={prepTime} overheadPct={prepOverheadPct} />
                </div>

                {/* Macros */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Macros (per serving)
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Input
                            label="Calories"
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            value={calories}
                            onChange={(e) => setCalories(e.target.value)}
                        />
                        <Input
                            label="Protein (g)"
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            value={protein}
                            onChange={(e) => setProtein(e.target.value)}
                        />
                        <Input
                            label="Carbs (g)"
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            value={carbs}
                            onChange={(e) => setCarbs(e.target.value)}
                        />
                        <Input
                            label="Fat (g)"
                            type="number"
                            min={0}
                            step="any"
                            placeholder="0"
                            value={fat}
                            onChange={(e) => setFat(e.target.value)}
                        />
                    </div>
                </div>

                {/* Ingredients */}
                <IngredientEditor rows={ingredients} onChange={setIngredients} />

                {/* Method */}
                <MethodEditor rows={method} onChange={setMethod} />

                <Textarea
                    label="Notes (optional)"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
                <Input
                    label="Link (optional)"
                    type="url"
                    placeholder="https://…"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

// ─── Ingredient editor ────────────────────────────────────────────────────────

function IngredientEditor({
    rows,
    onChange,
}: {
    rows: IngredientRow[]
    onChange: (rows: IngredientRow[]) => void
}) {
    function update(key: string, patch: Partial<Ingredient>) {
        onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
    }
    function remove(key: string) {
        onChange(rows.filter((r) => r.key !== key))
    }
    function add() {
        onChange([...rows, { key: nextKey(), name: '', quantity: '', unit: '' }])
    }

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Ingredients
            </label>
            {rows.length > 0 && (
                <div className="flex flex-col gap-2">
                    {rows.map((r) => (
                        <div key={r.key} className="flex items-center gap-2">
                            <input
                                className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                placeholder="Ingredient"
                                value={r.name}
                                onChange={(e) => update(r.key, { name: e.target.value })}
                            />
                            <input
                                className="w-16 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                placeholder="Qty"
                                value={r.quantity ?? ''}
                                onChange={(e) => update(r.key, { quantity: e.target.value })}
                            />
                            <input
                                className="w-20 rounded-lg border border-neutral-200 bg-white px-2 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                placeholder="Unit"
                                value={r.unit ?? ''}
                                onChange={(e) => update(r.key, { unit: e.target.value })}
                            />
                            <button
                                type="button"
                                aria-label="Remove ingredient"
                                onClick={() => remove(r.key)}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600"
                            >
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={add} className="w-fit">
                Add ingredient
            </Button>
        </div>
    )
}

// ─── Method editor ────────────────────────────────────────────────────────────

function MethodEditor({
    rows,
    onChange,
}: {
    rows: MethodRow[]
    onChange: (rows: MethodRow[]) => void
}) {
    function update(key: string, text: string) {
        onChange(rows.map((r) => (r.key === key ? { ...r, text } : r)))
    }
    function remove(key: string) {
        onChange(rows.filter((r) => r.key !== key))
    }
    function add() {
        onChange([...rows, { key: nextKey(), text: '' }])
    }

    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Method
            </label>
            {rows.length > 0 && (
                <div className="flex flex-col gap-2">
                    {rows.map((r, i) => (
                        <div key={r.key} className="flex items-start gap-2">
                            <span className="mt-2 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                {i + 1}
                            </span>
                            <textarea
                                className="min-w-0 flex-1 resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-neutral-400 focus:border-neutral-400"
                                rows={2}
                                placeholder={`Step ${i + 1}`}
                                value={r.text}
                                onChange={(e) => update(r.key, e.target.value)}
                            />
                            <button
                                type="button"
                                aria-label="Remove step"
                                onClick={() => remove(r.key)}
                                className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-red-600"
                            >
                                <i className="fa-solid fa-xmark" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <Button variant="ghost" size="sm" icon="fa-solid fa-plus" onClick={add} className="w-fit">
                Add step
            </Button>
        </div>
    )
}

// ─── Weekly planner ─────────────────────────────────────────────────────────────

/** A thin progress bar of `value` toward `goal` — accent up to the target, amber once past it. */
function GoalBar({ value, goal }: { value: number; goal: number }) {
    const pct = goal > 0 ? (value / goal) * 100 : 0
    return (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div
                className={`h-full rounded-full ${pct > 100 ? 'bg-amber-400' : 'bg-coral-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
            />
        </div>
    )
}

/** How much of a stretch of plan has been settled either way. */
interface LogProgress {
    /** Entries marked eaten. */
    eaten: number
    /** Entries marked skipped. */
    skipped: number
    /** Entries still awaiting a verdict. */
    pending: number
    /** Calories from entries marked eaten — the number that's actually true. */
    eatenCalories: number
}

function logProgress(entries: MealPlanEntry[]): LogProgress {
    let eaten = 0
    let skipped = 0
    let eatenCalories = 0
    for (const e of entries) {
        if (e.status === 'eaten') {
            eaten += 1
            eatenCalories += entryMacros(e).calories
        } else if (e.status === 'skipped') {
            skipped += 1
        }
    }
    return { eaten, skipped, pending: entries.length - eaten - skipped, eatenCalories }
}

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

// ─── Shopping list ──────────────────────────────────────────────────────────────

/** One aggregated line of the week's shopping list. */
interface ShoppingItem {
    name: string
    /**
     * Summed amount per unit, keyed by the unit's lowercase form. A single
     * ingredient can appear with different units across recipes (e.g. "g" in
     * one, "pcs" in another) — each is totalled separately on the same line.
     */
    units: Map<string, { unit: string; total: number }>
    /** How many planned servings needed this with no usable amount. */
    unknownCount: number
}

/**
 * Parse an ingredient quantity string into a number. Handles plain numbers,
 * decimals, simple fractions ("1/2"), mixed numbers ("1 1/2") and a leading
 * number with a trailing unit ("200g"). Returns null when nothing numeric fits.
 */
function parseQty(raw?: string): number | null {
    if (!raw) return null
    const t = raw.trim()
    const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
    const frac = t.match(/^(\d+)\/(\d+)$/)
    if (frac) return Number(frac[2]) === 0 ? null : Number(frac[1]) / Number(frac[2])
    const n = Number(t)
    if (Number.isFinite(n)) return n
    const lead = t.match(/^(\d*\.?\d+)/)
    return lead ? Number(lead[1]) : null
}

/** Round to at most 2 decimals and drop trailing zeros. */
function fmtQty(n: number): string {
    return String(Math.round(n * 100) / 100)
}

/**
 * Aggregate the week's planned meals into a shopping list. Ingredients are
 * listed for the whole recipe (which yields `servings`), and each plan entry is
 * one serving — so each entry contributes `quantity / servings` of each
 * ingredient. Duplicate ingredients are merged onto a single line by name
 * (case-insensitive), with amounts totalled per unit. Sorted alphabetically.
 */
function buildShoppingList(entries: MealPlanEntry[]): ShoppingItem[] {
    const map = new Map<string, ShoppingItem>()
    for (const entry of entries) {
        // Skipped meals aren't going to be cooked, so don't shop for them.
        // Off-plan entries have no recipe and so no ingredients to gather.
        const meal = isCounted(entry) ? entry.meal : undefined
        if (!meal) continue
        const servings = Math.max(1, meal.servings || 1)
        for (const ing of meal.ingredients) {
            const name = ing.name.trim()
            if (!name) continue
            const unit = (ing.unit ?? '').trim()
            const key = name.toLowerCase()
            let item = map.get(key)
            if (!item) {
                item = { name, units: new Map(), unknownCount: 0 }
                map.set(key, item)
            }
            const qty = parseQty(ing.quantity)
            if (qty != null) {
                const unitKey = unit.toLowerCase()
                const bucket = item.units.get(unitKey) ?? { unit, total: 0 }
                bucket.total += qty / servings
                item.units.set(unitKey, bucket)
            } else {
                item.unknownCount += 1
            }
        }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The amount column for a shopping item, e.g. "150 g", "2 pcs + 150 g" or "×3". */
function amountLabel(item: ShoppingItem): string {
    const amount = [...item.units.values()]
        .map((u) => (u.unit ? `${fmtQty(u.total)} ${u.unit}` : fmtQty(u.total)))
        .join(' + ')
    if (item.unknownCount > 0) {
        return amount ? `${amount} (+${item.unknownCount})` : `×${item.unknownCount}`
    }
    return amount
}

function ShoppingListModal({
    open,
    onClose,
    entries,
}: {
    open: boolean
    onClose: () => void
    entries: MealPlanEntry[]
}) {
    const items = useMemo(() => buildShoppingList(entries), [entries])
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!open) setCopied(false)
    }, [open])

    function copy() {
        const text = items
            .map((i) => {
                const amt = amountLabel(i)
                return `- ${amt ? `${amt} ` : ''}${i.name}`
            })
            .join('\n')
        navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="This week's shopping list"
            footer={
                items.length > 0 && (
                    <>
                        <Button variant="ghost" onClick={onClose}>
                            Close
                        </Button>
                        <Button
                            icon={copied ? 'fa-solid fa-check' : 'fa-solid fa-copy'}
                            onClick={copy}
                        >
                            {copied ? 'Copied' : 'Copy list'}
                        </Button>
                    </>
                )
            }
        >
            {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">
                    Nothing planned this week yet — add meals to the planner to build a shopping list.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    <p className="text-xs text-neutral-400">
                        Totalled across the week, assuming one serving per planned meal.
                    </p>
                    <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                        {items.map((item) => (
                            <li
                                key={item.name}
                                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                            >
                                <span className="text-neutral-700">{item.name}</span>
                                {amountLabel(item) && (
                                    <span className="shrink-0 font-medium tabular-nums text-neutral-500">
                                        {amountLabel(item)}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Modal>
    )
}

// ─── Week cooking instructions ──────────────────────────────────────────────────

/**
 * A single meal's recipe within the cooking drawer, with quantities scaled to
 * the number of servings the week's plan calls for. `servings` is how many times
 * the meal appears in the visible week, so each ingredient is scaled by
 * `servings / meal.servings`.
 */
function CookingRecipe({
    meal,
    servings,
    onBack,
}: {
    meal: Meal
    servings: number
    onBack: () => void
}) {
    const factor = meal.servings ? servings / meal.servings : 1
    return (
        <div className="flex flex-col gap-6">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
            >
                <i className="fa-solid fa-chevron-left text-xs" aria-hidden="true" />
                All planned meals
            </button>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                Scaled for{' '}
                <span className="font-semibold text-neutral-800">
                    {servings} {servings === 1 ? 'serving' : 'servings'}
                </span>{' '}
                planned this week
                {meal.servings ? (
                    <span className="text-neutral-400"> · recipe makes {meal.servings}</span>
                ) : null}
                {(() => {
                    const est = estimatePrepTime(meal.prepTime, servings, meal.prepOverhead)
                    return est != null ? (
                        <span className="text-neutral-400"> · ~{formatDuration(est)} to cook</span>
                    ) : null
                })()}
            </div>

            {meal.ingredients.length > 0 && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Ingredients
                    </p>
                    <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                        {meal.ingredients.map((ing, i) => {
                            const qty = ing.quantity ? scaleQty(ing.quantity, factor) : ''
                            return (
                                <li
                                    key={i}
                                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                                >
                                    <span className="text-neutral-700">{ing.name}</span>
                                    {(qty || ing.unit) && (
                                        <span className="shrink-0 tabular-nums text-neutral-500">
                                            {[qty, ing.unit].filter(Boolean).join(' ')}
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </section>
            )}

            {meal.method.length > 0 && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Method
                    </p>
                    <ol className="flex flex-col gap-3">
                        {meal.method.map((step, i) => (
                            <li key={i} className="flex gap-3 text-sm text-neutral-700">
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-500">
                                    {i + 1}
                                </span>
                                <span className="whitespace-pre-wrap pt-0.5">{step}</span>
                            </li>
                        ))}
                    </ol>
                </section>
            )}

            {meal.notes && (
                <section>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Notes
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-neutral-600">{meal.notes}</p>
                </section>
            )}

            {meal.link && (
                <a
                    href={meal.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-900"
                >
                    <LineIcon name="external-link" className="h-3.5 w-3.5" />
                    Open link
                </a>
            )}

            {meal.ingredients.length === 0 && meal.method.length === 0 && (
                <p className="py-6 text-center text-sm text-neutral-400">
                    This meal has no ingredients or method recorded yet.
                </p>
            )}
        </div>
    )
}

/**
 * "Week cooking instructions": a two-layer drawer. Layer one lists every meal
 * planned in the visible week alongside how many servings the week needs.
 * Picking one drops into its recipe — quantities pre-scaled to that serving
 * count — with a back link up to the list.
 */
function WeekCookingDrawer({
    open,
    onClose,
    entries,
    weekStart,
}: {
    open: boolean
    onClose: () => void
    entries: MealPlanEntry[]
    weekStart: string
}) {
    // Distinct planned meals for the week, each with the servings the plan calls
    // for (one per entry), sorted by name.
    const planned = useMemo(() => {
        const map = new Map<string, { meal: Meal; count: number }>()
        for (const entry of entries) {
            // Nothing to cook for a skipped meal or an off-plan entry.
            const meal = isCounted(entry) ? entry.meal : undefined
            if (!meal) continue
            const existing = map.get(meal._id)
            if (existing) existing.count += 1
            else map.set(meal._id, { meal, count: 1 })
        }
        return [...map.values()].sort((a, b) => a.meal.name.localeCompare(b.meal.name))
    }, [entries])

    const [selectedId, setSelectedId] = useState<string | null>(null)
    // The day to drop the cooking task onto; defaults to the week's Monday.
    const [taskDate, setTaskDate] = useState(weekStart)
    const [addingTask, setAddingTask] = useState(false)
    const [addedTo, setAddedTo] = useState<string | null>(null)
    // Return to the picker and reset the task controls each time the drawer opens.
    useEffect(() => {
        if (open) {
            setSelectedId(null)
            setTaskDate(weekStart)
            setAddedTo(null)
        }
    }, [open, weekStart])

    const selected = selectedId ? planned.find((p) => p.meal._id === selectedId) ?? null : null

    // Whole-week cooking estimate: each meal's batch estimate at its planned
    // serving count, summed. Meals with no prep time recorded can't be counted.
    const totalPrep = useMemo(() => {
        let total = 0
        let missing = 0
        for (const { meal, count } of planned) {
            const est = estimatePrepTime(meal.prepTime, count, meal.prepOverhead)
            if (est != null) total += est
            else missing += 1
        }
        return { total, missing }
    }, [planned])

    // Rounded up to the nearest half-hour, to keep the scheduled block tidy.
    const taskMinutes = Math.ceil(totalPrep.total / 30) * 30

    async function addCookingTask() {
        if (!taskDate || taskMinutes <= 0) return
        setAddingTask(true)
        setAddedTo(null)
        try {
            const title = `Meal prep — ${formatWeekRange(weekStart, addDays(weekStart, 6))}`
            await createTask(taskDate, title, taskMinutes)
            setAddedTo(taskDate)
        } finally {
            setAddingTask(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            title={selected ? selected.meal.name : 'Week cooking instructions'}
            size="xl"
        >
            {selected ? (
                <CookingRecipe
                    meal={selected.meal}
                    servings={selected.count}
                    onBack={() => setSelectedId(null)}
                />
            ) : planned.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">
                    Nothing planned this week yet — add meals to the planner to see their cooking
                    instructions.
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    {totalPrep.total > 0 && (
                        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5">
                                    <i className="fa-regular fa-clock text-neutral-400" aria-hidden="true" />
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                            Est. total cooking time
                                        </p>
                                        <p className="text-xs text-neutral-400">
                                            All meals, at this week&rsquo;s servings
                                            {totalPrep.missing > 0
                                                ? ` · ${totalPrep.missing} without a prep time not counted`
                                                : ''}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-lg font-semibold tabular-nums text-neutral-800">
                                    ~{formatDuration(totalPrep.total)}
                                </span>
                            </div>

                            <div className="flex flex-col gap-2 border-t border-neutral-200 pt-3">
                                <div className="flex flex-wrap items-end gap-2">
                                    <div className="min-w-[12rem] flex-1">
                                        <DatePicker
                                            mode="single"
                                            value={taskDate}
                                            onChange={(v) => {
                                                setTaskDate(typeof v === 'string' ? v : '')
                                                setAddedTo(null)
                                            }}
                                            placeholder="Pick a day"
                                        />
                                    </div>
                                    <Button
                                        icon="fa-solid fa-list-check"
                                        onClick={addCookingTask}
                                        disabled={addingTask || !taskDate}
                                    >
                                        {addingTask ? 'Adding…' : `Add to day (${formatDuration(taskMinutes)})`}
                                    </Button>
                                </div>
                                <p className="text-xs text-neutral-400">
                                    {addedTo ? (
                                        <span className="font-medium text-emerald-600">
                                            <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                                            Added a {formatDuration(taskMinutes)} task to{' '}
                                            {formatDateLong(addedTo)}.
                                        </span>
                                    ) : (
                                        `Creates a task with the total cooking time, rounded up to the nearest 30 min.`
                                    )}
                                </p>
                            </div>
                        </div>
                    )}
                    <p className="text-xs text-neutral-400">
                        Pick a meal to see its recipe, scaled to the servings you&rsquo;ve planned
                        this week.
                    </p>
                    <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                        {planned.map(({ meal, count }) => (
                            <li key={meal._id}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(meal._id)}
                                    className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition-colors hover:bg-neutral-50"
                                >
                                    <span className="flex min-w-0 flex-col gap-1">
                                        <span className="truncate text-sm font-medium text-neutral-800">
                                            {meal.name}
                                        </span>
                                        {meal.types.length > 0 && (
                                            <span className="flex flex-wrap gap-1">
                                                {meal.types.map((t) => (
                                                    <TypeChip key={t} type={t} />
                                                ))}
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-2">
                                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium tabular-nums text-neutral-500">
                                            {count} {count === 1 ? 'serving' : 'servings'}
                                        </span>
                                        <i
                                            className="fa-solid fa-chevron-right text-xs text-neutral-300"
                                            aria-hidden="true"
                                        />
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </Drawer>
    )
}

// ─── Random week generator ──────────────────────────────────────────────────────

/** Fisher–Yates shuffle, returning a new array. */
function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

interface RandomiseOptions {
    /** Which slots to fill, in canonical meal order. */
    slots: MealType[]
    /**
     * Which days of the visible week to fill, as offsets from the Monday start
     * (0 = Mon … 6 = Sun), ascending. Days not listed are left untouched.
     */
    dayOffsets: number[]
    /**
     * Cap on the number of *distinct* meals used across the whole week — the plan
     * repeats within this set. `null` means no limit (full variety).
     */
    maxVariety: number | null
    /** Overwrite meals already in a slot rather than skipping filled slots. */
    replace: boolean
}

// Weekday pills for the randomiser, in Monday-first order to match the planner.
// The offset is the day's distance from the week's Monday start.
const RANDOMISE_DAYS: { offset: number; label: string }[] = [
    { offset: 0, label: 'Mon' },
    { offset: 1, label: 'Tue' },
    { offset: 2, label: 'Wed' },
    { offset: 3, label: 'Thu' },
    { offset: 4, label: 'Fri' },
    { offset: 5, label: 'Sat' },
    { offset: 6, label: 'Sun' },
]

/**
 * "Randomise week": pick random meals from the library to fill the visible week.
 * Options let you choose which meal types to include, cap the meals per day, and
 * decide whether to overwrite the existing plan or only fill empty slots.
 */
function RandomiseWeekModal({
    open,
    onClose,
    meals,
    onGenerate,
}: {
    open: boolean
    onClose: () => void
    meals: Meal[]
    onGenerate: (opts: RandomiseOptions) => Promise<void>
}) {
    // Meal types the library can actually fill — a type with no tagged meals is
    // offered but disabled so it's clear why nothing lands there.
    const available = useMemo(
        () => MEAL_TYPES.filter((t) => meals.some((m) => m.types.includes(t))),
        [meals]
    )

    const [slots, setSlots] = useState<MealType[]>([])
    // Which days of the week to fill, as Monday offsets (0 = Mon … 6 = Sun).
    const [dayOffsets, setDayOffsets] = useState<number[]>(RANDOMISE_DAYS.map((d) => d.offset))
    // Cap on distinct meals across the week; capped to the library's ceiling below.
    const [maxVariety, setMaxVariety] = useState(5)
    const [limitVariety, setLimitVariety] = useState(true)
    const [replace, setReplace] = useState(false)
    const [generating, setGenerating] = useState(false)

    // Reset to sensible defaults each time the modal opens: every fillable type,
    // every day, fill-empty-only, and a variety cap of 5 distinct meals.
    useEffect(() => {
        if (open) {
            setSlots(available)
            setDayOffsets(RANDOMISE_DAYS.map((d) => d.offset))
            setMaxVariety(5)
            setLimitVariety(true)
            setReplace(false)
            setGenerating(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    // The chosen slots in canonical order — one meal per selected type each day,
    // so preview counts and the button match the generator exactly.
    const orderedSlots = MEAL_TYPES.filter((t) => slots.includes(t))
    const perDay = orderedSlots.length
    const dayCount = dayOffsets.length
    const weekTotal = perDay * dayCount
    const allDaysSelected = dayCount === RANDOMISE_DAYS.length

    // The most distinct meals a variety cap could ever use — the number of
    // library meals tagged with at least one selected slot. The stepper can't
    // exceed this, and asking for it (or more) is effectively "no limit".
    const varietyCeiling = useMemo(
        () => meals.filter((m) => orderedSlots.some((s) => m.types.includes(s))).length,
        [meals, orderedSlots]
    )
    const allSelected = available.length > 0 && available.every((t) => slots.includes(t))
    // What actually gets passed to the generator: null unless the user opted to
    // limit variety and picked a number below the ceiling.
    const effectiveVariety = Math.min(maxVariety, Math.max(1, varietyCeiling))
    const varietyLimit =
        limitVariety && varietyCeiling > 0 && effectiveVariety < varietyCeiling
            ? effectiveVariety
            : null

    function toggleSlot(t: MealType) {
        setSlots((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
    }

    function toggleAll() {
        setSlots(allSelected ? [] : available)
    }

    function toggleDay(offset: number) {
        setDayOffsets((prev) =>
            prev.includes(offset)
                ? prev.filter((x) => x !== offset)
                : [...prev, offset].sort((a, b) => a - b)
        )
    }

    function toggleAllDays() {
        setDayOffsets(allDaysSelected ? [] : RANDOMISE_DAYS.map((d) => d.offset))
    }

    async function generate() {
        if (perDay === 0 || dayCount === 0) return
        setGenerating(true)
        try {
            await onGenerate({ slots, dayOffsets, maxVariety: varietyLimit, replace })
            onClose()
        } finally {
            setGenerating(false)
        }
    }

    const canGenerate = perDay > 0 && dayCount > 0 && !generating

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Randomise week"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button icon="fa-solid fa-dice" onClick={generate} disabled={!canGenerate}>
                        {generating ? 'Filling…' : 'Fill week'}
                    </Button>
                </>
            }
        >
            {available.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-400">
                    Your meals need a meal type (Breakfast, Lunch…) before they can be picked at
                    random. Tag some meals first.
                </p>
            ) : (
                <div className="flex flex-col gap-6">
                    <p className="text-sm text-neutral-500">
                        Picks random meals from your library to fill the week on screen. Each meal
                        type is dealt from a shuffled list, so days vary and repeats only start once
                        you run out of options.
                    </p>

                    {/* Meal types */}
                    <section className="flex flex-col gap-2">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Meals to include
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={toggleAll}
                                aria-pressed={allSelected}
                                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    allSelected
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                All
                            </button>
                            <span className="w-px self-stretch bg-neutral-200" aria-hidden="true" />
                            {MEAL_TYPES.map((t) => {
                                const has = available.includes(t)
                                const active = slots.includes(t)
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => has && toggleSlot(t)}
                                        disabled={!has}
                                        title={has ? undefined : `No meals tagged ${TYPE_META[t].label}`}
                                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                            !has
                                                ? 'cursor-not-allowed bg-neutral-50 text-neutral-300'
                                                : active
                                                  ? 'bg-neutral-900 text-white'
                                                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                        }`}
                                    >
                                        {TYPE_META[t].label}
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {/* Days to fill */}
                    <section className="flex flex-col gap-2 border-t border-neutral-100 pt-4">
                        <label className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                            Days to fill
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={toggleAllDays}
                                aria-pressed={allDaysSelected}
                                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                                    allDaysSelected
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                All
                            </button>
                            <span className="w-px self-stretch bg-neutral-200" aria-hidden="true" />
                            {RANDOMISE_DAYS.map((d) => {
                                const active = dayOffsets.includes(d.offset)
                                return (
                                    <button
                                        key={d.offset}
                                        type="button"
                                        onClick={() => toggleDay(d.offset)}
                                        aria-pressed={active}
                                        className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                                            active
                                                ? 'bg-neutral-900 text-white'
                                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                        }`}
                                    >
                                        {d.label}
                                    </button>
                                )
                            })}
                        </div>
                    </section>

                    {/* Meal variety — cap the number of distinct meals this week */}
                    <section className="flex flex-col gap-3 border-t border-neutral-100 pt-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-neutral-700">
                                    Limit meal variety
                                </p>
                                <p className="text-xs text-neutral-400">
                                    {limitVariety
                                        ? 'Reuses a small set of meals across the week.'
                                        : 'Uses as many different meals as your library allows.'}
                                </p>
                            </div>
                            <Switch
                                checked={limitVariety}
                                onChange={setLimitVariety}
                                disabled={varietyCeiling <= 1}
                            />
                        </div>
                        {limitVariety && varietyCeiling > 1 && (
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-neutral-600">Different meals this week</p>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setMaxVariety(Math.max(1, effectiveVariety - 1))}
                                        disabled={effectiveVariety <= 1}
                                        aria-label="Fewer meal variations"
                                        className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <i className="fa-solid fa-minus text-sm" aria-hidden="true" />
                                    </button>
                                    <span className="min-w-[2ch] text-center text-base font-semibold tabular-nums text-neutral-800">
                                        {effectiveVariety}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setMaxVariety(Math.min(varietyCeiling, effectiveVariety + 1))
                                        }
                                        disabled={effectiveVariety >= varietyCeiling}
                                        aria-label="More meal variations"
                                        className="grid h-9 w-9 place-items-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        <i className="fa-solid fa-plus text-sm" aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Replace existing */}
                    <section className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
                        <div>
                            <p className="text-sm font-semibold text-neutral-700">
                                Replace existing meals
                            </p>
                            <p className="text-xs text-neutral-400">
                                {replace
                                    ? 'Overwrites whatever is already planned in those slots.'
                                    : 'Leaves planned meals alone — only fills empty slots.'}
                            </p>
                        </div>
                        <Switch checked={replace} onChange={setReplace} />
                    </section>

                    <p className="rounded-xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
                        {perDay === 0 ? (
                            'Pick at least one meal type to fill.'
                        ) : dayCount === 0 ? (
                            'Pick at least one day to fill.'
                        ) : (
                            <>
                                Fills{' '}
                                <span className="font-semibold text-neutral-700">
                                    {perDay} {perDay === 1 ? 'meal' : 'meals'}
                                </span>{' '}
                                a day — up to{' '}
                                <span className="font-semibold text-neutral-700">{weekTotal}</span>{' '}
                                across{' '}
                                <span className="font-semibold text-neutral-700">
                                    {allDaysSelected
                                        ? 'the week'
                                        : `${dayCount} ${dayCount === 1 ? 'day' : 'days'}`}
                                </span>
                                {varietyLimit != null && (
                                    <>
                                        , drawn from just{' '}
                                        <span className="font-semibold text-neutral-700">
                                            {varietyLimit} {varietyLimit === 1 ? 'meal' : 'meals'}
                                        </span>
                                    </>
                                )}
                                {replace ? '' : ', skipping slots already planned'}.
                            </>
                        )}
                    </p>
                </div>
            )}
        </Modal>
    )
}

/** Shared column template for the weekday and weekend rows of the planner grid. */
const WEEK_ROW_GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'

function WeeklyPlanner({
    meals,
    mealsLoading,
    goals,
    onViewMeal,
}: {
    meals: Meal[]
    mealsLoading: boolean
    goals: MacroGoals | null
    onViewMeal: (meal: Meal) => void
}) {
    const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey()))
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [picker, setPicker] = useState<{ date: string; slot: MealType } | null>(null)
    const [showList, setShowList] = useState(false)
    const [showCooking, setShowCooking] = useState(false)
    const [showRandom, setShowRandom] = useState(false)
    // The day an off-plan entry is being logged against, if any.
    const [offPlan, setOffPlan] = useState<string | null>(null)
    // The Monday of a week the user has "copied" for pasting onto another week.
    const [copiedWeek, setCopiedWeek] = useState<string | null>(null)
    // The planner opens read-only; Edit reveals the add/remove/copy controls.
    const [editing, setEditing] = useState(false)

    const weekEnd = addDays(weekStart, 6)
    const today = todayKey()

    useEffect(() => {
        // Refetch silently on week change — the grid keeps the previous week's
        // meals until the new ones arrive, so navigation never flashes a spinner.
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

    async function handleAdd(date: string, slot: MealType, mealId: string) {
        const entry = await addPlanEntry(date, slot, mealId)
        setEntries((prev) => [...prev, entry])
    }

    async function handleRemove(id: string) {
        setEntries((prev) => prev.filter((e) => e._id !== id))
        await deletePlanEntry(id)
    }

    // Optimistic: marking food eaten should feel instant, and reverting on
    // failure is cheaper than making the tick wait on a round trip.
    async function handleSetStatus(id: string, status: EntryStatus) {
        const previous = entries.find((e) => e._id === id)?.status
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, status } : e)))
        try {
            await setEntryStatus(id, status)
        } catch {
            if (previous) {
                setEntries((prev) =>
                    prev.map((e) => (e._id === id ? { ...e, status: previous } : e))
                )
            }
        }
    }

    /**
     * Change a portion. Optimistic like the status toggle, and rolled back the
     * same way — the macro totals redraw off this, so a failed save that left the
     * number showing would quietly misreport the day.
     */
    async function handleSetServings(id: string, servings: number) {
        const previous = entries.find((e) => e._id === id)?.servings
        setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, servings } : e)))
        try {
            await setEntryServings(id, servings)
        } catch {
            if (previous !== undefined) {
                setEntries((prev) =>
                    prev.map((e) => (e._id === id ? { ...e, servings: previous } : e))
                )
            }
        }
    }

    async function handleLogOffPlan(
        date: string,
        slot: MealType,
        adhoc: { name: string; macros: Partial<Macros> }
    ) {
        const entry = await addAdhocEntry(date, slot, adhoc)
        setEntries((prev) => [...prev, entry])
    }

    // Fill the visible week with random meals from the library. Each selected
    // slot is dealt from its own shuffled list of tagged meals, cycling once the
    // list runs out, so a week varies as much as the library allows.
    async function generateRandomWeek({ slots, dayOffsets, maxVariety, replace }: RandomiseOptions) {
        const orderedSlots = MEAL_TYPES.filter((t) => slots.includes(t))
        // Only fill the days the user selected; `days` is Monday-first, so its
        // index is the offset the modal reports.
        const targetDays = days.filter((_, i) => dayOffsets.includes(i))

        // The pool of meals each slot may draw from. With no variety cap that's
        // every tagged meal; with a cap we first choose a small "working set" of
        // distinct meals — covering each slot type at least once, then adding
        // variety up to the budget — and restrict every slot to that set.
        const pools = new Map<MealType, Meal[]>()
        for (const slot of orderedSlots) pools.set(slot, meals.filter((m) => m.types.includes(slot)))

        const queues = new Map<MealType, Meal[]>()
        if (maxVariety == null) {
            for (const slot of orderedSlots) queues.set(slot, shuffle(pools.get(slot)!))
        } else {
            const chosen = new Map<string, Meal>()
            // 1) Guarantee coverage: at least one chosen meal per slot type.
            for (const slot of orderedSlots) {
                const covered = [...chosen.values()].some((m) => m.types.includes(slot))
                if (covered || chosen.size >= maxVariety) continue
                const pick = shuffle(pools.get(slot)!).find((m) => !chosen.has(m._id))
                if (pick) chosen.set(pick._id, pick)
            }
            // 2) Spend any remaining budget on extra variety across the slots.
            const rest = shuffle(
                meals.filter((m) => !chosen.has(m._id) && orderedSlots.some((s) => m.types.includes(s)))
            )
            for (const m of rest) {
                if (chosen.size >= maxVariety) break
                chosen.set(m._id, m)
            }
            const working = [...chosen.values()]
            for (const slot of orderedSlots) {
                queues.set(slot, shuffle(working.filter((m) => m.types.includes(slot))))
            }
        }

        const cursor = new Map<MealType, number>()
        const toDelete: string[] = []
        const toAdd: { date: string; slot: MealType; mealId: string }[] = []
        for (const date of targetDays) {
            for (const slot of orderedSlots) {
                const queue = queues.get(slot)!
                if (queue.length === 0) continue
                const existing = entries.filter((e) => e.date === date && e.slot === slot)
                if (existing.length > 0) {
                    if (!replace) continue
                    toDelete.push(...existing.map((e) => e._id))
                }
                const i = cursor.get(slot) ?? 0
                cursor.set(slot, i + 1)
                toAdd.push({ date, slot, mealId: queue[i % queue.length]._id })
            }
        }

        // Clear overwritten slots first, then add — targeting distinct documents,
        // so a refetch reflects exactly the new plan regardless of ordering.
        await Promise.all(toDelete.map((id) => deletePlanEntry(id)))
        await Promise.all(toAdd.map((a) => addPlanEntry(a.date, a.slot, a.mealId)))
        const rows = await listPlanEntries(weekStart, weekEnd)
        setEntries(rows)
    }

    // A pending destructive action awaiting confirmation in the shared modal.
    const [confirm, setConfirm] = useState<{
        title?: string
        message: string
        confirmLabel?: string
        danger?: boolean
        onConfirm: () => void
    } | null>(null)

    // Clear every planned meal from a single day. Optimistic, reverting on failure.
    async function clearDay(date: string) {
        const removed = entries.filter((e) => e.date === date)
        if (removed.length === 0) return
        setEntries((prev) => prev.filter((e) => e.date !== date))
        try {
            await clearPlanRange(date, date)
        } catch {
            setEntries((prev) => [...prev, ...removed])
        }
    }

    function handleClearDay(date: string) {
        const count = entries.filter((e) => e.date === date).length
        if (count === 0) return
        setConfirm({
            title: 'Clear this day?',
            message: `Remove ${count} planned meal${count !== 1 ? 's' : ''} from ${shortDayLabel(date)}? This can’t be undone.`,
            confirmLabel: 'Clear',
            danger: true,
            onConfirm: () => void clearDay(date),
        })
    }

    // Clear every planned meal from the visible week. Optimistic, reverting on failure.
    async function clearWeek() {
        const removed = entries
        if (removed.length === 0) return
        setEntries([])
        try {
            await clearPlanRange(weekStart, weekEnd)
        } catch {
            setEntries(removed)
        }
    }

    function handleClearWeek() {
        if (entries.length === 0) return
        setConfirm({
            title: 'Clear this week?',
            message: `Remove all ${entries.length} planned meal${entries.length !== 1 ? 's' : ''} from ${formatWeekRange(weekStart, weekEnd)}? This can’t be undone.`,
            confirmLabel: 'Clear',
            danger: true,
            onConfirm: () => void clearWeek(),
        })
    }

    // Copy a day's meals onto the following day, overwriting whatever's there.
    async function copyDay(date: string) {
        await copyPlanEntries([date], [addDays(date, 1)])
        // The target may fall in next week; refetch the visible week to sync.
        const rows = await listPlanEntries(weekStart, weekEnd)
        setEntries(rows)
    }

    function handleCopyDay(date: string) {
        const next = addDays(date, 1)
        if (!entries.some((e) => e.date === date)) return
        if (entries.some((e) => e.date === next)) {
            setConfirm({
                message: `Replace ${shortDayLabel(next)} with a copy of ${shortDayLabel(date)}?`,
                onConfirm: () => void copyDay(date),
            })
            return
        }
        void copyDay(date)
    }

    // Paste the copied week onto the week currently in view, overwriting it.
    async function pasteWeek(source: string) {
        const from = Array.from({ length: 7 }, (_, i) => addDays(source, i))
        const created = await copyPlanEntries(from, days)
        setEntries(created)
    }

    function handlePasteWeek() {
        if (!copiedWeek || copiedWeek === weekStart) return
        if (entries.length > 0) {
            setConfirm({
                message: `Replace this week with a copy of ${formatWeekRange(
                    copiedWeek,
                    addDays(copiedWeek, 6)
                )}?`,
                onConfirm: () => void pasteWeek(copiedWeek),
            })
            return
        }
        void pasteWeek(copiedWeek)
    }

    const weekMacros = sumMacros(entries)
    const weekProgress = logProgress(entries)
    const weekCopied = copiedWeek === weekStart

    return (
        <div className="flex flex-col gap-6">
            {/* Week navigation + totals */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                {/* Full-width on phones with a shrinkable label, so "This week"
                    stops breaking mid-word next to the 10rem range label. */}
                <div className="flex w-full items-center gap-2 sm:w-auto">
                    <IconButton
                        label="Previous week"
                        icon="fa-solid fa-chevron-left"
                        onClick={() => setWeekStart(addDays(weekStart, -7))}
                    />
                    <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-neutral-900 sm:min-w-[10rem] sm:flex-none">
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
                        className="ml-1 shrink-0 whitespace-nowrap"
                    >
                        This week
                    </Button>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {meals.length > 0 && (
                            <Button
                                variant={editing ? 'primary' : 'secondary'}
                                icon={editing ? 'fa-solid fa-check' : 'fa-solid fa-pen'}
                                onClick={() => {
                                    setPicker(null)
                                    setEditing((e) => !e)
                                }}
                            >
                                {editing ? 'Done' : 'Edit plan'}
                            </Button>
                        )}
                        {editing && (
                            <>
                                <Button
                                    variant="secondary"
                                    icon="fa-solid fa-dice"
                                    onClick={() => setShowRandom(true)}
                                    disabled={meals.length === 0}
                                >
                                    Randomise
                                </Button>
                                <Button
                                    variant="secondary"
                                    icon={weekCopied ? 'fa-solid fa-check' : 'fa-solid fa-copy'}
                                    onClick={() => setCopiedWeek(weekStart)}
                                    disabled={entries.length === 0}
                                >
                                    {weekCopied ? 'Week copied' : 'Copy week'}
                                </Button>
                                {copiedWeek && !weekCopied && (
                                    <Button
                                        variant="secondary"
                                        icon="fa-solid fa-paste"
                                        onClick={handlePasteWeek}
                                    >
                                        Paste week
                                    </Button>
                                )}
                                <Button
                                    variant="ghost"
                                    icon="fa-solid fa-broom"
                                    onClick={handleClearWeek}
                                    disabled={entries.length === 0}
                                    className="text-red-500 hover:bg-red-50 hover:text-red-600"
                                >
                                    Clear week
                                </Button>
                            </>
                        )}
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-basket-shopping"
                            onClick={() => setShowList(true)}
                        >
                            Shopping list
                        </Button>
                        <Button
                            variant="secondary"
                            icon="fa-solid fa-utensils"
                            onClick={() => setShowCooking(true)}
                        >
                            Cooking instructions
                        </Button>
                    </div>
                    <WeekTotals
                        macros={weekMacros}
                        goals={goals}
                        progress={weekProgress}
                        total={entries.length}
                    />
                </div>
            </div>

            {mealsLoading || loading ? (
                <div className="grid place-items-center py-16">
                    <Spinner />
                </div>
            ) : meals.length === 0 ? (
                <EmptyState
                    icon="fa-solid fa-bowl-food"
                    title="No meals to plan with"
                    description="Add meals to your library first, then drop them into the week."
                />
            ) : (
                // Mon–Fri on one row, the weekend on its own below it. Both rows use
                // the same column template so the weekend days keep the weekday width.
                <div className="flex flex-col gap-4">
                    {[days.slice(0, 5), days.slice(5)].map((row) => (
                        <div key={row[0]} className={WEEK_ROW_GRID}>
                            {row.map((date) => (
                                <DayColumn
                                    key={date}
                                    date={date}
                                    isToday={date === today}
                                    editable={editing}
                                    goals={goals}
                                    entries={entries.filter((e) => e.date === date)}
                                    onAdd={(slot) => setPicker({ date, slot })}
                                    onRemove={handleRemove}
                                    onSetStatus={handleSetStatus}
                                    onSetServings={handleSetServings}
                                    onLogOffPlan={() => setOffPlan(date)}
                                    onCopyDay={() => handleCopyDay(date)}
                                    onClearDay={() => handleClearDay(date)}
                                    onViewMeal={onViewMeal}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            )}

            <MealPicker
                target={picker}
                meals={meals}
                entries={
                    picker
                        ? entries.filter((e) => e.date === picker.date && e.slot === picker.slot)
                        : []
                }
                onClose={() => setPicker(null)}
                onAdd={handleAdd}
                onRemove={handleRemove}
                onSetStatus={handleSetStatus}
            />

            {/* Keyed on the day so each open starts from a blank form — cheaper
                than resetting the fields, and there's nothing to preserve. */}
            <OffPlanModal
                key={offPlan ?? 'closed'}
                date={offPlan}
                onClose={() => setOffPlan(null)}
                onSave={handleLogOffPlan}
            />

            <ShoppingListModal
                open={showList}
                onClose={() => setShowList(false)}
                entries={entries}
            />

            <WeekCookingDrawer
                open={showCooking}
                onClose={() => setShowCooking(false)}
                entries={entries}
                weekStart={weekStart}
            />

            <RandomiseWeekModal
                open={showRandom}
                onClose={() => setShowRandom(false)}
                meals={meals}
                onGenerate={generateRandomWeek}
            />

            <ConfirmModal
                open={!!confirm}
                title={confirm?.title ?? 'Replace planned meals?'}
                message={confirm?.message}
                confirmLabel={confirm?.confirmLabel ?? 'Replace'}
                danger={confirm?.danger}
                onConfirm={() => confirm?.onConfirm()}
                onClose={() => setConfirm(null)}
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

/** Library grid pager — prev / "Page X of Y" / next. */
function Pagination({
    page,
    pages,
    onChange,
}: {
    page: number
    pages: number
    onChange: (page: number) => void
}) {
    return (
        <div className="flex items-center justify-center gap-3 pt-2">
            <IconButton
                label="Previous page"
                icon="fa-solid fa-chevron-left"
                disabled={page <= 1}
                onClick={() => onChange(page - 1)}
            />
            <span className="text-sm font-medium tabular-nums text-neutral-500">
                Page {page} of {pages}
            </span>
            <IconButton
                label="Next page"
                icon="fa-solid fa-chevron-right"
                disabled={page >= pages}
                onClick={() => onChange(page + 1)}
            />
        </div>
    )
}

/** Week-total headline: total kcal + P/C/F, plus the daily average. */
/**
 * The day's logging state under its calorie bar. Skipped meals are called out
 * separately because they're the reason the day's total dropped — without that
 * line the number looks like a mistake.
 */
function LogStatus({ progress, total }: { progress: LogProgress; total: number }) {
    if (total === 0) return null

    const { eaten, skipped, pending } = progress
    if (eaten === 0 && skipped === 0) {
        return <p className="text-[10px] text-neutral-300">Nothing logged yet</p>
    }

    const settled = eaten + skipped
    return (
        <p className="text-[10px] tabular-nums text-neutral-400">
            <span className={pending === 0 ? 'font-semibold text-emerald-600' : ''}>
                {settled}/{total} logged
            </span>
            {skipped > 0 && ` · ${skipped} skipped`}
        </p>
    )
}

function WeekTotals({
    macros,
    goals,
    progress,
    total,
}: {
    macros: Macros
    goals: MacroGoals | null
    progress: LogProgress
    total: number
}) {
    // Goals are per-day; the week's target is seven of them.
    const weekCals = goals?.calories ? goals.calories * 7 : undefined
    const times7 = (v?: number) => (v ? v * 7 : undefined)
    const settled = progress.eaten + progress.skipped
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Week total
                </p>
                <p className="text-lg font-bold tabular-nums text-neutral-900">
                    {fmt(macros.calories)}
                    <span className="ml-0.5 text-xs font-medium text-neutral-400">
                        {weekCals ? `/ ${fmt(weekCals)} kcal` : 'kcal'}
                    </span>
                </p>
            </div>
            <div className="h-8 w-px bg-neutral-200" />
            <div className="flex gap-1.5 text-xs tabular-nums text-neutral-500">
                <MacroPill label="P" value={macros.protein} goal={times7(goals?.protein)} />
                <MacroPill label="C" value={macros.carbs} goal={times7(goals?.carbs)} />
                <MacroPill label="F" value={macros.fat} goal={times7(goals?.fat)} />
            </div>
            <div className="hidden h-8 w-px bg-neutral-200 sm:block" />
            <div className="hidden sm:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Daily avg
                </p>
                <p className="text-sm font-semibold tabular-nums text-neutral-700">
                    {fmt(macros.calories / 7)}
                    {goals?.calories ? ` / ${fmt(goals.calories)}` : ''} kcal
                </p>
            </div>
            <div className="hidden h-8 w-px bg-neutral-200 md:block" />
            {/* What was actually eaten, as distinct from what was planned — the
                only figure worth judging a week by. */}
            <div className="hidden md:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Eaten
                </p>
                <p className="text-sm font-semibold tabular-nums text-neutral-700">
                    {fmt(progress.eatenCalories)} kcal
                    <span className="ml-1 font-medium text-neutral-400">
                        · {settled}/{total} logged
                    </span>
                </p>
            </div>
        </div>
    )
}

function DayColumn({
    date,
    isToday,
    editable,
    goals,
    entries,
    onAdd,
    onRemove,
    onSetStatus,
    onSetServings,
    onLogOffPlan,
    onCopyDay,
    onClearDay,
    onViewMeal,
}: {
    date: string
    isToday: boolean
    editable: boolean
    goals: MacroGoals | null
    entries: MealPlanEntry[]
    onAdd: (slot: MealType) => void
    onRemove: (id: string) => void
    onSetStatus: (id: string, status: EntryStatus) => void
    onSetServings: (id: string, servings: number) => void
    onLogOffPlan: () => void
    onCopyDay: () => void
    onClearDay: () => void
    onViewMeal: (meal: Meal) => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const macros = sumMacros(entries)
    const progress = logProgress(entries)

    return (
        <Card as="div" flush hover={false} className="flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
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
                <div className="flex items-center gap-1">
                    {isToday && (
                        <span className="rounded-full bg-coral-50 px-2 py-0.5 text-[10px] font-semibold text-coral-600">
                            Today
                        </span>
                    )}
                    {editable && entries.length > 0 && (
                        <>
                            <button
                                type="button"
                                aria-label={`Copy ${weekday} to the next day`}
                                title="Copy to next day"
                                onClick={onCopyDay}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                            >
                                <i className="fa-solid fa-copy text-[11px]" aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                aria-label={`Clear ${weekday}`}
                                title="Clear day"
                                onClick={onClearDay}
                                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                                <i className="fa-solid fa-broom text-[11px]" aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-3">
                {MEAL_TYPES.map((slot) => (
                    <SlotSection
                        key={slot}
                        slot={slot}
                        editable={editable}
                        entries={entries.filter((e) => e.slot === slot)}
                        onAdd={() => onAdd(slot)}
                        onRemove={onRemove}
                        onSetStatus={onSetStatus}
                        onSetServings={onSetServings}
                        onViewMeal={onViewMeal}
                    />
                ))}
                {!editable && (
                    <button
                        type="button"
                        onClick={onLogOffPlan}
                        className="rounded-lg border border-dashed border-neutral-200 py-1.5 text-center text-[11px] text-neutral-400 transition-colors hover:border-neutral-300 hover:text-neutral-700"
                    >
                        <i className="fa-solid fa-plus mr-1 text-[10px]" aria-hidden="true" />
                        Off-plan
                    </button>
                )}
            </div>

            <div className="mt-auto flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold tabular-nums text-neutral-900">
                        {fmt(macros.calories)}
                    </span>
                    <span className="text-[10px] text-neutral-400">
                        {goals?.calories ? `/ ${fmt(goals.calories)} kcal` : 'kcal'}
                    </span>
                </div>
                {goals?.calories ? <GoalBar value={macros.calories} goal={goals.calories} /> : null}
                <LogStatus progress={progress} total={entries.length} />
                <div className="flex flex-wrap gap-1 text-[11px] tabular-nums text-neutral-500">
                    <MacroPill label="P" value={macros.protein} goal={goals?.protein} />
                    <MacroPill label="C" value={macros.carbs} goal={goals?.carbs} />
                    <MacroPill label="F" value={macros.fat} goal={goals?.fat} />
                </div>
            </div>
        </Card>
    )
}

function SlotSection({
    slot,
    editable,
    entries,
    onAdd,
    onRemove,
    onSetStatus,
    onSetServings,
    onViewMeal,
}: {
    slot: MealType
    editable: boolean
    entries: MealPlanEntry[]
    onAdd: () => void
    onRemove: (id: string) => void
    onSetStatus: (id: string, status: EntryStatus) => void
    onSetServings: (id: string, servings: number) => void
    onViewMeal: (meal: Meal) => void
}) {
    // In view mode an empty slot is just noise — collapse it so the plan reads clean.
    if (!editable && entries.length === 0) return null

    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    {TYPE_META[slot].label}
                </span>
                {editable && (
                    <button
                        type="button"
                        aria-label={`Add ${TYPE_META[slot].label}`}
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
                        <PlannedMealRow
                            key={e._id}
                            entry={e}
                            onView={e.meal ? () => onViewMeal(e.meal!) : undefined}
                            onRemove={editable ? () => onRemove(e._id) : undefined}
                            onSetStatus={(status) => onSetStatus(e._id, status)}
                            onSetServings={
                                editable ? (n) => onSetServings(e._id, n) : undefined
                            }
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

/**
 * What clicking the status button does next, and how the current state looks.
 * One control cycles the three states rather than three separate buttons — in a
 * column this narrow there's only room for one target per row.
 */
const STATUS_CYCLE: Record<
    EntryStatus,
    { next: EntryStatus; icon: string; cls: string; verb: string }
> = {
    planned: {
        next: 'eaten',
        icon: 'fa-regular fa-circle',
        cls: 'text-neutral-300 hover:text-emerald-500',
        verb: 'Mark as eaten',
    },
    eaten: {
        next: 'skipped',
        icon: 'fa-solid fa-circle-check',
        cls: 'text-emerald-500 hover:text-neutral-400',
        verb: 'Mark as skipped',
    },
    skipped: {
        next: 'planned',
        icon: 'fa-solid fa-circle-minus',
        cls: 'text-neutral-400 hover:text-neutral-500',
        verb: 'Back to planned',
    },
}

/** Portion steps, in servings. Half a portion up or down is the useful grain. */
const SERVING_STEP = 0.5
const MIN_SERVINGS = 0.5
const MAX_SERVINGS = 10

/**
 * The portion on the plate, as a stepper. Sits on its own rather than inside the
 * row's view button, since a button inside a button isn't valid markup.
 */
function ServingsStepper({
    servings,
    name,
    onChange,
}: {
    servings: number
    name: string
    onChange: (servings: number) => void
}) {
    const step = (delta: number) => {
        const next = Math.round((servings + delta) / SERVING_STEP) * SERVING_STEP
        onChange(Math.min(MAX_SERVINGS, Math.max(MIN_SERVINGS, next)))
    }
    return (
        <div className="flex shrink-0 items-center gap-0.5">
            <button
                type="button"
                aria-label={`Smaller portion of ${name}`}
                disabled={servings <= MIN_SERVINGS}
                onClick={() => step(-SERVING_STEP)}
                className="grid h-5 w-5 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
                <i className="fa-solid fa-minus text-[9px]" aria-hidden="true" />
            </button>
            <span
                className="min-w-[1.8rem] text-center text-[10px] font-bold tabular-nums text-neutral-500"
                aria-label={`${fmt(servings)} servings`}
            >
                ×{fmt(servings)}
            </span>
            <button
                type="button"
                aria-label={`Bigger portion of ${name}`}
                disabled={servings >= MAX_SERVINGS}
                onClick={() => step(SERVING_STEP)}
                className="grid h-5 w-5 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-neutral-700 disabled:opacity-30 disabled:hover:bg-transparent"
            >
                <i className="fa-solid fa-plus text-[9px]" aria-hidden="true" />
            </button>
        </div>
    )
}

function PlannedMealRow({
    entry,
    onView,
    onRemove,
    onSetStatus,
    onSetServings,
}: {
    entry: MealPlanEntry
    onView?: () => void
    onRemove?: () => void
    onSetStatus?: (status: EntryStatus) => void
    onSetServings?: (servings: number) => void
}) {
    const name = entryName(entry)
    const macros = entryMacros(entry)
    const meta = TYPE_META[entry.slot]
    const cycle = STATUS_CYCLE[entry.status]
    const skipped = entry.status === 'skipped'
    const servings = entry.servings ?? 1

    const details = (
        <>
            <p
                className={`truncate text-[13px] font-semibold ${meta.name} ${
                    skipped ? 'line-through opacity-50' : ''
                }`}
            >
                {name}
            </p>
            <p className={`text-[11px] tabular-nums ${meta.sub} ${skipped ? 'opacity-50' : ''}`}>
                {fmt(macros.calories)} kcal · P{fmt(macros.protein)} C{fmt(macros.carbs)} F
                {fmt(macros.fat)}
                {!onSetServings && servings !== 1 && (
                    <span className="ml-1 font-semibold">· ×{fmt(servings)}</span>
                )}
                {entry.adhoc && <span className="ml-1 font-semibold">· off-plan</span>}
            </p>
        </>
    )

    return (
        <li className={`flex flex-col rounded-xl px-2.5 py-2 transition-colors ${meta.block}`}>
            <div className="flex items-center gap-1.5">
            {onSetStatus && (
                <button
                    type="button"
                    aria-label={`${cycle.verb}: ${name}`}
                    title={cycle.verb}
                    onClick={() => onSetStatus(cycle.next)}
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${cycle.cls}`}
                >
                    <i className={`${cycle.icon} text-sm`} aria-hidden="true" />
                </button>
            )}
            {onView && entry.meal ? (
                <button
                    type="button"
                    onClick={onView}
                    aria-label={`View ${name}`}
                    className="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
                >
                    {details}
                </button>
            ) : (
                <div className="min-w-0 flex-1">{details}</div>
            )}
            {onRemove && (
                <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    onClick={onRemove}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-red-600"
                >
                    <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                </button>
            )}
            </div>
            {/* On its own line: the day columns are too narrow to take a third
                control cluster beside the name without pushing the row wide. */}
            {onSetServings && (
                <div className="mt-1 flex justify-end">
                    <ServingsStepper servings={servings} name={name} onChange={onSetServings} />
                </div>
            )}
        </li>
    )
}

/**
 * Log something eaten that isn't in the library. Deliberately the shortest form
 * in the app — a name and a calorie figure is enough, and macros are optional,
 * because the food that wrecks a week is exactly the food nobody stops to weigh.
 * It saves straight to 'eaten': there's no planning an off-plan biscuit.
 */
function OffPlanModal({
    date,
    onClose,
    onSave,
}: {
    date: string | null
    onClose: () => void
    onSave: (
        date: string,
        slot: MealType,
        adhoc: { name: string; macros: Partial<Macros> }
    ) => Promise<void>
}) {
    const [slot, setSlot] = useState<MealType>('snack')
    const [name, setName] = useState('')
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fat, setFat] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const num = (v: string) => {
        const n = Number(v)
        return v.trim() && Number.isFinite(n) && n > 0 ? n : undefined
    }

    async function submit() {
        if (!date) return
        if (!name.trim()) {
            setError('Give it a name')
            return
        }
        setSaving(true)
        try {
            await onSave(date, slot, {
                name: name.trim(),
                macros: {
                    calories: num(calories),
                    protein: num(protein),
                    carbs: num(carbs),
                    fat: num(fat),
                },
            })
            onClose()
        } catch {
            setError('Could not save that')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open={!!date}
            onClose={onClose}
            title="Log off-plan food"
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving}>
                        Log it
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {date && (
                    <p className="text-xs text-neutral-400">{shortDayLabel(date)}</p>
                )}
                <Input
                    label="What was it?"
                    placeholder="e.g. two slices of pizza"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    error={error || undefined}
                />
                <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        Slot
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {MEAL_TYPES.map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setSlot(t)}
                                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    slot === t
                                        ? 'bg-neutral-950 text-white'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                }`}
                            >
                                {TYPE_META[t].label}
                            </button>
                        ))}
                    </div>
                </div>
                <Input
                    label="Calories"
                    type="number"
                    inputMode="numeric"
                    placeholder="best guess is fine"
                    value={calories}
                    onChange={(e) => setCalories(e.target.value)}
                />
                <div className="grid grid-cols-3 gap-3">
                    <Input
                        label="Protein"
                        type="number"
                        inputMode="numeric"
                        placeholder="g"
                        value={protein}
                        onChange={(e) => setProtein(e.target.value)}
                    />
                    <Input
                        label="Carbs"
                        type="number"
                        inputMode="numeric"
                        placeholder="g"
                        value={carbs}
                        onChange={(e) => setCarbs(e.target.value)}
                    />
                    <Input
                        label="Fat"
                        type="number"
                        inputMode="numeric"
                        placeholder="g"
                        value={fat}
                        onChange={(e) => setFat(e.target.value)}
                    />
                </div>
            </div>
        </Modal>
    )
}

/**
 * The add-meal drawer for a single day+slot. Clicking a meal adds it and keeps
 * the drawer open so several (e.g. snacks) can be added in a row; what's already
 * in the slot is listed at the top and can be removed here too.
 */
function MealPicker({
    target,
    meals,
    entries,
    onClose,
    onAdd,
    onRemove,
    onSetStatus,
}: {
    target: { date: string; slot: MealType } | null
    meals: Meal[]
    entries: MealPlanEntry[]
    onClose: () => void
    onAdd: (date: string, slot: MealType, mealId: string) => Promise<void>
    onRemove: (id: string) => void
    onSetStatus: (id: string, status: EntryStatus) => void
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

    const slot = view?.slot

    const results = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (q) {
            // Searching spans the whole library so nothing is unreachable; meals
            // tagged for this slot still bubble to the top as suggestions.
            const filtered = meals.filter((m) => m.name.toLowerCase().includes(q))
            if (!slot) return filtered
            return [...filtered].sort((a, b) => {
                const rank = (m: Meal) => (m.types.includes(slot) ? 0 : 1)
                return rank(a) - rank(b) || a.name.localeCompare(b.name)
            })
        }
        // No search: show only meals tagged for this slot (e.g. Breakfast).
        if (!slot) return meals
        return meals
            .filter((m) => m.types.includes(slot))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [meals, query, slot])

    return (
        <Drawer
            open={!!target}
            onClose={onClose}
            title={slot ? `Add ${TYPE_META[slot].label}` : 'Add meal'}
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
                            In this slot
                        </p>
                        <ul className="flex flex-col gap-1">
                            {entries.map((e) => (
                                <PlannedMealRow
                                    key={e._id}
                                    entry={e}
                                    onRemove={() => onRemove(e._id)}
                                    onSetStatus={(status) => onSetStatus(e._id, status)}
                                />
                            ))}
                        </ul>
                    </section>
                )}

                <Input
                    placeholder="Search meals…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />

                {results.length === 0 ? (
                    <p className="py-6 text-center text-sm text-neutral-400">No meals found.</p>
                ) : (
                    <ul className="flex flex-col gap-1.5">
                        {results.map((m) => (
                            <li key={m._id}>
                                <button
                                    type="button"
                                    onClick={() => view && onAdd(view.date, view.slot, m._id)}
                                    className="flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-neutral-800">
                                            {m.name}
                                        </p>
                                        <p className="text-xs tabular-nums text-neutral-400">
                                            {fmt(m.macros.calories)} kcal · P{fmt(m.macros.protein)} C
                                            {fmt(m.macros.carbs)} F{fmt(m.macros.fat)}
                                        </p>
                                    </div>
                                    {slot && m.types.includes(slot) && (
                                        <TypeChip type={slot} />
                                    )}
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
