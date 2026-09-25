import { useMemo, useState } from 'react'
import BottomSheet from '../../BottomSheet'
import Button from '../../Button'
import Input from '../../Input'
import { AmountPicker, MacroPreview } from './AmountPicker'
import { addFoodEntry, createBatch, updateBatch } from '../../../services/food'
import { amountMacros, canWeigh, portionMacros, portionWeightLabel, recipeUnitDefault } from '../../../lib/recipes'
import { fmt, kcal, shortDate } from '../format'
import type { Batch, FoodEntry, FoodEntryUnit, MealType, Recipe } from '../../../types'

type Source = { kind: 'batch'; item: Batch } | { kind: 'recipe'; item: Recipe }
type Step =
    | { name: 'pick' }
    | { name: 'amount'; source: Source }
    | { name: 'quick' }
    | { name: 'cook' }

type Tab = 'batches' | 'meals' | 'quick'

const SLOT_LABEL: Record<MealType, string> = {
    breakfast: 'Breakfast',
    lunch: 'Lunch',
    dinner: 'Dinner',
    snack: 'Snack',
}

/**
 * Add food to one slot of one day: pick a batch, a meal or type it in, say how
 * much, see what it comes to, add it. Three taps for the common case — open,
 * pick "Tray A", "Add" — with the portion defaulting to one.
 */
export default function AddFoodSheet({
    open,
    date,
    slot,
    isFuture,
    recipes,
    batches,
    onClose,
    onAdded,
    onBatchSaved,
}: {
    open: boolean
    date: string
    slot: MealType
    /** Future days plan rather than log. */
    isFuture: boolean
    recipes: Recipe[]
    batches: Batch[]
    onClose: () => void
    onAdded: (entry: FoodEntry) => void
    onBatchSaved: (batch: Batch) => void
}) {
    const [step, setStep] = useState<Step>({ name: 'pick' })
    const [tab, setTab] = useState<Tab>(() => (batches.length > 0 && slot !== 'breakfast' ? 'batches' : 'meals'))
    const [search, setSearch] = useState('')
    const [amount, setAmount] = useState(1)
    const [unit, setUnit] = useState<FoodEntryUnit>('portion')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    // Reset to the first step each time the sheet opens for a slot.
    const [openKey, setOpenKey] = useState('')
    const key = open ? `${date}|${slot}` : ''
    if (key !== openKey) {
        setOpenKey(key)
        if (open) {
            setStep({ name: 'pick' })
            setTab(batches.length > 0 && slot !== 'breakfast' ? 'batches' : 'meals')
            setSearch('')
            setError('')
        }
    }

    function choose(source: Source) {
        const u = recipeUnitDefault(source.item)
        setAmount(u === 'g' ? 100 : 1)
        setUnit(u)
        setError('')
        setStep({ name: 'amount', source })
    }

    async function add(status: 'eaten' | 'planned') {
        if (step.name !== 'amount') return
        setBusy(true)
        setError('')
        try {
            const ref = step.source.kind === 'batch' ? { batch: step.source.item._id } : { recipe: step.source.item._id }
            const entry = await addFoodEntry({ date, slot, status, amount, unit, ...ref })
            onAdded(entry)
            onClose()
        } catch (e) {
            setError(messageOf(e))
        } finally {
            setBusy(false)
        }
    }

    const title =
        step.name === 'amount'
            ? step.source.item.name
            : step.name === 'quick'
              ? 'Quick add'
              : step.name === 'cook'
                ? 'I cooked something'
                : `Add to ${SLOT_LABEL[slot].toLowerCase()}`

    const back = step.name === 'pick' ? undefined : () => setStep({ name: 'pick' })

    const primaryStatus = isFuture ? 'planned' : 'eaten'
    const preview =
        step.name === 'amount' ? amountMacros(step.source.item, amount, unit) : null

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={title}
            onBack={back}
            footer={
                step.name === 'amount' ? (
                    <div className="flex flex-col gap-2">
                        {error && <p className="text-sm text-red-600">{error}</p>}
                        <div className="flex gap-2">
                            <Button
                                className="min-h-[52px] flex-1 text-base"
                                disabled={busy || !preview}
                                onClick={() => add(primaryStatus)}
                            >
                                {isFuture ? 'Add to plan' : 'Add — eaten'}
                            </Button>
                            {!isFuture && (
                                <Button
                                    variant="secondary"
                                    className="min-h-[52px]"
                                    disabled={busy || !preview}
                                    onClick={() => add('planned')}
                                >
                                    Plan it
                                </Button>
                            )}
                        </div>
                    </div>
                ) : undefined
            }
        >
            {step.name === 'pick' && (
                <PickStep
                    tab={tab}
                    onTab={(t) => (t === 'quick' ? setStep({ name: 'quick' }) : setTab(t))}
                    slot={slot}
                    search={search}
                    onSearch={setSearch}
                    recipes={recipes}
                    batches={batches}
                    onChoose={choose}
                    onCook={() => setStep({ name: 'cook' })}
                />
            )}

            {step.name === 'amount' && (
                <div className="flex flex-col gap-4 pt-1">
                    <AmountPicker
                        source={step.source.item}
                        amount={amount}
                        unit={unit}
                        onChange={(a, u) => {
                            setAmount(a)
                            setUnit(u)
                        }}
                    />
                    <MacroPreview
                        macros={preview?.macros ?? null}
                        estimated={preview?.estimated}
                        source={step.source.item}
                        amount={amount}
                        unit={unit}
                    />
                    {step.source.kind === 'batch' && !step.source.item.cookedGrams && (
                        <WeighBatch
                            batch={step.source.item}
                            onSaved={(b) => {
                                onBatchSaved(b)
                                setStep({ name: 'amount', source: { kind: 'batch', item: b } })
                            }}
                        />
                    )}
                    {step.source.kind === 'recipe' && step.source.item.notes && (
                        <p className="text-xs text-neutral-500">{step.source.item.notes}</p>
                    )}
                </div>
            )}

            {step.name === 'quick' && (
                <QuickStep
                    date={date}
                    slot={slot}
                    status={primaryStatus}
                    onAdded={(e) => {
                        onAdded(e)
                        onClose()
                    }}
                />
            )}

            {step.name === 'cook' && (
                <CookStep
                    recipes={recipes}
                    onCreated={(b) => {
                        onBatchSaved(b)
                        choose({ kind: 'batch', item: b })
                    }}
                />
            )}
        </BottomSheet>
    )
}

// ── Pick ─────────────────────────────────────────────────────────────────────

function PickStep({
    tab,
    onTab,
    slot,
    search,
    onSearch,
    recipes,
    batches,
    onChoose,
    onCook,
}: {
    tab: Tab
    onTab: (t: Tab) => void
    slot: MealType
    search: string
    onSearch: (s: string) => void
    recipes: Recipe[]
    batches: Batch[]
    onChoose: (s: Source) => void
    onCook: () => void
}) {
    // Meals that suit this slot first, then everything else; search across both.
    const meals = useMemo(() => {
        const q = search.trim().toLowerCase()
        const matching = recipes.filter((r) => !q || r.name.toLowerCase().includes(q))
        const fits = (r: Recipe) => r.types.length === 0 || r.types.includes(slot)
        return [...matching.filter(fits), ...matching.filter((r) => !fits(r))]
    }, [recipes, search, slot])

    return (
        <div className="flex flex-col gap-3">
            <div className="sticky top-0 z-10 -mx-4 bg-white px-4 pb-2 sm:-mx-5 sm:px-5">
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1" role="tablist">
                    {(
                        [
                            ['batches', 'My batches'],
                            ['meals', 'Meals'],
                            ['quick', 'Quick'],
                        ] as const
                    ).map(([t, label]) => (
                        <button
                            key={t}
                            type="button"
                            role="tab"
                            aria-selected={tab === t}
                            onClick={() => onTab(t)}
                            className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                                tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                {tab === 'meals' && (
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder="Search meals"
                        className="mt-2 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm focus:border-neutral-900 focus:outline-none"
                    />
                )}
            </div>

            {tab === 'batches' && (
                <>
                    {batches.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-500">
                            No batches on the go. Cooked a tray? Add it below and log from it all week.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {batches.map((b) => (
                                <PickRow
                                    key={b._id}
                                    onClick={() => onChoose({ kind: 'batch', item: b })}
                                    title={b.name}
                                    lines={[
                                        `Cooked ${shortDate(b.cookedOn)} · ${b.servings} portions`,
                                        `${kcal(portionMacros(b, 1).calories)} kcal · ${fmt(Math.round(portionMacros(b, 1).protein))} g protein a portion`,
                                        portionWeightLabel(b) ?? 'Not weighed — log in portions',
                                    ]}
                                />
                            ))}
                        </ul>
                    )}
                    <button
                        type="button"
                        onClick={onCook}
                        className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 text-sm font-semibold text-neutral-700 active:bg-neutral-50"
                    >
                        <i className="fa-solid fa-fire-burner" aria-hidden="true" />I cooked something
                    </button>
                </>
            )}

            {tab === 'meals' && (
                <ul className="flex flex-col gap-2">
                    {meals.map((r) => {
                        const one = portionMacros(r, 1)
                        const weighed = r.servings === 1 && canWeigh(r)
                        return (
                            <PickRow
                                key={r._id}
                                onClick={() => onChoose({ kind: 'recipe', item: r })}
                                title={r.name}
                                lines={[
                                    weighed
                                        ? `${kcal((one.calories / (r.cookedGrams ?? r.estimatedCookedGrams ?? 100)) * 100)} kcal per 100 g`
                                        : `${kcal(one.calories)} kcal · ${fmt(Math.round(one.protein))} g protein${r.servings > 1 ? ` a portion (of ${r.servings})` : ''}`,
                                ]}
                            />
                        )
                    })}
                    {meals.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">No meals match.</p>}
                </ul>
            )}
        </div>
    )
}

function PickRow({ title, lines, onClick }: { title: string; lines: string[]; onClick: () => void }) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-black/[0.06] active:bg-neutral-50"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-neutral-900">{title}</span>
                    {lines.map((l) => (
                        <span key={l} className="block truncate text-xs tabular-nums text-neutral-500">
                            {l}
                        </span>
                    ))}
                </span>
                <i className="fa-solid fa-chevron-right text-xs text-neutral-300" aria-hidden="true" />
            </button>
        </li>
    )
}

// ── Weigh a batch in place ───────────────────────────────────────────────────

/** "Weigh the lot" — turns estimated gram figures into measured ones. */
function WeighBatch({ batch, onSaved }: { batch: Batch; onSaved: (b: Batch) => void }) {
    const [open, setOpen] = useState(false)
    const [value, setValue] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-neutral-600"
            >
                <i className="fa-solid fa-scale-balanced" aria-hidden="true" />
                Weighed the whole batch? Enter it
            </button>
        )
    }

    async function save() {
        const n = Number(value)
        if (!Number.isFinite(n) || n <= 0) {
            setError('Enter the cooked weight in grams')
            return
        }
        setBusy(true)
        try {
            onSaved(await updateBatch(batch._id, { cookedGrams: n }))
            setOpen(false)
        } catch (e) {
            setError(messageOf(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">
                All the cooked food, without trays or containers. Both trays together if it was two.
            </p>
            <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                    <Input
                        label="Cooked weight (g)"
                        type="text"
                        inputMode="numeric"
                        value={value}
                        error={error}
                        onChange={(e) => setValue(e.target.value)}
                        autoFocus
                    />
                </div>
                <Button onClick={save} disabled={busy} className="min-h-[44px]">
                    Save
                </Button>
            </div>
        </div>
    )
}

// ── Quick ────────────────────────────────────────────────────────────────────

function QuickStep({
    date,
    slot,
    status,
    onAdded,
}: {
    date: string
    slot: MealType
    status: 'eaten' | 'planned'
    onAdded: (e: FoodEntry) => void
}) {
    const [name, setName] = useState('')
    const [vals, setVals] = useState({ calories: '', protein: '', carbs: '', fat: '' })
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    async function save() {
        if (!name.trim()) {
            setError('Give it a name')
            return
        }
        setBusy(true)
        setError('')
        try {
            const n = (v: string) => Math.max(0, Number(v) || 0)
            onAdded(
                await addFoodEntry({
                    date,
                    slot,
                    status,
                    name: name.trim(),
                    macros: {
                        calories: n(vals.calories),
                        protein: n(vals.protein),
                        carbs: n(vals.carbs),
                        fat: n(vals.fat),
                    },
                })
            )
        } catch (e) {
            setError(messageOf(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 pt-1">
            <Input label="What was it?" value={name} onChange={(e) => setName(e.target.value)} placeholder="Protein bar" />
            <div className="grid grid-cols-2 gap-3">
                {(['calories', 'protein', 'carbs', 'fat'] as const).map((k) => (
                    <Input
                        key={k}
                        label={k === 'calories' ? 'kcal' : `${k[0].toUpperCase()}${k.slice(1)} (g)`}
                        type="text"
                        inputMode="decimal"
                        value={vals[k]}
                        onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                    />
                ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="min-h-[52px] text-base" onClick={save} disabled={busy}>
                Add
            </Button>
        </div>
    )
}

// ── Cook ─────────────────────────────────────────────────────────────────────

/**
 * Start a batch from a recipe: name it ("Tray A — Greek lemon"), check the
 * portions, and add the weight now or later. The ingredients come across from
 * the recipe; changing them for this cook is a desktop job.
 */
function CookStep({ recipes, onCreated }: { recipes: Recipe[]; onCreated: (b: Batch) => void }) {
    const [recipe, setRecipe] = useState<Recipe | null>(null)
    const [name, setName] = useState('')
    const [servings, setServings] = useState('')
    const [weight, setWeight] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')

    const cookable = recipes.filter((r) => r.servings > 1 || r.estimatedCookedGrams)

    if (!recipe) {
        return (
            <ul className="flex flex-col gap-2 pt-1">
                {cookable.map((r) => (
                    <PickRow
                        key={r._id}
                        title={r.name}
                        lines={[`${r.servings} portions${r.estimatedCookedGrams ? ` · ≈ ${fmt(r.estimatedCookedGrams)} g cooked` : ''}`]}
                        onClick={() => {
                            setRecipe(r)
                            setName(r.name)
                            setServings(String(r.servings))
                        }}
                    />
                ))}
                {cookable.length === 0 && (
                    <p className="py-6 text-center text-sm text-neutral-500">
                        No batch recipes yet — import or add one in Foods.
                    </p>
                )}
            </ul>
        )
    }

    async function save() {
        const s = Number(servings)
        const w = weight.trim() ? Number(weight) : undefined
        if (!Number.isFinite(s) || s <= 0) return setError('Portions must be above 0')
        if (w !== undefined && (!Number.isFinite(w) || w <= 0)) return setError('Cooked weight must be above 0')
        setBusy(true)
        setError('')
        try {
            onCreated(await createBatch({ recipe: recipe!._id, name: name.trim() || recipe!.name, servings: s, cookedGrams: w }))
        } catch (e) {
            setError(messageOf(e))
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="flex flex-col gap-3 pt-1">
            <Input label="Batch name" value={name} onChange={(e) => setName(e.target.value)} hint={`e.g. "Tray A — ${recipe.name}"`} />
            <div className="grid grid-cols-2 gap-3">
                <Input
                    label="Portions"
                    type="text"
                    inputMode="decimal"
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                />
                <Input
                    label="Cooked weight (g)"
                    type="text"
                    inputMode="numeric"
                    value={weight}
                    placeholder="Optional"
                    onChange={(e) => setWeight(e.target.value)}
                />
            </div>
            <p className="text-xs text-neutral-500">
                Weight is all the cooked food without trays — both trays together. Leave it blank and portions still
                work; grams will be estimates until you weigh it.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button className="min-h-[52px] text-base" onClick={save} disabled={busy}>
                Save batch
            </Button>
        </div>
    )
}

function messageOf(e: unknown): string {
    const err = e as { response?: { data?: { message?: string } } }
    return err.response?.data?.message ?? 'Something went wrong — try again.'
}
