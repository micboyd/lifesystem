import { useEffect, useMemo, useState } from 'react'
import { Card } from '../Card'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
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
import { createMeal, deleteAllMeals, deleteMeal, importMeals, updateMeal } from '../../services/meals'
import { MEAL_TYPES, type Macros, type Meal, type MealInput, type MealType } from '../../types'

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
export default function MealLibrary({ meals, onChanged }: { meals: Meal[]; onChanged: () => Promise<void> }) {
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
        await createMeal({ name: `${meal.name} (copy)`, types: meal.types, macros: meal.macros, notes: meal.notes })
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
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <Input
                        icon="fa-solid fa-magnifying-glass"
                        type="search"
                        placeholder="Search meals…"
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            setPage(1)
                        }}
                        className="w-full sm:w-64"
                    />
                    <div className="flex items-center gap-2">
                        <Button variant="secondary" icon="fa-solid fa-file-import" onClick={() => setImporting(true)}>
                            Import
                        </Button>
                        <Button icon="fa-solid fa-plus" onClick={newMeal}>
                            New meal
                        </Button>
                        {meals.length > 0 && (
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
                        )}
                    </div>
                </div>

                {meals.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2">
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
            </div>

            <div className="mt-4">
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
}: {
    meal: Meal
    onOpen: () => void
    onEdit: () => void
    onDuplicate: () => void
    onDelete: () => void
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

            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-neutral-900">{meal.name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-neutral-500">
                        {kcal(macros.calories)} kcal · {fmt(Math.round(macros.protein))} g protein
                    </p>
                </div>
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
function MealDetail({ meal }: { meal: Pick<Meal, 'types' | 'macros' | 'notes'> }) {
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

    const valid = name.trim() !== ''

    function toggleType(t: MealType) {
        setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : MEAL_TYPES.filter((x) => x === t || prev.includes(x))))
    }

    async function submit() {
        if (!view || !valid) return
        const fields: MealInput = { name: name.trim(), types, macros, notes: notes.trim() || undefined }
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
            notes: '250 g 0% yoghurt, 80 g berries, 30 g granola',
        },
        {
            name: 'Chicken, rice & veg',
            types: ['lunch', 'dinner'],
            macros: { calories: 610, protein: 52, carbs: 70, fat: 12 },
        },
        {
            name: 'Protein shake',
            types: ['snack'],
            macros: { calories: 160, protein: 30, carbs: 5, fat: 2 },
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
            <p>{f('notes')} is free text — portions, where it’s from, how to make it.</p>
            <p>A meal with the same name as one already in your library lets you choose to update it or keep both.</p>
        </>
    )
}
