import { useState } from 'react'
import Input from '../../Input'
import Button from '../../Button'
import { createFood } from '../../../services/mealPrep'
import { INGREDIENT_UNITS, ingredientMacros, toBasisAmount, type IngredientLine } from '../../../lib/mealPrep'
import type { Food, IngredientUnit, PrepIngredient } from '../../../types'
import { GroupedSelect, MacroLine, NumberField } from './ui'
import { kcal } from '../format'

/**
 * Ingredient rows with their nutrition source: pick a saved food label or type
 * the label's per-100 figures. Shared by the recipe form (the usual quantities)
 * and the cook form (what was actually used).
 */

export interface IngredientRow {
    key: string
    name: string
    food?: string
    quantity: string
    unit: IngredientUnit
    basis: 'g' | 'ml'
    kcal: string
    p: string
    c: string
    f: string
    density: string
    unitGrams: string
    /** Nutrition fields shown (always, for a line without any yet). */
    open?: boolean
}

let seq = 0
export function newIngredientRow(over: Partial<IngredientRow> = {}): IngredientRow {
    return {
        key: `ing-${seq++}`,
        name: '',
        quantity: '',
        unit: 'g',
        basis: 'g',
        kcal: '',
        p: '',
        c: '',
        f: '',
        density: '',
        unitGrams: '',
        ...over,
    }
}

const s = (n: number | undefined) => (n === undefined || n === null ? '' : String(n))

export function rowFromIngredient(i: PrepIngredient): IngredientRow {
    return newIngredientRow({
        name: i.name,
        food: i.food,
        quantity: s(i.quantity),
        unit: i.unit,
        basis: i.nutrition.basis,
        kcal: s(i.nutrition.per100.calories),
        p: s(i.nutrition.per100.protein),
        c: s(i.nutrition.per100.carbs),
        f: s(i.nutrition.per100.fat),
        density: s(i.nutrition.density),
        unitGrams: s(i.nutrition.unitGrams),
    })
}

const n0 = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/** A row as an ingredient line (blank numbers read as zero). */
export function ingredientFromRow(r: IngredientRow): PrepIngredient {
    const density = n0(r.density)
    const unitGrams = n0(r.unitGrams)
    return {
        name: r.name.trim(),
        ...(r.food ? { food: r.food } : {}),
        quantity: Number(r.quantity) || 0,
        unit: r.unit,
        nutrition: {
            basis: r.basis,
            per100: { calories: n0(r.kcal), protein: n0(r.p), carbs: n0(r.c), fat: n0(r.f) },
            ...(density ? { density } : {}),
            ...(unitGrams ? { unitGrams } : {}),
        },
    }
}

function fromFood(r: IngredientRow, food: Food): IngredientRow {
    return {
        ...r,
        food: food._id,
        name: r.name.trim() ? r.name : food.name,
        basis: food.basis,
        kcal: s(food.per100.calories),
        p: s(food.per100.protein),
        c: s(food.per100.carbs),
        f: s(food.per100.fat),
        density: s(food.density),
        unitGrams: s(food.unitGrams),
    }
}

export default function IngredientEditor({
    rows,
    onChange,
    foods,
    onFoodSaved,
    collapseNutrition = false,
}: {
    rows: IngredientRow[]
    onChange: (rows: IngredientRow[]) => void
    foods: Food[]
    onFoodSaved?: () => void
    /** Hide the label figures behind a toggle — the cook form is about quantities. */
    collapseNutrition?: boolean
}) {
    const [savingKey, setSavingKey] = useState<string | null>(null)
    const patch = (key: string, p: Partial<IngredientRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
    const foodGroups = [{ label: 'Saved foods', options: foods.map((f) => ({ value: f._id, label: f.brand ? `${f.name} (${f.brand})` : f.name })) }]

    async function saveAsFood(r: IngredientRow) {
        const line = ingredientFromRow(r)
        if (!line.name) return
        setSavingKey(r.key)
        try {
            const food = await createFood({
                name: line.name,
                basis: line.nutrition.basis,
                per100: line.nutrition.per100,
                density: line.nutrition.density,
                unitGrams: line.nutrition.unitGrams,
            })
            patch(r.key, { food: food._id })
            onFoodSaved?.()
        } finally {
            setSavingKey(null)
        }
    }

    return (
        <div className="flex flex-col gap-2">
            {rows.map((r) => {
                const line = ingredientFromRow(r) as IngredientLine
                const macros = r.quantity.trim() ? ingredientMacros(line) : null
                const problem = r.quantity.trim() && !macros
                const noNutrition = !r.kcal && !r.p && !r.c && !r.f
                const showNutrition = !collapseNutrition || r.open || noNutrition
                return (
                    <div key={r.key} className="rounded-2xl border border-neutral-100 p-3">
                        <div className="grid grid-cols-[1fr_5.5rem_4.5rem_auto] items-center gap-2">
                            <Input
                                aria-label="Ingredient"
                                placeholder="Ingredient"
                                value={r.name}
                                onChange={(e) => patch(r.key, { name: e.target.value })}
                            />
                            <NumberField ariaLabel={`${r.name || 'Ingredient'} quantity`} unit="" placeholder="qty" value={r.quantity} onChange={(v) => patch(r.key, { quantity: v })} />
                            <select
                                aria-label="Unit"
                                value={r.unit}
                                onChange={(e) => patch(r.key, { unit: e.target.value as IngredientUnit })}
                                className="rounded-xl border border-neutral-200 bg-neutral-50 px-2 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-400 focus:bg-white"
                            >
                                {INGREDIENT_UNITS.map((u) => (
                                    <option key={u} value={u}>
                                        {u}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                aria-label={`Remove ${r.name || 'ingredient'}`}
                                onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                                className="grid h-8 w-8 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                            >
                                <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                            </button>
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                            {macros && <MacroLine macros={macros} className="font-semibold text-neutral-600" />}
                            {problem && <span className="font-medium text-red-500">{ingredientMacrosReason(line)}</span>}
                            {!showNutrition && (
                                <button type="button" className="font-semibold text-neutral-500 underline" onClick={() => patch(r.key, { open: true })}>
                                    {kcal(Number(r.kcal) || 0)} kcal/100 {r.basis} — edit
                                </button>
                            )}
                        </div>

                        {showNutrition && (
                            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-neutral-50/70 p-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    {foods.length > 0 && (
                                        <GroupedSelect
                                            className="sm:w-56"
                                            ariaLabel="Use a saved food"
                                            placeholder="Use a saved food…"
                                            value={r.food && foods.some((f) => f._id === r.food) ? r.food : ''}
                                            groups={foodGroups}
                                            onChange={(id) => {
                                                const food = foods.find((f) => f._id === id)
                                                onChange(rows.map((x) => (x.key === r.key ? (food ? fromFood(x, food) : { ...x, food: undefined }) : x)))
                                            }}
                                        />
                                    )}
                                    <span className="text-[11px] font-semibold text-neutral-500">Label per 100</span>
                                    <select
                                        aria-label="Label basis"
                                        value={r.basis}
                                        onChange={(e) => patch(r.key, { basis: e.target.value as 'g' | 'ml' })}
                                        className="rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs"
                                    >
                                        <option value="g">g</option>
                                        <option value="ml">ml</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    <NumberField unit="kcal" ariaLabel="Calories per 100" value={r.kcal} onChange={(v) => patch(r.key, { kcal: v, food: undefined })} />
                                    <NumberField unit="P" ariaLabel="Protein per 100" value={r.p} onChange={(v) => patch(r.key, { p: v, food: undefined })} />
                                    <NumberField unit="C" ariaLabel="Carbs per 100" value={r.c} onChange={(v) => patch(r.key, { c: v, food: undefined })} />
                                    <NumberField unit="F" ariaLabel="Fat per 100" value={r.f} onChange={(v) => patch(r.key, { f: v, food: undefined })} />
                                </div>
                                {(r.unit === 'item' || r.basis !== (r.unit === 'ml' || r.unit === 'l' ? 'ml' : 'g') || r.density || r.unitGrams) && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <NumberField label="Density" unit="g/ml" ariaLabel="Density in grams per millilitre" value={r.density} onChange={(v) => patch(r.key, { density: v })} />
                                        <NumberField label="One item weighs" unit="g" ariaLabel="Grams per item" value={r.unitGrams} onChange={(v) => patch(r.key, { unitGrams: v })} />
                                    </div>
                                )}
                                {!r.food && r.name.trim() && !noNutrition && (
                                    <div>
                                        <Button size="sm" variant="ghost" icon="fa-solid fa-bookmark" disabled={savingKey === r.key} onClick={() => saveAsFood(r)}>
                                            Save as a food
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
            <div>
                <Button size="sm" variant="secondary" icon="fa-solid fa-plus" onClick={() => onChange([...rows, newIngredientRow({ open: true })])}>
                    Ingredient
                </Button>
            </div>
        </div>
    )
}

function ingredientMacrosReason(line: IngredientLine): string {
    const c = toBasisAmount(line.quantity, line.unit, line.nutrition)
    return c.ok ? '' : c.reason
}
