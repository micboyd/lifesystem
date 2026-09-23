import { useMemo, useState } from 'react'
import Drawer from '../../Drawer'
import Button from '../../Button'
import Input from '../../Input'
import Textarea from '../../Textarea'
import PillToggle from '../../PillToggle'
import { createRecipe, updateRecipe, type RecipeInput } from '../../../services/mealPrep'
import { per100FromTotals, recipeTotals, type IngredientLine } from '../../../lib/mealPrep'
import type { Food, PrepCategory, PrepRecipe } from '../../../types'
import IngredientEditor, { ingredientFromRow, newIngredientRow, rowFromIngredient, type IngredientRow } from './IngredientEditor'
import { CATEGORY_LABEL, EstimateBadge, MacroLine, More, NumberField, positive, nonNegative } from './ui'

/**
 * Create or edit a tray or side. Only name, category and ingredients are asked
 * up front; the planning settings (yield estimate, usual portion, low-stock
 * level, lead time) sit behind a disclosure because every one of them has a
 * sensible default.
 */

export type RecipeForm = { mode: 'create'; template?: 'chicken' } | { mode: 'edit'; recipe: PrepRecipe }

/**
 * The chicken-tray starter: one editable 1,000 g line of raw chicken breast.
 * The figures are generic raw-breast values for convenience — replace them with
 * your own label. Nothing about 1,000 g is enforced anywhere.
 */
export const CHICKEN_TRAY_GRAMS = 1000
const CHICKEN_TEMPLATE = () => [
    newIngredientRow({ name: 'Chicken breast, raw', quantity: String(CHICKEN_TRAY_GRAMS), kcal: '106', p: '24', c: '0', f: '1.1' }),
    newIngredientRow({ open: true }),
]

export default function RecipeFormDrawer({
    form,
    onClose,
    onSaved,
    foods,
    onFoodSaved,
}: {
    form: RecipeForm | null
    onClose: () => void
    onSaved: (recipe: PrepRecipe) => void
    foods: Food[]
    onFoodSaved: () => void
}) {
    const [name, setName] = useState('')
    const [category, setCategory] = useState<PrepCategory>('main')
    const [rows, setRows] = useState<IngredientRow[]>([])
    const [instructions, setInstructions] = useState('')
    const [prepMinutes, setPrepMinutes] = useState('')
    const [estYield, setEstYield] = useState('')
    const [portion, setPortion] = useState('')
    const [lowUnit, setLowUnit] = useState<'portions' | 'grams'>('portions')
    const [lowValue, setLowValue] = useState('')
    const [leadDays, setLeadDays] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const [opened, setOpened] = useState<RecipeForm | null>(null)
    if (form !== opened) {
        setOpened(form)
        if (form) resetFor(form)
    }

    function resetFor(form: RecipeForm) {
        const r = form.mode === 'edit' ? form.recipe : null
        setName(r?.name ?? (form.mode === 'create' && form.template === 'chicken' ? 'Chicken tray' : ''))
        setCategory(r?.category ?? 'main')
        setRows(
            r
                ? r.ingredients.map(rowFromIngredient)
                : form.mode === 'create' && form.template === 'chicken'
                  ? CHICKEN_TEMPLATE()
                  : [newIngredientRow({ open: true })]
        )
        setInstructions(r?.instructions ?? '')
        setPrepMinutes(r?.prepMinutes ? String(r.prepMinutes) : '')
        setEstYield(r?.estimatedYieldGrams ? String(r.estimatedYieldGrams) : '')
        setPortion(r?.usualPortionGrams ? String(r.usualPortionGrams) : '')
        setLowUnit(r?.lowStock?.unit ?? 'portions')
        setLowValue(r?.lowStock ? String(r.lowStock.value) : '')
        setLeadDays(r?.leadDays ? String(r.leadDays) : '')
        setError('')
    }

    const lines = useMemo(() => rows.filter((r) => r.name.trim()).map(ingredientFromRow), [rows])
    const { totals, problems } = useMemo(() => recipeTotals(lines as IngredientLine[]), [lines])
    const recipe = form?.mode === 'edit' ? form.recipe : null
    const yieldGrams = recipe?.lastYieldGrams ?? positive(estYield)
    const per100 = yieldGrams ? per100FromTotals(totals, yieldGrams) : null

    async function save() {
        if (!form) return
        if (!name.trim()) return setError('Give it a name')
        if (lines.length === 0) return setError('Add at least one ingredient')
        if (problems.length) return setError(`${problems[0].name}: ${problems[0].reason}`)
        setSaving(true)
        setError('')
        const fields: RecipeInput = {
            name: name.trim(),
            category,
            ingredients: lines,
            instructions,
            prepMinutes: positive(prepMinutes) ?? '',
            estimatedYieldGrams: positive(estYield) ?? '',
            usualPortionGrams: positive(portion) ?? '',
            lowStock: nonNegative(lowValue) !== undefined ? { unit: lowUnit, value: nonNegative(lowValue)! } : null,
            leadDays: nonNegative(leadDays) ?? '',
        }
        try {
            const saved = form.mode === 'edit' ? await updateRecipe(form.recipe._id, fields) : await createRecipe(fields)
            onSaved(saved)
            onClose()
        } catch (err) {
            setError((err as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Could not save the recipe')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!form}
            onClose={onClose}
            size="xl"
            title={form?.mode === 'edit' ? 'Edit recipe' : 'New tray or side'}
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving}>
                        Save recipe
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                <Input label="Name" placeholder="e.g. Fajita chicken tray" value={name} onChange={(e) => setName(e.target.value)} />
                <PillToggle
                    label="Category"
                    options={(['main', 'side', 'extra'] as const).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
                    value={category}
                    onChange={setCategory}
                />

                <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Usual ingredients</p>
                    <p className="text-[11px] leading-snug text-neutral-400">
                        Enter each ingredient as you weigh it — raw meat as raw, rice and pasta as dry. Water and other
                        lines without label figures count as zero; oil, cheese and sauces count in full.
                    </p>
                    <IngredientEditor rows={rows} onChange={setRows} foods={foods} onFoodSaved={onFoodSaved} />
                </div>

                <div className="rounded-2xl bg-neutral-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Whole batch</p>
                    <MacroLine macros={totals} className="text-sm font-bold text-neutral-900" />
                    {per100 ? (
                        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
                            <MacroLine macros={per100} /> per 100 g cooked
                            <EstimateBadge title={recipe?.lastYieldGrams ? 'From the last measured yield' : 'From your estimated yield'} />
                        </p>
                    ) : (
                        <p className="mt-1 text-[11px] text-neutral-400">
                            Per-100 g figures appear once a batch is weighed, or with an estimated yield below.
                        </p>
                    )}
                </div>

                <More label="Planning & stock settings">
                    {recipe?.lastYieldGrams ? (
                        <p className="text-[11px] text-neutral-500">
                            Last measured yield: {Math.round(recipe.lastYieldGrams).toLocaleString()} g ({recipe.lastYieldDate}).
                        </p>
                    ) : null}
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Estimated cooked yield" value={estYield} onChange={setEstYield} placeholder="for planning" />
                        <NumberField label="Usual portion" value={portion} onChange={setPortion} placeholder="from history" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] items-end gap-3">
                        <NumberField
                            label="Warn when fewer than"
                            unit={lowUnit === 'portions' ? 'portions' : 'g'}
                            value={lowValue}
                            onChange={setLowValue}
                            placeholder="2"
                        />
                        <PillToggle
                            label="Low-stock unit"
                            options={[
                                { value: 'portions', label: 'Portions' },
                                { value: 'grams', label: 'Grams' },
                            ]}
                            value={lowUnit}
                            onChange={setLowUnit}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Notice before running out" unit="days" value={leadDays} onChange={setLeadDays} placeholder="1" />
                        <NumberField label="Prep & cook time" unit="min" value={prepMinutes} onChange={setPrepMinutes} />
                    </div>
                    <Textarea label="Instructions" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
                </More>

                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        </Drawer>
    )
}
