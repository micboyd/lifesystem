import { useMemo, useState } from 'react'
import BottomSheet from '../BottomSheet'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import Modal from '../Modal'
import ConfirmModal from '../ConfirmModal'
import PillToggle from '../PillToggle'
import { HeroButton } from '../planner/WeekPlannerUI'
import { CATEGORY, CategoryIcon, MacroBar, MacroLegend, MACRO_DOT, caloriesFromMacros, isHighProtein } from './mealUi'
import { kcal } from './format'
import { createMeal, deleteAllMeals, deleteMeal, importMeals, updateMeal } from '../../services/meals'
import { MEAL_TYPES, type Macros, type Meal, type MealInput, type MealType } from '../../types'

type Filter = MealType | 'all'
type Sort = 'library' | 'protein' | 'lightest' | 'name'

const SORTS: { value: Sort; label: string }[] = [
    { value: 'library', label: 'Default' },
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

/**
 * The meal library: every meal you eat, by meal of the day, each one a name
 * and its macros. Browsing shows where each meal's calories come from at a
 * glance; tapping one opens it to edit.
 */
export default function MealLibrary({ meals, onChanged }: { meals: Meal[]; onChanged: () => Promise<void> }) {
    const [editing, setEditing] = useState<Meal | 'new' | null>(null)
    const [importing, setImporting] = useState(false)
    const [clearing, setClearing] = useState(false)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState<Filter>('all')
    const [sort, setSort] = useState<Sort>('library')

    const q = search.trim().toLowerCase()
    const matching = useMemo(
        () => sortMeals(meals.filter((m) => !q || m.name.toLowerCase().includes(q)), sort),
        [meals, q, sort]
    )
    const count = (t: MealType) => meals.filter((m) => m.types.includes(t)).length

    // Browsing everything: grouped by meal of the day. Filtering or searching:
    // one flat grid of what matched.
    const grouped = filter === 'all' && !q
    const flat = filter === 'all' ? matching : matching.filter((m) => m.types.includes(filter))

    return (
        <div className="flex flex-col gap-5">
            <section className="relative overflow-hidden rounded-[28px] bg-linear-to-br from-brand-700 via-brand-600 to-brand-500 text-white shadow-[0_18px_40px_-20px_rgba(1,61,90,0.6)]">
                <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-coral-500/20 blur-3xl" />
                <div className="relative flex flex-col gap-5 p-5 sm:p-7">
                    <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Meal library</h2>
                            <p className="mt-1 text-sm font-medium text-white/60">
                                {meals.length} {meals.length === 1 ? 'meal' : 'meals'} · macros per serving
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {meals.length > 0 && (
                                <HeroButton icon="fa-solid fa-trash-can" onClick={() => setClearing(true)}>
                                    Delete all
                                </HeroButton>
                            )}
                            <HeroButton icon="fa-solid fa-file-import" onClick={() => setImporting(true)}>
                                Import
                            </HeroButton>
                            <HeroButton primary icon="fa-solid fa-plus" onClick={() => setEditing('new')}>
                                Add meal
                            </HeroButton>
                        </div>
                    </div>

                    <label className="relative block">
                        <span className="sr-only">Search meals</span>
                        <i className="fa-solid fa-magnifying-glass pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/50" aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search your meals"
                            className="h-12 w-full rounded-2xl border border-white/15 bg-white/10 pl-11 pr-4 text-[15px] text-white placeholder:text-white/50 focus:border-white/50 focus:bg-white/15 focus:outline-none"
                        />
                    </label>

                    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Meal of the day">
                        <FilterTab active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={meals.length} />
                        {MEAL_TYPES.map((t) => (
                            <FilterTab
                                key={t}
                                active={filter === t}
                                onClick={() => setFilter(t)}
                                label={CATEGORY[t].label}
                                count={count(t)}
                                icon={CATEGORY[t].icon}
                            />
                        ))}
                    </div>
                </div>
            </section>

            {meals.length === 0 ? (
                <EmptyLibrary onAdd={() => setEditing('new')} onImport={() => setImporting(true)} />
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <PillToggle label="Sort" value={sort} onChange={setSort} options={SORTS} />
                        {!grouped && (
                            <p className="text-xs font-medium text-neutral-400">
                                {flat.length} {flat.length === 1 ? 'meal' : 'meals'}
                            </p>
                        )}
                    </div>

                    {grouped ? (
                        <div className="flex flex-col gap-8">
                            {MEAL_TYPES.map((t) => {
                                const list = matching.filter((m) => m.types.includes(t))
                                return (
                                    <section key={t} className="flex flex-col gap-3">
                                        <header className="flex items-center gap-2.5">
                                            <CategoryIcon type={t} size="sm" />
                                            <h3 className="text-base font-bold tracking-tight text-neutral-900">{CATEGORY[t].label}</h3>
                                            <span className="text-sm font-medium text-neutral-400">{list.length}</span>
                                        </header>
                                        {list.length === 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setEditing('new')}
                                                className="rounded-3xl border border-dashed border-neutral-200 py-6 text-sm text-neutral-400 hover:bg-white"
                                            >
                                                No {CATEGORY[t].label.toLowerCase()} yet — add one
                                            </button>
                                        ) : (
                                            <MealGrid meals={list} onOpen={setEditing} />
                                        )}
                                    </section>
                                )
                            })}
                            {matching.some((m) => m.types.length === 0) && (
                                <section className="flex flex-col gap-3">
                                    <h3 className="text-base font-bold tracking-tight text-neutral-900">Other</h3>
                                    <MealGrid meals={matching.filter((m) => m.types.length === 0)} onOpen={setEditing} />
                                </section>
                            )}
                        </div>
                    ) : flat.length === 0 ? (
                        <p className="rounded-3xl border border-dashed border-neutral-200 py-12 text-center text-sm text-neutral-500">
                            {q ? `Nothing matches “${search.trim()}”.` : 'Nothing here yet.'}
                        </p>
                    ) : (
                        <MealGrid meals={flat} onOpen={setEditing} />
                    )}
                </>
            )}

            <MealForm
                meal={editing}
                defaultType={filter === 'all' ? null : filter}
                onClose={() => setEditing(null)}
                onSaved={async () => {
                    setEditing(null)
                    await onChanged()
                }}
            />
            <ImportModal open={importing} onClose={() => setImporting(false)} onDone={onChanged} />
            <ConfirmModal
                open={clearing}
                title={`Delete all ${meals.length} meals?`}
                message="This empties your whole library and can't be undone. Meals only planned on days come off too; days you've already eaten them keep them."
                confirmLabel="Delete everything"
                danger
                onConfirm={() => void deleteAllMeals().finally(onChanged)}
                onClose={() => setClearing(false)}
            />
        </div>
    )
}

function FilterTab({
    active,
    onClick,
    label,
    count,
    icon,
}: {
    active: boolean
    onClick: () => void
    label: string
    count: number
    icon?: string
}) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={`inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-all ${
                active ? 'bg-white text-brand-700 shadow-md' : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
            }`}
        >
            {icon && <i className={`${icon} text-xs ${active ? '' : 'text-white/60'}`} aria-hidden="true" />}
            {label}
            <span className={`tabular-nums ${active ? 'text-brand-500' : 'text-white/50'}`}>{count}</span>
        </button>
    )
}

// ── Cards ────────────────────────────────────────────────────────────────────

function MealGrid({ meals, onOpen }: { meals: Meal[]; onOpen: (m: Meal) => void }) {
    return (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {meals.map((m) => (
                <li key={m._id}>
                    <MealCard meal={m} onOpen={() => onOpen(m)} />
                </li>
            ))}
        </ul>
    )
}

function MealCard({ meal, onOpen }: { meal: Meal; onOpen: () => void }) {
    const { macros } = meal
    return (
        <button
            type="button"
            onClick={onOpen}
            className="group flex h-full w-full flex-col gap-3 rounded-3xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.06] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-16px_rgba(1,61,90,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-coral-500 active:translate-y-0"
        >
            <div className="flex items-start gap-3">
                <div className="flex shrink-0 -space-x-2">
                    {(meal.types.length ? meal.types : []).map((t) => (
                        <span key={t} className="rounded-xl ring-2 ring-white">
                            <CategoryIcon type={t} />
                        </span>
                    ))}
                    {meal.types.length === 0 && (
                        <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-100 text-sm text-neutral-400" aria-hidden="true">
                            <i className="fa-solid fa-utensils" />
                        </span>
                    )}
                </div>
                <p className="line-clamp-2 min-w-0 flex-1 text-[15px] font-semibold leading-snug text-neutral-900">{meal.name}</p>
                {isHighProtein(macros) && (
                    <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-600">
                        High protein
                    </span>
                )}
            </div>
            <div className="mt-auto flex flex-col gap-2">
                <p className="text-2xl font-bold tabular-nums tracking-tight text-neutral-950">
                    {kcal(macros.calories)}
                    <span className="ml-1 text-xs font-medium text-neutral-400">kcal</span>
                </p>
                <MacroBar macros={macros} />
                <MacroLegend macros={macros} />
            </div>
        </button>
    )
}

function EmptyLibrary({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
    return (
        <div className="flex flex-col items-center gap-4 rounded-3xl bg-white px-6 py-12 text-center ring-1 ring-black/[0.06]">
            <div className="flex -space-x-2">
                {MEAL_TYPES.map((t) => (
                    <span key={t} className="rounded-2xl ring-4 ring-white">
                        <CategoryIcon type={t} size="lg" />
                    </span>
                ))}
            </div>
            <div>
                <p className="text-lg font-bold text-neutral-900">Start your library</p>
                <p className="mt-1 text-sm text-neutral-500">Add the meals you eat — a name and its macros is all it takes.</p>
            </div>
            <div className="flex gap-2">
                <Button variant="secondary" icon="fa-solid fa-file-import" onClick={onImport}>
                    Import a list
                </Button>
                <Button icon="fa-solid fa-plus" onClick={onAdd}>
                    Add a meal
                </Button>
            </div>
        </div>
    )
}

// ── Add / edit ───────────────────────────────────────────────────────────────

type Draft = { name: string; types: MealType[]; calories: string; protein: string; carbs: string; fat: string; notes: string }

const blank = (type: MealType | null): Draft => ({
    name: '',
    types: type ? [type] : [],
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    notes: '',
})

function toDraft(m: Meal): Draft {
    return {
        name: m.name,
        types: m.types,
        calories: String(m.macros.calories),
        protein: String(m.macros.protein),
        carbs: String(m.macros.carbs),
        fat: String(m.macros.fat),
        notes: m.notes ?? '',
    }
}

const num = (v: string) => Math.max(0, Number(v) || 0)

function draftMacros(d: Draft): Macros {
    return { calories: num(d.calories), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat) }
}

function MealForm({
    meal,
    defaultType,
    onClose,
    onSaved,
}: {
    meal: Meal | 'new' | null
    /** New meals start in the category being browsed. */
    defaultType: MealType | null
    onClose: () => void
    onSaved: () => Promise<void>
}) {
    const [draft, setDraft] = useState<Draft>(blank(null))
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const [loaded, setLoaded] = useState<Meal | 'new' | null>(null)
    if (meal !== loaded) {
        setLoaded(meal)
        if (meal) {
            setDraft(meal === 'new' ? blank(defaultType) : toDraft(meal))
            setError('')
        }
    }

    const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
    const macros = draftMacros(draft)
    const implied = caloriesFromMacros(macros)
    // Offer the macro-derived figure when calories are blank or clearly off.
    const offerImplied =
        implied > 0 && (macros.calories === 0 || Math.abs(implied - macros.calories) > Math.max(25, macros.calories * 0.15))

    function fields(): MealInput | null {
        if (!draft.name.trim()) {
            setError('Give it a name')
            return null
        }
        return { name: draft.name.trim(), types: draft.types, macros, notes: draft.notes.trim() || undefined }
    }

    async function run(fn: () => Promise<unknown>) {
        setBusy(true)
        try {
            await fn()
            await onSaved()
        } catch {
            setError('Could not save — try again.')
        } finally {
            setBusy(false)
        }
    }

    const isEdit = meal !== null && meal !== 'new'

    return (
        <>
            <BottomSheet
                open={meal !== null}
                onClose={onClose}
                title={isEdit ? 'Edit meal' : 'New meal'}
                footer={
                    <div className="flex gap-2">
                        <Button
                            className="min-h-[48px] flex-1"
                            disabled={busy}
                            onClick={() => {
                                const f = fields()
                                if (f) void run(() => (isEdit ? updateMeal((meal as Meal)._id, f) : createMeal(f)))
                            }}
                        >
                            {isEdit ? 'Save' : 'Add to library'}
                        </Button>
                        {isEdit && (
                            <>
                                <Button
                                    variant="secondary"
                                    className="min-h-[48px]"
                                    icon="fa-regular fa-copy"
                                    disabled={busy}
                                    onClick={() => {
                                        const f = fields()
                                        if (f) void run(() => createMeal({ ...f, name: `${f.name} (copy)` }))
                                    }}
                                >
                                    <span className="hidden sm:inline">Duplicate</span>
                                </Button>
                                <button
                                    type="button"
                                    aria-label="Delete meal"
                                    disabled={busy}
                                    onClick={() => setConfirmDelete(true)}
                                    className="grid min-h-[48px] w-12 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                >
                                    <i className="fa-solid fa-trash-can" aria-hidden="true" />
                                </button>
                            </>
                        )}
                    </div>
                }
            >
                <div className="flex flex-col gap-5 pt-1">
                    {/* Live preview — the card as it will look. */}
                    <div className="rounded-3xl bg-neutral-50 p-4 ring-1 ring-black/[0.04]">
                        <div className="flex items-center gap-3">
                            <div className="flex shrink-0 -space-x-2">
                                {draft.types.length ? (
                                    draft.types.map((t) => (
                                        <span key={t} className="rounded-xl ring-2 ring-neutral-50">
                                            <CategoryIcon type={t} />
                                        </span>
                                    ))
                                ) : (
                                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-neutral-200/60 text-sm text-neutral-400" aria-hidden="true">
                                        <i className="fa-solid fa-utensils" />
                                    </span>
                                )}
                            </div>
                            <p className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${draft.name.trim() ? 'text-neutral-900' : 'text-neutral-400'}`}>
                                {draft.name.trim() || 'Your meal'}
                            </p>
                        </div>
                        <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-neutral-950">
                            {kcal(macros.calories)}
                            <span className="ml-1 text-sm font-medium text-neutral-400">kcal</span>
                        </p>
                        <div className="mt-2 flex flex-col gap-2">
                            <MacroBar macros={macros} thick />
                            <MacroLegend macros={macros} />
                        </div>
                    </div>

                    <Input label="Name" value={draft.name} error={error} placeholder="e.g. Scrambled eggs on toast" onChange={(e) => set({ name: e.target.value })} />

                    <div>
                        <p className="mb-2 text-sm font-medium text-neutral-700">Meal of the day</p>
                        <div className="grid grid-cols-4 gap-2">
                            {MEAL_TYPES.map((t) => {
                                const on = draft.types.includes(t)
                                const c = CATEGORY[t]
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        aria-pressed={on}
                                        onClick={() => set({ types: on ? draft.types.filter((x) => x !== t) : [...draft.types, t] })}
                                        className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl text-xs font-semibold transition-all ${
                                            on ? `${c.tile} ${c.text} ring-2 ${c.ring}` : 'bg-neutral-50 text-neutral-500 ring-1 ring-black/[0.04] hover:bg-neutral-100'
                                        }`}
                                    >
                                        <i className={`${c.icon} text-lg`} aria-hidden="true" />
                                        {c.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 text-sm font-medium text-neutral-700">Per serving</p>
                        <div className="grid grid-cols-2 gap-3">
                            <MacroInput label="Protein" dot={MACRO_DOT.protein} unit="g" value={draft.protein} onChange={(v) => set({ protein: v })} />
                            <MacroInput label="Carbs" dot={MACRO_DOT.carbs} unit="g" value={draft.carbs} onChange={(v) => set({ carbs: v })} />
                            <MacroInput label="Fat" dot={MACRO_DOT.fat} unit="g" value={draft.fat} onChange={(v) => set({ fat: v })} />
                            <MacroInput label="Calories" unit="kcal" value={draft.calories} onChange={(v) => set({ calories: v })} />
                        </div>
                        {offerImplied && (
                            <button
                                type="button"
                                onClick={() => set({ calories: String(implied) })}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-100"
                            >
                                <i className="fa-solid fa-wand-magic-sparkles text-[10px]" aria-hidden="true" />
                                Macros add up to {kcal(implied)} kcal — use that
                            </button>
                        )}
                    </div>

                    <Textarea label="Notes" rows={2} value={draft.notes} placeholder="Optional" onChange={(e) => set({ notes: e.target.value })} />
                </div>
            </BottomSheet>
            <ConfirmModal
                open={confirmDelete}
                title="Delete this meal?"
                message="It comes off any days where it's only planned. Days you've already eaten it keep it."
                confirmLabel="Delete"
                danger
                onConfirm={() => {
                    if (isEdit) void run(() => deleteMeal((meal as Meal)._id))
                }}
                onClose={() => setConfirmDelete(false)}
            />
        </>
    )
}

function MacroInput({
    label,
    dot,
    unit,
    value,
    onChange,
}: {
    label: string
    dot?: string
    unit: string
    value: string
    onChange: (v: string) => void
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                {dot && <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />}
                {label}
            </span>
            <span className="relative">
                <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    placeholder="0"
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    className="h-12 w-full rounded-xl border border-neutral-200 bg-white pl-3 pr-12 text-lg font-semibold tabular-nums text-neutral-900 focus:border-neutral-900 focus:outline-none"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400">{unit}</span>
            </span>
        </label>
    )
}

// ── Import ───────────────────────────────────────────────────────────────────

const EXAMPLE = `[
  { "name": "Scrambled eggs on toast", "types": ["breakfast"],
    "macros": { "calories": 500, "protein": 32, "carbs": 40, "fat": 22 } }
]`

function ImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
    const [text, setText] = useState('')
    const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
    const [busy, setBusy] = useState(false)

    async function run() {
        let parsed: unknown
        try {
            parsed = JSON.parse(text)
        } catch {
            return setMessage({ tone: 'error', text: 'That isn’t valid JSON.' })
        }
        const list = Array.isArray(parsed) ? parsed : (parsed as { meals?: unknown[] })?.meals
        if (!Array.isArray(list)) return setMessage({ tone: 'error', text: 'Expected a list of meals.' })
        setBusy(true)
        try {
            const r = await importMeals(list)
            await onDone()
            setText('')
            if (r.skipped) {
                // Stay open so the count is seen; the imported ones are already in.
                setMessage({ tone: 'info', text: `Imported ${r.created}; skipped ${r.skipped} without a name.` })
            } else {
                setMessage(null)
                onClose()
            }
        } catch {
            setMessage({ tone: 'error', text: 'Import failed — try again.' })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title="Import meals"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={run} disabled={busy || !text.trim()}>
                        Import
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <p className="text-sm text-neutral-500">
                    Paste a JSON list. Each meal needs a name; types are breakfast, lunch, dinner or snack.
                </p>
                <Textarea rows={10} value={text} placeholder={EXAMPLE} onChange={(e) => setText(e.target.value)} className="font-mono text-xs" />
                {message && <p className={`text-sm ${message.tone === 'error' ? 'text-red-600' : 'text-neutral-600'}`}>{message.text}</p>}
            </div>
        </Modal>
    )
}
