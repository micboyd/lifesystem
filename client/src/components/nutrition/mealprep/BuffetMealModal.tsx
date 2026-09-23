import { useMemo, useState } from 'react'
import Modal from '../../Modal'
import Button from '../../Button'
import Input from '../../Input'
import PillToggle from '../../PillToggle'
import { useToast } from '../../../context/ToastContext'
import {
    adjustBatch,
    buffetError,
    createBuffetEntry,
    logBuffet,
    requestKey,
    unlogBuffet,
    updateBuffetPlan,
    type ComponentInput,
} from '../../../services/mealPrep'
import {
    addMacros,
    batchTitle,
    grams as fmtGrams,
    isValidCookedGrams,
    isValidPortionGrams,
    per100FromTotals,
    per100Grams,
    portionMacros,
    recipeSummary,
    splitAcrossBatches,
    ZERO,
} from '../../../lib/mealPrep'
import { lastPortions, recentCombos } from '../../../lib/mealPrepForecast'
import { todayKey } from '../../../lib/calendar'
import { MEAL_TYPES } from '../../../types'
import type { BuffetRole, FoodBatch, Macros, MealPlanEntry, MealType } from '../../../types'
import type { MealPrepData } from './useMealPrep'
import { EstimateBadge, GroupedSelect, MacroLine, More, NumberField, positive, type OptionGroup } from './ui'
import { kcal } from '../format'

/**
 * The buffet plate: choose food → enter grams → save.
 *
 * One form for both halves of the workflow. In **plan** mode a component may be
 * a recipe not yet cooked (costed at its measured or estimated yield) and
 * nothing moves in stock. In **log** mode every component must be a batch or a
 * food label, the grams are what went on the plate, and saving deducts stock —
 * once, guarded by the entry's revision and, for a brand-new plate, an
 * idempotency key held for the life of the form.
 *
 * Opening a planned plate to log it prefills its foods and grams and swaps any
 * recipe for its oldest batch with stock, so the usual path is open → adjust →
 * save.
 */

export interface BuffetTarget {
    mode: 'plan' | 'log'
    date: string
    /** Required for a new plate unless the form should ask. */
    slot?: MealType
    /** The plate being edited or logged. */
    entry?: MealPlanEntry
    /** Start a new plate with these components (e.g. "Log portion" on a batch). */
    preset?: { role: BuffetRole; choice: string; grams?: number }[]
}

interface Row {
    key: string
    _id?: string
    role: BuffetRole
    /** 'batch:<id>' | 'recipe:<id>' | 'food:<id>' | 'label' | '' */
    choice: string
    grams: string
    plannedGrams?: number
    labelName: string
    labelKcal: string
    labelP: string
    labelC: string
    labelF: string
    estYield: string
    hint?: string
    error?: string
    /** Stock shortfall details, driving the recovery actions. */
    short?: { batchId: string; remaining: number; needed: number }
    correcting?: string
}

let rowSeq = 0
const blankRow = (role: BuffetRole, choice = '', grams = ''): Row => ({
    key: `row-${rowSeq++}`,
    role,
    choice,
    grams,
    labelName: '',
    labelKcal: '',
    labelP: '',
    labelC: '',
    labelF: '',
    estYield: '',
})

const ROLE_LABEL: Record<BuffetRole, string> = { main: 'Main', side: 'Side', extra: 'Extra' }

/** The meal a clock time most likely belongs to, for a quick log's default slot. */
function slotForNow(): MealType {
    const h = new Date().getHours()
    if (h < 11) return 'breakfast'
    if (h < 15) return 'lunch'
    if (h < 21) return 'dinner'
    return 'snack'
}

/** Oldest fridge batch of a recipe that covers `need` grams, else the oldest with any. */
function suggestBatch(recipeId: string, need: number, batches: FoodBatch[]): FoodBatch | null {
    const pool = batches
        .filter((b) => b.recipe === recipeId && b.remainingGrams > 0)
        .sort((a, b) =>
            a.storage === b.storage ? a.cookedDate.localeCompare(b.cookedDate) : a.storage === 'fridge' ? -1 : 1
        )
    return pool.find((b) => b.remainingGrams >= need) ?? pool[0] ?? null
}

export default function BuffetMealModal({
    target,
    onClose,
    onSaved,
    prep,
    history,
}: {
    target: BuffetTarget | null
    onClose: () => void
    /** Called with the saved entry (or, on a conflict, the server's current one). */
    onSaved: (entry: MealPlanEntry) => void
    prep: MealPrepData
    /** Recent plan entries — last-used grams and recent combinations come from here. */
    history: MealPlanEntry[]
}) {
    const toast = useToast()
    const { recipes, batches, foods } = prep
    const [mode, setMode] = useState<'plan' | 'log'>('log')
    const [rows, setRows] = useState<Row[]>([])
    const [name, setName] = useState('')
    const [slot, setSlot] = useState<MealType>('lunch')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [clientKey, setClientKey] = useState(requestKey)
    // The entry as last seen — replaced if the server says it moved on.
    const [entry, setEntry] = useState<MealPlanEntry | undefined>(undefined)

    const recipeById = useMemo(() => new Map(recipes.map((r) => [r._id, r])), [recipes])
    const batchById = useMemo(() => new Map(batches.map((b) => [b._id, b])), [batches])
    const foodById = useMemo(() => new Map(foods.map((f) => [f._id, f])), [foods])
    const last = useMemo(() => lastPortions(history), [history])
    const combos = useMemo(() => recentCombos(history), [history])

    /** Build the form rows for a target — the prefill that makes logging one tap. */
    function rowsFor(t: BuffetTarget, e: MealPlanEntry | undefined, m: 'plan' | 'log'): Row[] {
        if (e?.buffet) {
            return e.buffet.components.map((c) => {
                const eatenGrams = e.status === 'eaten' ? c.grams : undefined
                const g = m === 'log' ? (eatenGrams ?? c.plannedGrams) : (c.plannedGrams ?? c.grams)
                let choice = c.batch ? `batch:${c.batch}` : c.recipe ? `recipe:${c.recipe}` : c.food ? `food:${c.food}` : 'label'
                let hint: string | undefined
                // A batch finished since planning can't be eaten from — fall back
                // to its recipe so a fresh batch gets suggested below.
                if (c.batch && !batchById.has(c.batch) && e.status !== 'eaten') {
                    choice = c.recipe ? `recipe:${c.recipe}` : ''
                    hint = 'The planned batch is finished'
                }
                if (m === 'log' && choice.startsWith('recipe:')) {
                    const b = suggestBatch(choice.slice(7), g ?? 0, batches)
                    if (b) {
                        choice = `batch:${b._id}`
                        hint = `Suggested: the ${b.storage === 'freezer' ? 'frozen' : 'oldest'} batch`
                    } else {
                        hint = 'No batch cooked yet — cook one, or pick a food'
                    }
                }
                const row = blankRow(c.role, choice, g ? String(Math.round(g * 10) / 10) : '')
                row._id = c._id
                row.plannedGrams = c.plannedGrams
                row.hint = hint
                if (choice === 'label') {
                    row.labelName = c.name
                    row.labelKcal = String(c.per100.calories)
                    row.labelP = String(c.per100.protein)
                    row.labelC = String(c.per100.carbs)
                    row.labelF = String(c.per100.fat)
                }
                return row
            })
        }
        if (t.preset?.length) return t.preset.map((p) => blankRow(p.role, p.choice, p.grams ? String(p.grams) : ''))
        return [blankRow('main'), blankRow('side')]
    }

    // Reset the form when a new target opens — during render, React's pattern
    // for state derived from a prop. Rows are built once per open, not on every
    // data refresh, so an edit in progress survives a stock reload.
    const [opened, setOpened] = useState<BuffetTarget | null>(null)
    if (target !== opened) {
        setOpened(target)
        if (target) {
            setMode(target.mode)
            setEntry(target.entry)
            setRows(rowsFor(target, target.entry, target.mode))
            setName(target.entry?.buffet?.name ?? '')
            setSlot(target.entry?.slot ?? target.slot ?? slotForNow())
            setError('')
            setClientKey(requestKey())
        }
    }

    // ── Per-row figures ──────────────────────────────────────────────────────

    function rowPer100(r: Row): { per100: Macros | null; estimated: boolean } {
        const [kind, id] = r.choice.split(':')
        if (kind === 'batch') {
            const b = batchById.get(id)
            if (b) return { per100: b.per100, estimated: false }
            // A logged plate's batch may be finished now; its snapshot still stands.
            const c = entry?.buffet?.components.find((x) => x._id === r._id && x.batch === id)
            return { per100: c?.per100 ?? null, estimated: false }
        }
        if (kind === 'recipe') {
            const recipe = recipeById.get(id)
            if (!recipe) return { per100: null, estimated: true }
            const s = recipeSummary(recipe)
            if (s.per100) return { per100: s.per100, estimated: true }
            const y = positive(r.estYield)
            return { per100: y && isValidCookedGrams(y) ? per100FromTotals(s.totals, y) : null, estimated: true }
        }
        if (kind === 'food') {
            const f = foodById.get(id)
            const c = entry?.buffet?.components.find((x) => x._id === r._id && x.food === id)
            return { per100: f ? per100Grams(f) : (c?.per100 ?? null), estimated: false }
        }
        if (kind === 'label') {
            const n = (v: string) => Math.max(0, Number(v) || 0)
            return {
                per100: { calories: n(r.labelKcal), protein: n(r.labelP), carbs: n(r.labelC), fat: n(r.labelF) },
                estimated: false,
            }
        }
        return { per100: null, estimated: false }
    }

    const previews = rows.map((r) => {
        const { per100, estimated } = rowPer100(r)
        const g = positive(r.grams)
        return { per100, estimated, macros: per100 && g ? portionMacros(per100, g) : null }
    })
    const total = previews.reduce((acc, p) => (p.macros ? addMacros(acc, p.macros) : acc), { ...ZERO })
    const anyEstimated = previews.some((p) => p.estimated && p.macros)

    // ── Options ──────────────────────────────────────────────────────────────

    const groups: OptionGroup[] = useMemo(() => {
        const sorted = [...batches].sort((a, b) =>
            a.storage === b.storage ? a.cookedDate.localeCompare(b.cookedDate) : a.storage === 'fridge' ? -1 : 1
        )
        // A logged plate may point at a batch since finished, or a food since
        // archived; keep them choosable so an edit doesn't silently drop them.
        const gone = (entry?.buffet?.components ?? []).filter(
            (c) => (c.batch && !batchById.has(c.batch)) || (c.food && !foodById.has(c.food))
        )
        const out: OptionGroup[] = [
            {
                label: 'Already on this plate',
                options: gone.map((c) => ({
                    value: c.batch ? `batch:${c.batch}` : `food:${c.food}`,
                    label: `${c.name} (no longer available)`,
                })),
            },
            {
                label: 'Available batches',
                options: sorted.map((b) => ({
                    value: `batch:${b._id}`,
                    label: `${batchTitle(b)} — ${fmtGrams(b.remainingGrams)} left${b.storage === 'freezer' ? ' (frozen)' : ''}`,
                })),
            },
        ]
        if (mode === 'plan') {
            out.push({
                label: 'Recipes (not cooked yet — estimated)',
                options: recipes.map((r) => ({ value: `recipe:${r._id}`, label: r.name })),
            })
        }
        out.push({
            label: 'Packaged & label foods',
            options: [
                ...foods.map((f) => ({ value: `food:${f._id}`, label: f.brand ? `${f.name} (${f.brand})` : f.name })),
                { value: 'label', label: 'Enter a label (per 100 g)…' },
            ],
        })
        return out
    }, [batches, recipes, foods, mode, entry, batchById, foodById])

    // ── Editing ──────────────────────────────────────────────────────────────

    function patch(key: string, p: Partial<Row>) {
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...p } : r)))
    }

    /** Choosing a food fills its usual grams if the box is empty. */
    function choose(r: Row, choice: string) {
        const [kind, id] = choice.split(':')
        let grams = r.grams
        if (!grams.trim() && choice) {
            const recipeId = kind === 'batch' ? batchById.get(id)?.recipe : kind === 'recipe' ? id : undefined
            const key = recipeId ?? (kind === 'food' ? id : undefined)
            const g = (key && last.get(key)) ?? (recipeId && recipeById.get(recipeId)?.usualPortionGrams)
            if (g) grams = String(Math.round(g))
        }
        patch(r.key, { choice, grams, error: undefined, short: undefined, hint: undefined })
    }

    function applyCombo(i: number) {
        const combo = combos[i]
        setRows(
            combo.components.map((c) => {
                let choice = c.food ? `food:${c.food}` : ''
                if (c.recipe) {
                    const b = suggestBatch(c.recipe, c.grams, batches)
                    choice = b ? `batch:${b._id}` : mode === 'plan' ? `recipe:${c.recipe}` : ''
                }
                return blankRow(c.role, choice, String(Math.round(c.grams)))
            })
        )
    }

    /** Recovery: fill this batch, and take the rest from the recipe's other batches. */
    function split(r: Row) {
        const [, id] = r.choice.split(':')
        const b = batchById.get(id)
        const need = positive(r.grams)
        if (!b || !need) return
        const others = batches
            .filter((x) => x._id !== b._id && x.recipe && x.recipe === b.recipe)
            .sort((x, y) => x.cookedDate.localeCompare(y.cookedDate))
        const { parts, uncovered } = splitAcrossBatches(need, [
            { id: b._id, remainingGrams: b.remainingGrams },
            ...others.map((x) => ({ id: x._id, remainingGrams: x.remainingGrams })),
        ])
        const newRows = parts.map((p, i) => {
            const row = blankRow(r.role, `batch:${p.batchId}`, String(Math.round(p.grams * 10) / 10))
            if (i === 0) row._id = r._id
            return row
        })
        if (uncovered > 0 && newRows.length) {
            newRows[newRows.length - 1].error = `${fmtGrams(uncovered)} still isn’t covered by any batch`
        }
        setRows((prev) => prev.flatMap((x) => (x.key === r.key ? newRows : [x])))
    }

    /** Recovery: record what's actually left, keeping the batch's density. */
    async function correct(r: Row) {
        const [, id] = r.choice.split(':')
        const measured = Number(r.correcting)
        if (!Number.isFinite(measured) || measured < 0) {
            patch(r.key, { error: 'Enter the weight left, 0 g or more' })
            return
        }
        try {
            const updated = await adjustBatch(id, {
                kind: 'correction',
                remainingGrams: measured,
                date: todayKey(),
                requestId: requestKey(),
            })
            prep.putBatch(updated)
            patch(r.key, { correcting: undefined, short: undefined, error: undefined })
        } catch (err) {
            patch(r.key, { error: buffetError(err).message })
        }
    }

    function toInput(r: Row): ComponentInput {
        const [kind, id] = r.choice.split(':')
        const g = positive(r.grams)
        const base: ComponentInput = {
            ...(r._id ? { _id: r._id } : {}),
            role: r.role,
            ...(mode === 'log' ? { grams: g, plannedGrams: r.plannedGrams } : { plannedGrams: g }),
        }
        if (kind === 'batch') return { ...base, batch: id }
        if (kind === 'recipe') return { ...base, recipe: id, estimatedYieldGrams: positive(r.estYield) }
        if (kind === 'food') return { ...base, food: id }
        const n = (v: string) => Math.max(0, Number(v) || 0)
        return {
            ...base,
            label: {
                name: r.labelName.trim(),
                per100: { calories: n(r.labelKcal), protein: n(r.labelP), carbs: n(r.labelC), fat: n(r.labelF) },
            },
        }
    }

    /** Check the form before sending; marks rows and returns whether it's good. */
    function validate(): boolean {
        const checked = rows.map((r) => {
            const g = positive(r.grams)
            let err: string | undefined
            if (!r.choice) err = 'Choose a food'
            else if (r.choice === 'label' && !r.labelName.trim()) err = 'Name the food'
            else if (mode === 'log' && r.choice.startsWith('recipe:')) err = 'Choose which batch it came from'
            else if (!isValidPortionGrams(g)) err = 'Enter 1–5,000 g'
            else if (r.choice.startsWith('recipe:') && !rowPer100(r).per100) err = 'Enter an estimated cooked weight'
            return err ? { ...r, error: err, short: undefined } : { ...r, error: undefined }
        })
        setRows(checked)
        return checked.length > 0 && checked.every((r) => !r.error)
    }

    async function save() {
        if (!target || saving) return
        setError('')
        if (!validate()) return
        setSaving(true)
        const body = { name: name.trim() || undefined, components: rows.map(toInput) }
        try {
            let saved: MealPlanEntry
            if (entry) {
                saved =
                    mode === 'log'
                        ? await logBuffet(entry._id, { ...body, rev: entry.buffet!.rev })
                        : await updateBuffetPlan(entry._id, { ...body, rev: entry.buffet!.rev })
            } else {
                saved = await createBuffetEntry(target.date, slot, {
                    ...body,
                    status: mode === 'log' ? 'eaten' : 'planned',
                    clientKey,
                })
            }
            onSaved(saved)
            if (mode === 'log') void prep.reload()
            onClose()
        } catch (err) {
            handleError(err)
        } finally {
            setSaving(false)
        }
    }

    function handleError(err: unknown) {
        const e = buffetError(err)
        if (e.code === 'INSUFFICIENT_STOCK' && e.shortfalls?.length) {
            const byBatch = new Map(e.shortfalls.map((s) => [s.batchId, s]))
            setRows((prev) =>
                prev.map((r) => {
                    const s = byBatch.get(r.choice.slice(6))
                    return r.choice.startsWith('batch:') && s
                        ? { ...r, short: { batchId: s.batchId, remaining: s.remainingGrams, needed: s.neededGrams } }
                        : r
                })
            )
            setError(e.message)
            void prep.reload()
            return
        }
        if (e.code === 'STALE' && e.data) {
            onSaved(e.data)
            setEntry(e.data)
            setRows(rowsFor(target!, e.data, mode))
            setError('This meal was changed elsewhere, so the latest version has been loaded. Check it and save again.')
            return
        }
        if (e.code === 'NEEDS_YIELD' && e.recipe) {
            setRows((prev) =>
                prev.map((r) => (r.choice === `recipe:${e.recipe}` ? { ...r, error: 'Enter an estimated cooked weight' } : r))
            )
        }
        setError(e.message)
    }

    async function unlog(status: 'planned' | 'skipped') {
        if (!entry?.buffet || saving) return
        setSaving(true)
        try {
            const saved = await unlogBuffet(entry._id, { status, rev: entry.buffet.rev })
            onSaved(saved)
            void prep.reload()
            toast.show(status === 'planned' ? 'Back to planned — stock restored' : 'Marked skipped', 'success')
            onClose()
        } catch (err) {
            handleError(err)
        } finally {
            setSaving(false)
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const logged = entry?.status === 'eaten'
    const title = mode === 'plan' ? (entry ? 'Edit planned plate' : 'Plan a buffet plate') : logged ? 'Edit logged plate' : 'Log what you ate'
    const saveLabel = mode === 'plan' ? 'Save plan' : logged ? 'Save changes' : 'Log meal'
    const isNew = !entry

    return (
        <Modal
            open={!!target}
            onClose={onClose}
            title={title}
            size="lg"
            footer={
                <>
                    {logged && mode === 'log' && (
                        <Button variant="ghost" onClick={() => unlog('planned')} disabled={saving} className="mr-auto">
                            Not eaten
                        </Button>
                    )}
                    {!logged && entry && entry.status === 'planned' && (
                        <Button variant="ghost" onClick={() => unlog('skipped')} disabled={saving} className="mr-auto">
                            Skip
                        </Button>
                    )}
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={save} disabled={saving} icon={mode === 'log' ? 'fa-solid fa-check' : undefined}>
                        {saveLabel}
                    </Button>
                </>
            }
        >
            <div className="flex flex-col gap-4">
                {isNew && !target?.slot && (
                    <PillToggle
                        label="Meal"
                        options={MEAL_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))}
                        value={slot}
                        onChange={setSlot}
                    />
                )}

                {/* A planned plate can be logged from here without closing. */}
                {entry && !logged && (
                    <PillToggle
                        label="Mode"
                        options={[
                            { value: 'log', label: 'Log as eaten' },
                            { value: 'plan', label: 'Edit plan' },
                        ]}
                        value={mode}
                        onChange={(m) => {
                            setMode(m)
                            setRows(rowsFor(target!, entry, m))
                        }}
                    />
                )}

                {isNew && combos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Recent plates</p>
                        <div className="flex flex-wrap gap-1.5">
                            {combos.map((c, i) => (
                                <button
                                    key={c.signature}
                                    type="button"
                                    onClick={() => applyCombo(i)}
                                    className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-200"
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <ul className="flex flex-col gap-3">
                    {rows.map((r, i) => {
                        const p = previews[i]
                        const batch = r.choice.startsWith('batch:') ? batchById.get(r.choice.slice(6)) : undefined
                        const g = positive(r.grams)
                        // Warn before saving, not just after: this is the common case.
                        const over =
                            mode === 'log' && batch && g !== undefined
                                ? (() => {
                                      const already = logged
                                          ? (entry?.buffet?.components ?? [])
                                                .filter((c) => c.batch === batch._id)
                                                .reduce((s, c) => s + (c.grams ?? 0), 0)
                                          : 0
                                      const taken = rows
                                          .filter((x) => x.choice === r.choice)
                                          .reduce((s, x) => s + (positive(x.grams) ?? 0), 0)
                                      return taken - already > batch.remainingGrams + 1e-6
                                  })()
                                : false
                        const short = r.short ?? (over && batch ? { batchId: batch._id, remaining: batch.remainingGrams, needed: g! } : undefined)
                        const recipe = r.choice.startsWith('recipe:') ? recipeById.get(r.choice.slice(7)) : undefined
                        const needsYield = recipe && !recipeSummary(recipe).yield
                        const siblings = batch ? batches.filter((x) => x._id !== batch._id && x.recipe === batch.recipe && x.remainingGrams > 0) : []
                        return (
                            <li key={r.key} className="rounded-2xl border border-neutral-100 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <PillToggle
                                        label="Component type"
                                        options={(['main', 'side', 'extra'] as const).map((v) => ({ value: v, label: ROLE_LABEL[v] }))}
                                        value={r.role}
                                        onChange={(role) => patch(r.key, { role })}
                                    />
                                    {rows.length > 1 && (
                                        <button
                                            type="button"
                                            aria-label="Remove this food"
                                            onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                                            className="grid h-7 w-7 place-items-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                                        >
                                            <i className="fa-solid fa-xmark text-xs" aria-hidden="true" />
                                        </button>
                                    )}
                                </div>
                                <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
                                    <GroupedSelect
                                        ariaLabel={`${ROLE_LABEL[r.role]} food`}
                                        placeholder="Choose food…"
                                        value={r.choice}
                                        groups={groups}
                                        error={!!r.error && !r.choice}
                                        onChange={(v) => choose(r, v)}
                                    />
                                    <NumberField
                                        ariaLabel={`${ROLE_LABEL[r.role]} grams`}
                                        value={r.grams}
                                        placeholder={r.plannedGrams ? String(Math.round(r.plannedGrams)) : 'grams'}
                                        onChange={(v) => patch(r.key, { grams: v, error: undefined, short: undefined })}
                                    />
                                </div>

                                {r.choice === 'label' && (
                                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                        <Input
                                            className="col-span-2 sm:col-span-1"
                                            placeholder="Name"
                                            aria-label="Food name"
                                            value={r.labelName}
                                            onChange={(e) => patch(r.key, { labelName: e.target.value })}
                                        />
                                        <NumberField unit="kcal" ariaLabel="Calories per 100 g" placeholder="/100 g" value={r.labelKcal} onChange={(v) => patch(r.key, { labelKcal: v })} />
                                        <NumberField unit="P" ariaLabel="Protein per 100 g" value={r.labelP} onChange={(v) => patch(r.key, { labelP: v })} />
                                        <NumberField unit="C" ariaLabel="Carbs per 100 g" value={r.labelC} onChange={(v) => patch(r.key, { labelC: v })} />
                                        <NumberField unit="F" ariaLabel="Fat per 100 g" value={r.labelF} onChange={(v) => patch(r.key, { labelF: v })} />
                                    </div>
                                )}

                                {needsYield && (
                                    <div className="mt-2 flex items-end gap-2">
                                        <NumberField
                                            className="w-40"
                                            label="Estimated cooked weight"
                                            value={r.estYield}
                                            onChange={(v) => patch(r.key, { estYield: v, error: undefined })}
                                        />
                                        <p className="pb-2 text-[11px] text-neutral-400">
                                            Not cooked yet, so there’s no measured yield. Used for planning only.
                                        </p>
                                    </div>
                                )}

                                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                                    {p.macros ? <MacroLine macros={p.macros} className="font-semibold text-neutral-600" /> : null}
                                    {p.estimated && p.macros && (
                                        <EstimateBadge title={recipe ? `From ${recipeSummary(recipe).yield?.kind === 'measured' ? 'the last measured' : 'an estimated'} yield — the batch you eat from will set the real figure` : 'Estimated'} />
                                    )}
                                    {batch && (
                                        <span>
                                            {fmtGrams(batch.remainingGrams)} left · {kcal(batch.per100.calories)} kcal/100 g
                                        </span>
                                    )}
                                    {r.hint && <span className="text-neutral-500">{r.hint}</span>}
                                </div>

                                {r.error && <p className="mt-1.5 text-[11px] font-medium text-red-500">{r.error}</p>}

                                {short && batch && (
                                    <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                                        <p className="font-semibold">
                                            Only {fmtGrams(short.remaining)} of {batchTitle(batch)} is recorded as left.
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {siblings.length > 0 && (
                                                <Button size="sm" variant="secondary" onClick={() => split(r)}>
                                                    Split across batches
                                                </Button>
                                            )}
                                            {r.correcting === undefined ? (
                                                <Button size="sm" variant="secondary" onClick={() => patch(r.key, { correcting: '' })}>
                                                    Correct the stock
                                                </Button>
                                            ) : (
                                                <span className="flex items-end gap-2">
                                                    <NumberField
                                                        className="w-32"
                                                        ariaLabel="Actual weight left"
                                                        placeholder="weight left"
                                                        value={r.correcting}
                                                        onChange={(v) => patch(r.key, { correcting: v })}
                                                    />
                                                    <Button size="sm" onClick={() => correct(r)}>
                                                        Save weight
                                                    </Button>
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-2 text-[11px] text-amber-800/80">
                                            Or choose another batch above. Correcting sets the remaining weight to what the scale
                                            says — the batch’s nutrition per gram stays the same.
                                        </p>
                                    </div>
                                )}
                            </li>
                        )
                    })}
                </ul>

                <div className="flex flex-wrap gap-2">
                    {(['main', 'side', 'extra'] as const).map((role) => (
                        <Button key={role} size="sm" variant="secondary" icon="fa-solid fa-plus" onClick={() => setRows((prev) => [...prev, blankRow(role)])}>
                            {ROLE_LABEL[role]}
                        </Button>
                    ))}
                </div>

                <More label="Name this plate (optional)">
                    <Input placeholder="e.g. Fajita bowl" value={name} onChange={(e) => setName(e.target.value)} />
                </More>

                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-2xl bg-neutral-50 px-4 py-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                        {mode === 'log' ? 'This plate' : 'Planned plate'}
                    </span>
                    <span className="flex items-center gap-2 text-sm font-bold text-neutral-900">
                        <MacroLine macros={total} />
                        {anyEstimated && <EstimateBadge title="Includes a recipe not cooked yet, costed at its estimated yield" />}
                    </span>
                </div>
                <p className="text-[11px] leading-snug text-neutral-400">
                    {mode === 'plan'
                        ? 'Planning adds to projected totals and planned stock demand. Nothing is deducted until you log it.'
                        : 'Logging deducts these grams from their batches. Mixed trays assume the food is spread evenly through the batch.'}
                </p>
                {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            </div>
        </Modal>
    )
}
