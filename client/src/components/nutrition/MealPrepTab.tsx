import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../Button'
import Spinner from '../Spinner'
import EmptyState from '../EmptyState'
import PillToggle from '../PillToggle'
import DropdownMenu from '../DropdownMenu'
import ConfirmModal from '../ConfirmModal'
import { useToast } from '../../context/ToastContext'
import { listPlanEntries } from '../../services/mealPlan'
import { archiveFood, archiveRecipe, deleteContainer, duplicateRecipe, updateRecipe } from '../../services/mealPrep'
import { addDays, todayKey } from '../../lib/calendar'
import { batchDate, grams as fmtGrams, recipeSummary } from '../../lib/mealPrep'
import { forecastStock, plannedByBatch, HISTORY_DAYS, HORIZON_DAYS, type FoodForecast } from '../../lib/mealPrepForecast'
import type { Food, FoodBatch, MealPlanEntry, PrepCategory, PrepRecipe } from '../../types'
import { useMealPrep, type MealPrepData } from './mealprep/useMealPrep'
import BuffetMealModal, { type BuffetTarget } from './mealprep/BuffetMealModal'
import RecipeFormDrawer, { type RecipeForm } from './mealprep/RecipeFormDrawer'
import CookBatchDrawer from './mealprep/CookBatchDrawer'
import BatchAdjustModal from './mealprep/BatchAdjustModal'
import FoodFormModal from './mealprep/FoodFormModal'
import { CategoryChip, EstimateBadge, MacroLine } from './mealprep/ui'

/**
 * Meal prep: what's cooked and waiting, the trays and sides you make, and the
 * labels they're costed from.
 *
 * This is the place for the detailed work — recipes, cooking, weighing trays,
 * correcting stock. Eating happens in two taps from the planner or Today.
 */

type View = 'Available food' | 'Tray & Sides' | 'Foods'
type CategoryFilter = 'all' | PrepCategory

const SEVERITY_STYLE: Record<FoodForecast['severity'], string> = {
    short: 'border-red-100 bg-red-50/60',
    low: 'border-amber-100 bg-amber-50/60',
    ok: 'border-neutral-100 bg-white',
}

/** The stock notices — shared with the Today tab, which shows only problems. */
export function StockNotices({
    forecasts,
    onCook,
    limit,
}: {
    forecasts: FoodForecast[]
    onCook?: (recipe: PrepRecipe) => void
    limit?: number
}) {
    const problems = forecasts.filter((f) => f.severity !== 'ok').slice(0, limit)
    if (problems.length === 0) return null
    return (
        <div className="flex flex-col gap-2">
            {problems.map((f) => (
                <div key={f.key} className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 ${SEVERITY_STYLE[f.severity]}`}>
                    <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
                            <i
                                className={`fa-solid ${f.severity === 'short' ? 'fa-triangle-exclamation text-red-500' : 'fa-circle-exclamation text-amber-500'} text-xs`}
                                aria-hidden="true"
                            />
                            {f.name}
                        </p>
                        <ul className="mt-1 flex flex-col gap-0.5 text-xs text-neutral-600">
                            {f.messages.map((m) => (
                                <li key={m}>{m}</li>
                            ))}
                        </ul>
                    </div>
                    {onCook && f.recipe && !f.thawInstead && (
                        <Button size="sm" variant="secondary" icon="fa-solid fa-fire-burner" onClick={() => onCook(f.recipe!)}>
                            Cook batch
                        </Button>
                    )}
                </div>
            ))}
        </div>
    )
}

/** Plan entries around today: history for pace and portions, the week ahead for demand. */
export function usePrepWindow() {
    const today = todayKey()
    const [entries, setEntries] = useState<MealPlanEntry[]>([])
    const reload = useCallback(
        () =>
            listPlanEntries(addDays(today, -HISTORY_DAYS), addDays(today, HORIZON_DAYS))
                .then(setEntries)
                .catch(() => {}),
        [today]
    )
    useEffect(() => {
        void reload()
    }, [reload])
    return { entries, setEntries, reload, today }
}

export function useForecast(prep: MealPrepData, entries: MealPlanEntry[], today: string) {
    return useMemo(
        () => forecastStock({ recipes: prep.recipes, batches: prep.batches, entries, today }),
        [prep.recipes, prep.batches, entries, today]
    )
}

export default function MealPrepTab() {
    const toast = useToast()
    const prep = useMealPrep()
    const { entries, reload: reloadEntries, today } = usePrepWindow()
    const forecasts = useForecast(prep, entries, today)
    const plannedPerBatch = useMemo(() => plannedByBatch(entries, today), [entries, today])

    const [view, setView] = useState<View>('Available food')
    const [filter, setFilter] = useState<CategoryFilter>('all')
    const [recipeForm, setRecipeForm] = useState<RecipeForm | null>(null)
    const [cooking, setCooking] = useState<PrepRecipe | null>(null)
    const [adjusting, setAdjusting] = useState<FoodBatch | null>(null)
    const [buffet, setBuffet] = useState<BuffetTarget | null>(null)
    const [foodForm, setFoodForm] = useState<{ food: Food | null } | null>(null)
    const [confirmArchive, setConfirmArchive] = useState<PrepRecipe | null>(null)

    const recipes = useMemo(
        () => prep.recipes.filter((r) => filter === 'all' || r.category === filter),
        [prep.recipes, filter]
    )

    async function duplicate(r: PrepRecipe) {
        const copy = await duplicateRecipe(r._id)
        await prep.reload()
        setRecipeForm({ mode: 'edit', recipe: copy })
    }

    async function toggleFavourite(r: PrepRecipe) {
        await updateRecipe(r._id, { favourite: !r.favourite })
        await prep.reload()
    }

    if (prep.loading) {
        return (
            <div className="grid place-items-center py-16">
                <Spinner />
            </div>
        )
    }

    const newRecipeMenu = (
        <DropdownMenu
            trigger={
                <Button icon="fa-solid fa-plus" iconPosition="left">
                    New recipe
                </Button>
            }
            items={[
                { label: 'Blank recipe', icon: 'fa-solid fa-file', onClick: () => setRecipeForm({ mode: 'create' }) },
                {
                    label: 'Chicken tray (1 kg template)',
                    icon: 'fa-solid fa-drumstick-bite',
                    onClick: () => setRecipeForm({ mode: 'create', template: 'chicken' }),
                },
            ]}
        />
    )

    return (
        <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <PillToggle
                    label="Meal prep view"
                    options={(['Available food', 'Tray & Sides', 'Foods'] as const).map((v) => ({ value: v, label: v }))}
                    value={view}
                    onChange={setView}
                />
                <div className="flex flex-wrap gap-2">
                    {view === 'Available food' && prep.batches.length > 0 && (
                        <Button icon="fa-solid fa-scale-balanced" onClick={() => setBuffet({ mode: 'log', date: today })}>
                            Log a plate
                        </Button>
                    )}
                    {view === 'Tray & Sides' && newRecipeMenu}
                    {view === 'Foods' && (
                        <Button icon="fa-solid fa-plus" onClick={() => setFoodForm({ food: null })}>
                            New food
                        </Button>
                    )}
                </div>
            </div>

            {view === 'Available food' && (
                <>
                    <StockNotices forecasts={forecasts} onCook={setCooking} />
                    {prep.batches.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-box-open"
                            title="Nothing cooked and waiting"
                            description={
                                prep.recipes.length
                                    ? 'Cook a batch from the Tray & Sides library, weigh it, and it appears here ready to log.'
                                    : 'Start by adding a tray or side to the library — the chicken-tray template takes a minute.'
                            }
                            action={
                                prep.recipes.length ? (
                                    <Button onClick={() => setView('Tray & Sides')}>Open the library</Button>
                                ) : (
                                    newRecipeMenu
                                )
                            }
                        />
                    ) : (
                        <div className="flex flex-col gap-6">
                            {forecasts
                                .filter((f) => f.batches.length > 0)
                                .map((f) => (
                                    <FoodGroup
                                        key={f.key}
                                        forecast={f}
                                        plannedPerBatch={plannedPerBatch}
                                        onLog={(b) =>
                                            setBuffet({
                                                mode: 'log',
                                                date: today,
                                                preset: [{ role: b.category, choice: `batch:${b._id}` }],
                                            })
                                        }
                                        onAdjust={setAdjusting}
                                        onCook={f.recipe ? () => setCooking(f.recipe) : undefined}
                                    />
                                ))}
                        </div>
                    )}
                </>
            )}

            {view === 'Tray & Sides' && (
                <>
                    <PillToggle
                        label="Category"
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'main', label: 'Mains / trays' },
                            { value: 'side', label: 'Sides' },
                            { value: 'extra', label: 'Extras' },
                        ]}
                        value={filter}
                        onChange={setFilter}
                    />
                    {recipes.length === 0 ? (
                        <EmptyState
                            icon="fa-solid fa-book-open"
                            title="No recipes here yet"
                            description="A recipe is what usually goes in the tray. Cook it to create a batch you can weigh portions from."
                            action={newRecipeMenu}
                        />
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {recipes.map((r) => (
                                <RecipeCard
                                    key={r._id}
                                    recipe={r}
                                    batches={prep.batches.filter((b) => b.recipe === r._id)}
                                    onCook={() => setCooking(r)}
                                    onEdit={() => setRecipeForm({ mode: 'edit', recipe: r })}
                                    onDuplicate={() => void duplicate(r)}
                                    onArchive={() => setConfirmArchive(r)}
                                    onFavourite={() => void toggleFavourite(r)}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            {view === 'Foods' && (
                <FoodsView
                    prep={prep}
                    onEdit={(food) => setFoodForm({ food })}
                    onArchive={async (food) => {
                        await archiveFood(food._id)
                        await prep.reload()
                    }}
                    onDeleteContainer={async (id) => {
                        await deleteContainer(id)
                        await prep.reload()
                    }}
                />
            )}

            <RecipeFormDrawer
                form={recipeForm}
                onClose={() => setRecipeForm(null)}
                onSaved={() => void prep.reload()}
                foods={prep.foods}
                onFoodSaved={() => void prep.reload()}
            />
            <CookBatchDrawer
                recipe={cooking}
                onClose={() => setCooking(null)}
                prep={prep}
                onCooked={(b) => {
                    prep.putBatch(b)
                    void prep.reload()
                    setView('Available food')
                    toast.show(`${b.name}: ${fmtGrams(b.cookedGrams)} added to the ${b.storage}`, 'success')
                }}
            />
            <BatchAdjustModal
                batch={adjusting}
                onClose={() => setAdjusting(null)}
                onSaved={(b) => {
                    prep.putBatch(b)
                    setAdjusting((cur) => (cur && cur._id === b._id && b.status === 'active' ? b : cur))
                }}
            />
            <BuffetMealModal
                target={buffet}
                onClose={() => setBuffet(null)}
                onSaved={() => void reloadEntries()}
                prep={prep}
                history={entries}
            />
            <FoodFormModal
                open={!!foodForm}
                food={foodForm?.food ?? null}
                onClose={() => setFoodForm(null)}
                onSaved={() => void prep.reload()}
            />
            <ConfirmModal
                open={!!confirmArchive}
                title="Archive this recipe?"
                message="It leaves the library. Batches already cooked from it, and meals logged from them, are kept."
                confirmLabel="Archive"
                danger
                onConfirm={async () => {
                    if (confirmArchive) await archiveRecipe(confirmArchive._id)
                    await prep.reload()
                }}
                onClose={() => setConfirmArchive(null)}
            />
        </div>
    )
}

// ── Available food ───────────────────────────────────────────────────────────

function FoodGroup({
    forecast: f,
    plannedPerBatch,
    onLog,
    onAdjust,
    onCook,
}: {
    forecast: FoodForecast
    plannedPerBatch: Map<string, number>
    onLog: (b: FoodBatch) => void
    onAdjust: (b: FoodBatch) => void
    onCook?: () => void
}) {
    const portionNote = f.portion.source === 'default' ? 'default portion' : f.portion.source === 'recent' ? 'your recent portion' : 'your portion'
    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-neutral-900">
                        {f.name} <CategoryChip category={f.category} />
                    </h3>
                    <p className="text-xs tabular-nums text-neutral-500">
                        {fmtGrams(f.readyGrams)} ready · ~{f.readyPortions.toFixed(1)} × {fmtGrams(f.portion.grams)} ({portionNote})
                        {f.frozenGrams > 0 && ` · ${fmtGrams(f.frozenGrams)} frozen`}
                        {f.plannedGrams > 0 && ` · ${fmtGrams(f.plannedGrams)} planned → ${f.afterPlanGrams >= 0 ? `${fmtGrams(f.afterPlanGrams)} left after` : `${fmtGrams(-f.afterPlanGrams)} short`}`}
                    </p>
                </div>
                {onCook && (
                    <Button size="sm" variant="ghost" icon="fa-solid fa-fire-burner" onClick={onCook}>
                        Cook more
                    </Button>
                )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {f.batches.map((b) => (
                    <BatchCard key={b._id} batch={b} portion={f.portion.grams} planned={plannedPerBatch.get(b._id) ?? 0} severity={f.severity} onLog={() => onLog(b)} onAdjust={() => onAdjust(b)} />
                ))}
            </div>
        </section>
    )
}

function BatchCard({
    batch: b,
    portion,
    planned,
    severity,
    onLog,
    onAdjust,
}: {
    batch: FoodBatch
    portion: number
    planned: number
    severity: FoodForecast['severity']
    onLog: () => void
    onAdjust: () => void
}) {
    const pct = b.cookedGrams > 0 ? Math.min(100, (b.remainingGrams / b.cookedGrams) * 100) : 0
    const frozen = b.storage === 'freezer'
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{b.label || `Cooked ${batchDate(b.cookedDate)}`}</p>
                    <p className="text-[11px] text-neutral-400">
                        {b.label ? `Cooked ${batchDate(b.cookedDate)}` : ''}
                        {b.thawedDate ? `${b.label ? ' · ' : ''}Thawed ${batchDate(b.thawedDate)}` : ''}
                        {b.useBy ? ` · Use by ${batchDate(b.useBy)} (your date)` : ''}
                    </p>
                </div>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${frozen ? 'bg-sky-50 text-sky-700' : 'bg-neutral-100 text-neutral-600'}`}
                >
                    <i className={`fa-solid ${frozen ? 'fa-snowflake' : 'fa-temperature-low'} mr-1`} aria-hidden="true" />
                    {frozen ? 'Freezer' : 'Fridge'}
                </span>
            </div>

            <div>
                <p className="text-xl font-bold tabular-nums tracking-tight text-neutral-900">
                    {fmtGrams(b.remainingGrams)}
                    <span className="ml-1.5 text-xs font-medium text-neutral-400">
                        of {fmtGrams(b.cookedGrams)} · ~{(b.remainingGrams / portion).toFixed(1)} portions
                    </span>
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                        className={`h-full rounded-full ${severity === 'short' ? 'bg-red-400' : severity === 'low' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                {planned > 0 && (
                    <p className="mt-1 text-[11px] tabular-nums text-neutral-500">
                        {fmtGrams(planned)} planned from this batch
                        {planned > b.remainingGrams && <span className="font-semibold text-red-500"> — {fmtGrams(planned - b.remainingGrams)} short</span>}
                    </p>
                )}
            </div>

            <p className="text-[11px] text-neutral-500">
                <MacroLine macros={b.per100} /> per 100 g
            </p>

            <div className="mt-auto flex gap-2 border-t border-neutral-100 pt-3">
                <Button size="sm" onClick={onLog} disabled={b.remainingGrams <= 0} icon="fa-solid fa-scale-balanced">
                    Log portion
                </Button>
                <Button size="sm" variant="secondary" onClick={onAdjust}>
                    Adjust stock
                </Button>
            </div>
        </div>
    )
}

// ── Library ──────────────────────────────────────────────────────────────────

function RecipeCard({
    recipe,
    batches,
    onCook,
    onEdit,
    onDuplicate,
    onArchive,
    onFavourite,
}: {
    recipe: PrepRecipe
    batches: FoodBatch[]
    onCook: () => void
    onEdit: () => void
    onDuplicate: () => void
    onArchive: () => void
    onFavourite: () => void
}) {
    const summary = recipeSummary(recipe)
    const stock = batches.reduce((s, b) => s + b.remainingGrams, 0)
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-neutral-100 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-neutral-900">{recipe.name}</p>
                    <div className="mt-1 flex items-center gap-1.5">
                        <CategoryChip category={recipe.category} />
                        <span className="text-[11px] text-neutral-400">
                            {recipe.ingredients.length} ingredient{recipe.ingredients.length === 1 ? '' : 's'}
                            {recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ''}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        aria-label={recipe.favourite ? 'Remove from favourites' : 'Add to favourites'}
                        onClick={onFavourite}
                        className={`grid h-7 w-7 place-items-center rounded-full hover:bg-neutral-100 ${recipe.favourite ? 'text-amber-500' : 'text-neutral-300'}`}
                    >
                        <i className={`${recipe.favourite ? 'fa-solid' : 'fa-regular'} fa-star text-xs`} aria-hidden="true" />
                    </button>
                    <DropdownMenu
                        trigger={
                            <button type="button" aria-label="Recipe actions" className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100">
                                <i className="fa-solid fa-ellipsis text-xs" aria-hidden="true" />
                            </button>
                        }
                        items={[
                            { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                            { label: 'Duplicate', icon: 'fa-solid fa-copy', onClick: onDuplicate },
                            { label: 'Archive', icon: 'fa-solid fa-box-archive', onClick: onArchive, danger: true },
                        ]}
                    />
                </div>
            </div>

            <div className="text-xs text-neutral-500">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Whole recipe</p>
                <MacroLine macros={summary.totals} className="font-semibold text-neutral-800" />
                {summary.per100 && summary.yield && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                        <MacroLine macros={summary.per100} /> /100 g
                        <EstimateBadge
                            title={
                                summary.yield.kind === 'measured'
                                    ? `At the last measured yield of ${fmtGrams(summary.yield.grams)}`
                                    : `At your estimated yield of ${fmtGrams(summary.yield.grams)}`
                            }
                        />
                    </p>
                )}
                {summary.problems.length > 0 && <p className="mt-1 text-red-500">{summary.problems.length} ingredient(s) can’t be costed</p>}
            </div>

            <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
                <span className="text-[11px] tabular-nums text-neutral-400">{stock > 0 ? `${fmtGrams(stock)} in stock` : 'None in stock'}</span>
                <Button size="sm" icon="fa-solid fa-fire-burner" onClick={onCook}>
                    Cook batch
                </Button>
            </div>
        </div>
    )
}

// ── Foods ────────────────────────────────────────────────────────────────────

function FoodsView({
    prep,
    onEdit,
    onArchive,
    onDeleteContainer,
}: {
    prep: MealPrepData
    onEdit: (food: Food) => void
    onArchive: (food: Food) => void
    onDeleteContainer: (id: string) => void
}) {
    return (
        <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-2">
                <p className="text-xs text-neutral-500">
                    Saved labels, per 100 g or 100 ml — ingredients for recipes, or ready-to-eat sides you can weigh onto a
                    plate without cooking anything.
                </p>
                {prep.foods.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                        No saved foods yet. Add one here, or use “Save as a food” on a recipe ingredient.
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-100 bg-white">
                        {prep.foods.map((f) => (
                            <li key={f._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-neutral-800">
                                        {f.name}
                                        {f.brand && <span className="ml-1.5 font-normal text-neutral-400">{f.brand}</span>}
                                    </p>
                                    <p className="text-[11px] text-neutral-500">
                                        <MacroLine macros={f.per100} /> per 100 {f.basis}
                                        {f.density ? ` · ${f.density} g/ml` : ''}
                                        {f.unitGrams ? ` · ${f.unitGrams} g each` : ''}
                                    </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button size="sm" variant="ghost" onClick={() => onEdit(f)}>
                                        Edit
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => onArchive(f)}>
                                        Archive
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="flex flex-col gap-2">
                <h3 className="text-sm font-bold text-neutral-900">Containers</h3>
                <p className="text-xs text-neutral-500">
                    Empty weights, so a tray can be weighed in its tin. Add one from the cook form when you first use it.
                </p>
                {prep.containers.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                        {prep.containers.map((c) => (
                            <li key={c._id} className="flex items-center gap-2 rounded-full bg-neutral-100 py-1 pl-3 pr-1 text-xs text-neutral-700">
                                {c.name} · {c.grams} g
                                <button
                                    type="button"
                                    aria-label={`Delete ${c.name}`}
                                    onClick={() => onDeleteContainer(c._id)}
                                    className="grid h-5 w-5 place-items-center rounded-full text-neutral-400 hover:bg-white hover:text-red-500"
                                >
                                    <i className="fa-solid fa-xmark text-[10px]" aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    )
}
