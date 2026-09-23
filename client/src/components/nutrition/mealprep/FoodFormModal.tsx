import { useState } from 'react'
import Modal from '../../Modal'
import Button from '../../Button'
import Input from '../../Input'
import PillToggle from '../../PillToggle'
import { createFood, updateFood } from '../../../services/mealPrep'
import type { Food } from '../../../types'
import { NumberField, positive } from './ui'

/**
 * A saved nutrition label — an ingredient to cost recipes with, or a packaged
 * ready-to-eat side to weigh onto a plate without cooking anything. Labels per
 * 100 ml need a density before they can be weighed in grams.
 */
export default function FoodFormModal({
    food,
    open,
    onClose,
    onSaved,
}: {
    food: Food | null
    open: boolean
    onClose: () => void
    onSaved: (food: Food) => void
}) {
    const [name, setName] = useState('')
    const [brand, setBrand] = useState('')
    const [basis, setBasis] = useState<'g' | 'ml'>('g')
    const [kcal, setKcal] = useState('')
    const [p, setP] = useState('')
    const [c, setC] = useState('')
    const [f, setF] = useState('')
    const [density, setDensity] = useState('')
    const [unitGrams, setUnitGrams] = useState('')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const [openedFor, setOpenedFor] = useState<Food | null | undefined>(undefined)
    const current = open ? food : undefined
    if (current !== openedFor) {
        setOpenedFor(current)
        if (open) resetFor(food)
    }

    function resetFor(food: Food | null) {
        const s = (n?: number) => (n === undefined ? '' : String(n))
        setName(food?.name ?? '')
        setBrand(food?.brand ?? '')
        setBasis(food?.basis ?? 'g')
        setKcal(s(food?.per100.calories))
        setP(s(food?.per100.protein))
        setC(s(food?.per100.carbs))
        setF(s(food?.per100.fat))
        setDensity(s(food?.density))
        setUnitGrams(s(food?.unitGrams))
        setError('')
    }

    async function save() {
        if (!name.trim()) return setError('Give it a name')
        const n = (v: string) => Math.max(0, Number(v) || 0)
        const fields = {
            name: name.trim(),
            brand: brand.trim(),
            basis,
            per100: { calories: n(kcal), protein: n(p), carbs: n(c), fat: n(f) },
            density: positive(density) ?? ('' as const),
            unitGrams: positive(unitGrams) ?? ('' as const),
        }
        setSaving(true)
        try {
            onSaved(food ? await updateFood(food._id, fields) : await createFood(fields))
            onClose()
        } catch {
            setError('Could not save that food')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={food ? 'Edit food' : 'New food label'}
            size="sm"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving}>
                        Save
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-3">
                <Input label="Name" placeholder="e.g. Microwave rice pouch" value={name} onChange={(e) => setName(e.target.value)} error={error || undefined} />
                <Input label="Brand (optional)" value={brand} onChange={(e) => setBrand(e.target.value)} />
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-neutral-500">Label is per 100</span>
                    <PillToggle label="Label basis" options={[{ value: 'g', label: 'g' }, { value: 'ml', label: 'ml' }]} value={basis} onChange={setBasis} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <NumberField label="Calories" unit="kcal" value={kcal} onChange={setKcal} />
                    <NumberField label="Protein" value={p} onChange={setP} />
                    <NumberField label="Carbs" value={c} onChange={setC} />
                    <NumberField label="Fat" value={f} onChange={setF} />
                </div>
                <details className="rounded-xl border border-neutral-100 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-neutral-500">Conversions (optional)</summary>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <NumberField label="Density" unit="g/ml" value={density} onChange={setDensity} />
                        <NumberField label="One item weighs" value={unitGrams} onChange={setUnitGrams} />
                    </div>
                    <p className="mt-2 text-[11px] text-neutral-400">
                        Needed to use millilitres with a per-100 g label (or grams with a per-100 ml one), or to count items.
                    </p>
                </details>
            </div>
        </Modal>
    )
}
