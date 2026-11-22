import { useState } from 'react'
import Button from '../Button'
import Checkbox from '../Checkbox'
import Input from '../Input'
import { CATEGORY } from './mealUi'
import { MEAL_TYPES, type MealType } from '../../types'

/** A meal a plan import names that the Library doesn't have, and the slots it was used in. */
export interface MissingMeal {
    name: string
    slots: MealType[]
    /** What the plan's own "meals" list said about it, to pre-fill the form. */
    types?: MealType[]
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
}

/** What the user filled in for one missing meal. */
export interface NewMealDraft {
    name: string
    types: MealType[]
    calories: number
    protein: number
    carbs: number
    fat: number
}

/** The missing meals an import error carries, or null when it isn't that error. */
export function missingMealsOf(err: unknown): MissingMeal[] | null {
    const list = (err as { response?: { data?: { missingMeals?: unknown } } })?.response?.data?.missingMeals
    if (!Array.isArray(list) || list.length === 0) return null
    return list
        .filter((m): m is MissingMeal => !!m && typeof (m as MissingMeal).name === 'string')
        .map((m) => {
            const types = Array.isArray(m.types) ? m.types.filter((s) => MEAL_TYPES.includes(s)) : undefined
            const macro = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined)
            return {
                name: m.name,
                slots: (m.slots ?? []).filter((s) => MEAL_TYPES.includes(s)),
                ...(types?.length ? { types } : {}),
                calories: macro(m.calories),
                protein: macro(m.protein),
                carbs: macro(m.carbs),
                fat: macro(m.fat),
            }
        })
}

type Row = { include: boolean; types: MealType[]; calories: string; protein: string; carbs: string; fat: string }

const num = (v: string) => {
    const n = Number(v)
    return v.trim() && Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * "These meals aren't in your Library — add them?" Shown in place of the import
 * error. Each meal can be ticked off, given the slots it suits (guessed from
 * where the plan used it) and, optionally, its macros. Adding creates them and
 * runs the import again; the other way out imports without them.
 */
export default function MissingMealsPanel({
    missing,
    onAdd,
    onSkip,
    onCancel,
}: {
    missing: MissingMeal[]
    onAdd: (meals: NewMealDraft[]) => Promise<void>
    onSkip: () => void
    onCancel: () => void
}) {
    const [rows, setRows] = useState<Record<string, Row>>(() =>
        Object.fromEntries(
            missing.map((m) => [
                m.name,
                {
                    include: true,
                    types: m.types?.length ? m.types : m.slots.length ? m.slots : ['lunch', 'dinner'],
                    calories: m.calories === undefined ? '' : String(m.calories),
                    protein: m.protein === undefined ? '' : String(m.protein),
                    carbs: m.carbs === undefined ? '' : String(m.carbs),
                    fat: m.fat === undefined ? '' : String(m.fat),
                },
            ])
        )
    )
    const [busy, setBusy] = useState(false)
    const set = (name: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [name]: { ...r[name], ...patch } }))

    const chosen = missing.filter((m) => rows[m.name]?.include)
    const noMacros = chosen.filter((m) => !num(rows[m.name].calories)).length

    async function add() {
        setBusy(true)
        try {
            await onAdd(
                chosen.map((m) => {
                    const r = rows[m.name]
                    return {
                        name: m.name,
                        types: r.types,
                        calories: num(r.calories),
                        protein: num(r.protein),
                        carbs: num(r.carbs),
                        fat: num(r.fat),
                    }
                })
            )
        } catch {
            // The caller has already said what went wrong; stay here so it can be tried again.
        } finally {
            setBusy(false)
        }
    }

    return (
        <section className="rounded-[20px] border border-amber-300 bg-amber-50/40 p-5">
            <h3 className="text-base font-semibold text-neutral-900">
                {missing.length === 1 ? 'This meal isn’t in your Library' : `${missing.length} meals aren’t in your Library`}
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
                The plan’s meal week names {missing.length === 1 ? 'it' : 'them'}, so nothing has been imported yet. Add{' '}
                {missing.length === 1 ? 'it' : 'them'} to your Library and carry on — macros come from the plan&apos;s {'"meals"'} list
                where it gives them; otherwise they&apos;re optional, leave them blank to fill in later — or leave {missing.length === 1 ? 'it' : 'them'} out of the plan.
            </p>

            <ul className="mt-4 flex flex-col gap-3">
                {missing.map((m) => {
                    const r = rows[m.name]
                    return (
                        <li key={m.name} className={`rounded-xl border bg-white p-4 ${r.include ? 'border-neutral-200' : 'border-neutral-100 opacity-60'}`}>
                            <Checkbox
                                checked={r.include}
                                onChange={(v) => set(m.name, { include: v })}
                                label={m.name}
                            />
                            {r.include && (
                                <div className="mt-3 flex flex-col gap-3">
                                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${m.name} is for`}>
                                        {MEAL_TYPES.map((t) => {
                                            const on = r.types.includes(t)
                                            return (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    aria-pressed={on}
                                                    onClick={() =>
                                                        set(m.name, {
                                                            types: on ? r.types.filter((x) => x !== t) : MEAL_TYPES.filter((x) => x === t || r.types.includes(x)),
                                                        })
                                                    }
                                                    className={`h-8 rounded-full px-3 text-xs font-medium transition-colors ${
                                                        on ? 'bg-neutral-900 text-white' : 'border border-neutral-200 text-neutral-600 hover:border-neutral-400'
                                                    }`}
                                                >
                                                    {CATEGORY[t].label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                        <Input label="Calories" type="number" min={0} value={r.calories} onChange={(e) => set(m.name, { calories: e.target.value })} />
                                        <Input label="Protein (g)" type="number" min={0} value={r.protein} onChange={(e) => set(m.name, { protein: e.target.value })} />
                                        <Input label="Carbs (g)" type="number" min={0} value={r.carbs} onChange={(e) => set(m.name, { carbs: e.target.value })} />
                                        <Input label="Fat (g)" type="number" min={0} value={r.fat} onChange={(e) => set(m.name, { fat: e.target.value })} />
                                    </div>
                                </div>
                            )}
                        </li>
                    )
                })}
            </ul>

            {noMacros > 0 && (
                <p className="mt-3 text-xs text-neutral-500">
                    {noMacros === 1 ? 'One meal has' : `${noMacros} meals have`} no calories yet — {noMacros === 1 ? 'it' : 'they'} will
                    count as 0 until you fill {noMacros === 1 ? 'it' : 'them'} in from the Library.
                </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void add()} disabled={busy || chosen.length === 0}>
                    {busy ? 'Adding…' : `Add ${chosen.length} to Library and import`}
                </Button>
                <Button variant="secondary" onClick={onSkip} disabled={busy}>
                    Leave {missing.length === 1 ? 'it' : 'them'} out of the plan
                </Button>
                <Button variant="ghost" onClick={onCancel} disabled={busy}>
                    Cancel
                </Button>
            </div>
        </section>
    )
}
