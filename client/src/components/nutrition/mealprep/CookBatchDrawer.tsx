import { useMemo, useState } from 'react'
import Drawer from '../../Drawer'
import Button from '../../Button'
import Input from '../../Input'
import PillToggle from '../../PillToggle'
import { cookBatch, createContainer, requestKey } from '../../../services/mealPrep'
import { isValidCookedGrams, netFromGross, per100FromTotals, recipeTotals, type IngredientLine } from '../../../lib/mealPrep'
import { todayKey } from '../../../lib/calendar'
import type { BatchStorage, FoodBatch, PrepRecipe } from '../../../types'
import type { MealPrepData } from './useMealPrep'
import IngredientEditor, { ingredientFromRow, rowFromIngredient, type IngredientRow } from './IngredientEditor'
import { GroupedSelect, MacroLine, More, NumberField, positive } from './ui'

/**
 * Cook a batch: review the usual ingredients, change what was actually used,
 * weigh the finished food, choose fridge or freezer, save.
 *
 * The cooked weight is the one number this can't do without — it's what every
 * portion is divided by. It can be typed as net, or as a gross reading minus a
 * container; the two are exclusive, so a container is never taken off twice.
 */
export default function CookBatchDrawer({
    recipe,
    onClose,
    onCooked,
    prep,
}: {
    recipe: PrepRecipe | null
    onClose: () => void
    onCooked: (batch: FoodBatch) => void
    prep: MealPrepData
}) {
    const [rows, setRows] = useState<IngredientRow[]>([])
    const [net, setNet] = useState('')
    const [useContainer, setUseContainer] = useState(false)
    const [gross, setGross] = useState('')
    const [containerId, setContainerId] = useState('')
    const [tare, setTare] = useState('')
    const [newContainerName, setNewContainerName] = useState('')
    const [storage, setStorage] = useState<BatchStorage>('fridge')
    const [cookedDate, setCookedDate] = useState(todayKey())
    const [label, setLabel] = useState('')
    const [useBy, setUseBy] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    // One key per opening of the form: a double-tapped Save cooks one batch.
    const [key, setKey] = useState(requestKey)

    const [opened, setOpened] = useState<PrepRecipe | null>(null)
    if (recipe !== opened) {
        setOpened(recipe)
        if (recipe) resetFor(recipe)
    }

    function resetFor(recipe: PrepRecipe) {
        setRows(recipe.ingredients.map(rowFromIngredient))
        setNet('')
        setUseContainer(false)
        setGross('')
        setContainerId('')
        setTare('')
        setNewContainerName('')
        setStorage('fridge')
        setCookedDate(todayKey())
        setLabel('')
        setUseBy('')
        setError('')
        setKey(requestKey())
    }

    const lines = useMemo(() => rows.filter((r) => r.name.trim()).map(ingredientFromRow), [rows])
    const { totals, problems } = useMemo(() => recipeTotals(lines as IngredientLine[]), [lines])

    const container = prep.containers.find((c) => c._id === containerId)
    const tareGrams = container ? container.grams : positive(tare)
    const cooked = useContainer
        ? positive(gross) !== undefined && tareGrams !== undefined
            ? netFromGross(positive(gross)!, tareGrams)
            : null
        : (positive(net) ?? null)
    const per100 = cooked && isValidCookedGrams(cooked) ? per100FromTotals(totals, cooked) : null

    async function save() {
        if (!recipe) return
        if (lines.length === 0) return setError('Add the ingredients you used')
        if (problems.length) return setError(`${problems[0].name}: ${problems[0].reason}`)
        if (useContainer && cooked === null) {
            return setError('The reading must be heavier than the container. Enter the gross weight with the food in it.')
        }
        if (!cooked || !isValidCookedGrams(cooked)) return setError('Enter the finished cooked weight')
        setSaving(true)
        setError('')
        try {
            let containerName = container?.name
            if (useContainer && !container && newContainerName.trim() && tareGrams) {
                const saved = await createContainer(newContainerName.trim(), tareGrams)
                containerName = saved.name
                void prep.reload()
            }
            const batch = await cookBatch({
                recipe: recipe._id,
                cookedDate,
                ingredients: lines,
                ...(useContainer
                    ? { weighing: { grossGrams: positive(gross)!, containerGrams: tareGrams!, containerName } }
                    : { cookedGrams: cooked }),
                storage,
                label: label.trim() || undefined,
                useBy: useBy || undefined,
                requestId: key,
            })
            onCooked(batch)
            onClose()
        } catch (err) {
            setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not save the batch')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!recipe}
            onClose={onClose}
            size="xl"
            title="Cook batch"
            badge={recipe?.name}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving} icon="fa-solid fa-fire-burner">
                        Save batch
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-5">
                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">1 · What you actually used</p>
                    <IngredientEditor rows={rows} onChange={setRows} foods={prep.foods} onFoodSaved={prep.reload} collapseNutrition />
                    <p className="text-[11px] text-neutral-400">
                        Changes here apply to this batch only; the recipe keeps its usual amounts.
                    </p>
                </section>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">2 · Finished cooked weight</p>
                    {!useContainer ? (
                        <NumberField label="Food only (net)" value={net} onChange={setNet} placeholder="e.g. 1800" autoFocus />
                    ) : (
                        <div className="flex flex-col gap-2 rounded-2xl border border-neutral-100 p-3">
                            <NumberField label="Reading with the container (gross)" value={gross} onChange={setGross} />
                            {prep.containers.length > 0 && (
                                <GroupedSelect
                                    ariaLabel="Container"
                                    placeholder="Choose a saved container…"
                                    value={containerId}
                                    onChange={setContainerId}
                                    groups={[{ label: 'Containers', options: prep.containers.map((c) => ({ value: c._id, label: `${c.name} — ${c.grams} g` })) }]}
                                />
                            )}
                            {!container && (
                                <div className="grid grid-cols-2 gap-2">
                                    <NumberField label="Empty container" value={tare} onChange={setTare} />
                                    <Input label="Save it as (optional)" placeholder="e.g. Big roasting tin" value={newContainerName} onChange={(e) => setNewContainerName(e.target.value)} />
                                </div>
                            )}
                            <p className="text-[11px] font-semibold text-neutral-600">
                                Net food weight: {cooked ? `${Math.round(cooked).toLocaleString()} g` : '—'}
                            </p>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={() => setUseContainer((v) => !v)}
                        className="self-start text-[11px] font-semibold text-neutral-500 underline"
                    >
                        {useContainer ? 'Enter the net weight instead' : 'Weighed it in a container?'}
                    </button>
                </section>

                <section className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">3 · Where it’s going</p>
                    <PillToggle
                        label="Storage"
                        options={[
                            { value: 'fridge', label: 'Fridge' },
                            { value: 'freezer', label: 'Freezer' },
                        ]}
                        value={storage}
                        onChange={setStorage}
                    />
                </section>

                <More label="Date, label and use-by (optional)">
                    <Input label="Cooked on" type="date" value={cookedDate} max={todayKey()} onChange={(e) => setCookedDate(e.target.value || todayKey())} />
                    <Input label="Label" placeholder="e.g. Sunday tray" value={label} onChange={(e) => setLabel(e.target.value)} />
                    <Input label="Use by (your own date)" type="date" value={useBy} onChange={(e) => setUseBy(e.target.value)} />
                </More>

                <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">This batch</p>
                    <MacroLine macros={totals} className="text-sm font-bold text-neutral-900" />
                    {per100 ? (
                        <p className="mt-1 text-[11px] text-neutral-600">
                            <MacroLine macros={per100} /> per 100 g — measured
                        </p>
                    ) : (
                        <p className="mt-1 text-[11px] text-neutral-400">Enter the cooked weight to see per-100 g figures.</p>
                    )}
                    <p className="mt-2 text-[11px] leading-snug text-neutral-400">
                        Portions are worked out as this batch’s totals ÷ its cooked weight × grams eaten, assuming the
                        food is spread reasonably evenly through the tray.
                    </p>
                </div>

                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        </Drawer>
    )
}
