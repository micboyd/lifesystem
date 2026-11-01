import { useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Checkbox from '../Checkbox'
import { FIELD_LABEL } from '../fieldStyles'
import { CATEGORY, MacroBar, MacroLegend, caloriesFromMacros } from './mealUi'
import { kcal, longDate } from './format'
import { MEAL_TYPES, type Macros, type MealType } from '../../types'

const num = (v: string) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/** The slot a quick add starts on: today, the one for the time of day; any other day, breakfast. */
function startSlot(date: string, today: string): MealType {
    if (date !== today) return 'breakfast'
    const h = new Date().getHours()
    return h < 11 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snack'
}

/**
 * The + on a day: one item, straight onto the day in any slot — just a name
 * and its macros. Ticked, it's saved to the meal library too; otherwise it's
 * a one-off. Today and before it goes
 * in eaten; days ahead, planned.
 */
export function QuickAddDrawer({
    date,
    today,
    onClose,
    onAdd,
}: {
    /** The day it's open for; null when closed. */
    date: string | null
    today: string
    onClose: () => void
    onAdd: (date: string, slot: MealType, name: string, macros: Macros, save: boolean) => Promise<void>
}) {
    // Keep the last day while the drawer slides shut.
    const [day, setDay] = useState(date)
    const [slot, setSlot] = useState<MealType>('breakfast')
    const [name, setName] = useState('')
    const [calories, setCalories] = useState('')
    const [protein, setProtein] = useState('')
    const [carbs, setCarbs] = useState('')
    const [fat, setFat] = useState('')
    const [saving, setSaving] = useState(false)
    // Also keep it in the meal library; left off, it's a one-off.
    const [save, setSave] = useState(false)

    // Opened for a day: start afresh (set while rendering, so there's no flash of the last one).
    const [openedFor, setOpenedFor] = useState<string | null>(null)
    if (date !== openedFor) {
        setOpenedFor(date)
        if (date) {
            setDay(date)
            setSlot(startSlot(date, today))
            setName('')
            setCalories('')
            setProtein('')
            setCarbs('')
            setFat('')
            setSaving(false)
            setSave(false)
        }
    }

    const macros: Macros = { calories: num(calories), protein: num(protein), carbs: num(carbs), fat: num(fat) }
    const implied = caloriesFromMacros(macros)
    // Offer the macro-derived figure when calories are blank or clearly off.
    const offerImplied =
        implied > 0 && (macros.calories === 0 || Math.abs(implied - macros.calories) > Math.max(25, macros.calories * 0.15))
    const valid = name.trim() !== ''
    const ahead = !!day && day > today

    async function submit() {
        if (!day || !valid || saving) return
        setSaving(true)
        try {
            await onAdd(day, slot, name.trim(), macros, save)
            onClose()
        } catch {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={!!date}
            onClose={onClose}
            title="Quick add"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Adding…' : ahead ? 'Add to plan' : 'Log it'}
                    </Button>
                </>
            }
        >
            <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <p className="text-sm text-neutral-500">
                    {day ? longDate(day) : ''} · {ahead ? 'goes in as planned' : 'goes in as eaten'}.
                </p>

                <div className="flex flex-col gap-1.5">
                    <p className={FIELD_LABEL}>Slot</p>
                    <div className="flex flex-wrap gap-2">
                        {MEAL_TYPES.map((t) => {
                            const on = slot === t
                            const c = CATEGORY[t]
                            return (
                                <button
                                    key={t}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => setSlot(t)}
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

                <Input
                    label="Name *"
                    autoFocus
                    placeholder="e.g. Coffee and a flapjack"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />

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
                <div className="flex flex-col gap-1">
                    <Checkbox checked={save} onChange={setSave} label="Save to my meal library" />
                    <p className="pl-8 text-xs text-neutral-500">
                        {save
                            ? `Kept as a ${CATEGORY[slot].label.toLowerCase()} meal, ready to plan again.`
                            : 'Left off, it’s a one-off for this day only.'}
                    </p>
                </div>
                {/* Enter in any field adds it. */}
                <button type="submit" hidden />
            </form>
        </Drawer>
    )
}
