import { useEffect, useMemo, useState } from 'react'
import { Card } from '../Card'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import LibraryToolbar from '../LibraryToolbar'
import Textarea from '../Textarea'
import Select from '../Select'
import EmptyState from '../EmptyState'
import Pagination from '../Pagination'
import PillToggle from '../PillToggle'
import DropdownMenu from '../DropdownMenu'
import LineIcon from '../LineIcon'
import ConfirmModal from '../ConfirmModal'
import JsonImportPanel from '../JsonImportPanel'
import { StatStrip, NoteBlock } from '../session/SessionUI'
import { FIELD_LABEL } from '../fieldStyles'
import { CATEGORY, MacroBar, MacroLegend, caloriesFromMacros, isHighProtein } from './mealUi'
import { fmt, kcal } from './format'
import { ShopButton, type ShopKind } from './ShoppingList'
import { ingredientAmount } from '../../lib/shopping'
import { createMeal, deleteAllMeals, deleteMeal, importMeals, updateMeal } from '../../services/meals'
import { MEAL_TYPES, type Macros, type Meal, type MealIngredient, type MealInput, type MealType } from '../../types'

type Filter = MealType | 'all'
type Sort = 'library' | 'protein' | 'lightest' | 'name'

const SORTS: { value: Sort; label: string }[] = [
    { value: 'library', label: 'Library order' },
    { value: 'protein', label: 'Most protein' },
    { value: 'lightest', label: 'Lightest' },
    { value: 'name', label: 'A–Z' },
]

function sortMeals(list: Meal[], sort: Sort): Meal[] {
    const out = [...list]
    if (sort === 'protein') out.sort((a, b) => b.macros.protein - a.macros.protein)
    else if (sort === 'lightest') out.sort((a, b) => a.macros.calories - b.macros.calories)
    else if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name))
    return out
}

const PAGE_SIZE = 9

/** Drawer state: viewing a meal, adding a new one, or editing an existing one. */
type Drawered =
    | { mode: 'view'; meal: Meal }
    | { mode: 'create'; type: MealType | null }
    | { mode: 'edit'; meal: Meal }
    | null

/**
 * The meal library, laid out like the Fitness libraries: search and actions
 * above a paged grid of cards. A card opens the meal; its menu edits,
 * duplicates or deletes it.
 */
export default function MealLibrary({
    meals,
    onChanged,
    onShop,
}: {
    meals: Meal[]
    onChanged: () => Promise<void>
    onShop: (kind: ShopKind, id: string, name: string) => void
}) {
    const [drawer, setDrawer] = useState<Drawered>(null)
    const [importing, setImporting] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [deleting, setDeleting] = useState<Meal | null>(null)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [sort, setSort] = useState<Sort>('library')
    const [page, setPage] = useState(1)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        return sortMeals(
            meals.filter(
                (m) =>
                    (filter === 'all' || m.types.includes(filter)) &&
                    (!q || m.name.toLowerCase().includes(q) || (m.notes ?? '').toLowerCase().includes(q))
            ),
            sort
        )
    }, [meals, search, filter, sort])

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    // A new search or a shrinking list can leave `page` past the end — pull it back.
    useEffect(() => {
        if (page > pageCount) setPage(pageCount)
    }, [page, pageCount])
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    const count = (t: MealType) => meals.filter((m) => m.types.includes(t)).length

    async function handleAdd(fields: MealInput) {
        await createMeal(fields)
        await onChanged()
    }

    async function handleSave(id: string, fields: MealInput) {
        const updated = await updateMeal(id, fields)
        setDrawer((d) => (d?.mode === 'view' && d.meal._id === id ? { mode: 'view', meal: updated } : d))
        await onChanged()
    }

    async function handleDuplicate(meal: Meal) {
        await createMeal({
            name: `${meal.name} (copy)`,
            types: meal.types,
            macros: meal.macros,
            ingredients: meal.ingredients,
            notes: meal.notes,
        })
        await onChanged()
    }

    async function handleDelete(meal: Meal) {
        setDrawer((d) => (d && d.mode !== 'create' && d.meal._id === meal._id ? null : d))
        await deleteMeal(meal._id)
        await onChanged()
    }

    if (importing) {
        return (
            <JsonImportPanel
                heading="Import meals"
                description="Copy the template, fill it in with your meals (or ask an AI to), then paste the JSON below to add them all to your library at once."
                template={MEAL_TEMPLATE}
                notes={<ImportNotes />}
                itemNoun="meal"
                onBack={() => setImporting(false)}
                doImport={importMeals}
                resource="meals"
                existingItems={meals}
                onLibraryChanged={() => void onChanged()}
                onImported={async () => {
                    await onChanged()
                    setImporting(false)
                }}
            />
        )
    }

    const newMeal = () => setDrawer({ mode: 'create', type: filter === 'all' ? null : filter })

    return (
        <>
            <LibraryToolbar
                search={search}
                onSearch={(v) => {
                    setSearch(v)
                    setPage(1)
                }}
                placeholder="Search meals…"
                count={meals.length ? filtered.length : undefined}
                noun="meal"
                onImport={() => setImporting(true)}
                newLabel="New meal"
                onNew={newMeal}
                menu={
                    meals.length > 0 && (
                        <DropdownMenu
                            align="right"
                            trigger={
                                <span
                                    aria-label="More library actions"
                                    className="grid h-10 w-10 place-items-center rounded-xl text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <LineIcon name="more" className="h-4 w-4" />
                                </span>
                            }
                            items={[
                                {
                                    label: 'Delete all meals',
                                    icon: 'fa-solid fa-trash-can',
                                    danger: true,
                                    onClick: () => setClearing(true),
                                },
                            ]}
                        />
                    )
                }
            >
                {meals.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <PillToggle
                            label="Meal of the day"
                            value={filter}
                            onChange={(v) => {
                                setFilter(v)
                                setPage(1)
                            }}
                            options={[
                                { value: 'all' as Filter, label: `All ${meals.length}` },
                                ...MEAL_TYPES.map((t) => ({ value: t as Filter, label: `${CATEGORY[t].label} ${count(t)}` })),
                            ]}
                        />
                        <Select
                            value={sort}
                            onChange={(v) => setSort(v as Sort)}
                            options={SORTS}
                            className="w-full sm:w-44"
                        />
                    </div>
                )}
            </LibraryToolbar>

            <div className="mt-6">
                {meals.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-bowl-food"
                        title="No meals yet"
                        description="Add the meals you eat — a name and its macros is all it takes."
                        action={
                            <Button icon="fa-solid fa-plus" onClick={newMeal}>
                                New meal
                            </Button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyState
                        icon="fa-solid fa-magnifying-glass"
                        title="No matches"
                        description={
                            search.trim()
                                ? `No meals match “${search.trim()}”.`
                                : `No ${filter === 'all' ? '' : CATEGORY[filter].label.toLowerCase()} meals yet.`
                        }
                    />
                ) : (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {pageItems.map((meal) => (
                                <MealCard
                                    key={meal._id}
                                    meal={meal}
                                    onOpen={() => setDrawer({ mode: 'view', meal })}
                                    onEdit={() => setDrawer({ mode: 'edit', meal })}
                                    onDuplicate={() => void handleDuplicate(meal)}
                                    onDelete={() => setDeleting(meal)}
                                    onShop={() => onShop('meal', meal._id, meal.name)}
                                />
                            ))}
                        </div>
                        <Pagination page={page} pageCount={pageCount} onChange={setPage} className="mt-6 justify-center" />
                    </>
                )}
            </div>

            <MealViewDrawer
                meal={drawer?.mode === 'view' ? drawer.meal : null}
                onClose={() => setDrawer(null)}
                onEdit={(meal) => setDrawer({ mode: 'edit', meal })}
                onDuplicate={async (meal) => {
                    await handleDuplicate(meal)
                    setDrawer(null)
                }}
                onDelete={setDeleting}
            />

            <MealFormDrawer
                form={drawer?.mode === 'create' || drawer?.mode === 'edit' ? drawer : null}
                onClose={() => setDrawer(null)}
                onAdd={handleAdd}
                onSave={handleSave}
            />

            <ConfirmModal
                open={!!deleting}
                title="Delete this meal?"
                message={
                    <>
                        Delete <span className="font-semibold">{deleting?.name}</span>? It comes off any days
                        where it’s only planned. Days you’ve already eaten it keep it.
                    </>
                }
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    if (deleting) void handleDelete(deleting)
                    setDeleting(null)
                }}
                onClose={() => setDeleting(null)}
            />

            <ConfirmModal
                open={clearing}
                title={`Delete all ${meals.length} meals?`}
                message="This empties your whole library and can't be undone. Meals only planned on days come off too; days you've already eaten them keep them."
                confirmLabel="Delete everything"
                danger
                onConfirm={() => void deleteAllMeals().finally(onChanged)}
                onClose={() => setClearing(false)}
            />
        </>
    )
}

// ─── Meal card ──────────────────────────────────────────────────────────────────

/** A meal-of-the-day chip in its own colour. */
function TypeChip({ type }: { type: MealType }) {
    const c = CATEGORY[type]
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.tile} ${c.text}`}>
            <i className={`${c.icon} text-[10px]`} aria-hidden="true" />
            {c.label}
        </span>
    )
}

function MealCard({
    meal,
    onOpen,
    onEdit,
    onDuplicate,
    onDelete,
    onShop,
}: {
    meal: Meal
    onOpen: () => void
    onEdit: () => void
    onDuplicate: () => void
    onDelete: () => void
    onShop: () => void
}) {
    const { macros } = meal
    return (
        <Card as="div" className="relative flex flex-col gap-3">
            <button
                type="button"
                aria-label={`View ${meal.name}`}
                onClick={onOpen}
                className="absolute inset-0 z-10 rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500"
            />

            <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1 pr-1">
                    <p className="truncate font-semibold text-neutral-900">{meal.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                        {kcal(macros.calories)} kcal · {fmt(Math.round(macros.protein))} g protein
                    </p>
                </div>
                <ShopButton name={meal.name} onClick={onShop} />
                <DropdownMenu
                    align="right"
                    className="relative z-20 -mr-1 -mt-1 shrink-0"
                    trigger={
                        <span
                            aria-label="Meal actions"
                            className="grid h-8 w-8 place-items-center rounded-[10px] text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                        >
                            <LineIcon name="more" className="h-4 w-4" />
                        </span>
                    }
                    items={[
                        { label: 'Edit', icon: 'fa-solid fa-pen', onClick: onEdit },
                        { label: 'Duplicate', icon: 'fa-regular fa-copy', onClick: onDuplicate },
                        { label: 'Delete', icon: 'fa-solid fa-trash-can', danger: true, onClick: onDelete },
                    ]}
                />
            </div>

            {(meal.types.length > 0 || isHighProtein(macros)) && (
                <div className="flex flex-wrap gap-1.5">
                    {meal.types.map((t) => (
                        <TypeChip key={t} type={t} />
                    ))}
                    {isHighProtein(macros) && (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600">
                            High protein
                        </span>
                    )}
                </div>
            )}

            <div className="mt-auto flex flex-col gap-2 border-t border-neutral-100 pt-3">
                <MacroBar macros={macros} />
                <MacroLegend macros={macros} compact />
            </div>
        </Card>
    )
}

// ─── View drawer ────────────────────────────────────────────────────────────────

function MealViewDrawer({
    meal,
    onClose,
    onEdit,
    onDuplicate,
    onDelete,
}: {
    meal: Meal | null
    onClose: () => void
    onEdit: (meal: Meal) => void
    onDuplicate: (meal: Meal) => Promise<void>
    onDelete: (meal: Meal) => void
}) {
    // Retain the last meal while the drawer animates closed.
    const [view, setView] = useState<Meal | null>(meal)
    useEffect(() => {
        if (meal) setView(meal)
    }, [meal])

    const m = view
    return (
        <Drawer
            open={!!meal}
            onClose={onClose}
            size="xl"
            title={m?.name ?? 'Meal'}
            footer={
                m && (
                    <div className="flex w-full flex-wrap items-center justify-end gap-3">
                        <Button variant="ghost" icon="fa-solid fa-trash-can" className="mr-auto" onClick={() => onDelete(m)}>
                            Delete
                        </Button>
                        <Button variant="secondary" icon="fa-regular fa-copy" onClick={() => void onDuplicate(m)}>
                            Duplicate
                        </Button>
                        <Button icon="fa-solid fa-pen" onClick={() => onEdit(m)}>
                            Edit
                        </Button>
                    </div>
                )
            }
        >
            {m && <MealDetail meal={m} />}
        </Drawer>
    )
}

/** A meal's chips, numbers, macro split and notes. */
function MealDetail({ meal }: { meal: Pick<Meal, 'types' | 'macros' | 'ingredients' | 'notes'> }) {
    const ingredients = meal.ingredients ?? []
    const { macros } = meal
    return (
        <div className="flex flex-col gap-6">
            {meal.types.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {meal.types.map((t) => (
                        <TypeChip key={t} type={t} />
                    ))}
                </div>
            )}
            <StatStrip
                stats={[
                    { icon: 'fa-solid fa-fire', label: 'Calories', value: `${kcal(macros.calories)} kcal` },
                    { icon: 'fa-solid fa-drumstick-bite', label: 'Protein', value: `${fmt(macros.protein)} g` },
                    { icon: 'fa-solid fa-wheat-awn', label: 'Carbs', value: `${fmt(macros.carbs)} g` },
                    { icon: 'fa-solid fa-droplet', label: 'Fat', value: `${fmt(macros.fat)} g` },
                ]}
            />
            <div className="flex flex-col gap-2">
                <MacroBar macros={macros} thick />
                <MacroLegend macros={macros} />
            </div>
            {ingredients.length > 0 && (
                <section className="flex flex-col gap-3">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-600">
                        Ingredients · one serving
                    </p>
                    <ul className="divide-y divide-neutral-100 rounded-2xl border border-neutral-200">
                        {ingredients.map((i, n) => (
                            <li key={n} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                <span className="min-w-0 truncate text-neutral-800">{i.name}</span>
                                <span className="shrink-0 tabular-nums text-neutral-500">{ingredientAmount(i)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {meal.notes && (
                <NoteBlock icon="fa-regular fa-note-sticky" title="Notes">
                    {meal.notes}
                </NoteBlock>
            )}
        </div>
    )
}

// ─── Add / edit drawer ──────────────────────────────────────────────────────────

type FormState = { mode: 'create'; type: MealType | null } | { mode: 'edit'; meal: Meal }

const num = (v: string) => Math.max(0, Number(v) || 0)

type IngredientDraft = { name: string; grams: string; items: string }
const blankIngredient = (): IngredientDraft => ({ name: '', grams: '', items: '' })
const toDraft = (i: MealIngredient): IngredientDraft => ({
    name: i.name,
    grams: i.grams ? String(i.grams) : '',
    items: i.items ? String(i.items) : '',
})

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
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fat, setFat] = useState('')
    const [rows, setRows] = useState<IngredientDraft[]>([])
    const [notes, setNotes] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // Reset the fields whenever the drawer opens for a different meal.
    useEffect(() => {
        setName(editing?.name ?? '')
        setTypes(editing?.types ?? (view?.mode === 'create' && view.type ? [view.type] : []))
        setCalories(editing ? String(editing.macros.calories) : '')
        setProtein(editing ? String(editing.macros.protein) : '')
        setCarbs(editing ? String(editing.macros.carbs) : '')
        setFat(editing ? String(editing.macros.fat) : '')
        setRows(editing?.ingredients?.length ? editing.ingredients.map(toDraft) : [blankIngredient()])
        setNotes(editing?.notes ?? '')
        setSaving(false)
        setError('')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view])

    const macros: Macros = { calories: num(calories), protein: num(protein), carbs: num(carbs), fat: num(fat) }
    const implied = caloriesFromMacros(macros)
    // Offer the macro-derived figure when calories are blank or clearly off.
    const offerImplied =
        implied > 0 && (macros.calories === 0 || Math.abs(implied - macros.calories) > Math.max(25, macros.calories * 0.15))

    const ingredients: MealIngredient[] = rows
        .filter((r) => r.name.trim())
        .map((r) => ({ name: r.name.trim(), grams: num(r.grams), items: num(r.items) || undefined }))
    const valid = name.trim() !== ''

    function patchRow(i: number, patch: Partial<IngredientDraft>) {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    }

    function toggleType(t: MealType) {
        setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : MEAL_TYPES.filter((x) => x === t || prev.includes(x))))
    }

    async function submit() {
        if (!view || !valid) return
        const fields: MealInput = { name: name.trim(), types, macros, ingredients, notes: notes.trim() || undefined }
        setSaving(true)
        setError('')
        try {
            if (view.mode === 'create') await onAdd(fields)
            else await onSave(view.meal._id, fields)
            onClose()
        } catch {
            setError('Could not save — try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={view?.mode === 'edit' ? 'Edit meal' : 'New meal'}
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
                    label="Meal name *"
                    autoFocus
                    placeholder="e.g. Chicken, rice & veg"
                    value={name}
                    error={error || undefined}
                    onChange={(e) => setName(e.target.value)}
                />

                <div className="flex flex-col gap-1.5">
                    <p className={FIELD_LABEL}>Meal of the day</p>
                    <div className="flex flex-wrap gap-2">
                        {MEAL_TYPES.map((t) => {
                            const on = types.includes(t)
                            const c = CATEGORY[t]
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleType(t)}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                                        on ? `${c.tile} ${c.text} ring-1 ring-inset ${c.ring}` : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                                >
                                    <i className={`${c.icon} text-[11px]`} aria-hidden="true" />
                                    {c.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-3">
                        <Input label="Protein (g)" type="number" min={0} step="any" inputMode="decimal" placeholder="0" value={protein} onChange={(e) => setProtein(e.target.value)} />
                        <Input label="Carbs (g)" type="number" min={0} step="any" inputMode="decimal" placeholder="0" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
                        <Input label="Fat (g)" type="number" min={0} step="any" inputMode="decimal" placeholder="0" value={fat} onChange={(e) => setFat(e.target.value)} />
                        <Input label="Calories (kcal)" type="number" min={0} step="any" inputMode="decimal" placeholder="0" value={calories} onChange={(e) => setCalories(e.target.value)} />
                    </div>
                    {offerImplied && (
                        <button
                            type="button"
                            onClick={() => setCalories(String(implied))}
                            className="inline-flex items-center gap-1.5 self-start rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
                        >
                            <i className="fa-solid fa-wand-magic-sparkles text-[11px]" aria-hidden="true" />
                            Macros add up to {kcal(implied)} kcal — use that
                        </button>
                    )}
                    <div className="flex flex-col gap-2 rounded-2xl bg-neutral-50 px-3.5 py-3">
                        <MacroBar macros={macros} thick />
                        <MacroLegend macros={macros} compact />
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div>
                        <p className={FIELD_LABEL}>Ingredients for one serving</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                            Optional. With these, the shopping list buys the ingredients instead of the meal. Use
                            items for things you buy by count — 2 eggs, not 120 g.
                        </p>
                    </div>
                    {rows.map((r, i) => (
                        <div key={i} className="flex items-end gap-2">
                            <div className="min-w-0 flex-1">
                                <Input
                                    aria-label="Ingredient"
                                    placeholder="Ingredient, e.g. Chicken breast"
                                    value={r.name}
                                    onChange={(e) => patchRow(i, { name: e.target.value })}
                                />
                            </div>
                            <div className="w-20 shrink-0">
                                <Input
                                    aria-label="Grams"
                                    type="number"
                                    min={0}
                                    step="any"
                                    inputMode="decimal"
                                    placeholder="g"
                                    value={r.grams}
                                    onChange={(e) => patchRow(i, { grams: e.target.value })}
                                />
                            </div>
                            <div className="w-16 shrink-0">
                                <Input
                                    aria-label="Items"
                                    type="number"
                                    min={0}
                                    step="any"
                                    inputMode="decimal"
                                    placeholder="×"
                                    value={r.items}
                                    onChange={(e) => patchRow(i, { items: e.target.value })}
                                />
                            </div>
                            {rows.length > 1 && (
                                <button
                                    type="button"
                                    aria-label="Remove ingredient"
                                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                                    className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                >
                                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setRows((prev) => [...prev, blankIngredient()])}
                        className="inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] px-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                    >
                        <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                        Add ingredient
                    </button>
                </div>

                <Textarea
                    label="Notes"
                    rows={3}
                    placeholder="Portions, where it’s from, how to make it…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

// ─── Import ─────────────────────────────────────────────────────────────────────

const MEAL_TEMPLATE = JSON.stringify(
    [
        {
            name: 'Greek yoghurt, berries & granola',
            types: ['breakfast', 'snack'],
            macros: { calories: 380, protein: 28, carbs: 45, fat: 9 },
            ingredients: [
                { name: '0% Greek yoghurt', grams: 250 },
                { name: 'Mixed berries', grams: 80 },
                { name: 'Granola', grams: 30 },
            ],
        },
        {
            name: 'Chicken, rice & veg',
            types: ['lunch', 'dinner'],
            macros: { calories: 610, protein: 52, carbs: 70, fat: 12 },
            ingredients: [
                { name: 'Chicken breast', grams: 180 },
                { name: 'Basmati rice', grams: 75 },
                { name: 'Tenderstem broccoli', grams: 100 },
                { name: 'Olive oil', grams: 5 },
            ],
        },
        {
            name: 'Protein shake',
            types: ['snack'],
            macros: { calories: 160, protein: 30, carbs: 5, fat: 2 },
            ingredients: [{ name: 'Whey protein', grams: 35 }],
            notes: 'With water',
        },
        {
            name: 'Scrambled eggs on toast',
            types: ['breakfast'],
            macros: { calories: 420, protein: 24, carbs: 30, fat: 22 },
            ingredients: [
                { name: 'Eggs', items: 3 },
                { name: 'Sourdough', items: 1, grams: 50 },
            ],
        },
    ],
    null,
    2
)

function ImportNotes() {
    const f = (s: string) => <span className="font-semibold text-neutral-700">{s}</span>
    return (
        <>
            <p>{f('name')} is required. Everything else is optional.</p>
            <p>
                {f('types')} is a list of when you eat it:{' '}
                {MEAL_TYPES.map((t, i) => (
                    <span key={t}>
                        {i > 0 && ', '}
                        <code className="rounded bg-neutral-100 px-1">{t}</code>
                    </span>
                ))}
                . A meal can be more than one. Leave it out and it only turns up under “All” and in search, so it’s worth
                setting.
            </p>
            <p>
                {f('macros')} are per serving: {f('calories')} (kcal), {f('protein')}, {f('carbs')} and {f('fat')}{' '}
                (grams). Missing ones count as 0.
            </p>
            <p>
                {f('ingredients')} is what goes into one serving: a list of {f('name')} with {f('grams')} (raw weight,
                as bought) and/or {f('items')} — a count, for things you buy by number (3 eggs, not 180 g). With
                {' '}{f('items')} the shopping list buys the count; otherwise the grams. Add a meal to the shopping list and it buys these — merged with the same ingredient from your trays
                and other meals, so use the same names. Leave it out and the meal goes on the list as itself.
            </p>
            <p>{f('notes')} is free text — where it’s from, how to make it.</p>
            <p>A meal with the same name as one already in your library lets you choose to update it or keep both.</p>
        </>
    )
}
