import { useEffect, useState } from 'react'
import Drawer from '../Drawer'
import Button from '../Button'
import Input from '../Input'
import Textarea from '../Textarea'
import { FIELD_LABEL } from '../fieldStyles'
import { CATEGORY, MacroBar, MacroLegend } from './mealUi'
import { fmt, kcal } from './format'
import { batchTotal, MAX_PORTIONS, mealSize, perPortion, suggestPortions } from '../../lib/mealAim'
import { targetsFor } from '../../lib/nutrition'
import { addDays, MONTHS, parseDateKey, todayKey } from '../../lib/calendar'
import { listNutritionPhases } from '../../services/nutritionPhases'
import { MEAL_TYPES } from '../../types'
import type {
    MacroGoals,
    Macros,
    MealIngredient,
    MealInput,
    MealType,
    NutritionPhase,
} from '../../types'

/**
 * Making a batch: what went in (raw grams at each packet's figures per 100 g),
 * how many boxes it's split into, and — from the day's targets — how many
 * boxes make one meal each. Saving it adds a tray meal to the library: one
 * box's macros, the whole tray's ingredients. Planned and ticked a box at a
 * time; nothing about the cook is tracked after that.
 */

type Row = {
    name: string
    grams: string
    calories: string
    protein: string
    carbs: string
    fat: string
}
const blankRow = (): Row => ({ name: '', grams: '', calories: '', protein: '', carbs: '', fat: '' })

const num = (v: string) => Math.max(0, Number(v) || 0)
const str = (n: unknown) => (typeof n === 'number' && n > 0 ? String(n) : '')

function shortDay(date: string): string {
    const { month, day } = parseDateKey(date)
    return `${day} ${MONTHS[month].slice(0, 3)}`
}

/** Rows from pasted JSON: a list of ingredients, or `{ ingredients: [...] }`. */
function parsePasted(text: string): Row[] | null {
    try {
        const data = JSON.parse(text)
        const list = Array.isArray(data) ? data : data?.ingredients
        if (!Array.isArray(list)) return null
        const rows = list
            .filter((i) => i && typeof i.name === 'string')
            .map((i) => ({
                name: i.name,
                grams: str(i.grams),
                calories: str(i.per100?.calories),
                protein: str(i.per100?.protein),
                carbs: str(i.per100?.carbs),
                fat: str(i.per100?.fat),
            }))
        return rows.length ? rows : null
    } catch {
        return null
    }
}

export function BatchDrawer({
    open,
    settingsGoals,
    onClose,
    onAdd,
}: {
    open: boolean
    settingsGoals?: MacroGoals | null
    onClose: () => void
    onAdd: (fields: MealInput) => Promise<void>
}) {
    const today = todayKey()
    // Batches are eaten over the days after they're cooked, so they're sized
    // against tomorrow's targets — a phase starting tomorrow counts.
    const eatFrom = addDays(today, 1)

    const [phases, setPhases] = useState<NutritionPhase[]>([])
    const [name, setName] = useState('')
    const [types, setTypes] = useState<MealType[]>(['lunch', 'dinner'])
    const [rows, setRows] = useState<Row[]>([blankRow()])
    const [cooked, setCooked] = useState('')
    const [portions, setPortions] = useState<number | null>(null)
    const [notes, setNotes] = useState('')
    const [pasting, setPasting] = useState(false)
    const [pasted, setPasted] = useState('')
    const [pasteError, setPasteError] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    // The parent remounts this for each new batch (by key), so fields start blank.
    useEffect(() => {
        listNutritionPhases()
            .then(setPhases)
            .catch(() => {})
    }, [])

    const ingredients = rows
        .filter((r) => r.name.trim() && num(r.grams) > 0)
        .map((r) => ({
            name: r.name.trim(),
            grams: num(r.grams),
            per100: {
                calories: num(r.calories),
                protein: num(r.protein),
                carbs: num(r.carbs),
                fat: num(r.fat),
            },
        }))
    const total = batchTotal(ingredients)

    // One meal's share of the day: lunch and dinner are the same size, so any
    // main meal sets it; a snack-only batch aims at a snack.
    const targets = targetsFor(eatFrom, phases, settingsGoals)
    const aimSlot: MealType =
        types.find((t) => t !== 'snack') ?? (types.includes('snack') ? 'snack' : 'lunch')
    const aim = mealSize(targets.goals, aimSlot)
    const suggested = suggestPortions(total, aim)
    const count = portions ?? suggested ?? 4
    const portion = perPortion(total, count)
    const cookedGrams = num(cooked)
    const boxGrams = cookedGrams > 0 ? Math.round(cookedGrams / count / 5) * 5 : null

    const valid = ingredients.length > 0 && total.calories > 0
    const fallbackName = `Batch · ${shortDay(today)}`

    function patchRow(i: number, patch: Partial<Row>) {
        setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)))
    }

    function toggleType(t: MealType) {
        setTypes((prev) =>
            prev.includes(t)
                ? prev.filter((x) => x !== t)
                : MEAL_TYPES.filter((x) => x === t || prev.includes(x))
        )
    }

    function applyPaste() {
        const parsed = parsePasted(pasted)
        if (!parsed) {
            setPasteError('Couldn’t read that — it needs a list of { name, grams, per100 }.')
            return
        }
        setRows(parsed)
        setPasting(false)
        setPasted('')
        setPasteError('')
    }

    async function submit() {
        if (!valid) return
        // The whole tray's ingredients — the shopping list shares them out by the box.
        const trayIngredients: MealIngredient[] = ingredients.map((i) => ({ name: i.name, grams: i.grams }))
        const made = [
            `Tray made ${shortDay(today)}`,
            boxGrams ? `~${fmt(boxGrams)} g per box` : null,
        ]
            .filter(Boolean)
            .join(' · ')
        setSaving(true)
        setError('')
        try {
            await onAdd({
                name: name.trim() || fallbackName,
                types,
                macros: portion,
                ingredients: trayIngredients,
                batchOf: count >= 2 ? count : null,
                notes: [made, notes.trim()].filter(Boolean).join('\n\n'),
            })
            onClose()
        } catch {
            setError('Could not save — try again.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            open={open}
            onClose={onClose}
            size="xl"
            title="Make a batch"
            footer={
                <>
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={saving || !valid}>
                        {saving ? 'Saving…' : count >= 2 ? `Save tray of ${count}` : 'Save as a meal'}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-6">
                <p className="text-sm text-neutral-500">
                    Put in what went into the tray and how many boxes it makes. It saves as a tray meal:
                    one box’s macros to plan and tick, the whole tray’s ingredients to shop for.
                </p>

                <Input
                    label="Name"
                    placeholder={fallbackName}
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
                                        on
                                            ? `${c.tile} ${c.text} ring-1 ring-inset ${c.ring}`
                                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                    }`}
                                >
                                    <i className={`${c.icon} text-[11px]`} aria-hidden="true" />
                                    {c.label}
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className={FIELD_LABEL}>What went in</p>
                            <p className="mt-0.5 text-xs text-neutral-500">
                                Raw grams, with the packet’s figures per 100 g. Rice and sides too,
                                if they’re in the boxes.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPasting((p) => !p)}
                            className="shrink-0 rounded-[10px] px-2.5 py-1.5 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-100"
                        >
                            <i
                                className="fa-solid fa-paste mr-1.5 text-[11px]"
                                aria-hidden="true"
                            />
                            Paste JSON
                        </button>
                    </div>

                    {pasting && (
                        <div className="flex flex-col gap-2 rounded-2xl bg-neutral-50 p-3">
                            <Textarea
                                aria-label="Ingredients as JSON"
                                rows={5}
                                placeholder={
                                    '[{ "name": "Chicken breast", "grams": 1000, "per100": { "calories": 106, "protein": 24, "carbs": 0, "fat": 1.5 } }]'
                                }
                                value={pasted}
                                error={pasteError || undefined}
                                onChange={(e) => setPasted(e.target.value)}
                            />
                            <Button
                                variant="secondary"
                                className="self-start"
                                onClick={applyPaste}
                                disabled={!pasted.trim()}
                            >
                                Use these
                            </Button>
                        </div>
                    )}

                    {rows.map((r, i) => (
                        <div
                            key={i}
                            className="flex flex-col gap-2 rounded-2xl border border-neutral-200 p-3"
                        >
                            <div className="flex items-end gap-2">
                                <div className="min-w-0 flex-1">
                                    <Input
                                        aria-label="Ingredient"
                                        placeholder="e.g. Chicken breast"
                                        value={r.name}
                                        onChange={(e) => patchRow(i, { name: e.target.value })}
                                    />
                                </div>
                                <div className="w-24 shrink-0">
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
                                {rows.length > 1 && (
                                    <button
                                        type="button"
                                        aria-label="Remove ingredient"
                                        onClick={() =>
                                            setRows((prev) => prev.filter((_, j) => j !== i))
                                        }
                                        className="grid h-11 w-9 shrink-0 place-items-center rounded-xl text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                    >
                                        <i className="fa-solid fa-xmark" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                                {(
                                    [
                                        ['calories', 'kcal'],
                                        ['protein', 'P'],
                                        ['carbs', 'C'],
                                        ['fat', 'F'],
                                    ] as const
                                ).map(([k, label]) => (
                                    <Input
                                        key={k}
                                        aria-label={`${k} per 100 g`}
                                        type="number"
                                        min={0}
                                        step="any"
                                        inputMode="decimal"
                                        placeholder={label}
                                        value={r[k]}
                                        onChange={(e) => patchRow(i, { [k]: e.target.value })}
                                    />
                                ))}
                            </div>
                            <p className="text-[11px] text-neutral-400">
                                per 100 g · kcal, protein, carbs, fat
                            </p>
                        </div>
                    ))}
                    <button
                        type="button"
                        onClick={() => setRows((prev) => [...prev, blankRow()])}
                        className="inline-flex h-10 items-center gap-1.5 self-start rounded-[10px] px-3 text-sm font-semibold text-coral-600 transition-colors hover:bg-coral-50"
                    >
                        <i className="fa-solid fa-plus text-xs" aria-hidden="true" />
                        Add ingredient
                    </button>
                </div>

                <Input
                    label="Cooked weight (g)"
                    hint="Optional. Weigh the whole lot once it’s cooked, and you get grams per box."
                    type="number"
                    min={0}
                    step="any"
                    inputMode="decimal"
                    placeholder="e.g. 2400"
                    value={cooked}
                    onChange={(e) => setCooked(e.target.value)}
                />

                {valid && (
                    <div className="flex flex-col gap-4 rounded-2xl bg-neutral-50 p-4">
                        <Figures label="The whole tray" macros={total} />

                        <div className="flex flex-col gap-1.5">
                            <p className={FIELD_LABEL}>Boxes</p>
                            <div className="flex items-center gap-3">
                                <div className="inline-flex items-center rounded-xl bg-white ring-1 ring-inset ring-neutral-200">
                                    <button
                                        type="button"
                                        aria-label="Fewer boxes"
                                        disabled={count <= 1}
                                        onClick={() => setPortions(Math.max(1, count - 1))}
                                        className="grid h-10 w-10 place-items-center text-neutral-600 disabled:text-neutral-300"
                                    >
                                        <i
                                            className="fa-solid fa-minus text-xs"
                                            aria-hidden="true"
                                        />
                                    </button>
                                    <span className="w-8 text-center text-base font-semibold tabular-nums text-neutral-900">
                                        {count}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label="More boxes"
                                        disabled={count >= MAX_PORTIONS}
                                        onClick={() =>
                                            setPortions(Math.min(MAX_PORTIONS, count + 1))
                                        }
                                        className="grid h-10 w-10 place-items-center text-neutral-600 disabled:text-neutral-300"
                                    >
                                        <i
                                            className="fa-solid fa-plus text-xs"
                                            aria-hidden="true"
                                        />
                                    </button>
                                </div>
                                {suggested && (
                                    <p className="text-xs text-neutral-500">
                                        {count === suggested ? (
                                            <>Suggested for your targets</>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setPortions(suggested)}
                                                className="font-semibold text-coral-600 hover:underline"
                                            >
                                                Suggested: {suggested}
                                            </button>
                                        )}
                                    </p>
                                )}
                            </div>
                            {boxGrams && (
                                <p className="text-sm font-medium text-neutral-800">
                                    <i
                                        className="fa-solid fa-scale-balanced mr-1.5 text-xs text-neutral-400"
                                        aria-hidden="true"
                                    />
                                    About {fmt(boxGrams)} g in each box
                                </p>
                            )}
                        </div>

                        <Figures label="Each box" macros={portion} strong />

                        {aim ? (
                            <AimLine
                                aim={aim.size}
                                portion={portion}
                                slot={aimSlot}
                                source={
                                    targets.phase?.name ??
                                    (targets.source === 'settings' ? 'your Settings targets' : null)
                                }
                            />
                        ) : (
                            <p className="text-xs text-neutral-500">
                                Set targets in a phase or in Settings to get a suggested split.
                            </p>
                        )}
                    </div>
                )}

                <Textarea
                    label="Notes"
                    rows={2}
                    placeholder="How you made it, what to change next time…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
        </Drawer>
    )
}

function Figures({
    label,
    macros,
    strong = false,
}: {
    label: string
    macros: Macros
    strong?: boolean
}) {
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
                <p className={FIELD_LABEL}>{label}</p>
                <p
                    className={`tabular-nums ${strong ? 'text-lg font-semibold text-neutral-950' : 'text-sm font-medium text-neutral-700'}`}
                >
                    {kcal(macros.calories)} kcal
                </p>
            </div>
            <MacroBar macros={macros} thick={strong} />
            <MacroLegend macros={macros} compact={!strong} />
        </div>
    )
}

/** "A lunch on Cut 1 is about 600 kcal · 48 g protein — this is 30 kcal over." */
function AimLine({
    aim,
    portion,
    slot,
    source,
}: {
    aim: Macros
    portion: Macros
    slot: MealType
    source: string | null
}) {
    const diff = Math.round(portion.calories - aim.calories)
    const near = Math.abs(diff) <= Math.max(40, aim.calories * 0.07)
    return (
        <p className="text-xs leading-relaxed text-neutral-600">
            A {CATEGORY[slot].label.toLowerCase()}
            {source ? ` on ${source}` : ''} is about{' '}
            <span className="font-semibold text-neutral-800">
                {kcal(aim.calories)} kcal · {fmt(Math.round(aim.protein))} g protein
            </span>
            .{' '}
            {near
                ? 'Each box is about right.'
                : `Each box is ${kcal(Math.abs(diff))} kcal ${diff > 0 ? 'over' : 'under'}.`}
        </p>
    )
}
