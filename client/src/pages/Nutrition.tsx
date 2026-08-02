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
import Tabs from '../components/Tabs'
import LineIcon from '../components/LineIcon'
import {
    listMeals,
    listMealsPage,
    createMeal,
    updateMeal,
    deleteMeal,
    mealsToExportJson,
    type MealInput,
} from '../services/meals'
import { listPlanEntries, addPlanEntry, copyPlanEntries, deletePlanEntry } from '../services/mealPlan'
import { estimatePrepTime, formatDuration, DEFAULT_PREP_OVERHEAD } from '../lib/prepTime'
import { MEAL_TYPES } from '../types'
import type { Meal, MealType, Ingredient, Macros, MealPlanEntry } from '../types'
import {
    todayKey,
    addDays,
    parseDateKey,
    formatWeekRange,
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
    | { mode: 'view'; meal: Meal }
    | { mode: 'create' }
    | { mode: 'edit'; meal: Meal }
    | null

const TOP_TABS = ['Weekly Planner', 'Meals'] as const
type TopTab = (typeof TOP_TABS)[number]

const SUBTITLE: Record<TopTab, string> = {
    Meals: 'Your meal library — macros, ingredients and method for every recipe.',
    'Weekly Planner': 'Plan your week — breakfast, lunch, dinner and snacks, with macros tallied.',
}

export default function Nutrition() {
    const [tab, setTab] = useState<TopTab>('Weekly Planner')
    const [drawer, setDrawer] = useState<Drawered>(null)

    // The full library — for the planner's picker and the "is it empty" check.
    const [allMeals, setAllMeals] = useState<Meal[]>([])
    const [allLoading, setAllLoading] = useState(true)

    // The library grid is paginated server-side (18 per page), filtered by type
    // and by a name search that queries the server.
    const [filter, setFilter] = useState<Filter>('All')
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
        return listMealsPage(page, type, debouncedSearch)
            .then((r) => {
                setLib({ meals: r.meals, pages: r.pages })
                // A page can fall past the end after deletes — step back onto a real one.
                if (page > r.pages) setPage(r.pages)
            })
            .finally(() => setLibLoading(false))
    }, [page, filter, debouncedSearch])
    useEffect(() => {
        reloadLibrary()
    }, [reloadLibrary])

    function changeFilter(f: Filter) {
        setFilter(f)
        setPage(1)
        // Re-sync the week's plan on entry so edits made in the planner show up.
        if (f === WEEK_FILTER) reloadWeek()
    }

    const isWeekFilter = filter === WEEK_FILTER
    // For the week filter, derive the grid from the full library intersected
    // with this week's plan, honouring the search box client-side.
    const weekMeals = useMemo(() => {
        const q = debouncedSearch.toLowerCase()
        return allMeals
            .filter((m) => weekMealIds.has(m._id))
            .filter((m) => !q || m.name.toLowerCase().includes(q))
    }, [allMeals, weekMealIds, debouncedSearch])
    const displayMeals = isWeekFilter ? weekMeals : lib.meals

    async function handleAdd(fields: MealInput) {
        await createMeal(fields)
        await Promise.all([reloadLibrary(), reloadAll()])
    }

    async function handleSave(id: string, fields: MealInput) {
        const updated = await updateMeal(id, fields)
        // Keep an open view drawer in sync with the saved data.
        setDrawer((d) => (d && d.mode === 'view' && d.meal._id === id ? { mode: 'view', meal: updated } : d))
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
                    <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Nutrition</h1>
                    <p className="mt-1 text-sm text-neutral-500">{SUBTITLE[tab]}</p>
                </header>

                <div className={tab === 'Weekly Planner' ? '' : 'mb-8'}>
                    <Tabs tabs={[...TOP_TABS]} value={tab} onChange={(t) => setTab(t as TopTab)} />
                </div>
            </Container>

            {tab === 'Weekly Planner' ? (
                <Container fluid className="mt-8">
                    <WeeklyPlanner
                        meals={allMeals}
                        mealsLoading={allLoading}
                        onViewMeal={(meal) => setDrawer({ mode: 'view', meal })}
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

function MacroPill({ label, value }: { label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-1.5 py-0.5">
            <span className="font-semibold text-neutral-400">{label}</span>
            <span className="font-semibold text-neutral-700">{fmt(value)}g</span>
        </span>
    )
}

// ─── View drawer ──────────────────────────────────────────────────────────────

function MealViewDrawer({
    meal,
    onClose,
    onEdit,
    onDelete,
}: {
    meal: Meal | null
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
            applyWeek(today, meal)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [meal])

    const m = view
    const factor = m && m.servings ? servings / m.servings : 1

    async function applyWeek(date: string, forMeal: Meal | null = m) {
        setWeekDate(date)
        setWeekMsg(null)
        if (!date || !forMeal) return
        const start = mondayOf(date)
        try {
            const entries = await listPlanEntries(start, addDays(start, 6))
            const count = entries.filter((e) => e.meal?._id === forMeal._id).length
            setServings(count)
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

const ZERO_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 }

/** Tally the per-serving macros of every planned meal (one serving each). */
function sumMacros(entries: MealPlanEntry[]): Macros {
    return entries.reduce<Macros>(
        (acc, e) => ({
            calories: acc.calories + (e.meal?.macros.calories ?? 0),
            protein: acc.protein + (e.meal?.macros.protein ?? 0),
            carbs: acc.carbs + (e.meal?.macros.carbs ?? 0),
            fat: acc.fat + (e.meal?.macros.fat ?? 0),
        }),
        { ...ZERO_MACROS }
    )
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
        const meal = entry.meal
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
}: {
    open: boolean
    onClose: () => void
    entries: MealPlanEntry[]
}) {
    // Distinct planned meals for the week, each with the servings the plan calls
    // for (one per entry), sorted by name.
    const planned = useMemo(() => {
        const map = new Map<string, { meal: Meal; count: number }>()
        for (const entry of entries) {
            const meal = entry.meal
            if (!meal) continue
            const existing = map.get(meal._id)
            if (existing) existing.count += 1
            else map.set(meal._id, { meal, count: 1 })
        }
        return [...map.values()].sort((a, b) => a.meal.name.localeCompare(b.meal.name))
    }, [entries])

    const [selectedId, setSelectedId] = useState<string | null>(null)
    // Return to the picker each time the drawer is (re)opened.
    useEffect(() => {
        if (open) setSelectedId(null)
    }, [open])

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
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
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

function WeeklyPlanner({
    meals,
    mealsLoading,
    onViewMeal,
}: {
    meals: Meal[]
    mealsLoading: boolean
    onViewMeal: (meal: Meal) => void
}) {
    const [weekStart, setWeekStart] = useState(() => mondayOf(todayKey()))
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [picker, setPicker] = useState<{ date: string; slot: MealType } | null>(null)
    const [showList, setShowList] = useState(false)
    const [showCooking, setShowCooking] = useState(false)
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

    // A pending destructive copy/paste awaiting confirmation in the shared modal.
    const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null)

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
    const weekCopied = copiedWeek === weekStart

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
                    <WeekTotals macros={weekMacros} />
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    {days.map((date) => (
                        <DayColumn
                            key={date}
                            date={date}
                            isToday={date === today}
                            editable={editing}
                            entries={entries.filter((e) => e.date === date)}
                            onAdd={(slot) => setPicker({ date, slot })}
                            onRemove={handleRemove}
                            onCopyDay={() => handleCopyDay(date)}
                            onViewMeal={onViewMeal}
                        />
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
            />

            <ConfirmModal
                open={!!confirm}
                title="Replace planned meals?"
                message={confirm?.message}
                confirmLabel="Replace"
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
function WeekTotals({ macros }: { macros: Macros }) {
    return (
        <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white px-4 py-2.5">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Week total
                </p>
                <p className="text-lg font-bold tabular-nums text-neutral-900">
                    {fmt(macros.calories)}
                    <span className="ml-0.5 text-xs font-medium text-neutral-400">kcal</span>
                </p>
            </div>
            <div className="h-8 w-px bg-neutral-200" />
            <div className="flex gap-1.5 text-xs tabular-nums text-neutral-500">
                <MacroPill label="P" value={macros.protein} />
                <MacroPill label="C" value={macros.carbs} />
                <MacroPill label="F" value={macros.fat} />
            </div>
            <div className="hidden h-8 w-px bg-neutral-200 sm:block" />
            <div className="hidden sm:block">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                    Daily avg
                </p>
                <p className="text-sm font-semibold tabular-nums text-neutral-700">
                    {fmt(macros.calories / 7)} kcal
                </p>
            </div>
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
    onCopyDay,
    onViewMeal,
}: {
    date: string
    isToday: boolean
    editable: boolean
    entries: MealPlanEntry[]
    onAdd: (slot: MealType) => void
    onRemove: (id: string) => void
    onCopyDay: () => void
    onViewMeal: (meal: Meal) => void
}) {
    const { year, month, day } = parseDateKey(date)
    const weekday = WEEKDAYS_LONG[new Date(year, month, day).getDay()]
    const macros = sumMacros(entries)

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
                        <button
                            type="button"
                            aria-label={`Copy ${weekday} to the next day`}
                            title="Copy to next day"
                            onClick={onCopyDay}
                            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                        >
                            <i className="fa-solid fa-copy text-[11px]" aria-hidden="true" />
                        </button>
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
                        onViewMeal={onViewMeal}
                    />
                ))}
            </div>

            <div className="mt-auto flex flex-col gap-1.5 border-t border-neutral-100 pt-3">
                <div className="flex items-baseline gap-1">
                    <span className="text-base font-bold tabular-nums text-neutral-900">
                        {fmt(macros.calories)}
                    </span>
                    <span className="text-[10px] text-neutral-400">kcal</span>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px] tabular-nums text-neutral-500">
                    <MacroPill label="P" value={macros.protein} />
                    <MacroPill label="C" value={macros.carbs} />
                    <MacroPill label="F" value={macros.fat} />
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
    onViewMeal,
}: {
    slot: MealType
    editable: boolean
    entries: MealPlanEntry[]
    onAdd: () => void
    onRemove: (id: string) => void
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
                            onView={() => onViewMeal(e.meal)}
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

function PlannedMealRow({
    entry,
    onView,
    onRemove,
}: {
    entry: MealPlanEntry
    onView?: () => void
    onRemove?: () => void
}) {
    const m = entry.meal
    const meta = TYPE_META[entry.slot]
    const details = (
        <>
            <p className={`truncate text-[13px] font-semibold ${meta.name}`}>{m.name}</p>
            <p className={`text-[11px] tabular-nums ${meta.sub}`}>
                {fmt(m.macros.calories)} kcal · P{fmt(m.macros.protein)} C{fmt(m.macros.carbs)} F
                {fmt(m.macros.fat)}
            </p>
        </>
    )
    return (
        <li
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 transition-colors ${meta.block}`}
        >
            {onView ? (
                <button
                    type="button"
                    onClick={onView}
                    aria-label={`View ${m.name}`}
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
                    aria-label={`Remove ${m.name}`}
                    onClick={onRemove}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-neutral-400 transition-colors hover:bg-white/60 hover:text-red-600"
                >
                    <i className="fa-solid fa-xmark text-[11px]" aria-hidden="true" />
                </button>
            )}
        </li>
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
}: {
    target: { date: string; slot: MealType } | null
    meals: Meal[]
    entries: MealPlanEntry[]
    onClose: () => void
    onAdd: (date: string, slot: MealType, mealId: string) => Promise<void>
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
